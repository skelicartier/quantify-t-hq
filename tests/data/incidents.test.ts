// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { standInDutyRules } from "../../scripts/data/duties-contracts";
import { boardClock, certInClock, customerClocks } from "../../scripts/data/incidents/clock";
import type { Incident } from "../../scripts/data/incidents/types";
import { istInstant } from "../../src/lib/data/labels-duties";
import { WALKER, codeOf, startStack, type Stack } from "./helpers";

/**
 * Incidents (ws-notes/duties/spec.md §5.2, §6.3, §6.6): the four CERT-In rows with the clock
 * pinned, his own 4 hours, a kind not on the list, not reportable and its undo, a late
 * report without a reason refused, the Board's clock on both sides of 12 May 2027, a
 * customer's hours, the Due rows and their days, the noticed time frozen after a report,
 * closing refused without a report, the reference numbering across a year's turn in IST,
 * search never reading what is affected, and nothing sent. Every incident is invented.
 */

type Body = Record<string, unknown>;
const at = (day: string, time: string) => istInstant(day, time)!;

const incidentAt = (day: string, time: string, change: Partial<Incident> = {}): Incident => ({
  incident_id: "pure",
  reference: "INC-2026-001",
  title: "Walk phishing message",
  summary: "",
  kind: "phishing",
  severity: "high",
  status: "open",
  personal_data: false,
  occurred_at: null,
  aware_at: at(day, time),
  contained_at: null,
  resolved_at: null,
  closed_at: null,
  systems: "",
  actions: "",
  cert_in: { not_reportable: null, report: null },
  board: { report: null },
  customers: [],
  lessons: "",
  created_at: "",
  created_by: WALKER,
  updated_at: "",
  updated_by: WALKER,
  ...change,
});

const reportAt = (day: string, time: string) => ({
  sent_at: at(day, time),
  channel: "email" as const,
  reference: "WALK-CERT-0001",
  sent_by: "Walk Owner",
  file_id: null,
  late_reason: "",
});

describe("the CERT-In clock, pure (§5.2)", () => {
  const rules = standInDutyRules(() => "2026-11-13");
  const state = rules.state("cert-in-report");

  it("noticed 21:40 IST 13 Nov 2026: report by 03:40 IST 14 Nov, 4 hours 40 minutes left at 23:00", () => {
    const clock = certInClock(incidentAt("2026-11-13", "21:40"), state, at("2026-11-13", "23:00"));
    expect(clock).toEqual({
      state: "due",
      report_by: "2026-11-13T22:10:00.000Z",
      report_by_words: "03:40 IST, 14 Nov 2026",
      minutes_left: 280,
      words: "4 hours 40 minutes left",
    });
  });

  it("reported at 04:10 IST 14 Nov: 30 minutes after the 6 hours", () => {
    const clock = certInClock(
      incidentAt("2026-11-13", "21:40", {
        cert_in: { not_reportable: null, report: reportAt("2026-11-14", "04:10") },
      }),
      state,
      at("2026-11-14", "05:00"),
    );
    expect(clock).toMatchObject({
      state: "reported",
      sent_words: "04:10 IST, 14 Nov 2026",
      margin_words: "30 minutes after the 6 hours",
    });
  });

  it("noticed 09:05 IST 14 Nov, reported 14:55: with 10 minutes to spare", () => {
    const open = certInClock(incidentAt("2026-11-14", "09:05"), state, at("2026-11-14", "09:30"));
    expect(open).toMatchObject({ state: "due", report_by_words: "15:05 IST, 14 Nov 2026" });
    const reported = certInClock(
      incidentAt("2026-11-14", "09:05", {
        cert_in: { not_reportable: null, report: reportAt("2026-11-14", "14:55") },
      }),
      state,
      at("2026-11-14", "15:00"),
    );
    expect(reported).toMatchObject({
      state: "reported",
      margin_words: "with 10 minutes to spare",
    });
  });

  it("an hour and five minutes late reads overdue with its words", () => {
    const clock = certInClock(incidentAt("2026-11-13", "21:40"), state, at("2026-11-14", "04:45"));
    expect(clock).toEqual({
      state: "overdue",
      report_by: "2026-11-13T22:10:00.000Z",
      report_by_words: "03:40 IST, 14 Nov 2026",
      minutes_late: 65,
      words: "1 hour 5 minutes ago",
    });
  });

  it("his own amount of 4 hours gives 01:40 IST, 14 Nov 2026", () => {
    const mine = standInDutyRules(() => "2026-11-13", { "cert-in-report": { amount: 4 } });
    const clock = certInClock(
      incidentAt("2026-11-13", "21:40"),
      mine.state("cert-in-report"),
      at("2026-11-13", "23:00"),
    );
    expect(clock).toMatchObject({ state: "due", report_by_words: "01:40 IST, 14 Nov 2026" });
  });

  it("a kind not on the list runs no clock; without the rule book nothing is worked out", () => {
    expect(
      certInClock(
        incidentAt("2026-11-13", "21:40", { kind: "other" }),
        state,
        at("2026-11-13", "23:00"),
      ),
    ).toEqual({ state: "not_listed" });
    expect(certInClock(incidentAt("2026-11-13", "21:40"), null, at("2026-11-13", "23:00"))).toEqual(
      {
        state: "no_rule",
      },
    );
  });

  it("the Board: from 12 May 2027 only, 72 hours from noticing", () => {
    const rules2027 = standInDutyRules(() => "2027-05-21");
    const after = incidentAt("2027-05-20", "10:00", { personal_data: true });
    expect(
      boardClock(
        after,
        rules2027.state("dpdp-board-report", "2027-05-20"),
        "2027-05-12",
        at("2027-05-20", "11:00"),
      ),
    ).toMatchObject({
      state: "due",
      report_by_words: "10:00 IST, 23 May 2027",
      words: "2 days 23 hours left",
    });
    const before = incidentAt("2027-05-11", "10:00", { personal_data: true });
    expect(
      boardClock(
        before,
        rules2027.state("dpdp-board-report", "2027-05-11"),
        "2027-05-12",
        at("2027-05-11", "11:00"),
      ),
    ).toEqual({ state: "not_in_force", starts_on: "2027-05-12" });
    expect(
      boardClock(incidentAt("2027-05-20", "10:00"), null, "2027-05-12", at("2027-05-20", "11:00")),
    ).toEqual({ state: "no_personal_data" });
  });

  it("a customer's 24 hours from 21:40 IST 13 Nov: tell them by 21:40 IST, 14 Nov 2026", () => {
    const clocks = customerClocks(
      incidentAt("2026-11-13", "21:40", {
        customers: [
          {
            row_id: "walk-row",
            name: "Walk Customer Ltd",
            waitlist_entry_id: null,
            hours: 24,
            told_at: null,
            how: "",
            withdrawn: false,
          },
        ],
      }),
      at("2026-11-13", "23:00"),
    );
    expect(clocks).toEqual([
      {
        row_id: "walk-row",
        tell_by: "2026-11-14T16:10:00.000Z",
        tell_by_words: "21:40 IST, 14 Nov 2026",
        state: "due",
        words: "22 hours 40 minutes left",
      },
    ]);
  });
});

describe("incidents through the service", () => {
  let stack: Stack;
  beforeAll(async () => {
    stack = await startStack({ modules: ["files", "incidents"] });
  }, 60_000);
  afterAll(() => stack.stop());

  const post = (path: string, body: Body = {}) => stack.ask("POST", path, { by: WALKER, ...body });
  const pin = (iso: string | null) => post("/data/_test/incidents/now", { at: iso });
  const message = (answer: { json?: Body | null }) =>
    ((answer.json?.error ?? {}) as { message?: string }).message ?? "";
  const log = async (body: Body) => {
    const answer = await post("/data/incidents", {
      title: "Walk phishing message",
      kind: "phishing",
      severity: "high",
      ...body,
    });
    expect(answer.status, message(answer)).toBe(200);
    return answer.json!.incident as Body & { incident_id: string; clock: Body; reference: string };
  };
  const due = async () =>
    ((await stack.ask("GET", "/data/overview")).json!.due as Body[]).filter(
      (item) => item.kind === "incident",
    );

  it("without the rule book works nothing out and says so in the answer", async () => {
    await pin(at("2026-11-13", "23:00"));
    const made = await log({ aware_day: "2026-11-13", aware_time: "21:40" });
    expect((made.clock as { cert_in: Body }).cert_in).toEqual({ state: "no_rule" });
    const list = (await stack.ask("GET", "/data/incidents")).json!;
    expect(list.rule).toBeNull();
    expect(await due()).toEqual([]);
    // Closed here so the rest starts clean: it needs a decision first.
    await post(`/data/incidents/${made.incident_id}/cert-in/not-reportable`, {
      why: "A test record, made before the rule book was there.",
      decided_by: "Walk Owner",
      on: "2026-11-13",
    });
    const closed = await post(`/data/incidents/${made.incident_id}/status`, {
      to: "closed",
      day: "2026-11-13",
      time: "22:00",
    });
    expect(closed.status).toBe(200);
  });

  it("with the stand-in rules: the clock, the Due row on the deadline's IST day, a late report refused", async () => {
    expect((await post("/data/_test/incidents/duty-rules", {})).json).toMatchObject({
      installed: true,
    });
    await pin(at("2026-11-13", "23:00"));
    const made = await log({
      aware_day: "2026-11-13",
      aware_time: "21:40",
      systems: "the walkfrobnicator mailbox",
    });
    expect(made.reference).toBe("INC-2026-002");
    expect((made.clock as { cert_in: Body }).cert_in).toMatchObject({
      state: "due",
      report_by_words: "03:40 IST, 14 Nov 2026",
      words: "4 hours 40 minutes left",
    });
    const rows = await due();
    expect(rows).toContainEqual({
      key: `incident:${made.incident_id}:cert-in`,
      kind: "incident",
      title: "Report INC-2026-002 to CERT-In by 03:40 IST",
      sub: "Identity theft, spoofing or phishing · noticed 21:40 IST, 13 Nov 2026",
      due_on: "2026-11-14",
      href: `/data/registers/incidents/${made.incident_id}`,
    });
    const list = (await stack.ask("GET", "/data/incidents")).json!;
    expect(list.counts).toEqual({ open: 1, all: 2, report_due: 1 });
    expect(list.rule).toMatchObject({ key: "cert-in-report", confirm_with: "lawyer" });

    await pin(at("2026-11-14", "05:00"));
    const late = await post(`/data/incidents/${made.incident_id}/cert-in/report`, {
      sent_day: "2026-11-14",
      sent_time: "04:10",
      channel: "email",
      reference: "WALK-CERT-0001",
    });
    expect(codeOf(late)).toBe("late_reason");
    expect(message(late)).toBe("It went after the 6 hours. Say why, in a line.");
    const reported = await post(`/data/incidents/${made.incident_id}/cert-in/report`, {
      sent_day: "2026-11-14",
      sent_time: "04:10",
      channel: "email",
      reference: "WALK-CERT-0001",
      late_reason: "Noticed late at night; the walk's contact was asleep.",
      content: Buffer.from("invented report").toString("base64"),
      name: "report.txt",
    });
    expect(reported.status, message(reported)).toBe(200);
    const clock = ((reported.json!.incident as Body).clock as { cert_in: Body }).cert_in;
    expect(clock).toMatchObject({
      state: "reported",
      margin_words: "30 minutes after the 6 hours",
    });
    expect((await due()).some((row) => row.key === `incident:${made.incident_id}:cert-in`)).toBe(
      false,
    );
    const page = (await stack.ask("GET", `/data/incidents/${made.incident_id}`)).json!;
    expect(page.report_file).toMatchObject({ title: "INC-2026-002 report to CERT-In" });

    // The noticed time is frozen once a report is recorded.
    const moved = await post(`/data/incidents/${made.incident_id}/update`, {
      aware_day: "2026-11-13",
      aware_time: "21:00",
    });
    expect(moved.status).toBe(409);
    expect(message(moved)).toBe("When it was noticed cannot change once a report is recorded.");

    // Search reads the title and summary, never what is affected.
    const found = (await stack.ask("GET", "/data/_test/incidents/search?q=phishing")).json!;
    expect((found.groups as Body[])[0]).toMatchObject({ kind: "incident", count: 2 });
    const hidden = (await stack.ask("GET", "/data/_test/incidents/search?q=walkfrobnicator")).json!;
    expect(hidden.groups).toEqual([]);
  });

  it("refuses a time in the future, a short title and a day before noticing", async () => {
    await pin(at("2026-11-14", "10:00"));
    const future = await post("/data/incidents", {
      title: "Walk future",
      kind: "dos",
      aware_day: "2026-11-14",
      aware_time: "10:30",
    });
    expect(message(future)).toBe("That time is in the future.");
    const fastClock = await post("/data/incidents", {
      title: "Walk a clock a little fast",
      kind: "other",
      aware_day: "2026-11-14",
      aware_time: "10:04",
    });
    expect(fastClock.status).toBe(200);
    const short = await post("/data/incidents", {
      title: "Hi",
      kind: "dos",
      aware_day: "2026-11-14",
      aware_time: "09:00",
    });
    expect(message(short)).toBe("Say what happened in 3 to 200 characters.");
    const badTime = await post("/data/incidents", {
      title: "Walk bad time",
      kind: "dos",
      aware_day: "2026-11-14",
      aware_time: "9pm",
    });
    expect(message(badTime)).toBe(
      "Give the day and the time it was noticed, in India time, such as 21:40.",
    );
  });

  it("a kind not on the list: no clock, no Due row, closes without a report", async () => {
    await pin(at("2026-11-14", "12:00"));
    const made = await log({ kind: "other", aware_day: "2026-11-14", aware_time: "11:00" });
    expect((made.clock as { cert_in: Body }).cert_in).toEqual({ state: "not_listed" });
    expect((await due()).some((row) => String(row.key).includes(made.incident_id))).toBe(false);
    const closed = await post(`/data/incidents/${made.incident_id}/status`, {
      to: "closed",
      day: "2026-11-14",
      time: "11:30",
    });
    expect(closed.status).toBe(200);
  });

  it("closing a listed incident needs the report or why not; not reportable and its undo", async () => {
    await pin(at("2026-11-14", "12:00"));
    const made = await log({ kind: "malware", aware_day: "2026-11-14", aware_time: "11:00" });
    const refused = await post(`/data/incidents/${made.incident_id}/status`, {
      to: "closed",
      day: "2026-11-14",
      time: "11:30",
    });
    expect(refused.status).toBe(409);
    expect(message(refused)).toBe(
      "Record the report to CERT-In, or why it was not reportable, before closing.",
    );
    const short = await post(`/data/incidents/${made.incident_id}/cert-in/not-reportable`, {
      why: "No.",
      decided_by: "Walk Owner",
    });
    expect(message(short)).toBe("Say why in 10 to 500 characters.");
    const decided = await post(`/data/incidents/${made.incident_id}/cert-in/not-reportable`, {
      why: "A test file the walk made; nothing reached a system.",
      decided_by: "Walk Lawyer",
      on: "2026-11-14",
    });
    expect(((decided.json!.incident as Body).clock as { cert_in: Body }).cert_in).toEqual({
      state: "not_reportable",
      why: "A test file the walk made; nothing reached a system.",
      decided_by: "Walk Lawyer",
      on: "2026-11-14",
    });
    const undone = await post(`/data/incidents/${made.incident_id}/cert-in/not-reportable`, {
      undo: true,
    });
    expect(((undone.json!.incident as Body).clock as { cert_in: Body }).cert_in).toMatchObject({
      state: "due",
    });
    await post(`/data/incidents/${made.incident_id}/cert-in/not-reportable`, {
      why: "A test file the walk made; nothing reached a system.",
      decided_by: "Walk Lawyer",
    });
    const closed = await post(`/data/incidents/${made.incident_id}/status`, {
      to: "closed",
      day: "2026-11-14",
      time: "11:30",
    });
    expect(closed.status).toBe(200);
    const edit = await post(`/data/incidents/${made.incident_id}/update`, { title: "Walk edit" });
    expect(message(edit)).toBe("That incident is closed. Reopen it to change it.");
    const reopened = await post(`/data/incidents/${made.incident_id}/status`, { to: "open" });
    expect((reopened.json!.incident as Body).status).toBe("open");
  });

  it("a customer's hours, the Due row, then told", async () => {
    await pin(at("2026-11-13", "23:00"));
    const made = await log({ kind: "data_leak", aware_day: "2026-11-13", aware_time: "21:40" });
    const bad = await post(`/data/incidents/${made.incident_id}/customers`, {
      name: "Walk Customer Ltd",
      hours: "721",
    });
    expect(message(bad)).toBe("Type the hours as a whole number from 1 to 720.");
    const added = await post(`/data/incidents/${made.incident_id}/customers`, {
      name: "Walk Customer Ltd",
      hours: "24",
    });
    const incident = added.json!.incident as {
      customers: { row_id: string }[];
      clock: { customers: Body[] };
    };
    const rowId = incident.customers[0]!.row_id;
    expect(incident.clock.customers[0]).toMatchObject({
      tell_by_words: "21:40 IST, 14 Nov 2026",
      state: "due",
    });
    expect(await due()).toContainEqual(
      expect.objectContaining({
        key: `incident:${made.incident_id}:customer:${rowId}`,
        title: `Tell Walk Customer Ltd about ${made.reference} by 21:40 IST`,
        due_on: "2026-11-14",
      }),
    );
    const told = await post(`/data/incidents/${made.incident_id}/customers/${rowId}/told`, {
      day: "2026-11-13",
      time: "22:40",
      how: "Email to their contact",
    });
    expect(
      ((told.json!.incident as Body).clock as { customers: Body[] }).customers[0],
    ).toMatchObject({ state: "told", words: "with 23 hours to spare" });
  });

  it("the Board's clock on both sides of 12 May 2027", async () => {
    await pin(at("2027-05-21", "09:00"));
    const after = await log({
      kind: "data_breach",
      personal_data: true,
      aware_day: "2027-05-20",
      aware_time: "10:00",
    });
    expect(after.reference).toBe("INC-2027-001");
    expect((after.clock as { board: Body }).board).toMatchObject({
      state: "due",
      report_by_words: "10:00 IST, 23 May 2027",
    });
    expect(await due()).toContainEqual(
      expect.objectContaining({
        key: `incident:${after.incident_id}:board`,
        title: "Report INC-2027-001 to the Data Protection Board by 10:00 IST",
        due_on: "2027-05-23",
      }),
    );
    const before = await log({
      kind: "data_breach",
      personal_data: true,
      aware_day: "2027-05-11",
      aware_time: "10:00",
    });
    const clock = before.clock as { board: Body; rules: { board: Body } };
    expect(clock.board).toEqual({ state: "not_in_force", starts_on: "2027-05-12" });
    expect(clock.rules.board).toMatchObject({ starts_on: "2027-05-12", usable: false });
  });

  it("numbers by the year of noticing in IST, across the turn of the year", async () => {
    await pin(at("2027-01-01", "08:00"));
    // INC-2027-001 and -002 are the Board's two above; each year in IST keeps its own count.
    const late = await log({ kind: "other", aware_day: "2026-12-31", aware_time: "23:50" });
    expect(late.reference).toMatch(/^INC-2026-\d{3}$/);
    const early = await log({ kind: "other", aware_day: "2027-01-01", aware_time: "00:10" });
    expect(early.reference).toBe("INC-2027-003");
    // 23:50 IST on 31 Dec is 18:20 UTC; 00:10 IST on 1 Jan is 18:40 UTC on 31 Dec.
    expect(early.aware_at).toBe("2026-12-31T18:40:00.000Z");
  });

  it("the runbooks: a file per kind, and nothing was sent", async () => {
    const runbooks = (await stack.ask("GET", "/data/incidents/runbooks")).json!;
    expect((runbooks.runbooks as Body[]).length).toBe(21);
    const wrong = await post("/data/incidents/runbooks", { kind: "nope", file_id: null });
    expect(message(wrong)).toBe("Choose a kind from the list.");
    const missing = await post("/data/incidents/runbooks", { kind: "phishing", file_id: "nope" });
    expect(missing.status).toBe(404);
    expect(stack.engine.status().sent_today).toBe(0);
    expect(stack.engine.status().counts.mailings).toBe(0);
  });
});

describe("the reference starts at 001 for the first incident of a year", () => {
  let stack: Stack;
  beforeAll(async () => {
    stack = await startStack({ modules: ["incidents"] });
  }, 60_000);
  afterAll(() => stack.stop());

  it("23:50 IST on 31 Dec 2026 is INC-2026-001; 00:10 IST on 1 Jan 2027 is INC-2027-001", async () => {
    await stack.ask("POST", "/data/_test/incidents/now", {
      by: WALKER,
      at: at("2027-01-01", "08:00"),
    });
    const make = async (day: string, time: string) =>
      (
        await stack.ask("POST", "/data/incidents", {
          by: WALKER,
          title: "Walk year turn",
          kind: "other",
          aware_day: day,
          aware_time: time,
        })
      ).json!.incident as { reference: string };
    expect((await make("2026-12-31", "23:50")).reference).toBe("INC-2026-001");
    expect((await make("2027-01-01", "00:10")).reference).toBe("INC-2027-001");
  });
});
