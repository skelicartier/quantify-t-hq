/**
 * What the Data host (main thread) and the Data worker say to each other.
 *
 * Every message is a plain object that `postMessage` can copy. Requests carry a number
 * `id`; every reply to a request repeats it. A request has one final reply (`answer` or
 * `send-file`), possibly preceded by one `receive-part` and one `engine` exchange or more.
 * The worker never sees the socket; the host never parses a file.
 */

/** Who is making a change: sent by the portal as `by` in every POST body. */
export type Staff = { staff_id: string; name: string };

export type DataState = "starting" | "ready" | "restarting" | "stopped";
export type ModuleState = { name: string; state: "ready" | "failed"; detail: string };
export type Progress = { done: number; total: number } | null;

/** A refusal as it travels: the status, Mail merge's code vocabulary, a sentence. */
export type RefusalBody = { status: number; code: string; message: string };

/** A file the host streams out for a request; `remove_after` for a build's one-off file. */
export type SendFile = {
  path: string;
  size: number;
  type: string;
  name: string;
  sha256: string;
  remove_after: boolean;
};

export type EngineCall = "addStops" | "removeStop" | "importList" | "status";
export const ENGINE_CALLS: readonly EngineCall[] = [
  "addStops",
  "removeStop",
  "importList",
  "status",
];

/**
 * What the worker writes down for a send by email, carried through the host untouched: the
 * host keeps it with what the provider said (`files/shares-sent.jsonl`), so a send that went
 * while the worker died is still written down when it is back.
 */
export type ShareRecord = {
  share_id: string;
  file_id: string;
  version_id: string;
  version_n: number;
  title: string;
  subject: string;
  by: Staff;
};

/**
 * A file sent by email ("Send by email" on a file's page). The worker has checked the
 * addresses, the stop list and the size, and names the stored bytes; the host reads the
 * provider key itself, reads the bytes and hands one message per address to the provider.
 */
export type ShareMail = {
  /** The stored bytes: always under `<dir>/data/files/blobs/`. */
  path: string;
  /** The attachment's name, and its size as the worker knows it. */
  name: string;
  size: number;
  to: string[];
  from_email: string;
  from_name: string;
  reply_to: string;
  subject: string;
  text: string;
  html: string;
  record?: ShareRecord;
};

/** What the provider said for each address, as the host saw it. */
export type ShareResult = { email: string; status: string; error_code: string };

export type ToWorker =
  | {
      type: "request";
      id: number;
      method: "GET" | "POST";
      path: string;
      query: string;
      body: Record<string, unknown>;
    }
  | { type: "engine-answer"; id: number; ok: true; value: Record<string, unknown> }
  | { type: "engine-answer"; id: number; ok: false; error: RefusalBody }
  | { type: "share-answer"; id: number; ok: true; value: Record<string, unknown> }
  | { type: "share-answer"; id: number; ok: false; error: RefusalBody }
  | { type: "part-written"; id: number; upload_id: string; index: number; bytes: number }
  | { type: "part-failed"; id: number; error: RefusalBody }
  /** After a missed deadline: the worker answers `pong` at once unless it is stuck. */
  | { type: "ping" }
  | { type: "stop" };

export type FromWorker =
  | { type: "answer"; id: number; status: number; body: Record<string, unknown> }
  | { type: "send-file"; id: number; file: SendFile }
  | { type: "receive-part"; id: number; target: string; max_bytes: number }
  | { type: "engine"; id: number; call: EngineCall; args: Record<string, unknown> }
  | { type: "share"; id: number; mail: ShareMail }
  | { type: "pong" }
  | {
      type: "state";
      state: DataState;
      detail: string;
      progress: Progress;
      modules: ModuleState[];
    };

/**
 * What the host hands the worker at start. `modules`, when given, is the only modules to
 * load (a test of Data with none of them); otherwise every one in `MODULES`.
 */
export type WorkerData = { dir: string; testRoutes: boolean; modules?: readonly string[] };

/** The largest file "Send by email" attaches: base64 grows it by a third, and 4 MB is the safe total. */
export const SHARE_MAX_BYTES = 3 * 1024 * 1024;

/** The sentences the host says for itself; the portal shows them as they are. */
export const HOST_MESSAGES = {
  data_starting: "Data is opening.",
  data_restarting: "Data is restarting after an error. Nothing was lost; try again in a moment.",
  data_stopped:
    "Data stopped after an error. It stopped five times in ten minutes, so it was left off.",
  data_slow: "Data took too long to answer. Nothing was lost; try again.",
  share_unknown:
    "It may have gone: Data stopped answering while it was sending. Look in “Shared by me” before you send it again.",
  not_stopped: "Data is running.",
  part_refused: "That part could not be read.",
  part_too_large: "That part is over 3 MiB.",
} as const;

export const PART_BYTES = 3_145_728;
