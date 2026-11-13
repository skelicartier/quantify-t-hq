/**
 * The real thing, in a test: Mail merge's engine on a temp folder, the Data host with its
 * worker thread, and the sender's server on a temp socket. Every `tests/data/*.test.ts`
 * (and the ones Units 2 to 5 add) starts a stack with `startStack()` instead of wiring
 * these up again. Nothing here touches a real folder, port or socket.
 */

import { mkdtempSync, rmSync } from "node:fs";
import { request, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { startData, type DataHandle, type StartDataOptions } from "../../scripts/data/host";
import type { Staff } from "../../scripts/data/protocol";
import { MergeEngine, type EngineOptions } from "../../scripts/mail-merge/engine";
import type { MailProvider } from "../../scripts/mail-merge/provider";
import { createMergeServer, type Route } from "../../scripts/mail-merge/server";

/** Who the tests act as: invented, like everyone else in them. */
export const WALKER: Staff = { staff_id: "walk-owner", name: "Walk Owner" };

export type RawAnswer = {
  status: number;
  headers: Record<string, string | string[] | undefined>;
  bytes: Buffer;
  /** The body parsed as JSON, or null when it is not JSON. */
  json: Record<string, unknown> | null;
};

/** One request over the socket, as the portal's server would make it (no Origin header). */
export function rawCall(
  socket: string,
  method: "GET" | "POST",
  path: string,
  payload?:
    { json: unknown } | { bytes: Uint8Array; type?: string } | { text: string; type?: string },
  headers: Record<string, string> = {},
): Promise<RawAnswer> {
  let body: Buffer | undefined;
  let type = "application/json";
  if (payload && "json" in payload) body = Buffer.from(JSON.stringify(payload.json));
  else if (payload && "bytes" in payload) {
    body = Buffer.from(payload.bytes);
    type = payload.type ?? "application/octet-stream";
  } else if (payload && "text" in payload) {
    body = Buffer.from(payload.text);
    type = payload.type ?? "application/json";
  }
  return new Promise((resolve, reject) => {
    const outgoing = request(
      {
        socketPath: socket,
        path,
        method,
        headers: {
          ...headers,
          ...(body ? { "content-type": type, "content-length": body.length } : {}),
        },
      },
      (response) => {
        const chunks: Buffer[] = [];
        response.on("data", (chunk: Buffer) => chunks.push(chunk));
        response.on("end", () => {
          const bytes = Buffer.concat(chunks);
          let json: Record<string, unknown> | null = null;
          try {
            const parsed: unknown = JSON.parse(bytes.toString("utf8"));
            if (parsed && typeof parsed === "object" && !Array.isArray(parsed))
              json = parsed as Record<string, unknown>;
          } catch {
            json = null;
          }
          resolve({ status: response.statusCode ?? 0, headers: response.headers, bytes, json });
        });
        response.on("error", reject);
      },
    );
    outgoing.on("error", reject);
    if (body) outgoing.write(body);
    outgoing.end();
  });
}

/** The `error.code` of a refusal, or "" when the answer was not one. */
export function codeOf(answer: RawAnswer): string {
  const error = answer.json?.error;
  return error && typeof error === "object" ? String((error as { code?: unknown }).code ?? "") : "";
}

export type Stack = {
  /** Mail merge's folder; Data's own is `<dir>/data`. */
  dir: string;
  socket: string;
  engine: MergeEngine;
  data: DataHandle;
  server: Server;
  ask(method: "GET" | "POST", path: string, json?: unknown): Promise<RawAnswer>;
  raw: typeof rawCall;
  stop(): Promise<void>;
};

export type StackOptions = Partial<Omit<StartDataOptions, "dir" | "engine">> & {
  /** Point `HQ_MAIL_MERGE_SOCKET` at the stack, so the portal's own client reaches it. */
  env?: boolean;
  /** Routes the sender's server gets besides Data's (a stand-in's own test routes). */
  extraRoutes?: Route[];
  /** The engine's own options: a fixed clock, a scripted provider. */
  engine?: Omit<EngineOptions, "dir">;
  liveProvider?: (key: string) => MailProvider;
  /** Wait for the worker to say ready before resolving (default true). */
  waitReady?: boolean;
};

/**
 * Start everything on a temp folder with a short socket path, Data's test routes on and
 * the request log off. `stop()` ends the worker and the server and removes the folder.
 */
export async function startStack(options: StackOptions = {}): Promise<Stack> {
  // A short path: a socket's name has a length limit, and the system's temp folder is deep.
  const dir = mkdtempSync(join(tmpdir(), "hqd-"));
  const socket = join(dir, "s");
  const { env, extraRoutes, engine: engineOptions, liveProvider, waitReady, ...rest } = options;
  const engine = new MergeEngine({
    dir,
    ...(engineOptions ?? {}),
    ...(liveProvider ? { liveProvider } : {}),
  });
  const data = startData({
    dir,
    engine,
    testRoutes: true,
    log: false,
    restartDelaysMs: [50, 50, 50],
    ...rest,
  });
  const server = createMergeServer(engine, false, [...data.routes, ...(extraRoutes ?? [])]);
  await new Promise<void>((resolve) => server.listen(socket, resolve));
  const previousEnv = process.env.HQ_MAIL_MERGE_SOCKET;
  if (env) process.env.HQ_MAIL_MERGE_SOCKET = socket;
  if (waitReady !== false) await data.ready(60_000);
  return {
    dir,
    socket,
    engine,
    data,
    server,
    ask: (method, path, json) =>
      rawCall(socket, method, path, json === undefined ? undefined : { json }),
    raw: rawCall,
    stop: async () => {
      if (env) {
        if (previousEnv === undefined) delete process.env.HQ_MAIL_MERGE_SOCKET;
        else process.env.HQ_MAIL_MERGE_SOCKET = previousEnv;
      }
      await data.stop();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

/** Wait until a condition holds, checking every `everyMs`; throws after `timeoutMs`. */
export async function until(
  condition: () => boolean | Promise<boolean>,
  what: string,
  timeoutMs = 10_000,
  everyMs = 25,
): Promise<void> {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    if (await condition()) return;
    await new Promise((resolve) => setTimeout(resolve, everyMs));
  }
  throw new Error(`timed out waiting for ${what}`);
}

/** A tiny invented list as a CSV: `count` people at `.example` firms. */
export function inventedCsv(count: number, firm = "fund"): string {
  const rows = ["First Name,Company,Email"];
  for (let index = 1; index <= count; index += 1)
    rows.push(`Person ${index},${firm} ${index},p${index}@${firm}${index}.example`);
  return `${rows.join("\n")}\n`;
}
