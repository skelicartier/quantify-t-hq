/**
 * The statements book (ws-notes/duties/spec.md §9.2, §9.4): accounts, statements and their
 * lines on disk under `data/statements/`, the two-step import, withdrawing, and the edit log.
 *
 * A statement's own file is written 0600 under `statements/files/` beside and renamed into
 * place, exactly as the people ledger keeps its copies. Nothing here goes through Files:
 * Files reads text out of what it is given, and a statement must never be in search. The
 * edit log (`edits.jsonl`) is written before the record it describes, each line chained to
 * the one before by its hash, so nothing is changed silently and nothing is deleted.
 */

import { createHash, randomUUID } from "node:crypto";
import { closeSync, fsyncSync, openSync, renameSync, rmSync } from "node:fs";
import { dirname } from "node:path";

import { Refused } from "../../mail-merge/engine";
import { dayWords } from "../../../src/lib/data/labels-company";
import { isDutyCurrency, minorOf } from "../../../src/lib/data/labels-duties";
import {
  NOT_A_STATEMENT_WORDS,
  TOO_LARGE_WORDS,
  accountLabel,
  alreadyImportedWords,
  exactWords,
  rangeWords,
  takeBackFirstWords,
} from "../../../src/lib/data/labels-statements";
import type { DataCore } from "../core";
import { editLineText, periodOf, type EditLine, type MonthLock } from "../duties-contracts";
import { clean, cleanText, isDay } from "../guard";
import type { Staff } from "../protocol";
import { syncFolder, writeAll } from "../store";
import { historyOf, type AccountHistory } from "./cash";
import {
  ACCOUNTS,
  ACCOUNT_NAME_MAX,
  BANK_NAME_MAX,
  EDITS,
  EVENTS,
  FILES_FOLDER,
  FILE_NAME_MAX,
  IMPORT_KEEP_MS,
  LINES_FOLDER,
  PREVIEW_ROWS,
  STATEMENTS,
  STATEMENT_MAX_BYTES,
  WHY_MAX,
  WHY_MIN,
} from "./limits";
import { addsUpOf, closingFrom, fingerprintsOf, movementOf, openingFromLines } from "./lines";
import { DATE_FORMATS, DELIMITERS, parseDelimited } from "./parse-csv";
import { looksLikeOfx, parseOfx } from "./parse-ofx";
import type {
  Account,
  AddsUp,
  CsvMapping,
  Line,
  Parsed,
  ReadLine,
  Statement,
  StoredFile,
} from "./types";

// ------------------------------------------------------------------ the edit log

/** An append-only log of a finance record's changes, each line hashed onto the one before. */
export class EditLog {
  readonly #core: DataCore;
  readonly #name: string;
  #n = 0;
  #hash = "";

  constructor(core: DataCore, name: string) {
    this.#core = core;
    this.#name = name;
    const last = core.store
      .readLines<EditLine>(name)
      .filter((line) => typeof line?.n === "number")
      .at(-1);
    this.#n = last?.n ?? 0;
    this.#hash = last?.hash ?? "";
  }

  append(input: Omit<EditLine, "n" | "at" | "hash">): EditLine {
    const line: Omit<EditLine, "hash"> = { ...input, n: this.#n + 1, at: this.#core.now() };
    const hash = createHash("sha256").update(editLineText(this.#hash, line)).digest("hex");
    const full: EditLine = { ...line, hash };
    this.#core.store.appendLine(this.#name, full);
    this.#n = full.n;
    this.#hash = hash;
    return full;
  }

  lines(id?: string): EditLine[] {
    const all = this.#core.store.readLines<EditLine>(this.#name);
    return id === undefined ? all : all.filter((line) => line.id === id);
  }
}

/** Whether every line of a log hashes onto the one before it. */
export function chainHolds(lines: readonly EditLine[]): boolean {
  let previous = "";
  for (const line of lines) {
    const { hash, ...rest } = line;
    if (createHash("sha256").update(editLineText(previous, rest)).digest("hex") !== hash)
      return false;
    previous = hash;
  }
  return true;
}

// ------------------------------------------------------------------ private files

/** Bytes written 0600 beside the target, synced, then renamed into place. */
export function writePrivate(core: DataCore, name: string, bytes: Uint8Array): void {
  const target = core.store.path(name);
  core.store.ensureDir(dirname(name));
  const beside = `${target}.writing`;
  const fd = openSync(beside, "w", 0o600);
  try {
    writeAll(fd, bytes);
    fsyncSync(fd);
    closeSync(fd);
  } catch (error) {
    closeSync(fd);
    rmSync(beside, { force: true });
    throw error;
  }
  renameSync(beside, target);
  syncFolder(dirname(target));
}

const sha256Of = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

/** A signed amount he types ("-1,180.50" too): minor units, or null. */
export function signedMinorOf(value: unknown): number | null {
  const text = String(value ?? "").trim();
  const negative = /^[-−]/.test(text);
  const minor = minorOf(negative ? text.slice(1) : text);
  return minor === null ? null : negative ? -minor : minor;
}

// ------------------------------------------------------------------ the import, as previewed

type Pending = {
  import_id: string;
  account_id: string;
  name: string;
  sha256: string;
  bytes: number;
  at: number;
};

export type Preview = {
  import_id: string;
  source: "delimited" | "ofx";
  mapping: CsvMapping | null;
  header: string[];
  day_first_chosen: boolean;
  rows: ReadLine[];
  from: string;
  to: string;
  lines: number;
  already_here: number;
  ignored_rows: number;
  opening_minor: number | null;
  closing_minor: number | null;
  adds_up: AddsUp;
  locked_months: string[];
  already_imported_on: string | null;
};

/** A mapping he sent from the preview's pickers, checked; null when none or not whole. */
export function mappingOf(value: unknown): CsvMapping | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const given = value as Record<string, unknown>;
  const index = (item: unknown) =>
    typeof item === "number" && Number.isInteger(item) && item >= 0 && item < 200 ? item : null;
  const optional = (item: unknown) => (item === null || item === undefined ? null : index(item));
  const delimiter = DELIMITERS.find((item) => item === given.delimiter);
  const format = DATE_FORMATS.find((item) => item === given.date_format);
  const headerRow = index(given.header_row);
  const date = index(given.date);
  const narration = given.narration === -1 ? -1 : index(given.narration);
  const amount = given.amount as Record<string, unknown> | undefined;
  if (!delimiter || !format || headerRow === null || date === null || narration === null)
    return null;
  if (!amount || typeof amount !== "object") return null;
  let columns: CsvMapping["amount"] | null = null;
  if (amount.style === "two_columns") {
    const debit = index(amount.debit);
    const credit = index(amount.credit);
    if (debit !== null && credit !== null && debit !== credit)
      columns = { style: "two_columns", debit, credit };
  } else if (amount.style === "signed") {
    const column = index(amount.column);
    if (column !== null) columns = { style: "signed", column };
  } else if (amount.style === "marker") {
    const column = index(amount.column);
    const marker = index(amount.marker);
    if (column !== null && marker !== null && column !== marker)
      columns = { style: "marker", column, marker };
  }
  if (!columns) return null;
  return {
    delimiter,
    header_row: headerRow,
    date,
    date_format: format,
    narration,
    reference: optional(given.reference),
    amount: columns,
    balance: optional(given.balance),
  };
}

const extensionOf = (name: string, source: "delimited" | "ofx") => {
  const match = /\.(csv|txt|tsv|ofx|qfx)$/i.exec(name);
  return match ? match[1]!.toLowerCase() : source === "ofx" ? "ofx" : "csv";
};

// ------------------------------------------------------------------ the book

export class StatementsBook {
  readonly #core: DataCore;
  readonly edits: EditLog;
  accounts: Account[];
  statements: Statement[];
  readonly #lines = new Map<string, Line[]>();
  readonly #pending = new Map<string, Pending>();

  constructor(core: DataCore) {
    this.#core = core;
    core.store.ensureDir(FILES_FOLDER);
    core.store.ensureDir(LINES_FOLDER);
    const accounts = core.store.readJson<{ accounts?: Account[] }>(ACCOUNTS, {});
    this.accounts = Array.isArray(accounts.accounts)
      ? accounts.accounts.filter((account) => typeof account?.account_id === "string")
      : [];
    const statements = core.store.readJson<{ statements?: Statement[] }>(STATEMENTS, {});
    this.statements = Array.isArray(statements.statements)
      ? statements.statements.filter((statement) => typeof statement?.statement_id === "string")
      : [];
    for (const account of this.accounts) {
      const stored = core.store.readJson<{ lines?: Line[] }>(
        `${LINES_FOLDER}/${account.account_id}.json`,
        {},
      );
      this.#lines.set(
        account.account_id,
        Array.isArray(stored.lines)
          ? stored.lines.filter((line) => typeof line?.line_id === "string")
          : [],
      );
    }
    this.edits = new EditLog(core, EDITS);
  }

  // ---------------------------------------------------------------- reads

  account(id: string | undefined): Account {
    const account = id ? this.accounts.find((item) => item.account_id === id) : undefined;
    if (!account) throw new Refused(404, "not_found", "That account is not here.");
    return account;
  }

  statement(id: string | undefined): Statement {
    const statement = id ? this.statements.find((item) => item.statement_id === id) : undefined;
    if (!statement) throw new Refused(404, "not_found", "That statement is not here.");
    return statement;
  }

  linesOf(accountId: string): Line[] {
    return this.#lines.get(accountId) ?? [];
  }

  allLines(): Line[] {
    return [...this.#lines.values()].flat();
  }

  line(id: string | undefined): Line {
    for (const lines of this.#lines.values()) {
      const line = id ? lines.find((item) => item.line_id === id) : undefined;
      if (line) return line;
    }
    throw new Refused(404, "not_found", "That line is not here.");
  }

  histories(): AccountHistory[] {
    return this.accounts.map((account) =>
      historyOf(account, this.statements, this.linesOf(account.account_id)),
    );
  }

  /** The earliest day any live statement covers, or null. */
  firstDay(): string | null {
    return this.statements
      .filter((statement) => !statement.withdrawn)
      .reduce<string | null>(
        (first, statement) => (first === null || statement.from < first ? statement.from : first),
        null,
      );
  }

  // ---------------------------------------------------------------- writes

  saveAccounts(): void {
    this.#core.store.writeJson(ACCOUNTS, { format: 1, accounts: this.accounts });
  }

  saveStatements(): void {
    this.#core.store.writeJson(STATEMENTS, { format: 1, statements: this.statements });
  }

  saveLines(accountId: string): void {
    this.#core.store.writeJson(`${LINES_FOLDER}/${accountId}.json`, {
      format: 1,
      lines: this.linesOf(accountId),
    });
  }

  event(verb: string, detail: string, by: Staff): void {
    this.#core.store.appendLine(EVENTS, {
      event_id: randomUUID(),
      verb,
      detail,
      by,
      at: this.#core.now(),
    });
  }

  // ---------------------------------------------------------------- accounts

  accountFields(body: Record<string, unknown>, base: Account | null) {
    const has = (key: string) => body[key] !== undefined;
    const name = has("name") ? cleanText(body.name, ACCOUNT_NAME_MAX) : (base?.name ?? "");
    if (!name) throw new Refused(400, "invalid", "Name the account, such as “Current account”.");
    const kind = has("kind") ? clean(body.kind, 10) : (base?.kind ?? "bank");
    if (kind !== "bank" && kind !== "card")
      throw new Refused(400, "invalid", "Choose a bank account or a card.");
    const bank = has("bank") ? cleanText(body.bank, BANK_NAME_MAX) : (base?.bank ?? "");
    const last4 = has("last4") ? clean(body.last4, 40).replace(/\s+/g, "") : (base?.last4 ?? "");
    if (!/^\d{4}$/.test(last4))
      throw new Refused(
        400,
        "invalid",
        "Type only the last four digits of the account or card number; the full number is never kept.",
      );
    const currency = has("currency")
      ? clean(body.currency, 3).toUpperCase()
      : (base?.currency ?? "INR");
    if (!isDutyCurrency(currency))
      throw new Refused(400, "invalid", "Choose the account's currency.");
    if (
      base &&
      currency !== base.currency &&
      this.statements.some((s) => s.account_id === base.account_id)
    )
      throw new Refused(409, "invalid", "An account with statements keeps its currency.");
    let opening = base?.opening ?? null;
    if (has("opening_on") || has("opening_balance")) {
      const on = clean(body.opening_on, 10);
      const typed = clean(body.opening_balance, 40);
      if (!on && !typed) opening = null;
      else {
        if (!isDay(on))
          throw new Refused(400, "invalid", "Choose the day the opening balance is for.");
        const balance = signedMinorOf(typed);
        if (balance === null)
          throw new Refused(
            400,
            "invalid",
            "Type the opening balance as a number, such as 410000.00.",
          );
        opening = { on, balance_minor: balance };
      }
    }
    return { name, kind: kind as Account["kind"], bank, last4, currency, opening };
  }

  addAccount(body: Record<string, unknown>, by: Staff): Account {
    const fields = this.accountFields(body, null);
    const now = this.#core.now();
    const account: Account = {
      account_id: randomUUID(),
      ...fields,
      closed_on: null,
      mapping: null,
      created_at: now,
      created_by: by,
      updated_at: now,
      updated_by: by,
    };
    this.edits.append({
      record: "account",
      id: account.account_id,
      verb: "added",
      changes: [{ field: "name", before: "", after: accountLabel(account) }],
      by,
    });
    this.accounts.push(account);
    this.#lines.set(account.account_id, []);
    this.saveAccounts();
    this.saveLines(account.account_id);
    this.event("Account added", account.account_id, by);
    return account;
  }

  updateAccount(account: Account, body: Record<string, unknown>, by: Staff): Account {
    const fields = this.accountFields(body, account);
    const changes = (Object.keys(fields) as (keyof typeof fields)[])
      .filter((key) => JSON.stringify(fields[key]) !== JSON.stringify(account[key]))
      .map((key) => ({
        field: key,
        before: JSON.stringify(account[key]),
        after: JSON.stringify(fields[key]),
      }));
    if (changes.length === 0) return account;
    this.edits.append({ record: "account", id: account.account_id, verb: "changed", changes, by });
    Object.assign(account, fields, { updated_at: this.#core.now(), updated_by: by });
    this.saveAccounts();
    return account;
  }

  closeAccount(account: Account, body: Record<string, unknown>, by: Staff, today: string): Account {
    const on = clean(body.closed_on, 10) || today;
    if (!isDay(on)) throw new Refused(400, "invalid", "Choose the day it was closed.");
    if (on > today) throw new Refused(400, "invalid", "That day is still to come.");
    this.edits.append({
      record: "account",
      id: account.account_id,
      verb: "closed",
      changes: [{ field: "closed_on", before: account.closed_on ?? "", after: on }],
      by,
    });
    account.closed_on = on;
    account.updated_at = this.#core.now();
    account.updated_by = by;
    this.saveAccounts();
    return account;
  }

  // ---------------------------------------------------------------- the import

  #parse(account: Account, bytes: Uint8Array, name: string, mapping: CsvMapping | null): Parsed {
    if (looksLikeOfx(bytes, name)) return parseOfx(bytes, { name, currency: account.currency });
    return parseDelimited(bytes, {
      name,
      mapping: mapping ?? account.mapping,
      strict: mapping !== null,
    });
  }

  #sweep(): void {
    const cutoff = Date.now() - IMPORT_KEEP_MS;
    for (const [id, pending] of this.#pending)
      if (pending.at < cutoff) {
        this.#pending.delete(id);
        this.#core.store.remove(`tmp/import-${id}`);
      }
  }

  /** Step 1: keep the bytes under core's `tmp/` and say what they read as. */
  preview(
    account: Account,
    body: Record<string, unknown>,
    lock: MonthLock | null,
  ):
    | Preview
    | {
        import_id: string;
        refused: string;
        header: string[];
        mapping: Partial<CsvMapping> | null;
      } {
    this.#sweep();
    let pending: Pending;
    let bytes: Uint8Array;
    const givenId = clean(body.import_id, 64);
    if (givenId) {
      const known = this.#pending.get(givenId);
      const kept = known ? this.#core.store.readBytes(`tmp/import-${givenId}`) : null;
      if (!known || !kept || known.account_id !== account.account_id)
        throw new Refused(
          404,
          "not_found",
          "That import is no longer here. Choose the file again.",
        );
      pending = known;
      bytes = kept;
    } else {
      const content = typeof body.content === "string" ? body.content : "";
      bytes = Buffer.from(content, "base64");
      if (bytes.length === 0) throw new Refused(400, "empty", "Choose the statement's file.");
      if (bytes.length > STATEMENT_MAX_BYTES) throw new Refused(400, "too_large", TOO_LARGE_WORDS);
      const name = clean(body.name, FILE_NAME_MAX).replace(/[\\/]/g, "_") || "statement.csv";
      pending = {
        import_id: randomUUID(),
        account_id: account.account_id,
        name,
        sha256: sha256Of(bytes),
        bytes: bytes.length,
        at: Date.now(),
      };
      this.#core.store.ensureDir("tmp");
      writePrivate(this.#core, `tmp/import-${pending.import_id}`, bytes);
      this.#pending.set(pending.import_id, pending);
    }
    const parsed = this.#parse(account, bytes, pending.name, mappingOf(body.mapping));
    if (!parsed.ok) {
      if (parsed.header)
        return {
          import_id: pending.import_id,
          refused: parsed.words,
          header: parsed.header,
          mapping: parsed.mapping ?? null,
        };
      throw new Refused(400, "unreadable", parsed.words || NOT_A_STATEMENT_WORDS);
    }
    return this.#previewOf(account, pending, parsed, lock);
  }

  #previewOf(
    account: Account,
    pending: Pending,
    parsed: Extract<Parsed, { ok: true }>,
    lock: MonthLock | null,
  ): Preview {
    const fingerprints = fingerprintsOf(account.account_id, parsed.lines);
    const here = new Set(
      this.linesOf(account.account_id)
        .filter((line) => !line.withdrawn)
        .map((line) => line.fingerprint),
    );
    const fresh = parsed.lines.filter((_, index) => !here.has(fingerprints[index]!));
    const first = parsed.lines[0]!.posted_on;
    const last = parsed.lines.at(-1)!.posted_on;
    const from = parsed.from && parsed.from < first ? parsed.from : first;
    const to = parsed.to && parsed.to > last ? parsed.to : last;
    const opening = this.#openingOf(account, parsed, from, null);
    const closing =
      parsed.closing_minor ??
      parsed.lines.at(-1)!.balance_minor ??
      (opening === null ? null : closingFrom(opening, parsed.lines));
    const months = [...new Set(fresh.map((line) => periodOf(line.posted_on)))].sort();
    const same = this.statements.find(
      (statement) => statement.file.sha256 === pending.sha256 && !statement.withdrawn,
    );
    return {
      import_id: pending.import_id,
      source: parsed.source,
      mapping: parsed.mapping,
      header: parsed.header,
      day_first_chosen: parsed.day_first_chosen,
      rows: parsed.lines.slice(0, PREVIEW_ROWS),
      from,
      to,
      lines: parsed.lines.length,
      already_here: parsed.lines.length - fresh.length,
      ignored_rows: parsed.ignored_rows,
      opening_minor: opening,
      closing_minor: closing,
      adds_up: addsUpOf(opening, parsed.lines, account.currency),
      locked_months: lock ? months.filter((month) => lock.isLocked(month)) : [],
      already_imported_on: same ? same.imported_at.slice(0, 10) : null,
    };
  }

  /**
   * The balance at the start of `from`: the file's own (from its first line's balance, or an
   * OFX file's closing less its lines), else the statement before it when it ends the day
   * before, else the account's opening figure for that day, else what he typed; null if none.
   */
  #openingOf(
    account: Account,
    parsed: Extract<Parsed, { ok: true }>,
    from: string,
    typed: number | null,
  ): number | null {
    const own = openingFromLines(parsed.lines);
    if (own !== null) return own;
    if (parsed.closing_minor !== null)
      return parsed.closing_minor - parsed.lines.reduce((sum, line) => sum + movementOf(line), 0);
    const before = this.statements
      .filter(
        (statement) =>
          statement.account_id === account.account_id &&
          !statement.withdrawn &&
          statement.closing_minor !== null &&
          statement.to < from,
      )
      .sort((a, b) => b.to.localeCompare(a.to))[0];
    if (before && before.closing_minor !== null) {
      const next = new Date(`${before.to}T00:00:00Z`);
      next.setUTCDate(next.getUTCDate() + 1);
      if (next.toISOString().slice(0, 10) === from) return before.closing_minor;
    }
    if (account.opening && account.opening.on === from) return account.opening.balance_minor;
    return typed;
  }

  /** Step 2: the lines go in, the file is kept, the mapping is remembered. */
  import(
    account: Account,
    body: Record<string, unknown>,
    by: Staff,
    today: string,
    lock: MonthLock | null,
  ): { statement: Statement; added: number; skipped: number } {
    const id = clean(body.import_id, 64);
    const pending = id ? this.#pending.get(id) : undefined;
    const bytes = pending ? this.#core.store.readBytes(`tmp/import-${pending.import_id}`) : null;
    if (!pending || !bytes || pending.account_id !== account.account_id)
      throw new Refused(404, "not_found", "That import is no longer here. Choose the file again.");
    const same = this.statements.find(
      (statement) => statement.file.sha256 === pending.sha256 && !statement.withdrawn,
    );
    if (same)
      throw new Refused(409, "already_here", alreadyImportedWords(same.imported_at.slice(0, 10)));
    const parsed = this.#parse(account, bytes, pending.name, mappingOf(body.mapping));
    if (!parsed.ok) throw new Refused(400, "unreadable", parsed.words);
    const first = parsed.lines[0]!.posted_on;
    const last = parsed.lines.at(-1)!.posted_on;
    const fromGiven = clean(body.from, 10);
    const toGiven = clean(body.to, 10);
    const from = fromGiven || (parsed.from && parsed.from < first ? parsed.from : first);
    const to = toGiven || (parsed.to && parsed.to > last ? parsed.to : last);
    if (!isDay(from) || !isDay(to)) throw new Refused(400, "invalid", "Choose the days it covers.");
    if (from > first || to < last)
      throw new Refused(
        400,
        "invalid",
        `The days it covers must hold every line: ${rangeWords(first, last)} at least.`,
      );
    if (to > today)
      throw new Refused(400, "invalid", "A statement cannot cover days still to come.");
    const fingerprints = fingerprintsOf(account.account_id, parsed.lines);
    const here = new Set(
      this.linesOf(account.account_id)
        .filter((line) => !line.withdrawn)
        .map((line) => line.fingerprint),
    );
    const fresh = parsed.lines
      .map((line, index) => ({ line, index, fingerprint: fingerprints[index]! }))
      .filter((item) => !here.has(item.fingerprint));
    const locked = lock
      ? fresh.map((item) => periodOf(item.line.posted_on)).find((month) => lock.isLocked(month))
      : undefined;
    if (locked && lock) throw new Refused(409, "month_locked", lock.refusal(locked));
    let typed: number | null = null;
    if (clean(body.opening_minor, 40) || typeof body.opening_minor === "number") {
      typed =
        typeof body.opening_minor === "number" && Number.isSafeInteger(body.opening_minor)
          ? body.opening_minor
          : signedMinorOf(body.opening_minor);
      if (typed === null)
        throw new Refused(
          400,
          "invalid",
          "Type the opening balance as a number, such as 410000.00.",
        );
    }
    const opening = this.#openingOf(account, parsed, from, typed);
    if (opening === null)
      throw new Refused(
        400,
        "opening_needed",
        `This file gives no balances: type what the account held at the start of ${dayWords(from)}.`,
      );
    const closing =
      parsed.closing_minor ??
      parsed.lines.at(-1)!.balance_minor ??
      closingFrom(opening, parsed.lines);
    const statement_id = randomUUID();
    const extension = extensionOf(pending.name, parsed.source);
    const stored = `${statement_id}.${extension}`;
    const file: StoredFile = {
      stored,
      original_name: pending.name,
      bytes: bytes.length,
      sha256: pending.sha256,
    };
    const statement: Statement = {
      statement_id,
      account_id: account.account_id,
      from,
      to,
      source: parsed.source,
      file,
      copy: null,
      opening_minor: opening,
      closing_minor: closing,
      lines: fresh.length,
      skipped: parsed.lines.length - fresh.length,
      ignored_rows: parsed.ignored_rows,
      adds_up: addsUpOf(opening, parsed.lines, account.currency),
      imported_at: this.#core.now(),
      imported_by: by,
      withdrawn: null,
    };
    this.edits.append({
      record: "statement",
      id: statement_id,
      verb: "imported",
      changes: [
        { field: "account", before: "", after: accountLabel(account) },
        { field: "days", before: "", after: rangeWords(from, to) },
        { field: "lines", before: "", after: String(fresh.length) },
        { field: "closing", before: "", after: exactWords(closing, account.currency) },
      ],
      by,
    });
    writePrivate(this.#core, `${FILES_FOLDER}/${stored}`, bytes);
    const lines = this.linesOf(account.account_id);
    for (const item of fresh)
      lines.push({
        line_id: randomUUID(),
        account_id: account.account_id,
        statement_id,
        n: item.index + 1,
        posted_on: item.line.posted_on,
        direction: item.line.direction,
        amount_minor: item.line.amount_minor,
        balance_minor: item.line.balance_minor,
        narration: item.line.narration,
        reference: item.line.reference,
        fingerprint: item.fingerprint,
        category_id: null,
        match: null,
        note: "",
        sorted_at: null,
        sorted_by: null,
        withdrawn: false,
      });
    this.#lines.set(account.account_id, lines);
    this.saveLines(account.account_id);
    this.statements.push(statement);
    this.saveStatements();
    if (parsed.mapping) {
      account.mapping = parsed.mapping;
      account.updated_at = this.#core.now();
      account.updated_by = by;
      this.saveAccounts();
    }
    this.#pending.delete(pending.import_id);
    this.#core.store.remove(`tmp/import-${pending.import_id}`);
    this.event("Statement imported", statement_id, by);
    return { statement, added: fresh.length, skipped: statement.skipped };
  }

  /** A statement is withdrawn, never deleted: its lines stay, marked, counted nowhere. */
  withdraw(
    statement: Statement,
    body: Record<string, unknown>,
    by: Staff,
    lock: MonthLock | null,
  ): Statement {
    if (statement.withdrawn) return statement;
    const why = cleanText(body.why, WHY_MAX);
    if (why.length < WHY_MIN)
      throw new Refused(400, "invalid", "Say why it is withdrawn, in 5 to 300 characters.");
    const lines = this.linesOf(statement.account_id).filter(
      (line) => line.statement_id === statement.statement_id,
    );
    // A locked month first: its matches cannot be taken back until it is reopened either.
    if (lock) {
      const months = new Set([
        periodOf(statement.from),
        periodOf(statement.to),
        ...lines.map((line) => periodOf(line.posted_on)),
      ]);
      const locked = [...months].sort().find((month) => lock.isLocked(month));
      if (locked) throw new Refused(409, "month_locked", lock.refusal(locked));
    }
    const matched = lines.filter((line) => line.match !== null).length;
    if (matched > 0) throw new Refused(409, "matched", takeBackFirstWords(matched));
    this.edits.append({
      record: "statement",
      id: statement.statement_id,
      verb: "withdrawn",
      changes: [{ field: "why", before: "", after: why }],
      by,
    });
    statement.withdrawn = { at: this.#core.now(), by, why };
    for (const line of lines) line.withdrawn = true;
    this.saveLines(statement.account_id);
    this.saveStatements();
    this.event("Statement withdrawn", statement.statement_id, by);
    return statement;
  }

  /** The bank's own PDF beside a statement: kept, never read for lines. */
  addCopy(statement: Statement, body: Record<string, unknown>, by: Staff): Statement {
    if (statement.copy)
      throw new Refused(
        409,
        "already_here",
        "This statement already has the bank's PDF beside it.",
      );
    const content = typeof body.content === "string" ? body.content : "";
    const bytes = Buffer.from(content, "base64");
    if (bytes.length === 0) throw new Refused(400, "empty", "Choose the bank's PDF.");
    if (bytes.length > STATEMENT_MAX_BYTES) throw new Refused(400, "too_large", TOO_LARGE_WORDS);
    if (!(bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46))
      throw new Refused(400, "invalid", "Add the bank's PDF here: that file is not a PDF.");
    const name = clean(body.name, FILE_NAME_MAX).replace(/[\\/]/g, "_") || "statement.pdf";
    const stored = `${statement.statement_id}.copy.pdf`;
    this.edits.append({
      record: "statement",
      id: statement.statement_id,
      verb: "copy added",
      changes: [{ field: "copy", before: "", after: name }],
      by,
    });
    writePrivate(this.#core, `${FILES_FOLDER}/${stored}`, bytes);
    statement.copy = { stored, original_name: name, bytes: bytes.length, sha256: sha256Of(bytes) };
    this.saveStatements();
    return statement;
  }

  /** Test routes only: the walk's account takes a fixed id, so the harness can open its lines. */
  pin(fromId: string, toId: string): Account {
    const already = this.accounts.find((item) => item.account_id === toId);
    if (already) return already;
    const account = this.account(fromId);
    const lines = this.linesOf(fromId);
    account.account_id = toId;
    for (const line of lines) line.account_id = toId;
    for (const statement of this.statements)
      if (statement.account_id === fromId) statement.account_id = toId;
    this.#lines.delete(fromId);
    this.#lines.set(toId, lines);
    this.saveAccounts();
    this.saveStatements();
    this.saveLines(toId);
    this.#core.store.remove(`${LINES_FOLDER}/${fromId}.json`);
    return account;
  }

  /** "Walk Bank current 2026-10-01 to 2026-10-31.csv": how the pack and the download name it. */
  fileName(statement: Statement, which: "file" | "copy"): string {
    const account = this.accounts.find((item) => item.account_id === statement.account_id);
    const base = `${account?.name ?? "Account"} ${statement.from} to ${statement.to}`.replace(
      /[\\/:*?"<>|]/g,
      "_",
    );
    const stored = which === "copy" ? statement.copy?.stored : statement.file.stored;
    const extension = which === "copy" ? "pdf" : (stored?.split(".").pop() ?? "csv");
    return `${base}.${extension}`;
  }
}
