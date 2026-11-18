/**
 * The delivery batch's seams in the browser, with every module loaded (delivery spec §3.3,
 * §9.1 step 3). Each unit walked its half alone: D2 against a stand-in feed, D1 in Mail
 * merge's own walk. Here the real reader feeds D2's pages, from the Data stand-in's seed
 * (Walk live 01, fund 1–290, read back once with the stand-in provider's mix of §5.6):
 * Waitlist › Batches reads "268 of 290" from the sender's own files and the stand-in route
 * declines (M1); the lead partner36@fund36.example reads "Bounced on … (not an opt-out)" and
 * "Hard bounce" with no address in the reason (M2); the overview's "Delivery, last 7 days"
 * counts equal Mail merge home's "Last 7 days", loaded one after the other (M3); Mail merge's
 * Setup lists the 11 read-back stops with their detail lines (M4); the mailing's page says
 * "268 of 290 delivered" with both warnings and nothing paused (M5); and the outbox did not
 * grow while this walk ran (M6).
 *
 * The walks run in the order of their names, so this one runs after dates and before
 * diligence; other walks add replies, stops and live sends (all plain deliveries) in their
 * first pass. So its checks run from the second pass on (desktop, light), once every other
 * walk has had its first. It only reads: it presses nothing and sends nothing. Every person
 * and firm is invented, on `.example`.
 */

import { createHash } from "node:crypto";

import type { Page } from "playwright";

import { WALKER, type WalkKit } from "./kit";

const MAILING = "Walk live 01";
const HARD = [36, 72, 108, 144, 180, 216, 252, 288];
/** The 11 of §5.6, with Setup's words for the reason and the read-back's detail line. */
const STOPS: [number, string, string][] = [
  ...HARD.map((n): [number, string, string] => [n, "Bounced", `Hard bounce · ${MAILING}`]),
  [59, "Bounced", `Not a working address · ${MAILING}`],
  [41, "Asked to stop", `Marked as spam · ${MAILING}`],
  [43, "Asked to stop", `Unsubscribed · ${MAILING}`],
];
const COMPLAINTS_TITLE = "Spam complaints are at or over Gmail's and Yahoo's limit";
const HARD_TITLE = "More addresses bounced hard than is healthy";
const REASON = "550 5.1.1 <[address]>: user unknown";
/** The week in words, as both the overview and Mail merge's home print it. */
const WEEK =
  /([\d,]+) of ([\d,]+) delivered · ([\d,]+) didn.t arrive · ([\d,]+) not delivered yet · ([\d,]+) spam complaints? · ([\d,]+) unsubscribed\./;

const leadIdOf = (email: string): string =>
  createHash("sha256").update(`lead:${email}`).digest("hex").slice(0, 32);
const person = (n: number) => `partner${n}@fund${n}.example`;
const flat = (text: string) => text.replace(/\s+/g, " ").trim();

type Counts = Record<string, number>;
type StopRow = { email: string; reason: string; detail: string };

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

async function sectionText(page: Page, id: string): Promise<string> {
  const section = page.locator(`[data-section="${id}"]`).first();
  return flat(await section.innerText().catch(() => ""));
}

export async function walk(page: Page, kit: WalkKit): Promise<void> {
  if (kit.pass.first) {
    console.log("  · delivery-merged: waits for the other walks' first pass");
    return;
  }
  const real = await kit.socket.ask("GET", "/data/_test/delivery");
  if (real.status !== 200) {
    kit.check("delivery merged: the read-back's own Data module is loaded", false, real.status);
    return;
  }
  const outboxBefore = kit.outbox().length;
  const mailings =
    ((await kit.socket.ask("GET", "/mailings")).body.mailings as { id: string; name: string }[]) ??
    [];
  const mailingId = mailings.find((mailing) => mailing.name === MAILING)?.id ?? "";

  // ---------------------------------------------------------------- M1: Batches, from the real files
  const standIn = await kit.socket.ask("POST", "/data/_test/batches/delivery", { by: WALKER });
  const files = (real.body.mailings as { mailing_id: string; counts: Counts }[]) ?? [];
  const fromFiles = files.find((mailing) => mailing.mailing_id === mailingId)?.counts;
  const engineSide = (
    (await kit.socket.ask("GET", `/mailings/${mailingId}/delivery`)).body.delivery as
      { counts: Counts } | null | undefined
  )?.counts;
  await visit(page, `${kit.base}/data/waitlist/batches`, ".hqdata-batches");
  const cells = await page.evaluate((id) => {
    const row = document.querySelector(`#batch-${id}`);
    return row
      ? [...row.children].map((cell) =>
          ((cell as HTMLElement).innerText ?? "").replace(/\s+/g, " ").trim().toLowerCase(),
        )
      : [];
  }, mailingId);
  kit.check(
    "delivery merged M1: Batches' Walk live 01 reads 268 of 290 from the sender's own files, and the stand-in route declines",
    Boolean(mailingId) &&
      standIn.body.installed === false &&
      standIn.body.real === true &&
      fromFiles?.accepted === 290 &&
      fromFiles.delivered === 268 &&
      JSON.stringify(fromFiles) === JSON.stringify(engineSide) &&
      cells[2] === "290" &&
      cells[3] === "268 of 290 warning" &&
      (cells[4] ?? "").startsWith("21 8 hard · 10 soft · 3 other"),
    `${JSON.stringify(standIn.body)} · ${cells.slice(0, 6).join(" | ")}`,
  );

  // ---------------------------------------------------------------- M2: the hard bounce's lead
  const leadId = leadIdOf(person(36));
  const lead = (await kit.socket.ask("GET", `/data/leads/${leadId}`)).body.lead as
    { consent?: { stop_words?: string } } | undefined;
  const words = lead?.consent?.stop_words ?? "";
  await visit(page, `${kit.base}/data/leads/${leadId}`, "main .rhead");
  await kit
    .says("Consent and source")
    .catch(() => kit.check("delivery merged M2: the lead shows Consent and source", false));
  const leadText = flat(await kit.text());
  // The send's own delivery line (the mail's "To" line above it rightly shows the address).
  const sendLine = flat(
    await page
      .locator(".hqdata-mail__delivery")
      .first()
      .innerText()
      .catch(() => ""),
  );
  kit.check(
    "delivery merged M2: partner36@fund36.example reads Bounced on … (not an opt-out) and Hard bounce, with no address in the reason",
    /^Bounced on \d{1,2} [A-Z][a-z]{2} \d{4} \(not an opt-out\)$/.test(words) &&
      leadText.includes(`Opted out ${words}`) &&
      sendLine.startsWith(`Hard bounce · ${REASON}`) &&
      !sendLine.includes("@"),
    `${words} · ${sendLine}`,
  );
  await kit.audit("merged-lead-hard-bounce");

  // ---------------------------------------------------------------- M3: the overview's week is Mail merge's
  let overviewWeek: string[] = [];
  let homeWeek: string[] = [];
  let overviewBlock = "";
  let homeBlock = "";
  // Loaded one after the other; once more if a read landed between the two loads.
  for (let attempt = 0; attempt < 2; attempt += 1) {
    await visit(page, `${kit.base}/data`, '[data-section="data-delivery"]');
    overviewBlock = await sectionText(page, "data-delivery");
    await visit(page, `${kit.base}/mail/merge`, '[data-section="merge-delivery-home"]');
    homeBlock = await sectionText(page, "merge-delivery-home");
    overviewWeek = WEEK.exec(overviewBlock)?.slice(1) ?? [];
    homeWeek = WEEK.exec(homeBlock.replace(/^.*?Last 7 days: /, ""))?.slice(1) ?? [];
    if (overviewWeek.length > 0 && JSON.stringify(overviewWeek) === JSON.stringify(homeWeek)) break;
  }
  const accepted = Number((overviewWeek[1] ?? "0").replace(/,/g, ""));
  const delivered = Number((overviewWeek[0] ?? "0").replace(/,/g, ""));
  kit.check(
    "delivery merged M3: the overview's Delivery, last 7 days counts equal Mail merge home's Last 7 days",
    overviewWeek.length === 6 &&
      JSON.stringify(overviewWeek) === JSON.stringify(homeWeek) &&
      homeBlock.includes("Last 7 days: ") &&
      accepted >= 290 &&
      accepted - delivered === 22 &&
      overviewBlock.includes("Gmail") &&
      homeBlock.includes("Gmail") &&
      !overviewBlock.includes("%") &&
      !homeBlock.includes("%"),
    `${overviewWeek.join(" ")} | ${homeWeek.join(" ")}`,
  );

  // ---------------------------------------------------------------- M4: Setup's stop list
  const total = Number((await kit.socket.ask("GET", "/stops")).body.total ?? 0);
  const rows: string[] = [];
  for (let offset = 0; offset < Math.max(total, 1); offset += 100) {
    await visit(page, `${kit.base}/mail/merge/setup?offset=${offset}`, "#table-stop-list");
    rows.push(
      ...(await page.evaluate(() =>
        [...document.querySelectorAll("#table-stop-list tbody tr")].map((row) =>
          ((row as HTMLElement).innerText ?? "").replace(/\s+/g, " ").trim(),
        ),
      )),
    );
  }
  const missing = STOPS.filter(
    ([n, reason, detail]) =>
      !rows.some((row) => row.startsWith(`${person(n)} ${reason} ${detail}`)),
  ).map(([n]) => person(n));
  const service = await kit.socket.ask("GET", "/stops");
  const readBack = ((service.body.stops as StopRow[]) ?? []).filter((stop) =>
    stop.detail.endsWith(` · ${MAILING}`),
  );
  kit.check(
    "delivery merged M4: Setup lists the 11 read-back stops of Walk live 01, each with its detail line",
    missing.length === 0 &&
      rows.filter((row) => row.includes(` · ${MAILING}`)).length === 11 &&
      (total > 100 || readBack.length === 11),
    missing.length > 0 ? missing.join(" ") : `${rows.length} rows`,
  );

  // ---------------------------------------------------------------- M5: the mailing's page
  await visit(
    page,
    `${kit.base}/mail/merge/mailings/${mailingId}`,
    '[data-section="merge-delivery"]',
  );
  const delivery = await sectionText(page, "merge-delivery");
  const state = (
    (await kit.socket.ask("GET", "/mailings")).body.mailings as { id: string; state: string }[]
  ).find((mailing) => mailing.id === mailingId)?.state;
  kit.check(
    "delivery merged M5: Walk live 01's page shows 268 of 290 delivered and both warnings, and nothing was paused",
    delivery.includes("268 of 290 delivered.") &&
      delivery.includes(COMPLAINTS_TITLE) &&
      delivery.includes(HARD_TITLE) &&
      delivery.includes("0.37 per cent") &&
      delivery.includes("2.8 per cent") &&
      delivery.includes("Nothing has been paused") &&
      !delivery.includes("%") &&
      state === "finished",
    `${state} · ${delivery.slice(0, 200)}`,
  );
  await kit.audit("merged-mailing-delivery");

  // ---------------------------------------------------------------- M6: nothing went
  kit.check(
    "delivery merged M6: the outbox did not grow while this walk read",
    kit.outbox().length === outboxBefore,
    `${outboxBefore} → ${kit.outbox().length}`,
  );
}
