// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  addIncidentCustomer,
  customerTold,
  logIncident,
  readIncident,
  readIncidents,
  readRunbooks,
  recordBoardReport,
  recordCertInReport,
  recordNotReportable,
  setIncidentStatus,
  setRunbook,
  updateIncident,
  withdrawCustomer,
} from "@/lib/data/api/incidents";
import { readDataOverview } from "@/lib/data/api/overview";
import { istInstant } from "@/lib/data/labels-duties";
import { WALKER, startStack, type Stack } from "./helpers";

/**
 * The portal's incidents client against the real stack (ws-notes/duties/spec.md §6.6):
 * every answer passes its schema, with and without the rule book, each clock state the
 * union names, and a refusal arrives as the service's sentence. Invented incidents only.
 */

let stack: Stack;
const pin = (day: string, time: string) =>
  stack.ask("POST", "/data/_test/incidents/now", { by: WALKER, at: istInstant(day, time) });

beforeAll(async () => {
  stack = await startStack({ env: true, modules: ["files", "company", "incidents"] });
}, 60_000);
afterAll(() => stack.stop());

describe("the portal and the incident register agree", () => {
  it("without the rule book: no_rule clocks parse, and the list's rule is null", async () => {
    await pin("2026-11-13", "23:00");
    const made = await logIncident(
      {
        title: "Walk contract one",
        kind: "phishing",
        aware_day: "2026-11-13",
        aware_time: "21:40",
      },
      WALKER,
      crypto.randomUUID(),
    );
    expect(made.incident.clock.cert_in.state).toBe("no_rule");
    const list = await readIncidents();
    expect(list.rule).toBeNull();
    expect(list.incidents[0]!.reference).toBe("INC-2026-001");
  });

  it("with the stand-in rules: due, reported, not listed, not reportable, the Board and customers", async () => {
    await stack.ask("POST", "/data/_test/incidents/duty-rules", { by: WALKER });
    await pin("2027-05-20", "11:00");
    const made = await logIncident(
      {
        title: "Walk contract two",
        kind: "data_breach",
        personal_data: true,
        aware_day: "2027-05-20",
        aware_time: "10:00",
      },
      WALKER,
      crypto.randomUUID(),
    );
    expect(made.incident.clock.cert_in.state).toBe("due");
    expect(made.incident.clock.board.state).toBe("due");
    const id = made.incident.incident_id;
    const customer = await addIncidentCustomer(
      id,
      { name: "Walk Customer Ltd", hours: "24", waitlist_entry_id: "" },
      WALKER,
      crypto.randomUUID(),
    );
    const rowId = customer.incident.customers[0]!.row_id;
    await customerTold(id, rowId, { day: "2027-05-20", time: "10:30", how: "Email" }, WALKER);
    const reported = await recordCertInReport(
      id,
      {
        sent_day: "2027-05-20",
        sent_time: "10:45",
        channel: "email",
        reference: "WALK-CERT-0002",
        sent_by: "Walk Owner",
        late_reason: "",
      },
      WALKER,
    );
    expect(reported.incident.clock.cert_in).toMatchObject({
      state: "reported",
      margin_words: "with 5 hours 15 minutes to spare",
    });
    const board = await recordBoardReport(
      id,
      { sent_day: "2027-05-20", sent_time: "10:50", reference: "WALK-BOARD-0001" },
      WALKER,
    );
    expect(board.incident.clock.board.state).toBe("reported");
    await updateIncident(id, { lessons: "Invented lesson." }, WALKER);
    await setIncidentStatus(id, { to: "contained", day: "2027-05-20", time: "10:55" }, WALKER);
    const page = await readIncident(id);
    expect(page.incident.clock.customers[0]!.state).toBe("told");
    expect(page.events.length).toBeGreaterThan(3);

    const other = await logIncident(
      { title: "Walk contract three", kind: "other", aware_day: "2027-05-20", aware_time: "10:00" },
      WALKER,
      crypto.randomUUID(),
    );
    expect(other.incident.clock.cert_in.state).toBe("not_listed");
    const second = await addIncidentCustomer(
      other.incident.incident_id,
      { name: "Walk Withdrawn Ltd", hours: "48", waitlist_entry_id: "" },
      WALKER,
      crypto.randomUUID(),
    );
    await withdrawCustomer(
      other.incident.incident_id,
      second.incident.customers[0]!.row_id,
      WALKER,
    );

    const decided = await logIncident(
      { title: "Walk contract four", kind: "dos", aware_day: "2027-05-20", aware_time: "10:00" },
      WALKER,
      crypto.randomUUID(),
    );
    const notReportable = await recordNotReportable(
      decided.incident.incident_id,
      { why: "Invented: nothing reached a system.", decided_by: "Walk Lawyer", on: "2027-05-20" },
      WALKER,
    );
    expect(notReportable.incident.clock.cert_in.state).toBe("not_reportable");

    const earlier = await logIncident(
      {
        title: "Walk contract five",
        kind: "data_leak",
        personal_data: true,
        aware_day: "2027-05-11",
        aware_time: "10:00",
      },
      WALKER,
      crypto.randomUUID(),
    );
    expect(earlier.incident.clock.board).toEqual({
      state: "not_in_force",
      starts_on: "2027-05-12",
    });

    await pin("2027-05-21", "09:00");
    const all = await readIncidents("all");
    expect(all.incidents.map((row) => row.cert_in.state)).toContain("overdue");
    const overview = await readDataOverview();
    expect(overview.due.some((item) => item.kind === "incident")).toBe(true);
  });

  it("the runbooks parse, and a refusal is the service's sentence", async () => {
    const books = await readRunbooks();
    expect(books.runbooks).toHaveLength(21);
    expect((await setRunbook("phishing", null, WALKER)).runbooks[6]!.file).toBeNull();
    await expect(
      logIncident(
        { title: "Hi", kind: "dos", aware_day: "2027-05-21", aware_time: "08:00" },
        WALKER,
        crypto.randomUUID(),
      ),
    ).rejects.toMatchObject({ status: 400, message: "Say what happened in 3 to 200 characters." });
  });
});
