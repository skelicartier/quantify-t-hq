/**
 * The tools book (ws-notes/security/spec.md §6.2, §6.3): `tools/tools.json` (tools and their
 * accounts), `tools/events.jsonl` (one line per change: the verb and the field names, never
 * their values) and `tools/setup.json` (his interval, the kept list's file). Nothing is
 * deleted: a tool is retired, an account closed. Nothing here touches the people ledger;
 * the Owner's links live in `owner.ts`.
 */

import { randomUUID } from "node:crypto";

import { Refused } from "../../mail-merge/engine";
import type { Flag } from "../company-contracts";
import type { DataCore } from "../core";
import { clean, cleanText, isDay } from "../guard";
import type { Staff } from "../protocol";
import type { DataClass, KeyDateCover } from "../security-contracts";
import { AMOUNT_WORDS, isDutyCurrency, minorOf } from "../../../src/lib/data/labels-duties";
import {
  ACCOUNT_KINDS,
  ACCOUNT_ROLES,
  BILLING,
  DATA_CLASS_KEYS,
  KEY_DATE_COVERS,
  SIGN_IN,
  TOOL_CATEGORIES,
  TOOL_STATUSES,
  TWO_STEP,
  isKeyDateCover,
  type AccountKind,
  type AccountRole,
  type Billing,
  type SignIn,
  type ToolCategory,
  type ToolStatus,
  type TwoStep,
} from "../../../src/lib/data/labels-systems";
import { LIMIT, SAY, SHAPE, tooMany } from "./limits";
import type { Account, Stamp, Subprocessor, Tool, ToolsEvent, ToolsSetup } from "./types";

const TOOLS = "tools/tools.json";
const EVENTS = "tools/events.jsonl";
const SETUP = "tools/setup.json";

type Input = Record<string, unknown>;

const FLAGS = new Set<string>(["yes", "no", ""]);
const has = (input: Input, name: string) => Object.prototype.hasOwnProperty.call(input, name);
const listOf = <T>(value: unknown, keep: (item: T) => boolean): T[] =>
  Array.isArray(value) ? (value as T[]).filter((item) => item && keep(item)) : [];
const refuse = (message: string, status = 400, code = "invalid"): never => {
  throw new Refused(status, code, message);
};

const WORDS: Record<string, string> = {
  name: "Name",
  what: "What it is for",
  category: "Category",
  status: "Status",
  business_owner: "Business owner",
  admins: "Who administers it",
  vendor_id: "Vendor",
  legal_name: "Legal name",
  plan: "Plan",
  seats: "Seats",
  amount_minor: "Cost",
  currency: "Currency",
  billing: "Billing",
  renews_on: "Renews on",
  notice_days: "Notice",
  auto_renews: "Renews by itself",
  key_date: "Stands for in Key dates",
  sign_in: "Sign-in",
  sso_with: "Through what",
  mfa: "Two-step sign-in",
  critical: "Critical",
  holds: "Holds",
  subprocessor: "Sub-processor",
  data_location: "Where its data is",
  exit: "How to leave",
  notes: "Notes",
  holder: "Holder",
  kind: "Kind",
  role: "Role",
  opened_on: "Opened",
};

/** Names the fields that differ, in words; never their values. */
function changed(before: object, after: object): string {
  const a = before as Record<string, unknown>;
  const b = after as Record<string, unknown>;
  const keys = Object.keys(WORDS).filter(
    (key) => key in b && JSON.stringify(a[key]) !== JSON.stringify(b[key]),
  );
  return keys.length ? keys.map((key) => WORDS[key] ?? key).join(", ") : "Nothing";
}

const SETUP_DEFAULT: ToolsSetup = { format: 1, review_months: null, kept_file_id: null };

export class ToolsBook {
  readonly #core: DataCore;
  tools: Tool[];
  accounts: Account[];
  setup: ToolsSetup;

  constructor(core: DataCore) {
    this.#core = core;
    core.store.ensureDir("tools");
    const stored = core.store.readJson<Record<string, unknown>>(TOOLS, {});
    this.tools = listOf<Tool>(
      stored.tools,
      (item) => typeof item.tool_id === "string" && typeof item.name === "string",
    );
    this.accounts = listOf<Account>(
      stored.accounts,
      (item) => typeof item.account_id === "string" && typeof item.tool_id === "string",
    );
    const setup = core.store.readJson<Partial<ToolsSetup>>(SETUP, {});
    this.setup = {
      format: 1,
      review_months:
        typeof setup.review_months === "number" && Number.isInteger(setup.review_months)
          ? setup.review_months
          : null,
      kept_file_id: typeof setup.kept_file_id === "string" ? setup.kept_file_id : null,
    };
  }

  // ---------------------------------------------------------------- storing

  #save(): void {
    this.#core.store.writeJson(TOOLS, { format: 1, tools: this.tools, accounts: this.accounts });
  }

  saveSetup(next: Partial<ToolsSetup>): ToolsSetup {
    this.setup = { ...SETUP_DEFAULT, ...this.setup, ...next, format: 1 };
    this.#core.store.writeJson(SETUP, this.setup);
    return this.setup;
  }

  log(
    target: ToolsEvent["target"],
    id: string,
    toolId: string,
    verb: string,
    detail: string,
    by: Staff,
  ): void {
    const line: ToolsEvent = {
      event_id: randomUUID(),
      target,
      id,
      tool_id: toolId,
      verb,
      detail,
      by,
      at: this.#core.now(),
    };
    this.#core.store.appendLine(EVENTS, line);
  }

  eventsOf(toolId: string, limit = 50): ToolsEvent[] {
    return this.#core.store
      .readLines<ToolsEvent>(EVENTS)
      .filter((event) => typeof event?.event_id === "string" && event.tool_id === toolId)
      .reverse()
      .slice(0, limit);
  }

  #stamp(by: Staff): Stamp {
    const now = this.#core.now();
    return { created_at: now, created_by: by, updated_at: now, updated_by: by };
  }

  #touch(record: Stamp, by: Staff): void {
    record.updated_at = this.#core.now();
    record.updated_by = by;
    this.#save();
  }

  // ---------------------------------------------------------------- finding

  tool(toolId: string | undefined): Tool {
    const found = this.tools.find((tool) => tool.tool_id === toolId);
    if (!found) throw new Refused(404, "not_found", SAY.tool);
    return found;
  }

  account(accountId: string | undefined): Account {
    const found = this.accounts.find((account) => account.account_id === accountId);
    if (!found) throw new Refused(404, "not_found", SAY.account);
    return found;
  }

  accountsOf(toolId: string): Account[] {
    return this.accounts.filter((account) => account.tool_id === toolId);
  }

  openOf(toolId: string): Account[] {
    return this.accounts.filter((account) => account.tool_id === toolId && !account.closed_on);
  }

  // ---------------------------------------------------------------- reading inputs

  #text(value: unknown, limit: number): string {
    return cleanText(value, limit);
  }

  /** A field that might attract a password: refused when it holds one. */
  #guarded(value: unknown, limit: number): string {
    const text = cleanText(value, limit);
    if (SHAPE.pin.test(text)) refuse(SAY.pin);
    return text;
  }

  #flag(value: unknown): Flag {
    const flag = clean(value, 4);
    if (!FLAGS.has(flag)) refuse(SAY.flag);
    return flag as Flag;
  }

  #pick<T extends string>(value: unknown, words: Readonly<Record<T, string>>, fallback?: T): T {
    const text = clean(value, 40);
    if (!text && fallback !== undefined) return fallback;
    if (!Object.prototype.hasOwnProperty.call(words, text)) refuse(SAY.choose);
    return text as T;
  }

  #day(value: unknown, past = false): string | null {
    const day = clean(value, 10);
    if (!day) return null;
    if (!isDay(day)) refuse(SAY.notADay);
    if (past && day > this.#core.day()) refuse(SAY.future);
    return day;
  }

  #whole(value: unknown, max: number, message: string): number | null {
    if (value === null || value === undefined) return null;
    const text = typeof value === "number" ? String(value) : clean(value, 12);
    if (!text) return null;
    if (!/^\d{1,9}$/.test(text)) refuse(message);
    const parsed = Number(text);
    if (parsed > max) refuse(message);
    return parsed;
  }

  #bool(value: unknown): boolean {
    return value === true || value === "yes" || value === "on" || value === "true";
  }

  #holds(value: unknown): DataClass[] {
    const items = Array.isArray(value) ? value : typeof value === "string" ? value.split(",") : [];
    const picked = new Set<DataClass>();
    for (const item of items) {
      const text = clean(item, 40);
      if (!text) continue;
      if (!(DATA_CLASS_KEYS as readonly string[]).includes(text)) refuse(SAY.holds);
      picked.add(text as DataClass);
    }
    return DATA_CLASS_KEYS.filter((key) => picked.has(key));
  }

  #cover(value: unknown, toolId: string | null): KeyDateCover | null {
    const text = clean(value, 40);
    if (!text) return null;
    if (!isKeyDateCover(text)) refuse(SAY.choose);
    const cover = text as KeyDateCover;
    const other = this.tools.find(
      (tool) => tool.tool_id !== toolId && !tool.retired && tool.key_date === cover,
    );
    if (other) refuse(SAY.coverTaken(other.name, KEY_DATE_COVERS[cover]));
    return cover;
  }

  #name(value: unknown, toolId: string | null): string {
    const name = this.#text(value, LIMIT.name);
    if (!name) refuse(SAY.name);
    const lower = name.toLowerCase();
    const other = this.tools.find(
      (tool) => tool.tool_id !== toolId && !tool.retired && tool.name.toLowerCase() === lower,
    );
    if (other) refuse(SAY.nameTaken(other.name));
    return name;
  }

  #subprocessor(value: unknown, before: Subprocessor | null): Subprocessor | null {
    if (value === null || value === false || value === "" || value === "no") return null;
    const input = (value && typeof value === "object" ? value : {}) as Input;
    const pick = <K extends keyof Subprocessor>(key: K, read: (raw: unknown) => Subprocessor[K]) =>
      has(input, key) ? read(input[key]) : (before?.[key] ?? read(undefined));
    return {
      purpose: pick("purpose", (raw) => this.#text(raw, LIMIT.purpose)),
      locations: pick("locations", (raw) => this.#text(raw, LIMIT.locations)),
      dpa_signed_on: pick("dpa_signed_on", (raw) => this.#day(raw, true)),
      // The copy is kept through Files first (`setDpaFile`), never named here.
      dpa_file_id: before?.dpa_file_id ?? null,
      since: pick("since", (raw) => this.#day(raw, true)),
    };
  }

  /** Every field of a tool, from the input over the record (or over the defaults when new). */
  #toolFields(
    input: Input,
    before: Tool | null,
  ): Omit<Tool, keyof Stamp | "tool_id" | "reviewed" | "retired"> {
    const id = before?.tool_id ?? null;
    const pick = <K extends keyof Tool>(
      key: K,
      read: (raw: unknown) => Tool[K],
      fallback: Tool[K],
    ) => (has(input, key) ? read(input[key]) : before ? before[key] : fallback);
    const amount = pick(
      "amount_minor",
      (raw) => {
        if (raw === null || raw === undefined || raw === "") return null;
        const minor = minorOf(raw);
        if (minor === null) refuse(AMOUNT_WORDS);
        return minor;
      },
      null,
    );
    const currency = pick(
      "currency",
      (raw) => {
        const text = clean(raw, 3).toUpperCase() || "INR";
        if (!isDutyCurrency(text)) refuse(SAY.currency);
        return text;
      },
      "INR",
    );
    const status = pick(
      "status",
      (raw) => this.#pick<ToolStatus>(raw, TOOL_STATUSES, "in_use"),
      "in_use",
    );
    if (status === "retired" && (!before || !before.retired))
      refuse("Retire a tool with Retire, which asks why.");
    return {
      name: has(input, "name") || !before ? this.#name(input.name, id) : before.name,
      what: pick("what", (raw) => this.#text(raw, LIMIT.what), ""),
      category: pick(
        "category",
        (raw) => this.#pick<ToolCategory>(raw, TOOL_CATEGORIES, "other"),
        "other",
      ),
      status: before?.retired ? "retired" : status,
      business_owner: pick("business_owner", (raw) => this.#text(raw, LIMIT.business_owner), ""),
      admins: pick("admins", (raw) => this.#guarded(raw, LIMIT.admins), ""),
      vendor_id: pick("vendor_id", (raw) => clean(raw, 64) || null, null),
      legal_name: pick("legal_name", (raw) => this.#text(raw, LIMIT.legal_name), ""),
      plan: pick("plan", (raw) => this.#text(raw, LIMIT.plan), ""),
      seats: pick("seats", (raw) => this.#whole(raw, LIMIT.seats_max, SAY.seats), null),
      amount_minor: amount,
      currency,
      billing: pick("billing", (raw) => this.#pick<Billing>(raw, BILLING, ""), ""),
      renews_on: pick("renews_on", (raw) => this.#day(raw), null),
      notice_days: pick(
        "notice_days",
        (raw) => this.#whole(raw, LIMIT.notice_max, SAY.notice),
        null,
      ),
      auto_renews: pick("auto_renews", (raw) => this.#flag(raw), ""),
      key_date: has(input, "key_date")
        ? this.#cover(input.key_date, id)
        : (before?.key_date ?? null),
      sign_in: pick("sign_in", (raw) => this.#pick<SignIn>(raw, SIGN_IN, ""), ""),
      sso_with: pick("sso_with", (raw) => this.#text(raw, LIMIT.sso_with), ""),
      mfa: pick("mfa", (raw) => this.#pick<TwoStep>(raw, TWO_STEP, ""), ""),
      critical: pick("critical", (raw) => this.#bool(raw), false),
      holds: pick("holds", (raw) => this.#holds(raw), []),
      subprocessor: has(input, "subprocessor")
        ? this.#subprocessor(input.subprocessor, before?.subprocessor ?? null)
        : (before?.subprocessor ?? null),
      data_location: pick("data_location", (raw) => this.#text(raw, LIMIT.data_location), ""),
      exit: pick("exit", (raw) => this.#guarded(raw, LIMIT.exit), ""),
      notes: pick("notes", (raw) => this.#guarded(raw, LIMIT.notes), ""),
    };
  }

  // ---------------------------------------------------------------- tools

  addTool(input: Input, by: Staff): Tool {
    if (this.tools.length >= LIMIT.tools) refuse(tooMany(LIMIT.tools), 409, "too_many");
    const tool: Tool = {
      tool_id: randomUUID(),
      ...this.#toolFields(input, null),
      reviewed: null,
      retired: null,
      ...this.#stamp(by),
    };
    this.tools.push(tool);
    this.#save();
    this.log("tool", tool.tool_id, tool.tool_id, "added", "", by);
    return tool;
  }

  updateTool(tool: Tool, input: Input, by: Staff): Tool {
    if (tool.retired) refuse(SAY.retired, 409, "retired");
    const before = { ...tool };
    Object.assign(tool, this.#toolFields(input, tool));
    this.log("tool", tool.tool_id, tool.tool_id, "changed", changed(before, tool), by);
    this.#touch(tool, by);
    return tool;
  }

  /** Points the DPA's copy at a file in Files (after it is kept there). */
  setDpaFile(tool: Tool, fileId: string, by: Staff): Tool {
    if (!tool.subprocessor) return tool;
    tool.subprocessor = { ...tool.subprocessor, dpa_file_id: fileId };
    this.log("tool", tool.tool_id, tool.tool_id, "agreement kept", "Data processing agreement", by);
    this.#touch(tool, by);
    return tool;
  }

  review(tool: Tool, input: Input, by: Staff): Tool {
    if (tool.retired) refuse(SAY.retired, 409, "retired");
    const on = this.#day(input.on, true) ?? this.#core.day();
    const byName = this.#text(input.by_name, LIMIT.review_by) || by.name;
    tool.reviewed = { on, by_name: byName, note: this.#guarded(input.note, LIMIT.review_note) };
    this.log("tool", tool.tool_id, tool.tool_id, "looked at", "", by);
    this.#touch(tool, by);
    return tool;
  }

  retire(tool: Tool, input: Input, by: Staff): Tool {
    if (input.undo === true) {
      if (!tool.retired) refuse(SAY.notRetired, 409, "not_retired");
      const lower = tool.name.toLowerCase();
      if (
        this.tools.some(
          (other) => other !== tool && !other.retired && other.name.toLowerCase() === lower,
        )
      )
        refuse(SAY.nameTaken(tool.name));
      if (
        tool.key_date &&
        this.tools.some(
          (other) => other !== tool && !other.retired && other.key_date === tool.key_date,
        )
      )
        tool.key_date = null;
      tool.retired = null;
      tool.status = "in_use";
      this.log("tool", tool.tool_id, tool.tool_id, "back in use", "", by);
      this.#touch(tool, by);
      return tool;
    }
    if (tool.retired) refuse(SAY.retired, 409, "retired");
    const open = this.openOf(tool.tool_id).length;
    if (open > 0) refuse(SAY.openAccounts(open), 409, "open_accounts");
    const why = this.#text(input.why, LIMIT.why);
    if (!why) refuse(SAY.why);
    const on = this.#day(input.on, true) ?? this.#core.day();
    tool.retired = { on, why };
    tool.status = "retired";
    this.log("tool", tool.tool_id, tool.tool_id, "retired", "", by);
    this.#touch(tool, by);
    return tool;
  }

  // ---------------------------------------------------------------- accounts

  #accountFields(
    input: Input,
    before: Account | null,
  ): Pick<Account, "holder" | "kind" | "role" | "mfa" | "critical" | "opened_on" | "notes"> {
    const pick = <K extends keyof Account>(
      key: K,
      read: (raw: unknown) => Account[K],
      fallback: Account[K],
    ) => (has(input, key) ? read(input[key]) : before ? before[key] : fallback);
    const holder =
      has(input, "holder") || !before ? this.#guarded(input.holder, LIMIT.holder) : before.holder;
    if (!holder) refuse(SAY.holder);
    const opened = pick("opened_on", (raw) => this.#day(raw, true), null);
    const closed = before?.closed_on ?? null;
    if (opened && closed && closed < opened) refuse(SAY.closedBefore);
    return {
      holder,
      kind: pick("kind", (raw) => this.#pick<AccountKind>(raw, ACCOUNT_KINDS, "person"), "person"),
      role: pick("role", (raw) => this.#pick<AccountRole>(raw, ACCOUNT_ROLES, ""), ""),
      mfa: pick("mfa", (raw) => this.#flag(raw), ""),
      critical: pick(
        "critical",
        (raw) => {
          if (raw === null || raw === undefined || raw === "") return null;
          if (raw === true || raw === "yes") return true;
          if (raw === false || raw === "no") return false;
          return refuse(SAY.flag);
        },
        null,
      ),
      opened_on: opened,
      notes: pick("notes", (raw) => this.#guarded(raw, LIMIT.notes), ""),
    };
  }

  addAccount(tool: Tool, input: Input, by: Staff): Account {
    if (tool.retired) refuse(SAY.retired, 409, "retired");
    if (this.accounts.length >= LIMIT.accounts) refuse(tooMany(LIMIT.accounts), 409, "too_many");
    const account: Account = {
      account_id: randomUUID(),
      tool_id: tool.tool_id,
      ...this.#accountFields(input, null),
      closed_on: null,
      closed_note: "",
      ...this.#stamp(by),
    };
    this.accounts.push(account);
    this.#save();
    this.log("account", account.account_id, tool.tool_id, "added", "", by);
    return account;
  }

  updateAccount(account: Account, input: Input, by: Staff): Account {
    const before = { ...account };
    Object.assign(account, this.#accountFields(input, account));
    this.log(
      "account",
      account.account_id,
      account.tool_id,
      "changed",
      changed(before, account),
      by,
    );
    this.#touch(account, by);
    return account;
  }

  closeAccount(account: Account, input: Input, by: Staff): Account {
    if (input.undo === true) {
      if (!account.closed_on) refuse(SAY.notClosed, 409, "not_closed");
      const tool = this.tool(account.tool_id);
      if (tool.retired) refuse(SAY.retired, 409, "retired");
      account.closed_on = null;
      account.closed_note = "";
      this.log("account", account.account_id, account.tool_id, "reopened", "", by);
      this.#touch(account, by);
      return account;
    }
    if (account.closed_on) refuse(SAY.closed, 409, "closed");
    const on = this.#day(input.closed_on, true) ?? this.#core.day();
    if (account.opened_on && on < account.opened_on) refuse(SAY.closedBefore);
    account.closed_on = on;
    account.closed_note = this.#guarded(input.note, LIMIT.closed_note);
    this.log("account", account.account_id, account.tool_id, "closed", "", by);
    this.#touch(account, by);
    return account;
  }

  // ---------------------------------------------------------------- the walk

  /** Gives a tool the fixed id the harness opens (`walk-mail`), once; its accounts follow. */
  pin(toolId: string, pinned: string): Tool {
    const existing = this.tools.find((tool) => tool.tool_id === pinned);
    if (existing) return existing;
    const tool = this.tool(toolId);
    for (const account of this.accounts)
      if (account.tool_id === tool.tool_id) account.tool_id = pinned;
    tool.tool_id = pinned;
    this.#save();
    return tool;
  }
}
