/**
 * The company batch's seams in the browser, with every module loaded (company spec §3.5,
 * §11 step 3). Each unit walked its half against a stand-in; this walk checks the halves
 * meet: an EGM's special resolution and its MGT-14 Key date, each linking to the other (M1);
 * an AGM in Meetings moving the AOC-4, MGT-7A and ADT-1 suggestions (M2); the closing's
 * allotment in the register, its holdings and its certificate date (M3); the company's
 * directors as a board meeting's attendee picker (M4); Agreements' people rows as counts
 * once an intern is in the people ledger (M5); the investor page's sections in the order
 * Closing · Notes · Touches · Activity (M6); `/search?q=walk` with Meetings, Members and
 * Agreements (M7); the calendar feed with a minutes date and a pilot's go/no-go and nothing
 * of People (M8); and the Admin seeing no People link, row, name, amount or document
 * anywhere: Home, Data, search, the calendar feed, Files and the Admin's own backup (M9).
 *
 * The walks run in the order of their names, so this one runs after closing and before
 * company ("company-merged" sorts first), dates, meetings, members, people and pilots. What
 * it adds would change those walks' first pass (the first AGM, the empty ledger), so it adds
 * its records in the second pass (desktop, light), once every other walk has had its first;
 * the checks that only read run in every pass. It uses records of its own (an EGM, an AGM,
 * a board meeting far ahead, an intern, a waitlist firm and its pilot), never another
 * walk's ids, and leaves the closing to the closing walk. Every person and firm is
 * invented, on `.example`.
 */

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { Page } from "playwright";

import { addDays } from "../data/days";
import { inventedPdf } from "../data/files/walk-seed";
import { dayWords } from "../../src/lib/data/labels-registers";
import { WALKER, type WalkKit } from "./kit";

const MEETINGS = "/data/company/meetings";
const EGM = "Walk merged EGM";
const RESOLUTION = "Walk merged alteration of articles";
const AGM = "Walk merged AGM";
const BOARD = "Walk merged board meeting";
const INTERN = "Walk Merged Intern";
const INTERN_EMAIL = "merged@walkintern.example";
const STIPEND = "16,789";
const LETTER = "Walk merged internship letter";
const BUYER = "Walk Buyer 901";
const OWNER_LINE = "The people ledger is for the Owner only.";

const investorIdOf = (firmKey: string): string =>
  createHash("sha256").update(`investor:${firmKey}`).digest("hex").slice(0, 32);
/** The closing walk's firm: its closing reaches the register in that walk's first pass. */
const FUND_281 = investorIdOf("fund281.example");

const flat = (text: string) => text.replace(/\s+/g, " ").trim();
const passIndex = (kit: WalkKit) =>
  (kit.pass.width === "phone" ? 2 : 0) + (kit.pass.theme === "light" ? 1 : 0);

type Body = Record<string, unknown>;
type Link = { date_id: string; rule_key: string; title: string; due_on: string; state: string };
type MeetingRow = { meeting_id: string; title: string; kind: string };

async function until(page: Page, test: () => Promise<boolean>): Promise<boolean> {
  for (let tries = 0; tries < 100; tries += 1) {
    if (await test()) return true;
    await page.waitForTimeout(100);
  }
  return false;
}

async function shown(page: Page, kit: WalkKit, selector: string): Promise<boolean> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const found = await page
      .waitForSelector(selector, { timeout: 30_000 })
      .then(() => true)
      .catch(() => false);
    if (found) return true;
    if (attempt === 0) await page.reload({ waitUntil: "networkidle" });
  }
  kit.check(`merged: ${selector} is on the page`, false, flat(await kit.text()).slice(0, 200));
  return false;
}

/**
 * A page of this walk, with more time than Playwright's 30 s: under a heavy load the first
 * phone run once waited 63 s on Key dates while the service caught up (merge notes).
 */
async function visit(page: Page, url: string): Promise<void> {
  await page.goto(url, { waitUntil: "networkidle", timeout: 90_000 });
}

/** Opens a popover by its label inside `scope`, fills it and presses its button. */
async function submit(
  page: Page,
  scope: string,
  label: string,
  fill: () => Promise<void>,
  button: string,
): Promise<string> {
  const popover = page
    .locator(`${scope} details.popover`, { has: page.locator(`summary:text-is("${label}")`) })
    .first();
  if ((await popover.getAttribute("open")) === null)
    await popover.locator("summary.popover__trigger").click();
  await fill();
  await popover.locator("button", { hasText: button }).click();
  const feedback = popover.locator(".form-sent, [role='alert']");
  await feedback
    .first()
    .waitFor({ timeout: 20_000 })
    .catch(() => undefined);
  return flat((await feedback.allInnerTexts().catch(() => [] as string[])).join(" "));
}

async function meetings(kit: WalkKit): Promise<MeetingRow[]> {
  return ((await kit.socket.ask("GET", "/data/meetings")).body.meetings as MeetingRow[]) ?? [];
}

async function suggestions(kit: WalkKit): Promise<{ key: string; next: string | null }[]> {
  return (
    ((await kit.socket.ask("GET", "/data/dates")).body.suggestions as {
      key: string;
      next: string | null;
    }[]) ?? []
  );
}

/** Plans a meeting from the Meetings view's "Plan a meeting", held on that day when asked. */
async function plan(
  page: Page,
  kit: WalkKit,
  kind: string,
  title: string,
  day: string,
  held: boolean,
): Promise<string> {
  await visit(page, `${kit.base}${MEETINGS}`);
  await submit(
    page,
    ".pagebar__actions",
    "Plan a meeting",
    async () => {
      await page.selectOption("#plan-kind", kind);
      await page.fill("#plan-title", title);
      await page.fill("#plan-day", day);
      if (await page.locator("#plan-place").count())
        await page.fill("#plan-place", "Walk registered office");
      if (held) await page.check("#plan-held");
    },
    "Plan it",
  );
  let id = "";
  await until(page, async () => {
    id = (await meetings(kit)).find((row) => row.title === title)?.meeting_id ?? "";
    return id !== "";
  });
  return id;
}

export async function walk(page: Page, kit: WalkKit): Promise<void> {
  for (const path of [
    "/data/company",
    "/data/meetings",
    "/data/members",
    "/data/agreements",
    "/data/people",
    "/data/pilots",
    "/data/closing",
  ])
    if ((await kit.socket.ask("GET", path)).status !== 200) {
      kit.check(`merged: not every module of the batch is loaded here (${path})`, true);
      return;
    }
  const today = String((await kit.socket.ask("GET", "/data/_test/day")).body.day ?? "");
  const pass = passIndex(kit);

  // Every pass: what the closing walk left in the register (M3) and the firm's page (M6).
  await registerChecks(page, kit);
  await investorOrder(page, kit);
  if (pass !== 1) return;

  await egmBothWays(page, kit, today);
  await agmMoves(page, kit, today);
  await boardPicker(page, kit, today);
  const personId = await internCounts(page, kit, today);
  await searchGroups(page, kit);
  const token = await calendarFeed(page, kit, today);
  await asAdmin(page, kit, personId, token);
  await kit.socket.ask("POST", "/data/calendar/off", { by: WALKER });
}

// ------------------------------------------------------------------ M1: an EGM's MGT-14, both ways

async function egmBothWays(page: Page, kit: WalkKit, today: string): Promise<void> {
  const held = addDays(today, -5);
  const id =
    (await meetings(kit)).find((row) => row.title === EGM)?.meeting_id ??
    (await plan(page, kit, "egm", EGM, held, true));
  if (!id) {
    kit.check("merged M1: the EGM is recorded as held", false);
    return;
  }
  await visit(page, `${kit.base}${MEETINGS}/${id}`);
  if (!(await shown(page, kit, '[data-section="meeting-resolutions"]'))) return;
  await submit(
    page,
    ".rhead",
    "Add a resolution",
    async () => {
      await page.fill("#resolution-new-title", RESOLUTION);
      await page.selectOption("#resolution-new-kind", "special");
    },
    "Add the resolution",
  );
  let link: Link | undefined;
  let resolutionId = "";
  await until(page, async () => {
    const detail = (await kit.socket.ask("GET", `/data/meetings/${id}`)).body;
    const meeting = detail.meeting as { resolutions: { resolution_id: string; title: string }[] };
    resolutionId =
      meeting.resolutions.find((item) => item.title === RESOLUTION)?.resolution_id ?? "";
    link = (detail.key_dates as Record<string, Link[]> | null)?.[resolutionId]?.[0];
    return link !== undefined;
  });
  await page.reload({ waitUntil: "networkidle" });
  const row = page.locator("#table-resolutions tr", { hasText: RESOLUTION }).first();
  const rowText = flat(await row.innerText());
  const toDate = await row.locator(`a[href="/data/dates#date-${link?.date_id ?? "none"}"]`).count();
  kit.check(
    "merged M1: the special resolution's MGT-14 cell links to its Key date, by the meeting day plus 30, Coming up",
    link?.title === `MGT-14: “${RESOLUTION}”` &&
      link.due_on === addDays(held, 30) &&
      rowText.includes(`By ${dayWords(addDays(held, 30))}`) &&
      rowText.includes("Coming up") &&
      toDate === 1,
    rowText,
  );

  // The other way: Key dates' row says where it came from, and links back.
  await visit(page, `${kit.base}/data/dates`);
  const dateRow = page.locator(`#date-${link?.date_id ?? "none"}`);
  const back = `${MEETINGS}/${id}#resolution-${resolutionId}`;
  const dateText = (await dateRow.count()) ? flat(await dateRow.innerText()) : "";
  kit.check(
    "merged M1: Key dates' MGT-14 row reads From: the resolution, linking to the meeting",
    dateText.includes(`MGT-14: “${RESOLUTION}”`) &&
      dateText.includes(`From: Resolution “${RESOLUTION}”`) &&
      (await dateRow.locator(`a[href="${back}"]`).count()) === 1,
    dateText.slice(0, 200),
  );

  // Done in Key dates shows Done on the meeting.
  await dateRow.locator("summary", { hasText: "Done" }).click();
  await dateRow.locator("textarea[name=note]").fill("Invented: filed by the CS.");
  await dateRow.locator("button", { hasText: "Mark it done" }).click();
  await until(page, async () => {
    const detail = (await kit.socket.ask("GET", `/data/meetings/${id}`)).body;
    return (detail.key_dates as Record<string, Link[]>)[resolutionId]?.[0]?.state === "done";
  });
  await visit(page, `${kit.base}${MEETINGS}/${id}`);
  const after = flat(
    await page.locator("#table-resolutions tr", { hasText: RESOLUTION }).first().innerText(),
  );
  kit.check(
    "merged M1: marked done in Key dates, the meeting's MGT-14 cell reads Done",
    after.includes("Done") && !after.includes("Coming up"),
    after,
  );
}

// ------------------------------------------------------------------ M2: an AGM moves the AGM-based rows

async function agmMoves(page: Page, kit: WalkKit, today: string): Promise<void> {
  // Later than the AGM day the dates walk types (today − 41), so Meetings' day counts.
  const held = addDays(today, -20);
  const before = await suggestions(kit);
  if (!(await meetings(kit)).some((row) => row.title === AGM))
    await plan(page, kit, "agm", AGM, held, true);
  const after = await suggestions(kit);
  await visit(page, `${kit.base}/data/dates`);
  if (!(await shown(page, kit, ".hqdata-dates"))) return;
  const from = `From the AGM held ${dayWords(held)}`;
  const said: string[] = [];
  for (const [key, days] of [
    ["aoc-4", 30],
    ["mgt-7a", 60],
    ["adt-1", 15],
  ] as const) {
    const row = page.locator(`#suggested-${key}`);
    const text = (await row.count()) ? flat(await row.innerText()) : "";
    const due = addDays(held, days);
    const moved =
      after.find((item) => item.key === key)?.next === due &&
      before.find((item) => item.key === key)?.next !== due;
    if (!moved || !text.includes(from) || !text.includes(`Due ${dayWords(due)}`))
      said.push(`${key}: ${text.slice(0, 120)}`);
  }
  kit.check(
    "merged M2: an AGM held in Meetings moves AOC-4 (+30), MGT-7A (+60) and ADT-1 (+15), each From the AGM held that day",
    said.length === 0,
    said,
  );
}

// ------------------------------------------------------------------ M3: the closing in the register

async function registerChecks(page: Page, kit: WalkKit): Promise<void> {
  const detail = (await kit.socket.ask("GET", `/data/closing/${FUND_281}`)).body as {
    closing?: { register: { folio: string } | null; allotment: { shares: number } | null } | null;
    key_dates?: Link[] | null;
  };
  const register = detail.closing?.register;
  if (!register || !detail.closing?.allotment) {
    kit.check(
      "merged M3: the closing walk entered Walk Fund 281's allotment in the register",
      false,
    );
    return;
  }
  await visit(page, `${kit.base}/data/company/members`);
  if (!(await shown(page, kit, "#table-members"))) return;
  const member = flat(
    await page.locator("#table-members tr", { hasText: "Walk Fund 281" }).first().innerText(),
  );
  await visit(page, `${kit.base}/data/company/members?view=holdings`);
  if (!(await shown(page, kit, "#table-holdings-from-the-register"))) return;
  const holding = flat(
    await page
      .locator("#table-holdings-from-the-register tr", { hasText: "Walk Fund 281" })
      .first()
      .innerText(),
  );
  const certificates = detail.key_dates?.find((link) => link.rule_key === "share-certificates");
  await visit(page, `${kit.base}/data/dates?view=all`);
  const dateRow = page.locator(`#date-${certificates?.date_id ?? "none"}`);
  const dateText = (await dateRow.count()) ? flat(await dateRow.innerText()) : "";
  kit.check(
    "merged M3: the closing's allotment is in the register under its folio, in the holdings, and its certificate date is in Key dates",
    member.includes(register.folio) &&
      holding.includes("1,250 of ") &&
      !holding.includes("%") &&
      certificates !== undefined &&
      dateText.includes("Share certificates: Walk Fund 281") &&
      dateText.includes(dayWords(certificates.due_on).replace(/ \d{4}$/, "")),
    { member: member.slice(0, 80), holding: holding.slice(0, 80), date: dateText.slice(0, 120) },
  );
}

// ------------------------------------------------------------------ M4: the directors are the picker

async function boardPicker(page: Page, kit: WalkKit, today: string): Promise<void> {
  // Far ahead and only planned: the meetings walk's board meeting stays Board meeting 1.
  const day = addDays(today, 60);
  let id = (await meetings(kit)).find((row) => row.title === BOARD)?.meeting_id ?? "";
  if (!id) {
    const made = await kit.socket.ask("POST", "/data/meetings", {
      kind: "board",
      title: BOARD,
      place: "Walk registered office",
      scheduled_on: day,
      by: WALKER,
    });
    id = String((made.body.meeting as Body | undefined)?.meeting_id ?? "");
  }
  const directors =
    ((await kit.socket.ask("GET", "/data/company/directors?ceased=1")).body.directors as {
      name: string;
      appointed_on: string | null;
      ceased_on: string | null;
    }[]) ?? [];
  const inOffice = directors
    .filter(
      (director) =>
        (!director.appointed_on || director.appointed_on <= day) &&
        (!director.ceased_on || director.ceased_on > day),
    )
    .map((director) => director.name)
    .sort();
  await visit(page, `${kit.base}${MEETINGS}/${id}`);
  if (!(await shown(page, kit, ".rhead"))) return;
  const popover = page
    .locator(".rhead details.popover", {
      has: page.locator('summary:text-is("Record how it went")'),
    })
    .first();
  await popover.locator("summary.popover__trigger").click();
  const picker = popover.locator("fieldset.hqdata-attendees", {
    hasText: "Directors in office that day",
  });
  const offered = (await picker.locator("label").allInnerTexts()).map(flat).sort();
  await popover.locator("summary.popover__trigger").click();
  kit.check(
    "merged M4: a board meeting's attendee picker lists the company record's directors in office that day",
    inOffice.length > 0 && JSON.stringify(offered) === JSON.stringify(inOffice),
    { offered, inOffice },
  );
}

// ------------------------------------------------------------------ M5: an intern, then Agreements' counts

async function internCounts(page: Page, kit: WalkKit, today: string): Promise<string> {
  const find = async () =>
    (
      ((await kit.socket.ask("GET", "/data/people?state=all")).body.people as {
        person_id: string;
        name: string;
      }[]) ?? []
    ).find((person) => person.name === INTERN)?.person_id ?? "";
  let id = await find();
  if (!id) {
    // Starts today, paid by the 28th of the next month, its midpoint three months on: no
    // row of his on Due yet, so the overview walk's count is not moved by it.
    await visit(page, `${kit.base}/data/people`);
    await page.locator("summary", { hasText: "Add a person" }).click();
    await page.fill("#person-new-name", INTERN);
    await page.fill("#person-new-email", INTERN_EMAIL);
    await page.selectOption("#person-new-kind", "intern");
    await page.fill("#person-new-role", "Research intern");
    await page.fill("#person-new-starts", today);
    await page.fill("#person-new-ends", addDays(today, 180));
    await page.fill("#person-new-mentor", "Walk Mentor");
    await page.fill("#person-new-brief", "Invented: build the merged screens.");
    await page.fill("#person-new-stipend", STIPEND.replace(",", ""));
    await page.selectOption("#person-new-currency", "INR");
    await page.selectOption("#person-new-pays", "28");
    await page.locator("button", { hasText: "Add them" }).click();
    await until(page, async () => (id = await find()) !== "");
    const letter = Buffer.from(
      await inventedPdf(["Invented: an internship letter for the merged walk."], LETTER),
    );
    for (const document of [
      { kind: "internship", title: LETTER, file: true },
      { kind: "ip_assignment", title: "Walk merged IP assignment", file: false },
    ]) {
      await visit(page, `${kit.base}/data/people/${id}`);
      await page.locator(".rhead summary", { hasText: "Add a document" }).click();
      await page.selectOption("#document-new-kind", document.kind);
      await page.fill("#document-new-signed", addDays(today, -2));
      await page.fill("#document-new-title", document.title);
      if (document.file)
        await page.setInputFiles("#document-new-file", {
          name: "walk-merged-letter.pdf",
          mimeType: "application/pdf",
          buffer: letter,
        });
      await page.locator("form button", { hasText: "Add the document" }).click();
      await until(page, async () => {
        const person = (await kit.socket.ask("GET", `/data/people/${id}`)).body.person as
          { documents: { title: string }[] } | undefined;
        return Boolean(person?.documents.some((item) => item.title === document.title));
      });
    }
  }
  const rows =
    ((await kit.socket.ask("GET", "/data/agreements")).body.missing as {
      key: string;
      state: string;
      found: string;
    }[]) ?? [];
  const letters = rows.find((row) => row.key === "letters");
  const ip = rows.find((row) => row.key === "people_ip");
  await visit(page, `${kit.base}/data/company/agreements`);
  if (!(await shown(page, kit, "#table-what-is-missing"))) return id;
  const table = page.locator("#table-what-is-missing");
  const lettersRow = flat(
    await table
      .locator("tr", { hasText: "people engaged have a signed letter" })
      .first()
      .innerText(),
  );
  const ipRow = flat(
    await table
      .locator("tr", { hasText: "interns and contractors have an IP" })
      .first()
      .innerText(),
  );
  const all = /^(\d+) of \1 /;
  kit.check(
    "merged M5: with the intern's letter and IP assignment, Agreements' people rows read every one of them, Here, as counts",
    letters?.state === "here" &&
      ip?.state === "here" &&
      all.test(letters.found) &&
      all.test(ip.found) &&
      !letters.found.startsWith("0 ") &&
      lettersRow.includes(letters.found) &&
      ipRow.includes(ip.found) &&
      !flat(await table.innerText()).includes(INTERN),
    { letters: letters?.found, ip: ip?.found, lettersRow, ipRow },
  );
  return id;
}

// ------------------------------------------------------------------ M6: the investor page's order

async function investorOrder(page: Page, kit: WalkKit): Promise<void> {
  await visit(page, `${kit.base}/data/investors/${FUND_281}`);
  if (!(await shown(page, kit, '[data-section="investor-touches"]'))) return;
  const order = await page
    .locator(".record-layout__main > *")
    .evaluateAll((nodes) =>
      nodes.map(
        (node) =>
          node.getAttribute("data-section") ??
          node.querySelector("[data-section]")?.getAttribute("data-section") ??
          "",
      ),
    );
  const at = (name: string) => order.indexOf(name);
  kit.check(
    "merged M6: the investor firm's page reads Closing, Notes, Touches, then Activity",
    at("investor-closing") >= 0 &&
      at("investor-closing") < at("investor-notes") &&
      at("investor-notes") < at("investor-touches") &&
      at("investor-touches") < at("investor-activity"),
    order.join(" "),
  );
}

// ------------------------------------------------------------------ M7: search finds the registers

async function searchGroups(page: Page, kit: WalkKit): Promise<void> {
  await visit(page, `${kit.base}/search?q=walk`);
  if (!(await shown(page, kit, ".search-results"))) return;
  const heading = async (kind: string) => {
    const section = page.locator(`section[aria-labelledby='search-data-${kind}']`);
    return (await section.count()) === 1 ? flat(await section.locator("h2").innerText()) : "";
  };
  const found = {
    meeting: await heading("meeting"),
    member: await heading("member"),
    agreement: await heading("agreement"),
  };
  kit.check(
    "merged M7: /search?q=walk shows Meetings, Members and Agreements, and no people ledger",
    found.meeting === "Meetings" &&
      found.member === "Members" &&
      found.agreement === "Agreements" &&
      (await page.locator("main a[href^='/data/people']").count()) === 0,
    found,
  );
}

// ------------------------------------------------------------------ M8: the calendar feed

async function calendarFeed(page: Page, kit: WalkKit, today: string): Promise<string> {
  // A waitlist firm of this walk's own, and its pilot with a go/no-go day four weeks on.
  const entries =
    ((await kit.socket.ask("GET", `/data/waitlist?q=${encodeURIComponent(BUYER)}`)).body.entries as
      { entry_id: string; firm: string }[] | undefined) ?? [];
  let entryId = entries.find((entry) => entry.firm === BUYER)?.entry_id ?? "";
  if (!entryId)
    entryId = String(
      (
        (
          await kit.socket.ask("POST", "/data/waitlist", {
            email: "asha@buyer901.example",
            firm: BUYER,
            by: WALKER,
          })
        ).body.entry as Body | undefined
      )?.entry_id ?? "",
    );
  const pilots =
    ((await kit.socket.ask("GET", "/data/pilots")).body.pilots as { firm: string }[]) ?? [];
  if (entryId && !pilots.some((pilot) => pilot.firm === BUYER))
    await kit.socket.ask("POST", "/data/pilots", {
      entry_id: entryId,
      starts_on: addDays(today, 3),
      ends_on: addDays(today, 33),
      criteria: [{ what: "Analysts use it every day", target: "Two analysts, five days a week" }],
      owners: { sponsor: "Walk Sponsor", technical: "Walk Engineer", user: "Walk Analyst" },
      free: true,
      go_no_go_on: addDays(today, 28),
      attempt: crypto.randomUUID(),
      by: WALKER,
    });
  const egm = (await meetings(kit)).find((row) => row.title === EGM);
  const serial = egm
    ? String((await kit.socket.ask("GET", `/data/meetings/${egm.meeting_id}`)).body.serial_title)
    : "";
  await kit.socket.ask("POST", "/data/calendar/detail", { detail: "full", by: WALKER });
  const token = String(
    (await kit.socket.ask("POST", "/data/calendar/link", { by: WALKER })).body.token ?? "",
  );
  const feed = await page.request.get(`${kit.base}/cal/${token}`);
  const text = (await feed.text()).replace(/\r\n[ \t]/g, "").replace(/\\([,;])/g, "$1");
  const draft = addDays(addDays(today, -5), 15).replace(/-/g, "");
  const go = addDays(today, 28).replace(/-/g, "");
  const people = [INTERN, "Walk Intern", "stipend", "Stipend", "Revoke ", "evaluation"].filter(
    (word) => text.includes(word),
  );
  kit.check(
    "merged M8: the calendar feed holds the EGM's minutes date and the pilot's go/no-go, and nothing of the people ledger",
    feed.status() === 200 &&
      serial !== "" &&
      text.includes(`SUMMARY:Send the draft minutes: ${serial}`) &&
      text.includes(`DTSTART;VALUE=DATE:${draft}`) &&
      text.includes(`SUMMARY:Pilot go/no-go · ${BUYER}`) &&
      text.includes(`DTSTART;VALUE=DATE:${go}`) &&
      people.length === 0,
    { status: feed.status(), serial, people },
  );
  return token;
}

// ------------------------------------------------------------------ M9: the Admin sees none of People

async function asAdmin(page: Page, kit: WalkKit, personId: string, token: string): Promise<void> {
  const browser = page.context().browser();
  if (!browser) {
    kit.check("merged M9: a browser for the Admin", false);
    return;
  }
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    acceptDownloads: true,
  });
  const admin = await context.newPage();
  const folder = mkdtempSync(join(tmpdir(), "hqmw-"));
  const names = [INTERN, "Walk Intern", INTERN_EMAIL, LETTER];
  // As the pages print it; bare digits also turn up inside invented phone numbers.
  const amounts = [STIPEND];
  const leaks: string[] = [];
  const look = (where: string, text: string) => {
    for (const word of [...names, ...amounts])
      if (text.includes(word)) leaks.push(`${where}: ${word}`);
  };
  try {
    await admin.goto(`${kit.base}/dev/signin?as=admin%40hq.test&next=%2Fhome`, {
      waitUntil: "networkidle",
    });
    // Home and the rail.
    const rail = await admin.locator('#shell-sidebar a[href="/data/people"]').count();
    const owed = (await admin.locator(".owed__kind").allInnerTexts()).map((kind) =>
      kind.trim().toLowerCase(),
    );
    look("home", await admin.locator("main").first().innerText());
    // People itself, the person and the letter's copy.
    const refused: string[] = [];
    for (const path of ["/data/people", `/data/people/${personId}`]) {
      await admin.goto(`${kit.base}${path}`, { waitUntil: "networkidle" });
      const body = await admin.locator("main").first().innerText();
      if (!body.includes(OWNER_LINE)) refused.push(path);
      look(path, body);
    }
    // Data's overview: no People row on Due.
    await admin.goto(`${kit.base}/data`, { waitUntil: "networkidle" });
    const kinds = (await admin.locator(".hqdata-due__kind").allInnerTexts()).map((kind) =>
      kind.trim().toLowerCase(),
    );
    look("data", await admin.locator("main").first().innerText());
    // Search, for the intern's name and the letter's title.
    let peopleLinks = 0;
    for (const words of [INTERN, LETTER]) {
      await admin.goto(`${kit.base}/search?q=${encodeURIComponent(words)}`, {
        waitUntil: "networkidle",
      });
      peopleLinks += await admin.locator("main a[href^='/data/people']").count();
      const hits = await admin.locator("main section a").allInnerTexts();
      look(`search ${words}`, hits.join(" "));
    }
    // Files, searched for the letter and for the intern.
    for (const words of [LETTER, INTERN]) {
      await admin.goto(`${kit.base}/data/files?q=${encodeURIComponent(words)}`, {
        waitUntil: "networkidle",
      });
      const links = await admin.locator("main a[href^='/data/files/']").allInnerTexts();
      look(`files ${words}`, links.join(" "));
    }
    // The calendar feed (the same for anyone with its link).
    const feed = await admin.request.get(`${kit.base}/cal/${token}`);
    look("calendar feed", await feed.text());
    // The Admin's own backup, from the overview.
    await admin.goto(`${kit.base}/data`, { waitUntil: "networkidle" });
    const [download] = await Promise.all([
      admin.waitForEvent("download", { timeout: 120_000 }),
      admin.locator("button", { hasText: "Download a backup" }).click(),
    ]);
    const zip = join(folder, "admin-backup.zip");
    await download.saveAs(zip);
    const entries = execFileSync("unzip", ["-Z1", zip], { encoding: "utf8" })
      .split("\n")
      .filter(Boolean);
    const readme = execFileSync("unzip", ["-p", zip, "README.txt"], { encoding: "utf8" });
    const everything = execFileSync("unzip", ["-p", zip], { maxBuffer: 1024 ** 3 });
    for (const word of [...names, STIPEND, '"amount":16789'])
      if (everything.includes(word)) leaks.push(`backup: ${word}`);
    kit.check(
      "merged M9: the Admin has no People link, no People row on Home or Data, the owner line on People, and no name, amount or letter in search, Files or the calendar feed",
      rail === 0 &&
        !owed.includes("people") &&
        !kinds.includes("people") &&
        refused.length === 0 &&
        peopleLinks === 0 &&
        leaks.filter((leak) => !leak.startsWith("backup")).length === 0,
      { rail, owed, kinds, refused, peopleLinks, leaks },
    );
    kit.check(
      "merged M9: the Admin's backup has no data/people/, says it is left out, and holds no name or amount from the ledger",
      entries.length > 0 &&
        !entries.some((name) => name.startsWith("data/people/")) &&
        readme.includes(
          "- data/people/ is left out: only a backup the Owner makes holds the people ledger.",
        ) &&
        !leaks.some((leak) => leak.startsWith("backup")),
      { entries: entries.length, leaks: leaks.filter((leak) => leak.startsWith("backup")) },
    );
  } finally {
    rmSync(folder, { recursive: true, force: true });
    await context.close();
  }
}
