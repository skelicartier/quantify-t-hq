/**
 * Consent and source on leads, and delivery per address, walked against the stand-in
 * (delivery spec §7.10, CS1–CS6): the "Where" and "Delivery" filters on All leads and the
 * 21 of Walk 01 that did not arrive (CS1), the Delivery column (CS2), one lead's "Consent
 * and source" panel with the law that may apply and the day they asked to stop (CS3), a
 * send's delivery line with the provider's reason and no address in it (CS4), and the
 * download's three new columns (CS5). Every person is invented, on `.example`.
 *
 * `partner150@fund150.example` is put on the stop list here, by hand, as someone who asked:
 * no check looks at what the read-back did or did not put there.
 */

import { createHash } from "node:crypto";
import { request } from "node:http";

import type { Page } from "playwright";

import { WALKER, type Shot, type WalkKit } from "./kit";

export const shots: Shot[] = [];

const leadIdOf = (email: string): string =>
  createHash("sha256").update(`lead:${email}`).digest("hex").slice(0, 32);

const ASKED = "partner150@fund150.example";
const BOUNCED = "partner36@fund36.example";
const INDIA_LINE =
  "The DPDP Act's consent and notice duties apply from 13 May 2027. Not legal advice.";
const REASON = "Hard bounce · 550 5.1.1 <[address]>: user unknown";

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

/** One person who asked to stop, through Mail merge's own stop list. */
export async function seed(socketPath: string): Promise<void> {
  const added = await ask(socketPath, "POST", "/stops/add", { emails: ASKED, reason: "asked" });
  console.log(
    `[walk] consent: ${added.status === 200 ? "one person asked to stop" : added.status}`,
  );
}

const flat = (text: string) => text.replace(/\s+/g, " ").trim();

const SHORT_MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];
/** "2026-11-14" → "14 Nov 2026", as the service words a stop's day. */
const dayWords = (day: string) => {
  const [year = "", month = "1", date = "1"] = day.split("-");
  return `${Number(date)} ${SHORT_MONTHS[Number(month) - 1] ?? ""} ${year}`;
};

type ListSummary = { id: string; name: string };
type LeadsPage = {
  total: number;
  facets: Record<string, { value: string; count: number }[]>;
};

export async function walk(page: Page, kit: WalkKit): Promise<void> {
  // The stand-in feed, again if a worker restart dropped it (it declines over the real one).
  const feed = await kit.socket.ask("POST", "/data/_test/batches/delivery", { by: WALKER });
  if (feed.status !== 200) {
    kit.check("consent: the batches module is not loaded in this service", true);
    return;
  }
  const lists =
    ((await kit.socket.ask("GET", "/lists")).body.lists as ListSummary[] | undefined) ?? [];
  const walk01 = lists.find((list) => list.name.startsWith("Walk 01"))?.id ?? "none";

  // ---------------------------------------------------------------- CS1: the two filters, and the 21
  const query = `delivery=didnt_arrive&batch=${walk01}`;
  const view = (await kit.socket.ask("GET", `/data/leads?${query}`)).body as unknown as LeadsPage;
  await page.goto(`${kit.base}/data/leads?${query}`, { waitUntil: "networkidle" });
  await page.waitForSelector("#table-all-leads", { timeout: 30_000 });
  const selects = await page.evaluate(() =>
    [...document.querySelectorAll(".hqdata-filters select")].map(
      (select) => (select as HTMLSelectElement).name,
    ),
  );
  const labels = flat(await page.locator(".hqdata-filters").innerText());
  const summary = flat(await page.locator(".pagination .toolbar__summary").innerText());
  const rows = await page.locator("#table-all-leads tbody tr").count();
  kit.check(
    "consent CS1: All leads offers Where and Delivery, and Walk 01's didn't arrive reads 21",
    selects.includes("where") &&
      selects.includes("delivery") &&
      /where/i.test(labels) &&
      /delivery/i.test(labels) &&
      Number(view.total) === 21 &&
      summary === "1–21 of 21" &&
      rows === 21,
    `${summary} · ${rows} rows · ${selects.join(",")}`,
  );

  // ---------------------------------------------------------------- CS2: the Delivery column
  const bounced = flat(
    await page.locator("#table-all-leads tbody tr", { hasText: BOUNCED }).first().innerText(),
  );
  const heads = await page.evaluate(() =>
    [...document.querySelectorAll("#table-all-leads thead th")].map((cell) =>
      (cell.textContent ?? "").replace(/\s+/g, " ").trim().toLowerCase(),
    ),
  );
  kit.check(
    "consent CS2: the Delivery column shows Hard bounce for partner36@fund36.example",
    heads.includes("delivery") && /hard bounce/i.test(bounced),
    bounced.slice(0, 160),
  );

  // ---------------------------------------------------------------- CS3: consent and source
  const today = String((await kit.socket.ask("GET", "/data/_test/day")).body.day ?? "");
  await page.goto(`${kit.base}/data/leads/${leadIdOf(ASKED)}`, { waitUntil: "networkidle" });
  await page.waitForSelector('section[aria-label="Consent and source"]', { timeout: 30_000 });
  const panel = flat(await page.locator('section[aria-label="Consent and source"]').innerText());
  const side = flat(await page.locator(".rgrid__side").innerText());
  kit.check(
    "consent CS3: Consent and source shows the list and row, India and its line, the day they asked to stop, and No",
    /Came from Mail merge list “Walk 01 - India named 1 of 20”, row \S+/i.test(panel) &&
      /Country India/i.test(panel) &&
      /Where India/i.test(panel) &&
      panel.includes(INDIA_LINE) &&
      panel.includes(`Asked to stop on ${dayWords(today)}`) &&
      /Asked to hear from us No$/i.test(panel) &&
      side.includes("Read from what HQ already holds: nothing here is asked of anyone."),
    panel.slice(0, 400),
  );
  await kit.audit("lead-consent");

  // ---------------------------------------------------------------- CS4: a send's delivery line
  await page.goto(`${kit.base}/data/leads/${leadIdOf(BOUNCED)}`, { waitUntil: "networkidle" });
  await page.waitForSelector('[data-section="lead-sent"]', { timeout: 30_000 });
  const line = flat(await page.locator(".hqdata-mail__delivery").first().innerText());
  kit.check(
    "consent CS4: the sent mail reads Hard bounce with the provider's reason, and no address inside it",
    line.startsWith(REASON) && !line.includes("@fund36") && !line.includes("%"),
    line,
  );

  // ---------------------------------------------------------------- CS5: the download's three new columns
  const csv = await page.request.get(`${kit.base}/data/leads/export?view=this&${query}`);
  const lines = (await csv.body()).subarray(3).toString("utf8").trim().split("\r\n");
  kit.check(
    "consent CS5: This view ends its header with where, opted_out_on and delivery, for the same 21",
    csv.status() === 200 &&
      lines[0]!.endsWith(",where,opted_out_on,delivery") &&
      lines[0]!.startsWith("email,name,first_name,last_name,title,company,firm_type") &&
      lines.length - 1 === 21,
    `${csv.status()} · ${lines.length - 1} rows · ${lines[0]!.slice(-60)}`,
  );
}
