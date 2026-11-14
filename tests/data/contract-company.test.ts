// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { addDays, localDay } from "../../scripts/data/days";
import {
  addDirector,
  ceaseDirector,
  readCompany,
  readDirector,
  readDirectors,
  recordChangeFiled,
  recordContactChange,
  recordKyc,
  saveFacts,
  updateDirector,
} from "@/lib/data/api/company";
import {
  addDate,
  addSuggestedDate,
  confirmRule,
  doneDate,
  markInProgress,
  moveRuleDates,
  notForUsDate,
  readDates,
  readRules,
  recordSignOff,
  setDateOwner,
  setRuleAmount,
  unconfirmRule,
} from "@/lib/data/api/dates";
import { readDataOverview } from "@/lib/data/api/overview";
import { WALKER, startStack, type Stack } from "./helpers";

/**
 * The portal's company and Key dates clients against the real stack (company spec §6.8,
 * §6.10): every answer passes the portal's schemas, the refusals arrive as the service's
 * sentences, and the overview's "The company" block parses. Invented company and people.
 */

let stack: Stack;
const today = () => localDay(new Date());

beforeAll(async () => {
  stack = await startStack({ env: true });
}, 60_000);
afterAll(() => stack.stop());

describe("the portal and the company record agree", () => {
  it("on the facts, group by group, and the overview's block", async () => {
    const empty = await readCompany();
    expect(empty.empty).toBe(true);
    const saved = await saveFacts(
      "dates",
      { incorporated_on: "2025-08-14", first_fy_end: "2026-03-31" },
      WALKER,
    );
    expect(saved.facts.first_fy_end).toBe("2026-03-31");
    await saveFacts("identity", { cin: "U00000JK2025PTC000000", registered_state: "JK" }, WALKER);
    await saveFacts("class", { small: "yes", startup: "no" }, WALKER);
    await saveFacts("registrations", { auditor_name: "Walk Auditors" }, WALKER);
    const page = await readCompany();
    expect(page.decides[0]).toMatchObject({ rule: "First AGM", worked_out: "By 31 Dec 2026" });
    await expect(saveFacts("identity", { pan: "ZZZ" }, WALKER)).rejects.toMatchObject({
      status: 400,
      message: "Type the PAN as ten letters and digits, such as AAACQ1234Q.",
    });
    const overview = await readDataOverview();
    expect(overview.company).toMatchObject({
      incorporated_on: "2025-08-14",
      directors: 0,
      facts_missing: ["Legal name", "PAN"],
    });
  });

  it("on the directors, their contact changes, filings and cessation", async () => {
    const made = await addDirector(
      {
        name: "Walk Director",
        din: "00000000",
        din_allotted_on: "2025-08-01",
        appointed_on: "2025-08-14",
        is_founder: true,
        dsc_expires_on: addDays(today(), 40),
        mca_mobile: "+91 00000 00000",
      },
      WALKER,
      crypto.randomUUID(),
    );
    const id = made.director.director_id;
    expect(made.director.next_kyc?.words).toBe("30 Jun 2029");
    await expect(
      addDirector({ name: "Walk Two", din: "00000000" }, WALKER, crypto.randomUUID()),
    ).rejects.toMatchObject({ status: 409, code: "din_taken" });
    const edited = await updateDirector(id, { designation: "managing" }, WALKER);
    expect(edited.director.designation).toBe("managing");
    const change = await recordContactChange(
      id,
      { field: "mobile", to: "+91 00000 00001", changed_on: today(), add_date: true },
      WALKER,
      crypto.randomUUID(),
    );
    expect(change.key_dates[0]?.title).toBe("DIR-3 KYC-Web: Walk Director's new mobile");
    const filed = await recordChangeFiled(
      id,
      change.change.change_id,
      { filed_on: today(), srn: "WALK-SRN-1" },
      WALKER,
    );
    expect(filed.change.filed?.srn).toBe("WALK-SRN-1");
    const kyc = await recordKyc(id, { filed_on: today(), srn: "WALK-SRN-K" }, WALKER);
    expect(kyc.next_kyc?.due_on).toMatch(/-06-30$/);
    const record = await readDirector(id);
    expect(record.key_dates.find((link) => link.state === "done")?.evidence.srn).toBe("WALK-SRN-1");
    const two = await addDirector(
      { name: "Walk Two", appointed_on: "2025-09-01" },
      WALKER,
      crypto.randomUUID(),
    );
    await expect(
      ceaseDirector(two.director.director_id, "2025-08-01", WALKER),
    ).rejects.toMatchObject({ message: "A director cannot cease before being appointed." });
    const ceased = await ceaseDirector(two.director.director_id, today(), WALKER);
    expect(ceased.director.ceased_on).toBe(today());
    expect((await readDirectors()).directors.map((row) => row.name)).toEqual(["Walk Director"]);
    expect((await readDirectors(true)).counts).toEqual({ in_office: 1, ceased: 1 });
    await expect(readDirector("not-a-director")).rejects.toMatchObject({
      status: 404,
      code: "not_found",
    });
  });
});

describe("the portal and Key dates' new answers agree", () => {
  it("on suggestions from the record, evidence, in progress, owner, not for us and the sign-off", async () => {
    const page = await readDates();
    expect(page.facts_known).toBe(true);
    expect(page.suggestions.find((row) => row.key === "agm")).toMatchObject({
      group: "company",
      next: "2026-12-31",
    });
    expect(page.hidden.map((row) => row.key)).toContain("dir-3-kyc");
    const agm = await addSuggestedDate("agm", {}, WALKER, crypto.randomUUID());
    expect(agm.date).toMatchObject({ statutory: true, rule_key: "first-agm" });
    await expect(notForUsDate(agm.date.date_id, "No.", WALKER)).rejects.toMatchObject({
      status: 400,
      message: "Say which professional confirmed it does not apply, their role and the day.",
    });
    const signed = await notForUsDate(agm.date.date_id, "Held.", WALKER, {
      sign_off_name: "Walk CS",
      sign_off_role: "CS",
      sign_off_on: today(),
    });
    expect(signed.date.sign_off?.name).toBe("Walk CS");
    const typed = await addDate(
      {
        title: "Walk filing",
        kind: "filing",
        due_on: addDays(today(), 2),
        repeats: "never",
        entity: "The Indian company",
        handled_by: "",
        remind_days: 7,
        notes: "",
        file_id: "",
      },
      WALKER,
      crypto.randomUUID(),
    );
    const moving = await markInProgress(typed.date.date_id, "With the CA.", WALKER);
    expect(moving.date.shown_state).toBe("in_progress");
    const owner = await setDateOwner(
      typed.date.date_id,
      { owner_role: "ca", handled_by: "Walk CA" },
      WALKER,
    );
    expect(owner.date.owner_role).toBe("ca");
    const done = await doneDate(typed.date.date_id, "Filed.", WALKER, {
      srn: "WALK-SRN-5",
      fee_paid: "300",
      filed_on: today(),
      content: Buffer.from("%PDF-1.4\n% invented\n").toString("base64"),
      name: "walk.pdf",
    });
    expect(done.date).toMatchObject({
      state: "done",
      evidence: { srn: "WALK-SRN-5", fee_paid: 300 },
    });
    expect(done.date.filed_file?.title).toMatch(/^Walk filing – filed /);
    const nope = await notForUsDate(
      (
        await addDate(
          {
            title: "Walk renewal",
            kind: "renewal",
            due_on: addDays(today(), 60),
            repeats: "never",
            entity: "",
            handled_by: "",
            remind_days: 14,
            notes: "",
            file_id: "",
          },
          WALKER,
          crypto.randomUUID(),
        )
      ).date.date_id,
      "Not ours.",
      WALKER,
    );
    const later = await recordSignOff(
      nope.date.date_id,
      { sign_off_name: "Walk CA", sign_off_role: "CA", sign_off_on: today() },
      WALKER,
    );
    expect(later.date.sign_off?.role).toBe("CA");
    const all = await readDates("all");
    expect(all.dates.find((row) => row.date_id === typed.date.date_id)?.evidence.srn).toBe(
      "WALK-SRN-5",
    );
  });

  it("on the rule book", async () => {
    const rules = await readRules();
    expect(rules.rules.find((rule) => rule.key === "aoc-4")?.late_words).toContain("₹100 a day");
    const changed = await setRuleAmount("pas-3", "30", WALKER);
    expect(changed.rule.clock).toBe("30 days after the allotment");
    const confirmed = await confirmRule(
      "pas-3",
      { name: "Walk CS", role: "CS", on: today() },
      WALKER,
    );
    expect(confirmed.rule.confirmed?.name).toBe("Walk CS");
    const removed = await unconfirmRule("pas-3", WALKER);
    expect(removed.rule.confirmed).toBeNull();
    expect((await moveRuleDates("pas-3", WALKER)).moved).toBe(0);
    await expect(setRuleAmount("fla", 3, WALKER)).rejects.toMatchObject({
      status: 409,
      code: "fixed_day",
      message: "This rule is a fixed day of the year, so there is no amount to change.",
    });
    const view = await readDates("rules");
    expect(view.view).toBe("rules");
  });
});
