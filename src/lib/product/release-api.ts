import { z } from "zod";

import { RELEASE_PLATFORMS, type ReleaseHistoryEntry } from "@/lib/product/releases/release-input";

/**
 * The console's client for the release deploy function.
 *
 * This is the one Azure function the console talks to that is not the Account API, and it
 * is worth being explicit about why it exists as a separate client rather than another
 * `fetchAccountApiJson` route. Publishing writes blobs to the release storage account and
 * signs the manifest with a key from Key Vault; the Account API holds neither, and giving
 * it either — so that the console could keep one client — would put the release signing key
 * behind a function that also serves every account read in the product.
 *
 * The console holds no credential of its own here. It forwards the signed-in
 * administrator's access token, which the deploy function validates against the Account
 * API exactly as it does for a desktop caller. So a console compromise reaches no further
 * than the administrator who was signed into it.
 */

export const RELEASE_API_ROUTE_PREFIX = "/api";

export class ReleaseApiUnavailableError extends Error {
  constructor() {
    super("The release service is unavailable.");
    this.name = "ReleaseApiUnavailableError";
  }
}

export class ReleaseApiRequestError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ReleaseApiRequestError";
    this.status = status;
  }
}

function isLocalOrigin(url: URL): boolean {
  return ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
}

/**
 * Accepts the function's origin with or without the `/api` route prefix, the same tolerance
 * `resolveAccountApiBaseUrl` extends, because the two values are configured side by side and
 * an operator who gets one shape right will use it for both.
 */
export function resolveReleaseApiBaseUrl(
  environment: Readonly<Partial<Record<string, string>>> = process.env,
): URL {
  const raw = String(environment.QT_UPDATE_DEPLOY_URL ?? "").trim();
  if (!raw) throw new ReleaseApiUnavailableError();

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new ReleaseApiUnavailableError();
  }

  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    (!isLocalOrigin(url) && url.protocol !== "https:") ||
    (isLocalOrigin(url) && !["http:", "https:"].includes(url.protocol))
  ) {
    throw new ReleaseApiUnavailableError();
  }

  // A value pointing at a single route — `.../api/deploy_update` is the shape the desktop
  // used to store — resolves to the function root rather than to a 404 under it.
  let pathname = url.pathname.replace(/\/+$/u, "");
  for (const route of ["/deploy_update", "/release_history"]) {
    if (pathname.endsWith(route)) pathname = pathname.slice(0, -route.length);
  }
  url.pathname = pathname.endsWith(RELEASE_API_ROUTE_PREFIX)
    ? pathname
    : `${pathname}${RELEASE_API_ROUTE_PREFIX}`;
  return url;
}

export function releaseApiConfigured(
  environment: Readonly<Partial<Record<string, string>>> = process.env,
): boolean {
  try {
    resolveReleaseApiBaseUrl(environment);
    return true;
  } catch {
    return false;
  }
}

const releaseErrorSchema = z.object({ error: z.string().max(1000).optional() });

const historyEntrySchema = z
  .object({
    version: z.string().max(40),
    title: z.string().max(200).optional(),
    name: z.string().max(200).optional(),
    description: z.string().max(4000).optional(),
    severity: z.string().max(40).optional(),
    channel: z.string().max(40).optional(),
    created_at: z.string().max(64).optional(),
    disabled: z.boolean().optional(),
    force_update: z.boolean().optional(),
    signed: z.boolean().optional(),
  })
  // Deliberately NOT strict: this is the catalogue as it was written, going back to
  // releases published before some of today's fields existed. Rejecting the whole list
  // because one old entry carries an extra key would take rollback away at the moment it
  // is most needed.
  .passthrough();

const releaseHistorySchema = z.object({
  ok: z.literal(true),
  signing_configured: z.boolean(),
  current_version: z.string().max(40),
  releases: z.array(historyEntrySchema).max(50),
});

const publishResultSchema = z.object({
  ok: z.literal(true),
  version: z.string().max(40),
  /** False when the manifest only went into the catalogue: staged, not served. */
  serving: z.boolean().optional(),
});

export type PublishResult = { version: string; serving: boolean };

export type ReleaseCatalogue = {
  signingConfigured: boolean;
  currentVersion: string;
  entries: ReleaseHistoryEntry[];
  /** The raw manifests, kept server-side so rollback re-posts what was published. */
  manifests: Record<string, Record<string, unknown>>;
};

type ReleaseFetchOptions = {
  environment?: Readonly<Partial<Record<string, string>>>;
  fetcher?: typeof fetch;
};

async function callReleaseApi(
  route: string,
  accessToken: string,
  options: ReleaseFetchOptions & { body?: Readonly<Record<string, unknown>> } = {},
): Promise<unknown> {
  const token = accessToken.trim();
  if (!token) throw new ReleaseApiUnavailableError();

  const base = resolveReleaseApiBaseUrl(options.environment);
  const url = new URL(base.toString());
  url.pathname = `${url.pathname.replace(/\/+$/u, "")}/${route}`;

  const headers: Record<string, string> = {
    Accept: "application/json",
    Authorization: `Bearer ${token}`,
  };
  const init: RequestInit = {
    method: options.body ? "POST" : "GET",
    cache: "no-store",
    headers,
  };
  if (options.body) {
    headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(options.body);
  }

  let response: Response;
  try {
    response = await (options.fetcher ?? fetch)(url, init);
  } catch {
    throw new ReleaseApiUnavailableError();
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new ReleaseApiUnavailableError();
  }

  if (!response.ok) {
    const parsed = releaseErrorSchema.safeParse(payload);
    // The function's own message is the useful one — "Release signing is not configured on
    // this deployment" tells an operator exactly what to fix, and a generic string would
    // send them looking at the form instead. It is server-authored, never user input.
    throw new ReleaseApiRequestError(
      response.status,
      (parsed.success && parsed.data.error) || "The release service refused this request.",
    );
  }
  return payload;
}

export async function fetchReleaseCatalogue(
  accessToken: string,
  options: ReleaseFetchOptions = {},
): Promise<ReleaseCatalogue> {
  const parsed = releaseHistorySchema.safeParse(
    await callReleaseApi("release_history", accessToken, options),
  );
  if (!parsed.success) throw new ReleaseApiUnavailableError();

  const manifests: Record<string, Record<string, unknown>> = {};
  const entries: ReleaseHistoryEntry[] = [];
  for (const raw of parsed.data.releases) {
    const record = raw as Record<string, unknown>;
    if (!raw.version) continue;
    manifests[raw.version] = record;
    entries.push({
      version: raw.version,
      title: raw.title || raw.name || "",
      description: raw.description ?? "",
      severity: raw.severity ?? "recommended",
      channel: raw.channel ?? "stable",
      created_at: raw.created_at ?? "",
      disabled: raw.disabled ?? false,
      force_update: raw.force_update ?? false,
      signed: raw.signed ?? false,
    });
  }
  return {
    signingConfigured: parsed.data.signing_configured,
    currentVersion: parsed.data.current_version,
    entries,
    manifests,
  };
}

export async function publishReleaseManifest(
  accessToken: string,
  manifest: Readonly<Record<string, unknown>>,
  options: ReleaseFetchOptions = {},
): Promise<PublishResult> {
  const parsed = publishResultSchema.safeParse(
    await callReleaseApi("deploy_update", accessToken, { ...options, body: manifest }),
  );
  if (!parsed.success) throw new ReleaseApiUnavailableError();
  // An older deploy function does not report `serving`. Reading the absent field as "it is
  // being served" would claim more than was established; derive it from what was asked for.
  return {
    version: parsed.data.version,
    serving: parsed.data.serving ?? manifest.disabled !== true,
  };
}

/**
 * The checks a stored manifest must still pass before the console re-publishes it.
 *
 * Rollback does not go back through the publish form's schema on purpose: an old entry may
 * predate a field the form now requires, and refusing to roll back to a known-good release
 * over a missing checksum would lengthen exactly the outage rollback exists to end. What
 * cannot be waived is transport — an http installer URL is replaceable in flight, and the
 * signature covers the URL, not the bytes at the end of it.
 */
export function rollbackRefusalReason(manifest: Record<string, unknown>): string {
  const urls = RELEASE_PLATFORMS.map((platform) =>
    String(manifest[platform.url] ?? "").trim(),
  ).filter((value) => value.length > 0);
  if (urls.length === 0) return "That release has no platform download URL.";
  for (const value of [...urls, String(manifest.download_page_url ?? "").trim()]) {
    if (!value) continue;
    try {
      if (new URL(value).protocol !== "https:")
        return "That release carries a non-https download URL.";
    } catch {
      return "That release carries a download URL HQ cannot parse.";
    }
  }
  if (!String(manifest.version ?? "").trim()) return "That release has no version.";
  return "";
}
