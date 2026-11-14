// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { endsOn, worked } from "../../scripts/data/agreements/rules";
import type { Agreement } from "../../scripts/data/agreements/types";
import { addDays } from "../../scripts/data/days";
import { WALKER, startStack, type RawAnswer, type Stack } from "./helpers";

/**
 * The legal-document register (ws-notes/company/spec.md §7.9): §5.4's end and notice-by
 * days by hand; the notice-by Due row from 14 days before; a passed renewal moving on to
 * the next and listed "Renewed on"; "What is missing" from zero and with the fake
 * `people-letters` and invented `waitlist-feed` and `investors-raise` stand-ins, each row's
 * states and the firms it lists, and no person's name in any row. Every party is invented.
 */

function agreement(change: Partial<Agreement> = {}): Agreement {
  return {
    agreement_id: "a1",
    title: "Walk NDA",
    type: "nda",
    parties: [{ kind: "other", ref_id: null, name: "Walk Pilot Fund", entity: "", country: "" }],
    status: "signed",
    status_on: null,
    effective_on: null,
    signed_on: null,
    term: { months: null, ends_on: null },
    renewal: { auto: false, months: null, renews_on: null, notice_days: null, notice_given: null },
    terminate_for_convenience: "",
    governing_law: "India",
    forum: "",
    value: null,
    signing: "",
    stamp: null,
    related_party: false,
    personal_data: false,
    ip_clause: "",
    confidentiality_clause: "",
    signed_file_id: null,
    audit_trail_file_id: null,
    owner: "",
    review_on: null,
    notes: "",
    created_at: "2026-11-01T00:00:00.000Z",
    created_by: WALKER,
    updated_at: "2026-11-01T00:00:00.000Z",
    updated_by: WALKER,
    ...change,
  };
}

describe("the arithmetic of §5.4, by hand", () => {
  it("a fixed term ends the day before the same date that many months on", () => {
    const term = (effective: string, months: number) =>
      endsOn(agreement({ effective_on: effective, term: { months, ends_on: null } }));
    expect(term("2026-11-15", 12)).toBe("2027-11-14");
    expect(term("2027-01-01", 12)).toBe("2027-12-31");
    expect(term("2027-01-31", 1)).toBe("2027-02-27");
    expect(term("2028-02-29", 12)).toBe("2029-02-27");
    expect(
      endsOn(agreement({ effective_on: "2027-01-31", term: { months: 1, ends_on: "2027-02-28" } })),
    ).toBe("2027-02-28");
  });

  it("notice-by is that many days before the renewal; a passed renewal moves on", () => {
    const renewing = (renewsOn: string) =>
      agreement({
        renewal: {
          auto: true,
          months: 12,
          renews_on: renewsOn,
          notice_days: 30,
          notice_given: null,
        },
      });
    expect(worked(renewing("2027-03-01"), "2026-12-01")).toMatchObject({
      renews_on: "2027-03-01",
      notice_by: "2027-01-30",
      renewed: [],
      notice_state: "open",
    });
    expect(worked(renewing("2028-03-01"), "2027-12-01").notice_by).toBe("2028-01-31");
    expect(worked(renewing("2027-03-01"), "2027-02-15")).toMatchObject({ notice_state: "passed" });
    expect(worked(renewing("2027-03-01"), "2027-03-02")).toMatchObject({
      renews_on: "2028-03-01",
      notice_by: "2028-01-31",
      renewed: ["2027-03-01"],
      notice_state: "open",
    });
    const given = renewing("2027-03-01");
    given.renewal.notice_given = { on: "2027-01-20", note: "" };
    expect(worked(given, "2027-06-01")).toMatchObject({
      renews_on: "2027-03-01",
      renewed: [],
      notice_state: "given",
    });
    // A draft does not renew.
    expect(worked({ ...renewing("2027-03-01"), status: "draft" }, "2027-06-01").renewed).toEqual(
      [],
    );
  });
});

let stack: Stack;
let today = "";

const post = (path: string, body: Record<string, unknown> = {}) =>
  stack.ask("POST", path, { by: WALKER, ...body });
const message = (answer: RawAnswer) =>
  String((answer.json?.error as { message?: unknown } | undefined)?.message ?? "");

type Must = {
  key: string;
  state: string;
  found: string;
  missing: { name: string; href: string }[];
};
const missing = async () =>
  ((await stack.ask("GET", "/data/agreements")).json?.missing as Must[]) ?? [];
const row = (rows: Must[], key: string) => rows.find((item) => item.key === key);

beforeAll(async () => {
  stack = await startStack({ modules: ["files", "agreements"] });
  today = String((await stack.ask("GET", "/data/_test/day")).json?.day ?? "");
}, 60_000);
afterAll(() => stack.stop());

const add = async (body: Record<string, unknown>) => {
  const answer = await post("/data/agreements", {
    type: "nda",
    status: "signed",
    signed_on: today,
    parties: [{ kind: "other", name: "Walk Pilot Fund" }],
    ...body,
  });
  expect(answer.status, message(answer)).toBe(200);
  return answer.json?.agreement as { agreement_id: string };
};

describe("agreements through the stack", () => {
  it("What is missing from zero: founder IP missing, the people and waitlist rows not checked", async () => {
    const rows = await missing();
    expect(rows.map((item) => item.key)).toEqual([
      "founder_ip",
      "letters",
      "people_ip",
      "nda",
      "pilot",
      "customer",
      "dpa",
      "investment",
    ]);
    expect(row(rows, "founder_ip")).toMatchObject({ state: "missing" });
    expect(row(rows, "letters")).toMatchObject({
      state: "not_checked",
      found: "Checked in People, by the Owner.",
    });
    expect(row(rows, "people_ip")?.state).toBe("not_checked");
    expect(row(rows, "nda")?.state).toBe("not_checked");
    expect(row(rows, "investment")?.state).toBe("not_checked");
    expect(row(rows, "dpa")?.state).toBe("not_needed");
  });

  it("refuses with §7.3's sentences", async () => {
    const cases: [Record<string, unknown>, string][] = [
      [{ title: "", type: "nda", parties: [{ name: "X" }] }, "Give the agreement a title."],
      [{ title: "Walk", type: "nda", parties: [] }, "Name at least one other party."],
      [{ title: "Walk", type: "lunch", parties: [{ name: "X" }] }, "Choose from the list."],
      [
        { title: "Walk", type: "nda", parties: [{ name: "X" }], signed_on: addDays(today, 2) },
        "That day is in the future.",
      ],
      [
        { title: "Walk", type: "nda", parties: [{ name: "X" }], auto_renews: true },
        "Give the day it renews.",
      ],
      [
        { title: "Walk", type: "nda", parties: [{ name: "X" }], value_amount: "a lot" },
        "Type the amount as a number, such as 250000.",
      ],
    ];
    for (const [body, sentence] of cases) {
      const answer = await post("/data/agreements", body);
      expect(answer.status, sentence).toBe(400);
      expect(message(answer)).toBe(sentence);
    }
  });

  it("a signed founder IP assignment with its copy in 05 makes the founder row Here", async () => {
    const made = await add({
      title: "Walk founder IP assignment",
      type: "founder_ip",
      parties: [{ kind: "director", name: "Walk Founder" }],
      content: Buffer.from("invented assignment").toString("base64"),
      name: "assignment.txt",
    });
    const page = (await stack.ask("GET", `/data/agreements/${made.agreement_id}`)).json!;
    expect((page.signed_file as { title: string }).title).toBe(
      "Walk founder IP assignment – signed",
    );
    const file = (
      await stack.ask("GET", `/data/files/${(page.signed_file as { file_id: string }).file_id}`)
    ).json!;
    expect(JSON.stringify(file)).toContain("05 Founders, team and ESOP");
    expect(JSON.stringify(file)).toContain("Signed copy of “Walk founder IP assignment”");
    expect(row(await missing(), "founder_ip")).toMatchObject({ state: "here", missing: [] });
  });

  it("the notice-by Due row joins 14 days before, and goes once notice is given", async () => {
    const due = async () =>
      ((await stack.ask("GET", "/data/overview")).json?.due as { key: string; title: string }[]) ??
      [];
    const inside = await add({
      title: "Walk NDA inside",
      effective_on: today,
      term_months: 12,
      auto_renews: true,
      renews_on: addDays(today, 40),
      notice_days: 30,
    });
    const outside = await add({
      title: "Walk NDA outside",
      effective_on: today,
      auto_renews: true,
      renews_on: addDays(today, 45),
      notice_days: 30,
    });
    const rows = await due();
    const mine = rows.find((item) => item.key === `agreement:${inside.agreement_id}:notice`);
    expect(mine?.title).toMatch(
      /^Give notice on “Walk NDA inside” by \d+ \w{3}, or it renews on \d+ \w{3}$/,
    );
    expect(rows.some((item) => item.key === `agreement:${outside.agreement_id}:notice`)).toBe(
      false,
    );
    const list = (await stack.ask("GET", "/data/agreements")).json?.agreements as {
      agreement_id: string;
      notice_by: string;
      notice_state: string;
    }[];
    expect(list.find((item) => item.agreement_id === inside.agreement_id)).toMatchObject({
      notice_by: addDays(today, 10),
      notice_state: "open",
    });
    const given = await post(`/data/agreements/${inside.agreement_id}/notice-given`, {
      on: today,
      note: "Invented: sent by email",
    });
    expect(given.status).toBe(200);
    expect(
      (await due()).some((item) => item.key === `agreement:${inside.agreement_id}:notice`),
    ).toBe(false);
    const agenda = (await stack.ask("GET", "/data/_test/agreements/agenda")).json?.items as {
      key: string;
      plain: string;
      remind_days: number[];
    }[];
    expect(
      agenda.find((item) => item.key === `agreement:${outside.agreement_id}:notice`),
    ).toMatchObject({
      plain: "Agreement notice",
      remind_days: [14, 0],
    });
  });

  it("a renewal that passed moves to the next and is listed as renewed", async () => {
    const past = await add({
      title: "Walk vendor terms",
      type: "vendor",
      effective_on: addDays(today, -400),
      signed_on: addDays(today, -400),
      auto_renews: true,
      renews_on: addDays(today, -35),
      renewal_months: 12,
      notice_days: 30,
    });
    const page = (await stack.ask("GET", `/data/agreements/${past.agreement_id}`)).json!;
    const days = page.worked as { renewed: string[]; renews_on: string };
    expect(days.renewed).toEqual([addDays(today, -35)]);
    expect(days.renews_on > today).toBe(true);
  });

  it("with the stand-ins: each row's states and the firms it lists, and no person named", async () => {
    const letters = await post("/data/_test/agreements/people-letters", {
      counts: { engaged: 2, with_letter: 1, interns_and_contractors: 1, with_ip: 1 },
    });
    expect(letters.json?.installed).toBe(true);
    await post("/data/_test/agreements/waitlist-feed", {
      entries: [
        { entry_id: "walk-entry-pilot", firm: "Walk Pilot Firm", stage: "pilot" },
        { entry_id: "walk-entry-customer", firm: "Walk Customer Firm", stage: "customer" },
        { entry_id: "walk-entry-joined", firm: "Walk Joined Firm", stage: "joined" },
      ],
    });
    await post("/data/_test/agreements/investors-raise", {
      firms: [
        { investor_id: "walk-firm-signed", firm: "Walk Signed Fund", stage: "signed" },
        { investor_id: "walk-firm-written", firm: "Walk Written Fund", stage: "written" },
      ],
    });
    let rows = await missing();
    expect(row(rows, "letters")).toMatchObject({
      state: "missing",
      found: "1 of 2 people engaged have a signed letter",
      missing: [],
    });
    expect(row(rows, "people_ip")).toMatchObject({
      state: "here",
      found: "1 of 1 interns and contractors have an IP assignment",
    });
    expect(row(rows, "nda")?.missing.map((item) => item.name)).toEqual([
      "Walk Pilot Firm",
      "Walk Customer Firm",
    ]);
    expect(row(rows, "pilot")?.missing).toEqual([
      { name: "Walk Pilot Firm", href: "/data/waitlist/walk-entry-pilot" },
    ]);
    expect(row(rows, "customer")?.missing.map((item) => item.name)).toEqual(["Walk Customer Firm"]);
    expect(row(rows, "investment")?.missing).toEqual([
      { name: "Walk Signed Fund", href: "/data/investors/walk-firm-signed" },
    ]);
    // A pilot agreement with the confidentiality clause covers the NDA and the pilot rows.
    await add({
      title: "Walk pilot agreement",
      type: "pilot",
      confidentiality_clause: "yes",
      personal_data: true,
      parties: [{ kind: "waitlist", ref_id: "walk-entry-pilot", name: "" }],
    });
    const unknown = await post("/data/agreements", {
      title: "Walk unknown firm",
      type: "nda",
      parties: [{ kind: "waitlist", ref_id: "walk-entry-nowhere", name: "Nobody" }],
    });
    expect(unknown.status).toBe(404);
    expect(message(unknown)).toBe("That firm is not here.");
    await add({
      title: "Walk investment agreement",
      type: "investment",
      parties: [{ kind: "investor", ref_id: "walk-firm-signed", name: "" }],
    });
    rows = await missing();
    expect(row(rows, "pilot")).toMatchObject({ state: "here", missing: [] });
    expect(row(rows, "nda")?.missing.map((item) => item.name)).toEqual(["Walk Customer Firm"]);
    expect(row(rows, "dpa")).toMatchObject({
      state: "missing",
      missing: [{ name: "Walk pilot agreement" }],
    });
    expect(row(rows, "investment")).toMatchObject({ state: "here" });
    const forParty = (await stack.ask("GET", "/data/agreements?q=walk%20pilot%20firm")).json
      ?.agreements as { title: string; parties: { name: string }[] }[];
    expect(forParty[0]?.parties[0]?.name).toBe("Walk Pilot Firm");
    // Rows 2 and 3 never name anyone: counts only.
    const zero = await post("/data/_test/agreements/people-letters", {
      counts: { engaged: 0, with_letter: 0, interns_and_contractors: 0, with_ip: 0 },
    });
    expect(zero.json?.installed).toBe(true);
    rows = await missing();
    expect(row(rows, "letters")?.state).toBe("not_needed");
    for (const key of ["letters", "people_ip"]) expect(row(rows, key)?.missing).toEqual([]);
    for (const name of [
      "/data/_test/agreements/people-letters",
      "/data/_test/agreements/waitlist-feed",
      "/data/_test/agreements/investors-raise",
    ])
      await post(name, { on: false });
    expect(row(await missing(), "nda")?.state).toBe("not_checked");
  });

  it("search finds an agreement by a party's name; the type tab filters", async () => {
    const found = (await stack.ask("GET", "/data/_test/agreements/search?q=walk%20inside")).json
      ?.groups as { kind: string; hits: { title: string; subtitle: string }[] }[];
    expect(found[0]?.kind).toBe("agreement");
    expect(found[0]?.hits[0]).toMatchObject({ title: "Walk NDA inside", subtitle: "NDA · Signed" });
    const ndas = (await stack.ask("GET", "/data/agreements?type=nda")).json?.agreements as {
      type: string;
    }[];
    expect(ndas.length).toBeGreaterThan(0);
    expect(ndas.every((item) => item.type === "nda")).toBe(true);
  });
});
