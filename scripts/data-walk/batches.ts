/**
 * Waitlist › Batches and the overview's "Delivery, last 7 days", walked against the
 * stand-in (delivery spec §7.10, B1–B8): the "Walk live 01" row with what the provider's
 * events say happened to its 290 sends (B1), every number on it equal to the service's
 * (B2), the people who replied and the firms that joined, each ratio out of the stage
 * before (B3), the total and "Not from a batch" (B4), the replies by outcome (B5), no per
 * cent sign and the link to the mailing (B6), and the overview's block with the complaint
 * warning (B7). Every person is invented, on `.example`.
 *
 * In this copy delivery comes from a stand-in feed installed under a test route; in the
 * merged copy Mail merge's own read-back is there and the route declines. Both count the
 * stand-in provider's own event mix, so every delivery number here is the same in both,
 * and nothing here looks at the stop list.
 */

import { createHash } from "node:crypto";
import { request } from "node:http";

import type { Page } from "playwright";

import { WALKER, type Shot, type WalkKit } from "./kit";

export const shots: Shot[] = [
  { name: "data-batches", path: "/data/waitlist/batches", ready: ".hqdata-batches" },
];

const MAILING = "Walk live 01";
const OUTCOME_LABELS = [
  "Interested",
  "Meeting request",
  "Not interested",
  "Not now",
  "Out of office",
  "Wrong person",
  "Question",
  "Needs review",
];
const TWICE = "A person who answered twice counts under each answer";

const leadIdOf = (email: string): string =>
  createHash("sha256").update(`lead:${email}`).digest("hex").slice(0, 32);
const person = (n: number) => `partner${n}@fund${n}.example`;

/** Who answered the live mailing, and how: people it wrote to, none of whom another walk names. */
const REPLIES: { email: string; outcome: string; words: string }[] = [
  { email: person(191), outcome: "replied_positive", words: "Yes, this is of interest to us." },
  { email: person(192), outcome: "meeting_request", words: "Could we speak next week?" },
  { email: person(193), outcome: "not_interested", words: "Not for us, thank you." },
  { email: person(194), outcome: "out_of_office", words: "I am away until the end of the month." },
  { email: person(195), outcome: "question", words: "Does it cover unlisted companies?" },
  { email: person(196), outcome: "replied_positive", words: "Please tell me more." },
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

const addDays = (day: string, count: number): string => {
  const at = new Date(`${day}T00:00:00.000Z`);
  at.setUTCDate(at.getUTCDate() + count);
  return at.toISOString().slice(0, 10);
};

/**
 * The stand-in feed of delivery (declined where the real one is loaded), six replies to the
 * live mailing, and two of the firms that said yes moved along the waitlist: fund 191 to a
 * held call, fund 196 to a booked call. (The pilot B3 counts is the waitlist walk's own.)
 */
export async function seed(socketPath: string): Promise<void> {
  if ((await ask(socketPath, "GET", "/data/batches")).status !== 200) {
    console.log("[walk] batches: the batches module is not loaded here");
    return;
  }
  const feed = await ask(socketPath, "POST", "/data/_test/batches/delivery", { by: WALKER });
  console.log(`[walk] batches: delivery ${JSON.stringify(feed.body)}`);
  const day = String((await ask(socketPath, "GET", "/data/_test/day")).body.day ?? "");
  let recorded = 0;
  for (const reply of REPLIES) {
    const lead = (await ask(socketPath, "GET", `/data/leads/${leadIdOf(reply.email)}`)).body
      .lead as { replies?: unknown[] } | undefined;
    if (!lead || (lead.replies ?? []).length > 0) continue;
    const answer = await ask(socketPath, "POST", "/data/replies", {
      by: WALKER,
      email: reply.email,
      outcome: reply.outcome,
      words: reply.words,
      subject: "Re: A note",
      received_at: new Date().toISOString(),
      add_if_missing: false,
    });
    if (answer.status === 200) recorded += 1;
    else console.error(`[walk] batches: a reply could not be recorded (${answer.status})`);
  }
  const entryOf = async (email: string): Promise<string> => {
    const lead = (await ask(socketPath, "GET", `/data/leads/${leadIdOf(email)}`)).body.lead as
      { waitlist?: { entry_id: string; stage: string } | null } | undefined;
    return lead?.waitlist?.stage === "joined" ? lead.waitlist.entry_id : "";
  };
  const move = (entryId: string, stage: string, extra: Record<string, unknown> = {}) =>
    ask(socketPath, "POST", `/data/waitlist/${entryId}/stage`, {
      by: WALKER,
      stage,
      next_step: "Invented next step for the walk",
      next_step_on: addDays(day, 3),
      ...extra,
    });
  const callAt = new Date(Date.now() + 2 * 86_400_000).toISOString();
  const moved: number[] = [];
  const fund191 = await entryOf(person(191));
  if (fund191) {
    moved.push((await move(fund191, "call_booked", { call_at: callAt })).status);
    // No further: the waitlist walk pins "Pilot · 1" for its own seeded firm, and B3's pilot is that one.
    moved.push((await move(fund191, "call_held")).status);
  }
  const fund196 = await entryOf(person(196));
  if (fund196) moved.push((await move(fund196, "call_booked", { call_at: callAt })).status);

  // Tidy, as the replies walk does: Due shows its first 30 rows and the dates and investors
  // walks look for their own rows there, so fund 192's "Reply and offer call times" moves a
  // month out and the question's "Answer …" follow-up is done. The funnel counts neither.
  const fund192 = await entryOf(person(192));
  if (fund192)
    await ask(socketPath, "POST", "/data/_test/waitlist/set", {
      entry_id: fund192,
      next_step_on: addDays(day, 30),
      by: WALKER,
    });
  const open =
    ((await ask(socketPath, "GET", "/data/follow-ups")).body.follow_ups as
      { follow_up_id: string; email: string; state: string }[] | undefined) ?? [];
  for (const item of open)
    if (item.email === person(195) && item.state === "open")
      await ask(socketPath, "POST", `/data/follow-ups/${item.follow_up_id}/done`, {
        note: "Done in the walk.",
        by: WALKER,
      });
  console.log(`[walk] batches: ${recorded} replies recorded, stage moves ${moved.join(" ")}`);
}

const flat = (text: string) => text.replace(/\s+/g, " ").trim();
const number = (value: number) => value.toLocaleString("en-GB");
const ratio = (part: number, whole: number) =>
  whole > 0 ? `${number(part)} of ${number(whole)}` : number(part);

type Counts = {
  accepted: number;
  delivered: number;
  not_yet: number;
  soft_bounce: number;
  hard_bounce: number;
  blocked: number;
  invalid: number;
  error: number;
  didnt_arrive: number;
  complaint: number;
  unsubscribed: number;
};
type Row = {
  mailing_id: string;
  name: string;
  accepted: number;
  delivery: Counts | null;
  warning: string | null;
  replied: number;
  out_of_office: number;
  yes: number;
  yes_not_on_waitlist: number;
  joined: number;
  calls_booked: number;
  calls_held: number;
  pilots: number;
};
type Batches = {
  funnel: {
    rows: Row[];
    total: Omit<Row, "mailing_id" | "name" | "warning">;
    not_from_a_batch: { replied: number; out_of_office: number; yes: number };
  };
};

const batchesOf = async (kit: WalkKit) =>
  (await kit.socket.ask("GET", "/data/batches")).body as unknown as Batches;

/** A table row's cells as a person reads them, lower case (a pill may be drawn in capitals). */
const cellsOf = (page: Page, selector: string): Promise<string[]> =>
  page.evaluate((query) => {
    const row = document.querySelector(query);
    if (!row) return [];
    return [...row.children].map((cell) =>
      ((cell as HTMLElement).innerText ?? "").replace(/\s+/g, " ").trim().toLowerCase(),
    );
  }, selector);

/** What the page prints for a row's thirteen count cells, from the service's numbers. */
function printed(row: Omit<Row, "mailing_id" | "name" | "warning">, warning: string | null) {
  const d = row.delivery;
  const other = d ? d.blocked + d.invalid + d.error : 0;
  return [
    number(row.accepted),
    d ? `${ratio(d.delivered, d.accepted)}${warning ? " warning" : ""}` : "not read",
    d
      ? `${number(d.didnt_arrive)}${
          d.didnt_arrive > 0
            ? ` ${number(d.hard_bounce)} hard · ${number(d.soft_bounce)} soft · ${number(other)} other`
            : ""
        }`
      : "not read",
    d ? number(d.not_yet) : "not read",
    d ? number(d.complaint) : "not read",
    d ? number(d.unsubscribed) : "not read",
    ratio(row.replied, d ? d.delivered : 0),
    number(row.out_of_office),
    `${ratio(row.yes, row.replied)}${
      row.yes_not_on_waitlist > 0 ? ` ${number(row.yes_not_on_waitlist)} not on the waitlist` : ""
    }`,
    number(row.joined),
    ratio(row.calls_booked, row.joined),
    ratio(row.calls_held, row.calls_booked),
    ratio(row.pilots, row.calls_held),
  ];
}

export async function walk(page: Page, kit: WalkKit): Promise<void> {
  if ((await kit.socket.ask("GET", "/data/batches")).status !== 200) {
    kit.check("batches: not loaded in this service", true);
    return;
  }
  // The stand-in feed, again if a worker restart dropped it (it declines over the real one).
  await kit.socket.ask("POST", "/data/_test/batches/delivery", { by: WALKER });

  // ---------------------------------------------------------------- B1: the button, and the row
  await page.goto(`${kit.base}/data/waitlist`, { waitUntil: "networkidle" });
  await page.waitForSelector("#table-waitlist", { timeout: 30_000 });
  await page.locator('a[href="/data/waitlist/batches"]', { hasText: "Batches" }).first().click();
  await page.waitForURL(/\/data\/waitlist\/batches$/, { timeout: 30_000 });
  await page.waitForSelector(".hqdata-batches", { timeout: 30_000 });
  await page.waitForLoadState("networkidle");
  const data = await batchesOf(kit);
  const row = data.funnel.rows.find((item) => item.name === MAILING);
  const cells = row ? await cellsOf(page, `#batch-${row.mailing_id}`) : [];
  kit.check(
    "batches B1: the Batches button on Waitlist leads here, and Walk live 01 reads 268 of 290 delivered with a Warning",
    Boolean(row) &&
      (cells[0] ?? "").startsWith(MAILING.toLowerCase()) &&
      (cells[0] ?? "").includes("walk 01") &&
      cells[2] === "290" &&
      cells[3] === "268 of 290 warning" &&
      (cells[4] ?? "").startsWith("21 ") &&
      cells[5] === "1" &&
      cells[6] === "1" &&
      cells[7] === "1",
    cells.slice(0, 8),
  );

  // ---------------------------------------------------------------- B2: the page and the service agree
  const expected = row ? printed(row, row.warning) : [];
  kit.check(
    "batches B2: every number on the row is the service's",
    Boolean(row) && JSON.stringify(cells.slice(2)) === JSON.stringify(expected),
    `${cells.slice(2).join(" | ")} ≠ ${expected.join(" | ")}`,
  );

  // ---------------------------------------------------------------- B3: replies, the waitlist, and each ratio's "of"
  const delivered = row?.delivery?.delivered ?? 0;
  kit.check(
    "batches B3: at least 5 replied, 2 said yes, 2 firms joined, 2 calls booked, 1 held and 1 pilot, each out of the stage before",
    Boolean(row) &&
      row!.replied >= 5 &&
      row!.yes >= 2 &&
      row!.joined >= 2 &&
      row!.calls_booked >= 2 &&
      row!.calls_held >= 1 &&
      row!.pilots >= 1 &&
      cells[8] === `${number(row!.replied)} of ${number(delivered)}` &&
      (cells[10] ?? "").startsWith(`${number(row!.yes)} of ${number(row!.replied)}`) &&
      cells[12] === `${number(row!.calls_booked)} of ${number(row!.joined)}` &&
      cells[13] === `${number(row!.calls_held)} of ${number(row!.calls_booked)}` &&
      cells[14] === `${number(row!.pilots)} of ${number(row!.calls_held)}`,
    cells.slice(8),
  );

  // ---------------------------------------------------------------- B4: the total, and Not from a batch below it
  const total = data.funnel.total;
  const sum = (pick: (item: Row) => number) =>
    data.funnel.rows.reduce((count, item) => count + pick(item), 0);
  const totalCells = await cellsOf(page, "#batches-total");
  const outsideCells = await cellsOf(page, "#batches-outside");
  const order = await page.evaluate(() =>
    [...document.querySelectorAll("#table-batches tbody tr")].map((item) => item.id),
  );
  kit.check(
    "batches B4: All batches is the sum of the rows, and Not from a batch sits below it",
    total.accepted === sum((item) => item.accepted) &&
      (total.delivery?.delivered ?? 0) === sum((item) => item.delivery?.delivered ?? 0) &&
      (total.delivery?.didnt_arrive ?? 0) === sum((item) => item.delivery?.didnt_arrive ?? 0) &&
      total.replied === sum((item) => item.replied) &&
      total.yes === sum((item) => item.yes) &&
      total.joined === sum((item) => item.joined) &&
      total.calls_booked === sum((item) => item.calls_booked) &&
      total.calls_held === sum((item) => item.calls_held) &&
      total.pilots === sum((item) => item.pilots) &&
      totalCells[0] === "all batches" &&
      JSON.stringify(totalCells.slice(2)) === JSON.stringify(printed(total, null)) &&
      outsideCells[0] === "not from a batch" &&
      outsideCells[8] === number(data.funnel.not_from_a_batch.replied) &&
      outsideCells[2] === "—" &&
      order.at(-2) === "batches-total" &&
      order.at(-1) === "batches-outside",
    `${totalCells.slice(2).join(" | ")} · ${outsideCells.join(" | ")}`,
  );

  // ---------------------------------------------------------------- B5: replies by outcome
  const heads = await page.evaluate(() =>
    [...document.querySelectorAll("#table-replies-by-outcome thead th")].map((cell) =>
      (cell.textContent ?? "").replace(/\s+/g, " ").trim().toLowerCase(),
    ),
  );
  const main = flat(await kit.text());
  kit.check(
    "batches B5: Replies by outcome has a column per outcome and says a person can count twice",
    OUTCOME_LABELS.every((label) => heads.includes(label.toLowerCase())) && main.includes(TWICE),
    heads,
  );

  // ---------------------------------------------------------------- B8 (here, on the page itself)
  await kit.audit("batches");

  // ---------------------------------------------------------------- B6: no per cent sign; the mailing's link
  const noSign = !main.includes("%");
  await page
    .locator(`#batch-${row?.mailing_id ?? "none"} a`, { hasText: MAILING })
    .first()
    .click();
  await page.waitForURL(/\/mail\/merge\/mailings\/[^/]+$/, { timeout: 30_000 });
  await page.waitForLoadState("networkidle");
  const mailingPage = flat(await kit.text());
  kit.check(
    "batches B6: no per cent sign in the page, and the batch's link opens its Mail merge page",
    noSign &&
      page.url().endsWith(`/mail/merge/mailings/${row?.mailing_id ?? "none"}`) &&
      mailingPage.includes(MAILING),
    `${page.url()} · ${mailingPage.slice(0, 80)}`,
  );

  // ---------------------------------------------------------------- B7: the overview's block
  await page.goto(`${kit.base}/data`, { waitUntil: "networkidle" });
  await page.waitForSelector('[data-section="data-delivery"]', { timeout: 30_000 });
  const block = flat(await page.locator('[data-section="data-delivery"]').innerText());
  const read = /([\d,]+) of ([\d,]+) delivered/.exec(block);
  const got = read ? Number(read[1]!.replace(/,/g, "")) : 0;
  const accepted = read ? Number(read[2]!.replace(/,/g, "")) : 0;
  kit.check(
    "batches B7: the overview's Delivery, last 7 days counts the week and shows the complaint warning naming Gmail",
    accepted >= 290 &&
      accepted - got === 22 &&
      block.includes("Gmail") &&
      block.includes("Nothing has been paused") &&
      !block.includes("%"),
    block.slice(0, 200),
  );
}
