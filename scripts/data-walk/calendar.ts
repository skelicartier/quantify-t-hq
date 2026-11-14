/**
 * The calendar feed, walked (raise spec §7.10, C1–C7): the link made once and shown once,
 * the feed read with no cookie by its link alone, what the events say, a new link ending
 * the old one, the feed off, the downloadable file, and the role line for anyone else.
 * The sources other units add (investors, files, notes) are stand-ins here, installed
 * under test routes only where no real source is (§7.7). Nothing subscribes a real
 * calendar app to anything. Every person and firm is invented.
 */

import { readFileSync } from "node:fs";
import { request } from "node:http";
import { dirname } from "node:path";

import type { Page } from "playwright";

import { WALK_KEY } from "../mail-merge/e2e-provider";
import { WALKER, type Shot, type WalkKit } from "./kit";

export const shots: Shot[] = [
  { name: "data-calendar", path: "/data/calendar", ready: ".hqdata-calendar" },
];

type Body = Record<string, unknown>;

const flat = (text: string) => text.replace(/\s+/g, " ").trim();

/** A calendar date plus whole days, with no zone involved. */
function addDays(day: string, count: number): string {
  const [year = 0, month = 1, date = 1] = day.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, date + count)).toISOString().slice(0, 10);
}

/** The invented items the stand-ins give, relative to this Mac's day. */
function standIns(day: string): { name: string; items: Body[] }[] {
  return [
    {
      name: "investors",
      items: [
        {
          key: "investor:walk-stand-in",
          kind: "investor",
          title: "Send the deck · Walk Stand-in Fund",
          plain: "Investor next step",
          sub: "Walk Stand-in Fund · Replied",
          on: addDays(day, 3),
          remind_days: [0],
          href: "/data/investors",
        },
      ],
    },
    {
      name: "files",
      items: [
        {
          key: "file_review:walk-stand-in",
          kind: "file_review",
          title: "Review Walk stand-in file",
          plain: "File review",
          sub: "10 Fundraising and investors",
          on: addDays(day, 6),
          remind_days: [2],
          href: "/data/files",
        },
      ],
    },
    {
      name: "notes",
      items: [
        {
          key: "action:walk-stand-in",
          kind: "action",
          title: "Send the pilot summary · Walk Stand-in Fund",
          plain: "Action from a note",
          sub: "Walk Stand-in Fund",
          on: addDays(day, 2),
          remind_days: [0],
          href: "/data",
        },
      ],
    },
  ];
}

function ask(socket: string, method: "GET" | "POST", path: string, body?: unknown) {
  return new Promise<number>((resolve, reject) => {
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
        response.resume();
        response.on("end", () => resolve(response.statusCode ?? 0));
      },
    );
    outgoing.on("error", reject);
    if (text) outgoing.write(text);
    outgoing.end();
  });
}

/** Nothing to seed: the walk installs its stand-ins itself, as a restart forgets them. */
export async function seed(socketPath: string): Promise<void> {
  await ask(socketPath, "GET", "/data/calendar");
}

/**
 * The stand-in sources, where no real one answers (a worker restart forgets them). Gives
 * the names installed: none where every module is loaded (the merged copy).
 */
async function installStandIns(kit: WalkKit, day: string): Promise<Set<string>> {
  const installed = new Set<string>();
  for (const source of standIns(day)) {
    const answer = await kit.socket.ask("POST", "/data/_test/calendar/source", {
      ...source,
      by: WALKER,
    });
    if (answer.body.installed === true) installed.add(source.name);
  }
  return installed;
}

/** The feed fetched as Calendar would: a plain request, no cookie, no session. */
async function fetchFeed(link: string): Promise<{ status: number; type: string; text: string }> {
  const answer = await fetch(link, { redirect: "manual" });
  return {
    status: answer.status,
    type: answer.headers.get("content-type") ?? "",
    text: await answer.text(),
  };
}

const unfold = (text: string) => text.replace(/\r\n /g, "");
const uids = (text: string) =>
  unfold(text)
    .split("\r\n")
    .filter((line) => line.startsWith("UID:"))
    .sort();

/** The link the page shows once, after pressing whichever button makes it. */
async function makeLink(page: Page, kit: WalkKit): Promise<{ link: string; said: string }> {
  await page.goto(`${kit.base}/data/calendar`, { waitUntil: "networkidle" });
  await page.waitForSelector(".hqdata-calendar", { timeout: 30_000 });
  const panel = page.locator(".hqdata-calendar-link");
  if ((await panel.locator("button", { hasText: "Make the link" }).count()) > 0)
    await panel.locator("button", { hasText: "Make the link" }).click();
  else {
    await panel.locator("summary", { hasText: "Make a new link" }).click();
    await panel.locator(".popover__panel button", { hasText: "Make a new link" }).click();
  }
  const box = page.locator(".hqdata-calendar-made input");
  await box.waitFor({ timeout: 20_000 });
  return {
    link: await box.inputValue(),
    said: flat(await page.locator(".hqdata-calendar-made .form-sent").innerText()),
  };
}

export async function walk(page: Page, kit: WalkKit): Promise<void> {
  if ((await kit.socket.ask("GET", "/data/calendar")).status !== 200) {
    kit.check("calendar: not loaded in this service", true);
    return;
  }
  const day = String((await kit.socket.ask("GET", "/data/_test/day")).body.day ?? "");
  const fakes = await installStandIns(kit, day);
  // The Key date C3 looks for: added once, through the dates route.
  const dates =
    ((await kit.socket.ask("GET", "/data/dates?view=all")).body.dates as Body[] | undefined) ?? [];
  if (!dates.some((date) => date.title === "Walk filing"))
    await kit.socket.ask("POST", "/data/dates", {
      title: "Walk filing",
      kind: "filing",
      due_on: addDays(day, 5),
      remind_days: 2,
      by: WALKER,
    });
  // Full titles to begin each pass.
  await kit.socket.ask("POST", "/data/calendar/detail", { detail: "full", by: WALKER });

  // ---------------------------------------------------------------- C1: no link
  if (kit.pass.first) {
    await kit.socket.ask("POST", "/data/calendar/off", { by: WALKER });
    await page.goto(`${kit.base}/data/calendar`, { waitUntil: "networkidle" });
    await page.waitForSelector(".hqdata-calendar", { timeout: 30_000 });
    const text = flat(await kit.text());
    kit.check(
      "calendar C1: with the feed off the page says No link yet, and how to subscribe",
      text.includes("No link yet.") &&
        text.includes("Subscribe on this Mac") &&
        text.includes("On My Mac") &&
        (await page.locator("#table-calendar-sources").count()) === 1,
      text.slice(0, 300),
    );
    await kit.audit("calendar");
  }

  // ---------------------------------------------------------------- C2: made, shown once
  const { link, said } = await makeLink(page, kit);
  const webcal = await page
    .locator(".hqdata-calendar-made a", { hasText: "Open in Calendar" })
    .getAttribute("href");
  kit.check(
    "calendar C2: Make the link shows the link once, with Copy and Open in Calendar",
    said === "Made the link. Copy it now: it is shown once." &&
      /\/cal\/[A-Za-z0-9_-]{43}$/.test(link) &&
      link.startsWith(kit.base) &&
      webcal === link.replace(/^https?:\/\//, "webcal://") &&
      (await page.locator(".hqdata-calendar-made button", { hasText: "Copy" }).count()) === 1,
    { said, link: link.replace(/[A-Za-z0-9_-]{43}$/, "…"), webcal: webcal?.slice(0, 12) },
  );
  await kit.audit("calendar-made");
  await page.reload({ waitUntil: "networkidle" });
  const afterReload = await page.content();
  const token = link.slice(-43);
  kit.check(
    "calendar C2: after a reload the link is not shown again",
    !afterReload.includes(token) &&
      (await page.locator(".hqdata-calendar-made").count()) === 0 &&
      flat(await kit.text()).includes("last read by your calendar not yet"),
  );

  // ---------------------------------------------------------------- C3: read with no cookie
  const folder = dirname(kit.socket.path);
  const feed = await fetchFeed(link);
  const body = unfold(feed.text);
  const followUps =
    ((await kit.socket.ask("GET", "/data/follow-ups")).body.follow_ups as Body[] | undefined) ?? [];
  // An open follow-up (the replies seed leaves "Answer Asha4 Rao4's question"), in plain words.
  const seeded = followUps.find((item) => !/[,;\\]/.test(String(item.title)));
  kit.check(
    "calendar C3: the link alone gives the calendar file, with the key date and a follow-up",
    feed.status === 200 &&
      feed.type.startsWith("text/calendar") &&
      feed.text.startsWith("BEGIN:VCALENDAR\r\n") &&
      body.includes(`DTSTART;VALUE=DATE:${addDays(day, 5).replace(/-/g, "")}`) &&
      body.includes("SUMMARY:Walk filing") &&
      seeded !== undefined &&
      body.includes(String(seeded.title)) &&
      !body.includes("Application Support") &&
      !body.includes(folder) &&
      !body.includes(WALK_KEY),
    { status: feed.status, type: feed.type, start: feed.text.slice(0, 40) },
  );

  // ---------------------------------------------------------------- C4: full titles, then kinds only
  // In a copy without the notes, files and investors modules the stand-ins give these
  // events. Where the real modules answer (the merged copy) the stand-ins are refused, so
  // the same two checks are made on the real items the feed is built from.
  const standing = fakes.has("notes") && fakes.has("files") && fakes.has("investors");
  const items =
    ((await kit.socket.ask("GET", "/data/calendar/items")).body.items as Body[] | undefined) ?? [];
  /** Each event's summary, without the "Overdue since {day}: " an overdue one starts with. */
  const summaries = (text: string) =>
    text
      .split("\r\n")
      .filter((line) => line.startsWith("SUMMARY:"))
      .map((line) => line.slice("SUMMARY:".length).replace(/^Overdue since [^:]+: /, ""));
  const named = items.filter(
    (item) =>
      ["action", "file_review", "investor", "offer_deadline"].includes(String(item.kind)) &&
      !/[,;\\]/.test(String(item.title)),
  );
  if (standing)
    kit.check(
      "calendar C4: the stand-in note's action is in the feed with its full title",
      body.includes("SUMMARY:Send the pilot summary · Walk Stand-in Fund") &&
        body.includes("SUMMARY:Review Walk stand-in file"),
    );
  else
    kit.check(
      "calendar C4: the real notes' actions, and any file reviews and investor steps, are in the feed with their full titles",
      named.some((item) => item.kind === "action") &&
        named.every((item) => summaries(body).includes(String(item.title))),
      named.map((item) => item.title),
    );
  await page.goto(`${kit.base}/data/calendar`, { waitUntil: "networkidle" });
  const detail = page.locator("section[aria-labelledby='calendar-detail']");
  await detail.getByLabel("Kinds only", { exact: false }).check();
  await detail.getByRole("button", { name: "Save", exact: true }).click();
  await detail.locator(".form-sent", { hasText: "Saved." }).waitFor({ timeout: 20_000 });
  const plain = unfold((await fetchFeed(link)).text);
  if (standing)
    kit.check(
      "calendar C4: with kinds only the summary is the kind's words, and no event names a firm",
      plain.includes("SUMMARY:Action from a note") &&
        plain.includes("SUMMARY:Investor next step") &&
        !plain.includes("Walk Stand-in Fund") &&
        !plain.includes("Asha4") &&
        !plain.includes("URL:"),
    );
  else {
    // A Key date's kinds-only words are its own title (it names nobody); every other
    // event's full title names a firm or a person, so none may appear.
    const words = new Set(items.map((item) => String(item.plain)));
    const said = summaries(plain);
    kit.check(
      "calendar C4: with kinds only every summary is its kind's words, and no event names a firm or a person",
      said.length > 0 &&
        said.every((summary) => words.has(summary)) &&
        said.includes("Action from a note") &&
        items.every((item) => item.kind === "key_date" || !plain.includes(String(item.title))) &&
        !plain.includes("Asha4") &&
        !plain.includes("URL:"),
      [...new Set(said)].slice(0, 8),
    );
  }
  await kit.audit("calendar-kinds-only");
  await kit.socket.ask("POST", "/data/calendar/detail", { detail: "full", by: WALKER });

  // ---------------------------------------------------------------- C5: wrong, new, off
  const wrong = await fetchFeed(`${kit.base}/cal/${"A".repeat(43)}`);
  const second = await makeLink(page, kit);
  const oldNow = await fetchFeed(link);
  const newNow = await fetchFeed(second.link);
  await page.goto(`${kit.base}/data/calendar`, { waitUntil: "networkidle" });
  await page.locator(".hqdata-calendar-link button", { hasText: "Turn the feed off" }).click();
  await page.locator(".hqdata-calendar-link", { hasText: "No link yet." }).waitFor({
    timeout: 20_000,
  });
  const offNow = await fetchFeed(second.link);
  kit.check(
    "calendar C5: a wrong token is not found; a new link ends the old; off ends the new",
    wrong.status === 404 &&
      wrong.text === "" &&
      oldNow.status === 404 &&
      newNow.status === 200 &&
      offNow.status === 404,
    { wrong: wrong.status, old: oldNow.status, fresh: newNow.status, off: offNow.status },
  );

  // ---------------------------------------------------------------- C6: the file instead
  const downloading = page.waitForEvent("download", { timeout: 30_000 });
  await page.locator("a", { hasText: "Download a calendar file (.ics)" }).click();
  const download = await downloading;
  const file = readFileSync((await download.path())!, "utf8");
  kit.check(
    "calendar C6: the download is a .ics file with the same events",
    download.suggestedFilename() === `HQ dates ${day}.ics` &&
      file.startsWith("BEGIN:VCALENDAR\r\n") &&
      JSON.stringify(uids(file)) === JSON.stringify(uids(feed.text)),
    { name: download.suggestedFilename(), file: uids(file).length, feed: uids(feed.text).length },
  );

  // ---------------------------------------------------------------- C7: anyone else
  if (kit.pass.first) {
    const browser = page.context().browser();
    if (browser) {
      const other = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      const intern = await other.newPage();
      await intern.goto(
        `${kit.base}/dev/signin?as=intern%40hq.test&next=${encodeURIComponent("/data/calendar")}`,
        { waitUntil: "networkidle" },
      );
      await intern.goto(`${kit.base}/data/calendar`, { waitUntil: "networkidle" });
      const text = await intern.locator("main").first().innerText();
      kit.check(
        "calendar C7: as the intern the page says the role line and no address",
        text.includes("Data is for Owners and Admins.") && !text.includes("@"),
        text.slice(0, 160),
      );
      await other.close();
    }
  }
}
