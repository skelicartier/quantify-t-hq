/**
 * The cash view, walked against the stand-in (duties spec §5.3, §7.6, §7.7): the page with no
 * opening figure (CA1); the stand-in feeds installed and the week table as the Owner,
 * matching §5.3 when the stand-ins are the only feeds (CA2); the walk's Admin, who reads the
 * left-out line, no Stipends column and ₹11,61,000 (CA3); the scenarios, the raise delayed
 * six months running the cash out (CA4); no "%" and no meter anywhere (CA5).
 *
 * §5.3's example is placed relative to the Monday of the week of today (`walk-seed.ts`), so
 * the closing figures are the same whatever day the walk runs. Where a real module answers
 * instead of a stand-in (the merged copy), the page is checked against the service's own
 * answer rather than §5.3's figures. Every name is invented.
 */

import { request } from "node:http";

import type { Page } from "playwright";

import { walkCashFeeds } from "../data/cash/walk-seed";
import { WALKER, type Shot, type WalkKit } from "./kit";

const PATH = "/data/numbers/cash";
const LEFT_OUT =
  "Stipends are in the people ledger, which is for the Owner only. They are left out here.";
const NO_OPENING = "No opening figure. Import a statement on Money › Statements, or type one.";

export const shots: Shot[] = [
  { name: "data-numbers-cash", path: PATH, ready: '[data-section="cash-weeks"]' },
];

const flat = (text: string) => text.replace(/\s+/g, " ").trim();
const pad = (value: number) => String(value).padStart(2, "0");

function localDay(): string {
  const now = new Date();
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function post(socketPath: string, path: string, body: unknown): Promise<Record<string, unknown>> {
  const text = JSON.stringify(body);
  return new Promise((resolve) => {
    const outgoing = request(
      {
        socketPath,
        path,
        method: "POST",
        headers: { "content-type": "application/json", "content-length": Buffer.byteLength(text) },
      },
      (response) => {
        const chunks: Buffer[] = [];
        response.on("data", (chunk: Buffer) => chunks.push(chunk));
        response.on("end", () => {
          try {
            resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>);
          } catch {
            resolve({});
          }
        });
      },
    );
    outgoing.on("error", () => resolve({}));
    outgoing.write(text);
    outgoing.end();
  });
}

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
const addPeriods = (period: string, count: number): string => {
  const [year = 0, month = 1] = period.split("-").map(Number);
  const index = year * 12 + (month - 1) + count;
  return `${Math.floor(index / 12)}-${pad((index % 12) + 1)}`;
};
const periodWords = (period: string) =>
  `${MONTHS[Number(period.slice(5, 7)) - 1] ?? ""} ${period.slice(0, 4)}`;

/**
 * The stand-in's start (safe to run twice): the cash setup emptied, the expected money and the
 * two scenario events typed, the bill (Money's stand-in) installed. The statements and the
 * people ledger's stand-ins are installed by the walk itself, after CA1.
 */
export async function seed(socketPath: string): Promise<void> {
  const feeds = walkCashFeeds(localDay());
  const openingMonth = feeds.opening.as_of.slice(0, 7);
  await post(socketPath, "/data/_test/cash/seed", {
    reset: true,
    lines: feeds.lines,
    events: feeds.events.map(({ months, ...event }) => ({
      ...event,
      period: addPeriods(openingMonth, months),
    })),
    by: WALKER,
  });
  await post(socketPath, "/data/_test/cash/money", { bills: feeds.bills, by: WALKER });
}

type Table = {
  currency: string;
  opening: { minor: number; as_of: string; source: string } | null;
  rows: { key: string; by_week: number[] }[];
  closing: number[];
  items: { key: string; name: string }[];
};
type View = {
  tables: Table[];
  stipends_left_out: boolean;
  scenarios: { key: string; label: string; words: string }[] | null;
  here: { money: boolean; statements: boolean; people: boolean };
};

/** "₹11,61,000": rupees in Indian grouping, whole. */
const rupees = (minor: number) =>
  `${minor < 0 ? "−" : ""}₹${new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(Math.abs(minor) / 100)}`;

export async function walk(page: Page, kit: WalkKit): Promise<void> {
  const asked = await kit.socket.ask("GET", "/data/cash?owner=1");
  if (asked.status !== 200) {
    kit.check("cash: not loaded in this service", true);
    return;
  }
  const view = async (owner: boolean) =>
    (await kit.socket.ask("GET", owner ? "/data/cash?owner=1" : "/data/cash"))
      .body as unknown as View;
  const feeds = walkCashFeeds(String((await kit.socket.ask("GET", "/data/_test/day")).body.day));
  const open = async () => {
    await page.goto(`${kit.base}${PATH}`, { waitUntil: "networkidle" });
    await page.waitForSelector('[data-section="cash-weeks"]', { timeout: 30_000 });
    return flat(await kit.text());
  };

  // CA1: no opening figure yet.
  if (
    kit.pass.first &&
    (await view(true)).tables.find((table) => table.currency === "INR")?.opening === null
  ) {
    const text = await open();
    kit.check(
      "cash CA1: with no opening figure the page says how to give one, and the scenarios need one in rupees",
      text.includes(NO_OPENING) && text.includes("Needs an opening figure in rupees."),
      text.slice(0, 240),
    );
  }

  // CA2: the stand-ins installed; the Owner's table.
  const statements = await kit.socket.ask("POST", "/data/_test/cash/statements", {
    cash: feeds.statements,
    by: WALKER,
  });
  const people = await kit.socket.ask("POST", "/data/_test/cash/people-pay", {
    owed: feeds.owed,
    headcount: { employees: 0, interns: 1, contractors: 0 },
    by: WALKER,
  });
  const money = await kit.socket.ask("POST", "/data/_test/cash/money", {
    bills: feeds.bills,
    by: WALKER,
  });
  const owner = await view(true);
  const rupeeTable = owner.tables.find((table) => table.currency === "INR");
  const text = await open();
  const weeks = await page.locator('.hqdata-cash__table[data-currency="INR"] tbody tr').count();
  const closingCells = await page
    .locator('.hqdata-cash__table[data-currency="INR"] .hqdata-cash__closing')
    .allInnerTexts();
  // With no opening figure yet (the merged copy's first pass: the real statements feed has no
  // statement until the statements walk imports one) the service has no closing and the page
  // prints a dash in every week.
  const serviceClosing = rupeeTable?.opening
    ? (rupeeTable.closing ?? []).map(rupees)
    : closingCells.map(() => "—");
  const stand = (answer: { body: Record<string, unknown> }) => answer.body.installed === true;
  // §5.3's figures hold when the bank and Money are the walk's own stand-ins and nothing else
  // is due or typed: the Admin's table always, the Owner's when the people ledger is a stand-in.
  const adminTable = (await view(false)).tables.find((table) => table.currency === "INR");
  const exactAdmin = stand(statements) && stand(money) && (adminTable?.items.length ?? 0) === 2;
  const exact = exactAdmin && stand(people) && (rupeeTable?.items.length ?? 0) === 3;
  const expected = [
    "₹12,00,000",
    "₹12,00,000",
    "₹11,41,000",
    "₹11,41,000",
    "₹11,26,000",
    "₹11,46,000",
  ];
  // With the real people ledger, the Owner's closing is the Admin's less the stipends owed.
  const stipends = rupeeTable?.rows.find((row) => row.key === "stipends")?.by_week ?? [];
  let owed = 0;
  const consistent = (rupeeTable?.closing ?? []).every((minor, week) => {
    owed += stipends[week] ?? 0;
    return minor === (adminTable?.closing[week] ?? 0) - owed;
  });
  kit.check(
    "cash CA2: as the Owner the weeks are rows with Stipends, the opening sentence, and the closing cash as the service has it (§5.3's when the stand-ins are the only feeds)",
    weeks === 14 &&
      // The column heads are upper-cased by the stylesheet, so innerText says STIPENDS.
      text.toLowerCase().includes("stipends") &&
      !text.includes(LEFT_OUT) &&
      closingCells.map(flat).join("|") === serviceClosing.join("|") &&
      consistent &&
      (!exactAdmin ||
        text.includes("₹1,00,000 expected, not sure: counted at 20 per cent, ₹20,000.")) &&
      (!exact ||
        (serviceClosing.slice(0, 6).join("|") === expected.join("|") &&
          serviceClosing[13] === "₹11,46,000" &&
          text.includes("Opening cash is the statements' ₹12,00,000 as of") &&
          text.includes("Walk Intern One's stipend for") &&
          text.includes("₹1,00,000 expected, not sure: counted at 20 per cent, ₹20,000."))),
    { exact, exactAdmin, consistent, closingCells, serviceClosing },
  );
  await kit.audit("numbers-cash");

  // CA3: the walk's Admin.
  if (kit.pass.first) {
    const browser = page.context().browser();
    if (!browser) {
      kit.check("cash CA3: a browser for the Admin", false);
    } else {
      const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      const admin = await context.newPage();
      try {
        await admin.goto(
          `${kit.base}/dev/signin?as=admin%40hq.test&next=${encodeURIComponent(PATH)}`,
          { waitUntil: "networkidle" },
        );
        await admin.goto(`${kit.base}${PATH}`, { waitUntil: "networkidle" });
        await admin.waitForSelector('[data-section="cash-weeks"]', { timeout: 30_000 });
        const body = flat(await admin.locator("main").first().innerText());
        const heads = flat(
          await admin.locator('.hqdata-cash__table[data-currency="INR"] thead').innerText(),
        );
        const adminView = await view(false);
        const closing = (
          adminView.tables.find((table) => table.currency === "INR")?.closing ?? []
        ).map(rupees);
        kit.check(
          "cash CA3: as the Admin the page says stipends are left out, has no Stipends column and no name of the ledger, and closes at ₹11,61,000 when the stand-ins are the only feeds",
          body.includes(LEFT_OUT) &&
            !heads.toLowerCase().includes("stipends") &&
            heads.toLowerCase().includes("closing cash") &&
            !body.includes("Walk Intern") &&
            body.includes(closing[13] ?? "—") &&
            (!exactAdmin ||
              (closing[4] === "₹11,41,000" &&
                closing[5] === "₹11,61,000" &&
                closing[13] === "₹11,61,000")),
          { closing, heads },
        );
      } finally {
        await context.close();
      }
    }
  }

  // CA4: the scenarios; with no opening figure in rupees yet (the merged copy's first pass),
  // the section says it needs one, as CA1 does.
  const asked4 = (await view(false)).scenarios;
  const scenarios = asked4 ?? [];
  const raise = scenarios.find((scenario) => scenario.key === "raise_delayed");
  const runsOut = `Cash runs out in ${periodWords(addPeriods(feeds.opening.as_of.slice(0, 7), 7))}.`;
  const scenarioText = flat(
    await page.locator('[data-section="cash-scenarios"]').first().innerText(),
  );
  kit.check(
    "cash CA4: the three scenarios are on the page, and the raise delayed six months runs the cash out",
    asked4 === null
      ? scenarioText.includes("Needs an opening figure in rupees.")
      : scenarios.length === 3 &&
          scenarioText.includes(`Raise delayed six months: ${raise?.words ?? ""}`) &&
          (!exactAdmin || raise?.words === runsOut) &&
          scenarioText.includes(
            "No money is collected from customers yet, so these numbers never reach break-even. The cash decides.",
          ),
    {
      words: raise?.words,
      runsOut,
      scenarios: asked4 === null ? "none: no opening" : scenarios.length,
    },
  );

  // CA5: no per cent sign and no meter.
  const main = await kit.text();
  const meters = await page.locator('main meter, main [role="progressbar"], main .meter').count();
  kit.check(
    "cash CA5: no per cent sign and no meter on the cash view",
    !main.includes("%") && meters === 0,
    meters,
  );
}
