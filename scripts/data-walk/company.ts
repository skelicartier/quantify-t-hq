/**
 * The company record, walked against the stand-in (company spec §6.11): Facts empty at
 * first with every value "Not known" (CO1); the dates filled in, the first financial year's
 * end offering only 31 Mar 2026 and the first AGM worked out (CO2); Identity with the
 * reserved numbers no real company holds, and the checks they fail on purpose (CO3); a
 * malformed CIN refused (CO4); a subsidiary marked small, and the check that says so (CO5);
 * the walk's director listed (CO6); a contact change whose KYC-Web filing lands in Key dates
 * (CO7) and is then recorded as filed (CO8); the overview's "The company" block (CO9); and
 * the intern seeing only the role line (CO10). Every name and number is invented.
 */

import { request } from "node:http";

import type { Page } from "playwright";

import { WALKER, type Shot, type WalkKit } from "./kit";

export const shots: Shot[] = [
  { name: "data-company", path: "/data/company", ready: ".hqdata-company" },
  { name: "data-company-directors", path: "/data/company/directors", ready: "#table-directors" },
  {
    name: "data-company-director",
    path: "/data/company/directors/walk-director",
    ready: '[data-section="director-changes"]',
  },
];

type Answer = { status: number; body: Record<string, unknown> };
type Body = Record<string, unknown>;

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

const pad = (value: number) => String(value).padStart(2, "0");

function addDays(day: string, count: number): string {
  const [year = 0, month = 1, date = 1] = day.split("-").map(Number);
  const moved = new Date(Date.UTC(year, month - 1, date + count));
  return `${moved.getUTCFullYear()}-${pad(moved.getUTCMonth() + 1)}-${pad(moved.getUTCDate())}`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "14 Dec 2026", as the page prints a calendar date. */
function dayWords(day: string): string {
  const [year = "", month = "", date = ""] = day.split("-");
  return `${Number(date)} ${MONTHS[Number(month) - 1] ?? ""} ${year}`;
}

const flat = (text: string) => text.replace(/\s+/g, " ").trim();

/** The walk's director, pinned as `walk-director` (the spec's §6.4 test route). */
export async function seed(socketPath: string): Promise<void> {
  if ((await ask(socketPath, "GET", "/data/company")).status !== 200) {
    console.log("[walk] company: the module is not loaded here");
    return;
  }
  await ask(socketPath, "POST", "/data/_test/company/seed", { by: WALKER });
}

async function until(page: Page, test: () => Promise<boolean>, tries = 100): Promise<boolean> {
  for (let count = 0; count < tries; count += 1) {
    if (await test()) return true;
    await page.waitForTimeout(100);
  }
  return false;
}

async function company(kit: WalkKit): Promise<Body> {
  return (await kit.socket.ask("GET", "/data/company")).body;
}

async function open(page: Page, kit: WalkKit, path: string, ready: string): Promise<string> {
  await page.goto(`${kit.base}${path}`, { waitUntil: "networkidle" });
  await page.waitForSelector(ready, { timeout: 30_000 });
  return flat(await kit.text());
}

export async function walk(page: Page, kit: WalkKit): Promise<void> {
  if ((await kit.socket.ask("GET", "/data/company")).status !== 200) {
    kit.check("company: not loaded in this service", true);
    return;
  }
  const today = String((await kit.socket.ask("GET", "/data/_test/day")).body.day ?? "");

  // ---------------------------------------------------------------- CO1: nothing filled in
  let text = await open(page, kit, "/data/company", ".hqdata-company");
  if (kit.pass.first) {
    const notKnown = (text.match(/Not known/g) ?? []).length;
    kit.check(
      "company CO1: no facts yet, every value Not known, no per cent sign",
      text.includes("No facts recorded yet") && notKnown >= 14 && !text.includes("%"),
      { notKnown, start: text.slice(0, 160) },
    );

    // -------------------------------------------------------------- CO2: the dates
    await page.locator("summary", { hasText: "Fill in the dates" }).click();
    const form = page.locator("form", { has: page.locator("#company-first-incorporated") });
    await form.locator("#company-first-incorporated").fill("2025-08-14");
    const options = await form
      .locator("#company-first-fy-end option")
      .evaluateAll((items) =>
        items.map((item) => (item as HTMLOptionElement).value).filter(Boolean),
      );
    await form.locator("button", { hasText: "Save" }).click();
    const saved = await until(
      page,
      async () => ((await company(kit)).facts as Body | undefined)?.first_fy_end === "2026-03-31",
    );
    text = await open(page, kit, "/data/company", ".hqdata-company");
    const decides = flat(await page.locator('[data-section="company-decides"]').innerText());
    kit.check(
      "company CO2: incorporated 14 Aug 2025, the first year can only end 31 Mar 2026, and the first AGM is by 31 Dec 2026",
      saved &&
        JSON.stringify(options) === JSON.stringify(["2026-03-31"]) &&
        decides.includes("First AGM") &&
        decides.includes("By 31 Dec 2026") &&
        !text.includes("No facts recorded yet"),
      { options, decides: decides.slice(0, 160) },
    );

    // -------------------------------------------------------------- CO3: identity, reserved numbers
    const identity = page.locator('[data-section="company-identity"]');
    await identity.locator("summary", { hasText: "Edit" }).click();
    await page.fill("#company-legal-name", "Walk Company Private Limited");
    await page.fill("#company-cin", "U00000JK2025PTC000000");
    await page.fill("#company-pan", "ZZZCZ0000Z");
    await page.fill("#company-tan", "ZZZZ00000Z");
    await page.fill("#company-gstin", "00ZZZCZ0000Z1Z0");
    await page.selectOption("#company-state", "JK");
    await identity.locator("button", { hasText: "Save" }).click();
    const named = await until(
      page,
      async () => ((await company(kit)).facts as Body | undefined)?.cin === "U00000JK2025PTC000000",
    );
    await open(page, kit, "/data/company", ".hqdata-company");
    const checks = flat(await page.locator('[data-section="company-checks"]').innerText());
    kit.check(
      "company CO3: Identity saved; Checks name the GSTIN's check character and Registered for GST",
      named &&
        checks.includes(
          "The GSTIN's last character does not match the rest. Check it against the certificate.",
        ) &&
        checks.includes("There is a GSTIN, but Registered for GST says Not known."),
      checks.slice(0, 240),
    );

    // -------------------------------------------------------------- CO4: a CIN refused
    await identity.locator("summary", { hasText: "Edit" }).click();
    await page.fill("#company-cin", "U72200JKWALKS");
    await identity.locator("button", { hasText: "Save" }).click();
    const refused = await until(page, async () =>
      (await identity.innerText()).includes(
        "Type the CIN as it is on the certificate: 21 letters and digits",
      ),
    );
    kit.check(
      "company CO4: a malformed CIN is refused with its sentence and nothing changes",
      refused && ((await company(kit)).facts as Body | undefined)?.cin === "U00000JK2025PTC000000",
    );

    // -------------------------------------------------------------- CO5: small and a subsidiary
    const setClass = async (values: Record<string, string>) => {
      await open(page, kit, "/data/company", ".hqdata-company");
      const section = page.locator('[data-section="company-class"]');
      await section.locator("summary", { hasText: "Edit" }).click();
      for (const [name, value] of Object.entries(values))
        await section.locator(`input[name="${name}"][value="${value}"]`).check({ force: true });
      await section.locator("button", { hasText: "Save" }).click();
      await until(page, async () => {
        const flags = ((await company(kit)).facts as Body | undefined)?.flags as Body | undefined;
        return Object.entries(values).every(([name, value]) => flags?.[name] === value);
      });
      await open(page, kit, "/data/company", ".hqdata-company");
      return flat(await page.locator('[data-section="company-checks"]').innerText());
    };
    const subsidiary = await setClass({ small: "yes", startup: "no", subsidiary: "yes" });
    const fixed = await setClass({ subsidiary: "no" });
    kit.check(
      "company CO5: small and a subsidiary shows the check; a subsidiary no more clears it",
      subsidiary.includes(
        "A subsidiary cannot be a small company. Check both answers with your CS.",
      ) && !fixed.includes("A subsidiary cannot be a small company."),
      { subsidiary: subsidiary.slice(0, 120), fixed: fixed.slice(0, 120) },
    );
  }
  text = await open(page, kit, "/data/company", ".hqdata-company");
  kit.check(
    "company: the facts page says it is a record to keep, not legal advice, and no per cent sign",
    text.includes("This is a record to keep, not legal advice.") && !text.includes("%"),
  );
  await kit.audit("company");

  // ---------------------------------------------------------------- CO6: the directors
  text = await open(page, kit, "/data/company/directors", "#table-directors");
  const row = page.locator("#table-directors tbody tr", { hasText: "Walk Director" });
  const director = ((await kit.socket.ask("GET", "/data/company/directors/walk-director")).body
    .director ?? {}) as Body;
  const dsc = String((director.dsc as Body | undefined)?.expires_on ?? "");
  const rowText = flat(await row.innerText());
  kit.check(
    "company CO6: Walk Director with DIN 00000000, the DSC chip and the next KYC on 30 Jun 2029",
    (await row.count()) === 1 &&
      rowText.includes("00000000") &&
      rowText.includes("30 Jun 2029") &&
      rowText.includes(dayWords(dsc)) &&
      (await row.locator(".due").count()) === 1 &&
      text.includes("This is a record to keep, not legal advice."),
    rowText,
  );
  await kit.audit("company-directors");

  // ---------------------------------------------------------------- CO7: a contact change
  const directorPath = "/data/company/directors/walk-director";
  if (kit.pass.first) {
    await open(page, kit, directorPath, '[data-section="director-changes"]');
    await page.locator("summary", { hasText: "Record a contact change" }).click();
    const form = page.locator("form", { has: page.locator("#change-to") });
    await form.locator("#change-field").selectOption("mobile");
    await form.locator("#change-to").fill("+91 00000 00001");
    const ticked = await form.locator("#change-add-date").isChecked();
    await form.locator("button", { hasText: "Record the change" }).click();
    const said = `Recorded. File the update by ${dayWords(addDays(today, 30))}.`;
    const answered = await until(page, async () => (await form.innerText()).includes(said));
    text = await open(page, kit, "/data/dates", ".hqdata-dates");
    kit.check(
      "company CO7: the box starts ticked, the sentence says the file-by day, and Key dates lists the filing from the change",
      ticked &&
        answered &&
        text.includes("DIR-3 KYC-Web: Walk Director's new mobile") &&
        text.includes("From: Contact change: Walk Director"),
      { ticked, answered },
    );

    // -------------------------------------------------------------- CO8: the filing recorded
    await open(page, kit, directorPath, '[data-section="director-changes"]');
    const change = page.locator('[data-section="director-changes"] tbody tr').first();
    await change.locator("summary", { hasText: "Record the filing" }).click();
    await change.locator('input[name="srn"]').fill("WALK-SRN-1");
    await change.locator("form button", { hasText: "Record the filing" }).click();
    await until(page, async () => {
      const changes =
        ((await kit.socket.ask("GET", "/data/company/directors/walk-director")).body.changes as
          Body[] | undefined) ?? [];
      return changes.some((item) => item.filed !== null);
    });
  }
  text = await open(page, kit, directorPath, '[data-section="director-changes"]');
  const changes = flat(await page.locator('[data-section="director-changes"]').innerText());
  const keyDates = flat(await page.locator('[data-section="director-key-dates"]').innerText());
  kit.check(
    "company CO8: the change reads Filed with its SRN, and its Key date is Done with the SRN",
    changes.includes("Filed") &&
      changes.includes("SRN WALK-SRN-1") &&
      keyDates.includes("DIR-3 KYC-Web: Walk Director's new mobile") &&
      keyDates.includes("Done") &&
      keyDates.includes("SRN WALK-SRN-1"),
    { changes: changes.slice(0, 200), keyDates: keyDates.slice(0, 200) },
  );
  await kit.audit("company-director");

  // ---------------------------------------------------------------- CO9: the overview's block
  await page.goto(`${kit.base}/data`, { waitUntil: "networkidle" });
  await page.waitForSelector('[data-section="data-company"]', { timeout: 30_000 });
  const block = flat(await page.locator('[data-section="data-company"]').innerText());
  kit.check(
    "company CO9: The company reads Incorporated 14 Aug 2025 and the directors",
    block.includes("Incorporated 14 Aug 2025") &&
      block.includes("1 director") &&
      block.includes("Open the company record"),
    block,
  );

  // ---------------------------------------------------------------- CO10: the intern
  if (kit.pass.first) {
    const browser = page.context().browser();
    if (browser) {
      const other = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      const intern = await other.newPage();
      await intern.goto(
        `${kit.base}/dev/signin?as=intern%40hq.test&next=${encodeURIComponent("/data/company")}`,
        { waitUntil: "networkidle" },
      );
      const seen: string[] = [];
      for (const path of ["/data/company", "/data/company/directors"]) {
        await intern.goto(`${kit.base}${path}`, { waitUntil: "networkidle" });
        seen.push(await intern.locator("main").first().innerText());
      }
      kit.check(
        "company CO10: as the intern both pages say the role line, with no address and no DIN",
        seen.every(
          (body) =>
            body.includes("Data is for Owners and Admins.") &&
            !body.includes("@") &&
            !body.includes("00000000"),
        ),
        seen.map((body) => body.slice(0, 80)),
      );
      await other.close();
    }
  }
}
