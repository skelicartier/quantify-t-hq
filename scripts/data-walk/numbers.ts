/**
 * Numbers and the monthly update, walked against the stand-in (raise spec §8.14, M1–M8):
 * the six-week table cell for cell against the service (M1); a new yes moving "People who
 * said yes" by exactly one and a no moving nothing (M2); cash and burn with its runway, and
 * a day too old refused (M3); the buyer firm types reading "{n} of {m}" (M4); this month's
 * update asks first, its brackets gone once asks are saved (M5); frozen, then handed to
 * Mail merge as a list he sends himself, the stopped address left out (M6); the monthly
 * Key date (M7); and no target, goal, bar or meter anywhere, the intern seeing only the
 * role line (M8).
 *
 * Without a real investor list the seed installs the stand-in `investors-raise` (test
 * routes only) with three invented firms at Soft commit, Signed and Set aside; one of
 * their people is `partner285@fund285.example`, whom the investors walk puts on the stop
 * list on its first pass. Every person and firm is invented, on `.example`.
 */

import { request } from "node:http";

import type { Page } from "playwright";

import { WALKER, type Shot, type WalkKit } from "./kit";

export const shots: Shot[] = [
  { name: "data-numbers", path: "/data/numbers", ready: "#table-six-weeks" },
  { name: "data-update", path: "/data/numbers/updates/2026-11", ready: ".hqdata-update" },
];

/** The stopped one: the investors walk's first "No". */
const STOPPED = "partner285@fund285.example";
const ROWS = [
  "yeses",
  "firms_joined",
  "named_buyers",
  "calls_booked",
  "calls_held",
  "pilots_started",
  "first_investor_meetings",
] as const;
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
const monthName = (month: string) =>
  `${MONTHS[Number(month.slice(5, 7)) - 1] ?? ""} ${month.slice(0, 4)}`;

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

/**
 * The stand-in investor list (raise spec §8.9): three invented firms at Soft commit, Signed
 * and Set aside, one of whose people the investors walk stops. Posted by the seed, and
 * again at the start of each pass of the numbers and packs walks, since a worker restart
 * (the overview walk's crash) drops it. Never installed over a real one.
 */
export function standInBody(day: string): Record<string, unknown> {
  return {
    funnel: {
      firms: 3,
      not_written: 0,
      first_send_on: day,
      days_since_first_send: 0,
      first_meeting_days: [day],
      stages: [
        { stage: "written", now: 0, reached: 3, of: 3 },
        { stage: "replied", now: 0, reached: 3, of: 3 },
        { stage: "meeting", now: 0, reached: 3, of: 3 },
        { stage: "met", now: 0, reached: 3, of: 3 },
        { stage: "diligence", now: 0, reached: 2, of: 3 },
        { stage: "soft", now: 1, reached: 2, of: 2 },
        { stage: "signed", now: 1, reached: 1, of: 2 },
        { stage: "money_in", now: 0, reached: 0, of: 1 },
      ],
      exits: [{ stage: "set_aside", now: 1 }],
      money: {
        USD: { soft: { amount: 25_000, firms: 1 }, signed: { amount: 50_000, firms: 1 } },
      },
    },
    firms: [
      {
        investor_id: "90190190190190190190190190190190",
        firm: "Walk Fund 901",
        stage: "soft",
        people: [{ email: "partner901@fund901.example", name: "Asha Walk901", replied: true }],
      },
      {
        investor_id: "90290290290290290290290290290290",
        firm: "Walk Fund 902",
        stage: "signed",
        people: [{ email: "partner902@fund902.example", name: "Ben Walk902", replied: true }],
      },
      {
        investor_id: "28528528528528528528528528528528",
        firm: "Walk Fund 285",
        stage: "set_aside",
        people: [{ email: STOPPED, name: "Cara Walk285", replied: false }],
      },
    ],
    by: WALKER,
  };
}

/** The stand-in investor list (only where no real one is loaded) and November's draft. */
export async function seed(socketPath: string): Promise<void> {
  if ((await ask(socketPath, "GET", "/data/numbers")).status !== 200) {
    console.log("[walk] numbers: the module is not loaded here");
    return;
  }
  const day = String((await ask(socketPath, "GET", "/data/_test/day")).body.day ?? "");
  const installed = await ask(socketPath, "POST", "/data/_test/numbers/raise", standInBody(day));
  console.log(`[walk] numbers: ${JSON.stringify(installed.body)}`);
  await ask(socketPath, "GET", "/data/numbers/updates/2026-11");
}

const flat = (text: string) => text.replace(/\s+/g, " ").trim();
const number = (value: number) => new Intl.NumberFormat("en").format(value);

async function until(page: Page, test: () => Promise<boolean>, tries = 150): Promise<boolean> {
  for (let attempt = 0; attempt < tries; attempt += 1) {
    if (await test()) return true;
    await page.waitForTimeout(100);
  }
  return false;
}

type Numbers = {
  today: string;
  weeks: { key: string; label: string }[];
  weekly: Partial<Record<(typeof ROWS)[number], number[]>>;
  named_of: { weekly: number[] };
  raise: unknown;
  update_date_id: string | null;
};

const numbersOf = async (kit: WalkKit) =>
  (await kit.socket.ask("GET", "/data/numbers")).body as unknown as Numbers;

async function open(page: Page, kit: WalkKit, path: string, ready: string): Promise<void> {
  await page.goto(`${kit.base}${path}`, { waitUntil: "networkidle" });
  await page.waitForSelector(ready, { timeout: 30_000 });
}

/** The six-week table as the page draws it: each row's cells after its heading. */
async function sixWeeks(page: Page): Promise<{ heads: string[]; rows: string[][] }> {
  return page.evaluate(() => {
    const table = document.querySelector("#table-six-weeks");
    const heads = [...(table?.querySelectorAll("thead th") ?? [])].map(
      (cell) => cell.textContent?.trim() ?? "",
    );
    const rows = [...(table?.querySelectorAll("tbody tr") ?? [])].map((row) =>
      [...row.children].map((cell) => cell.textContent?.trim() ?? ""),
    );
    return { heads, rows };
  });
}

/** M8: nothing on the page measures anything against a target. */
async function noTarget(page: Page, kit: WalkKit, where: string): Promise<void> {
  const text = flat(await kit.text());
  const meters = await page.evaluate(
    () =>
      document.querySelectorAll(
        'main [role="progressbar"], main [role="meter"], main progress, main meter, main .meter, main .bar-chart',
      ).length,
  );
  kit.check(
    `numbers M8: no target, goal, bar or meter on ${where}`,
    meters === 0 && !/\b(target|goal)\b/i.test(text) && !text.includes("%"),
    `${meters} meters · ${(/.{0,40}(target|goal|%).{0,40}/i.exec(text) ?? [""])[0]}`,
  );
}

/** M6: "Make the Mail merge list" with the default stages, checked against Mail merge itself. */
async function handOver(
  page: Page,
  kit: WalkKit,
  where: { standIn: boolean; month: string; label: string; updatePath: string },
): Promise<void> {
  const { standIn, month, label } = where;
  const recipients = flat(await page.locator("#table-recipients").innerText());
  const shownStopped =
    !standIn || (recipients.includes(STOPPED) && recipients.includes("On the stop list"));
  await kit.audit("update-recipients");
  await page.locator("button", { hasText: "Make the Mail merge list" }).click();
  let message = "";
  await until(
    page,
    async () => {
      const text = flat(await kit.text());
      const found =
        /Made the list “Investor update [^”]+” with (\d+) (?:person|people) in Mail merge\. Open Mail merge to send it yourself\./.exec(
          text,
        );
      message = found?.[0] ?? "";
      return message !== "";
    },
    300,
  );
  const people = Number(/with (\d+)/.exec(message)?.[1] ?? "-1");
  const lists =
    ((await kit.socket.ask("GET", "/lists")).body.lists as
      { id: string; name: string; people: number }[] | undefined) ?? [];
  const made = lists.find((list) => list.name === `Investor update ${label}`);
  const update = (await kit.socket.ask("GET", `/data/numbers/updates/${month}`)).body.update as {
    status: string;
    handed_over: { left_out: { email: string; why: string }[] } | null;
  };
  kit.check(
    `numbers M6: Make the Mail merge list makes “Investor update ${label}” with the people it says`,
    made !== undefined && made.people === people && people > 0 && update.status === "handed_over",
    `${message} · ${made?.people}`,
  );
  if (standIn)
    kit.check(
      "numbers M6: the stopped partner285@fund285.example is left out, On the stop list",
      shownStopped &&
        (update.handed_over?.left_out ?? []).some(
          (item) => item.email === STOPPED && item.why === "On the stop list",
        ),
      update.handed_over?.left_out,
    );
  else kit.check("numbers M6: the real investor list is here; the stand-in was not walked", true);
  kit.check(
    "numbers M6: nothing was sent: the outbox holds no update",
    kit.outbox().every((mail) => !String(mail.subject ?? "").includes("Quantify Terminal:")),
  );
}

export async function walk(page: Page, kit: WalkKit): Promise<void> {
  if ((await kit.socket.ask("GET", "/data/numbers")).status !== 200) {
    kit.check("numbers: not loaded in this service", true);
    return;
  }
  const day = String((await kit.socket.ask("GET", "/data/_test/day")).body.day ?? "");
  await kit.socket.ask("POST", "/data/_test/numbers/raise", standInBody(day));
  const feeds = (await kit.socket.ask("GET", "/data/_test/numbers/feeds")).body;
  const standIn = feeds.standin === true;
  let numbers = await numbersOf(kit);
  const today = numbers.today;
  const month = today.slice(0, 7);
  const label = monthName(month);

  // ---------------------------------------------------------------- M1: the six weeks, cell for cell
  await open(page, kit, "/data/numbers", "#table-six-weeks");
  numbers = await numbersOf(kit);
  const table = await sixWeeks(page);
  const expected = ROWS.filter((row) => numbers.weekly[row] !== undefined).map((row) =>
    (numbers.weekly[row] ?? []).map((value, index) => {
      if (row !== "named_buyers") return number(value);
      const of = numbers.named_of.weekly[index] ?? 0;
      return of === 0 ? number(value) : `${number(value)} of ${number(of)}`;
    }),
  );
  kit.check(
    `numbers M1: six week columns and ${numbers.raise ? "seven" : "six"} rows, each cell the service's count`,
    table.heads.length === 7 &&
      table.rows.length === (numbers.raise ? 7 : 6) &&
      JSON.stringify(table.rows.map((row) => row.slice(1))) === JSON.stringify(expected) &&
      table.heads.at(-1) === numbers.weeks.at(-1)?.label,
    { heads: table.heads, first: table.rows[0] },
  );
  await noTarget(page, kit, "Numbers");
  await kit.audit("numbers");

  // ---------------------------------------------------------------- M2: one more yes, and a no that changes nothing
  if (kit.pass.first) {
    const before = numbers.weekly.yeses?.at(-1) ?? 0;
    // firm3501/firm3502: no other walk writes there (the replies walk's firms are
    // firm3100 to firm3143, one per step and pass).
    const yes = await kit.socket.ask("POST", "/data/replies", {
      email: "asha3501@firm3501.example",
      outcome: "replied_positive",
      words: "Invented: yes, we would like to see it.",
      add_if_missing: true,
      by: WALKER,
    });
    const afterYes = (await numbersOf(kit)).weekly.yeses?.at(-1) ?? 0;
    const no = await kit.socket.ask("POST", "/data/replies", {
      email: "ben3502@firm3502.example",
      outcome: "not_interested",
      words: "Invented: not for us.",
      add_if_missing: true,
      by: WALKER,
    });
    const afterNo = (await numbersOf(kit)).weekly.yeses?.at(-1) ?? 0;
    await open(page, kit, "/data/numbers", "#table-six-weeks");
    const cell = (await sixWeeks(page)).rows[0]?.at(-1);
    kit.check(
      "numbers M2: a new yes moves People who said yes this week by exactly one; a no moves nothing",
      yes.status === 200 &&
        no.status === 200 &&
        afterYes === before + 1 &&
        afterNo === afterYes &&
        cell === number(afterNo),
      `${before} → ${afterYes} → ${afterNo} · cell ${cell}`,
    );
  }

  // ---------------------------------------------------------------- M3: cash and burn
  const moneyForm = page.locator("form", { has: page.locator("#money-cash") });
  await page.locator("summary", { hasText: "Type cash and burn" }).click();
  await moneyForm.locator("#money-currency").selectOption("INR");
  await moneyForm.locator("#money-cash").fill("1200000");
  await moneyForm.locator("#money-burn").fill("150000");
  await moneyForm.locator("#money-on").fill(today);
  await moneyForm.locator("button", { hasText: "Save" }).click();
  let said = await until(page, async () =>
    (await moneyForm.innerText()).includes("Saved. Runway 8.0 months."),
  );
  await open(page, kit, "/data/numbers", "#table-cash-and-runway");
  const cash = flat(await page.locator("#table-cash-and-runway").innerText());
  kit.check(
    "numbers M3: Type cash and burn shows ₹1,200,000 ÷ ₹150,000 = 8.0 months",
    said && cash.includes("₹1,200,000 ÷ ₹150,000 = 8.0 months") && cash.includes("Used"),
    cash.slice(0, 200),
  );
  const [year = 0, mon = 1, date = 1] = today.split("-").map(Number);
  const old = new Date(Date.UTC(year, mon - 1, date - 40)).toISOString().slice(0, 10);
  await page.locator("summary", { hasText: "Type cash and burn" }).click();
  await moneyForm.locator("#money-cash").fill("1200000");
  await moneyForm.locator("#money-burn").fill("150000");
  await moneyForm.locator("#money-on").fill(old);
  await moneyForm.locator("button", { hasText: "Save" }).click();
  said = await until(page, async () =>
    (await moneyForm.innerText()).includes(
      "That is more than 35 days ago. Type figures that are true this month.",
    ),
  );
  kit.check("numbers M3: a True on 40 days back is refused with its sentence", said, old);

  // ---------------------------------------------------------------- M4: buyer firm types
  if (kit.pass.first) {
    const entries =
      ((await kit.socket.ask("GET", "/data/_test/numbers/feeds")).body.entries as
        { entry_id: string; domain: string }[] | null) ?? [];
    const firm = entries.find((entry) => entry.domain === "firm3501.example");
    if (firm)
      await kit.socket.ask("POST", `/data/waitlist/${firm.entry_id}/update`, {
        field: "firm_type",
        value: "Hedge fund",
        by: WALKER,
      });
    await open(page, kit, "/data/numbers", "#table-six-weeks");
    const typesForm = page.locator("form", { has: page.locator("#buyer-type-another") });
    await page.locator("summary", { hasText: "Buyer firm types" }).click();
    await typesForm.locator("#buyer-type-another").fill("Hedge fund");
    await typesForm.locator("button", { hasText: "Save" }).click();
    const saved = await until(page, async () =>
      ((await numbersOf(kit)) as unknown as { buyer_types: string[] }).buyer_types.includes(
        "Hedge fund",
      ),
    );
    await open(page, kit, "/data/numbers", "#table-six-weeks");
    numbers = await numbersOf(kit);
    const named = numbers.weekly.named_buyers?.at(-1) ?? 0;
    const joined = numbers.named_of.weekly.at(-1) ?? 0;
    const cell = (await sixWeeks(page)).rows[2]?.at(-1);
    kit.check(
      "numbers M4: with Hedge fund chosen, the named-buyer row reads “{n} of {m}”, m the firms joined",
      saved && Boolean(firm) && named >= 1 && joined >= named && cell === `${named} of ${joined}`,
      `${cell} · ${named} of ${joined}`,
    );
  }

  // ---------------------------------------------------------------- M5: this month's update, asks first
  const updatePath = `/data/numbers/updates/${month}`;
  await open(page, kit, updatePath, ".hqdata-update");
  const email = () => page.locator(".hqdata-update__text").innerText();
  if (kit.pass.first) {
    const blank = await email();
    await page
      .locator("#update-asks")
      .fill("Introductions to two invented hedge funds\nAn invented CTO-level advisor");
    await page.locator("button", { hasText: "Save the draft" }).click();
    const saved = await until(page, async () =>
      (await page.locator("main").first().innerText()).includes("Saved the draft."),
    );
    await open(page, kit, updatePath, ".hqdata-update");
    const filled = await email();
    kit.check(
      "numbers M5: empty asks read [Up to three asks]; saved asks take its place, before Numbers for",
      blank.includes("[Up to three asks]") &&
        saved &&
        !filled.includes("[Up to three asks]") &&
        filled.includes("1. Introductions to two invented hedge funds") &&
        filled.indexOf("Asks") < filled.indexOf("Numbers for") &&
        filled.startsWith(`Subject: Quantify Terminal: ${label} update`),
      filled.slice(0, 160),
    );
    kit.check(
      "numbers: The email says missing parts are in [brackets]",
      flat(await kit.text()).includes(
        "Missing parts are in [brackets]; Mail merge will not send them until you fill or remove them.",
      ),
    );

    // -------------------------------------------------------------- M6: freeze, then make the list
    await page.locator("button", { hasText: "Freeze the numbers" }).click();
    await until(
      page,
      async () => (await page.locator("button", { hasText: "Use today's numbers" }).count()) === 1,
    );
    await open(page, kit, updatePath, "#update-recipients");
    if ((await page.locator("#table-recipients").count()) === 0 && !standIn)
      // The real investor list (the merged copy): no firm sits at the default stages, so the
      // hand-over is walked with the stages the investors walk leaves firms at.
      await open(page, kit, `${updatePath}?stages=replied,meeting`, "#update-recipients");
    if ((await page.locator("#table-recipients").count()) === 0) {
      kit.check(
        "numbers M6: no firm is at the default stages here; the hand-over was not walked",
        !standIn,
      );
    } else {
      await handOver(page, kit, { standIn, month, label, updatePath });
    }
  } else {
    const text = flat(await kit.text());
    kit.check(
      "numbers: a handed-over update says so and links to Mail merge",
      text.includes("Handed to Mail merge") &&
        (await page.locator('a[href="/mail/merge"]').count()) >= 1,
      text.slice(0, 200),
    );
  }
  await noTarget(page, kit, "the update");
  await kit.audit("update");

  // ---------------------------------------------------------------- M7: the monthly Key date
  if (kit.pass.first) {
    await open(page, kit, "/data/numbers", "#table-six-weeks");
    const button = page.locator("button", { hasText: "Add a monthly reminder to Key dates" });
    const offered = (await button.count()) === 1;
    await button.click();
    const added = await until(page, async () =>
      flat(await kit.text()).includes(
        "Added to Key dates: the 10th of every month, with a reminder two days before.",
      ),
    );
    const dates =
      ((await kit.socket.ask("GET", "/data/dates?view=all")).body.dates as
        { title: string; repeats: string; due_on: string; remind_days: number }[] | undefined) ??
      [];
    const date = dates.find((item) => item.title === "Send the monthly investor update");
    await open(page, kit, "/data/numbers", "#table-six-weeks");
    kit.check(
      "numbers M7: the monthly reminder is a Key date on a 10th, monthly, and the form is gone",
      offered &&
        added &&
        date?.repeats === "monthly" &&
        date.due_on.endsWith("-10") &&
        date.due_on > today &&
        date.remind_days === 2 &&
        (await page
          .locator("button", { hasText: "Add a monthly reminder to Key dates" })
          .count()) === 0,
      date,
    );
  }

  // ---------------------------------------------------------------- M8: the intern sees the role line only
  if (kit.pass.first) {
    const browser = page.context().browser();
    if (browser) {
      const other = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      try {
        const intern = await other.newPage();
        await intern.goto(`${kit.base}/dev/signin?as=intern%40hq.test&next=%2Fdata%2Fnumbers`, {
          waitUntil: "networkidle",
        });
        const pages: string[] = [];
        for (const path of ["/data/numbers", updatePath]) {
          await intern.goto(`${kit.base}${path}`, { waitUntil: "networkidle" });
          pages.push(await intern.locator("main").first().innerText());
        }
        kit.check(
          "numbers M8: as the intern, Numbers and the update say the role line, with no @",
          pages.every(
            (text) => text.includes("Data is for Owners and Admins.") && !text.includes("@"),
          ),
          pages.map((text) => text.slice(0, 80)),
        );
      } finally {
        await other.close();
      }
    }
  }
}
