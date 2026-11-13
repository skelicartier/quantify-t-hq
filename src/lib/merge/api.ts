import "server-only";

import { request } from "node:http";

import { z } from "zod";

/**
 * The portal's one way to the local sender behind Mail merge
 * (`scripts/mail-merge-service.ts`).
 *
 * The sender is not the Account API: it is a program on this machine that keeps lists of
 * people, holds the mail provider's key and does the sending. The portal stays what it
 * is everywhere else, a screen over a service, and holds no key: a key typed on the
 * Setup screen is handed straight through and is never read back.
 *
 * The sender listens on a socket file, not a port, so there is no address a browser
 * could be pointed at; `HQ_MAIL_MERGE_SOCKET` names the file. Unset, as it is wherever
 * the portal is deployed, Mail merge is not there at all.
 */

export class MergeUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MergeUnavailableError";
  }
}

/** The sender answered and said no; `message` is its sentence for the person. */
export class MergeRequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "MergeRequestError";
  }
}

export function mergeSocket(): string | null {
  const path = (process.env.HQ_MAIL_MERGE_SOCKET ?? "").trim();
  return path.startsWith("/") ? path : null;
}

/** Whether this portal has a sender to talk to at all. */
export function mergeConfigured(): boolean {
  return mergeSocket() !== null;
}

const TIMEOUT_MS = 70_000;

function call(method: "GET" | "POST", path: string, body?: unknown): Promise<unknown> {
  const socketPath = mergeSocket();
  if (!socketPath) return Promise.reject(new MergeUnavailableError("no sender is set up"));
  const text = body === undefined ? undefined : JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const outgoing = request(
      {
        socketPath,
        path,
        method,
        headers: {
          accept: "application/json",
          ...(text === undefined
            ? {}
            : { "content-type": "application/json", "content-length": Buffer.byteLength(text) }),
        },
        timeout: TIMEOUT_MS,
      },
      (response) => {
        const chunks: Buffer[] = [];
        response.on("data", (chunk: Buffer) => chunks.push(chunk));
        response.on("end", () => {
          let parsed: unknown;
          try {
            parsed = JSON.parse(Buffer.concat(chunks).toString("utf8"));
          } catch {
            return reject(new MergeUnavailableError("the sender's answer could not be read"));
          }
          const refusal = refusalSchema.safeParse(parsed);
          if (refusal.success)
            return reject(
              new MergeRequestError(
                response.statusCode ?? 500,
                refusal.data.error.code,
                refusal.data.error.message,
              ),
            );
          resolve(parsed);
        });
        response.on("error", () => reject(new MergeUnavailableError("the sender hung up")));
      },
    );
    outgoing.on("timeout", () => outgoing.destroy(new Error("timeout")));
    outgoing.on("error", () => reject(new MergeUnavailableError("the sender is not running")));
    if (text !== undefined) outgoing.write(text);
    outgoing.end();
  });
}

async function ask<T>(
  schema: z.ZodType<T>,
  method: "GET" | "POST",
  path: string,
  body?: unknown,
): Promise<T> {
  const parsed = schema.safeParse(await call(method, path, body));
  if (!parsed.success)
    throw new MergeUnavailableError(`the sender's answer for ${path} was not what was expected`);
  return parsed.data;
}

const refusalSchema = z.object({
  ok: z.literal(false),
  error: z.object({ code: z.string(), message: z.string() }),
});
const ok = z.object({ ok: z.literal(true) });
const checkStatus = z.enum(["ok", "auth_failed", "unavailable", "not_configured"]);

const settingsSchema = z.object({
  from_email: z.string(),
  from_name: z.string(),
  reply_to: z.string(),
  footer: z.string(),
  per_minute: z.number(),
  daily_cap: z.number(),
});

const statusSchema = ok.extend({
  provider: z.object({
    key_set: z.boolean(),
    /** The last four characters, so a person can tell which key it is. Never more. */
    key_hint: z.string().max(4),
    account: z
      .object({
        status: checkStatus,
        email: z.string(),
        company: z.string(),
        plan: z.string(),
        credits: z.number().nullable(),
      })
      .nullable(),
    sender: z
      .object({
        status: checkStatus,
        domain: z.string(),
        sender_known: z.boolean(),
        sender_active: z.boolean(),
        domain_known: z.boolean(),
        domain_authenticated: z.boolean(),
      })
      .nullable(),
    sender_verified: z.boolean(),
    checked_at: z.string().nullable(),
  }),
  settings: settingsSchema,
  sent_today: z.number(),
  sending: z.object({ mailing_id: z.string(), name: z.string() }).nullable(),
  counts: z.object({
    lists: z.number(),
    people: z.number(),
    mailings: z.number(),
    stopped: z.number(),
  }),
});
export type MergeStatus = z.infer<typeof statusSchema>;

const columnSchema = z.object({
  key: z.string(),
  label: z.string(),
  derived: z.boolean().optional(),
});
const listSchema = z.object({
  id: z.string(),
  name: z.string(),
  file_name: z.string(),
  created_at: z.string(),
  people: z.number(),
  left_out: z.number(),
  email_column: z.string(),
  columns: z.array(columnSchema),
});
export type MergeList = z.infer<typeof listSchema>;

const leftOutSchema = z.object({ line: z.number(), reason: z.string(), value: z.string() });
export type MergeLeftOut = z.infer<typeof leftOutSchema>;

const listsSchema = ok.extend({ lists: z.array(listSchema) });
const importedSchema = ok.extend({ list: listSchema, left_out: z.array(leftOutSchema) });
const listDetailSchema = ok.extend({
  list: listSchema,
  rows: z.array(
    z.object({
      id: z.string(),
      email: z.string(),
      name: z.string(),
      values: z.record(z.string(), z.string()),
      stopped: z.boolean(),
    }),
  ),
  offset: z.number(),
  limit: z.number(),
  total: z.number(),
  left_out: z.array(leftOutSchema),
  used_by: z.array(z.object({ id: z.string(), name: z.string(), state: z.string() })),
  editing: z
    .object({
      id: z.string(),
      email: z.string(),
      name: z.string(),
      values: z.record(z.string(), z.string()),
      stopped: z.boolean(),
    })
    .nullable(),
});
export type MergeListDetail = z.infer<typeof listDetailSchema>;

const stopSchema = z.object({
  email: z.string(),
  reason: z.enum(["manual", "asked", "bounced", "blocked"]),
  detail: z.string(),
  at: z.string(),
});
export type MergeStop = z.infer<typeof stopSchema>;
const stopsSchema = ok.extend({
  stops: z.array(stopSchema),
  offset: z.number(),
  limit: z.number(),
  total: z.number(),
});
export type MergeStops = z.infer<typeof stopsSchema>;

const mailingState = z.enum(["draft", "sending", "paused", "finished", "cancelled"]);
const progressSchema = z.object({
  total: z.number(),
  sent: z.number(),
  failed: z.number(),
  skipped: z.number(),
  unknown: z.number(),
  waiting: z.number(),
  stopped_since: z.number(),
});
const mailingSchema = z.object({
  id: z.string(),
  name: z.string(),
  subject: z.string(),
  state: mailingState,
  mode: z.enum(["live", "practice"]).nullable(),
  pause_reason: z.string().nullable(),
  lists: z.array(z.object({ id: z.string(), name: z.string(), people: z.number() })),
  progress: progressSchema,
  created_at: z.string(),
  updated_at: z.string(),
  started_at: z.string().nullable(),
  finished_at: z.string().nullable(),
  editable: z.boolean(),
});
export type MergeMailing = z.infer<typeof mailingSchema>;

const mailingsSchema = ok.extend({ mailings: z.array(mailingSchema) });
const mailingEnvelope = ok.extend({ mailing: mailingSchema });
const recipientState = z.enum(["waiting", "sent", "failed", "skipped", "unknown"]);
export type MergeRecipientState = z.infer<typeof recipientState>;
const mailingDetailSchema = ok.extend({
  mailing: mailingSchema.extend({
    body: z.string(),
    list_ids: z.array(z.string()),
    only_column: z.string(),
    only_value: z.string(),
    hold_column: z.string(),
    pick_only: z.boolean(),
    picked_count: z.number(),
    skip_written: z.boolean(),
  }),
  message_fields: z.array(z.object({ key: z.string(), label: z.string(), required: z.boolean() })),
  message: z.object({ from_email: z.string(), from_name: z.string(), footer: z.string() }),
  available_lists: z.array(z.object({ id: z.string(), name: z.string(), people: z.number() })),
  fields: z.array(z.object({ key: z.string(), label: z.string(), in_all: z.boolean() })),
  checks: z.array(
    z.object({
      key: z.string(),
      ok: z.boolean(),
      blocking: z.boolean(),
      live_only: z.boolean(),
      label: z.string(),
    }),
  ),
  audience: z.object({ sendable: z.number(), left_out: z.number(), duplicates: z.number() }),
  preview: z
    .object({
      index: z.number(),
      total: z.number(),
      email: z.string(),
      name: z.string(),
      list_id: z.string(),
      row_id: z.string().nullable(),
      subject: z.string(),
      html: z.string(),
      text: z.string(),
    })
    .nullable(),
  recipients: z.object({
    rows: z.array(
      z.object({
        email: z.string(),
        name: z.string(),
        list: z.string(),
        state: recipientState,
        reason: z.string(),
        at: z.string().nullable(),
      }),
    ),
    offset: z.number(),
    limit: z.number(),
    total: z.number(),
  }),
  key_set: z.boolean(),
  sent_today: z.number(),
  daily_cap: z.number(),
});
export type MergeMailingDetail = z.infer<typeof mailingDetailSchema>;

const peopleSchema = ok.extend({
  rows: z.array(
    z.object({
      email: z.string(),
      name: z.string(),
      list_id: z.string(),
      row_id: z.string(),
      cells: z.array(z.string()),
      picked: z.boolean(),
      kind: z.enum(["ok", "stopped", "held", "written", "missing"]),
      reason: z.string(),
    }),
  ),
  columns: z.array(z.object({ key: z.string(), label: z.string() })),
  offset: z.number(),
  limit: z.number(),
  total: z.number(),
  picked_total: z.number(),
});
export type MergePeople = z.infer<typeof peopleSchema>;

const outcomesSchema = ok.extend({
  name: z.string(),
  mode: z.enum(["live", "practice"]).nullable(),
  rows: z.array(
    z.object({
      email: z.string(),
      name: z.string(),
      list: z.string(),
      state: recipientState,
      reason: z.string(),
      at: z.string(),
    }),
  ),
});

const id = (value: string) => encodeURIComponent(value);

export const readMergeStatus = () => ask(statusSchema, "GET", "/status");
/** The key goes one way: to the sender, which checks it with the provider and keeps it. */
export const setProviderKey = (key: string) => ask(statusSchema, "POST", "/provider-key", { key });
export const clearProviderKey = () => ask(statusSchema, "POST", "/provider-key/clear", {});
export const checkProvider = () => ask(statusSchema, "POST", "/provider/check", {});
export const saveMergeSettings = (input: Record<string, unknown>) =>
  ask(statusSchema, "POST", "/settings", input);

export const readMergeLists = () => ask(listsSchema, "GET", "/lists");
export const importMergeList = (input: { name: string; file_name: string; text: string }) =>
  ask(importedSchema, "POST", "/lists/import", input);
export function readMergeList(
  listId: string,
  query: { offset?: number; q?: string; row?: string } = {},
) {
  const search = new URLSearchParams({ offset: String(query.offset ?? 0) });
  if (query.q) search.set("q", query.q);
  if (query.row) search.set("row", query.row);
  return ask(listDetailSchema, "GET", `/lists/${id(listId)}?${search.toString()}`);
}
export const addMergeRow = (listId: string, email: string, values: Record<string, string>) =>
  ask(ok.extend({ list: listSchema, row_id: z.string() }), "POST", `/lists/${id(listId)}/rows`, {
    email,
    values,
  });
export const updateMergeRow = (
  listId: string,
  rowId: string,
  input: { email: string; values: Record<string, string> },
) =>
  ask(
    ok.extend({ list: listSchema }),
    "POST",
    `/lists/${id(listId)}/rows/${id(rowId)}/update`,
    input,
  );
export const renameMergeList = (listId: string, name: string) =>
  ask(ok.extend({ list: listSchema }), "POST", `/lists/${id(listId)}/rename`, { name });
export const deleteMergeList = (listId: string) =>
  ask(ok.extend({ deleted: z.string() }), "POST", `/lists/${id(listId)}/delete`, {});
export const removeMergeRow = (listId: string, rowId: string) =>
  ask(ok.extend({ list: listSchema }), "POST", `/lists/${id(listId)}/rows/${id(rowId)}/remove`, {});

export const readMergeStops = (offset = 0) => ask(stopsSchema, "GET", `/stops?offset=${offset}`);
export const addMergeStops = (emails: string, reason: "manual" | "asked") =>
  ask(
    ok.extend({ added: z.number(), already: z.number(), refused: z.array(z.string()) }),
    "POST",
    "/stops/add",
    { emails, reason },
  );
export const removeMergeStop = (email: string) =>
  ask(ok.extend({ removed: z.string() }), "POST", "/stops/remove", { email });
export const syncMergeStops = () =>
  ask(ok.extend({ added: z.number(), seen: z.number() }), "POST", "/stops/sync", {});

export const readMergeMailings = () => ask(mailingsSchema, "GET", "/mailings");
export const createMergeMailing = (name: string) =>
  ask(mailingEnvelope, "POST", "/mailings", { name });
export function readMergeMailing(
  mailingId: string,
  query: { state?: string; offset?: number; preview?: number } = {},
) {
  const search = new URLSearchParams();
  if (query.state) search.set("state", query.state);
  if (query.offset) search.set("offset", String(query.offset));
  if (query.preview) search.set("preview", String(query.preview));
  const suffix = search.size > 0 ? `?${search.toString()}` : "";
  return ask(mailingDetailSchema, "GET", `/mailings/${id(mailingId)}${suffix}`);
}
export function readMergePeople(
  mailingId: string,
  query: { q?: string; offset?: number; view?: string } = {},
) {
  const search = new URLSearchParams({ offset: String(query.offset ?? 0) });
  if (query.q) search.set("q", query.q);
  if (query.view) search.set("view", query.view);
  return ask(peopleSchema, "GET", `/mailings/${id(mailingId)}/people?${search.toString()}`);
}
export const pickMergePeople = (
  mailingId: string,
  input: { emails: string[]; picked: boolean } | { all: true; picked: boolean; q: string },
) =>
  ask(
    ok.extend({ picked: z.number(), changed: z.number() }),
    "POST",
    `/mailings/${id(mailingId)}/pick`,
    input,
  );
export const addMergePeople = (
  mailingId: string,
  input: { emails: string; values: Record<string, string> },
) =>
  ask(
    ok.extend({
      added: z.number(),
      already: z.number(),
      stopped: z.number(),
      refused: z.array(z.string()),
    }),
    "POST",
    `/mailings/${id(mailingId)}/people`,
    input,
  );
export const readMergeOutcomes = (mailingId: string) =>
  ask(outcomesSchema, "GET", `/mailings/${id(mailingId)}/outcomes`);
export const updateMergeMailing = (mailingId: string, input: Record<string, unknown>) =>
  ask(mailingEnvelope, "POST", `/mailings/${id(mailingId)}/update`, input);
export const duplicateMergeMailing = (mailingId: string) =>
  ask(mailingEnvelope, "POST", `/mailings/${id(mailingId)}/duplicate`, {});
export const deleteMergeMailing = (mailingId: string) =>
  ask(ok.extend({ deleted: z.string() }), "POST", `/mailings/${id(mailingId)}/delete`, {});
export const testMergeMailing = (mailingId: string, to: string) =>
  ask(
    ok.extend({ to: z.string(), made_out_to: z.string() }),
    "POST",
    `/mailings/${id(mailingId)}/test`,
    {
      to,
    },
  );
export const startMergeMailing = (
  mailingId: string,
  input: { practice: true } | { practice: false; confirm: number },
) => ask(mailingEnvelope, "POST", `/mailings/${id(mailingId)}/start`, input);
export const pauseMergeMailing = (mailingId: string) =>
  ask(mailingEnvelope, "POST", `/mailings/${id(mailingId)}/pause`, {});
export const resumeMergeMailing = (mailingId: string) =>
  ask(mailingEnvelope, "POST", `/mailings/${id(mailingId)}/resume`, {});
export const cancelMergeMailing = (mailingId: string) =>
  ask(mailingEnvelope, "POST", `/mailings/${id(mailingId)}/cancel`, {});
