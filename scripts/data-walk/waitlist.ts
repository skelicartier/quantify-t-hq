/**
 * The waitlist, walked (spec §5.1 W1–W8, R1 end to end, O2–O4), and Data on Home and in
 * the palette. A yes recorded on Replies puts its firm at Joined with the proof; the firm's
 * unsent colleagues are held back only when the button is pressed, go onto Mail merge's
 * own stop list, are skipped by a mailing, and come off again on release, exactly them. The
 * investor page and its CSV carry no address and no long number. Every person is invented,
 * on `.example` domains, from the stand-in's lists and lead files.
 */

import { createHash } from "node:crypto";
import { request } from "node:http";

import AxeBuilder from "@axe-core/playwright";
import type { Page } from "playwright";

import { inventedLead } from "../data/leads/walk-seed";
import {
  WALK_ENTRIES,
  WALK_FIRMS,
  WALK_OVERDUE_FOLLOW_UP,
  oldWaitlistText,
} from "../data/waitlist/walk-seed";
import { WALKER, type Shot, type WalkKit } from "./kit";

const leadIdOf = (email: string): string =>
  createHash("sha256").update(`lead:${email}`).digest("hex").slice(0, 32);

export const shots: Shot[] = [
  { name: "data-waitlist", path: "/data/waitlist", ready: "#table-waitlist" },
  { name: "data-waitlist-by-stage", path: "/data/waitlist?view=stage", ready: ".hqdata-stages" },
  {
    name: "data-waitlist-firm",
    path: `/data/waitlist/${WALK_ENTRIES.firm}`,
    ready: "#waitlist-people",
  },
  {
    name: "data-waitlist-hold",
    path: `/data/waitlist/${WALK_ENTRIES.firm}?hold=1`,
    ready: ".hqdata-hold",
  },
  {
    name: "data-waitlist-free-mail",
    path: `/data/waitlist/${WALK_ENTRIES.freeMail}`,
    ready: "#waitlist-people",
  },
  {
    name: "data-waitlist-pilot",
    path: `/data/waitlist/${WALK_ENTRIES.pilot}`,
    ready: "#waitlist-activity",
  },
  {
    name: "data-waitlist-investors",
    path: "/data/waitlist/for-investors",
    ready: "#table-waitlist-for-investors",
  },
];

type Body = Record<string, unknown>;

function ask(
  socket: string,
  method: "GET" | "POST",
  path: string,
  body?: unknown,
): Promise<{ status: number; body: Body }> {
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

const pad = (value: number) => String(value).padStart(2, "0");

/** A calendar date plus whole days, with no zone involved. */
function addDays(day: string, count: number): string {
  const [year = 0, month = 1, date = 1] = day.split("-").map(Number);
  const moved = new Date(Date.UTC(year, month - 1, date + count));
  return `${moved.getUTCFullYear()}-${pad(moved.getUTCMonth() + 1)}-${pad(moved.getUTCDate())}`;
}

/**
 * Five firms with fixed ids (yeses recorded through Replies, as a person would), moved
 * through their stages; one next step made overdue; one follow-up overdue. Run once, by the
 * stand-in, after Replies' own seed.
 */
export async function seed(socketPath: string): Promise<void> {
  const day = String((await ask(socketPath, "GET", "/data/_test/day")).body.day ?? "");
  const now = Date.now();
  for (const firm of WALK_FIRMS) {
    if ((await ask(socketPath, "GET", `/data/waitlist/${firm.entry_id}`)).status === 200) continue;
    await ask(socketPath, "POST", "/data/_test/waitlist/pin", {
      by: WALKER,
      entry_id: firm.entry_id,
    });
    const recorded = await ask(socketPath, "POST", "/data/replies", {
      by: WALKER,
      email: firm.email,
      outcome: "replied_positive",
      words: firm.words,
      subject: firm.subject,
      received_at: new Date(now - firm.hours_ago * 3_600_000).toISOString(),
      add_if_missing: false,
    });
    if (recorded.status !== 200) {
      console.error(`[walk] the waitlist seed could not record a yes (${recorded.status})`);
      continue;
    }
    for (const move of firm.moves)
      await ask(socketPath, "POST", `/data/waitlist/${firm.entry_id}/stage`, {
        by: WALKER,
        stage: move.stage,
        ...(move.next_step
          ? { next_step: move.next_step, next_step_on: addDays(day, move.next_in ?? 1) }
          : {}),
        ...(move.call_in_days !== undefined
          ? { call_at: new Date(now + move.call_in_days * 86_400_000).toISOString() }
          : {}),
        ...(move.pilot
          ? {
              pilot: {
                starts_on: addDays(day, move.pilot.starts_in),
                ends_on: addDays(day, move.pilot.ends_in),
                success: move.pilot.success,
              },
            }
          : {}),
        ...(move.reason
          ? {
              dropped: {
                reason: move.reason,
                look_again_on: move.look_again_in ? addDays(day, move.look_again_in) : "",
              },
            }
          : {}),
      });
    if (firm.naming)
      await ask(socketPath, "POST", `/data/waitlist/${firm.entry_id}/update`, {
        by: WALKER,
        field: "naming",
        value: firm.naming,
      });
    if (firm.overdue_by)
      await ask(socketPath, "POST", "/data/_test/waitlist/set", {
        by: WALKER,
        entry_id: firm.entry_id,
        next_step_on: addDays(day, -firm.overdue_by),
      });
  }
  await ask(socketPath, "POST", "/data/follow-ups", {
    by: WALKER,
    attempt: "0a17e000-0000-4000-8000-0000000000f1",
    email: WALK_OVERDUE_FOLLOW_UP.email,
    title: WALK_OVERDUE_FOLLOW_UP.title,
    due_on: addDays(day, -2),
  });
}

const flat = (text: string) => text.replace(/\s+/g, " ").trim();

/** One invented lead from the stand-in's lead files, by index. */
function person(index: number) {
  const row = inventedLead(index);
  return {
    email: row[0]!,
    name: row[3]!,
    title: row[4]!,
    firm: row[5]!,
    firmType: row[6]!,
    city: row[9]!,
    domain: row[0]!.split("@")[1]!,
  };
}

async function lead(kit: WalkKit, email: string): Promise<Body> {
  return ((await kit.socket.ask("GET", `/data/leads/${leadIdOf(email)}`)).body.lead as Body) ?? {};
}

async function entry(kit: WalkKit, entryId: string): Promise<Body> {
  return (await kit.socket.ask("GET", `/data/waitlist/${entryId}`)).body;
}

async function until(
  condition: () => Promise<boolean>,
  page: Page,
  timeoutMs = 20_000,
): Promise<boolean> {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    if (await condition()) return true;
    await page.waitForTimeout(250);
  }
  return false;
}

/** The sentence a form says after a press. */
async function said(page: Page, within: string): Promise<string> {
  const line = page.locator(`${within} .form-sent, ${within} .callout--danger`).first();
  await line.waitFor({ timeout: 20_000 });
  return flat(await line.innerText());
}

/**
 * Home is not a Data page: it also carries the mock service's own records, whose words are
 * not Data's to answer for. So its check is the layout one only: no overflow, axe clean.
 */
async function auditHome(page: Page, kit: WalkKit, name: string): Promise<void> {
  await page.evaluate(() => window.scrollTo(0, 0));
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  const axe = await new AxeBuilder({ page }).analyze();
  const bad = axe.violations.filter(
    (violation) => violation.impact === "serious" || violation.impact === "critical",
  );
  kit.check(
    `${name}: no overflow, axe clean`,
    overflow <= 1 && bad.length === 0,
    `${overflow}px ${bad.map((violation) => `${violation.id}(${violation.nodes.length})`).join(" ")}`,
  );
  await page.screenshot({
    path: `test-results/data/${kit.pass.width}-${kit.pass.theme}-${name}.png`,
    fullPage: true,
  });
}

export async function walk(page: Page, kit: WalkKit): Promise<void> {
  const pass = (kit.pass.width === "phone" ? 2 : 0) + (kit.pass.theme === "light" ? 1 : 0);
  const day = String((await kit.socket.ask("GET", "/data/_test/day")).body.day ?? "");
  // Walk Capital 3000 + pass: sixteen people on file, none of them ever written to.
  const yes = person(3000 + pass);
  const firmName = yes.firm;

  // ---------------------------------------------------------------- the list, as seeded
  await page.goto(`${kit.base}/data/waitlist`, { waitUntil: "networkidle" });
  await page.waitForSelector("#table-waitlist", { timeout: 30_000 });
  let text = flat(await kit.text());
  kit.check(
    "waitlist: the list shows the seeded firms with their stages and the tabs",
    text.includes("Walk Capital 2000") &&
      text.includes("Walk Fund 8") &&
      /All \d+/.test(text) &&
      text.includes("Customer 1") &&
      text.includes("By stage") &&
      !text.includes("design partner"),
    text.slice(0, 300),
  );
  await kit.audit("waitlist");
  await page.goto(`${kit.base}/data/waitlist?view=stage`, { waitUntil: "networkidle" });
  text = flat(await kit.text());
  kit.check(
    "waitlist: By stage groups the firms under each stage, as counts in words",
    (await page.locator(".hqdata-stages .rsection").count()) === 6 &&
      text.includes("Pilot · 1") &&
      text.includes("Dropped · 1"),
    text.slice(0, 300),
  );
  await kit.audit("waitlist-by-stage");

  // ---------------------------------------------------------------- R1 and O3: a yes on Replies
  const before = (await kit.socket.ask("GET", "/data/overview")).body.replies as
    { yes_today?: number } | undefined;
  const words = `Yes, add us. Our analysts would like to see it first. (${pass + 1})`;
  const subject = `Re: Quantify for ${firmName}`;
  await page.goto(`${kit.base}/data/replies`, { waitUntil: "networkidle" });
  const form = page.locator(".hqdata-reply-form form");
  await form.locator('input[name="email"]').first().fill(yes.email);
  await form.locator('textarea[name="words"]').fill(words);
  await form.locator('input[name="subject"]').fill(subject);
  await form.getByRole("button", { name: "Record a yes: add the firm to the waitlist" }).click();
  const yesSaid = await said(page, ".hqdata-reply-form");
  kit.check(
    "R1: a Yes on Replies says the firm is on the waitlist and counts its unsent addresses",
    yesSaid ===
      `Recorded: ${yes.name} said yes. ${firmName} is on the waitlist. 15 other addresses at ${yes.domain} have not been written to yet: see them on the firm's page.`,
    yesSaid,
  );
  const reply = (((await lead(kit, yes.email)).replies as Body[] | undefined) ?? [])[0] ?? {};
  const joined = ((reply.effects as Body[] | undefined) ?? []).find(
    (effect) => effect.kind === "waitlist_joined",
  );
  const entryId = String(joined?.entry_id ?? "");
  const detail = await entry(kit, entryId);
  const stored = (detail.entry ?? {}) as Body;
  const proof = (stored.proof ?? {}) as Body;
  kit.check(
    "R1: the firm is at Joined with the quote, the subject and the received time",
    stored.stage === "joined" &&
      proof.quote === words &&
      proof.subject === subject &&
      proof.received_at === reply.received_at &&
      proof.reply_id === reply.reply_id,
    stored,
  );
  await page.locator(".hqdata-reply-form__link a", { hasText: "See the firm's page" }).click();
  await page.waitForSelector("#waitlist-people", { timeout: 30_000 });
  text = flat(await kit.text());
  kit.check(
    "R1: the firm's page shows Joined and the proof of the yes",
    text.includes(firmName) &&
      text.includes("Joined") &&
      text.includes(words) &&
      text.includes(`Subject “${subject}”`) &&
      text.includes("Received") &&
      text.includes(`From ${yes.email}`),
    text.slice(0, 400),
  );
  const leadText = async (email: string) => {
    await page.goto(`${kit.base}/data/leads/${leadIdOf(email)}`, { waitUntil: "networkidle" });
    return flat(await kit.text());
  };
  text = await leadText(yes.email);
  kit.check(
    "R1: the lead reads Said yes, and On the waitlist",
    text.includes("Said yes") && text.includes(`On the waitlist: ${firmName} · Joined.`),
    text.slice(0, 300),
  );
  const after = (await kit.socket.ask("GET", "/data/overview")).body.replies as
    { yes_today?: number } | undefined;
  await page.goto(`${kit.base}/data`, { waitUntil: "networkidle" });
  await page.waitForSelector(".hqdata-due", { timeout: 30_000 });
  text = flat(await kit.text());
  kit.check(
    "O3: after a Yes, Yes today goes up by one and the reply is in Latest replies",
    (after?.yes_today ?? -1) === (before?.yes_today ?? 0) + 1 &&
      new RegExp(`Yes today ${after?.yes_today ?? -1}\\b`, "i").test(text) &&
      (await page.locator("#table-latest-replies").innerText()).includes(yes.name),
    text.slice(0, 300),
  );

  // ---------------------------------------------------------------- O2 and O4 on the overview
  const overview = (await kit.socket.ask("GET", "/data/overview")).body;
  const followUps = overview.follow_ups as { due: number; overdue: number };
  const tile = page.locator(".stat", { hasText: /Follow-ups due/i });
  kit.check(
    "O2: Follow-ups due turns danger when one is overdue, and its hint says how many",
    followUps.overdue >= 1 &&
      (await tile.getAttribute("class"))?.includes("stat--danger") === true &&
      flat(await tile.innerText())
        .toLowerCase()
        .includes(`${followUps.overdue} overdue`),
    await tile.innerText(),
  );
  const chips = await page.locator(".hqdata-due__row .hqdata-due__when").allInnerTexts();
  const firstToday = chips.findIndex((chip) => chip.trim() === "Today");
  const lastOverdue = chips.map((chip) => chip.startsWith("Overdue")).lastIndexOf(true);
  const hrefs = await page
    .locator(".hqdata-due__row .hqdata-due__what a")
    .evaluateAll((links) => links.map((link) => link.getAttribute("href") ?? ""));
  let linksOpen = hrefs.length > 0;
  for (const href of hrefs.slice(0, 8)) {
    const answer = await page.request.get(`${kit.base}${href}`);
    if (answer.status() !== 200 || !href.startsWith("/data/")) linksOpen = false;
  }
  kit.check(
    "O4: Due lists overdue items before today's, each linking to its record",
    lastOverdue >= 0 && firstToday > lastOverdue && linksOpen,
    chips.join(" | ").slice(0, 200),
  );
  kit.check(
    "O4: a waitlist next step is in Due, and the overview's Waitlist line counts the stages",
    ((overview.due as Body[]) ?? []).some((item) => item.kind === "waitlist") &&
      /Joined \d+ · Call booked \d+ · Call held \d+ · Pilot \d+ · Customer \d+ · Dropped \d+/.test(
        text,
      ),
    text.slice(-300),
  );

  // ---------------------------------------------------------------- W3: colleagues
  const atFirm = Number(
    (await kit.socket.ask("GET", `/data/leads?domain=${encodeURIComponent(yes.domain)}`)).body
      .total ?? -1,
  );
  await page.goto(`${kit.base}/data/waitlist/${entryId}`, { waitUntil: "networkidle" });
  const rows = page.locator("#table-colleagues tbody tr");
  kit.check(
    "W3: Colleagues lists every lead at the domain, each with its status",
    atFirm === 16 &&
      (await rows.count()) === atFirm &&
      (await page.locator("#table-colleagues tbody tr .pill").count()) === atFirm,
    `${atFirm} ${await rows.count()}`,
  );
  await kit.audit("waitlist-firm");
  await page.goto(`${kit.base}/data/waitlist/${WALK_ENTRIES.freeMail}`, {
    waitUntil: "networkidle",
  });
  text = flat(await kit.text());
  kit.check(
    "W3: a free-mail firm says it is not grouped",
    text.includes("Free-mail addresses are not grouped by firm; add colleagues by hand."),
    text.slice(0, 300),
  );
  await kit.audit("waitlist-free-mail");

  // ---------------------------------------------------------------- W4: hold back, and release
  const colleagues = Array.from({ length: 15 }, (_, k) => person(3000 + pass + 4000 * (k + 1)));
  const listName = `Walk hold check ${pass + 1}`;
  const listCsv = [
    "Email,First Name,Company",
    ...colleagues.slice(0, 3).map((item) => `${item.email},${item.name.split(" ")[0]},${firmName}`),
  ].join("\n");
  const imported = await kit.socket.ask("POST", "/lists/import", {
    name: listName,
    file_name: `walk-hold-${pass + 1}.csv`,
    text: `${listCsv}\n`,
  });
  const listId = String((imported.body.list as Body | undefined)?.id ?? "");
  // One colleague asked to stop by hand before any hold: not offered, and never taken off.
  const stoppedByHand = colleagues[14]!;
  await kit.socket.ask("POST", "/stops/add", { emails: stoppedByHand.email, reason: "asked" });
  const nothingYet = await Promise.all(
    colleagues.slice(0, 14).map(async (item) => (await lead(kit, item.email)).stop === null),
  );
  kit.check(
    "W4: nothing is held because a yes arrived",
    nothingYet.every(Boolean),
    nothingYet.filter((free) => !free).length,
  );
  const listed = await until(async () => {
    const preview = (await kit.socket.ask("GET", `/data/waitlist/${entryId}/hold-preview`)).body;
    const candidates = (preview.candidates as { email: string; lists: string[] }[]) ?? [];
    return candidates.length === 14 && candidates.some((item) => item.lists.includes(listName));
  }, page);
  kit.check("W4: the preview sees the new Mail merge list", listed);
  await page.goto(`${kit.base}/data/waitlist/${entryId}`, { waitUntil: "networkidle" });
  await page.locator("a", { hasText: "Show the unsent addresses" }).click();
  await page.waitForSelector(".hqdata-hold", { timeout: 30_000 });
  const boxes = page.locator('.hqdata-hold input[type="checkbox"]');
  text = flat(await page.locator(".hqdata-hold").innerText());
  kit.check(
    "W4: the preview ticks every unsent address, with its lists, and warns about a large firm",
    (await boxes.count()) === 14 &&
      (await page.locator('.hqdata-hold input[type="checkbox"]:checked').count()) === 14 &&
      text.includes(`${colleagues[0]!.email} · `) &&
      text.includes(`· On “${listName}”`) &&
      text.includes("· On no Mail merge list") &&
      text.includes("This firm has 16 addresses on file.") &&
      !text.includes(stoppedByHand.email),
    text.slice(0, 300),
  );
  await kit.audit("waitlist-hold-preview");
  // Leave one out: only the ticked go.
  const leftOut = colleagues[13]!;
  await page.locator(`.hqdata-hold input[value="${leftOut.email}"]`).uncheck();
  await page.getByRole("button", { name: "Hold back these 13" }).click();
  const heldSaid = await said(page, ".hqdata-hold");
  kit.check(
    "W4: Hold back these 13 holds them back on the stop list",
    heldSaid === "Held back 13. They are on the stop list as “Firm already joined”.",
    heldSaid,
  );
  const held = colleagues.slice(0, 13);
  const stops = await Promise.all(held.map(async (item) => (await lead(kit, item.email)) as Body));
  kit.check(
    "W4: those addresses are on Mail merge's stop list and read Held back: firm already joined",
    stops.every(
      (item) =>
        (item.stop as Body | null)?.reason === "manual" &&
        item.status === "held_back" &&
        item.status_detail === "Firm already joined",
    ) && (await lead(kit, leftOut.email)).stop === null,
    stops.map((item) => item.status).join(" "),
  );
  text = await leadText(held[0]!.email);
  kit.check(
    "W4: the lead says Held back: firm already joined, with the way to release it",
    text.includes(`Held back: firm already joined (${firmName} said yes on`) &&
      text.includes("Release it on the firm’s page"),
    text.slice(0, 300),
  );
  const mailing = await kit.socket.ask("POST", "/mailings", {
    name: `Walk hold check ${pass + 1}`,
  });
  const mailingId = String((mailing.body.mailing as Body | undefined)?.id ?? "");
  await kit.socket.ask("POST", `/mailings/${mailingId}/update`, { list_ids: [listId] });
  const skipped =
    ((
      await kit.socket.ask(
        "GET",
        `/mailings/${mailingId}/people?q=${encodeURIComponent(held[0]!.email)}`,
      )
    ).body.rows as { kind: string; reason: string }[]) ?? [];
  kit.check(
    "W4: a mailing skips a held address, On the stop list",
    skipped[0]?.kind === "stopped" && skipped[0].reason === "On the stop list",
    skipped[0],
  );
  // Release one, then the rest: exactly the hold's addresses come off.
  await page.goto(`${kit.base}/data/waitlist/${entryId}`, { waitUntil: "networkidle" });
  await kit.audit("waitlist-held");
  // The row's own sentence goes with its button once the page shows it released, so the
  // walk reads the stop list and the page's record of the release instead.
  const one = held[0]!;
  await page.getByRole("button", { name: `Release ${one.email}` }).click();
  const oneOff = await until(async () => (await lead(kit, one.email)).stop === null, page);
  // A fresh load, not a jump to the same address with its anchor (which would not reload).
  await page.goto(`${kit.base}/data/waitlist/${entryId}`, { waitUntil: "networkidle" });
  const holdsText = flat(await page.locator(".hqdata-holds").innerText());
  const secondStop = ((await lead(kit, held[1]!.email)).stop as Body | null)?.reason;
  kit.check(
    "W4: releasing one address takes only it off the stop list, and the page says so",
    oneOff && secondStop === "manual" && holdsText.includes("Released by"),
    { oneOff, secondStop, holds: holdsText.slice(0, 160) },
  );
  await page.getByRole("button", { name: "Release all 12" }).click();
  await until(
    async () =>
      (await Promise.all(held.map(async (item) => (await lead(kit, item.email)).stop))).every(
        (stop) => stop === null,
      ),
    page,
  );
  const freed = await Promise.all(held.map(async (item) => (await lead(kit, item.email)).stop));
  kit.check(
    "W4: Release undoes exactly them; the address stopped by hand stays stopped",
    freed.every((stop) => stop === null) &&
      ((await lead(kit, stoppedByHand.email)).stop as Body | null)?.reason === "asked" &&
      (await lead(kit, held[1]!.email)).status === "not_sent",
    freed.filter(Boolean).length,
  );

  // ---------------------------------------------------------------- W1: the stage rules
  const refusedMove = await kit.socket.ask("POST", `/data/waitlist/${entryId}/stage`, {
    by: WALKER,
    stage: "call_booked",
  });
  const refusedDrop = await kit.socket.ask("POST", `/data/waitlist/${entryId}/stage`, {
    by: WALKER,
    stage: "dropped",
  });
  kit.check(
    "W1: the service refuses a move without a next step and its day, and a drop without a reason",
    (refusedMove.body.error as Body | undefined)?.message ===
      "Moving to Call booked needs a next step and the day it is due by." &&
      (refusedDrop.body.error as Body | undefined)?.code === "needs_reason",
    [refusedMove.body, refusedDrop.body],
  );
  await page.goto(`${kit.base}/data/waitlist/${entryId}`, { waitUntil: "networkidle" });
  await page.locator("summary", { hasText: "Move to a stage" }).click();
  const stageForm = page.locator(".hqdata-stage-form");
  const isRequired = (name: string) =>
    stageForm.locator(`[name="${name}"]`).evaluate((input) => (input as HTMLInputElement).required);
  const needs = {
    call: await isRequired("call_at"),
    next: await isRequired("next_step"),
    by: await isRequired("next_step_on"),
  };
  await stageForm.locator('select[name="stage"]').selectOption("customer");
  const customerNeeds = (await isRequired("next_step")) || (await isRequired("next_step_on"));
  await stageForm.locator('select[name="stage"]').selectOption("dropped");
  const dropNeeds = await isRequired("reason");
  kit.check(
    "W1: the form asks a next step and a date, except for Customer; Dropped asks why",
    needs.call && needs.next && needs.by && !customerNeeds && dropNeeds,
    { needs, customerNeeds, dropNeeds },
  );
  await kit.audit("waitlist-move-open");
  await stageForm.locator('select[name="stage"]').selectOption("call_booked");
  const tomorrow = addDays(day, 1);
  await stageForm.locator('input[name="call_at"]').fill(`${tomorrow}T11:00`);
  await stageForm.locator('input[name="next_step"]').fill("Hold the first call");
  await stageForm.locator('input[name="next_step_on"]').fill(tomorrow);
  await stageForm.getByRole("button", { name: "Move it" }).click();
  const movedSaid = await said(page, ".hqdata-stage-form");
  const movedEntry = (await entry(kit, entryId)).entry as Body;
  await page.reload({ waitUntil: "networkidle" });
  text = flat(await kit.text());
  kit.check(
    "W1: a move with its next step goes, and is an event on the timeline",
    movedSaid === `Moved ${firmName} to Call booked.` &&
      movedEntry.stage === "call_booked" &&
      movedEntry.next_step_on === tomorrow &&
      text.includes("Joined → Call booked"),
    movedSaid,
  );

  // ---------------------------------------------------------------- W5 and W7: for investors
  await page.goto(`${kit.base}/data/waitlist/for-investors`, { waitUntil: "networkidle" });
  await page.waitForSelector("#table-waitlist-for-investors", { timeout: 30_000 });
  const investorText = await page.locator(".hqdata-investors").innerText();
  const described = String(stored.described_as ?? "");
  kit.check(
    "W5: the investor page has no address and no run of 8 digits",
    !investorText.includes("@") && !/\d{8}/.test(investorText),
  );
  kit.check(
    "W5: a firm is named only when Name the firm is chosen; otherwise it is described",
    investorText.includes("Walk Fund 8") &&
      !investorText.includes(firmName) &&
      !investorText.includes("Walk Capital 2000") &&
      described !== "" &&
      investorText.includes(described) &&
      !investorText.includes(words) &&
      !investorText.includes(yes.name),
    described,
  );
  await kit.audit("waitlist-investors");
  const csv = await page.request.get(`${kit.base}/data/waitlist/export?kind=investors`);
  const csvText = await csv.text();
  kit.check(
    "W5: the investor CSV has no address and no run of 8 digits, and carries as_of",
    csv.status() === 200 &&
      (csv.headers()["content-type"] ?? "").startsWith("text/csv") &&
      (csv.headers()["content-disposition"] ?? "").startsWith("attachment;") &&
      csvText.startsWith(
        "\ufeffjoined_on,firm,firm_type,place,contact_role,how_joined,stage,since,proof,as_of",
      ) &&
      !csvText.includes("@") &&
      !/\d{8}/.test(csvText),
    csvText.slice(0, 120),
  );
  const every = await page.request.get(`${kit.base}/data/waitlist/export?kind=every`);
  kit.check(
    "W6: Every field starts with the old twelve columns",
    every.status() === 200 &&
      (await every.text()).startsWith(
        "\ufeffjoined_on,full_name,title,company,firm_type,city,country,email,how_joined,proof,status,notes,stage_since,next_step,next_step_on,colleagues",
      ),
  );
  const investorRows = Number(
    ((await kit.socket.ask("GET", "/data/waitlist/for-investors")).body.rows as unknown[])
      ?.length ?? -1,
  );
  await page.emulateMedia({ media: "print" });
  const printed = {
    letterhead: await page.locator(".print-head").isVisible(),
    asOf: await page.locator(".hqdata-investors__asof").isVisible(),
    definitions: await page.locator(".hqdata-investors__definitions").isVisible(),
    rows: await page.locator("#table-waitlist-for-investors tbody tr:visible").count(),
    buttons: await page.locator("main button:visible").count(),
  };
  await page.emulateMedia({ media: "screen" });
  kit.check(
    "W7: printed, For investors shows the letterhead, As of, the definitions and every row",
    printed.letterhead &&
      printed.asOf &&
      printed.definitions &&
      printed.rows === investorRows &&
      printed.buttons === 0,
    printed,
  );

  // ---------------------------------------------------------------- W8: the old waitlist file
  const already = Number(
    (await kit.socket.ask("GET", `/data/waitlist?q=${encodeURIComponent("Old Walk Fund")}`)).body
      .total ?? 0,
  );
  await page.goto(`${kit.base}/data/waitlist`, { waitUntil: "networkidle" });
  await page.locator("summary", { hasText: "More" }).click();
  await page.locator('input[name="file"]').setInputFiles({
    name: "waitlist.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(oldWaitlistText(3), "utf8"),
  });
  await page.getByRole("button", { name: "Bring it in" }).click();
  const importSaid = await said(page, ".hqdata-waitlist-more");
  kit.check(
    "W8: the old waitlist file adds its firms once; again, it adds none",
    already === 0
      ? importSaid === "3 firms added; 0 already here."
      : importSaid === "0 firms added; 3 already here.",
    importSaid,
  );

  // ---------------------------------------------------------------- the palette
  await page.goto(`${kit.base}/data`, { waitUntil: "networkidle" });
  // ⌘K listens once the page has hydrated: press until the palette opens.
  const palette = page.locator("dialog[open]");
  for (let tries = 0; tries < 10 && !(await palette.isVisible()); tries += 1) {
    await page.keyboard.press(process.platform === "darwin" ? "Meta+k" : "Control+k");
    await palette.waitFor({ timeout: 1_000 }).catch(() => undefined);
  }
  const paletteText = flat(await palette.innerText());
  kit.check(
    "palette: Create offers Record a reply and Add files",
    paletteText.includes("Record a reply") && paletteText.includes("Add files"),
    paletteText.slice(0, 200),
  );
  await page.keyboard.press("Escape");

  // ---------------------------------------------------------------- Home
  await page.goto(`${kit.base}/home`, { waitUntil: "networkidle" });
  const block = page.locator(".hqdata-home");
  const blockText = flat(await block.innerText());
  const owedKinds = await page.locator(".owed__row .owed__kind").allInnerTexts();
  const mailText = flat(
    await page.locator(".briefing__block", { has: page.locator("#mail-title") }).innerText(),
  );
  const sentToday = Number(overview.sent_today ?? -1);
  const merge = (await kit.socket.ask("GET", "/status")).body as {
    sent_today?: number;
    settings?: { daily_cap?: number };
  };
  kit.check(
    "Home: the Data block has the day's figures, the next Due rows and Open Data",
    blockText.includes(`Sent today ${sentToday.toLocaleString("en-GB")}`) &&
      blockText.includes("Replies today") &&
      blockText.includes("Follow-ups due") &&
      blockText.includes("Open Data") &&
      (await block.locator(".agenda__row").count()) === 3,
    blockText,
  );
  kit.check(
    "Home: overdue follow-ups and waitlist next steps are owed rows",
    owedKinds.some((kind) => /follow-up/i.test(kind)) &&
      owedKinds.some((kind) => /waitlist/i.test(kind)),
    owedKinds.join(" "),
  );
  kit.check(
    "Home: the Mail block shows Mail merge's real figures",
    /sent today(, tests included)?\. (Nothing is sending|Sending “)/.test(mailText) &&
      mailText.includes(
        `${(merge.sent_today ?? -1).toLocaleString("en-GB")} of ${(merge.settings?.daily_cap ?? -1).toLocaleString("en-GB")} sent today`,
      ) &&
      (merge.sent_today === sentToday) === !mailText.includes("tests included"),
    mailText,
  );
  await auditHome(page, kit, "home");
  if (kit.pass.theme === "dark") {
    // The service away: the Data block is one sentence, and Home still draws.
    await kit.socket.ask("POST", "/data/_test/offline", { seconds: 8 });
    await page.waitForTimeout(800);
    await page.goto(`${kit.base}/home`, { waitUntil: "networkidle" });
    const downText = flat(await page.locator(".hqdata-home").innerText());
    const downMail = flat(
      await page.locator(".briefing__block", { has: page.locator("#mail-title") }).innerText(),
    );
    kit.check(
      "Home: with the service down the Data block says Data is not answering, and Home draws",
      downText === "Data Data is not answering." &&
        downMail.includes("Mail merge is not answering.") &&
        (await page.locator("h1", { hasText: "Today" }).count()) === 1,
      `${downText} | ${downMail}`,
    );
    await auditHome(page, kit, "home-down");
    await kit.socket.waitReady(30_000);
  }
}
