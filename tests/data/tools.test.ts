// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { addMonths } from "../../scripts/data/company-contracts";
import { addDays, localDay } from "../../scripts/data/days";
import { CRITICAL_DAYS, OTHER_DAYS } from "../../scripts/data/people/limits";
import { LEAVER_DAYS } from "../../scripts/data/security-contracts";
import { checksOf } from "../../scripts/data/tools/checks";
import {
  accountsLine,
  closeByWords,
  nextReviewOf,
  renewalDue,
  renewalInDue,
  renewalOf,
  renewalTitle,
  reviewInDue,
} from "../../scripts/data/tools/renewal";
import { subprocessorCsv } from "../../scripts/data/tools/subprocessors";
import type { Account, Tool } from "../../scripts/data/tools/types";
import { WALKER, codeOf, startStack, until, type Stack } from "./helpers";

/**
 * The tools register (ws-notes/security/spec.md §5.2, §6.2–§6.5): §5.2's renewal rows with the
 * day pinned and when each enters Due, the yearly look, the seats words and the close-by
 * words; then on the real stack every refusal of §6.3, retiring refused with open accounts,
 * one tool per Key dates suggestion, the check lines, the Due rows, search, the agenda,
 * `usedFor`, the overview block, the tools CSV defusing a formula, and the sub-processor list
 * as a CSV and kept in Files. Every tool is invented ("Walk Mail", "Walk Code" …).
 */

type Body = Record<string, unknown>;
const today = () => localDay(new Date());
const attempt = () => crypto.randomUUID();
const STAMP = {
  created_at: "2026-03-15T06:00:00.000Z",
  created_by: WALKER,
  updated_at: "2026-03-15T06:00:00.000Z",
  updated_by: WALKER,
};

function tool(fields: Partial<Tool>): Tool {
  return {
    tool_id: "walk-mail",
    name: "Walk Mail",
    what: "",
    category: "mail_docs",
    status: "in_use",
    business_owner: "",
    admins: "",
    vendor_id: null,
    legal_name: "",
    plan: "",
    seats: null,
    amount_minor: null,
    currency: "INR",
    billing: "yearly",
    renews_on: "2026-03-15",
    notice_days: 30,
    auto_renews: "yes",
    key_date: null,
    sign_in: "",
    sso_with: "",
    mfa: "",
    critical: true,
    holds: [],
    subprocessor: null,
    data_location: "",
    exit: "",
    reviewed: null,
    retired: null,
    notes: "",
    ...STAMP,
    ...fields,
  };
}

function account(fields: Partial<Account>): Account {
  return {
    account_id: "walk-account",
    tool_id: "walk-mail",
    holder: "walk.one@walk.example",
    kind: "person",
    role: "member",
    mfa: "yes",
    critical: null,
    opened_on: null,
    closed_on: null,
    closed_note: "",
    notes: "",
    ...STAMP,
    ...fields,
  };
}

describe("§5.2: renewals, the yearly look, seats and close-by", () => {
  it("Walk Mail, yearly, renews 15 Mar 2026, notice 30: next 15 Mar 2027, cancel by 13 Feb 2027, in Due from 14 Jan 2027", () => {
    const mail = tool({});
    expect(renewalOf(mail, "2026-11-20")).toEqual({ next: "2027-03-15", cancel_by: "2027-02-13" });
    const due = renewalDue(mail, "2026-11-20")!;
    expect(due).toEqual({
      next: "2027-03-15",
      cancel_by: "2027-02-13",
      verb: "renew_or_cancel",
      from: "2027-01-14",
    });
    expect(renewalInDue(due, "2027-01-13")).toBe(false);
    expect(renewalInDue(due, "2027-01-14")).toBe(true);
    expect(renewalTitle("Walk Mail", due)).toBe("Renew or cancel Walk Mail by 13 Feb 2027");
    // Any auto-renew: a yearly tool always gives the row.
    expect(renewalDue(tool({ auto_renews: "no" }), "2026-11-20")?.verb).toBe("renew_or_cancel");
    expect(renewalDue(tool({ auto_renews: "" }), "2026-11-20")?.verb).toBe("renew_or_cancel");
  });

  it("the same, notice 90: cancel by 15 Dec 2026, in Due from 15 Nov 2026 (in Due today)", () => {
    const due = renewalDue(tool({ notice_days: 90 }), "2026-11-20")!;
    expect(due).toMatchObject({ next: "2027-03-15", cancel_by: "2026-12-15", from: "2026-11-15" });
    expect(renewalInDue(due, "2026-11-20")).toBe(true);
  });

  it("Walk Code, monthly, base 31 Jan 2027, Ending, no notice, on 14 Feb 2027: 28 Feb 2027 both, in Due from 21 Feb 2027", () => {
    const code = tool({
      name: "Walk Code",
      billing: "monthly",
      renews_on: "2027-01-31",
      notice_days: null,
      status: "ending",
    });
    const due = renewalDue(code, "2027-02-14")!;
    expect(due).toEqual({
      next: "2027-02-28",
      cancel_by: "2027-02-28",
      verb: "cancel",
      from: "2027-02-21",
    });
    expect(renewalTitle("Walk Code", due)).toBe("Cancel Walk Code by 28 Feb 2027");
    expect(renewalInDue(due, "2027-02-20")).toBe(false);
    expect(renewalInDue(due, "2027-02-21")).toBe(true);
    // Auto-renew off gives the row too.
    expect(renewalDue({ ...code, status: "in_use", auto_renews: "no" }, "2027-02-14")?.verb).toBe(
      "cancel",
    );
  });

  it("monthly and auto-renewing, once, free, not given and retired give none", () => {
    const monthly = tool({ billing: "monthly", auto_renews: "yes", renews_on: "2027-01-31" });
    expect(renewalDue(monthly, "2027-02-14")).toBeNull();
    expect(renewalDue({ ...monthly, auto_renews: "" }, "2027-02-14")).toBeNull();
    expect(renewalDue(tool({ billing: "once" }), "2026-11-20")).toBeNull();
    expect(renewalDue(tool({ billing: "free" }), "2026-11-20")).toBeNull();
    expect(renewalDue(tool({ billing: "" }), "2026-11-20")).toBeNull();
    expect(renewalDue(tool({ renews_on: null }), "2026-11-20")).toBeNull();
    expect(
      renewalDue(
        tool({ retired: { on: "2026-11-20", why: "Walk" }, status: "retired" }),
        "2026-11-20",
      ),
    ).toBeNull();
  });

  it("the yearly look: reviewed 20 Nov 2026 → 20 Nov 2027, in Due from 21 Oct 2027; a new tool counts as looked at the day it is added", () => {
    const looked = tool({ reviewed: { on: "2026-11-20", by_name: "Walk Owner", note: "" } });
    expect(nextReviewOf(looked, null)).toBe("2027-11-20");
    expect(reviewInDue("2027-11-20", "2027-10-20")).toBe(false);
    expect(reviewInDue("2027-11-20", "2027-10-21")).toBe(true);
    expect(nextReviewOf(looked, 6)).toBe("2027-05-20");
    const added = tool({ created_at: "2026-11-20T06:00:00.000Z" });
    expect(nextReviewOf(added, null)).toBe("2027-11-20");
    expect(reviewInDue(nextReviewOf(added, null), "2026-11-20")).toBe(false);
  });

  it("seats: 4 on 5, 6 on 5 with its check line, no seats typed", () => {
    expect(accountsLine(4, 5)).toBe("4 accounts on 5 seats");
    expect(accountsLine(6, 5)).toBe("6 accounts on 5 seats");
    expect(accountsLine(4, null)).toBe("4 accounts");
    expect(accountsLine(1, 1)).toBe("1 account on 1 seat");
    const six = Array.from({ length: 6 }, (_, n) => account({ account_id: `walk-${n}` }));
    const lines = checksOf({
      tool: tool({ seats: 5 }),
      open: six,
      looked_on: "2026-11-20",
      review_owed: false,
    });
    expect(lines).toContain("More accounts than seats.");
    expect(
      checksOf({
        tool: tool({ seats: 5 }),
        open: six.slice(0, 4),
        looked_on: "2026-11-20",
        review_owed: false,
      }),
    ).not.toContain("More accounts than seats.");
  });

  it("close-by: last day 27 Nov 2026 → 28 Nov 2026 (critical), 2 Dec 2026 (not); overdue; closed", () => {
    expect(closeByWords(account({}), "2026-11-27", true, "2026-11-20")).toEqual({
      on: "2026-11-28",
      words: "Close by 28 Nov 2026",
      overdue: false,
    });
    expect(closeByWords(account({}), "2026-11-27", false, "2026-11-20")).toEqual({
      on: "2026-12-02",
      words: "Close by 2 Dec 2026",
      overdue: false,
    });
    expect(closeByWords(account({}), "2026-11-27", true, "2026-11-29")).toEqual({
      on: "2026-11-28",
      words: "Overdue since 28 Nov 2026",
      overdue: true,
    });
    expect(
      closeByWords(account({ closed_on: "2026-11-27" }), "2026-11-27", true, "2026-11-29"),
    ).toEqual({ on: "2026-11-28", words: "Closed 27 Nov 2026", overdue: false });
    expect(closeByWords(account({}), null, true, "2026-11-20")).toBeNull();
  });

  it("LEAVER_DAYS equals the ledger's CRITICAL_DAYS and OTHER_DAYS", () => {
    expect(LEAVER_DAYS).toEqual({ critical: CRITICAL_DAYS, other: OTHER_DAYS });
  });

  it("the check lines, in order", () => {
    const weak = tool({
      mfa: "optional",
      sign_in: "password",
      sso_with: "",
      holds: ["personal"],
      billing: "monthly",
      renews_on: null,
      seats: 1,
    });
    const admins = [
      account({ account_id: "a1", role: "admin", mfa: "no" }),
      account({ account_id: "a2", role: "owner", mfa: "" }),
      account({ account_id: "a3", kind: "shared", role: "member" }),
    ];
    expect(
      checksOf({
        tool: weak,
        open: admins,
        looked_on: "2025-11-01",
        review_owed: true,
        page: true,
      }),
    ).toEqual([
      "Two-step sign-in is not enforced.",
      "Signs in with its own password, not through the mail suite.",
      "Holds customer or personal data but is not marked as a sub-processor.",
      "Not looked at since 1 Nov 2025.",
      "No renewal day.",
      "More accounts than seats.",
      "2 admin accounts without two-step sign-in.",
      "A shared account.",
    ]);
    const marked = tool({
      subprocessor: {
        purpose: "Mail",
        locations: "",
        dpa_signed_on: null,
        dpa_file_id: null,
        since: null,
      },
      holds: ["customer"],
      sign_in: "password",
      sso_with: "the walk suite",
    });
    expect(
      checksOf({ tool: marked, open: [], looked_on: "2026-11-20", review_owed: false }),
    ).toEqual([
      "Signs in with its own password, not through the walk suite.",
      "No data processing agreement is recorded.",
    ]);
    expect(
      checksOf({
        tool: tool({ mfa: "none", retired: { on: "2026-11-20", why: "Walk" }, status: "retired" }),
        open: [],
        looked_on: "2026-11-20",
        review_owed: true,
      }),
    ).toEqual([]);
  });

  it("the sub-processor list names no person and is the same bytes twice", () => {
    const listed = [
      tool({
        name: "Walk Mail",
        legal_name: "Walk Mail Private Limited",
        holds: ["customer", "personal"],
        subprocessor: {
          purpose: "=SUM(1)",
          locations: "India",
          dpa_signed_on: "2026-10-01",
          dpa_file_id: null,
          since: "2026-01-01",
        },
      }),
    ];
    const text = subprocessorCsv(listed);
    expect(text.startsWith("﻿")).toBe(true);
    expect(text).toContain(
      "Service,Legal name,Purpose,Data held,Where the data is processed,Data processing agreement signed,Since",
    );
    expect(text).toContain(
      "Walk Mail,Walk Mail Private Limited,'=SUM(1),Customer data; Personal data,India,2026-10-01,2026-01-01",
    );
    expect(subprocessorCsv(listed)).toBe(text);
  });
});

// ---------------------------------------------------------------- on the real stack

let stack: Stack;

beforeAll(async () => {
  stack = await startStack({ modules: ["files", "money", "domains", "tools"] });
}, 60_000);
afterAll(() => stack.stop());

async function add(fields: Body): Promise<Body> {
  const answer = await stack.ask("POST", "/data/tools", {
    ...fields,
    attempt: attempt(),
    by: WALKER,
  });
  expect(answer.status, JSON.stringify(answer.json)).toBe(200);
  return answer.json!.tool as Body;
}

async function refused(path: string, body: Body): Promise<string> {
  const answer = await stack.ask("POST", path, { ...body, by: WALKER });
  expect(answer.status).toBeGreaterThanOrEqual(400);
  return String((answer.json?.error as Body | undefined)?.message ?? "");
}

async function addAccount(toolId: string, fields: Body): Promise<Body> {
  const answer = await stack.ask("POST", `/data/tools/${toolId}/accounts`, {
    ...fields,
    attempt: attempt(),
    by: WALKER,
  });
  expect(answer.status, JSON.stringify(answer.json)).toBe(200);
  return answer.json!.account as Body;
}

async function build(kind: string, extra: Body = {}): Promise<string> {
  const started = await stack.ask("POST", "/data/builds", { kind, by: WALKER, ...extra });
  expect(started.status).toBe(200);
  const buildId = String((started.json!.build as Body).build_id);
  let state = "building";
  await until(async () => {
    state = String(((await stack.ask("GET", `/data/builds/${buildId}`)).json!.build as Body).state);
    return state !== "building";
  }, kind);
  expect(state).toBe("ready");
  const file = await stack.raw(stack.socket, "GET", `/data/builds/${buildId}/bytes`);
  return file.bytes.toString("utf8");
}

describe("the register on the real stack", () => {
  let mailId = "";

  it("starts empty, and adds Walk Mail with every field", async () => {
    const empty = await stack.ask("GET", "/data/tools");
    expect(empty.json).toMatchObject({
      view: "in_use",
      tools: [],
      counts: { in_use: 0, trial: 0, ending: 0, retired: 0, subprocessors: 0 },
    });
    const mail = await add({
      name: "Walk Mail",
      what: "Mail and documents",
      category: "mail_docs",
      business_owner: "Walk Owner",
      admins: "Walk Owner, Walk Admin",
      legal_name: "Walk Mail Private Limited",
      plan: "Business",
      seats: "5",
      amount_minor: "1180.50",
      currency: "INR",
      billing: "yearly",
      renews_on: addDays(today(), 40),
      notice_days: "30",
      auto_renews: "yes",
      key_date: "mail-plan",
      sign_in: "sso",
      sso_with: "the walk suite",
      mfa: "enforced",
      critical: "yes",
      holds: ["personal", "customer"],
      data_location: "India",
      exit: "Export every mailbox from the admin page.",
    });
    mailId = String(mail.tool_id);
    expect(mail).toMatchObject({
      name: "Walk Mail",
      seats: 5,
      amount_minor: 118050,
      holds: ["customer", "personal"],
      critical: true,
      key_date: "mail-plan",
      accounts_line: "0 accounts on 5 seats",
      checks: ["Holds customer or personal data but is not marked as a sub-processor."],
      refs: ["a5_9", "a5_18", "a5_19", "a5_20", "a5_21", "a5_22", "a5_23"],
      href: `/data/systems/tools/${mailId}`,
    });
    const next = mail.next as { renewal: Body; review: string };
    expect(next.renewal).toEqual({
      next: addDays(today(), 40),
      cancel_by: addDays(today(), 10),
    });
    expect(next.review).toBe(addMonths(today(), 12));
  });

  it("refuses each of §6.3", async () => {
    expect(await refused("/data/tools", { name: "" })).toBe("Give the tool a name.");
    expect(await refused("/data/tools", { name: "walk mail" })).toBe(
      "Walk Mail is already in the register.",
    );
    expect(await refused("/data/tools", { name: "Walk Other", seats: "100001" })).toBe(
      "Type the seats as a whole number from 0 to 100,000, or leave it empty.",
    );
    expect(await refused("/data/tools", { name: "Walk Other", seats: "2.5" })).toMatch(
      /whole number/,
    );
    expect(await refused("/data/tools", { name: "Walk Other", amount_minor: "12,00.555" })).toBe(
      "Type the amount as a number, such as 1180.50.",
    );
    expect(await refused("/data/tools", { name: "Walk Other", currency: "XYZ" })).toBe(
      "Choose the currency from the list.",
    );
    expect(await refused("/data/tools", { name: "Walk Other", notice_days: "366" })).toMatch(
      /from 0 to 365/,
    );
    expect(await refused("/data/tools", { name: "Walk Other", renews_on: "2026-02-30" })).toBe(
      "That is not a day.",
    );
    expect(await refused("/data/tools", { name: "Walk Other", key_date: "mail-plan" })).toBe(
      "Walk Mail already stands for The mail provider's plan.",
    );
    expect(await refused("/data/tools", { name: "Walk Other", holds: ["customer", "gold"] })).toBe(
      "Choose what it holds from the list.",
    );
    expect(await refused("/data/tools", { name: "Walk Other", category: "toys" })).toBe(
      "Choose from the list.",
    );
    expect(
      await refused("/data/tools", {
        name: "Walk Other",
        subprocessor: { purpose: "Mail", dpa_signed_on: addDays(today(), 1) },
      }),
    ).toBe("That day is in the future.");
    for (const field of ["admins", "notes", "exit"])
      expect(
        await refused("/data/tools", { name: "Walk Other", [field]: "password: walk123" }),
      ).toBe("Write where it is kept, never its password.");
    expect(await refused("/data/tools", { name: "Walk Other", notes: "ghp_abcdef123456" })).toMatch(
      /password or key/,
    );
    expect(
      await refused(`/data/tools/${mailId}/accounts`, { holder: "Walk One", notes: "PIN 1234" }),
    ).toBe("Write where it is kept, never its password.");
    expect(await refused(`/data/tools/${mailId}/accounts`, { holder: "" })).toBe(
      "Give the account's holder as the tool shows it: a name or an address.",
    );
    expect(
      await refused(`/data/tools/${mailId}/accounts`, {
        holder: "Walk One",
        opened_on: addDays(today(), 1),
      }),
    ).toBe("That day is in the future.");
    expect(await refused(`/data/tools/${mailId}/review`, { on: addDays(today(), 1) })).toBe(
      "That day is in the future.",
    );
    expect(await refused("/data/tools/setup", { review_months: "61" })).toMatch(/from 1 to 60/);
    const missing = await stack.ask("GET", "/data/tools/walk-nothing");
    expect(missing.status).toBe(404);
    expect(codeOf(missing)).toBe("not_found");
  });

  it("updates one field and logs the field's name, never its value", async () => {
    const answer = await stack.ask("POST", `/data/tools/${mailId}/update`, {
      plan: "Walk Enterprise",
      by: WALKER,
    });
    expect(answer.status).toBe(200);
    expect((answer.json!.tool as Body).plan).toBe("Walk Enterprise");
    expect((answer.json!.tool as Body).seats).toBe(5);
    const page = await stack.ask("GET", `/data/tools/${mailId}`);
    const events = page.json!.events as Body[];
    expect(events[0]).toMatchObject({ verb: "changed", detail: "Plan" });
    expect(JSON.stringify(events)).not.toContain("Walk Enterprise");
  });

  it("accounts: seats words, admin check line, close and reopen; retiring refused with open accounts", async () => {
    const one = await addAccount(mailId, {
      holder: "walk.one@walk.example",
      role: "admin",
      mfa: "no",
      opened_on: addDays(today(), -30),
    });
    await addAccount(mailId, { holder: "Walk Shared", kind: "shared", role: "member", mfa: "yes" });
    const page = await stack.ask("GET", `/data/tools/${mailId}`);
    const detail = page.json!.tool as Body;
    expect(detail.accounts_line).toBe("2 accounts on 5 seats");
    expect(detail.checks).toEqual([
      "Holds customer or personal data but is not marked as a sub-processor.",
      "1 admin account without two-step sign-in.",
      "A shared account.",
    ]);
    const rows = page.json!.accounts as Body[];
    expect(rows).toHaveLength(2);
    expect(rows.every((row) => !("person" in row) && !("close_by" in row))).toBe(true);
    expect(await refused(`/data/tools/${mailId}/retire`, { why: "Walk" })).toBe(
      "Close its 2 open accounts first.",
    );
    expect(
      await refused(`/data/tools/accounts/${String(one.account_id)}/close`, {
        closed_on: addDays(today(), -31),
      }),
    ).toBe("It cannot be closed before it was opened.");
    const closed = await stack.ask("POST", `/data/tools/accounts/${String(one.account_id)}/close`, {
      closed_on: today(),
      note: "Left the walk",
      by: WALKER,
    });
    expect((closed.json!.account as Body).closed_on).toBe(today());
    const reopened = await stack.ask(
      "POST",
      `/data/tools/accounts/${String(one.account_id)}/close`,
      { undo: true, by: WALKER },
    );
    expect((reopened.json!.account as Body).closed_on).toBeNull();
    const accounts = await stack.ask("GET", "/data/tools/accounts?view=all");
    expect(accounts.json).toMatchObject({
      view: "all",
      holders: ["Walk Shared", "walk.one@walk.example"],
      counts: { open: 2, closed: 0, shared: 1, admin_without_mfa: 1 },
    });
    const filtered = await stack.ask("GET", "/data/tools/accounts?holder=walk%20shared");
    expect((filtered.json!.accounts as Body[]).map((row) => row.holder)).toEqual(["Walk Shared"]);
  });

  it("one tool per Key dates suggestion, among tools not retired; a retired tool frees it", async () => {
    const code = await add({ name: "Walk Code", category: "code", billing: "monthly" });
    expect(
      await refused(`/data/tools/${String(code.tool_id)}/update`, { key_date: "mail-plan" }),
    ).toBe("Walk Mail already stands for The mail provider's plan.");
    const lookup = await stack.ask("GET", "/data/_test/tools/lookup");
    expect(lookup.json!.covers).toEqual(["mail-plan"]);
    const spare = await add({
      name: "Walk Spare",
      key_date: "mailbox",
      billing: "yearly",
      renews_on: addDays(today(), 200),
    });
    expect(
      (
        await stack.ask("POST", `/data/tools/${String(spare.tool_id)}/retire`, {
          why: "Not needed",
          by: WALKER,
        })
      ).status,
    ).toBe(200);
    expect((await stack.ask("GET", "/data/_test/tools/lookup")).json!.covers).toEqual([
      "mail-plan",
    ]);
    const again = await add({ name: "Walk Spare Two", key_date: "mailbox" });
    expect(again.key_date).toBe("mailbox");
    const retired = await stack.ask("GET", "/data/tools?view=retired");
    expect((retired.json!.tools as Body[]).map((row) => row.name)).toEqual(["Walk Spare"]);
    expect(retired.json!.counts).toMatchObject({ retired: 1 });
  });

  it("Due: the renewal from 30 days before its cancel-by day; a monthly auto-renewing tool none; a look from 30 days before", async () => {
    const due = (await stack.ask("GET", "/data/_test/tools/due")).json!.items as Body[];
    const mail = due.find((item) => item.key === `tool:${mailId}:renewal`);
    expect(mail).toMatchObject({
      kind: "tool",
      title: `Renew or cancel Walk Mail by ${dayOf(addDays(today(), 10))}`,
      sub: "Walk Enterprise · ₹1,180.50 yearly · auto-renew on",
      due_on: addDays(today(), 10),
      href: `/data/systems/tools/${mailId}`,
    });
    expect(mail?.owner_only).toBeUndefined();
    await add({
      name: "Walk Monthly",
      billing: "monthly",
      auto_renews: "yes",
      renews_on: addDays(today(), 3),
    });
    const ending = await add({
      name: "Walk Ending",
      billing: "monthly",
      status: "ending",
      renews_on: addDays(today(), 3),
    });
    const after = (await stack.ask("GET", "/data/_test/tools/due")).json!.items as Body[];
    expect(after.some((item) => String(item.title).includes("Walk Monthly"))).toBe(false);
    expect(
      after.find((item) => item.key === `tool:${String(ending.tool_id)}:renewal`),
    ).toMatchObject({
      title: `Cancel Walk Ending by ${dayOf(addDays(today(), 3))}`,
      sub: "auto-renew not known",
    });
    // Nothing nags about a look on the day the tools are added.
    expect(after.some((item) => String(item.key).endsWith(":review"))).toBe(false);
    // A look a year ago less 20 days: in Due, with "Not looked at since …" once owed.
    const looked = await stack.ask("POST", `/data/tools/${String(ending.tool_id)}/review`, {
      on: addDays(addMonths(today(), -12), 20),
      by_name: "Walk Owner",
      by: WALKER,
    });
    expect(looked.status).toBe(200);
    const reviews = (await stack.ask("GET", "/data/_test/tools/due")).json!.items as Body[];
    expect(
      reviews.find((item) => item.key === `tool:${String(ending.tool_id)}:review`),
    ).toMatchObject({
      title: "Look again at Walk Ending",
      sub: "Sign-in, the data it holds, its terms",
    });
    const stale = await stack.ask("POST", `/data/tools/${String(ending.tool_id)}/review`, {
      on: addDays(addMonths(today(), -12), -1),
      by: WALKER,
    });
    expect((stale.json!.tool as Body).checks).toContain(
      `Not looked at since ${dayOf(addDays(addMonths(today(), -12), -1))}.`,
    );
  });

  it("search finds tools only, by name, what, legal name, plan and category", async () => {
    const found = async (q: string) =>
      ((
        (await stack.ask("GET", `/data/_test/tools/search?q=${encodeURIComponent(q)}`)).json!
          .groups as Body[]
      )[0]?.hits ?? []) as Body[];
    expect((await found("walk mail")).map((hit) => hit.title)).toEqual(["Walk Mail"]);
    expect((await found("private limited")).map((hit) => hit.title)).toEqual(["Walk Mail"]);
    expect((await found("enterprise"))[0]).toMatchObject({
      kind: "tool",
      subtitle: "Mail and documents · In use",
      href: `/data/systems/tools/${mailId}`,
    });
    expect(await found("code")).toHaveLength(1);
    expect(await found("walk.one")).toEqual([]);
    expect(await found("shared")).toEqual([]);
  });

  it("the agenda gives renewals only, with the plain words and reminders 14 and 3", async () => {
    const items = (await stack.ask("GET", "/data/_test/tools/agenda")).json!.items as Body[];
    const mail = items.find((item) => item.key === `tool:${mailId}:renewal`);
    expect(mail).toMatchObject({
      kind: "tool",
      plain: "Tool renewal",
      on: addDays(today(), 10),
      remind_days: [14, 3],
    });
    expect(
      items.every((item) => item.kind === "tool" && String(item.key).endsWith(":renewal")),
    ).toBe(true);
    expect(JSON.stringify(items)).not.toContain("walk.one");
  });

  it("the sub-processor block, its CSV, keep in Files twice, usedFor, the overview and the evidence", async () => {
    const marked = await stack.ask("POST", `/data/tools/${mailId}/update`, {
      subprocessor: {
        purpose: "Mail for customers",
        locations: "India",
        dpa_signed_on: addDays(today(), -10),
        since: addDays(today(), -100),
      },
      dpa_copy: {
        content: Buffer.from("%PDF-1.4\n% Invented walk agreement\n").toString("base64"),
        name: "walk-dpa.pdf",
      },
      by: WALKER,
    });
    expect(marked.status, JSON.stringify(marked.json)).toBe(200);
    const detail = marked.json!.tool as Body;
    const dpaFile = String((detail.subprocessor as Body).dpa_file_id);
    expect(dpaFile).not.toBe("null");
    expect(detail.checks).not.toContain("No data processing agreement is recorded.");
    const csv = await build("tools_subprocessors_csv");
    expect(csv.startsWith("﻿")).toBe(true);
    expect(csv).toContain(
      `Walk Mail,Walk Mail Private Limited,Mail for customers,Customer data; Personal data,India,${addDays(today(), -10)},${addDays(today(), -100)}`,
    );
    const kept = await stack.ask("POST", "/data/tools/subprocessors/keep", { by: WALKER });
    expect(kept.status).toBe(200);
    const file = kept.json!.file as Body;
    expect(file).toMatchObject({ title: "Sub-processors", versions: 1 });
    const same = await stack.ask("POST", "/data/tools/subprocessors/keep", { by: WALKER });
    expect((same.json!.file as Body).file_id).toBe(file.file_id);
    expect((same.json!.file as Body).versions).toBe(1);
    await stack.ask("POST", `/data/tools/${mailId}/update`, {
      subprocessor: { purpose: "Mail and documents for customers" },
      by: WALKER,
    });
    const second = await stack.ask("POST", "/data/tools/subprocessors/keep", { by: WALKER });
    expect((second.json!.file as Body).file_id).toBe(file.file_id);
    expect((second.json!.file as Body).versions).toBe(2);
    const used = async (fileId: string) =>
      (await stack.ask("GET", `/data/_test/tools/lookup?file=${fileId}`)).json!.used_for;
    expect(await used(dpaFile)).toEqual([
      { label: "Data processing agreement with Walk Mail", href: `/data/systems/tools/${mailId}` },
    ]);
    expect(await used(String(file.file_id))).toEqual([
      { label: "The sub-processor list", href: "/data/systems" },
    ]);
    const overview = await stack.ask("GET", "/data/overview");
    expect(overview.json!.systems).toMatchObject({
      tools: 5,
      accounts_open: 2,
      subprocessors: 1,
      // The look owed since yesterday comes before every renewal.
      next: { title: "Look again at Walk Ending" },
    });
    const lookup = (await stack.ask("GET", "/data/_test/tools/lookup")).json!;
    expect(lookup.evidence).toEqual([
      {
        ref: "tools:register",
        label: "Tools register: 5 tools",
        href: "/data/systems",
        current: false,
        why: "1 tool not looked at in a year.",
      },
      {
        ref: "tools:subprocessors",
        label: "Sub-processor list: 1 service",
        href: "/data/systems",
        current: true,
        why: "",
      },
    ]);
    const lines = lookup.summary as Body[];
    expect(lines.map((line) => line.key)).toEqual(["tools", "two-step", "accounts"]);
    expect(lines[0]).toMatchObject({
      words: "5 tools in use; 1 holds customer data.",
      attention: false,
    });
    expect(lines[1]).toMatchObject({
      words: "Every tool that records it enforces two-step sign-in.",
      attention: false,
    });
    expect(lines[2]).toMatchObject({ words: "2 accounts open in 1 tool; 1 shared." });
    const tools = lookup.tools as Body[];
    expect(tools.at(-1)).toMatchObject({ name: "Walk Spare", retired: true });
  });

  it("the tools CSV defuses a formula, and the accounts CSV an Admin downloads has no ledger column", async () => {
    await add({ name: "Walk Formula", what: "=SUM(1)" });
    const csv = await build("tools_csv");
    expect(csv.startsWith("﻿")).toBe(true);
    expect(csv).toContain("Walk Formula,'=SUM(1),");
    expect(csv).not.toContain(",=SUM(1)");
    const accounts = await build("tools_accounts_csv");
    expect(accounts.split("\r\n")[0]).toBe(
      "﻿Tool,Holder,Kind,Role,Two-step sign-in,Critical,Opened,Closed,Closed note",
    );
    const owners = await build("tools_accounts_csv", { owner: true });
    expect(owners.split("\r\n")[0]).toContain(",In the people ledger,Close by");
  });

  it("retires once its accounts are closed, and comes back", async () => {
    const accounts = (await stack.ask("GET", `/data/tools/${mailId}`)).json!.accounts as Body[];
    for (const row of accounts)
      await stack.ask("POST", `/data/tools/accounts/${String(row.account_id)}/close`, {
        by: WALKER,
      });
    expect(await refused(`/data/tools/${mailId}/retire`, { why: "" })).toBe(
      "Say why in a few words.",
    );
    const retired = await stack.ask("POST", `/data/tools/${mailId}/retire`, {
      why: "Moved to another suite",
      by: WALKER,
    });
    expect((retired.json!.tool as Body).retired).toMatchObject({ why: "Moved to another suite" });
    expect(await refused(`/data/tools/${mailId}/accounts`, { holder: "Walk Late" })).toBe(
      "That tool is retired.",
    );
    const back = await stack.ask("POST", `/data/tools/${mailId}/retire`, {
      undo: true,
      by: WALKER,
    });
    expect((back.json!.tool as Body).retired).toBeNull();
  });
});

function dayOf(day: string): string {
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  const [year = "", month = "", date = ""] = day.split("-");
  return `${Number(date)} ${months[Number(month) - 1] ?? ""} ${year}`;
}
