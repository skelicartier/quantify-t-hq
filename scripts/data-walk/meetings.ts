/**
 * Meetings, walked against the stand-in (ws-notes/company/spec.md §7.10, MT1–MT10): the
 * empty view (MT1); planning the pinned `walk-board` four days out, its notice on Data's
 * Due (MT2); a short notice and its reason (MT3); the meeting moved into the past and
 * recorded as held, with the quorum and the draft-minutes row on Due (MT4); a board
 * resolution under section 179(3) (MT5); an EGM's special resolution adding its MGT-14
 * filing to Key dates (MT6); the minutes from the draft to signing, and the lock (MT7); a
 * note after signing and the signed copy in Files (MT8); a resolution by circulation under
 * section 179(3) (MT9); and the intern (MT10). Key dates comes from the contract file's
 * stand-in where C1's module is not here. Every person is invented.
 */

import type { Page } from "playwright";

import { inventedPdf } from "../data/files/walk-seed";
import { addDays } from "../data/days";
import { dayWords } from "../../src/lib/data/labels-registers";
import { WALKER, type Shot, type WalkKit } from "./kit";

export const WALK_BOARD = "walk-board";

export const shots: Shot[] = [
  { name: "data-company-meetings", path: "/data/company/meetings", ready: "#table-meetings" },
  {
    name: "data-company-meeting",
    path: `/data/company/meetings/${WALK_BOARD}`,
    ready: '[data-section="meeting-minutes"]',
  },
];

const BASE = "/data/company/meetings";
const EGM_TITLE = "Walk extraordinary general meeting";
const PLACEMENT = "Walk private placement";
const AUTHORITY = "Walk allotment authority";
const CIRCULAR = "Walk borrowing by circulation";
const REASON = "Invented: every director agreed to shorter notice.";
const LATER_NOTE = "Invented: the second resolution's number was corrected after signing.";
const S179 =
  "A matter under section 179(3) cannot be passed by circulation; it needs a board meeting. Confirm with your CS.";

const flat = (text: string) => text.replace(/\s+/g, " ").trim();

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

type Row = { meeting_id: string; title: string; serial_title: string; kind: string };

async function meetings(kit: WalkKit): Promise<Row[]> {
  return ((await kit.socket.ask("GET", "/data/meetings")).body.meetings as Row[]) ?? [];
}

async function detail(kit: WalkKit, id: string): Promise<Record<string, unknown>> {
  return (await kit.socket.ask("GET", `/data/meetings/${id}`)).body;
}

async function dueRows(kit: WalkKit): Promise<{ key: string; title: string; due_on: string }[]> {
  return (
    ((await kit.socket.ask("GET", "/data/overview")).body.due as {
      key: string;
      title: string;
      due_on: string;
    }[]) ?? []
  );
}

/** Opens a popover by its label, fills its fields and presses its button; returns what it said. */
async function submit(
  page: Page,
  scope: string,
  label: string,
  fill: () => Promise<void>,
  button: string,
): Promise<string> {
  const popover = page.locator(`${scope} details.popover`, {
    has: page.locator(`summary:text-is("${label}")`),
  });
  await popover.first().locator("summary.popover__trigger").click();
  await fill();
  await popover.first().locator("button", { hasText: button }).click();
  const feedback = popover.first().locator(".form-sent, [role='alert']");
  await feedback
    .first()
    .waitFor({ timeout: 20_000 })
    .catch(() => undefined);
  return flat((await feedback.allInnerTexts().catch(() => [] as string[])).join(" "));
}

export async function walk(page: Page, kit: WalkKit): Promise<void> {
  if ((await kit.socket.ask("GET", "/data/meetings")).status !== 200) {
    kit.check("meetings: not loaded in this service", true);
    return;
  }
  const today = String((await kit.socket.ask("GET", "/data/_test/day")).body.day ?? "");

  // The contract file's stand-in `key-dates`, only where C1's module is not here.
  const keyDates = await kit.socket.ask("POST", "/data/_test/meetings/key-dates", { by: WALKER });
  const realKeyDates = keyDates.body.real === true;

  if (kit.pass.first) {
    // ---------------------------------------------------------------- MT1: empty
    const before = await meetings(kit);
    await page.goto(`${kit.base}${BASE}`, { waitUntil: "networkidle" });
    if (!(await shown(page, kit, ".hqdata-meetings"))) return;
    if (before.length === 0)
      kit.check(
        "meetings MT1: an empty Meetings view shows its empty sentence",
        flat(await kit.text()).includes(
          "No meetings recorded yet. Plan the next board meeting, or record one already held.",
        ),
      );
    else
      kit.check("meetings MT1: meetings were already here, so the empty view is not shown", true);

    // ---------------------------------------------------------------- MT2: plan walk-board
    if (!before.some((row) => row.meeting_id === WALK_BOARD)) {
      await kit.socket.ask("POST", "/data/_test/meetings/pin", { id: WALK_BOARD, by: WALKER });
      const day = addDays(today, 4);
      const said = await submit(
        page,
        ".pagebar__actions",
        "Plan a meeting",
        async () => {
          await page.selectOption("#plan-kind", "board");
          await page.fill("#plan-day", day);
          await page.fill("#plan-time", "11:00");
          await page.fill("#plan-agenda", "Invented: approve the walk budget; note the circulars.");
          if (await page.locator("#plan-board-size").count())
            await page.fill("#plan-board-size", "2");
        },
        "Plan it",
      );
      kit.check(
        "meetings MT2: Plan it says to send the notice by the meeting day less 7",
        said.includes(`Planned. Send the notice by ${dayWords(addDays(today, -3))}.`),
        said,
      );
    }
    const planned = await detail(kit, WALK_BOARD);
    const title = String(planned.serial_title ?? "");
    await page.goto(`${kit.base}/data`, { waitUntil: "networkidle" });
    await shown(page, kit, ".hqdata-due");
    const dueText = flat(await page.locator(".hqdata-due").first().innerText());
    kit.check(
      "meetings MT2: Data's Due has “Send the notice: Board meeting 1, …”, overdue",
      title.startsWith("Board meeting 1, ") &&
        dueText.includes(`Send the notice: ${title}`) &&
        (await dueRows(kit)).some(
          (row) => row.key === `meeting:${WALK_BOARD}:notice` && row.due_on < today,
        ),
      `${title} · ${dueText.slice(0, 160)}`,
    );

    // ---------------------------------------------------------------- MT3: a short notice
    await page.goto(`${kit.base}${BASE}/${WALK_BOARD}`, { waitUntil: "networkidle" });
    if (!(await shown(page, kit, '[data-section="meeting-notice"]'))) return;
    await submit(
      page,
      ".rhead",
      "Record the notice",
      async () => page.fill("#notice-sent", addDays(today, -2)),
      "Record it",
    );
    await page.reload({ waitUntil: "networkidle" });
    let notice = flat(await page.locator('[data-section="meeting-notice"]').innerText());
    kit.check(
      "meetings MT3: a notice two days ago reads 6 days before, and the rule is at least 7",
      notice.includes("6 days before") && notice.includes("The rule is at least 7."),
      notice,
    );
    await submit(
      page,
      ".rhead",
      "Record the notice",
      async () => {
        await page.fill("#notice-sent", addDays(today, -2));
        await page.fill("#notice-why", REASON);
      },
      "Record it",
    );
    await page.reload({ waitUntil: "networkidle" });
    notice = flat(await page.locator('[data-section="meeting-notice"]').innerText());
    kit.check("meetings MT3: the reason it was shorter shows", notice.includes(REASON), notice);

    // ---------------------------------------------------------------- MT4: held 20 days ago
    await kit.socket.ask("POST", "/data/_test/meetings/day", {
      id: WALK_BOARD,
      day: addDays(today, -20),
      by: WALKER,
    });
    await page.goto(`${kit.base}${BASE}/${WALK_BOARD}`, { waitUntil: "networkidle" });
    await submit(
      page,
      ".rhead",
      "Record how it went",
      async () => {
        await page.fill("#held-on", addDays(today, -20));
        await page.fill("#held-chair", "Walk Founder");
        const directors = page.locator('input[name="director"]');
        if ((await directors.count()) >= 2) {
          await directors.nth(0).check();
          await directors.nth(1).check();
        } else {
          await page.fill("#held-other-0-name", "Walk Founder");
          await page.selectOption("#held-other-0-role", "director");
          await page.fill("#held-other-1-name", "Walk Co-founder");
          await page.selectOption("#held-other-1-role", "director");
          await page.selectOption("#held-other-1-how", "video");
        }
      },
      "Record it",
    );
    await page.reload({ waitUntil: "networkidle" });
    const attendees = flat(await page.locator('[data-section="meeting-attendees"]').innerText());
    const due = await dueRows(kit);
    const draft = due.find((row) => row.key === `meeting:${WALK_BOARD}:draft`);
    kit.check(
      "meetings MT4: held with two directors: Quorum: 2 present of 2 needed",
      attendees.includes("Quorum: 2 present of 2 needed."),
      attendees.slice(0, 200),
    );
    kit.check(
      "meetings MT4: Due has “Send the draft minutes: …” due 5 days ago",
      Boolean(draft?.title.startsWith("Send the draft minutes: Board meeting 1, ")) &&
        draft?.due_on === addDays(today, -5),
      draft,
    );

    // ---------------------------------------------------------------- MT5: 179(3) board resolution
    await submit(
      page,
      ".rhead",
      "Add a resolution",
      async () => {
        await page.fill("#resolution-new-title", AUTHORITY);
        await page.fill(
          "#resolution-new-text",
          "Invented: authority to allot shares to the walk round.",
        );
        await page.check("#resolution-new-s179");
      },
      "Add the resolution",
    );
    await page.reload({ waitUntil: "networkidle" });
    const authority = flat(
      await page.locator("#table-resolutions tr", { hasText: AUTHORITY }).first().innerText(),
    );
    kit.check(
      "meetings MT5: a board resolution under section 179(3) reads Ask your CS",
      authority.includes("Ask your CS"),
      authority,
    );

    // ---------------------------------------------------------------- MT6: EGM, special, MGT-14
    const held = addDays(today, -3);
    await page.goto(`${kit.base}${BASE}`, { waitUntil: "networkidle" });
    const recorded = await submit(
      page,
      ".pagebar__actions",
      "Plan a meeting",
      async () => {
        await page.selectOption("#plan-kind", "egm");
        await page.fill("#plan-title", EGM_TITLE);
        await page.fill("#plan-day", held);
        await page.check("#plan-held");
      },
      "Plan it",
    );
    const egm = (await meetings(kit)).find((row) => row.title === EGM_TITLE);
    kit.check(
      "meetings MT6: an EGM recorded as held says to add who was there",
      recorded.includes("Recorded as held. Add who was there.") && Boolean(egm),
      recorded,
    );
    if (egm) {
      await page.goto(`${kit.base}${BASE}/${egm.meeting_id}`, { waitUntil: "networkidle" });
      await submit(
        page,
        ".rhead",
        "Add a resolution",
        async () => {
          await page.fill("#resolution-new-title", PLACEMENT);
          await page.selectOption("#resolution-new-kind", "special");
        },
        "Add the resolution",
      );
      await page.reload({ waitUntil: "networkidle" });
      const row = flat(
        await page.locator("#table-resolutions tr", { hasText: PLACEMENT }).first().innerText(),
      );
      const titles = realKeyDates
        ? (
            ((await kit.socket.ask("GET", "/data/dates?view=all")).body.dates as {
              title: string;
            }[]) ?? []
          ).map((date) => date.title)
        : (
            ((await kit.socket.ask("GET", "/data/_test/meetings/key-dates")).body.dates as {
              title: string;
            }[]) ?? []
          ).map((date) => date.title);
      kit.check(
        "meetings MT6: the special resolution reads By the meeting day plus 30, and Key dates holds its MGT-14",
        row.includes(`By ${dayWords(addDays(held, 30))}`) &&
          titles.includes(`MGT-14: “${PLACEMENT}”`),
        `${row} · ${titles.join(" | ").slice(0, 200)}`,
      );
    }

    // ---------------------------------------------------------------- MT7: the minutes
    await page.goto(`${kit.base}${BASE}/${WALK_BOARD}`, { waitUntil: "networkidle" });
    if (!(await shown(page, kit, '[data-section="meeting-minutes"]'))) return;
    const minutes = '[data-section="meeting-minutes"]';
    await submit(
      page,
      minutes,
      "Write the minutes",
      async () =>
        page.fill(
          "#minutes-text",
          "Invented minutes. Present: Walk Founder (chair), Walk Co-founder. Resolved: the walk allotment authority.",
        ),
      "Save the minutes",
    );
    await page.reload({ waitUntil: "networkidle" });
    await submit(
      page,
      minutes,
      "Mark the draft sent",
      async () => page.fill("#minutes-draft-on", addDays(today, -6)),
      "Mark it sent",
    );
    await page.reload({ waitUntil: "networkidle" });
    const timetable = flat(await page.locator("#table-minutes-timetable").innerText());
    kit.check(
      "meetings MT7: with the draft out six days ago, comments close tomorrow",
      timetable.includes(dayWords(addDays(today, 1))),
      timetable,
    );
    const pdf = await inventedPdf(
      ["Invented signed minutes of Board meeting 1 of Walk Company Private Limited."],
      "Walk signed minutes",
    );
    await submit(
      page,
      minutes,
      "Mark the minutes signed",
      async () => {
        await page.fill("#minutes-signed-on", today);
        await page.setInputFiles("#minutes-signed-file", {
          name: "walk-signed-minutes.pdf",
          mimeType: "application/pdf",
          buffer: Buffer.from(pdf),
        });
      },
      "Mark them signed",
    );
    await until(page, async () => {
      const meeting = (await detail(kit, WALK_BOARD)).meeting as
        { minutes: { signed: unknown } } | undefined;
      return Boolean(meeting?.minutes.signed);
    });
    await page.reload({ waitUntil: "networkidle" });
    const body = flat(await kit.text());
    const direct = await kit.socket.ask("POST", `/data/meetings/${WALK_BOARD}/minutes`, {
      text: "Changed after signing",
      by: WALKER,
    });
    kit.check(
      "meetings MT7: signed: the lock shows, Edit is gone, and a direct change is refused minutes_signed",
      body.includes("The minutes are locked.") &&
        (await page.locator("summary", { hasText: /^Edit$/ }).count()) === 0 &&
        direct.status === 409 &&
        (direct.body.error as { code?: string } | undefined)?.code === "minutes_signed",
      `${direct.status} · ${body.slice(0, 120)}`,
    );

    // ---------------------------------------------------------------- MT8: a note after signing
    await submit(
      page,
      minutes,
      "Add a note after signing",
      async () => page.fill("#minutes-later-note", LATER_NOTE),
      "Add the note",
    );
    await page.reload({ waitUntil: "networkidle" });
    const signedPage = await detail(kit, WALK_BOARD);
    const fileId = (signedPage.signed_file as { file_id?: string } | null)?.file_id ?? "";
    const file = fileId ? (await kit.socket.ask("GET", `/data/files/${fileId}`)).body : {};
    kit.check(
      "meetings MT8: the note after signing is listed, and the signed copy is in 02 Board and shareholder meetings",
      flat(await page.locator(minutes).innerText()).includes(LATER_NOTE) &&
        JSON.stringify(file).includes("02 Board and shareholder meetings"),
      fileId,
    );

    // ---------------------------------------------------------------- MT9: circular under 179(3)
    await page.goto(`${kit.base}${BASE}`, { waitUntil: "networkidle" });
    const circular = await submit(
      page,
      ".pagebar__actions",
      "Record a resolution by circulation",
      async () => {
        await page.fill("#circular-passed", today);
        await page.fill("#circular-title", CIRCULAR);
        await page.fill("#circular-text", "Invented: borrow from the walk bank.");
        await page.check("#circular-s179");
      },
      "Record it",
    );
    kit.check(
      "meetings MT9: a resolution by circulation under section 179(3) warns it needs a board meeting",
      circular.includes(S179),
      circular,
    );
  }

  // ---------------------------------------------------------------- every pass: the pages
  await page.goto(`${kit.base}${BASE}`, { waitUntil: "networkidle" });
  if (!(await shown(page, kit, "#table-meetings"))) return;
  const list = flat(await page.locator("#table-meetings").innerText());
  kit.check(
    "meetings: the list shows the board meeting, signed, and the EGM",
    list.includes("Board meeting 1, ") && list.includes(EGM_TITLE) && list.includes("Signed "),
    list.slice(0, 200),
  );
  await kit.audit("company-meetings");
  await page.goto(`${kit.base}${BASE}/${WALK_BOARD}`, { waitUntil: "networkidle" });
  if (!(await shown(page, kit, '[data-section="meeting-minutes"]'))) return;
  kit.check(
    "meetings: walk-board shows its lock and its note after signing",
    flat(await kit.text()).includes("The minutes are locked.") &&
      flat(await kit.text()).includes(LATER_NOTE),
  );
  await kit.audit("company-meeting");

  // ---------------------------------------------------------------- MT10: the intern
  if (kit.pass.first) {
    const browser = page.context().browser();
    if (!browser) kit.check("meetings MT10: a browser for the intern", false);
    else {
      const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      const intern = await context.newPage();
      try {
        await intern.goto(`${kit.base}/dev/signin?as=intern%40hq.test&next=%2Fdata`, {
          waitUntil: "networkidle",
        });
        const said: string[] = [];
        for (const path of [BASE, `${BASE}/${WALK_BOARD}`]) {
          await intern.goto(`${kit.base}${path}`, { waitUntil: "networkidle" });
          const text = await intern.locator("main").first().innerText();
          if (!text.includes("Data is for Owners and Admins.") || text.includes("@"))
            said.push(`${path}: ${flat(text).slice(0, 80)}`);
        }
        kit.check(
          "meetings MT10: as the intern, the meetings pages say Data is for Owners and Admins., with no address",
          said.length === 0,
          said,
        );
      } finally {
        await context.close();
      }
    }
  }
}
