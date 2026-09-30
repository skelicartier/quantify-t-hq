import "server-only";

import { AsyncLocalStorage } from "node:async_hooks";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

/**
 * The transport core, and nothing else: base-URL resolution, the response envelope,
 * error classes, and the two fetch helpers every domain module builds on. Domain
 * schemas live beside their calls in `src/lib/api/*` — one module per domain, never
 * one file that grows to three thousand lines.
 */

const DEFAULT_BASE_URL = "";

export class HqApiRequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly correlationId: string,
    readonly details: Record<string, unknown>,
  ) {
    super(`hq api refused: ${code}`);
    this.name = "HqApiRequestError";
  }
}

export class HqApiUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HqApiUnavailableError";
  }
}

/** The service is reachable and answered, but with a shape the schema refuses. */
function unavailable(route: string, reason: string): HqApiUnavailableError {
  return new HqApiUnavailableError(`hq api unavailable for ${route}: ${reason}`);
}

export function resolveHqApiBaseUrl(): string {
  const raw = (process.env.HQ_ACCOUNT_API_BASE_URL ?? DEFAULT_BASE_URL).trim().replace(/\/+$/, "");
  if (!raw) {
    throw new HqApiUnavailableError("HQ_ACCOUNT_API_BASE_URL is not set");
  }
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new HqApiUnavailableError("HQ_ACCOUNT_API_BASE_URL is not a URL");
  }
  const local = parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";
  if (parsed.protocol !== "https:" && !local) {
    throw new HqApiUnavailableError("HQ_ACCOUNT_API_BASE_URL must be https");
  }
  if (parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new HqApiUnavailableError("HQ_ACCOUNT_API_BASE_URL must be a bare origin/path");
  }
  return raw.endsWith("/api/v1") ? raw : `${raw}/api/v1`;
}

/**
 * One form submission is one attempt. A server action that received a form opens the
 * attempt with the id the form carried (see `AttemptField`), and every POST it makes
 * takes its idempotency key from it: the same attempt sent twice — a double click, a
 * retry after a lost response — replays the service's stored answer instead of writing
 * a second contract or a second note. A fresh key per call, which is what this did
 * before, satisfied the service's gate and protected nothing.
 */
type Attempt = { id: string; calls: number };
const attemptStore = new AsyncLocalStorage<Attempt>();
const ATTEMPT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function beginAttempt(id: string | null | undefined): void {
  const clean =
    typeof id === "string" && ATTEMPT_ID.test(id) ? id.toLowerCase() : crypto.randomUUID();
  attemptStore.enterWith({ id: clean, calls: 0 });
}

function nextIdempotencyKey(): string {
  const attempt = attemptStore.getStore();
  if (!attempt) return `hq-${crypto.randomUUID()}`;
  attempt.calls += 1;
  // Two POSTs to one route inside one action stay distinct; the key is scoped per
  // route on the service, so the counter matters only for that case.
  return `hq-${attempt.id}-${attempt.calls}`;
}

const failureEnvelope = z.object({
  ok: z.literal(false),
  correlation_id: z.string().default(""),
  error: z.object({
    code: z.string(),
    message: z.string().default(""),
    details: z.record(z.string(), z.unknown()).default({}),
  }),
});

/**
 * The person behind the request, as this server saw them. The service is called from
 * here, so without these it would see only this server: its egress address and its
 * runtime's user agent. The address keys the service's per-source throttles on the
 * person (the console's `X-QT-Client-Address` convention, kept byte-identical); the
 * browser is what a session is listed under, and what makes a sign-in from a browser
 * the account never used stand out.
 */
async function clientHeaders(): Promise<Record<string, string>> {
  try {
    const incoming = await headers();
    const forwarded: Record<string, string> = {};
    // The service believes the two client headers only from a caller that presents
    // the shared key (QT_HQ_PORTAL_KEY on its side); without it they are dropped there
    // and every session records this server's egress instead of the person.
    const portalKey = (process.env.HQ_ACCOUNT_API_PORTAL_KEY ?? "").trim();
    if (portalKey) forwarded["X-QT-Portal-Key"] = portalKey;
    const address =
      incoming.get("x-real-ip") ?? incoming.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "";
    if (address) forwarded["X-QT-Client-Address"] = address;
    const agent = incoming.get("user-agent")?.slice(0, 400) ?? "";
    if (agent) forwarded["X-QT-Client-Agent"] = agent;
    return forwarded;
  } catch {
    return {};
  }
}

type CallOptions = {
  token?: string | undefined;
  query?: Record<string, string> | undefined;
  idempotencyKey?: string | undefined;
  body?: Record<string, unknown> | undefined;
};

async function call(route: string, method: "GET" | "POST", options: CallOptions): Promise<unknown> {
  const base = resolveHqApiBaseUrl();
  const url = new URL(`${base}/${route}`);
  for (const [name, value] of Object.entries(options.query ?? {})) {
    if (value !== "") url.searchParams.set(name, value);
  }
  const requestHeaders: Record<string, string> = {
    accept: "application/json",
    ...(await clientHeaders()),
  };
  if (options.token) requestHeaders.authorization = `Bearer ${options.token}`;
  if (method === "POST") {
    requestHeaders["content-type"] = "application/json";
    requestHeaders["idempotency-key"] = options.idempotencyKey ?? nextIdempotencyKey();
  }

  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers: requestHeaders,
      cache: "no-store",
      body: method === "POST" ? JSON.stringify(options.body ?? {}) : null,
    });
  } catch (error) {
    console.error(
      `[hq-api] route=${route} method=${method} outcome=unreachable`,
      error instanceof Error ? error.message : String(error),
    );
    throw unavailable(route, "unreachable");
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    console.error(
      `[hq-api] route=${route} method=${method} outcome=non-json status=${response.status}`,
    );
    throw unavailable(route, `non-JSON ${response.status}`);
  }

  if (
    !response.ok ||
    (typeof payload === "object" && payload !== null && (payload as { ok?: unknown }).ok === false)
  ) {
    const refusal = failureEnvelope.safeParse(payload);
    if (refusal.success) {
      throw new HqApiRequestError(
        response.status,
        refusal.data.error.code,
        refusal.data.correlation_id,
        refusal.data.error.details,
      );
    }
    console.error(
      `[hq-api] route=${route} method=${method} outcome=unparseable-refusal status=${response.status}`,
    );
    throw unavailable(route, `refusal ${response.status}`);
  }
  return payload;
}

/**
 * Every response is parsed against its schema before anything downstream sees it. A
 * response that fails its schema is reported as the service being unavailable — a
 * shape drift is an outage, never data.
 */
/** The page being rendered, as the proxy recorded it, for sending someone back to it. */
export const PATH_HEADER = "x-hq-path";

/**
 * A record read the service refused because of the read watch — past the step-up with
 * no fresh code, or held — goes to the page that says so and offers the code, rather
 * than rendering as "could not be read".
 */
async function redirectIfReadWatch(error: unknown): Promise<void> {
  if (!(error instanceof HqApiRequestError) || error.status !== 403) return;
  const reason = error.details["reason"];
  if (reason !== "reads-volume" && reason !== "reads-held") return;
  let path = "/home";
  try {
    path = (await headers()).get(PATH_HEADER) || "/home";
  } catch {
    // Outside a request (a script, a test): the home page is the safe place to return.
  }
  const query = new URLSearchParams({ next: path });
  if (reason === "reads-held") query.set("held", "1");
  redirect(`/confirm-reads?${query.toString()}`);
}

export async function fetchHqJson<T>(
  route: string,
  schema: z.ZodType<T>,
  options: Omit<CallOptions, "body" | "idempotencyKey"> = {},
): Promise<T> {
  let payload: unknown;
  try {
    payload = await call(route, "GET", options);
  } catch (error) {
    await redirectIfReadWatch(error);
    throw error;
  }
  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    console.error(`[hq-api] route=${route} method=GET outcome=schema-mismatch`);
    throw unavailable(route, "schema mismatch");
  }
  return parsed.data;
}

export async function postHqJson<T>(
  route: string,
  schema: z.ZodType<T>,
  options: CallOptions = {},
): Promise<T> {
  const payload = await call(route, "POST", options);
  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    console.error(`[hq-api] route=${route} method=POST outcome=schema-mismatch`);
    throw unavailable(route, "schema mismatch");
  }
  return parsed.data;
}
