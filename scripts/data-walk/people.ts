/**
 * The people ledger, walked against the stand-in (company spec §8.12): the empty sentence
 * (PL1); "Add a person" (PL2, pinned `walk-intern`); a signed internship letter whose copy the
 * ledger keeps itself, for the Owner only and never in Files (PL3, the lead's decision after
 * spec §8.4); a stipend payment (PL4); access and
 * offboarding with its Due row on Data and an owed row "People" on Home (PL5); the
 * certificate refused before a completed final evaluation and recorded after (PL6); the
 * revoke that ends the engagement (PL7); the Admin, who sees none of it anywhere (PL8); the
 * intern (PL9); and the stipends CSV (PL10). Every person is invented, on `.example`
 * addresses; the bank reference starts WALK-.
 */

import type { Page } from "playwright";

import { WALKER, type Shot, type WalkKit } from "./kit";

export const WALK_PERSON = "walk-intern";
const PERSON_PATH = `/data/people/${WALK_PERSON}`;
const OWNER_LINE = "The people ledger is for the Owner only.";
const NO_PEOPLE =
  "No one in the ledger yet. Add each intern, employee or contractor before their first day, with their signed letter.";

export const shots: Shot[] = [
  { name: "data-people", path: "/data/people", ready: "#table-people" },
  { name: "data-person", path: PERSON_PATH, ready: '[data-section="person-stipend"]' },
];

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const pad = (value: number) => String(value).padStart(2, "0");

function addDays(day: string, count: number): string {
  const [year = 0, month = 0, date = 0] = day.split("-").map(Number);
  const moved = new Date(Date.UTC(year, month - 1, date + count));
  return `${moved.getUTCFullYear()}-${pad(moved.getUTCMonth() + 1)}-${pad(moved.getUTCDate())}`;
}

/** "28 Nov 2026", as the pages print a calendar day. */
function dayWords(day: string): string {
  const [year = "", month = "", date = ""] = day.split("-");
  return `${Number(date)} ${MONTHS[Number(month) - 1] ?? ""} ${year}`;
}

const flat = (text: string) => text.replace(/\s+/g, " ").trim();

type Grant = { access_id: string; system: string; revoked_on: string | null };
type Person = {
  person_id: string;
  name: string;
  starts_on: string;
  ends_on: string | null;
  documents: {
    kind: string;
    copy: { copy_id: string; name: string } | null;
    signed_on: string | null;
  }[];
  payments: { period: string; reference: string; withdrawn: unknown }[];
  access: Grant[];
  offboarding: { last_day: string } | null;
  evaluations: { final: { outcome: string } };
  certificate: { number: string } | null;
};
type PersonPage = { person: Person; state: string; deadlines: { access_id: string; by: string }[] };
type Due = { key: string; kind: string; title: string };

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

async function personOf(kit: WalkKit): Promise<PersonPage | null> {
  const answer = await kit.socket.ask("GET", `/data/people/${WALK_PERSON}`);
  return answer.status === 200 ? (answer.body as unknown as PersonPage) : null;
}

async function ownerDue(kit: WalkKit): Promise<Due[]> {
  return ((await kit.socket.ask("GET", "/data/overview?owner=1")).body.due as Due[]) ?? [];
}

/** A copy's own route, for the Owner only. */
const copyPath = (copyId: string) => `${PERSON_PATH}/copies/${copyId}`;

/** An invented one-page PDF, made here. */
const LETTER = Buffer.from(
  "%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\n% An invented internship letter.\n%%EOF\n",
);

export async function walk(page: Page, kit: WalkKit): Promise<void> {
  if ((await kit.socket.ask("GET", "/data/people")).status !== 200) {
    kit.check("people: not loaded in this service", true);
    return;
  }
  const today = String((await kit.socket.ask("GET", "/data/_test/day")).body.day ?? "");
  const first = addDays(today, -30);
  const last = addDays(today, 59);

  // ---------------------------------------------------------------- PL1, PL2: empty, then the intern
  await page.goto(`${kit.base}/data/people`, { waitUntil: "networkidle" });
  if (kit.pass.first && !(await personOf(kit))) {
    const counts = (await kit.socket.ask("GET", "/data/people")).body.counts as { all: number };
    if (counts.all === 0)
      kit.check(
        "people PL1: with no one in the ledger, the page says how to begin",
        flat(await kit.text()).includes(NO_PEOPLE) &&
          (await page.locator("#table-people").count()) === 0,
      );
    await page.locator("summary", { hasText: "Add a person" }).click();
    await page.fill("#person-new-name", "Walk Intern");
    await page.fill("#person-new-email", "intern@walkintern.example");
    await page.selectOption("#person-new-kind", "intern");
    await page.fill("#person-new-role", "Research intern");
    await page.fill("#person-new-starts", first);
    await page.fill("#person-new-ends", last);
    await page.fill("#person-new-mentor", "Walk Mentor");
    await page.fill(
      "#person-new-brief",
      "Invented: build the sector screens, with a written handover.",
    );
    await page.fill("#person-new-stipend", "15000");
    await page.selectOption("#person-new-currency", "INR");
    await page.selectOption("#person-new-pays", "7");
    await page.locator("button", { hasText: "Add them" }).click();
    const said = await kit
      .says(`Added Walk Intern. The midpoint evaluation is due ${dayWords(addDays(first, 44))}.`)
      .then(() => true)
      .catch(() => false);
    let id = "";
    await until(page, async () => {
      const people = ((await kit.socket.ask("GET", "/data/people")).body.people as Person[]) ?? [];
      id = people.find((person) => person.name === "Walk Intern")?.person_id ?? "";
      return Boolean(id);
    });
    const pinned = await kit.socket.ask("POST", "/data/_test/people/pin", { id, by: WALKER });
    kit.check(
      "people PL2: Add a person says the midpoint evaluation's day, and the walk pins walk-intern",
      said && pinned.status === 200 && pinned.body.person_id === WALK_PERSON,
      pinned.body,
    );
  }
  if (!(await personOf(kit))) {
    kit.check("people: walk-intern is in the ledger", false);
    return;
  }
  await page.goto(`${kit.base}/data/people`, { waitUntil: "networkidle" });
  if (!(await shown(page, kit, "#table-people"))) return;
  const listRow = flat(await page.locator(`#person-${WALK_PERSON}`).innerText());
  kit.check(
    "people: the list shows Walk Intern with the dates, the mentor and what is next",
    listRow.includes("Walk Intern") &&
      listRow.includes(`${dayWords(first)} – ${dayWords(last)}`) &&
      listRow.includes("Walk Mentor"),
    listRow,
  );
  await kit.audit("people");

  const personPage = `${kit.base}${PERSON_PATH}`;
  const header = page.locator(".rhead");

  // ---------------------------------------------------------------- PL3: the signed letter
  if (kit.pass.first) {
    await page.goto(personPage, { waitUntil: "networkidle" });
    if (!(await shown(page, kit, '[data-section="person-documents"]'))) return;
    await header.locator("summary", { hasText: "Add a document" }).click();
    await page.selectOption("#document-new-kind", "internship");
    await page.fill("#document-new-signed", addDays(today, -32));
    await page.fill("#document-new-title", "Internship letter");
    await page.check("#document-new-ip");
    await page.check("#document-new-confidential");
    await page.setInputFiles("#document-new-file", {
      name: "walk-internship-letter.pdf",
      mimeType: "application/pdf",
      buffer: LETTER,
    });
    await page.locator("form button", { hasText: "Add the document" }).click();
    const added = await until(page, async () =>
      Boolean((await personOf(kit))?.person.documents.some((item) => item.copy)),
    );
    const copy = (await personOf(kit))?.person.documents.find((item) => item.copy)?.copy;
    const fetched = copy ? await page.request.get(`${kit.base}${copyPath(copy.copy_id)}`) : null;
    const bytes = fetched ? await fetched.body() : Buffer.alloc(0);
    const files =
      ((await kit.socket.ask("GET", "/data/files?view=recent")).body.files as
        { original_name: string }[] | undefined) ?? [];
    await page.goto(`${kit.base}/data/people`, { waitUntil: "networkidle" });
    const letterCell = flat(await page.locator(`#person-${WALK_PERSON}`).innerText());
    await page.goto(personPage, { waitUntil: "networkidle" });
    const link = copy ? await page.locator(`a[href="${copyPath(copy.copy_id)}"]`).count() : 0;
    kit.check(
      "people PL3: the letter reads Signed, the Owner downloads its copy from the person's page, and Files never had it",
      added &&
        letterCell.includes(`Signed ${Number(addDays(today, -32).slice(8))} `) &&
        link === 1 &&
        fetched?.status() === 200 &&
        bytes.equals(LETTER) &&
        !files.some((file) => file.original_name === "walk-internship-letter.pdf"),
      `${letterCell.slice(0, 120)} · ${fetched?.status()} · ${bytes.length} bytes`,
    );
  }

  // ---------------------------------------------------------------- PL4: a stipend payment
  const thisMonth = today.slice(0, 7);
  const lastMonth = addDays(`${thisMonth}-01`, -1).slice(0, 7);
  const period = lastMonth >= first.slice(0, 7) ? lastMonth : first.slice(0, 7);
  if (kit.pass.first) {
    await page.goto(personPage, { waitUntil: "networkidle" });
    if (!(await shown(page, kit, '[data-section="person-stipend"]'))) return;
    await header.locator("summary", { hasText: "Record a stipend payment" }).click();
    await page.fill("#payment-period", period);
    await page.fill("#payment-paid", today);
    await page.fill("#payment-amount", "15000");
    await page.fill("#payment-reference", "WALK-UTR-1");
    await page.locator("form button", { hasText: "Record the payment" }).click();
    await until(page, async () =>
      Boolean(
        (await personOf(kit))?.person.payments.some((item) => item.reference === "WALK-UTR-1"),
      ),
    );
  }
  await page.goto(personPage, { waitUntil: "networkidle" });
  if (!(await shown(page, kit, '[data-section="person-stipend"]'))) return;
  const stipend = flat(await page.locator('[data-section="person-stipend"]').innerText());
  kit.check(
    "people PL4: the month paid reads Paid with its reference, and the section says Tax: CA to confirm",
    stipend.includes("Tax: CA to confirm") &&
      flat(await page.locator(`tr[data-period="${period}"]`).first().innerText()).includes(
        "Paid",
      ) &&
      stipend.includes("WALK-UTR-1") &&
      stipend.includes("₹15,000 a month, paid by the 7th of the next month"),
    stipend.slice(0, 200),
  );

  // ---------------------------------------------------------------- PL5: access and offboarding
  if (kit.pass.first) {
    await header.locator("summary", { hasText: "Grant access" }).click();
    await page.fill("#access-new-system", "Code host");
    await page.check("#access-new-critical");
    await page.locator("form button", { hasText: "Record the access" }).click();
    await until(page, async () => ((await personOf(kit))?.person.access.length ?? 0) > 0);
    await page.goto(personPage, { waitUntil: "networkidle" });
    await header.locator("summary", { hasText: "Start offboarding" }).click();
    await page.fill("#offboard-last-day", today);
    await page.locator("form button", { hasText: "Start offboarding" }).click();
    await until(page, async () => Boolean((await personOf(kit))?.person.offboarding));
    await page.goto(personPage, { waitUntil: "networkidle" });
    const grant = (await personOf(kit))?.person.access[0];
    const chip = grant ? flat(await page.locator(`#access-${grant.access_id}`).innerText()) : "";
    const offboarding = flat(await page.locator('[data-section="person-offboarding"]').innerText());
    kit.check(
      "people PL5: once offboarding starts, the critical grant shows its deadline, tomorrow",
      chip.includes(dayWords(addDays(today, 1))) &&
        offboarding.includes(`Last day ${dayWords(today)}`) &&
        offboarding.includes("1 still to revoke"),
      `${chip} · ${offboarding.slice(0, 120)}`,
    );
    await page.goto(`${kit.base}/data`, { waitUntil: "networkidle" });
    if (!(await shown(page, kit, ".hqdata-due"))) return;
    const dueRow = await page
      .locator(".hqdata-due__row", { hasText: "Revoke Code host for Walk Intern" })
      .allInnerTexts();
    kit.check(
      "people PL5: Data's Due, as the Owner, has Revoke Code host for Walk Intern, of the kind People",
      dueRow.length === 1 && /people/i.test(dueRow[0] ?? ""),
      dueRow,
    );
    await page.goto(`${kit.base}/home`, { waitUntil: "networkidle" });
    const owed = await page.locator(".owed__kind").allInnerTexts();
    kit.check(
      "people PL5: Home has an owed row People",
      owed.some((kind) => kind.trim().toLowerCase() === "people"),
      owed,
    );

    // ---------------------------------------------------------------- PL8: the Admin sees none of it
    await asAdmin(page, kit);
  }

  // ---------------------------------------------------------------- PL6: the certificate follows the final
  if (kit.pass.first) {
    const early = await kit.socket.ask("POST", `/data/people/${WALK_PERSON}/certificate`, {
      number: "WALK-CERT-1",
      issued_on: today,
      by: WALKER,
    });
    await page.goto(personPage, { waitUntil: "networkidle" });
    const hidden =
      (await header.locator("summary", { hasText: "Record the certificate" }).count()) === 0;
    kit.check(
      "people PL6: before a completed final evaluation the certificate is refused with its sentence, and not offered",
      early.status === 409 &&
        String((early.body.error as { message?: string } | undefined)?.message) ===
          "Record the final evaluation as completed first: the certificate follows it." &&
        hidden,
      early.body,
    );
    await header.locator("summary", { hasText: "Record an evaluation" }).click();
    await page.selectOption("#evaluation-new-which", "final");
    await page.selectOption("#evaluation-new-outcome", "completed");
    await page.fill("#evaluation-new-held", today);
    await page.fill("#evaluation-new-summary", "Invented: shipped the screens and the handover.");
    await page.locator("form button", { hasText: "Record it" }).click();
    await until(
      page,
      async () => (await personOf(kit))?.person.evaluations.final.outcome === "completed",
    );
    await page.goto(personPage, { waitUntil: "networkidle" });
    await header.locator("summary", { hasText: "Record the certificate" }).click();
    await page.fill("#certificate-number", "WALK-CERT-1");
    await page.fill("#certificate-issued", today);
    await page.locator("form button", { hasText: "Record the certificate" }).click();
    const recorded = await until(page, async () =>
      Boolean((await personOf(kit))?.person.certificate),
    );
    kit.check(
      "people PL6: after the final evaluation, completed, the certificate is recorded",
      recorded,
    );
  }

  // ---------------------------------------------------------------- PL7: revoke, and it ends
  if (kit.pass.first) {
    await page.goto(personPage, { waitUntil: "networkidle" });
    await page.locator('button[aria-label="Revoke Code host today"]').click();
    await until(page, async () => (await personOf(kit))?.state === "ended");
    const due = await ownerDue(kit);
    kit.check(
      "people PL7: Revoke takes the row off Due",
      !due.some((row) => row.title === "Revoke Code host for Walk Intern"),
      due.map((row) => row.title),
    );
  }
  await page.goto(personPage, { waitUntil: "networkidle" });
  if (!(await shown(page, kit, '[data-section="person-stipend"]'))) return;
  const status = flat(await header.locator(".rhead__status").innerText());
  const ended = flat(await page.locator('[data-section="person-offboarding"]').innerText());
  const certificate = flat(await page.locator('[data-section="person-certificate"]').innerText());
  kit.check(
    "people PL7: the state reads Ended, every system is revoked, and the certificate is issued",
    status.includes("Ended") &&
      ended.includes(`Every system is revoked or was never held. Ended on ${dayWords(today)}.`) &&
      certificate.includes("Issued WALK-CERT-1 on"),
    `${status} · ${ended.slice(0, 80)}`,
  );
  await kit.audit("person");

  // ---------------------------------------------------------------- PL9, PL10
  if (kit.pass.first) {
    await asIntern(page, kit);
    const csv = await page.request.get(`${kit.base}/data/people/stipends`);
    const bytes = await csv.body();
    const text = bytes.toString("utf8");
    kit.check(
      "people PL10: Download the stipends (CSV) has the mark, the header and CA to confirm",
      csv.status() === 200 &&
        bytes[0] === 0xef &&
        bytes[1] === 0xbb &&
        bytes[2] === 0xbf &&
        text.includes(
          "person,kind,period,due_on,amount,currency,paid_on,reference,tds_deducted,tax_treatment,withdrawn",
        ) &&
        text.includes(`Walk Intern,Intern,${period},`) &&
        text.includes("WALK-UTR-1,,CA to confirm"),
      text.slice(0, 200),
    );
  }
}

/** PL8: a new browser context signed in as the Admin. */
async function asAdmin(page: Page, kit: WalkKit): Promise<void> {
  const browser = page.context().browser();
  if (!browser) {
    kit.check("people PL8: a browser for the Admin", false);
    return;
  }
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const admin = await context.newPage();
  try {
    await admin.goto(`${kit.base}/dev/signin?as=admin%40hq.test&next=%2Fdata%2Fpeople`, {
      waitUntil: "networkidle",
    });
    const said: string[] = [];
    for (const path of ["/data/people", PERSON_PATH]) {
      await admin.goto(`${kit.base}${path}`, { waitUntil: "networkidle" });
      const body = await admin.locator("main").first().innerText();
      if (!body.includes(OWNER_LINE) || body.includes("Walk Intern") || body.includes("15,000"))
        said.push(`${path}: ${flat(body).slice(0, 100)}`);
    }
    const rail = await admin.locator('#shell-sidebar a[href="/data/people"]').count();
    await admin.goto(`${kit.base}/data`, { waitUntil: "networkidle" });
    const kinds = (await admin.locator(".hqdata-due__kind").allInnerTexts()).map((kind) =>
      kind.trim().toLowerCase(),
    );
    const data = await admin.locator("main").first().innerText();
    await admin.goto(`${kit.base}/home`, { waitUntil: "networkidle" });
    const owed = (await admin.locator(".owed__kind").allInnerTexts()).map((kind) =>
      kind.trim().toLowerCase(),
    );
    const home = await admin.locator("main").first().innerText();
    const csv = await admin.request.get(`${kit.base}/data/people/stipends`);
    const copyId = (await personOf(kit))?.person.documents.find((item) => item.copy)?.copy?.copy_id;
    const copy = copyId ? await admin.request.get(`${kit.base}${copyPath(copyId)}`) : null;
    const copyText = copy ? await copy.text() : "";
    kit.check(
      "people PL8: the Admin gets the owner line on People, the person and the letter's copy, no rail link, no People row on Data or Home, no name, and 403 for the CSV",
      said.length === 0 &&
        rail === 0 &&
        !kinds.includes("people") &&
        !owed.includes("people") &&
        !data.includes("Walk Intern") &&
        !home.includes("Walk Intern") &&
        csv.status() === 403 &&
        copy?.status() === 403 &&
        copyText === OWNER_LINE,
      {
        copy: copy?.status(),
        csv: csv.status(),
        name_on_data: data.includes("Walk Intern"),
        name_on_home: home.includes("Walk Intern"),
        said,
        rail,
        people_rows: kinds.filter((kind) => kind === "people").length,
        people_owed: owed.filter((kind) => kind === "people").length,
      },
    );
  } finally {
    await context.close();
  }
}

/** PL9: the intern is told Data is not for them, with no address on the page. */
async function asIntern(page: Page, kit: WalkKit): Promise<void> {
  const browser = page.context().browser();
  if (!browser) {
    kit.check("people PL9: a browser for the intern", false);
    return;
  }
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const intern = await context.newPage();
  try {
    await intern.goto(`${kit.base}/dev/signin?as=intern%40hq.test&next=%2Fdata%2Fpeople`, {
      waitUntil: "networkidle",
    });
    await intern.goto(`${kit.base}/data/people`, { waitUntil: "networkidle" });
    const body = await intern.locator("main").first().innerText();
    kit.check(
      "people PL9: as the intern, /data/people says Data is for Owners and Admins., with no address",
      body.includes("Data is for Owners and Admins.") && !body.includes("@"),
      flat(body).slice(0, 120),
    );
  } finally {
    await context.close();
  }
}
