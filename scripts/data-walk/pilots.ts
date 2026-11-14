/**
 * Pilots, walked against the stand-in (ws-notes/company/spec.md §9.11 PI1–PI8): the empty
 * list and its "0 pilots running" line (PI1); "Plan a pilot" from a waitlist firm with two
 * criteria and no technical owner (PI2); starting it and a check-in (PI3); five more running
 * pilots and a seventh still accepted, the line in the attention tone (PI4); a go/no-go of
 * tomorrow in Data's Due and a "Pilot" row on Home (PI5); a Go with a conversion day (PI6);
 * no "%" and no benchmark figure (PI7); the intern kept out (PI8). Every firm is invented.
 */

import { request } from "node:http";

import type { Page } from "playwright";

import { WALK_ENTRIES } from "../data/waitlist/walk-seed";
import { WALKER, type Shot, type WalkKit } from "./kit";

export const WALK_PILOT = "walk-pilot";

export const shots: Shot[] = [
  { name: "data-pilots", path: "/data/waitlist/pilots", ready: "#table-pilots" },
  {
    name: "data-pilot",
    path: `/data/waitlist/pilots/${WALK_PILOT}`,
    ready: '[data-section="pilot-criteria"]',
  },
];

type Answer = { status: number; body: Record<string, unknown> };

/** Whether the pilots module answers here at all (it does once the stand-in has loaded it). */
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

/** Nothing to seed: PI1 needs the empty list. The walk pins `walk-pilot` before it plans it. */
export async function seed(socketPath: string): Promise<void> {
  const answer = await ask(socketPath, "GET", "/data/pilots");
  if (answer.status !== 200) console.log("[walk] pilots: the module is not loaded here");
}

const flat = (text: string) => text.replace(/\s+/g, " ").trim();
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const short = (day: string) => `${Number(day.slice(8))} ${MONTHS[Number(day.slice(5, 7)) - 1]}`;

function plus(day: string, count: number): string {
  const [year = 0, month = 1, date = 1] = day.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, date + count)).toISOString().slice(0, 10);
}

const LINE = (n: number) =>
  `${n} ${n === 1 ? "pilot" : "pilots"} running. Sources suggest about five at once at most; this is a count, not a limit.`;

async function shown(page: Page, kit: WalkKit, selector: string): Promise<boolean> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const found = await page
      .waitForSelector(selector, { timeout: 30_000 })
      .then(() => true)
      .catch(() => false);
    if (found) return true;
    if (attempt === 0) await page.reload({ waitUntil: "networkidle" });
  }
  kit.check(`pilots: ${selector} is on the page`, false, flat(await kit.text()).slice(0, 200));
  return false;
}

async function until(page: Page, test: () => Promise<boolean>): Promise<boolean> {
  for (let tries = 0; tries < 100; tries += 1) {
    if (await test()) return true;
    await page.waitForTimeout(100);
  }
  return false;
}

type PilotRow = {
  pilot_id: string;
  state: string;
  firm: string;
  go_no_go_on: string | null;
  decision: { outcome: string } | null;
};

async function pilotOf(kit: WalkKit): Promise<PilotRow | null> {
  const answer = await kit.socket.ask("GET", `/data/pilots/${WALK_PILOT}`);
  return answer.status === 200 ? (answer.body.pilot as PilotRow) : null;
}

/** Percent signs, and any "N per cent" figure: the pages carry no benchmark rate. */
const NO_FIGURES = (text: string) => !text.includes("%") && !/\d\s*per cent/i.test(text);

export async function walk(page: Page, kit: WalkKit): Promise<void> {
  if ((await kit.socket.ask("GET", "/data/pilots")).status !== 200) {
    kit.check("pilots: not loaded in this service", true);
    return;
  }
  const today = String((await kit.socket.ask("GET", "/data/_test/day")).body.day ?? "");
  const firmPage = `${kit.base}/data/waitlist/${WALK_ENTRIES.firm}`;

  // ---------------------------------------------------------------- PI1: the empty list
  if (kit.pass.first && !(await pilotOf(kit))) {
    await page.goto(`${kit.base}/data/waitlist/pilots`, { waitUntil: "networkidle" });
    await page.waitForSelector(".hqdata-pilots", { timeout: 30_000 });
    const text = flat(await kit.text());
    kit.check(
      "pilots PI1: the empty list says how to plan one, and the line reads 0 pilots running",
      text.includes(
        "No pilots yet. Plan one from a waitlist firm's page, with its criteria written down before it starts.",
      ) && text.includes(LINE(0)),
      text.slice(0, 240),
    );
    await kit.audit("pilots-empty");
  }

  // ---------------------------------------------------------------- PI2: plan one
  let firm = "";
  if (kit.pass.first && !(await pilotOf(kit))) {
    await kit.socket.ask("POST", "/data/_test/pilots/pin", { id: WALK_PILOT, by: WALKER });
    await page.goto(firmPage, { waitUntil: "networkidle" });
    if (!(await shown(page, kit, '[data-section="waitlist-pilot"]'))) return;
    const section = page.locator('[data-section="waitlist-pilot"]');
    kit.check(
      "pilots PI2: a firm with no pilot says so and offers Plan a pilot",
      flat(await section.innerText()).includes("No pilot planned."),
    );
    await section.locator("summary", { hasText: "Plan a pilot" }).click();
    const form = section.locator("form").first();
    await form.locator('input[name="starts_on"]').fill(today);
    await form.locator('input[name="ends_on"]').fill(plus(today, 30));
    await form.locator('input[name="criterion_0"]').fill("Analysts use it every day");
    await form.locator('input[name="target_0"]').fill("Two analysts, five days a week");
    await form.locator('input[name="criterion_1"]').fill("Answers match the desk's own");
    await form.locator('input[name="target_1"]').fill("Nine answers in ten");
    await form.locator('input[name="sponsor"]').fill("Walk Sponsor");
    await form.locator('input[name="user"]').fill("Walk Analyst");
    await form.locator('input[name="price"]').fill("50000");
    await form.locator('input[name="price_note"]').fill("Half upfront");
    await form.locator('input[name="go_no_go_on"]').fill(plus(today, 28));
    await form.locator("button", { hasText: "Plan the pilot" }).click();
    // The section then shows the planned pilot in place of the form (the form goes with it).
    const made = await until(page, async () => (await pilotOf(kit))?.state === "planned");
    await page.reload({ waitUntil: "networkidle" });
    const planned = flat(await section.innerText());
    kit.check(
      "pilots PI2: Plan a pilot keeps it planned, and the firm's section shows it",
      made && planned.includes("Planned") && planned.includes("Criteria not measured yet"),
      planned.slice(0, 200),
    );
    await page.goto(`${kit.base}/data/waitlist/pilots/${WALK_PILOT}`, { waitUntil: "networkidle" });
    if (!(await shown(page, kit, '[data-section="pilot-criteria"]'))) return;
    const record = flat(await kit.text());
    kit.check(
      "pilots PI2: the pilot warns about fewer than three criteria and the unnamed technical owner",
      record.includes(
        "Sources agree on three or four measurable criteria, written down before the pilot starts.",
      ) && record.includes("Name the technical owner at"),
      record.slice(0, 240),
    );
    await page.goto(`${kit.base}/data/waitlist/pilots`, { waitUntil: "networkidle" });
    await page.waitForSelector("#table-pilots", { timeout: 30_000 });
    const row = flat(await page.locator("#table-pilots tbody tr").first().innerText());
    kit.check(
      "pilots PI2: the list says Not named: technical owner, and Not measured yet",
      row.includes("Not named: technical owner") && row.includes("Not measured yet"),
      row,
    );

    // ---------------------------------------------------------------- PI3: start, check in
    await page.goto(`${kit.base}/data/waitlist/pilots/${WALK_PILOT}`, { waitUntil: "networkidle" });
    await page.locator("button", { hasText: "Start the pilot" }).click();
    const started = await until(page, async () => (await pilotOf(kit))?.state === "running");
    await page.reload({ waitUntil: "networkidle" });
    await page.locator("summary", { hasText: "Log a check-in" }).click();
    const checkIn = page.locator(".hqdata-check-in-form");
    await checkIn.locator('input[name="on"]').fill(today);
    await checkIn
      .locator('textarea[name="note"]')
      .fill("Both analysts used it every day this week.");
    await checkIn.locator("button", { hasText: "Log it" }).click();
    const logged = await kit
      .says(`Logged. Next check-in ${short(plus(today, 7))}.`)
      .then(() => true)
      .catch(() => false);
    kit.check(
      "pilots PI3: Start the pilot, then Log a check-in today: the next is a week on",
      started && logged,
    );

    // ---------------------------------------------------------------- PI4: six running, a seventh
    await kit.socket.ask("POST", "/data/_test/pilots/running", {
      count: 4,
      started_days_ago: 0,
      by: WALKER,
    });
    // One started a week ago, so its weekly check-in is owed today (Home's "Pilot" row, PI5).
    await kit.socket.ask("POST", "/data/_test/pilots/running", {
      count: 1,
      started_days_ago: 7,
      by: WALKER,
    });
    await page.goto(`${kit.base}/data/waitlist/pilots`, { waitUntil: "networkidle" });
    const line = page.locator(".hqdata-pilots__line");
    const lineText = flat(await line.innerText());
    const tone = (await line.getAttribute("class")) ?? "";
    const seventh = await kit.socket.ask("POST", "/data/pilots", {
      entry_id: WALK_ENTRIES.customer,
      starts_on: plus(today, 7),
      ends_on: plus(today, 37),
      criteria: [{ what: "Reports are read every Monday", target: "Four Mondays in a row" }],
      owners: { sponsor: "Walk Sponsor", technical: "Walk Engineer", user: "Walk Analyst" },
      free: true,
      by: WALKER,
      attempt: crypto.randomUUID(),
    });
    kit.check(
      "pilots PI4: six running reads as a sentence in the attention tone, and a seventh is accepted",
      lineText === LINE(6) && tone.includes("attention") && seventh.status === 200,
      `${lineText} · ${tone} · ${seventh.status}`,
    );

    // ---------------------------------------------------------------- PI5: go/no-go tomorrow
    await page.goto(`${kit.base}/data/waitlist/pilots/${WALK_PILOT}`, { waitUntil: "networkidle" });
    await page.locator(".rhead summary", { hasText: /^Edit$/ }).click();
    const edit = page.locator(".rhead form.hqdata-pilot-form");
    await edit.locator('input[name="go_no_go_on"]').fill(plus(today, 1));
    await edit.locator("button", { hasText: "Save the pilot" }).click();
    await until(page, async () => (await pilotOf(kit))?.go_no_go_on === plus(today, 1));
    firm = (await pilotOf(kit))?.firm ?? "";
    await page.goto(`${kit.base}/data`, { waitUntil: "networkidle" });
    const due = flat(await page.locator('[data-section="data-due"]').innerText());
    await page.goto(`${kit.base}/home`, { waitUntil: "networkidle" });
    const owed = (await page.locator(".owed__row .owed__kind").allInnerTexts()).map((kind) =>
      kind.trim().toLowerCase(),
    );
    kit.check(
      "pilots PI5: a go/no-go of tomorrow is in Data's Due, and Home has an owed row Pilot",
      due.includes(`Go or no-go: ${firm}`) && owed.includes("pilot"),
      `${due.slice(0, 200)} · ${owed.join(",")}`,
    );

    // ---------------------------------------------------------------- PI6: Go, converting
    await page.goto(`${kit.base}/data/waitlist/pilots/${WALK_PILOT}`, { waitUntil: "networkidle" });
    await page.locator(".rhead summary", { hasText: "Record the decision" }).click();
    const decide = page.locator(".hqdata-decision-form");
    await decide.locator('select[name="outcome"]').selectOption("go");
    await decide.locator('input[name="on"]').fill(today);
    await decide.locator('input[name="converts_on"]').fill(plus(today, 5));
    await decide.locator("button", { hasText: "Record it" }).click();
    await until(page, async () => (await pilotOf(kit))?.state === "decided");
    const rows = ((await kit.socket.ask("GET", "/data/overview")).body.due ?? []) as {
      key: string;
      title: string;
    }[];
    const mine = rows.filter((row) => row.key.startsWith(`pilot:${WALK_PILOT}:`));
    kit.check(
      "pilots PI6: Go with a conversion day turns the Due row into Convert {firm} to paid",
      mine.map((row) => row.title).join("|") === `Convert ${firm} to paid`,
      mine,
    );
  }

  // ---------------------------------------------------------------- every pass: the two pages
  await page.goto(`${kit.base}/data/waitlist/pilots`, { waitUntil: "networkidle" });
  if (!(await shown(page, kit, "#table-pilots"))) return;
  const list = (await kit.socket.ask("GET", "/data/pilots")).body as {
    running_line?: string;
    counts?: { all: number };
  };
  let text = flat(await kit.text());
  kit.check(
    "pilots: the list shows the service's running line and every pilot",
    text.includes(list.running_line ?? "?") &&
      (await page.locator("#table-pilots tbody tr").count()) === list.counts?.all,
    `${list.running_line} · ${list.counts?.all}`,
  );
  kit.check("pilots PI7: no per cent sign and no benchmark figure on the list", NO_FIGURES(text));
  await kit.audit("pilots");

  await page.goto(`${kit.base}/data/waitlist/pilots/${WALK_PILOT}`, { waitUntil: "networkidle" });
  if (!(await shown(page, kit, '[data-section="pilot-criteria"]'))) return;
  text = flat(await kit.text());
  kit.check(
    "pilots: the pilot's page has its criteria, owners, price and check-ins",
    ["Success criteria", "Owners at", "Price and conversion", "Check-ins", "Half upfront"].every(
      (words) => text.includes(words),
    ),
    text.slice(0, 240),
  );
  kit.check("pilots PI7: no per cent sign and no benchmark figure on the pilot", NO_FIGURES(text));
  await kit.audit("pilot");

  // The waitlist firm that moved to Pilot before pilots had a record is asked for one.
  await page.goto(`${kit.base}/data/waitlist/${WALK_ENTRIES.pilot}`, { waitUntil: "networkidle" });
  if (await shown(page, kit, '[data-section="waitlist-pilot"]')) {
    const section = flat(await page.locator('[data-section="waitlist-pilot"]').innerText());
    kit.check(
      "pilots: a firm moved to Pilot before this batch is asked for its criteria and owners",
      section.includes(
        "This firm moved to Pilot before pilots had their own record. Write its criteria and owners.",
      ),
      section.slice(0, 200),
    );
  }

  // ---------------------------------------------------------------- PI8: the intern
  if (kit.pass.first) {
    const browser = page.context().browser();
    if (browser) {
      const other = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      const intern = await other.newPage();
      await intern.goto(
        `${kit.base}/dev/signin?as=intern%40hq.test&next=${encodeURIComponent("/data/waitlist/pilots")}`,
        { waitUntil: "networkidle" },
      );
      await intern.goto(`${kit.base}/data/waitlist/pilots`, { waitUntil: "networkidle" });
      const body = await intern.locator("main").first().innerText();
      kit.check(
        "pilots PI8: the intern sees “Data is for Owners and Admins.” and no address",
        body.includes("Data is for Owners and Admins.") &&
          !body.includes("@") &&
          (await intern.locator("#table-pilots").count()) === 0,
        body.slice(0, 160),
      );
      await other.close();
    } else kit.check("pilots PI8: a second browser context", false);
  }
}
