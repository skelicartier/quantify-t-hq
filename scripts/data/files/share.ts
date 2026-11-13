/**
 * Sharing a file from this Mac, in the two ways a portal on one laptop honestly can:
 * "Send by email" (the current version attached, sent through Mail merge's provider and
 * from its address) and the device's own share sheet. Both are written to
 * `files/shares.jsonl`, which "Shared by me" lists, and to the file's activity.
 *
 * The worker checks everything it can (the addresses, the stop list, the size, the secret
 * guard) and names the stored bytes; the host reads the provider key, which the worker
 * never sees, and does the sending. The host also keeps what the provider said
 * (`files/shares-sent.jsonl`): a send that went while the worker was restarting is written
 * down from there, once, when the worker is back.
 */

import { randomUUID } from "node:crypto";

import { Refused } from "../../mail-merge/engine";
import { wordsToHtml } from "../../mail-merge/template";
import type { Answer, DataCore } from "../core";
import { LIMITS, clean, cleanText, normaliseEmail, wholeNumber } from "../guard";
import { SHARE_MAX_BYTES, type ShareRecord, type ShareResult, type Staff } from "../protocol";
import { extensionOf } from "./sniff";
import { blobName, type FileMeta, type Vault } from "./vault";

export const SHARE_MAX_TO = 10;
const PAGE = 100;
/** The host's own note of each send by email it made (the worker reads it, never writes it). */
const SENT = "files/shares-sent.jsonl";

type HostNote = { record?: ShareRecord; to?: unknown; results?: unknown; at?: unknown };

export type ShareHow = "email" | "share_sheet";
export type ShareState = "sent" | "unknown" | "failed";

export type ShareLine = {
  share_id: string;
  file_id: string;
  version_id: string;
  how: ShareHow;
  to: string[];
  subject: string;
  by: Staff;
  at: string;
  result: ShareState;
  /** The title when it was shared, for a file deleted since. */
  title: string;
  version_n: number;
  results?: ShareResult[];
};

export type ShareRow = {
  share_id: string;
  file_id: string;
  title: string;
  /** False once the file was deleted forever. */
  file_here: boolean;
  version_n: number;
  how: ShareHow;
  to: string[];
  subject: string;
  by_name: string;
  at: string;
  result: ShareState;
};

/** The size in words, as the portal's `formatBytes` says it (binary units, one decimal). */
export function bytesInWords(value: number): string {
  if (value < 1024) return `${value} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let scaled = value / 1024;
  let unit = 0;
  while (scaled >= 1024 && unit < units.length - 1) {
    scaled /= 1024;
    unit += 1;
  }
  const rounded = scaled >= 10 ? Math.round(scaled) : Math.round(scaled * 10) / 10;
  return `${rounded} ${units[unit]}`;
}

/** "too large" in the addendum's words. */
export function tooLargeToAttach(bytes: number): string {
  return `This file is ${bytesInWords(bytes)}, too large to attach. Download it and send it from your mail app.`;
}

/** The addresses typed into "To": commas, semicolons or spaces between them. */
export function addressesOf(value: unknown): string[] {
  const raw = (Array.isArray(value) ? value : [value])
    .map((item) => (typeof item === "string" ? item : ""))
    .join(" ")
    .split(/[\s,;]+/)
    .map((item) => item.trim())
    .filter(Boolean);
  const out: string[] = [];
  for (const item of raw.slice(0, 50)) {
    const email = normaliseEmail(item.replace(/^<|>$/g, ""));
    if (!email)
      throw new Refused(400, "invalid", `“${item.slice(0, 80)}” is not an email address.`);
    if (!out.includes(email)) out.push(email);
  }
  if (out.length === 0) throw new Refused(400, "invalid", "Say who it goes to.");
  if (out.length > SHARE_MAX_TO)
    throw new Refused(400, "invalid", "Send it to ten addresses at most.");
  return out;
}

/** The name the attachment travels under: the title, keeping the original's extension. */
export function attachmentName(title: string, originalName: string): string {
  const extension = extensionOf(originalName);
  if (!extension || extensionOf(title) === extension) return title;
  return `${title}.${extension}`;
}

/** What the provider's refusal means, in words. */
function refusalInWords(code: string, status: string): string {
  if (status === "auth_failed")
    return "The provider refused the key in Mail merge's Setup. Nothing was sent.";
  if (code === "rate_limited")
    return "The provider is limiting sends just now. Nothing was sent; try again in a while.";
  if (code === "unreachable")
    return "The provider could not be reached. Nothing was sent; try again.";
  if (code === "invalid_parameter")
    return "The provider refused it: an address or the attachment was not accepted. Nothing was sent.";
  return `The provider refused it${code ? ` (${code})` : ""}. Nothing was sent.`;
}

export class Shares {
  readonly #core: DataCore;
  readonly #vault: Vault;
  #lines: ShareLine[] = [];
  readonly #ids = new Set<string>();
  /** How far the host's notes have been read. */
  #notesAt = 0;
  readonly #inflight = new Map<string, Promise<Answer>>();

  constructor(core: DataCore, vault: Vault) {
    this.#core = core;
    this.#vault = vault;
  }

  open(): void {
    this.#lines = this.#core.store
      .readLines<ShareLine>("files/shares.jsonl")
      .filter((line) => typeof line?.share_id === "string");
    for (const line of this.#lines) this.#ids.add(line.share_id);
    this.#catchUp();
  }

  /**
   * Sends the host made that this log does not have yet: the worker died or restarted while
   * the mail went, so it never heard the answer. Each is written down once, as it went.
   */
  #catchUp(): void {
    let read: { lines: HostNote[]; offset: number };
    try {
      read = this.#core.store.readLinesFrom<HostNote>(SENT, this.#notesAt);
    } catch {
      return;
    }
    this.#notesAt = read.offset;
    for (const note of read.lines) {
      const record = note?.record;
      if (!record || typeof record.share_id !== "string" || this.#ids.has(record.share_id))
        continue;
      const to = Array.isArray(note.to)
        ? note.to.filter((email): email is string => typeof email === "string")
        : [];
      const results = Array.isArray(note.results) ? (note.results as ShareResult[]) : [];
      this.#written(record, to, results, typeof note.at === "string" ? note.at : this.#core.now());
    }
  }

  count(): number {
    this.#catchUp();
    return this.#lines.length;
  }

  #row(line: ShareLine): ShareRow {
    const file = this.#vault.file(line.file_id);
    return {
      share_id: line.share_id,
      file_id: line.file_id,
      title: file?.title ?? line.title,
      file_here: file !== null,
      version_n: line.version_n,
      how: line.how,
      to: line.to,
      subject: line.subject,
      by_name: line.by.name,
      at: line.at,
      result: line.result,
    };
  }

  /** Newest first, a page at a time. */
  rows(offsetValue: unknown): { shares: ShareRow[]; total: number; offset: number } {
    this.#catchUp();
    const all = [...this.#lines].reverse();
    const offset = Math.max(0, wholeNumber(offsetValue, 0));
    return {
      shares: all.slice(offset, offset + PAGE).map((line) => this.#row(line)),
      total: all.length,
      offset,
    };
  }

  #record(line: ShareLine): void {
    this.#core.store.appendLine("files/shares.jsonl", line);
    this.#lines.push(line);
    this.#ids.add(line.share_id);
  }

  /** A send by email written down: the log line, and the file's activity. */
  #written(record: ShareRecord, to: string[], results: ShareResult[], at: string): ShareLine {
    const sent = results.filter((item) => item.status === "sent").map((item) => item.email);
    const unknown = results.filter((item) => item.status === "unknown").map((item) => item.email);
    // Sent when it went to anyone; "may have gone" when the provider did not say; else not sent.
    const result: ShareState = sent.length > 0 ? "sent" : unknown.length > 0 ? "unknown" : "failed";
    const line: ShareLine = {
      share_id: record.share_id,
      file_id: record.file_id,
      version_id: record.version_id,
      how: "email",
      to,
      subject: record.subject,
      by: record.by,
      at,
      result,
      title: record.title,
      version_n: record.version_n,
      results,
    };
    this.#record(line);
    if (this.#vault.file(record.file_id)) {
      if (sent.length > 0)
        this.#vault.log(
          record.file_id,
          `Sent by email to ${sent.join(", ")}`,
          record.subject,
          record.by,
        );
      if (unknown.length > 0)
        this.#vault.log(
          record.file_id,
          `May have been sent by email to ${unknown.join(", ")}`,
          record.subject,
          record.by,
        );
    }
    return line;
  }

  #mustShareable(file_id: string): FileMeta {
    const file = this.#vault.mustFile(file_id);
    if (file.trashed)
      throw new Refused(409, "invalid", "That file is in the trash. Restore it to share it.");
    return file;
  }

  /** "Send by email": one press sends once, even if it is pressed again while it goes. */
  email(
    file_id: string,
    body: Record<string, unknown>,
    by: Staff,
    attempt: string | null,
  ): Promise<Answer> {
    if (attempt) {
      const running = this.#inflight.get(attempt);
      if (running) return running;
    }
    const sending = this.#email(file_id, body, by);
    if (attempt) {
      this.#inflight.set(attempt, sending);
      void sending.finally(() => this.#inflight.delete(attempt)).catch(() => undefined);
    }
    return sending;
  }

  async #email(file_id: string, body: Record<string, unknown>, by: Staff): Promise<Answer> {
    const file = this.#mustShareable(file_id);
    const version = this.#vault.current(file);
    if (version.bytes > SHARE_MAX_BYTES)
      throw new Refused(400, "too_large", tooLargeToAttach(version.bytes));
    const to = addressesOf(body.to);
    const subject = cleanText(body.subject, LIMITS.subject) || file.title.slice(0, LIMITS.subject);
    const words = cleanText(body.message, LIMITS.message) || `Please find ${file.title} attached.`;
    // The stop list is Mail merge's own, read fresh: nobody on it is written to from here either.
    this.#core.sender.poll();
    const stopped = to.find((email) => this.#core.sender.isStopped(email));
    if (stopped) throw new Refused(409, "stopped", `${stopped} is on the stop list.`);
    const settings = this.#core.sender.settings();
    if (!settings.from_email)
      throw new Refused(
        400,
        "no_sender",
        "Mail merge has no address to send from yet. Set one in Mail merge's Setup first.",
      );
    if (!this.#core.store.exists(blobName(version.sha256)))
      throw new Refused(
        409,
        "invalid",
        "This file's bytes are missing from this Mac; check every file.",
      );
    const record: ShareRecord = {
      share_id: randomUUID(),
      file_id: file.file_id,
      version_id: version.version_id,
      version_n: version.n,
      title: file.title,
      subject,
      by,
    };
    let results: ShareResult[];
    let slow = false;
    try {
      const answer = await this.#core.share({
        path: this.#core.store.path(blobName(version.sha256)),
        name: attachmentName(file.title, version.original_name),
        size: version.bytes,
        to,
        from_email: settings.from_email,
        from_name: settings.from_name,
        reply_to: settings.reply_to,
        subject,
        text: words,
        html: wordsToHtml(words),
        record,
      });
      results = Array.isArray(answer.results) ? (answer.results as ShareResult[]) : [];
    } catch (error) {
      if (!(error instanceof Refused) || error.code !== "share_slow") throw error;
      slow = true;
      results = to.map((email) => ({ email, status: "unknown", error_code: "timeout" }));
    }
    const sent = results.filter((item) => item.status === "sent").map((item) => item.email);
    const unknown = results.filter((item) => item.status === "unknown").map((item) => item.email);
    const failed = results.filter((item) => item.status !== "sent" && item.status !== "unknown");
    // Written down once: the host's note may have been read in already (a listing came first).
    const line =
      this.#lines.find((item) => item.share_id === record.share_id) ??
      this.#written(record, to, results, this.#core.now());
    const parts: string[] = [];
    if (sent.length > 0) parts.push(`Sent to ${sent.join(", ")}.`);
    if (unknown.length > 0)
      parts.push(
        slow || sent.length === 0
          ? "It may have gone: the provider did not answer in time."
          : `It may have gone to ${unknown.join(", ")}: the provider did not answer in time.`,
      );
    if (failed.length > 0) {
      const first = failed[0]!;
      const words = refusalInWords(first.error_code, first.status);
      parts.push(
        sent.length > 0 || unknown.length > 0
          ? `Not sent to ${failed.map((item) => item.email).join(", ")}: ${words}`
          : words,
      );
    }
    return {
      share: this.#row(line),
      message: parts.join(" "),
      sent: sent.length,
      failed: failed.length,
    };
  }

  /** The device's share sheet opened and finished: written down, the addresses unknown. */
  sheet(file_id: string, by: Staff): Answer {
    const file = this.#mustShareable(file_id);
    const version = this.#vault.current(file);
    const line: ShareLine = {
      share_id: randomUUID(),
      file_id: file.file_id,
      version_id: version.version_id,
      how: "share_sheet",
      to: [],
      subject: clean(file.title, LIMITS.subject),
      by,
      at: this.#core.now(),
      result: "sent",
      title: file.title,
      version_n: version.n,
    };
    this.#record(line);
    this.#vault.log(file.file_id, "Shared with the share sheet", "", by);
    return { share: this.#row(line) };
  }
}
