// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { addMonths } from "../../scripts/data/company-contracts";
import { addDays, localDay } from "../../scripts/data/days";
import { standInDutyRules, type DutyRuleKey } from "../../scripts/data/duties-contracts";
import { clocksOf, feeCheck, nextClock } from "../../scripts/data/marks/clocks";
import type { Mark } from "../../scripts/data/marks/types";
import { WALKER, startStack, type Stack } from "./helpers";

/**
 * Trademarks (ws-notes/duties/spec.md §5.2, §6.4, §6.6): every clock row of §5.2, the fee
 * check unconfirmed and confirmed, the refusals, the statuses a step implies, Due from 30
 * days before (the renewal from its window), the calendar with the opposition window, dead
 * states ending the clocks, a renewal restarting the last four, watch notes and a paper in
 * Files. Every mark is invented.
 */

type Body = Record<string, unknown>;
const today = () => localDay(new Date());
const rules = standInDutyRules(() => "2026-11-19");
const stateOf = (key: DutyRuleKey) => rules.state(key);

const markWith = (
  change: Partial<Omit<Mark, "steps">> & { steps?: Partial<Mark["steps"]> } = {},
): Mark => ({
  mark_id: "pure",
  name: "WALK MARK",
  kind: "word",
  class_number: 9,
  goods: "Software",
  application_number: "WALK-0000001",
  applied_on: "2026-11-14",
  applicant: "Walk Company Private Limited",
  agent: "Walk Agent",
  agent_contact_id: null,
  filed_as_startup: "yes",
  fee_paid: null,
  status: "filed",
  status_on: "2026-11-14",
  renewals: [],
  watch: [],
  file_ids: [],
  notes: "",
  created_at: "",
  created_by: WALKER,
  updated_at: "",
  updated_by: WALKER,
  ...change,
  steps: {
    deficiency_notice_on: null,
    deficiency_fixed_on: null,
    exam_report_on: null,
    exam_reply_on: null,
    hearing_on: null,
    journal_number: "",
    journal_on: null,
    opposition_notice_on: null,
    counter_statement_on: null,
    registered_on: null,
    certificate_number: "",
    expires_on: null,
    ...(change.steps ?? {}),
  },
});

const dueOf = (mark: Mark, key: string, on = "2026-11-19") =>
  clocksOf(mark, stateOf, on).find((clock) => clock.key === key)?.due_on;

describe("the clocks of §5.2", () => {
  it("remedy a deficiency: notice 9 Dec 2026 → 9 Jan 2027", () => {
    expect(dueOf(markWith({ steps: { deficiency_notice_on: "2026-12-09" } }), "deficiency")).toBe(
      "2027-01-09",
    );
  });

  it("reply to the examination report: 3 Dec 2026 → 3 Jan 2027; 31 Jan 2027 → 28 Feb 2027", () => {
    expect(dueOf(markWith({ steps: { exam_report_on: "2026-12-03" } }), "exam_reply")).toBe(
      "2027-01-03",
    );
    expect(dueOf(markWith({ steps: { exam_report_on: "2027-01-31" } }), "exam_reply")).toBe(
      "2027-02-28",
    );
  });

  it("opposition closes 18 May 2027 for the Journal of 18 Jan 2027; counter-statement 31 May 2027", () => {
    expect(dueOf(markWith({ steps: { journal_on: "2027-01-18" } }), "opposition")).toBe(
      "2027-05-18",
    );
    expect(
      dueOf(markWith({ steps: { opposition_notice_on: "2027-03-31" } }), "counter_statement"),
    ).toBe("2027-05-31");
  });

  it("applied 14 Nov 2026: expires 14 Nov 2036, renewal opens 14 Nov 2035, late renewal to 14 May 2037, restoration to 14 Nov 2037", () => {
    const mark = markWith();
    expect(dueOf(mark, "expiry")).toBe("2036-11-14");
    expect(dueOf(mark, "renewal_opens")).toBe("2035-11-14");
    expect(dueOf(mark, "late_renewal_ends")).toBe("2037-05-14");
    expect(dueOf(mark, "restoration_ends")).toBe("2037-11-14");
  });

  it("the certificate's own expiry wins; a renewal restarts the last four", () => {
    const typed = markWith({ steps: { expires_on: "2036-11-20" } });
    expect(dueOf(typed, "expiry")).toBe("2036-11-20");
    const renewed = markWith({
      renewals: [
        {
          renewed_on: "2036-10-01",
          expires_on: "2046-11-14",
          srn: "WALK-SRN-1",
          by: WALKER,
          at: "",
        },
      ],
    });
    expect(dueOf(renewed, "expiry")).toBe("2046-11-14");
    expect(dueOf(renewed, "renewal_opens")).toBe("2045-11-14");
  });

  it("a dead mark ends every clock; a removed one keeps restoration open", () => {
    const refused = clocksOf(
      markWith({ status: "refused", steps: { exam_report_on: "2026-12-03" } }),
      stateOf,
      "2026-12-10",
    );
    expect(refused.every((clock) => !clock.open)).toBe(true);
    const removed = clocksOf(markWith({ status: "removed" }), stateOf, "2026-12-10");
    expect(removed.filter((clock) => clock.open).map((clock) => clock.key)).toEqual([
      "restoration_ends",
    ]);
  });

  it("the next date is the earliest open clock; without the rule book nothing is worked out", () => {
    const mark = markWith({ steps: { exam_report_on: "2026-12-03", journal_on: "2027-01-18" } });
    expect(nextClock(clocksOf(mark, stateOf, "2026-12-10"))).toMatchObject({
      key: "exam_reply",
      due_on: "2027-01-03",
    });
    const none = clocksOf(mark, () => null, "2026-12-10");
    expect(none.find((clock) => clock.key === "exam_reply")).toMatchObject({
      due_on: null,
      rule: null,
    });
    expect(none.some((clock) => clock.key === "expiry")).toBe(false);
  });
});

describe("the fee check", () => {
  it("compares nothing until a reading is confirmed", () => {
    expect(
      feeCheck({ filed_as_startup: "yes", fee_paid: 9000 }, rules.state("tm-fee-startup")),
    ).toEqual({ words: null });
    expect(
      feeCheck({ filed_as_startup: "no", fee_paid: 9000 }, rules.state("tm-fee-startup")),
    ).toBeNull();
  });

  it("confirmed at ₹4,500: ₹9,000 paid is ₹4,500 more; ₹4,500 is the startup fee", () => {
    const confirmed = standInDutyRules(() => "2026-11-19", {
      "tm-fee-startup": { reading: 0, confirmed: { name: "Walk Agent", on: "2026-11-19" } },
    }).state("tm-fee-startup");
    expect(feeCheck({ filed_as_startup: "yes", fee_paid: 9000 }, confirmed)).toEqual({
      words: "₹4,500 more than the startup fee for 1 class. Confirm with your trademark agent.",
    });
    expect(feeCheck({ filed_as_startup: "yes", fee_paid: 4500 }, confirmed)).toEqual({
      words: "The startup fee for 1 class.",
    });
  });
});

describe("trademarks through the service", () => {
  let stack: Stack;
  beforeAll(async () => {
    stack = await startStack({ modules: ["files", "marks"] });
  }, 60_000);
  afterAll(() => stack.stop());

  const post = (path: string, body: Body = {}) => stack.ask("POST", path, { by: WALKER, ...body });
  const message = (answer: { json?: Body | null }) =>
    ((answer.json?.error ?? {}) as { message?: string }).message ?? "";
  const due = async () =>
    ((await stack.ask("GET", "/data/overview")).json!.due as Body[]).filter(
      (item) => item.kind === "mark",
    );

  it("without the rule book: the fee's two readings, no rule, nothing worked out", async () => {
    const page = (await stack.ask("GET", "/data/marks")).json!;
    expect(page.marks).toEqual([]);
    expect(page.fee).toMatchObject({ rule: null });
    expect(((page.fee as Body).readings as Body[]).map((reading) => reading.label)).toEqual([
      "₹4,500",
      "₹9,000",
    ]);
  });

  it("refuses a class outside 1 to 45, a bad fee, a step before the application", async () => {
    await post("/data/_test/marks/duty-rules");
    const page = (await stack.ask("GET", "/data/marks")).json!;
    expect((page.fee as Body).rule).toMatchObject({
      key: "tm-fee-startup",
      usable: false,
      readings: ["₹4,500", "₹9,000"],
    });
    expect(message(await post("/data/marks", { name: "WALK MARK", class_number: "46" }))).toBe(
      "A class is a number from 1 to 45.",
    );
    expect(
      message(await post("/data/marks", { name: "WALK MARK", class_number: "9", fee_paid: "0" })),
    ).toBe("Type the fee as whole rupees, from 1 to 1,00,00,000.");
    const made = await post("/data/marks", {
      name: "WALK MARK",
      class_number: "9",
      application_number: "WALK-0000001",
      applied_on: addDays(today(), -40),
      agent: "Walk Agent",
      filed_as_startup: "yes",
      fee_paid: "9000",
    });
    expect(made.status, message(made)).toBe(200);
    const again = await post("/data/marks", {
      name: "walk mark",
      class_number: "9",
      application_number: "WALK-0000001",
    });
    expect(message(again)).toBe("That mark and class is already here.");
    const id = (made.json!.mark as { mark_id: string }).mark_id;
    const early = await post(`/data/marks/${id}/step`, {
      step: "exam_report",
      on: addDays(today(), -41),
    });
    expect(message(early)).toBe("A step cannot be before the application.");
    const noReport = await post(`/data/marks/${id}/step`, { step: "exam_reply", on: today() });
    expect(message(noReport)).toBe("Record the examination report first.");
    const future = await post(`/data/marks/${id}/step`, {
      step: "exam_report",
      on: addDays(today(), 1),
    });
    expect(message(future)).toBe("That day is in the future.");
  });

  it("a step sets the status it implies; the reply is in Due from 30 days before", async () => {
    const list = (await stack.ask("GET", "/data/marks")).json!.marks as Body[];
    const id = String(list[0]!.mark_id);
    const reported = await post(`/data/marks/${id}/step`, {
      step: "exam_report",
      on: addDays(today(), -5),
    });
    expect((reported.json!.mark as Body).status).toBe("objected");
    const replyBy = addMonths(addDays(today(), -5), 1);
    expect((reported.json!.mark as Body).next).toMatchObject({ on: replyBy });
    expect(await due()).toContainEqual({
      key: `mark:${id}:exam_reply`,
      kind: "mark",
      title: "Reply to the examination report: WALK MARK, class 9",
      sub: "WALK-0000001 · Walk Agent",
      due_on: replyBy,
      href: `/data/registers/marks/${id}`,
    });
    const page = (await stack.ask("GET", `/data/marks/${id}`)).json!;
    expect(page.fee_check).toMatchObject({ words: null });
    await post(`/data/marks/${id}/step`, { step: "exam_reply", on: today() });
    expect((await due()).some((row) => row.key === `mark:${id}:exam_reply`)).toBe(false);
    const journal = await post(`/data/marks/${id}/step`, {
      step: "journal",
      on: today(),
      number: "WALK-J-2131",
    });
    expect(journal.json!.mark).toMatchObject({ status: "accepted_and_advertised" });
    const agenda = (await stack.ask("GET", "/data/_test/marks/agenda")).json!.items as Body[];
    expect(agenda).toContainEqual(
      expect.objectContaining({
        key: `mark:${id}:opposition`,
        title: "Opposition window closes: WALK MARK, class 9",
        plain: "Trademark deadline",
        remind_days: [14, 7],
        on: addMonths(today(), 4),
      }),
    );
    // The opposition window is information: never a Due row.
    expect((await due()).some((row) => row.key === `mark:${id}:opposition`)).toBe(false);
  });

  it("the fee check once confirmed, watch notes, a paper in Files, search", async () => {
    await post("/data/_test/marks/duty-rules", {
      stored: {
        "tm-fee-startup": { reading: 0, confirmed: { name: "Walk Agent", on: today() } },
      },
    });
    const list = (await stack.ask("GET", "/data/marks")).json!.marks as Body[];
    const id = String(list[0]!.mark_id);
    const page = (await stack.ask("GET", `/data/marks/${id}`)).json!;
    expect(page.fee_check).toMatchObject({
      words: "₹4,500 more than the startup fee for 1 class. Confirm with your trademark agent.",
      rule: { confirmed_by: "Walk Agent" },
    });
    expect(message(await post(`/data/marks/${id}/watch`, { text: "x" }))).toBe(
      "Write the note in 2 to 1,000 characters.",
    );
    const noted = await post(`/data/marks/${id}/watch`, { text: "WALKY MARC in Journal 2131" });
    expect(((noted.json!.mark as Body).watch as Body[])[0]).toMatchObject({
      text: "WALKY MARC in Journal 2131",
    });
    const filed = await post(`/data/marks/${id}/files`, {
      content: Buffer.from("invented examination report").toString("base64"),
      name: "exam-report.txt",
    });
    expect(filed.status, message(filed)).toBe(200);
    expect((filed.json!.files as { file: Body }[])[0]!.file).toMatchObject({
      title: "WALK MARK, class 9",
    });
    const found = (await stack.ask("GET", "/data/_test/marks/search?q=walk-0000001")).json!;
    expect((found.groups as Body[])[0]).toMatchObject({ kind: "mark", count: 1 });
  });

  it("the renewal is in Due from the day its window opens, and a renewal restarts it", async () => {
    const made = await post("/data/marks", {
      name: "WALK OLD MARK",
      class_number: "42",
      application_number: "WALK-0000002",
      applied_on: "2016-12-01",
      expires_on: addDays(today(), 200),
      status: "registered",
    });
    const id = (made.json!.mark as { mark_id: string }).mark_id;
    expect(await due()).toContainEqual(
      expect.objectContaining({
        key: `mark:${id}:renewal`,
        title: "Renew WALK OLD MARK, class 42",
        due_on: addDays(today(), 200),
      }),
    );
    const page = (await stack.ask("GET", `/data/marks/${id}`)).json!;
    expect(page.renewal_expires_on).toBe(addMonths(addDays(today(), 200), 120));
    const before = await post(`/data/marks/${id}/renewed`, {
      renewed_on: today(),
      expires_on: addDays(today(), 100),
    });
    expect(message(before)).toBe("The new expiry must be after the old one.");
    await post(`/data/marks/${id}/renewed`, {
      renewed_on: today(),
      expires_on: String(page.renewal_expires_on),
      srn: "WALK-SRN-0001",
    });
    expect((await due()).some((row) => row.key === `mark:${id}:renewal`)).toBe(false);
    const withdrawn = await post(`/data/marks/${id}/status`, { status: "withdrawn" });
    expect((withdrawn.json!.mark as Body).next).toBeNull();
    expect(stack.engine.status().sent_today).toBe(0);
  });
});
