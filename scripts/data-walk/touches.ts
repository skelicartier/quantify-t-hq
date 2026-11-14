/**
 * Touches by hand, walked against the stand-in (company spec §8.12): a connection request
 * logged from the first lead's Touches section, counted in the week (TO1); a message on the
 * investor firm at fund281.example, logged through the service in this copy (TO2); eight weeks
 * on the Touches page (TO3); the acceptance warning coming and going (TO4); no page naming the
 * network and no "%" (TO5); Withdraw and Restore (TO6); and the intern (TO7). Every lead and
 * firm is invented.
 */

import { createHash } from "node:crypto";

import type { Page } from "playwright";

import { WALKER, type Shot, type WalkKit } from "./kit";

export const shots: Shot[] = [
  { name: "data-touches", path: "/data/touches", ready: "#table-touches-by-week" },
];

const ACCEPT_WARNING =
  "Fewer than 1 in 5 of the connection requests you logged in the last four weeks were accepted.";
const NO_TOUCHES =
  "No touches logged. Log a connection request, a message or a call made outside email.";
/** The walk's invented investor firm, keyed as the investors module keys it. */
const FIRM_ID = createHash("sha256").update("investor:fund281.example").digest("hex").slice(0, 32);
const NETWORK = /linked\s*in/i;

const pad = (value: number) => String(value).padStart(2, "0");
function addDays(day: string, count: number): string {
  const [year = 0, month = 0, date = 0] = day.split("-").map(Number);
  const moved = new Date(Date.UTC(year, month - 1, date + count));
  return `${moved.getUTCFullYear()}-${pad(moved.getUTCMonth() + 1)}-${pad(moved.getUTCDate())}`;
}

const flat = (text: string) => text.replace(/\s+/g, " ").trim();

type TouchRow = {
  touch_id: string;
  subject: { kind: string; id: string; name: string };
  kind: string;
  note: string;
  withdrawn: unknown;
};
type TouchesPage = {
  touches: TouchRow[];
  total: number;
  weeks: { week_from: string; requests: number }[];
  this_week: { requests: number };
  four_weeks: { requests: number; accepted: number };
};

async function touchesOf(kit: WalkKit, query = ""): Promise<TouchesPage> {
  return (await kit.socket.ask("GET", `/data/touches${query}`)).body as unknown as TouchesPage;
}

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

export async function walk(page: Page, kit: WalkKit): Promise<void> {
  if ((await kit.socket.ask("GET", "/data/touches")).status !== 200) {
    kit.check("touches: not loaded in this service", true);
    return;
  }
  const today = String((await kit.socket.ask("GET", "/data/_test/day")).body.day ?? "");
  const leads =
    ((await kit.socket.ask("GET", "/data/leads")).body.leads as
      { lead_id: string; name: string; email: string }[] | undefined) ?? [];
  const lead = leads[0];
  if (!lead) {
    kit.check("touches TO1: a lead to log on", false, leads.length);
    return;
  }
  const onLead = `?subject_kind=lead&subject_id=${lead.lead_id}`;

  // ---------------------------------------------------------------- TO1: the lead's section
  await page.goto(`${kit.base}/data/leads/${lead.lead_id}`, { waitUntil: "networkidle" });
  if (!(await shown(page, kit, '[data-section="lead-touches"]'))) return;
  const section = page.locator('[data-section="lead-touches"]');
  if (kit.pass.first && (await touchesOf(kit, onLead)).total === 0)
    kit.check(
      "touches TO1: a lead with no touches says how to log one",
      flat(await section.innerText()).includes(NO_TOUCHES),
    );
  const before = (await touchesOf(kit, onLead)).total;
  await section.locator("summary", { hasText: "Log a touch" }).click();
  await page.selectOption("#lead-touches-new-kind", "request");
  await page.fill("#lead-touches-new-on", today);
  await section.locator("button", { hasText: "Log it" }).click();
  const said = await kit
    .says("Logged.")
    .then(() => true)
    .catch(() => false);
  const logged = await until(page, async () => (await touchesOf(kit, onLead)).total === before + 1);
  await page.goto(`${kit.base}/data/leads/${lead.lead_id}`, { waitUntil: "networkidle" });
  if (!(await shown(page, kit, '[data-section="lead-touches"]'))) return;
  const requests = (await touchesOf(kit)).this_week.requests;
  const sectionText = flat(await section.innerText());
  kit.check(
    "touches TO1: Log a touch lists the connection request, and the week's line matches the service",
    said &&
      logged &&
      sectionText.includes("Connection request") &&
      sectionText.includes(
        `This week: ${requests.toLocaleString("en")} connection ${requests === 1 ? "request" : "requests"} logged in all.`,
      ),
    sectionText.slice(0, 200),
  );
  kit.check(
    "touches TO5: the lead's section names no network and has no per cent sign",
    !NETWORK.test(sectionText) && !sectionText.includes("%"),
  );

  // ---------------------------------------------------------------- TO2: the investor firm
  const findFirm = async () =>
    (await touchesOf(kit, `?subject_kind=investor&subject_id=${FIRM_ID}`)).touches.find(
      (item) => item.kind === "message" && item.note === "Invented: sent the pilot summary.",
    );
  if (kit.pass.first && !(await findFirm())) {
    const made = await kit.socket.ask("POST", "/data/touches", {
      subject_kind: "investor",
      subject_id: FIRM_ID,
      subject_name: "Walk Fund 281",
      on: today,
      kind: "message",
      note: "Invented: sent the pilot summary.",
      by: WALKER,
    });
    kit.check(
      "touches TO2: a message on the investor firm is logged",
      made.status === 200,
      made.body,
    );
  }
  const firm = await findFirm();
  await page.goto(`${kit.base}/data/touches`, { waitUntil: "networkidle" });
  if (!(await shown(page, kit, "#table-touches-by-week"))) return;
  const table = flat(await page.locator("#table-touches").innerText());
  kit.check(
    "touches TO2: the Touches page lists the lead's request and the firm's message",
    Boolean(firm) &&
      table.includes(lead.name || lead.email) &&
      table.includes(firm?.subject.name ?? "?"),
    table.slice(0, 200),
  );

  // ---------------------------------------------------------------- TO3: eight weeks
  const weekRows = page.locator("#table-touches-by-week tbody tr");
  const service = await touchesOf(kit);
  const firstWeek = (await weekRows.first().locator("td").allInnerTexts()).map((cell) =>
    cell.trim(),
  );
  kit.check(
    "touches TO3: Touches by week has eight rows, this week's requests as the service counts them",
    (await weekRows.count()) === 8 && firstWeek[1] === String(service.this_week.requests),
    firstWeek,
  );

  // ---------------------------------------------------------------- TO4: the acceptance warning
  if (kit.pass.first) {
    const mine: string[] = [];
    const log = async (kind: "request" | "accepted", index: number) => {
      const answer = await kit.socket.ask("POST", "/data/touches", {
        subject_kind: "lead",
        subject_id: lead.lead_id,
        subject_name: lead.name || lead.email,
        on: addDays(today, -(index % 20)),
        kind,
        note: "Invented: logged by the walk's acceptance check.",
        by: WALKER,
      });
      const id = (answer.body.touch as { touch_id?: string } | undefined)?.touch_id;
      if (id) mine.push(id);
    };
    let counts = (await touchesOf(kit)).four_weeks;
    for (
      let index = 0;
      counts.requests < 10 || counts.accepted * 5 >= counts.requests;
      index += 1
    ) {
      if (index > 200) break;
      await log("request", index);
      counts = (await touchesOf(kit)).four_weeks;
    }
    await page.goto(`${kit.base}/data/touches`, { waitUntil: "networkidle" });
    const shownWarning = flat(await kit.text()).includes(ACCEPT_WARNING);
    for (let index = 0; counts.accepted * 5 < counts.requests; index += 1) {
      if (index > 200) break;
      await log("accepted", index);
      counts = (await touchesOf(kit)).four_weeks;
    }
    await page.goto(`${kit.base}/data/touches`, { waitUntil: "networkidle" });
    const gone = !flat(await kit.text()).includes(ACCEPT_WARNING);
    for (const id of mine)
      await kit.socket.ask("POST", `/data/touches/${id}/withdraw`, { by: WALKER });
    kit.check(
      "touches TO4: under 1 in 5 accepted over four weeks shows the warning; enough acceptances take it away",
      shownWarning && gone && mine.length > 0,
      counts,
    );
  }

  // ---------------------------------------------------------------- TO5, TO6
  await page.goto(`${kit.base}/data/touches`, { waitUntil: "networkidle" });
  if (!(await shown(page, kit, "#table-touches-by-week"))) return;
  const pageText = flat(await kit.text());
  kit.check(
    "touches TO5: the Touches page names no network and has no per cent sign",
    !NETWORK.test(pageText) && !pageText.includes("%"),
  );
  if (kit.pass.first && firm) {
    const row = page.locator(`#touch-${firm.touch_id}`);
    await row.locator("button", { hasText: "Withdraw" }).click();
    const withdrawn = await until(page, async () =>
      Boolean((await findFirmById(kit, firm.touch_id))?.withdrawn),
    );
    await page.goto(`${kit.base}/data/touches`, { waitUntil: "networkidle" });
    const muted = ((await row.getAttribute("class")) ?? "").includes(
      "hqdata-touches__row--withdrawn",
    );
    await row.locator("button", { hasText: "Restore" }).click();
    const restored = await until(
      page,
      async () => (await findFirmById(kit, firm.touch_id))?.withdrawn === null,
    );
    await page.goto(`${kit.base}/data/touches`, { waitUntil: "networkidle" });
    const back = !((await row.getAttribute("class")) ?? "").includes(
      "hqdata-touches__row--withdrawn",
    );
    kit.check(
      "touches TO6: Withdraw mutes the row and Restore brings it back",
      withdrawn && muted && restored && back,
    );
  }
  await kit.audit("touches");

  // ---------------------------------------------------------------- TO7: the intern
  if (kit.pass.first) {
    const browser = page.context().browser();
    if (!browser) kit.check("touches TO7: a browser for the intern", false);
    else {
      const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      const intern = await context.newPage();
      try {
        await intern.goto(`${kit.base}/dev/signin?as=intern%40hq.test&next=%2Fdata%2Ftouches`, {
          waitUntil: "networkidle",
        });
        await intern.goto(`${kit.base}/data/touches`, { waitUntil: "networkidle" });
        const body = await intern.locator("main").first().innerText();
        kit.check(
          "touches TO7: as the intern, /data/touches says Data is for Owners and Admins., with no address",
          body.includes("Data is for Owners and Admins.") && !body.includes("@"),
          flat(body).slice(0, 120),
        );
      } finally {
        await context.close();
      }
    }
  }
}

async function findFirmById(kit: WalkKit, touchId: string): Promise<TouchRow | undefined> {
  return (await touchesOf(kit, `?subject_kind=investor&subject_id=${FIRM_ID}`)).touches.find(
    (item) => item.touch_id === touchId,
  );
}
