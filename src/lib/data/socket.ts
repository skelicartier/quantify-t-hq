import "server-only";

import { request, type IncomingMessage } from "node:http";

import { z } from "zod";

/**
 * The portal's way to the Data section of the local service (`scripts/data`), which runs
 * in Mail merge's process and answers on the same socket file, `HQ_MAIL_MERGE_SOCKET`.
 * Unset, as it is wherever the portal is deployed, Data is not there at all.
 *
 * Three transports: JSON in and out (`dataAsk`), a part of an upload as raw bytes with a
 * JSON answer (`dataSendPart`), and a file's bytes out as a stream (`dataOpen`). All of
 * them use `node:http` over the socket: `fetch` cannot reach a socket file, and
 * `node:http` sends no Origin header, which the service refuses.
 */

export class DataUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DataUnavailableError";
  }
}

/** The service answered and said no; `message` is its sentence for the person. */
export class DataRequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "DataRequestError";
  }
}

export function dataSocket(): string | null {
  const path = (process.env.HQ_MAIL_MERGE_SOCKET ?? "").trim();
  return path.startsWith("/") ? path : null;
}

/** Whether this portal has a local service to talk to at all (the same test as Mail merge's). */
export function dataConfigured(): boolean {
  return dataSocket() !== null;
}

const TIMEOUT_MS = 70_000;

const refusalSchema = z.object({
  ok: z.literal(false),
  error: z.object({ code: z.string(), message: z.string() }),
});

export const ok = z.object({ ok: z.literal(true) });

/** A path segment: ids are `[A-Za-z0-9-]`, which this leaves alone; anything else is encoded. */
export const id = (value: string): string => encodeURIComponent(value);

function readAll(response: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    response.on("data", (chunk: Buffer) => chunks.push(chunk));
    response.on("end", () => resolve(Buffer.concat(chunks)));
    response.on("error", () => reject(new DataUnavailableError("the service hung up")));
  });
}

/** A JSON answer parsed: a refusal becomes `DataRequestError`; anything unreadable, unavailable. */
async function parseAnswer(response: IncomingMessage): Promise<unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse((await readAll(response)).toString("utf8"));
  } catch (error) {
    if (error instanceof DataUnavailableError) throw error;
    throw new DataUnavailableError("the service's answer could not be read");
  }
  const refusal = refusalSchema.safeParse(parsed);
  if (refusal.success)
    throw new DataRequestError(
      response.statusCode ?? 500,
      refusal.data.error.code,
      refusal.data.error.message,
    );
  return parsed;
}

function send(
  method: "GET" | "POST",
  path: string,
  payload: { body: Buffer; type: string } | null,
): Promise<unknown> {
  const socketPath = dataSocket();
  if (!socketPath) return Promise.reject(new DataUnavailableError("no service is set up"));
  return new Promise((resolve, reject) => {
    const outgoing = request(
      {
        socketPath,
        path,
        method,
        headers: {
          accept: "application/json",
          ...(payload
            ? { "content-type": payload.type, "content-length": payload.body.length }
            : {}),
        },
        timeout: TIMEOUT_MS,
      },
      (response) => {
        parseAnswer(response).then(resolve, reject);
      },
    );
    outgoing.on("timeout", () => outgoing.destroy(new Error("timeout")));
    outgoing.on("error", () => reject(new DataUnavailableError("the service is not running")));
    if (payload) outgoing.write(payload.body);
    outgoing.end();
  });
}

/** One JSON call, the answer checked against the portal's own schema. */
export async function dataAsk<T>(
  schema: z.ZodType<T>,
  method: "GET" | "POST",
  path: string,
  body?: unknown,
): Promise<T> {
  const payload =
    body === undefined
      ? null
      : { body: Buffer.from(JSON.stringify(body)), type: "application/json" };
  const parsed = schema.safeParse(await send(method, path, payload));
  if (!parsed.success)
    throw new DataUnavailableError(`the service's answer for ${path} was not what was expected`);
  return parsed.data;
}

/** The raw bytes of one part of an upload, posted as they are; the JSON answer comes back. */
export async function dataSendPart<T>(
  schema: z.ZodType<T>,
  path: string,
  bytes: Uint8Array,
): Promise<T> {
  const parsed = schema.safeParse(
    await send("POST", path, { body: Buffer.from(bytes), type: "application/octet-stream" }),
  );
  if (!parsed.success)
    throw new DataUnavailableError(`the service's answer for ${path} was not what was expected`);
  return parsed.data;
}

export type OpenedFile = {
  type: string;
  size: number;
  /** The file's name, decoded. */
  name: string;
  sha256: string;
  /** The bytes, unread: pipe them on. */
  body: IncomingMessage;
};

/**
 * A file's bytes as a stream: resolves on the answer's headers, hands the body on unread.
 * A refusal is read as JSON and rejects with `DataRequestError`. The signal, when given,
 * is the browser's own: a cancelled download stops reading the socket.
 */
export function dataOpen(path: string, signal?: AbortSignal): Promise<OpenedFile> {
  const socketPath = dataSocket();
  if (!socketPath) return Promise.reject(new DataUnavailableError("no service is set up"));
  return new Promise((resolve, reject) => {
    const outgoing = request(
      {
        socketPath,
        path,
        method: "GET",
        headers: { accept: "*/*" },
        timeout: TIMEOUT_MS,
        ...(signal ? { signal } : {}),
      },
      (response) => {
        if (response.statusCode !== 200) {
          parseAnswer(response).then(
            () => reject(new DataUnavailableError("the service's answer could not be read")),
            reject,
          );
          return;
        }
        const header = (name: string): string => {
          const value = response.headers[name];
          return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
        };
        let name = header("x-data-name");
        try {
          name = decodeURIComponent(name);
        } catch {
          // the name stays as it came
        }
        resolve({
          type: header("content-type") || "application/octet-stream",
          size: Number(header("content-length")) || 0,
          name,
          sha256: header("x-data-sha256"),
          body: response,
        });
      },
    );
    outgoing.on("timeout", () => outgoing.destroy(new Error("timeout")));
    outgoing.on("error", (error: Error) =>
      reject(
        error.name === "AbortError"
          ? error
          : new DataUnavailableError("the service is not running"),
      ),
    );
    outgoing.end();
  });
}
