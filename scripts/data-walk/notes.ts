/**
 * Notes, the Investor FAQ and decisions, walked against the stand-in (raise spec §6.9):
 * a note added from a waitlist firm's Notes section, its action on Data's Due and Home's
 * queue (N3); an objection answered by adding it to the FAQ (N4); "Record as decision" and
 * a later decision replacing it (N5); "Done" on its action (N6); the firm page without its
 * old note forms (N7); taking the note back (N8); the pages as the intern (N9); and the
 * rail (N10). The investor side is the seeded `walk-note` on Walk Fund 281 (the investor
 * page is U1's; the lead checks the section there after the merge).
 *
 * No seeded or walked note, objection, FAQ entry or decision says "%", "target" or "goal":
 * U1's I4 reads Walk Fund 281's page, where the Notes section shows them after the merge.
 * Every firm and person is invented.
 */

import { request } from "node:http";

import type { Page } from "playwright";

import { WALKER, type Shot, type WalkKit } from "./kit";

export const WALK_NOTE = "walk-note";

export const shots: Shot[] = [
  { name: "data-notes", path: "/data/notes", ready: "#table-notes" },
  { name: "data-notes-actions", path: "/data/notes?view=actions", ready: "#table-actions" },
  { name: "data-notes-faq", path: "/data/notes?view=faq", ready: "#table-investor-faq" },
  { name: "data-note", path: `/data/notes/${WALK_NOTE}`, ready: '[data-section="note-body"]' },
  { name: "data-decisions", path: "/data/decisions", ready: "#table-decisions" },
];

type Answer = { status: number; body: Record<string, unknown> };

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
          let parsed: Record<string, unknown> = {};
          try {
            parsed = JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>;
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

/** One question already answered and one decision already written, so every page has rows. */
const SEEDED_QUESTION = {
  question: "Who owns the trade data the product shows?",
  answer: "Invented: the exchanges license it to us; the customer owns what they upload.",
};
const SEEDED_DECISION = {
  title: "Keep every investor note on this computer",
  why: "Invented: nothing about a firm leaves the Mac until the HQ service is live.",
  decided_by: "Walk Owner",
  decided_on: "",
  status: "decided",
};

/** The pinned `walk-note` (the investors seed has run, so fund281.example is a firm). */
export async function seed(socketPath: string): Promise<void> {
  const made = await ask(socketPath, "POST", "/data/_test/notes/seed", { by: WALKER });
  if (made.status !== 200) {
    console.log(`[walk] notes: the module is not loaded here (${made.status})`);
    return;
  }
  const faq = (await ask(socketPath, "GET", "/data/faq")).body.entries as
    { question: string }[] | undefined;
  if (!faq?.some((entry) => entry.question === SEEDED_QUESTION.question))
    await ask(socketPath, "POST", "/data/faq", { ...SEEDED_QUESTION, by: WALKER });
  const decisions = (await ask(socketPath, "GET", "/data/decisions")).body.decisions as
    { title: string }[] | undefined;
  if (!decisions?.some((decision) => decision.title === SEEDED_DECISION.title))
    await ask(socketPath, "POST", "/data/decisions", { ...SEEDED_DECISION, by: WALKER });
}

const flat = (text: string) => text.replace(/\s+/g, " ").trim();

/**
 * Wait for a page's own element. A page that is not there yet is loaded once more (and the
 * walk says so); still missing, it is a failed check with what the page said instead.
 */
async function shown(page: Page, kit: WalkKit, selector: string): Promise<boolean> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const found = await page
      .waitForSelector(selector, { timeout: 30_000 })
      .then(() => true)
      .catch(() => false);
    if (found) return true;
    console.log(`[walk] ${selector} was not there: ${flat(await kit.text()).slice(0, 160)}`);
    if (attempt === 0) await page.reload({ waitUntil: "networkidle" });
  }
  kit.check(`${selector} is on the page`, false, flat(await kit.text()).slice(0, 200));
  return false;
}

async function until(page: Page, test: () => Promise<boolean>): Promise<boolean> {
  for (let tries = 0; tries < 100; tries += 1) {
    if (await test()) return true;
    await page.waitForTimeout(100);
  }
  return false;
}

/** The note this walk writes on a waitlist firm, with what it says. */
const NOTE = {
  title: "First call",
  body: "Invented: a first call with the head of research. They asked why the pilot needs their trade data and how long it runs.",
  people: "Walk Partner, head of research",
  objections: ["Why does the pilot need our trade data?", "How long is the pilot?"],
  action: "Send the pilot plan",
  decision: "Offer the waitlist firm a four-week pilot",
  replacing: "Offer the waitlist firm a six-week pilot",
  answer:
    "Invented: only to show their own trades beside the market; nothing leaves their account.",
};

type NoteRow = {
  note_id: string;
  subject: { kind: string; id: string };
  title: string;
  people: string;
  subject_name: string;
  withdrawn: unknown;
  objections: { objection_id: string; text: string; faq_id: string | null }[];
  actions: { action_id: string; title: string; state: string }[];
};

async function notesOf(kit: WalkKit, query: string): Promise<NoteRow[]> {
  return ((await kit.socket.ask("GET", `/data/notes${query}`)).body.notes as NoteRow[]) ?? [];
}

async function dueTitles(kit: WalkKit): Promise<{ kind: string; title: string }[]> {
  return (
    ((await kit.socket.ask("GET", "/data/overview")).body.due as {
      kind: string;
      title: string;
    }[]) ?? []
  );
}

type FaqRow = { faq_id: string; question: string; asked: number; firms: number };
type Decision = {
  decision_id: string;
  title: string;
  status: string;
  superseded_by: string | null;
};

async function decisionsOf(kit: WalkKit): Promise<Decision[]> {
  return ((await kit.socket.ask("GET", "/data/decisions")).body.decisions as Decision[]) ?? [];
}

export async function walk(page: Page, kit: WalkKit): Promise<void> {
  if ((await kit.socket.ask("GET", "/data/notes")).status !== 200) {
    kit.check("notes: not loaded in this service", true);
    return;
  }
  const today = String((await kit.socket.ask("GET", "/data/_test/day")).body.day ?? "");

  // ---------------------------------------------------------------- N10: the rail
  const rail = await page
    .locator("#shell-sidebar a")
    .evaluateAll((links) => links.map((link) => link.getAttribute("href") ?? ""))
    .catch(() => [] as string[]);
  const at = (href: string) => rail.indexOf(href);
  kit.check(
    "notes N10: the rail shows Notes, Contacts and Decisions between Investors and Key dates",
    at("/data/investors") >= 0 &&
      at("/data/notes") === at("/data/investors") + 1 &&
      at("/data/contacts") === at("/data/notes") + 1 &&
      at("/data/decisions") === at("/data/contacts") + 1 &&
      at("/data/dates") === at("/data/decisions") + 1,
    rail.filter((href) => href.startsWith("/data")).join(" "),
  );

  // ---------------------------------------------------------------- the investor side: walk-note
  await page.goto(`${kit.base}/data/notes`, { waitUntil: "networkidle" });
  if (!(await shown(page, kit, "#table-notes"))) return;
  let text = flat(await page.locator("#table-notes").innerText());
  kit.check(
    "notes N3: /data/notes lists the seeded walk-note with its firm Walk Fund 281",
    text.includes("Walk first call") && text.includes("Walk Fund 281") && text.includes("Investor"),
    text.slice(0, 200),
  );
  await kit.audit("notes");

  await page.goto(`${kit.base}/data/notes/${WALK_NOTE}`, { waitUntil: "networkidle" });
  if (!(await shown(page, kit, '[data-section="note-body"]'))) return;
  text = flat(await kit.text());
  kit.check(
    "notes: the walk-note's page has what was said, its objection, its action and its Activity",
    text.includes("Walk first call") &&
      text.includes("What was said") &&
      text.includes("Why India first?") &&
      text.includes("Send the pilot summary") &&
      (await page.locator('[data-section="note-activity"]').count()) === 1,
    text.slice(0, 200),
  );
  await kit.audit("note");

  // ---------------------------------------------------------------- N3: a note on a waitlist firm
  // Found by what it says, so a later pass finds it even if the waitlist's order moved.
  const findMine = async () =>
    (await notesOf(kit, "?subject_kind=waitlist&withdrawn=1")).find(
      (note) => note.title === NOTE.title && note.people === NOTE.people,
    );
  const section = page.locator('[data-section="waitlist-notes"]');
  if (kit.pass.first && !(await findMine())) {
    const entries =
      ((await kit.socket.ask("GET", "/data/waitlist")).body.entries as
        { entry_id: string }[] | undefined) ?? [];
    const first = entries[0];
    if (!first) {
      kit.check("notes N3: a waitlist firm to write on", false, entries.length);
      return;
    }
    await page.goto(`${kit.base}/data/waitlist/${first.entry_id}`, { waitUntil: "networkidle" });
    if (!(await shown(page, kit, '[data-section="waitlist-notes"]'))) return;
    await section.locator("summary", { hasText: "Add a note" }).click();
    await page.selectOption("#waitlist-notes-new-kind", "call");
    await page.fill("#waitlist-notes-new-held", today);
    await page.fill("#waitlist-notes-new-title", NOTE.title);
    await page.fill("#waitlist-notes-new-body", NOTE.body);
    await page.fill("#waitlist-notes-new-people", NOTE.people);
    await page.fill("#waitlist-notes-new-objections", NOTE.objections.join("\n"));
    await page.fill("#waitlist-notes-new-action-0", NOTE.action);
    await page.fill("#waitlist-notes-new-action-0-due", today);
    await page.fill("#waitlist-notes-new-action-0-who", "Walk Owner");
    await section.locator("button", { hasText: "Add the note" }).click();
    const said = await kit
      .says("Added the note. 1 action is on Due on its day.")
      .then(() => true)
      .catch(() => false);
    const made = await until(page, async () => Boolean(await findMine()));
    kit.check("notes N3: Add a note on a waitlist firm says it was added", said && made);
  }
  const mine = await findMine();
  if (!mine) {
    kit.check("notes N3: the waitlist firm's note is there", false);
    return;
  }
  const firm = { entry_id: mine.subject.id, firm: mine.subject_name };
  const firmPage = `${kit.base}/data/waitlist/${firm.entry_id}`;
  const onFirm = `?subject_kind=waitlist&subject_id=${firm.entry_id}`;

  await page.goto(firmPage, { waitUntil: "networkidle" });
  if (!(await shown(page, kit, '[data-section="waitlist-notes"]'))) return;
  const sectionText = flat(await section.innerText());
  if (kit.pass.first)
    kit.check(
      "notes N3: the firm's Notes section lists the note with its counts",
      sectionText.includes(NOTE.title) &&
        sectionText.includes("2 objections") &&
        sectionText.includes("1 open action"),
      sectionText.slice(0, 200),
    );

  // ---------------------------------------------------------------- N7: the old note forms are gone
  const header = page.locator(".rhead");
  kit.check(
    "notes N7: the waitlist firm's page has no old Add a note or call forms, and says where older notes are",
    (await header.locator("summary", { hasText: "Add a note" }).count()) === 0 &&
      (await page.locator("summary", { hasText: "Add a note" }).count()) === 1 &&
      (await page.locator("summary", { hasText: /Log a call|Add a call/ }).count()) === 0 &&
      (await page.locator("#note-composer").count()) === 0 &&
      sectionText.includes("Notes written before this section are in Activity below."),
    sectionText.slice(0, 120),
  );
  await kit.audit("waitlist-notes");

  if (kit.pass.first) {
    // Data's Due has an Action row for it, and Home's queue an owed row "Action".
    await page.goto(`${kit.base}/data`, { waitUntil: "networkidle" });
    if (!(await shown(page, kit, ".hqdata-due"))) return;
    const row = await page.locator(".hqdata-due__row", { hasText: NOTE.action }).allInnerTexts();
    kit.check(
      "notes N3: Data's Due has an Action row for the note's action, naming the firm",
      row.length === 1 && /action/i.test(row[0] ?? "") && (row[0] ?? "").includes(firm.firm),
      row,
    );
    await page.goto(`${kit.base}/home`, { waitUntil: "networkidle" });
    const owed = await page
      .locator(".owed__row", { hasText: NOTE.action })
      .locator(".owed__kind")
      .allInnerTexts();
    kit.check(
      "notes N3: Home shows an owed row “Action” for it",
      // The kind is drawn in capitals; the words are "Action".
      owed.some((kind) => kind.trim().toLowerCase() === "action"),
      owed,
    );
  }

  // ---------------------------------------------------------------- N4: answer an objection from the FAQ
  const notePage = `${kit.base}/data/notes/${mine.note_id}`;
  if (kit.pass.first) {
    await page.goto(notePage, { waitUntil: "networkidle" });
    if (!(await shown(page, kit, '[data-section="note-body"]'))) return;
    const first = page.locator(".hqdata-objection").first();
    await first.locator("summary", { hasText: "Answer from the FAQ" }).click();
    await first.locator('textarea[name="answer"]').fill(NOTE.answer);
    await first.locator("button", { hasText: "Add to the FAQ" }).click();
    const linked = await until(page, async () => {
      const note = (await notesOf(kit, onFirm)).find((item) => item.note_id === mine.note_id);
      return Boolean(note?.objections[0]?.faq_id);
    });
    await page.goto(`${kit.base}/data/notes?view=faq`, { waitUntil: "networkidle" });
    if (!(await shown(page, kit, "#table-investor-faq"))) return;
    const row = flat(
      await page
        .locator("#table-investor-faq tr", { hasText: NOTE.objections[0]! })
        .first()
        .innerText(),
    );
    kit.check(
      "notes N4: Add to the FAQ from the note's page; the FAQ view says Asked 1 time by 1 firm",
      linked && row.includes("1 time by 1 firm"),
      row,
    );
  }
  await page.goto(`${kit.base}/data/notes?view=faq`, { waitUntil: "networkidle" });
  if (!(await shown(page, kit, "#table-investor-faq"))) return;
  await kit.audit("notes-faq");

  // ---------------------------------------------------------------- N5: record as decision, then replace it
  if (kit.pass.first) {
    await page.goto(notePage, { waitUntil: "networkidle" });
    await page.locator(".rhead summary", { hasText: "Record as decision" }).click();
    await page.fill("#note-decision-title", NOTE.decision);
    await page.selectOption("#note-decision-status", "decided");
    await page.locator("button", { hasText: "Record the decision" }).click();
    const recorded = await until(page, async () =>
      (await decisionsOf(kit)).some((item) => item.title === NOTE.decision),
    );
    await page.goto(`${kit.base}/data/decisions`, { waitUntil: "networkidle" });
    if (!(await shown(page, kit, "#table-decisions"))) return;
    const first = (await decisionsOf(kit)).find((item) => item.title === NOTE.decision);
    const fromRow = first
      ? flat(await page.locator(`#decision-${first.decision_id}`).innerText())
      : "";
    kit.check(
      "notes N5: Record as decision lists it on Decisions, its From naming the note",
      recorded && fromRow.includes(NOTE.title) && fromRow.includes(firm.firm),
      fromRow,
    );

    await page.locator("summary", { hasText: "Record a decision" }).click();
    await page.fill("#decision-new-title", NOTE.replacing);
    await page.fill("#decision-new-why", "Invented: their research cycle runs six weeks.");
    await page.selectOption("#decision-new-status", "decided");
    if (first) await page.selectOption("#decision-new-replaces", first.decision_id);
    await page.locator("button", { hasText: "Record the decision" }).click();
    const replaced = await until(page, async () =>
      (await decisionsOf(kit)).some(
        (item) => item.title === NOTE.decision && item.status === "superseded",
      ),
    );
    await page.goto(`${kit.base}/data/decisions`, { waitUntil: "networkidle" });
    if (!(await shown(page, kit, "#table-decisions"))) return;
    const oldRow = first
      ? flat(await page.locator(`#decision-${first.decision_id}`).innerText())
      : "";
    kit.check(
      "notes N5: a later decision that replaces it marks it Superseded, Replaced by the later one",
      replaced && oldRow.includes("Superseded") && oldRow.includes(NOTE.replacing),
      oldRow,
    );
  }
  await page.goto(`${kit.base}/data/decisions`, { waitUntil: "networkidle" });
  if (!(await shown(page, kit, "#table-decisions"))) return;
  await kit.audit("decisions");

  // ---------------------------------------------------------------- N6: Done on the action
  await page.goto(`${kit.base}/data/notes?view=actions`, { waitUntil: "networkidle" });
  if (!(await shown(page, kit, "#table-actions"))) return;
  if (kit.pass.first) {
    const before = (await kit.socket.ask("GET", "/data/note-actions")).body.counts as {
      open: number;
    };
    const openTab = async () =>
      flat(
        (await page
          .locator('nav[aria-label="Which actions"] a', { hasText: /^Open/ })
          .innerText()) ?? "",
      );
    const tabBefore = await openTab();
    await page.locator(`button[aria-label="Done: ${NOTE.action}"]`).click();
    const done = await until(page, async () => {
      const counts = (await kit.socket.ask("GET", "/data/note-actions")).body.counts as {
        open: number;
      };
      return counts.open === before.open - 1;
    });
    await page.goto(`${kit.base}/data/notes?view=actions`, { waitUntil: "networkidle" });
    const tabAfter = await openTab();
    const due = await dueTitles(kit);
    kit.check(
      "notes N6: Done takes the action off Due, and the Open count drops by one",
      done &&
        tabBefore === `Open ${before.open}` &&
        tabAfter === `Open ${before.open - 1}` &&
        !due.some((item) => item.kind === "action" && item.title === NOTE.action),
      `${tabBefore} → ${tabAfter}`,
    );
  }
  if (!(await shown(page, kit, "#table-actions"))) return;
  await kit.audit("notes-actions");

  // ---------------------------------------------------------------- N8: take the note back
  if (kit.pass.first) {
    await page.goto(notePage, { waitUntil: "networkidle" });
    await page.locator(".rhead summary", { hasText: "Take back" }).click();
    await page.locator("button", { hasText: "Take it back" }).click();
    const taken = await until(page, async () =>
      (await notesOf(kit, `${onFirm}&withdrawn=1`)).some(
        (note) => note.note_id === mine.note_id && note.withdrawn !== null,
      ),
    );
    kit.check("notes N8: Take back takes it back", taken);
  }
  await page.goto(`${kit.base}/data/notes`, { waitUntil: "networkidle" });
  if (!(await shown(page, kit, "#table-notes"))) return;
  const live = (await page.locator(`#note-${mine.note_id}`).count()) === 0;
  await page.goto(`${kit.base}/data/notes?withdrawn=1`, { waitUntil: "networkidle" });
  if (!(await shown(page, kit, "#table-notes"))) return;
  const muted = page.locator(`#note-${mine.note_id}`);
  const mutedText = (await muted.count()) ? flat(await muted.innerText()) : "";
  const faq =
    ((await kit.socket.ask("GET", "/data/faq")).body.entries as FaqRow[] | undefined) ?? [];
  const question = faq.find((entry) => entry.question === NOTE.objections[0]);
  kit.check(
    "notes N8: a taken-back note shows, muted, only under Show taken-back notes, and its objections no longer count",
    live &&
      mutedText.includes("Taken back") &&
      ((await muted.getAttribute("class")) ?? "").includes("hqdata-notes__row--withdrawn") &&
      question?.asked === 0,
    `${mutedText.slice(0, 120)} · asked ${question?.asked}`,
  );
  if (kit.pass.first) await kit.audit("notes-taken-back");

  // ---------------------------------------------------------------- N9: as the intern
  if (kit.pass.first) {
    const browser = page.context().browser();
    if (!browser) kit.check("notes N9: a browser for the intern", false);
    else {
      const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      const intern = await context.newPage();
      try {
        await intern.goto(`${kit.base}/dev/signin?as=intern%40hq.test&next=%2Fdata%2Fnotes`, {
          waitUntil: "networkidle",
        });
        const said: string[] = [];
        for (const path of ["/data/notes", "/data/contacts", "/data/decisions"]) {
          await intern.goto(`${kit.base}${path}`, { waitUntil: "networkidle" });
          const body = await intern.locator("main").first().innerText();
          if (!body.includes("Data is for Owners and Admins.") || body.includes("@"))
            said.push(`${path}: ${flat(body).slice(0, 80)}`);
        }
        kit.check(
          "notes N9: as the intern, Notes, Contacts and Decisions say Data is for Owners and Admins., with no address",
          said.length === 0,
          said,
        );
      } finally {
        await context.close();
      }
    }
  }
}
