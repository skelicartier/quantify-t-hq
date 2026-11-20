/**
 * The security batch's seams in the browser, with every module loaded (ws-notes/security/spec.md
 * §3.6, §11 step 4). Each unit walked its pages against stand-ins; this walk checks the halves
 * meet: Assurance › Summary with a line from each of the nine modules in its area and none "not
 * loaded" (S1); the Owner on Accounts, Devices and two people's pages, seeing who in the people
 * ledger holds each account and device, and the walk's Admin on the same pages seeing the
 * left-out line, the holders as typed and never a ledger name (S2); a customer's duty moving a
 * finding's day: the walk's high dependency alert reads 7 days with Walk Capital 2000's contract
 * in force, 30 days once the duty is marked not in the contract, and 7 again when it is put back,
 * its Due row moving with it (S3); a questionnaire's XLSX downloaded from its page, imported
 * again, and every answer back in its cell (S4); and the outbox unchanged (S5).
 *
 * The walks run in the order of their names, so this one runs after devices, findings, people,
 * profiles and questionnaires and before tools, which make what it reads in their first pass
 * (the devices walk links its laptop to Walk Intern One in the second). So it starts on the
 * second pass (desktop, light). It adds no person to the people ledger. What it changes it does
 * once, on that pass, and puts back: the duty is marked in the contract again, and the
 * questionnaire imported from the export is closed. Every firm, person and answer is invented.
 */

import { readFileSync } from "node:fs";

import type { Browser, Page } from "playwright";

import { WALK_PROFILE_DUTY, WALK_PROFILE_ENTRY } from "../data/profiles/walk-seed";
import { readXlsx } from "../data/questionnaires/xlsx-read";
import { OWNER_LEFT_OUT } from "../../src/lib/data/labels-controls";
import { SHORT_WORDS, type ShortKey } from "../../src/lib/data/labels-questionnaires";
import { WALKER, type WalkKit } from "./kit";
import { WALK_QUESTIONNAIRE_ID } from "./questionnaires";

type Body = Record<string, unknown>;

/** The nine modules, each with a page that answers when it is loaded. */
const MODULES = [
  ["tools", "/data/tools"],
  ["devices", "/data/devices"],
  ["logs", "/data/logs"],
  ["recovery", "/data/recovery"],
  ["policies", "/data/policies"],
  ["findings", "/data/findings"],
  ["assurance", "/data/assurance"],
  ["questionnaires", "/data/questionnaires"],
  ["profiles", "/data/profiles"],
] as const;
const NOT_LOADED = "is not loaded here.";
const PEOPLE_OWNER_LINE = "The people ledger is for the Owner only.";
/** The ledger's two walk people: Walk Intern One (people walk), Walk Intern Two (tools walk). */
const ONE = "Walk Intern One";
const TWO = "Walk Intern Two";
const DEVICE = "walk-device";
const TYPED_HOLDER = "Research intern";
const TWO_ACCOUNT = "walk.intern@walk.example";
/** The findings walk's high dependency alert, found the day the seed ran. */
const HIGH_ALERT = "walk-parser: Walk parser reads past the end of a buffer";
const QUESTIONNAIRES = "/data/waitlist/diligence/questionnaires";
const ROUND_TRIP_TITLE = "Walk merged round trip";

const flat = (text: string) => text.replace(/\s+/g, " ").trim();
const pad = (value: number) => String(value).padStart(2, "0");
function addDays(day: string, count: number): string {
  const [year = 0, month = 1, date = 1] = day.split("-").map(Number);
  const moved = new Date(Date.UTC(year, month - 1, date + count));
  return `${moved.getUTCFullYear()}-${pad(moved.getUTCMonth() + 1)}-${pad(moved.getUTCDate())}`;
}
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const words = (day: string) => {
  const [year, month, date] = day.split("-");
  return `${Number(date)} ${MONTHS[Number(month) - 1]} ${year}`;
};

async function until(page: Page, test: () => Promise<boolean>, tries = 150): Promise<boolean> {
  for (let attempt = 0; attempt < tries; attempt += 1) {
    if (await test()) return true;
    await page.waitForTimeout(100);
  }
  return false;
}

/** A page of this walk, with more time than Playwright's 30 s under a heavy load. */
async function visit(page: Page, url: string, ready: string): Promise<boolean> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    await page.goto(url, { waitUntil: "networkidle", timeout: 90_000 });
    const found = await page
      .waitForSelector(ready, { timeout: 30_000 })
      .then(() => true)
      .catch(() => false);
    if (found) return true;
  }
  return false;
}

/** A table's text with `textContent`: its heads are set in capitals by the style sheet. */
async function tableText(page: Page, selector: string): Promise<string> {
  return flat((await page.locator(selector).first().textContent()) ?? "");
}

type Profile = {
  profile_id: string;
  firm: string;
  applies_from: string | null;
  duties: { duty_id: string; key: string | null; state: string }[];
};
type QuestionRow = {
  row: number;
  qid: string;
  answer: { short: ShortKey; text: string } | null;
};

export async function walk(page: Page, kit: WalkKit): Promise<void> {
  if (kit.pass.first) {
    console.log("  · security-merged: waits for the other walks' first pass");
    return;
  }
  const loaded = await Promise.all(
    MODULES.map(async ([, path]) => (await kit.socket.ask("GET", path)).status === 200),
  );
  if (!loaded.every(Boolean)) {
    kit.check(
      "security merged: the nine modules are loaded",
      false,
      MODULES.filter((_, index) => !loaded[index]).map(([name]) => name),
    );
    return;
  }
  const once = kit.pass.width === "desktop" && kit.pass.theme === "light";
  const outboxBefore = kit.outbox().length;
  const get = async (path: string) => (await kit.socket.ask("GET", path)).body;
  const post = (path: string, body: Body = {}) =>
    kit.socket.ask("POST", path, { by: WALKER, ...body });
  const today = String((await get("/data/_test/day")).day ?? "");

  // ---------------------------------------------------------------- S1: the Summary, every area
  const summary = (await get("/data/assurance?owner=1")) as {
    areas?: { area: string; lines: { key: string; words: string }[] }[];
    absent?: Body[];
  };
  const lines = (summary.areas ?? []).flatMap((area) => area.lines);
  const silent = MODULES.map(([name]) => name).filter(
    (name) => !lines.some((line) => line.key.startsWith(`${name}:`)),
  );
  const summaryShown = await visit(page, `${kit.base}/data/assurance`, "#table-systems");
  const rows: Record<string, string[]> = {};
  for (const table of ["systems", "assurance", "buyers"])
    rows[table] = (await page.locator(`#table-${table} tbody tr`).allInnerTexts()).map(flat);
  const summaryText = summaryShown ? flat(await kit.text()) : "";
  kit.check(
    "security merged S1: the Summary has every area, a line from each of the nine modules, and none not loaded",
    summaryShown &&
      (summary.absent ?? []).length === 0 &&
      silent.length === 0 &&
      Object.values(rows).every((list) => list.length > 0) &&
      rows.systems!.length + rows.assurance!.length + rows.buyers!.length === lines.length &&
      !summaryText.includes("Not loaded here") &&
      !summaryText.includes(NOT_LOADED) &&
      !lines.some((line) => line.words.endsWith(NOT_LOADED)) &&
      !summaryText.includes("%"),
    { absent: summary.absent, silent, rows },
  );

  // ---------------------------------------------------------------- S2: the Owner's pages
  const people = ((await get("/data/people")).people as Body[] | undefined) ?? [];
  const idOf = (name: string) =>
    String(people.find((person) => person.name === name)?.person_id ?? "");
  const oneId = idOf(ONE);
  const twoId = idOf(TWO);
  const accounts =
    ((await get("/data/tools/accounts?owner=1")).accounts as Body[] | undefined) ?? [];
  const twoAccount = accounts.find(
    (row) => (row.person as Body | null | undefined)?.name === TWO && row.holder === TWO_ACCOUNT,
  );
  const ownerDevice = ((await get(`/data/devices/${DEVICE}?owner=1`)).owner as Body | undefined)
    ?.person as Body | null | undefined;
  const ownerSeen: Record<string, string> = {};
  if (await visit(page, `${kit.base}/data/systems/accounts`, "#table-accounts"))
    ownerSeen.accounts = await tableText(page, "#table-accounts");
  if (await visit(page, `${kit.base}/data/systems/devices`, "#table-devices"))
    ownerSeen.devices = await tableText(page, "#table-devices");
  for (const [key, id] of [
    ["one", oneId],
    ["two", twoId],
  ] as const)
    if (
      id &&
      (await visit(page, `${kit.base}/data/people/${id}`, '[data-section="person-systems"]'))
    )
      ownerSeen[key] = flat(await page.locator('[data-section="person-systems"]').innerText());
  kit.check(
    "security merged S2: as the Owner, Accounts and Devices name who in the people ledger holds each, and both people's pages list theirs",
    Boolean(oneId && twoId && twoAccount) &&
      ownerDevice?.name === ONE &&
      (ownerSeen.accounts ?? "").includes(TWO) &&
      (ownerSeen.accounts ?? "").includes("In the people ledger") &&
      (ownerSeen.accounts ?? "").includes("Close by") &&
      (ownerSeen.devices ?? "").includes(ONE) &&
      (ownerSeen.devices ?? "").includes(TYPED_HOLDER) &&
      (ownerSeen.devices ?? "").includes("In the people ledger") &&
      (ownerSeen.one ?? "").includes("Devices in Systems") &&
      (ownerSeen.one ?? "").includes("Walk Laptop 14") &&
      (ownerSeen.two ?? "").includes("Accounts in Systems") &&
      (ownerSeen.two ?? "").includes("Walk Mail"),
    {
      ids: [Boolean(oneId), Boolean(twoId), Boolean(twoAccount)],
      device: ownerDevice?.name ?? null,
      seen: Object.fromEntries(
        Object.entries(ownerSeen).map(([key, text]) => [key, text.slice(0, 160)]),
      ),
    },
  );
  const browser = page.context().browser();
  if (browser) await asAdmin(browser, kit, [oneId, twoId]);
  else kit.check("security merged S2: a browser for the Admin", false);

  // ---------------------------------------------------------------- S3: a customer's duty moves a day
  const profileOf = async () =>
    ((await get(`/data/profiles/for-entry/${WALK_PROFILE_ENTRY}`)).profile as Profile | null) ??
    null;
  const profile = await profileOf();
  const duty = profile?.duties.find((item) => item.key === WALK_PROFILE_DUTY) ?? null;
  const alerts =
    ((await get("/data/findings?view=all&source=dependabot")).findings as Body[] | undefined) ?? [];
  const finding = alerts.find((item) => item.title === HIGH_ALERT);
  const findingId = String(finding?.finding_id ?? "");
  const foundOn = String(finding?.found_on ?? today);
  if (
    !profile ||
    !duty ||
    duty.state !== "in_contract" ||
    !profile.applies_from ||
    profile.applies_from > today ||
    !findingId
  ) {
    kit.check(
      "security merged S3: Walk Capital 2000's patch duty is in force and the high alert is a finding",
      false,
      { profile: Boolean(profile), duty, findingId },
    );
  } else {
    const because = `Shorter because of ${profile.firm}'s contract: high-severity missing patches fixed within 1 week.`;
    const shorter = addDays(foundOn, 7);
    const longer = addDays(foundOn, 30);
    const fixBy = async () =>
      (await visit(
        page,
        `${kit.base}/data/assurance/findings/${findingId}`,
        '[data-section="finding-fix-by"]',
      ))
        ? flat(await page.locator('[data-section="finding-fix-by"]').innerText())
        : "";
    const dueRow = async () =>
      (((await get("/data/overview?due=all")).due as Body[] | undefined) ?? []).find(
        (row) => row.key === `finding:${findingId}`,
      ) ?? null;
    const inForce = async () => {
      const block = await fixBy();
      const row = await dueRow();
      return {
        ok:
          block.includes(`Fix by ${words(shorter)}.`) &&
          block.includes(because) &&
          row?.due_on === shorter,
        block: block.slice(0, 240),
        due: row?.due_on ?? null,
      };
    };
    const before = await inForce();
    kit.check(
      "security merged S3: with Walk Capital 2000's contract in force the high alert is fixed within 7 days, says why, and Due has it",
      before.ok,
      before,
    );
    if (once) {
      const profilePage = `${kit.base}/data/waitlist/${WALK_PROFILE_ENTRY}/profile`;
      const mark = async (state: "in_contract" | "not_in_contract") => {
        if (!(await visit(page, profilePage, `#duty-${duty.duty_id}`))) return false;
        const row = page.locator(`#duty-${duty.duty_id}`);
        await row.locator("summary", { hasText: "Change" }).click();
        await row.locator(`#duty-${duty.duty_id}-state`).selectOption(state);
        await row.locator("button", { hasText: /^Save$/ }).click();
        return until(page, async () =>
          Boolean(
            (await profileOf())?.duties.some(
              (item) => item.duty_id === duty.duty_id && item.state === state,
            ),
          ),
        );
      };
      try {
        const out = await mark("not_in_contract");
        const block = await fixBy();
        const row = await dueRow();
        kit.check(
          "security merged S3: marked not in the contract, the same finding is fixed within 30 days and its Due row moves with it",
          out &&
            block.includes(`Fix by ${words(longer)}.`) &&
            !block.includes("Shorter because") &&
            // Due holds a finding from 7 days before its day: 30 days off, the row is not due yet.
            (row === null || row.due_on === longer) &&
            (await get("/data/findings?view=all")).in_force !== null,
          { out, block: block.slice(0, 240), due: row?.due_on ?? null },
        );
      } finally {
        // Put back as it was, through the page; the service's own route if the page fails.
        if (!(await mark("in_contract").catch(() => false)))
          await post(`/data/profiles/${profile.profile_id}/duties/${duty.duty_id}`, {
            state: "in_contract",
          });
      }
      const after = await inForce();
      kit.check(
        "security merged S3: marked in the contract again, the finding is back to 7 days and in Due",
        after.ok,
        after,
      );
    }
  }

  // ---------------------------------------------------------------- S4: an XLSX round trip
  if (once) await roundTrip(page, kit);

  // ---------------------------------------------------------------- S5: nothing sent
  kit.check("security merged S5: the outbox did not grow", kit.outbox().length === outboxBefore, {
    before: outboxBefore,
    after: kit.outbox().length,
  });
}

/** S2 as the walk's Admin: the left-out line, the holders as typed, no ledger column or name. */
async function asAdmin(browser: Browser, kit: WalkKit, personIds: string[]): Promise<void> {
  const size =
    kit.pass.width === "phone" ? { width: 412, height: 915 } : { width: 1440, height: 900 };
  const context = await browser.newContext({ viewport: size });
  try {
    const admin = await context.newPage();
    await admin.goto(`${kit.base}/dev/signin?as=admin%40hq.test&next=%2Fdata%2Fsystems`, {
      waitUntil: "networkidle",
    });
    const seen: Record<string, string> = {};
    let heads = 0;
    for (const [key, path] of [
      ["accounts", "/data/systems/accounts"],
      ["devices", "/data/systems/devices"],
      ["summary", "/data/assurance"],
      ...personIds.filter(Boolean).map((id, index) => [`person${index}`, `/data/people/${id}`]),
    ] as const) {
      await admin.goto(`${kit.base}${path}`, { waitUntil: "networkidle", timeout: 90_000 });
      seen[key] = flat(await admin.locator("main").first().innerText());
      heads += await admin
        .locator("main th", { hasText: /In the people ledger|Close by|Owed by/ })
        .count();
    }
    const people = Object.entries(seen).filter(([key]) => key.startsWith("person"));
    kit.check(
      "security merged S2: as the walk's Admin, Accounts, Devices and the Summary say the ledger's part is left out, show the holders as typed, and no page names anyone in the ledger",
      Object.values(seen).every((text) => !text.includes("Walk Intern")) &&
        [seen.accounts, seen.devices, seen.summary].every((text) =>
          (text ?? "").includes(OWNER_LEFT_OUT),
        ) &&
        (seen.accounts ?? "").includes(TWO_ACCOUNT) &&
        (seen.devices ?? "").includes(TYPED_HOLDER) &&
        heads === 0 &&
        people.length === 2 &&
        people.every(([, text]) => text.includes(PEOPLE_OWNER_LINE)),
      {
        heads,
        seen: Object.fromEntries(
          Object.entries(seen).map(([key, text]) => [key, text.slice(0, 120)]),
        ),
      },
    );
  } finally {
    await context.close();
  }
}

/** Press the page's "Export XLSX" and read what it downloads. */
async function downloadXlsx(page: Page): Promise<{ bytes: Buffer; name: string }> {
  const [download] = await Promise.all([
    page.waitForEvent("download", { timeout: 60_000 }),
    page.locator("main a", { hasText: "Export XLSX" }).click(),
  ]);
  const file = await download.path();
  return { bytes: file ? readFileSync(file) : Buffer.alloc(0), name: download.suggestedFilename() };
}

/** The first sheet's rows, or none when the bytes are not a workbook. */
function rowsOf(bytes: Buffer): string[][] {
  try {
    return readXlsx(new Uint8Array(bytes)).sheet.rows;
  } catch {
    return [];
  }
}

/** S4: the walk's questionnaire's XLSX downloaded from its page, imported again, every answer in its cell. */
async function roundTrip(page: Page, kit: WalkKit): Promise<void> {
  const read = async (id: string) => {
    const answer = await kit.socket.ask("GET", `/data/questionnaires/${id}`);
    return answer.status === 200
      ? (answer.body as {
          questionnaire: { map: { answer: number | null; comment: number | null }; state: string };
          questions: QuestionRow[];
          counts: { answered: number };
        })
      : null;
  };
  const original = await read(WALK_QUESTIONNAIRE_ID);
  const answered = original?.questions.filter((question) => question.answer !== null) ?? [];
  const map = original?.questionnaire.map;
  if (!original || answered.length === 0 || map?.answer == null || map.comment == null) {
    kit.check(
      "security merged S4: the questionnaires walk's questionnaire is here, answered, with an answer and a comment column",
      false,
      { found: Boolean(original), answered: answered.length, map },
    );
    return;
  }
  const answerAt = map.answer;
  const commentAt = map.comment;
  /** What the export writes for each answered question: the short answer, then the text. */
  const expected = new Map(
    answered.map((question) => [
      question.qid,
      [SHORT_WORDS[question.answer!.short] ?? "", question.answer!.text] as const,
    ]),
  );
  const holds = (qid: string, cells: readonly string[]) => {
    const want = expected.get(qid);
    return want
      ? (cells[answerAt] ?? "") === want[0] && (cells[commentAt] ?? "") === want[1]
      : true;
  };

  // The export, as the page's link downloads it.
  const path = `${kit.base}${QUESTIONNAIRES}/${WALK_QUESTIONNAIRE_ID}`;
  if (!(await visit(page, path, "#table-questions"))) {
    kit.check("security merged S4: the questionnaire's page opens", false);
    return;
  }
  const { bytes, name } = await downloadXlsx(page);
  const sheet = rowsOf(bytes);
  const exported = sheet.slice(1).filter((row) => expected.has(row[0] ?? ""));
  kit.check(
    "security merged S4: the XLSX downloaded from the page holds every answer in its cell",
    exported.length === expected.size && exported.every((row) => holds(row[0] ?? "", row)),
    { rows: sheet.length, answered: expected.size, sample: exported[0] ?? null },
  );

  // Imported again, as "Something else" with no firm: nothing is linked and no Due row is made.
  if (!(await visit(page, `${kit.base}${QUESTIONNAIRES}/new`, "#questionnaire-file"))) {
    kit.check("security merged S4: the import page opens", false);
    return;
  }
  await page.locator("#questionnaire-kind").selectOption("other");
  await page.locator("#questionnaire-firm").selectOption("");
  await page.locator("#questionnaire-file").setInputFiles({
    name: name || "walk-round-trip.xlsx",
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer: bytes,
  });
  await page.locator("button", { hasText: "Read the file" }).click();
  const total = original.questions.length;
  const previewed = await until(page, async () =>
    flat(await page.locator(".hqdata-qimport").innerText()).includes(
      `${total} questions are under it`,
    ),
  );
  const previewRows = (
    await page
      .locator(".hqdata-qimport table tbody tr")
      .evaluateAll((trs) =>
        trs.map((tr) => [...tr.querySelectorAll("td")].map((td) => (td.textContent ?? "").trim())),
      )
  ).filter((cells) => expected.has(cells[0] ?? ""));
  kit.check(
    "security merged S4: the preview of the export reads the header at row 1 and every answer in its cell",
    previewed &&
      flat(await page.locator(".hqdata-qimport").innerText()).includes("the header is row 1") &&
      previewRows.length === expected.size &&
      previewRows.every((cells) => holds(cells[0] ?? "", cells)),
    { previewed, rows: previewRows.length, sample: previewRows[0] ?? null },
  );
  await page.locator("#questionnaire-title").fill(ROUND_TRIP_TITLE);
  await page.locator("button", { hasText: `Import ${total} questions` }).click();
  await page
    .waitForURL(new RegExp(`${QUESTIONNAIRES}/[0-9a-f-]{36}$`), { timeout: 30_000 })
    .catch(() => undefined);
  const copyId = /questionnaires\/([0-9a-f-]{36})$/.exec(page.url())?.[1] ?? "";
  const copy = copyId && copyId !== WALK_QUESTIONNAIRE_ID ? await read(copyId) : null;
  const copyShown = copy
    ? await visit(page, `${kit.base}${QUESTIONNAIRES}/${copyId}`, "#table-questions")
    : false;
  const copyPage = copyShown ? flat(await kit.text()) : "";
  // The copy's own export: HQ holds no answer for it, so each cell goes out as it came in.
  const again = copyShown ? rowsOf((await downloadXlsx(page)).bytes) : [];
  const back = again.slice(1).filter((row) => expected.has(row[0] ?? ""));
  kit.check(
    "security merged S4: imported again, the copy has every question, and its own export every answer back in its cell",
    copy !== null &&
      copy.questions.length === total &&
      copy.counts.answered === 0 &&
      back.length === expected.size &&
      back.every((row) => holds(row[0] ?? "", row)) &&
      copyPage.includes(ROUND_TRIP_TITLE) &&
      !copyPage.includes("%"),
    {
      url: page.url(),
      questions: copy?.questions.length ?? 0,
      answered: copy?.counts.answered ?? null,
      back: back.length,
      sample: back[0] ?? null,
    },
  );
  // Tidy: the copy is closed, so it asks for nothing.
  if (copyId && copyId !== WALK_QUESTIONNAIRE_ID)
    await kit.socket.ask("POST", `/data/questionnaires/${copyId}/close`, { by: WALKER });
}
