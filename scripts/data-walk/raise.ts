/**
 * The raise batch's seams, walked with every module loaded (raise spec §3.4, §10 step 3):
 * on Walk Fund 281's page, the Notes section with the seeded `walk-note` and a working
 * composer (X1); the Introduction picker listing "Walk Introducer" from Contacts, kept as
 * that contact (X2); a pack share to the firm recorded from the pack's own firm picker and
 * shown in the firm's "Data room" block (X3); "The raise" on Numbers equal to the funnel
 * (X4); the update's recipients from the real firms (X5); the calendar feed holding an
 * investor next step, a note's action and a file review (X6); `/search?q=walk` with every
 * kind (X7); and Home's owed row "Action" (X8). Every firm, person and file is invented.
 */

import { createHash } from "node:crypto";
import { request } from "node:http";

import type { Page } from "playwright";

import { WALKER, type WalkKit } from "./kit";

type Body = Record<string, unknown>;
type Answer = { status: number; body: Body };

const FIRM_KEY = "fund281.example";
const FIRM_ID = createHash("sha256").update(`investor:${FIRM_KEY}`).digest("hex").slice(0, 32);
const FIRM = "Walk Fund 281";
const PACK = "walk-pack";
const FUNDRAISING = "10 Fundraising and investors";
const REVIEW_FILE = "Walk review copy";

/** The note this walk adds from the firm's own Notes section, once. */
const NOTE = {
  title: "Walk data room call",
  body: "Invented: they asked to see the data room before a second meeting.",
  people: "Asha281 Rao281, partner",
  action: "Send the data room link",
};

/** One FAQ entry and one decision that say "Walk", so `/search?q=walk` has every kind. */
const SEEDED_QUESTION = {
  question: "Who keeps the Walk cap table?",
  answer: "Invented: the company secretary keeps it and sends a copy each quarter.",
};
const SEEDED_DECISION = {
  title: "Walk data room after a first meeting",
  why: "Invented: firms see the deck first and the data room once they have met us.",
  decided_by: "Walk Owner",
  decided_on: "",
  status: "decided",
};

const SEARCH_KINDS = [
  ["lead", "All leads"],
  ["investor", "Investors"],
  ["file", "Files"],
  ["note", "Notes"],
  ["faq", "Investor FAQ"],
  ["decision", "Decisions"],
  ["contact", "Contacts"],
] as const;

const flat = (text: string) => text.replace(/\s+/g, " ").trim();
const count = (value: number) => value.toLocaleString("en-GB");
const unfold = (text: string) => text.replace(/\r\n[ \t]/g, "");
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const dayMonth = (day: string) => {
  const [, month = "", date = ""] = day.split("-");
  return `${Number(date)} ${MONTHS[Number(month) - 1] ?? ""}`;
};
const addDays = (day: string, days: number) => {
  const [year = 0, month = 1, date = 1] = day.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, date + days)).toISOString().slice(0, 10);
};

function ask(
  socket: string,
  method: "GET" | "POST",
  path: string,
  body?: unknown,
): Promise<Answer> {
  return new Promise((resolve, reject) => {
    const text = body === undefined ? undefined : JSON.stringify(body);
    const outgoing = request(
      {
        socketPath: socket,
        path,
        method,
        headers: text
          ? { "content-type": "application/json", "content-length": Buffer.byteLength(text) }
          : {},
      },
      (response) => {
        const chunks: Buffer[] = [];
        response.on("data", (chunk: Buffer) => chunks.push(chunk));
        response.on("end", () => {
          let parsed: Body = {};
          try {
            parsed = JSON.parse(Buffer.concat(chunks).toString("utf8")) as Body;
          } catch {
            parsed = {};
          }
          resolve({ status: response.statusCode ?? 0, body: parsed });
        });
      },
    );
    outgoing.on("error", reject);
    if (text) outgoing.write(text);
    outgoing.end();
  });
}

/** The FAQ entry and the decision, once (the notes module's own seed has run). */
export async function seed(socketPath: string): Promise<void> {
  const faq = await ask(socketPath, "GET", "/data/faq");
  if (faq.status !== 200) {
    console.log(`[walk] raise: the notes module is not loaded here (${faq.status})`);
    return;
  }
  if (
    !((faq.body.entries as { question: string }[] | undefined) ?? []).some(
      (entry) => entry.question === SEEDED_QUESTION.question,
    )
  )
    await ask(socketPath, "POST", "/data/faq", { ...SEEDED_QUESTION, by: WALKER });
  const decisions = (await ask(socketPath, "GET", "/data/decisions")).body.decisions as
    { title: string }[] | undefined;
  if (!decisions?.some((decision) => decision.title === SEEDED_DECISION.title))
    await ask(socketPath, "POST", "/data/decisions", { ...SEEDED_DECISION, by: WALKER });
}

async function until(page: Page, test: () => Promise<boolean>, tries = 100): Promise<boolean> {
  for (let attempt = 0; attempt < tries; attempt += 1) {
    if (await test()) return true;
    await page.waitForTimeout(100);
  }
  return false;
}

/**
 * Open a page and wait for its own element; once more after a reload when it is slow, then
 * a failed check with what the page said instead.
 */
async function open(page: Page, kit: WalkKit, path: string, ready: string): Promise<boolean> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    if (attempt === 0) await page.goto(`${kit.base}${path}`, { waitUntil: "networkidle" });
    else await page.reload({ waitUntil: "networkidle" });
    const here = await page
      .waitForSelector(ready, { timeout: 30_000 })
      .then(() => true)
      .catch(() => false);
    if (here) return true;
    console.log(`[walk] ${ready} was not on ${path}: ${flat(await kit.text()).slice(0, 160)}`);
  }
  kit.check(`raise: ${ready} is on ${path}`, false, flat(await kit.text()).slice(0, 200));
  return false;
}

type Detail = {
  investor?: {
    firm: string;
    intro?: { status: string; introducer: string; contact_id: string | null };
  };
  introducers?: { contact_id: string; name: string; firm: string }[] | null;
  data_room?: { pack_id: string; name: string; version: number; how: string }[] | null;
};

const detailOf = async (kit: WalkKit): Promise<Detail> =>
  (await kit.socket.ask("GET", `/data/investors/${FIRM_ID}`)).body as Detail;

type NoteRow = {
  note_id: string;
  title: string;
  subject_name: string;
  withdrawn: unknown;
  actions: { action_id: string; title: string; state: string; due_on: string | null }[];
};

const firmNotes = async (kit: WalkKit): Promise<NoteRow[]> =>
  ((
    await kit.socket.ask(
      "GET",
      `/data/notes?subject_kind=investor&subject_id=${FIRM_ID}&withdrawn=1`,
    )
  ).body.notes as NoteRow[] | undefined) ?? [];

type Stage = { stage: string; now: number; reached: number; of: number };
type Funnel = { firms: number; days_since_first_send: number | null; stages: Stage[] };

export async function walk(page: Page, kit: WalkKit): Promise<void> {
  const firmPage = await kit.socket.ask("GET", `/data/investors/${FIRM_ID}`);
  const notesHere = (await kit.socket.ask("GET", "/data/faq")).status === 200;
  const packsHere = (await kit.socket.ask("GET", `/data/packs/${PACK}`)).status === 200;
  if (firmPage.status !== 200 || !notesHere || !packsHere) {
    kit.check(
      "raise: every module is loaded (investors, notes, contacts, packs), so the seams can be walked",
      false,
      { investor: firmPage.status, notes: notesHere, packs: packsHere },
    );
    return;
  }
  const today = String((await kit.socket.ask("GET", "/data/_test/day")).body.day ?? "");

  // ---------------------------------------------------------------- X1: the Notes section
  if (!(await open(page, kit, `/data/investors/${FIRM_ID}`, '[data-section="investor-notes"]')))
    return;
  const section = page.locator('[data-section="investor-notes"]');
  const findMine = async () =>
    (await firmNotes(kit)).find((note) => note.title === NOTE.title && note.withdrawn === null);
  if (kit.pass.first && !(await findMine())) {
    await section.locator("summary", { hasText: "Add a note" }).click();
    await page.selectOption("#investor-notes-new-kind", "call");
    await page.fill("#investor-notes-new-held", today);
    await page.fill("#investor-notes-new-title", NOTE.title);
    await page.fill("#investor-notes-new-body", NOTE.body);
    await page.fill("#investor-notes-new-people", NOTE.people);
    await page.fill("#investor-notes-new-action-0", NOTE.action);
    await page.fill("#investor-notes-new-action-0-due", today);
    await page.fill("#investor-notes-new-action-0-who", "Walk Owner");
    await section.locator("button", { hasText: "Add the note" }).click();
    const said = await kit
      .says("Added the note. 1 action is on Due on its day.", 20_000)
      .then(() => true)
      .catch(() => false);
    const made = await until(page, async () => Boolean(await findMine()));
    kit.check(
      "raise X1: Add a note on the investor firm's page says it was added, and the service has it",
      said && made,
      { said, made },
    );
    await open(page, kit, `/data/investors/${FIRM_ID}`, '[data-section="investor-notes"]');
  }
  const mine = await findMine();
  const notesText = flat(await section.innerText());
  kit.check(
    "raise X1: the firm's Notes section lists the seeded walk-note and the note added from it, named by the investors module",
    notesText.includes("Walk first call") &&
      mine !== undefined &&
      mine.subject_name === FIRM &&
      notesText.includes(NOTE.title),
    { name: mine?.subject_name, text: notesText.slice(0, 200) },
  );

  // ---------------------------------------------------------------- X2: the introducer picker
  const contacts =
    ((await kit.socket.ask("GET", "/data/contacts")).body.contacts as
      { contact_id: string; name: string; role: string }[] | undefined) ?? [];
  const introducer = contacts.find(
    (contact) => contact.name === "Walk Introducer" && contact.role === "introducer",
  );
  await page.locator("summary", { hasText: /^Introduction$/ }).click();
  const intro = page.locator("form", { has: page.locator("#intro-status") });
  const options = await intro
    .locator("#intro-contact option")
    .evaluateAll((items) =>
      items.map((item) => [(item as HTMLOptionElement).value, (item.textContent ?? "").trim()]),
    );
  kit.check(
    "raise X2: the Introduction popover lists Walk Introducer from Contacts",
    introducer !== undefined &&
      options.some(
        ([value, label]) =>
          value === introducer.contact_id && label === "Walk Introducer · Walk Angels",
      ),
    options,
  );
  if (!introducer) return;
  await intro.locator("#intro-status").selectOption("made");
  await intro.locator("#intro-contact").selectOption(introducer.contact_id);
  await intro.locator("#intro-name").fill("");
  await intro.locator("button", { hasText: "Save the introduction" }).click();
  let kept: Detail = {};
  const saved = await until(page, async () => {
    kept = await detailOf(kit);
    return kept.investor?.intro?.contact_id === introducer.contact_id;
  });
  const warm = ((await kit.socket.ask("GET", "/data/investors?intro=warm")).body.investors ??
    []) as { investor_id: string }[];
  await open(page, kit, `/data/investors/${FIRM_ID}`, 'section.props[aria-label="Introduction"]');
  const introBlock = page.locator('section.props[aria-label="Introduction"]');
  kit.check(
    "raise X2: choosing Walk Introducer keeps that contact; the firm is warm and its page links to the contact",
    saved &&
      kept.investor?.intro?.status === "made" &&
      kept.investor.intro.introducer === "Walk Introducer" &&
      warm.some((row) => row.investor_id === FIRM_ID) &&
      (await introBlock
        .locator(`a[href="/data/contacts#contact-${introducer.contact_id}"]`)
        .count()) === 1,
    { intro: kept.investor?.intro, warm: warm.length },
  );

  // ---------------------------------------------------------------- X3: a pack share, then the Data room
  const pack = (await kit.socket.ask("GET", `/data/packs/${PACK}`)).body as {
    pack: { name: string; version: number };
    firms: { investor_id: string; firm: string }[] | null;
  };
  if (!(await open(page, kit, `/data/files/packs/${PACK}`, "#table-in-the-pack"))) return;
  await page.locator("summary", { hasText: "Record a share" }).click();
  const shareForm = page.locator("form", { has: page.locator("#pack-share-to") });
  const picker = await shareForm
    .locator("select#pack-share-firm option")
    .evaluateAll((items) => items.map((item) => (item as HTMLOptionElement).value));
  kit.check(
    "raise X3: the pack's firm picker is the investors module's firms, Walk Fund 281 among them",
    (pack.firms ?? []).some((firm) => firm.investor_id === FIRM_ID && firm.firm === FIRM) &&
      picker.includes(FIRM_ID),
    { firms: pack.firms?.length ?? null, picker: picker.length },
  );
  const before = ((await detailOf(kit)).data_room ?? []).length;
  await shareForm.locator("select#pack-share-firm").selectOption(FIRM_ID);
  await shareForm.locator("#pack-share-to").fill("partner281@fund281.example");
  await shareForm.locator("button", { hasText: "Record it" }).click();
  const recorded = await until(page, async () =>
    (await shareForm.innerText()).includes(`Recorded: ${FIRM}, version ${pack.pack.version}.`),
  );
  const room = (await detailOf(kit)).data_room ?? null;
  if (
    !(await open(page, kit, `/data/investors/${FIRM_ID}`, 'section.props[aria-label="Data room"]'))
  )
    return;
  const roomText = flat(await page.locator('section.props[aria-label="Data room"]').innerText());
  const line = `${pack.pack.name} v${pack.pack.version} · shared ${dayMonth(today)} · Sent the zip from my mailbox`;
  kit.check(
    "raise X3: the share is in the firm's Data room block, as the pack's version, day and how",
    recorded &&
      room !== null &&
      room.length === before + 1 &&
      room[0]?.pack_id === PACK &&
      roomText.includes(line),
    { line, roomText: roomText.slice(0, 200), before, after: room?.length },
  );
  await kit.audit("raise-firm");

  // ---------------------------------------------------------------- X4: The raise on Numbers
  const funnel = (await kit.socket.ask("GET", "/data/raise/funnel")).body.funnel as Funnel;
  const stage = (name: string) => funnel.stages.find((row) => row.stage === name);
  const days = funnel.days_since_first_send;
  const expected = [
    `Firms ${count(funnel.firms)}`,
    `Written to ${count(stage("written")?.reached ?? -1)}`,
    `Replied ${count(stage("replied")?.reached ?? -1)}`,
    `Meeting booked ${count(stage("meeting")?.reached ?? -1)}`,
    `Met ${count(stage("met")?.reached ?? -1)}`,
    `Soft commit ${count(stage("soft")?.now ?? -1)}`,
    `Signed ${count(stage("signed")?.now ?? -1)}`,
    `Money in ${count(stage("money_in")?.now ?? -1)}`,
    days === null
      ? "Nothing sent yet"
      : `${count(days)} ${days === 1 ? "day" : "days"} since the first send`,
  ].join(" · ");
  if (!(await open(page, kit, "/data/numbers", '[data-section="numbers-raise"]'))) return;
  const raiseLine = flat(
    await page.locator('[data-section="numbers-raise"] .hqdata-numbers__line').innerText(),
  );
  kit.check(
    "raise X4: The raise on Numbers is the funnel's counts (GET /data/raise/funnel)",
    raiseLine === expected,
    { page: raiseLine, funnel: expected },
  );

  // ---------------------------------------------------------------- X5: the update's recipients
  const month = today.slice(0, 7);
  const update = (await kit.socket.ask("GET", `/data/numbers/updates/${month}`)).body.update as
    { status: string } | undefined;
  const stages = "replied,meeting";
  const recipients = (
    await kit.socket.ask("GET", `/data/numbers/updates/${month}/recipients?stages=${stages}`)
  ).body as {
    here: boolean;
    firms: { investor_id: string; firm: string; people: { email: string }[] }[];
  };
  if (update?.status === "draft")
    kit.check(
      "raise X5: this month's update is frozen (the numbers walk freezes it), so its recipients show",
      false,
      update.status,
    );
  else if (
    await open(
      page,
      kit,
      `/data/numbers/updates/${month}?stages=${stages}`,
      '[data-section="update-recipients"]',
    )
  ) {
    const rows = await page
      .locator("#table-recipients tbody tr")
      .evaluateAll((items) =>
        items.map((item) => [
          item.querySelector(".table-sub")?.textContent?.trim() ?? "",
          item.querySelector('a[href^="/data/investors/"]')?.getAttribute("href") ?? "",
          item.querySelector('a[href^="/data/investors/"]')?.textContent?.trim() ?? "",
        ]),
      );
    const wanted = recipients.firms.flatMap((firm) =>
      firm.people.map((person) => [person.email, `/data/investors/${firm.investor_id}`, firm.firm]),
    );
    const known = new Set(
      (
        ((await kit.socket.ask("GET", "/data/investors")).body.investors as
          { investor_id: string }[] | undefined) ?? []
      ).map((row) => row.investor_id),
    );
    kit.check(
      "raise X5: the update's recipients (Replied, Meeting booked) are the real firms' people, as the service gives them",
      recipients.here &&
        wanted.length > 0 &&
        JSON.stringify(rows) === JSON.stringify(wanted) &&
        recipients.firms.every((firm) => known.has(firm.investor_id)),
      { rows: rows.length, wanted: wanted.length, first: rows[0] },
    );
  }

  // ---------------------------------------------------------------- X6: the calendar feed
  type Item = { kind: string; title: string; on: string };
  let items = ((await kit.socket.ask("GET", "/data/calendar/items")).body.items ?? []) as Item[];
  if (!items.some((item) => item.kind === "file_review")) {
    const put = await kit.socket.ask("POST", "/data/_test/files/put", {
      folder_path: [FUNDRAISING],
      title: REVIEW_FILE,
      name: "walk-review-copy.txt",
      base64: Buffer.from("Invented: a copy to read again before the next meeting.").toString(
        "base64",
      ),
      by: WALKER,
    });
    const fileId = String((put.body.file as Body | undefined)?.file_id ?? "");
    await kit.socket.ask("POST", `/data/files/${fileId}/update`, {
      review_by: addDays(today, 7),
      by: WALKER,
    });
    items = ((await kit.socket.ask("GET", "/data/calendar/items")).body.items ?? []) as Item[];
  }
  const plainTitle = (item: Item) => !/[,;\\]/.test(item.title);
  const investorItem =
    items.find(
      (item) => item.kind === "investor" && plainTitle(item) && item.title.endsWith(` · ${FIRM}`),
    ) ?? items.find((item) => item.kind === "investor" && plainTitle(item));
  const actionItem = items.find(
    (item) => item.kind === "action" && item.title === `${NOTE.action} · ${FIRM}`,
  );
  const reviewItem = items.find((item) => item.kind === "file_review" && plainTitle(item));
  const link = await kit.socket.ask("POST", "/data/calendar/link", { by: WALKER });
  const token = String(link.body.token ?? "");
  const feed = await fetch(`${kit.base}/cal/${token}`, { redirect: "manual" });
  const ics = unfold(await feed.text());
  // "SUMMARY:<title>", or "SUMMARY:Overdue since <day>: <title>" for one already due.
  const inFeed = (item: Item | undefined) =>
    item !== undefined &&
    ics.split("\r\n").some((row) => row.startsWith("SUMMARY:") && row.endsWith(item.title));
  kit.check(
    "raise X6: the feed at /cal/<token>, read with no cookie, holds an investor next step, the note's action and a file review",
    feed.status === 200 &&
      (feed.headers.get("content-type") ?? "").startsWith("text/calendar") &&
      inFeed(investorItem) &&
      inFeed(actionItem) &&
      inFeed(reviewItem),
    {
      status: feed.status,
      investor: investorItem?.title,
      action: actionItem?.title,
      review: reviewItem?.title,
    },
  );
  await kit.socket.ask("POST", "/data/calendar/off", { by: WALKER });

  // ---------------------------------------------------------------- X7: /search?q=walk, every kind
  if (await open(page, kit, "/search?q=walk", ".search-results")) {
    const shown: string[] = [];
    for (const [kind, label] of SEARCH_KINDS) {
      const found = page.locator(`section[aria-labelledby='search-data-${kind}']`);
      if ((await found.count()) === 1 && flat(await found.locator("h2").innerText()) === label)
        shown.push(kind);
    }
    const sections = await page
      .locator("main section.rsection h2")
      .evaluateAll((titles) => titles.map((title) => title.id));
    kit.check(
      "raise X7: /search?q=walk shows every kind of Data's, each in its own section, Data's first",
      shown.length === SEARCH_KINDS.length &&
        JSON.stringify(sections.slice(0, SEARCH_KINDS.length)) ===
          JSON.stringify(SEARCH_KINDS.map(([kind]) => `search-data-${kind}`)),
      { shown, sections: sections.slice(0, 9) },
    );
  }

  // ---------------------------------------------------------------- X8: Home's owed row
  if (kit.pass.first) {
    await page.goto(`${kit.base}/home`, { waitUntil: "networkidle" });
    const owed = await page
      .locator(".owed__row", { hasText: NOTE.action })
      .locator(".owed__kind")
      .allInnerTexts();
    kit.check(
      "raise X8: Home shows an owed row “Action” for the note's action",
      // The kind is drawn in capitals; the words are "Action".
      owed.some((kind) => kind.trim().toLowerCase() === "action"),
      owed,
    );
  }
}
