/**
 * The sender, answering the portal.
 *
 * It listens on a socket file in its own folder, not on a network port: only this
 * account's programs can reach it, and a web page in a browser cannot. The portal's
 * server is its one caller. Every answer is `{ok: true, …}` or
 * `{ok: false, error: {code, message}}`, and the message is a sentence for the person.
 */

import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";

import { MergeEngine, Refused } from "./engine";

const MAX_BODY_BYTES = 6_000_000;

export type Answer = Record<string, unknown> | Promise<Record<string, unknown>>;
/** A route that takes a JSON body and answers JSON: every one of the sender's own. */
export type JsonRoute = {
  method: "GET" | "POST";
  pattern: RegExp;
  run: (
    engine: MergeEngine,
    params: string[],
    body: Record<string, unknown>,
    query: URLSearchParams,
  ) => Answer;
};
/**
 * A route that owns its request and its answer: the body is not read for it, and it
 * writes the response itself (a file's bytes out, a part of an upload in). Added for the
 * Data section's host; the sender has none.
 */
export type StreamRoute = {
  method: "GET" | "POST";
  pattern: RegExp;
  stream: (
    request: IncomingMessage,
    response: ServerResponse,
    params: string[],
    query: URLSearchParams,
  ) => void | Promise<void>;
};
export type Route = JsonRoute | StreamRoute;

const ID = "([A-Za-z0-9-]{1,64})";
const number = (query: URLSearchParams, name: string): number => {
  const value = Number.parseInt(query.get(name) ?? "", 10);
  return Number.isFinite(value) ? value : 0;
};

const ROUTES: JsonRoute[] = [
  { method: "GET", pattern: /^\/status$/, run: (engine) => engine.status() },
  { method: "POST", pattern: /^\/provider-key$/, run: (engine, _p, body) => engine.setKey(body) },
  { method: "POST", pattern: /^\/provider-key\/clear$/, run: (engine) => engine.clearKey() },
  { method: "POST", pattern: /^\/provider\/check$/, run: (engine) => engine.checkProvider() },
  { method: "POST", pattern: /^\/settings$/, run: (engine, _p, body) => engine.saveSettings(body) },
  { method: "GET", pattern: /^\/lists$/, run: (engine) => engine.lists() },
  {
    method: "POST",
    pattern: /^\/lists\/import$/,
    run: (engine, _p, body) => engine.importList(body),
  },
  {
    method: "GET",
    pattern: new RegExp(`^/lists/${ID}$`),
    run: (engine, [id], _b, query) =>
      engine.listDetail(id!, {
        offset: number(query, "offset"),
        ...(query.get("q") ? { q: query.get("q")! } : {}),
        ...(query.get("row") ? { row: query.get("row")! } : {}),
      }),
  },
  {
    method: "POST",
    pattern: new RegExp(`^/lists/${ID}/rename$`),
    run: (engine, [id], body) => engine.renameList(id!, body),
  },
  {
    method: "POST",
    pattern: new RegExp(`^/lists/${ID}/delete$`),
    run: (engine, [id]) => engine.deleteList(id!),
  },
  {
    method: "POST",
    pattern: new RegExp(`^/lists/${ID}/rows$`),
    run: (engine, [id], body) => engine.addRow(id!, body),
  },
  {
    method: "POST",
    pattern: new RegExp(`^/lists/${ID}/rows/${ID}/update$`),
    run: (engine, [id, row], body) => engine.updateRow(id!, row!, body),
  },
  {
    method: "POST",
    pattern: new RegExp(`^/lists/${ID}/rows/${ID}/remove$`),
    run: (engine, [id, row]) => engine.removeRow(id!, row!),
  },
  {
    method: "GET",
    pattern: /^\/stops$/,
    run: (engine, _p, _b, query) => engine.stops({ offset: number(query, "offset") }),
  },
  { method: "POST", pattern: /^\/stops\/add$/, run: (engine, _p, body) => engine.addStops(body) },
  {
    method: "POST",
    pattern: /^\/stops\/remove$/,
    run: (engine, _p, body) => engine.removeStop(body),
  },
  { method: "POST", pattern: /^\/stops\/sync$/, run: (engine) => engine.syncStops() },
  { method: "GET", pattern: /^\/mailings$/, run: (engine) => engine.mailings() },
  {
    method: "POST",
    pattern: /^\/mailings$/,
    run: (engine, _p, body) => engine.createMailing(body),
  },
  {
    method: "GET",
    pattern: new RegExp(`^/mailings/${ID}$`),
    run: (engine, [id], _b, query) =>
      engine.mailingDetail(id!, {
        offset: number(query, "offset"),
        preview: number(query, "preview"),
        ...(query.get("state") ? { state: query.get("state")! } : {}),
      }),
  },
  {
    method: "GET",
    pattern: new RegExp(`^/mailings/${ID}/people$`),
    run: (engine, [id], _b, query) =>
      engine.people(id!, {
        offset: number(query, "offset"),
        ...(query.get("q") ? { q: query.get("q")! } : {}),
        ...(query.get("view") ? { view: query.get("view")! } : {}),
      }),
  },
  {
    method: "POST",
    pattern: new RegExp(`^/mailings/${ID}/pick$`),
    run: (engine, [id], body) => engine.pick(id!, body),
  },
  {
    method: "POST",
    pattern: new RegExp(`^/mailings/${ID}/people$`),
    run: (engine, [id], body) => engine.addPeople(id!, body),
  },
  {
    method: "GET",
    pattern: new RegExp(`^/mailings/${ID}/outcomes$`),
    run: (engine, [id]) => engine.outcomes(id!),
  },
  {
    method: "POST",
    pattern: new RegExp(`^/mailings/${ID}/update$`),
    run: (engine, [id], body) => engine.updateMailing(id!, body),
  },
  {
    method: "POST",
    pattern: new RegExp(`^/mailings/${ID}/duplicate$`),
    run: (engine, [id]) => engine.duplicateMailing(id!),
  },
  {
    method: "POST",
    pattern: new RegExp(`^/mailings/${ID}/delete$`),
    run: (engine, [id]) => engine.deleteMailing(id!),
  },
  {
    method: "POST",
    pattern: new RegExp(`^/mailings/${ID}/test$`),
    run: (engine, [id], body) => engine.testMailing(id!, body),
  },
  {
    method: "POST",
    pattern: new RegExp(`^/mailings/${ID}/start$`),
    run: (engine, [id], body) => engine.startMailing(id!, body),
  },
  {
    method: "POST",
    pattern: new RegExp(`^/mailings/${ID}/pause$`),
    run: (engine, [id]) => engine.pauseMailing(id!),
  },
  {
    method: "POST",
    pattern: new RegExp(`^/mailings/${ID}/resume$`),
    run: (engine, [id]) => engine.resumeMailing(id!),
  },
  {
    method: "POST",
    pattern: new RegExp(`^/mailings/${ID}/cancel$`),
    run: (engine, [id]) => engine.cancelMailing(id!),
  },
];

function send(response: ServerResponse, status: number, body: Record<string, unknown>): void {
  response.writeHead(status, { "content-type": "application/json" }).end(JSON.stringify(body));
}

function refuse(response: ServerResponse, status: number, code: string, message: string): void {
  send(response, status, { ok: false, error: { code, message } });
}

function readBody(request: IncomingMessage): Promise<Record<string, unknown> | null> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    let size = 0;
    request.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        resolve(null);
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on("end", () => {
      if (chunks.length === 0) return resolve({});
      try {
        const parsed: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
        resolve(
          parsed && typeof parsed === "object" && !Array.isArray(parsed)
            ? (parsed as Record<string, unknown>)
            : null,
        );
      } catch {
        resolve(null);
      }
    });
    request.on("error", () => resolve(null));
  });
}

/**
 * The server. `extra` routes (the Data section's) are matched after the sender's own, so
 * nothing the sender answers today can be taken over; a stream route among them reads and
 * writes for itself. The sender's callers keep calling `createMergeServer(engine, false)`.
 */
export function createMergeServer(engine: MergeEngine, log = true, extra: Route[] = []): Server {
  const routes: Route[] = [...ROUTES, ...extra];
  return createServer((request, response) => {
    void (async () => {
      const url = new URL(request.url ?? "/", "http://sender.invalid");
      const method = request.method ?? "GET";
      // A browser says where a request came from; the portal's server never does.
      if (request.headers.origin !== undefined)
        return refuse(response, 403, "not_from_here", "This is not for browsers.");
      const route = routes.find(
        (item) => item.method === method && item.pattern.test(url.pathname),
      );
      if (!route) return refuse(response, 404, "no_such_route", "Nothing answers there.");
      const params = (route.pattern.exec(url.pathname) ?? []).slice(1);
      let status = 200;
      if ("stream" in route) {
        // Its own request and its own answer: the body is bytes, not JSON, and is read
        // (or a file is written out) by the route itself.
        await route.stream(request, response, params, url.searchParams);
        status = response.statusCode;
        if (log) console.log(`[mail-merge] ${method} ${url.pathname} -> ${status}`);
        return;
      }
      const body = method === "POST" ? await readBody(request) : {};
      if (body === null)
        return refuse(
          response,
          400,
          "malformed",
          "That could not be read. A file may be too large.",
        );
      try {
        send(response, 200, {
          ok: true,
          ...(await route.run(engine, params, body, url.searchParams)),
        });
      } catch (error) {
        if (error instanceof Refused) {
          status = error.status;
          refuse(response, error.status, error.code, error.message);
        } else {
          status = 500;
          console.error("[mail-merge] failed:", error instanceof Error ? error.message : error);
          refuse(response, 500, "failed", "The sender could not do that just now.");
        }
      }
      // The path names a mailing or a list by its id; never an address, never the key.
      if (log) console.log(`[mail-merge] ${method} ${url.pathname} -> ${status}`);
    })().catch((error: unknown) => {
      // The last resort: nothing above may take the server down. A failure before the
      // headers went is refused; one after them can only end the connection.
      console.error("[mail-merge] failed:", error instanceof Error ? error.name : "error");
      if (response.headersSent) response.destroy();
      else refuse(response, 500, "failed", "The sender could not do that just now.");
    });
  });
}
