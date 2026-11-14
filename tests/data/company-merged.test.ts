// @vitest-environment node
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { addDays } from "../../scripts/data/days";
import { investorIdOf } from "../../scripts/data/investors/types";
import { GET as calendarFeedRoute } from "@/app/cal/[token]/route";
import { Scripted, readyToSend, sendLive } from "./leads-kit";
import { WALKER, startStack, until, type RawAnswer, type Stack } from "./helpers";

/**
 * The company batch's seams with every module loaded (company spec §3.5): each unit proved
 * its half against a stand-in; this file proves the halves meet. An EGM's special
 * resolution reaches Key dates and back; an AGM in Meetings moves the AGM-based suggestions;
 * a non-resident's money and its allotment add their Key dates and enter the register; the
 * company's directors are a board meeting's attendees; the people ledger's counts reach
 * Agreements without a name; a pilot's signed agreement reaches the pilot and "What is
 * missing"; the people ledger stays out of the overview, an Admin's backup, the calendar
 * and search; and one file lists every record that uses it. Every person, firm and number
 * is invented, on `.example` and the reserved patterns of spec §2.
 */

type Body = Record<string, unknown>;
type Link = { rule_key: string; title: string; due_on: string; state: string; origin_key: string };
type KeyDate = {
  date_id: string;
  title: string;
  due_on: string;
  state: string;
  rule_key: string | null;
  origin: { key: string; label: string; href: string } | null;
};

const FIRM_CSV = [
  "Email,First Name,Last Name,Title,Company,Tier,Email Kind",
  "partner301@fund301.example,Asha,Rao301,Partner,Walk Fund 301,1,named",
].join("\n");
const FIRM = investorIdOf("fund301.example");
const INTERN = "Walk Merged Intern";
const AGM_HELD = "2026-09-20";

let stack: Stack;
let today = "";
let out = "";
let fileId = "";
const provider = new Scripted();

const message = (answer: RawAnswer): string =>
  String(((answer.json?.error ?? {}) as { message?: unknown }).message ?? "");

async function ok(path: string, body: Body = {}): Promise<Body> {
  const answer = await stack.ask("POST", path, { by: WALKER, ...body });
  expect(answer.status, `${path}: ${message(answer)}`).toBe(200);
  return answer.json!;
}

async function get(path: string): Promise<Body> {
  const answer = await stack.ask("GET", path);
  expect(answer.status, `${path}: ${message(answer)}`).toBe(200);
  return answer.json!;
}

const keyDates = async (): Promise<KeyDate[]> =>
  (await get("/data/dates?view=all")).dates as KeyDate[];
const suggestion = async (key: string): Promise<Body | undefined> =>
  ((await get("/data/dates")).suggestions as Body[]).find((row) => row.key === key);
const missingRow = async (key: string) =>
  (
    (await get("/data/agreements")).missing as {
      key: string;
      state: string;
      found: string;
      missing: { name: string }[];
    }[]
  ).find((row) => row.key === key)!;

beforeAll(async () => {
  out = mkdtempSync(join(tmpdir(), "hqcm-"));
  // Every module, as the sender loads them (core.ts MODULES).
  stack = await startStack({ env: true, liveProvider: () => provider });
  today = String((await get("/data/_test/day")).day);
  // One investor firm, written to, so the closing has a firm to close with.
  await readyToSend(stack.engine);
  const list = stack.engine.importList({
    name: "Walk merged investors",
    file_name: "walk-merged-investors.csv",
    text: `${FIRM_CSV}\n`,
  }).list.id;
  await sendLive(stack.engine, list, "Walk merged live");
  await until(async () => {
    const setup = await get("/data/investors/setup");
    return (setup.lists as { id: string }[]).some((item) => item.id === list);
  }, "the investor list to be seen");
  expect((await ok("/data/investors/setup", { list_ids: [list] })).firms).toBe(1);
  // The company record's dates and its class (a small company), as Company › Facts saves them.
  await ok("/data/company/facts", {
    group: "dates",
    incorporated_on: "2025-08-14",
    first_fy_end: "2026-03-31",
  });
  await ok("/data/company/facts", { group: "class", small: "yes", gst_registered: "no" });
  // One file that several records will use.
  fileId = String(
    (
      (
        await ok("/data/_test/files/put", {
          folder_path: ["09 MCA filings and compliance"],
          title: "Walk merged filed copy",
          name: "walk-merged.pdf",
          base64: Buffer.from("%PDF-1.4\n% invented merged copy\n%%EOF\n").toString("base64"),
        })
      ).file as Body
    ).file_id,
  );
}, 90_000);
afterAll(async () => {
  await stack.stop();
  rmSync(out, { recursive: true, force: true });
});

describe("the company batch, merged (company spec §3.5)", () => {
  let egmId = "";
  let mgt14Id = "";
  let boardId = "";
  let personId = "";
  let entryId = "";
  let pilotId = "";

  it("1. an EGM's special resolution puts MGT-14 in Key dates, from the meeting, and Done shows on it", async () => {
    const held = addDays(today, -5);
    const egm = (
      await ok("/data/meetings", {
        kind: "egm",
        title: "Walk merged EGM",
        place: "Walk registered office",
        scheduled_on: held,
        held: true,
      })
    ).meeting as { meeting_id: string };
    egmId = egm.meeting_id;
    const added = await ok(`/data/meetings/${egmId}/resolutions`, {
      title: "Walk merged alteration of articles",
      kind: "special",
      add_date: true,
    });
    const resolution = (
      added.meeting as { resolutions: { resolution_id: string; mgt14: string }[] }
    ).resolutions[0]!;
    expect(resolution.mgt14).toBe("needed");
    const links = added.key_dates as Link[];
    expect(links).toEqual([
      expect.objectContaining({
        rule_key: "mgt-14",
        title: "MGT-14: “Walk merged alteration of articles”",
        due_on: addDays(held, 30),
        state: "coming_up",
      }),
    ]);
    // In Key dates itself, with its "From" link back to the meeting.
    const date = (await keyDates()).find((item) => item.rule_key === "mgt-14")!;
    mgt14Id = date.date_id;
    expect(date).toMatchObject({
      title: "MGT-14: “Walk merged alteration of articles”",
      due_on: addDays(held, 30),
      state: "coming_up",
      origin: {
        key: `meetings:${resolution.resolution_id}`,
        href: `/data/company/meetings/${egmId}#resolution-${resolution.resolution_id}`,
      },
    });
    expect(date.origin?.label).toMatch(/^Resolution “Walk merged alteration of articles”, /);
    // The meeting shows the date's state, coming up, then Done once filed in Key dates.
    const before = await get(`/data/meetings/${egmId}`);
    expect((before.key_dates as Record<string, Link[]>)[resolution.resolution_id]).toEqual([
      expect.objectContaining({ date_id: mgt14Id, state: "coming_up" }),
    ]);
    expect(before.key_dates_note).toBe("");
    const done = await ok(`/data/dates/${mgt14Id}/done`, {
      srn: "WALK-SRN-14",
      filed_on: today,
      filed_file_id: fileId,
      note: "Filed by the CS, invented.",
    });
    expect((done.date as KeyDate).state).toBe("done");
    const after = await get(`/data/meetings/${egmId}`);
    expect((after.key_dates as Record<string, Link[]>)[resolution.resolution_id]).toEqual([
      expect.objectContaining({ date_id: mgt14Id, state: "done" }),
    ]);
  });

  it("2. an AGM held in Meetings moves AOC-4, MGT-7A, ADT-1 and the next AGM", async () => {
    // Before: the first AGM, from the company record's first financial year.
    expect(await suggestion("agm")).toMatchObject({
      next: "2026-12-31",
      from_fact: "From the first financial year ending 31 Mar 2026",
    });
    // A held meeting's day cannot be in the future, and the Data worker's clock is this
    // Mac's, so the AGM is a fixed day already past (spec §3.5 names 20 Dec 2026; the same
    // arithmetic for that day is checked by hand in dates-company.test.ts).
    await ok("/data/meetings", {
      kind: "agm",
      title: "Walk merged AGM",
      scheduled_on: AGM_HELD,
      held: true,
    });
    const from = "From the AGM held 20 Sep 2026";
    expect(await suggestion("aoc-4")).toMatchObject({ next: "2026-10-20", from_fact: from });
    expect(await suggestion("mgt-7a")).toMatchObject({
      next: "2026-11-19",
      from_fact: from,
      title: "MGT-7A (annual return)",
    });
    expect(await suggestion("adt-1")).toMatchObject({ next: "2026-10-05", from_fact: from });
    expect(await suggestion("agm")).toMatchObject({ next: "2027-09-30", from_fact: from });
    expect((await get("/data/company")).last_agm).toEqual({ on: AGM_HELD, from: "meetings" });
  });

  it("5. the directors are a board meeting's attendees; the quorum is theirs; a ceased one is not offered", async () => {
    const add = async (body: Body) =>
      (
        (await ok("/data/company/directors", { attempt: randomUUID(), ...body })).director as {
          director_id: string;
        }
      ).director_id;
    const first = await add({
      name: "Walk Director",
      din: "00000000",
      din_allotted_on: "2025-08-01",
      designation: "director",
      appointed_on: "2025-08-14",
      is_founder: true,
    });
    const second = await add({ name: "Walk Second Director", appointed_on: "2025-09-01" });
    const gone = await add({ name: "Walk Former Director", appointed_on: "2025-09-01" });
    await ok(`/data/company/directors/${gone}/ceased`, { ceased_on: addDays(today, -20) });

    const day = addDays(today, -10);
    const board = (
      await ok("/data/meetings", {
        kind: "board",
        place: "Walk registered office",
        scheduled_on: day,
        held: true,
      })
    ).meeting as { meeting_id: string };
    boardId = board.meeting_id;
    const page = await get(`/data/meetings/${boardId}`);
    expect(page.directors).toEqual([
      { director_id: first, name: "Walk Director" },
      { director_id: second, name: "Walk Second Director" },
    ]);
    const refused = await stack.ask("POST", `/data/meetings/${boardId}/held`, {
      by: WALKER,
      held_on: day,
      attendees: [{ name: "Walk Former Director", role: "director", director_id: gone }],
    });
    expect(refused.status).toBe(400);
    expect(message(refused)).toMatch(
      /^Walk Former Director was not a director on \d+ \w{3} \d{4}\.$/,
    );
    await ok(`/data/meetings/${boardId}/held`, {
      held_on: day,
      chair: "Walk Director",
      attendees: [
        { name: "Walk Director", role: "director", director_id: first, how: "in_person" },
        { name: "Walk Second Director", role: "director", director_id: second, how: "video" },
      ],
    });
    const held = await get(`/data/meetings/${boardId}`);
    expect(held.quorum).toMatchObject({ needed: 2, present: 2, met: true, directors: 2 });
    expect(held.quorum_sentence).toBe("Quorum: 2 present of 2 needed.");
  });

  it("3. a non-resident's money adds the allotment and FIRMS dates, and the report only once confirmed", async () => {
    await ok(`/data/investors/${FIRM}/profile`, { residency: "non_resident" });
    await ok(`/data/investors/${FIRM}/stage`, {
      stage: "soft",
      next_step: "Send the closing papers",
      next_step_on: today,
    });
    const share = (
      (
        await ok("/data/members/classes", {
          name: "Equity shares of ₹10 each",
          kind: "equity",
          nominal: 10,
        })
      ).class as { class_id: string }
    ).class_id;
    // The founders' subscription, so the holdings have something to be a share of.
    const founder = (
      (
        await ok("/data/members", {
          name: "Walk Founder",
          kind: "person",
          email: "walk.founder@walk-company.example",
          residency: "resident",
          became_member_on: "2025-08-14",
        })
      ).member as { member_id: string }
    ).member_id;
    await ok("/data/members/entries", {
      member_id: founder,
      class_id: share,
      kind: "subscription",
      shares: 10_000,
      distinctive_from: 1,
      distinctive_to: 10_000,
      price_per_share: 10,
      paid_up_per_share: 10,
      on: "2025-08-14",
      entered_on: "2025-08-14",
    });
    await ok(`/data/closing/${FIRM}/start`);
    await ok(`/data/closing/${FIRM}/terms`, {
      instrument: "iSAFE",
      class_id: share,
      shares: "1250",
      price_per_share: "1000",
      holder: { name: "Walk Fund 301", kind: "fund" },
    });
    const money = addDays(today, -30);
    const paid = await ok(`/data/closing/${FIRM}/steps/money-received`, {
      on: money,
      amount: "2500000",
      currency: "INR",
      own_account: true,
      reference: "WALK-FIRC-1",
      add_dates: true,
    });
    const links = (paid.key_dates as Link[]).map((link) => [link.rule_key, link.due_on]);
    expect(links).toEqual([
      ["firms-registration", addDays(money, 7)],
      ["allotment", addDays(money, 60)],
    ]);
    const titles = (await keyDates()).map((date) => date.title);
    expect(titles).toContain("Allot shares to Walk Fund 301, or refund");
    expect(titles).toContain("Register the company on FIRMS");
    expect(titles).not.toContain("Report Walk Fund 301's money received");
    // Confirmed in the Rules view, then "Add the deadlines now" on the closing.
    await ok("/data/dates/rules/advance-receipt/confirm", {
      name: "Walk CS",
      role: "CS",
      on: today,
    });
    const now = await ok(`/data/closing/${FIRM}/key-dates`);
    expect((now.key_dates as Link[]).map((link) => link.rule_key)).toContain("advance-receipt");
    expect((await keyDates()).map((date) => date.title)).toContain(
      "Report Walk Fund 301's money received",
    );
  });

  it("4. the allotment adds PAS-3 and the rest, enters the register, and its own Key date is done", async () => {
    const allotted = addDays(today, -2);
    const answer = await ok(`/data/closing/${FIRM}/steps/allotment`, {
      on: allotted,
      shares: "1250",
      price_per_share: "1000",
      add_dates: true,
    });
    const links = answer.key_dates as Link[];
    const due = (rule: string) => links.find((link) => link.rule_key === rule);
    expect(due("allotment")?.state).toBe("done");
    expect(due("pas-3")?.due_on).toBe(addDays(allotted, 15));
    expect(due("register-entry")?.due_on).toBe(addDays(allotted, 7));
    expect(due("share-certificates")?.state).toBe("coming_up");
    expect(due("fc-gpr")?.due_on).toBe(addDays(allotted, 30));
    expect(due("fla")?.title).toBe("FLA return");
    // "Enter it in the register": the register's own entry, with the closing's shares.
    const entered = await ok(`/data/closing/${FIRM}/steps/register`);
    const register = (entered.closing as { register: { folio: string; by_hand: boolean } })
      .register;
    expect(register.by_hand).toBe(false);
    expect(
      (entered.key_dates as Link[]).find((link) => link.rule_key === "register-entry")?.state,
    ).toBe("done");
    const book = await get("/data/members?view=holdings");
    const member = (book.members as { folio: string; name: string }[]).find(
      (item) => item.name === "Walk Fund 301",
    );
    expect(member?.folio).toBe(register.folio);
    expect(
      (book.entries as { shares: number; kind: string; reversed: unknown }[]).filter(
        (entry) => entry.kind === "allotment" && entry.shares === 1250 && !entry.reversed,
      ),
    ).toHaveLength(1);
    expect(
      (book.holdings as { name: string; shares: number; words: string }[]).find(
        (row) => row.name === "Walk Fund 301",
      ),
    ).toMatchObject({ shares: 1250, words: "1,250 of 11,250 · 11.1 per cent" });
    expect(JSON.stringify(book.holdings)).not.toContain("%");
    // Asked again, the register gives the same entry back, and the closing reads its folio.
    expect(((await get(`/data/closing/${FIRM}`)).register as { folio: string }).folio).toBe(
      register.folio,
    );
  });

  it("6. an intern's signed letter and IP assignment reach Agreements as counts, with no name", async () => {
    const person = (
      await ok("/data/people", {
        name: INTERN,
        email: "merged@walkintern.example",
        kind: "intern",
        role_title: "Research intern",
        starts_on: addDays(today, -30),
        ends_on: addDays(today, 59),
        mentor: "Walk Mentor",
        brief: "Invented: build the merged screens.",
        stipend: { amount: 16_789, currency: "INR", pays_on: 7 },
      })
    ).person as { person_id: string };
    personId = person.person_id;
    await ok(`/data/people/${personId}/documents`, {
      kind: "internship",
      title: "Internship letter",
      signed_on: addDays(today, -32),
      includes_ip: false,
      includes_confidentiality: true,
    });
    await ok(`/data/people/${personId}/documents`, {
      kind: "ip_assignment",
      title: "IP assignment",
      signed_on: addDays(today, -32),
    });
    expect(await missingRow("letters")).toMatchObject({
      state: "here",
      found: "1 of 1 people engaged have a signed letter",
      missing: [],
    });
    expect(await missingRow("people_ip")).toMatchObject({
      state: "here",
      found: "1 of 1 interns and contractors have an IP assignment",
      missing: [],
    });
    // The register's answer is the same for whoever asks, Owner or Admin: counts, no name.
    const text = JSON.stringify(await get("/data/agreements"));
    for (const word of [INTERN, "merged@walkintern.example", "16789", "16,789", personId])
      expect(text.includes(word), word).toBe(false);
  });

  it("7. a pilot's signed agreement shows on the pilot, and its firm leaves What is missing", async () => {
    entryId = String(
      (
        (await ok("/data/waitlist", { email: "asha@buyer301.example", firm: "Walk Buyer 301" }))
          .entry as Body
      ).entry_id,
    );
    await ok(`/data/waitlist/${entryId}/stage`, {
      stage: "pilot",
      next_step: "Hold the weekly check-in",
      next_step_on: addDays(today, 7),
      pilot: {
        starts_on: today,
        ends_on: addDays(today, 30),
        success: "Two analysts use it every day",
      },
    });
    expect((await missingRow("pilot")).missing.map((row) => row.name)).toEqual(["Walk Buyer 301"]);
    pilotId = String(
      (
        (
          await ok("/data/pilots", {
            entry_id: entryId,
            starts_on: today,
            ends_on: addDays(today, 30),
            criteria: [
              { what: "Analysts use it every day", target: "Two analysts, five days a week" },
            ],
            owners: { sponsor: "Walk Sponsor", technical: "Walk Engineer", user: "Walk Analyst" },
            free: true,
            go_no_go_on: addDays(today, 28),
            attempt: randomUUID(),
          })
        ).pilot as Body
      ).pilot_id,
    );
    expect((await get(`/data/pilots/${pilotId}`)).agreements).toEqual([]);
    await ok("/data/agreements", {
      title: "Walk merged pilot agreement",
      type: "pilot",
      status: "signed",
      signed_on: today,
      confidentiality_clause: "yes",
      parties: [{ kind: "waitlist", ref_id: entryId, name: "" }],
      file_id: fileId,
    });
    const pilot = await get(`/data/pilots/${pilotId}`);
    expect(pilot.agreements).toEqual([
      expect.objectContaining({
        title: "Walk merged pilot agreement",
        status: "signed",
        signed_on: today,
        type: expect.stringMatching(/pilot/i),
      }),
    ]);
    expect((await missingRow("pilot")).missing).toEqual([]);
    expect((await missingRow("nda")).missing.some((row) => row.name === "Walk Buyer 301")).toBe(
      false,
    );
  });

  it("8. the overview gives the people ledger to the Owner only, and a backup holds it only when asked", async () => {
    const at = `/data/people/${personId}`;
    await ok(`${at}/access`, { system: "Code host", critical: true });
    await ok(`${at}/offboard`, { last_day: today });
    const plain = await get("/data/overview");
    expect((plain.due as { kind: string }[]).some((row) => row.kind === "person")).toBe(false);
    expect(JSON.stringify(plain).includes(INTERN)).toBe(false);
    const owner = (await get("/data/overview?owner=1")).due as Body[];
    expect(owner).toContainEqual(
      expect.objectContaining({
        kind: "person",
        owner_only: true,
        title: `Revoke Code host for ${INTERN}`,
        due_on: addDays(today, 1),
      }),
    );

    const backup = async (people: boolean): Promise<string[]> => {
      const made = await ok("/data/builds", { kind: "backup", people });
      const buildId = String((made.build as Body).build_id);
      let build: Body = {};
      await until(
        async () => {
          build = (await get(`/data/builds/${buildId}`)).build as Body;
          return build.state !== "building";
        },
        "the backup",
        60_000,
      );
      expect(build.state).toBe("ready");
      const bytes = (await stack.raw(stack.socket, "GET", `/data/builds/${buildId}/bytes`)).bytes;
      const zip = join(out, `${buildId}.zip`);
      writeFileSync(zip, bytes);
      return execFileSync("unzip", ["-Z1", zip], { encoding: "utf8" }).split("\n").filter(Boolean);
    };
    const without = await backup(false);
    expect(without.some((name) => name.startsWith("data/people/"))).toBe(false);
    const withPeople = await backup(true);
    expect(withPeople).toContain("data/people/people.json");
  }, 120_000);

  it("9. the calendar feed has a minutes date and a pilot's go/no-go and nothing of People; search has the registers", async () => {
    const board = await get(`/data/meetings/${boardId}`);
    const serial = String(board.serial_title);
    const token = String((await ok("/data/calendar/link")).token);
    const url = `http://127.0.0.1:3120/cal/${token}`;
    const response = await calendarFeedRoute(new NextRequest(url), {
      params: Promise.resolve({ token }),
    });
    expect(response.status).toBe(200);
    const text = (await response.text()).replace(/\r\n[ \t]/g, "").replace(/\\,/g, ",");
    expect(text).toContain(`SUMMARY:Send the draft minutes: ${serial}`);
    expect(text).toContain(
      `DTSTART;VALUE=DATE:${addDays(addDays(today, -10), 15).replaceAll("-", "")}`,
    );
    expect(text).toContain("SUMMARY:Pilot go/no-go · Walk Buyer 301");
    expect(text).toContain(`DTSTART;VALUE=DATE:${addDays(today, 28).replaceAll("-", "")}`);
    for (const word of [INTERN, "Revoke Code host", "stipend", "Stipend", "evaluation", "letter"])
      expect(text.includes(word), word).toBe(false);
    const sources = (await get("/data/calendar")).sources as { name: string; here: boolean }[];
    expect(sources.some((source) => source.name === "people")).toBe(false);
    for (const name of ["meetings", "agreements", "pilots", "diligence"])
      expect(sources.find((source) => source.name === name)?.here, name).toBe(true);

    const groups = (await get("/data/search?q=walk")).groups as {
      kind: string;
      hits: { title: string; href: string }[];
    }[];
    const kinds = groups.map((group) => group.kind);
    expect(kinds).toEqual(expect.arrayContaining(["meeting", "member", "agreement"]));
    expect(kinds).not.toContain("person");
    expect(JSON.stringify(groups).includes(INTERN)).toBe(false);
    expect(groups.find((group) => group.kind === "member")?.hits.map((hit) => hit.title)).toContain(
      "Walk Fund 301",
    );
    const people = (await get(`/data/search?q=${encodeURIComponent("merged intern")}`))
      .groups as unknown[];
    expect(people).toEqual([]);
  });

  it("10. one file lists the filed MGT-14, the signed minutes, a signed agreement, the pilot agreement and the offer letter; never People", async () => {
    await ok(`/data/meetings/${egmId}/minutes/signed`, {
      signed_on: today,
      by_name: "Walk Director",
    });
    await ok(`/data/meetings/${egmId}/minutes/signed-copy`, { file_id: fileId });
    await ok("/data/agreements", {
      title: "Walk merged NDA",
      type: "nda",
      status: "signed",
      signed_on: today,
      parties: [{ kind: "other", name: "Walk Counterparty" }],
      file_id: fileId,
    });
    await ok(`/data/closing/${FIRM}/steps/offer-letter`, {
      on: addDays(today, -35),
      serial: "PAS-4/001",
      file_id: fileId,
    });
    // The people ledger keeps its own copies: a file in Files is refused there.
    const refused = await stack.ask("POST", `/data/people/${personId}/documents`, {
      kind: "internship",
      title: "Internship letter, again",
      signed_on: today,
      file_id: fileId,
      by: WALKER,
    });
    expect(refused.status).toBe(400);
    expect(message(refused)).toBe(
      "Attach the signed copy itself: the people ledger keeps its own copies, never in Files.",
    );
    const egm = String((await get(`/data/meetings/${egmId}`)).serial_title);
    const used = (
      ((await get(`/data/files/${fileId}`)).file as Body).used_for as {
        label: string;
        href: string;
      }[]
    ).map((row) => row.label);
    expect(used).toEqual(
      expect.arrayContaining([
        "Filed copy of “MGT-14: “Walk merged alteration of articles””, in Key dates",
        `Signed minutes of ${egm}`,
        "Signed copy of “Walk merged NDA”, in Agreements",
        "Signed copy of “Walk merged pilot agreement”, in Agreements",
        "Offer letter to Walk Fund 301",
      ]),
    );
    expect(used).toHaveLength(5);
    expect(used.some((label) => /people|intern|letter, again/i.test(label))).toBe(false);
  });
});
