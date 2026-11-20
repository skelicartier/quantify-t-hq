/**
 * Assurance › Summary, Certification, Insurance and Management review, walked against the
 * stand-in (ws-notes/security/spec.md §8.7): the Summary's three tables with every module a
 * line or "Not loaded here", and the Owner's view (AS1); a certification with its Stage 1
 * audit, cyber cover ending soon, and a review with an action, each with its Due row (AS2);
 * at 412px and in both themes (the walk's passes), and on paper with the sources' addresses
 * and no button (AS3); and the outbox not growing (AS4). Every name is invented.
 */

import type { Page } from "playwright";

import { type Shot, type WalkKit } from "./kit";

export const shots: Shot[] = [
  { name: "data-assurance", path: "/data/assurance", ready: "#table-systems" },
  {
    name: "data-assurance-certification",
    path: "/data/assurance/certification",
    ready: '[data-section="certification-list"]',
  },
  {
    name: "data-assurance-insurance",
    path: "/data/assurance/insurance",
    ready: '[data-section="insurance-list"]',
  },
  {
    name: "data-assurance-reviews",
    path: "/data/assurance/reviews",
    ready: '[data-section="reviews-list"]',
  },
];

type Body = Record<string, unknown>;

const pad = (value: number) => String(value).padStart(2, "0");
function addDays(day: string, count: number): string {
  const [year = 0, month = 1, date = 1] = day.split("-").map(Number);
  const moved = new Date(Date.UTC(year, month - 1, date + count));
  return `${moved.getUTCFullYear()}-${pad(moved.getUTCMonth() + 1)}-${pad(moved.getUTCDate())}`;
}
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const words = (day: string) => {
  const [year, month, date] = day.split("-");
  return `${Number(date)} ${MONTHS[Number(month) - 1]} ${year}`;
};

const flat = (text: string) => text.replace(/\s+/g, " ").trim();
const BASE = "/data/assurance";
/** The nine modules, the Summary's rows in order, by the title each row carries when it is absent. */
const MODULE_TITLES = {
  systems: ["Tools", "Devices", "Logs and time", "Backups"],
  buyers: ["Questionnaires", "Customer duties"],
} as const;
const MODULE_NAMES: Record<string, string> = {
  Tools: "tools",
  Devices: "devices",
  "Logs and time": "logs",
  Backups: "recovery",
  Questionnaires: "questionnaires",
  "Customer duties": "profiles",
};

async function until(page: Page, test: () => Promise<boolean>, tries = 150): Promise<boolean> {
  for (let count = 0; count < tries; count += 1) {
    if (await test()) return true;
    await page.waitForTimeout(100);
  }
  return false;
}

async function open(page: Page, kit: WalkKit, path: string, ready: string) {
  await page.goto(`${kit.base}${path}`, { waitUntil: "networkidle" });
  await page.waitForSelector(ready, { timeout: 30_000 });
}

/** Opens a header action's popover, fills it and submits; waits until the service has it. */
async function act(
  page: Page,
  kit: WalkKit,
  path: string,
  ready: string,
  summary: string,
  fill: () => Promise<void>,
  submit: string,
  done: () => Promise<boolean>,
): Promise<boolean> {
  await open(page, kit, path, ready);
  const popover = page.locator("details.popover", {
    has: page.locator("summary", { hasText: summary }),
  });
  await popover.locator("summary").first().click();
  await fill();
  await popover.locator("form button", { hasText: submit }).first().click();
  return until(page, done);
}

export async function walk(page: Page, kit: WalkKit): Promise<void> {
  const here = await kit.socket.ask("GET", BASE);
  if (here.status !== 200) {
    kit.check("assurance: not loaded in this service", true);
    return;
  }
  const today = String(here.body.today);
  const absent = new Set(((here.body.absent as Body[]) ?? []).map((item) => String(item.title)));
  const outbox = kit.outbox().length;

  // ---------------------------------------------------------------- AS1: the Summary
  await open(page, kit, BASE, "#table-systems");
  const rowsOf = async (table: string) =>
    (await page.locator(`#table-${table} tbody tr`).allInnerTexts()).map(flat);
  const systems = await rowsOf("systems");
  const assurance = await rowsOf("assurance");
  const buyers = await rowsOf("buyers");
  // A loaded module's rows carry its own lines' titles ("Logs" for Logs and time, in the merged
  // copy), a stand-in's the module's title: either names the module's row.
  const lines = ((here.body.areas as { lines: Body[] }[] | undefined) ?? []).flatMap(
    (area) => area.lines ?? [],
  );
  const titlesOf = (title: string) => {
    const name = MODULE_NAMES[title] ?? "";
    return [
      title,
      ...lines
        .filter((line) => String(line.key).startsWith(`${name}:`))
        .map((line) => String(line.title)),
    ];
  };
  const everyModule = (rows: string[], titles: readonly string[]) =>
    titles.every((title) =>
      rows.some(
        (row) =>
          titlesOf(title).some((own) => row.startsWith(own)) &&
          (!absent.has(title) || row.includes("Not loaded here")),
      ),
    );
  const opens = await page.locator("#table-assurance a", { hasText: "Open" }).count();
  kit.check(
    "assurance AS1: Systems and Buyers: every module a line or 'Not loaded here'",
    everyModule(systems, MODULE_TITLES.systems) && everyModule(buyers, MODULE_TITLES.buyers),
    { systems, buyers },
  );
  kit.check(
    "assurance AS1: Assurance: U3's seven lines, each with Open",
    [
      "Policies",
      "Penetration test",
      "Findings",
      "Dependency alerts",
      "Certification",
      "Insurance",
      "Management review",
    ].every((title) => assurance.some((row) => row.startsWith(title))) &&
      opens === assurance.length,
    { assurance, opens },
  );
  const summary = flat(await kit.text());
  kit.check(
    "assurance AS1: the Owner sees no left-out line; what buyers ask for, with its source; no meter",
    !summary.includes("are for the Owner only") &&
      summary.includes("What buyers usually ask for") &&
      summary.includes("A penetration test by a third party, at least yearly") &&
      summary.includes("Source, checked") &&
      !summary.includes("%"),
    summary.slice(0, 300),
  );
  await kit.audit("assurance-summary");

  // The walk's Admin: the Summary asked without the Owner flag, and the left-out line.
  if (kit.pass.first) {
    const browser = page.context().browser();
    if (browser) {
      const other = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      try {
        const admin = await other.newPage();
        await admin.goto(`${kit.base}/dev/signin?as=admin%40hq.test&next=%2Fdata%2Fassurance`, {
          waitUntil: "networkidle",
        });
        await admin.goto(`${kit.base}${BASE}`, { waitUntil: "networkidle" });
        const seen = flat(await admin.locator("main").first().innerText());
        kit.check(
          "assurance AS1: the walk's Admin reads that the people ledger's part is left out",
          seen.includes(
            "Who each account and device belongs to in the people ledger, and the days worked out from a last day, are for the Owner only. They are left out here.",
          ) && !seen.includes("Walk Intern"),
          seen.slice(0, 200),
        );
      } finally {
        await other.close();
      }
    }
  }

  if (kit.pass.first) {
    // -------------------------------------------------------------- AS2: what has days
    const stage1 = addDays(today, 10);
    const certified = await act(
      page,
      kit,
      `${BASE}/certification`,
      '[data-section="certification-list"]',
      "Add a certification",
      async () => {
        await page.selectOption("#cert-new-standard", "iso27001");
        await page.selectOption("#cert-new-status", "planning");
        await page.fill("#cert-new-body", "Walk Certification Body");
        await page.fill("#cert-new-accredited", "NABCB");
        await page.fill("#cert-new-stage1", stage1);
      },
      "Record it",
      async () =>
        (
          ((await kit.socket.ask("GET", `${BASE}/certifications`)).body.certifications as Body[]) ??
          []
        ).length > 0,
    );
    const covered = await act(
      page,
      kit,
      `${BASE}/insurance`,
      '[data-section="insurance-list"]',
      "Add a policy",
      async () => {
        await page.selectOption("#insurance-new-kind", "cyber");
        await page.fill("#insurance-new-insurer", "Walk Insurance");
        await page.fill("#insurance-new-number", "WALK-POL-0001");
        await page.fill("#insurance-new-cover", "5000000");
        await page.fill("#insurance-new-from", addDays(today, -340));
        await page.fill("#insurance-new-to", addDays(today, 20));
      },
      "Record it",
      async () =>
        (((await kit.socket.ask("GET", `${BASE}/insurance`)).body.insurance as Body[]) ?? [])
          .length > 0,
    );
    const reviewed = await act(
      page,
      kit,
      `${BASE}/reviews`,
      '[data-section="reviews-list"]',
      "Record a review",
      async () => {
        await page.fill("#review-new-held", today);
        await page.fill("#review-new-attendees", "Walk Owner, Walk Admin");
        await page.fill("#review-new-input-performance", "Two invented findings fixed.");
        await page.fill("#review-new-decisions", "Turn on two-step sign-in everywhere.");
        await page.fill("#review-new-action-1-what", "Walk action: turn on two-step sign-in");
        await page.fill("#review-new-action-1-owner", "Walk Owner");
        await page.fill("#review-new-action-1-due", addDays(today, 3));
      },
      "Record it",
      async () =>
        (((await kit.socket.ask("GET", `${BASE}/reviews`)).body.reviews as Body[]) ?? []).length >
        0,
    );
    kit.check(
      "assurance AS2: a certification, a policy and a review through their forms",
      certified && covered && reviewed,
      {
        certified,
        covered,
        reviewed,
      },
    );
  }

  // ---------------------------------------------------------------- AS2, every pass
  const due = ((await kit.socket.ask("GET", "/data/overview?due=all")).body.due as Body[]) ?? [];
  const has = (kind: string, title: string) =>
    due.some((row) => row.kind === kind && row.title === title);
  kit.check(
    "assurance AS2: the Stage 1 audit, the renewal and the review's action are in Due",
    has("certification", "Stage 1 audit for ISO 27001") &&
      has("insurance", "Renew the cyber insurance with Walk Insurance") &&
      has("management_review", "Walk action: turn on two-step sign-in"),
    due.filter((row) =>
      ["certification", "insurance", "management_review"].includes(String(row.kind)),
    ),
  );
  await open(page, kit, `${BASE}/certification`, '[data-section="certification-list"]');
  const certs = flat(await page.locator("#table-certification").innerText());
  kit.check(
    "assurance AS2: Certification reads its Stage 1 day and body, with the two intervals",
    certs.includes("ISO 27001") &&
      certs.includes("Walk Certification Body") &&
      certs.includes(words(addDays(today, 10))) &&
      flat(await kit.text()).includes(
        "36 months. Three years; the expiry date on the certificate decides.",
      ),
    certs.slice(0, 300),
  );
  await kit.audit("assurance-certification");
  await open(page, kit, `${BASE}/insurance`, '[data-section="insurance-list"]');
  const cover = flat(await page.locator("#table-insurance").innerText());
  kit.check(
    "assurance AS2: Insurance reads the cover, the insurer, the amount and its end",
    cover.includes("Cyber") &&
      cover.includes("Walk Insurance") &&
      cover.includes("WALK-POL-0001") &&
      cover.includes("₹50,00,000") &&
      cover.includes(`Cover to ${words(addDays(today, 20))}`),
    cover.slice(0, 300),
  );
  await kit.audit("assurance-insurance");
  await open(page, kit, `${BASE}/reviews`, '[data-section="reviews-list"]');
  const reviews = flat(await kit.text());
  kit.check(
    "assurance AS2: the review, its open action, the next one a year on, clause 9.3",
    reviews.includes(words(today)) &&
      reviews.includes("1 of 1") &&
      reviews.includes("ISO/IEC 27001:2022 clause 9.3 Management review") &&
      reviews.includes("Every year, HQ's default."),
    reviews.slice(0, 400),
  );
  await kit.audit("assurance-reviews");
  const link = page.locator("#table-management-reviews tbody tr a").first();
  await link.click();
  await page.waitForSelector('[data-section="review-actions"]', { timeout: 30_000 });
  const review = flat(await page.locator('[data-section="review-actions"]').innerText());
  kit.check(
    "assurance AS2: the review's page lists its action with Mark done",
    review.includes("Walk action: turn on two-step sign-in") && review.includes("Mark done"),
    review.slice(0, 200),
  );
  await kit.audit("assurance-review");

  // ---------------------------------------------------------------- AS3: on paper
  await open(page, kit, BASE, "#table-systems");
  await page.emulateMedia({ media: "print" });
  const printed = await page.evaluate(() => {
    const urls = [...document.querySelectorAll(".hqdata-control-ref__url")].filter(
      (element) => getComputedStyle(element).display !== "none",
    ).length;
    const buttons = [...document.querySelectorAll("main button, main .btn, main summary")].filter(
      (element) => {
        const box = (element as HTMLElement).getBoundingClientRect();
        return getComputedStyle(element).display !== "none" && box.width > 0 && box.height > 0;
      },
    ).length;
    return { urls, buttons };
  });
  await page.emulateMedia({ media: "screen" });
  kit.check(
    "assurance AS3: on paper the sources' addresses print and no button does",
    printed.urls > 0 && printed.buttons === 0,
    printed,
  );

  // ---------------------------------------------------------------- AS4: nothing sent
  kit.check("assurance AS4: the outbox did not grow", kit.outbox().length === outbox, {
    before: outbox,
    after: kit.outbox().length,
  });
}
