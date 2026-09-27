import "server-only";

import { headers } from "next/headers";
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
 * The caller's own address, forwarded so the service's per-source throttles key on the
 * person rather than on this server's egress — the console's `X-QT-Client-Address`
 * convention, kept byte-identical.
 */
async function clientAddressHeader(): Promise<Record<string, string>> {
  try {
    const incoming = await headers();
    const address =
      incoming.get("x-real-ip") ?? incoming.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "";
    return address ? { "X-QT-Client-Address": address } : {};
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
    ...(await clientAddressHeader()),
  };
  if (options.token) requestHeaders.authorization = `Bearer ${options.token}`;
  if (method === "POST") {
    requestHeaders["content-type"] = "application/json";
    requestHeaders["idempotency-key"] = options.idempotencyKey ?? `hq-${crypto.randomUUID()}`;
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
export async function fetchHqJson<T>(
  route: string,
  schema: z.ZodType<T>,
  options: Omit<CallOptions, "body" | "idempotencyKey"> = {},
): Promise<T> {
  const payload = await call(route, "GET", options);
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
