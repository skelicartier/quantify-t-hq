// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { addDays, localDay } from "../../scripts/data/days";
import { inOffice } from "../../scripts/data/company/book";
import { checksOf, gstinCheck } from "../../scripts/data/company/checks";
import { EMPTY_FACTS, type Director, type Facts } from "../../scripts/data/company/types";
import { WALKER, codeOf, startStack, type Stack } from "./helpers";

/**
 * The company record (company spec §6.3, §6.4, §6.10): every refusal of the facts and the
 * directors, the four groups saved one at a time, each check from facts made for it, the
 * GSTIN's check character, a director added, edited and ceased, a contact change with and
 * without its Key date, the filing, who is in office on a day, and the overview's block.
 * The company, its numbers and its people are invented, with the reserved numbers of §2.
 */

type Body = Record<string, unknown>;
const today = () => localDay(new Date());

type FactsChange = Partial<Omit<Facts, "flags">> & { flags?: Partial<Facts["flags"]> };

const facts = (change: FactsChange = {}): Facts => ({
  ...structuredClone(EMPTY_FACTS),
  ...change,
  flags: { ...EMPTY_FACTS.flags, ...(change.flags ?? {}) },
  dpiit: change.dpiit ?? { number: "", recognised_on: null },
});

describe("the checks, pure", () => {
  it("finds nothing in facts that agree", () => {
    const first14 = "01ZZZCZ0000Z1Z";
    expect(
      checksOf(
        facts({
          cin: "U00000JK2025PTC000000",
          pan: "ZZZCZ0000Z",
          gstin: `${first14}${gstinCheck(first14)}`,
          registered_state: "JK",
          incorporated_on: "2025-08-14",
          dpiit: { number: "DIPP000000", recognised_on: null },
          flags: { small: "yes", subsidiary: "no", gst_registered: "yes", startup: "yes" },
        }),
      ),
    ).toEqual([]);
  });

  it("says each sentence for facts made to fail it", () => {
    expect(checksOf(facts({ flags: { subsidiary: "yes", small: "yes" } }))).toEqual([
      "A subsidiary cannot be a small company. Check both answers with your CS.",
    ]);
    expect(checksOf(facts({ pan: "ZZZPZ0000Z" }))).toEqual([
      "For a company the PAN's fourth letter is C. Check the PAN.",
    ]);
    const lines = checksOf(facts({ pan: "ZZZCZ0000Z", gstin: "00ZZZCY0000Z1Z0" }));
    expect(lines).toContain(
      "The GSTIN's middle ten characters are not the company's PAN. Check both.",
    );
    expect(lines).toContain(
      "The GSTIN's last character does not match the rest. Check it against the certificate.",
    );
    expect(lines).toContain("There is a GSTIN, but Registered for GST says Not known.");
    expect(checksOf(facts({ gstin: "00ZZZCZ0000Z1ZH", flags: { gst_registered: "no" } }))).toEqual([
      "There is a GSTIN, but Registered for GST says No.",
    ]);
    expect(
      checksOf(facts({ cin: "U00000JK2024PTC000000", incorporated_on: "2025-08-14" })),
    ).toEqual(["The CIN's year is 2024, but the company was incorporated in 2025. Check both."]);
    expect(checksOf(facts({ cin: "U00000JK2025PTC000000", registered_state: "DL" }))).toEqual([
      "The CIN's state code is JK, but the registered state is Delhi.",
    ]);
    expect(checksOf(facts({ dpiit: { number: "DIPP000000", recognised_on: null } }))).toEqual([
      "There is a DPIIT number, but DPIIT-recognised startup says Not known.",
    ]);
  });

  it("works the GSTIN's check character out, and the walk's invented one fails it", () => {
    expect(gstinCheck("27AAPFU0939F1Z")).toBe("V");
    expect(gstinCheck("00ZZZCZ0000Z1Z")).not.toBe("0");
    expect(gstinCheck("short")).toBe("");
  });
});

describe("who is in office on a day", () => {
  const director = (appointed: string | null, ceased: string | null) =>
    ({ appointed_on: appointed, ceased_on: ceased }) as Director;
  it("counts from the appointment and stops on the day they cease", () => {
    const one = director("2025-08-14", "2026-06-30");
    expect(inOffice(one, "2025-08-13")).toBe(false);
    expect(inOffice(one, "2025-08-14")).toBe(true);
    expect(inOffice(one, "2026-01-01")).toBe(true);
    expect(inOffice(one, "2026-06-30")).toBe(false);
    expect(inOffice(one, "2026-07-01")).toBe(false);
    expect(inOffice(director(null, null), "2020-01-01")).toBe(true);
  });
});

describe("the company record on the real stack", () => {
  let stack: Stack;
  beforeAll(async () => {
    stack = await startStack();
  }, 60_000);
  afterAll(() => stack.stop());

  const save = (group: string, body: Body) =>
    stack.ask("POST", "/data/company/facts", { group, by: WALKER, ...body });
  const page = async () => (await stack.ask("GET", "/data/company")).json!;
  const message = (answer: { json: Body | null }) =>
    String(((answer.json?.error ?? {}) as Body).message ?? "");

  it("starts empty, every fact blank, and names the missing facts in order", async () => {
    const first = await page();
    expect(first.empty).toBe(true);
    expect(first.checks).toEqual([]);
    expect(first.first_fy_end_options).toEqual([]);
    const overview = (await stack.ask("GET", "/data/overview")).json!;
    expect(overview.company).toMatchObject({
      incorporated_on: null,
      directors: 0,
      dsc_soon: 0,
      facts_missing: [
        "Legal name",
        "CIN",
        "PAN",
        "Incorporation day",
        "First financial year's end",
      ],
    });
    expect((overview.company as Body).rules_unconfirmed).toBeGreaterThan(20);
  });

  it("refuses each shape with its sentence and changes nothing", async () => {
    const cases: [string, Body, string][] = [
      [
        "identity",
        { cin: "U72200JKABCDE" },
        "Type the CIN as it is on the certificate: 21 letters and digits, such as U72200JK2025PTC012345.",
      ],
      [
        "identity",
        { pan: "ZZZ0000" },
        "Type the PAN as ten letters and digits, such as AAACQ1234Q.",
      ],
      [
        "identity",
        { tan: "ZZZZ0000" },
        "Type the TAN as ten letters and digits, such as JMMQ01234A.",
      ],
      [
        "identity",
        { gstin: "00ZZZCZ0000Z" },
        "Type the GSTIN as 15 letters and digits, such as 01AAACQ1234Q1Z5.",
      ],
      ["identity", { registered_state: "XX" }, "Choose from the list."],
      ["dates", { incorporated_on: addDays(today(), 2) }, "That day is in the future."],
      ["dates", { first_fy_end: "2026-03-31" }, "Give the incorporation day first."],
      [
        "dates",
        { incorporated_on: "2025-08-14", first_fy_end: "2027-03-31" },
        "For a company incorporated on 14 Aug 2025, the first financial year ends on 31 Mar 2026.",
      ],
      [
        "dates",
        { incorporated_on: "2026-02-20", first_fy_end: "2028-03-31" },
        "For a company incorporated on 20 Feb 2026, the first financial year ends on 31 Mar 2026 or 31 Mar 2027.",
      ],
      ["class", { small: "maybe" }, "Choose Yes, No or Not known."],
      ["registrations", { firms_registered_on: addDays(today(), 1) }, "That day is in the future."],
      [
        "registrations",
        { firms_user_note: "In the drawer, password: walk1" },
        "Write where it is kept, never its PIN or password.",
      ],
      [
        "registrations",
        { auditor_appointed_by: "court" },
        "Choose who appointed the auditor: the board or an AGM.",
      ],
      ["somewhere", {}, "Choose which facts to save."],
    ];
    for (const [group, body, sentence] of cases) {
      const answer = await save(group, body);
      expect(answer.status, sentence).toBe(400);
      expect(message(answer)).toBe(sentence);
    }
    expect((await page()).empty).toBe(true);
    expect(codeOf(await save("identity", { legal_name: "xkeysib-walk" }))).toBe("secret");
  });

  it("saves the four groups one at a time, leaving the others as they are", async () => {
    expect(
      (await save("dates", { incorporated_on: "2025-08-14", first_fy_end: "2026-03-31" })).status,
    ).toBe(200);
    expect(
      (
        await save("identity", {
          legal_name: "Walk Company Private Limited",
          cin: "u00000jk2025ptc000000",
          pan: "ZZZCZ0000Z",
          tan: "ZZZZ00000Z",
          gstin: "00ZZZCZ0000Z1Z0",
          registered_state: "JK",
          registered_office: "1 Invented Lane, Walk Town",
        })
      ).status,
    ).toBe(200);
    const class1 = await save("class", { small: "yes", startup: "no", subsidiary: "yes" });
    expect(class1.status).toBe(200);
    expect(class1.json!.checks).toContain(
      "A subsidiary cannot be a small company. Check both answers with your CS.",
    );
    expect(
      (
        await save("registrations", {
          auditor_name: "Walk Auditors",
          auditor_firm_number: "000000N",
          auditor_appointed_on: "2025-09-01",
          auditor_appointed_by: "board",
          bank_name: "Walk Bank",
          bank_branch: "Walk Town",
          firms_user_note: "Kept with the company's records",
          dpiit_number: "dipp000000",
        })
      ).status,
    ).toBe(200);
    const now = await page();
    const kept = now.facts as Facts;
    expect(kept.cin).toBe("U00000JK2025PTC000000");
    expect(kept.incorporated_on).toBe("2025-08-14");
    expect(kept.first_fy_end).toBe("2026-03-31");
    expect(kept.flags).toMatchObject({ small: "yes", startup: "no", subsidiary: "yes" });
    expect(kept.dpiit.number).toBe("DIPP000000");
    expect(kept.auditor).toMatchObject({ name: "Walk Auditors", appointed_by: "board" });
    expect(now.empty).toBe(false);
    expect(now.first_fy_end_options).toEqual(["2026-03-31"]);
    expect(now.checks).toEqual([
      "A subsidiary cannot be a small company. Check both answers with your CS.",
      "The GSTIN's last character does not match the rest. Check it against the certificate.",
      "There is a GSTIN, but Registered for GST says Not known.",
      "There is a DPIIT number, but DPIIT-recognised startup says No.",
    ]);
    const changes = now.changes as Body[];
    expect(changes[0]).toMatchObject({ target: "facts", verb: "changed", by: WALKER });
    expect(String(changes.find((event) => String(event.detail).includes("CIN"))?.detail)).toBe(
      "Legal name, CIN, PAN, TAN, GSTIN, Registered in, Registered office",
    );
    expect(JSON.stringify(changes)).not.toContain("ZZZCZ0000Z");
    const decides = now.decides as Body[];
    expect(decides[0]).toEqual({
      rule: "First AGM",
      worked_out: "By 31 Dec 2026",
      from: "First financial year ends 31 Mar 2026",
    });
    expect(decides).toContainEqual({
      rule: "Annual return",
      worked_out: "MGT-7A, as a small company",
      from: "Small company: Yes",
    });
    expect(decides).toContainEqual({
      rule: "INC-20A",
      worked_out: "Due 10 Feb 2026",
      from: "Incorporated 14 Aug 2025",
    });
    // A second save of one group leaves the others alone.
    await save("class", { subsidiary: "no" });
    const after = (await page()).facts as Facts;
    expect(after.flags.small).toBe("yes");
    expect(after.cin).toBe("U00000JK2025PTC000000");
    expect((await page()).checks).not.toContain(
      "A subsidiary cannot be a small company. Check both answers with your CS.",
    );
  });

  let directorId = "";

  it("adds, edits and ceases a director, who stays as a former director", async () => {
    const add = (body: Body) =>
      stack.ask("POST", "/data/company/directors", {
        by: WALKER,
        attempt: crypto.randomUUID(),
        ...body,
      });
    expect(message(await add({ name: "" }))).toBe("Give the director's name.");
    expect(message(await add({ name: "Walk Two", din: "1234" }))).toBe("A DIN is eight digits.");
    expect(message(await add({ name: "Walk Two", designation: "chair" }))).toBe(
      "Choose the designation.",
    );
    expect(message(await add({ name: "Walk Two", dsc_kept: "Drawer, PIN 1234" }))).toBe(
      "Write where it is kept, never its PIN or password.",
    );
    expect(message(await add({ name: "Walk Two", mca_email: "not an address" }))).toBe(
      "That is not an email address.",
    );
    expect(message(await add({ name: "Walk Two", mca_mobile: "call me" }))).toBe(
      "Type the mobile with digits, spaces and + only.",
    );
    expect(message(await add({ name: "Walk Two", kyc_filed_on: addDays(today(), 3) }))).toBe(
      "That day is in the future.",
    );
    const made = await add({
      name: "Walk Director",
      din: "00000000",
      din_allotted_on: "2025-08-01",
      designation: "director",
      appointed_on: "2025-08-14",
      is_founder: true,
      dsc_expires_on: addDays(today(), 40),
      dsc_kept: "The office safe",
      mca_email: "director@walk-company.example",
      mca_mobile: "+91 00000 00000",
      mca_address: "1 Invented Lane, Walk Town",
    });
    expect(made.status).toBe(200);
    const director = made.json!.director as Body;
    directorId = String(director.director_id);
    expect(director).toMatchObject({
      din: "00000000",
      is_founder: true,
      dsc_soon: true,
      next_kyc: { due_on: "2029-06-30", words: "30 Jun 2029" },
      changes_to_file: { count: 0, first_by: null },
    });
    const taken = await add({ name: "Walk Two", din: "00000000" });
    expect(taken.status).toBe(409);
    expect(codeOf(taken)).toBe("din_taken");
    expect(message(taken)).toBe("DIN 00000000 is already Walk Director's.");
    const second = await add({ name: "Walk Two", appointed_on: "2025-09-01" });
    expect(second.status).toBe(200);
    const secondId = String((second.json!.director as Body).director_id);
    const edited = await stack.ask("POST", `/data/company/directors/${secondId}/update`, {
      by: WALKER,
      designation: "additional",
      mca_email: "ignored@walk-company.example",
    });
    expect(edited.json!.director).toMatchObject({ designation: "additional", mca: { email: "" } });
    const early = await stack.ask("POST", `/data/company/directors/${secondId}/ceased`, {
      by: WALKER,
      ceased_on: "2025-08-01",
    });
    expect(message(early)).toBe("A director cannot cease before being appointed.");
    expect(
      message(
        await stack.ask("POST", `/data/company/directors/${secondId}/ceased`, {
          by: WALKER,
          ceased_on: addDays(today(), 1),
        }),
      ),
    ).toBe("That day is in the future.");
    const ceased = await stack.ask("POST", `/data/company/directors/${secondId}/ceased`, {
      by: WALKER,
      ceased_on: today(),
    });
    expect(ceased.json!.director).toMatchObject({ ceased_on: today(), next_kyc: null });
    const listed = (await stack.ask("GET", "/data/company/directors")).json!;
    expect((listed.directors as Body[]).map((row) => row.name)).toEqual(["Walk Director"]);
    expect(listed.counts).toEqual({ in_office: 1, ceased: 1 });
    const all = (await stack.ask("GET", "/data/company/directors?ceased=1")).json!;
    expect((all.directors as Body[]).map((row) => row.name)).toEqual(["Walk Director", "Walk Two"]);
    const overview = (await stack.ask("GET", "/data/overview")).json!;
    expect(overview.company).toMatchObject({
      incorporated_on: "2025-08-14",
      directors: 1,
      dsc_soon: 1,
      facts_missing: [],
    });
  });

  it("records a contact change: without the box no Key date, ticked one due 30 days later, filed done", async () => {
    const path = `/data/company/directors/${directorId}/contact-change`;
    const same = await stack.ask("POST", path, {
      by: WALKER,
      attempt: crypto.randomUUID(),
      field: "address",
      to: "1 Invented Lane, Walk Town",
      changed_on: today(),
    });
    expect(message(same)).toBe("That is the address already on the record.");
    const quiet = await stack.ask("POST", path, {
      by: WALKER,
      attempt: crypto.randomUUID(),
      field: "email",
      to: "walk.director@walk-company.example",
      changed_on: today(),
    });
    expect(quiet.status).toBe(200);
    expect(quiet.json!.key_dates).toEqual([]);
    const ticked = await stack.ask("POST", path, {
      by: WALKER,
      attempt: crypto.randomUUID(),
      field: "mobile",
      to: "+91 00000 00001",
      changed_on: today(),
      add_date: "on",
    });
    expect(ticked.status).toBe(200);
    const links = ticked.json!.key_dates as Body[];
    expect(links).toHaveLength(1);
    expect(links[0]).toMatchObject({
      rule_key: "dir-3-kyc-change",
      title: "DIR-3 KYC-Web: Walk Director's new mobile",
      due_on: addDays(today(), 30),
      state: "coming_up",
    });
    const change = ticked.json!.change as Body;
    expect(change.file_by).toBe(addDays(today(), 30));
    const dates = (await stack.ask("GET", "/data/dates?view=all")).json!.dates as Body[];
    const date = dates.find((row) => row.title === "DIR-3 KYC-Web: Walk Director's new mobile");
    expect(date).toMatchObject({
      statutory: true,
      origin: { label: "Contact change: Walk Director" },
    });
    expect(dates.filter((row) => String(row.title).includes("new email"))).toEqual([]);
    const filed = await stack.ask(
      "POST",
      `/data/company/directors/${directorId}/contact-change/${String(change.change_id)}/filed`,
      { by: WALKER, filed_on: today(), srn: "WALK-SRN-1" },
    );
    expect(filed.json!.change).toMatchObject({ filed: { on: today(), srn: "WALK-SRN-1" } });
    const record = (await stack.ask("GET", `/data/company/directors/${directorId}`)).json!;
    const kept = (record.key_dates as Body[]).find((link) => link.rule_key === "dir-3-kyc-change");
    expect(kept).toMatchObject({ state: "done", evidence: { srn: "WALK-SRN-1" } });
    expect((record.director as Body).mca).toMatchObject({ mobile: "+91 00000 00001" });
    expect((record.events as Body[]).map((event) => event.verb)).toContain("contact change filed");
    expect(JSON.stringify(record.events)).not.toContain("00001");
  });

  it("records a KYC filing: the director's open KYC date is done and the next cycle shows", async () => {
    const page1 = (await stack.ask("GET", "/data/dates")).json!;
    const kyc = (page1.suggestions as Body[]).find(
      (row) => row.title === "DIR-3 KYC: Walk Director",
    );
    expect(kyc).toMatchObject({ group: "company", next: "2029-06-30", rule_key: "dir-3-kyc" });
    const added = await stack.ask("POST", `/data/dates/suggested/${String(kyc!.key)}/add`, {
      by: WALKER,
      attempt: crypto.randomUUID(),
    });
    expect(added.status).toBe(200);
    const recorded = await stack.ask("POST", `/data/company/directors/${directorId}/kyc`, {
      by: WALKER,
      filed_on: today(),
      srn: "WALK-SRN-KYC",
    });
    expect(recorded.status).toBe(200);
    expect((recorded.json!.next_kyc as Body).due_on).toMatch(/^\d{4}-06-30$/);
    const date = ((await stack.ask("GET", "/data/dates?view=all")).json!.dates as Body[]).find(
      (row) => row.date_id === (added.json!.date as Body).date_id,
    );
    expect(date).toMatchObject({ state: "done", evidence: { srn: "WALK-SRN-KYC" } });
    const next = ((await stack.ask("GET", "/data/dates")).json!.suggestions as Body[]).find(
      (row) => row.title === "DIR-3 KYC: Walk Director",
    );
    expect(next?.key).not.toBe(kyc!.key);
  });
});
