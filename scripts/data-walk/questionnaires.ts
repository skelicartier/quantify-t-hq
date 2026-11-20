/**
 * Questionnaires and the answer library, walked against the stand-in (ws-notes/security/spec.md
 * §9.8 QU1–QU7): the empty Questionnaires and Answer library pages (QU1); three answers added
 * and approved, one with the CAIQ ID "A&A-01.1" (QU2); an invented workbook (made by the
 * service's own writer) imported for the walk's waitlist firm, the preview's map and "12
 * questions" (QU3); "Accept the 1 match by ID" and two more answered, "3 of 12 answered" (QU4);
 * both exports downloaded and read back (QU5); a copy kept and the questionnaire marked sent,
 * the firm's Diligence row reading answered and nothing sent (QU6); 412px with the long question
 * wrapping, never cut (QU7). Every firm and question is invented.
 */

import { readFileSync } from "node:fs";
import { request } from "node:http";

import type { Page } from "playwright";

import { WALK_ANSWERS, WALK_LONG_QUESTION } from "../data/questionnaires/walk-seed";
import { readXlsx } from "../data/questionnaires/xlsx-read";
import { WALK_ENTRIES } from "../data/waitlist/walk-seed";
import { WALKER, type Shot, type WalkKit } from "./kit";

/** The walk's questionnaire takes this id, so the harness can open it. */
export const WALK_QUESTIONNAIRE_ID = "5e0a0000-0000-4000-8000-00000000a001";

const BASE = "/data/waitlist/diligence";

export const shots: Shot[] = [
  { name: "data-questionnaires", path: `${BASE}/questionnaires`, ready: ".hqdata-questionnaires" },
  {
    name: "data-questionnaire",
    path: `${BASE}/questionnaires/${WALK_QUESTIONNAIRE_ID}`,
    ready: ".hqdata-questionnaires",
  },
  { name: "data-answers", path: `${BASE}/answers`, ready: ".hqdata-questionnaires" },
];

const QUESTIONNAIRES_EMPTY =
  "No questionnaires yet. When a buyer sends their spreadsheet, import it here: approved answers are matched to their questions, and the file goes back to them with their own columns.";
const ANSWERS_EMPTY =
  "No answers yet. Write each one once, approve it, and point it at its evidence: the next questionnaire is then mostly matching.";

function ask(
  socketPath: string,
  method: "GET" | "POST",
  path: string,
  body?: unknown,
): Promise<number> {
  return new Promise((resolve) => {
    const payload = body === undefined ? null : Buffer.from(JSON.stringify(body));
    const outgoing = request(
      {
        socketPath,
        path,
        method,
        headers: payload
          ? { "content-type": "application/json", "content-length": payload.length }
          : {},
      },
      (response) => {
        response.resume();
        response.on("end", () => resolve(response.statusCode ?? 0));
      },
    );
    outgoing.on("error", () => resolve(0));
    if (payload) outgoing.write(payload);
    outgoing.end();
  });
}

/** Nothing to make before the walk but the pinned id: QU1 wants the pages empty. Safe twice. */
export async function seed(socketPath: string): Promise<void> {
  if ((await ask(socketPath, "GET", "/data/questionnaires")) !== 200) {
    console.log("[walk] questionnaires: the module is not loaded here");
    return;
  }
  await ask(socketPath, "POST", "/data/_test/questionnaires/pin", {
    questionnaire_id: WALK_QUESTIONNAIRE_ID,
    by: WALKER,
  });
}

const flat = (text: string) => text.replace(/\s+/g, " ").trim();
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const short = (day: string) => `${Number(day.slice(8))} ${MONTHS[Number(day.slice(5, 7)) - 1]}`;

function plus(day: string, count: number): string {
  const [year = 0, month = 1, date = 1] = day.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, date + count)).toISOString().slice(0, 10);
}

async function until(page: Page, test: () => Promise<boolean>, tries = 150): Promise<boolean> {
  for (let attempt = 0; attempt < tries; attempt += 1) {
    if (await test()) return true;
    await page.waitForTimeout(100);
  }
  return false;
}

async function open(page: Page, kit: WalkKit, path: string, ready: string): Promise<boolean> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    await page.goto(`${kit.base}${path}`, { waitUntil: "networkidle" });
    const found = await page
      .waitForSelector(ready, { timeout: 30_000 })
      .then(() => true)
      .catch(() => false);
    if (found) return true;
  }
  kit.check(`questionnaires: ${path} shows ${ready}`, false, flat(await kit.text()).slice(0, 200));
  return false;
}

type Row = { questionnaire_id: string; answered: number; total: number; state: string };
type AnswerLine = { answer_id: string; question: string; state: string; caiq_ids: string[] };

async function questionnaires(kit: WalkKit): Promise<Row[]> {
  return ((await kit.socket.ask("GET", "/data/questionnaires")).body.questionnaires ?? []) as Row[];
}
async function answers(kit: WalkKit): Promise<AnswerLine[]> {
  const all: AnswerLine[] = [];
  for (const state of ["approved", "draft"])
    all.push(
      ...(((await kit.socket.ask("GET", `/data/answers?state=${state}`)).body.answers ??
        []) as AnswerLine[]),
    );
  return all;
}
async function mine(kit: WalkKit) {
  const answer = await kit.socket.ask("GET", `/data/questionnaires/${WALK_QUESTIONNAIRE_ID}`);
  return answer.status === 200
    ? (answer.body as {
        questionnaire: {
          state: string;
          kept: { file_id: string }[];
          sent: { on: string } | null;
        };
        counts: { answered: number; total: number };
      })
    : null;
}

export async function walk(page: Page, kit: WalkKit): Promise<void> {
  if ((await kit.socket.ask("GET", "/data/questionnaires")).status !== 200) {
    kit.check("questionnaires: not loaded in this service", true);
    return;
  }
  const today = String((await kit.socket.ask("GET", "/data/_test/day")).body.day ?? "");
  const entryId = WALK_ENTRIES.firm;
  const outboxAtStart = kit.outbox().length;
  const questionnairePath = `${BASE}/questionnaires/${WALK_QUESTIONNAIRE_ID}`;

  if (kit.pass.first) {
    // ---------------------------------------------------------------- QU1: the empty pages
    const fresh = (await questionnaires(kit)).length === 0 && (await answers(kit)).length === 0;
    if (fresh) {
      await open(page, kit, BASE, "#table-buyer-diligence, .hqdata-diligence");
      const buttons = await page
        .locator(`main a[href="${BASE}/questionnaires"], main a[href="${BASE}/answers"]`)
        .count();
      await open(page, kit, `${BASE}/questionnaires`, ".hqdata-questionnaires");
      const list = flat(await kit.text());
      await kit.audit("questionnaires-empty");
      await open(page, kit, `${BASE}/answers`, ".hqdata-questionnaires");
      const library = flat(await kit.text());
      await kit.audit("answers-empty");
      kit.check(
        "questionnaires QU1: Diligence's two buttons lead to the empty Questionnaires and Answer library",
        buttons === 2 &&
          list.includes(QUESTIONNAIRES_EMPTY) &&
          library.includes(ANSWERS_EMPTY) &&
          library.includes(
            "Every year, HQ's default. An approved answer is read again a year after it was approved.",
          ),
        `${buttons} · ${list.slice(0, 120)} · ${library.slice(0, 120)}`,
      );
    } else kit.check("questionnaires QU1: the pages were not empty (a second run)", true);

    // ---------------------------------------------------------------- QU2: three answers, approved
    for (const item of WALK_ANSWERS) {
      if ((await answers(kit)).some((answer) => answer.question === item.question)) continue;
      await open(page, kit, `${BASE}/answers`, ".hqdata-questionnaires");
      await page.locator("summary", { hasText: "Add an answer" }).click();
      const form = page.locator("form", { has: page.locator("#answer-new-question") });
      await form.locator("#answer-new-question").fill(item.question);
      await form.locator("#answer-new-answer").fill(item.answer);
      await form.locator("#answer-new-short").selectOption(item.short);
      await form.locator("#answer-new-topic").selectOption(item.topic);
      if (item.caiq_ids) await form.locator("#answer-new-caiq").fill(item.caiq_ids);
      await form.locator("button", { hasText: "Add the answer" }).click();
      await until(page, async () =>
        (await answers(kit)).some((answer) => answer.question === item.question),
      );
    }
    for (const answer of await answers(kit)) {
      if (answer.state === "approved") continue;
      await open(page, kit, `${BASE}/answers/${answer.answer_id}`, ".hqdata-questionnaires");
      await page.locator("summary", { hasText: /^Approve$/ }).click();
      await page
        .locator("form", { has: page.locator("#approve-by") })
        .locator("button", {
          hasText: /^Approve$/,
        })
        .click();
      await until(page, async () =>
        (await answers(kit)).some(
          (line) => line.answer_id === answer.answer_id && line.state === "approved",
        ),
      );
    }
    const approved = (await answers(kit)).filter((answer) => answer.state === "approved");
    kit.check(
      "questionnaires QU2: three answers added and approved, one with the CAIQ ID A&A-01.1",
      WALK_ANSWERS.every((item) => approved.some((answer) => answer.question === item.question)) &&
        approved.some((answer) => answer.caiq_ids.includes("A&A-01.1")),
      approved.map((answer) => answer.question),
    );

    // ---------------------------------------------------------------- QU3: import the invented workbook
    if (!(await mine(kit))) {
      const diligence = (await kit.socket.ask("GET", `/data/diligence/for-entry/${entryId}`)).body
        .diligence as { diligence_id: string } | null;
      let diligenceId = diligence?.diligence_id ?? "";
      if (!diligenceId) {
        const opened = await kit.socket.ask("POST", "/data/diligence", {
          entry_id: entryId,
          attempt: crypto.randomUUID(),
          by: WALKER,
        });
        diligenceId = String(
          (opened.body.diligence as { diligence_id?: string } | undefined)?.diligence_id ?? "",
        );
      }
      await kit.socket.ask("POST", `/data/diligence/${diligenceId}/questionnaire`, {
        due_on: plus(today, 5),
        by: WALKER,
      });
      await kit.socket.ask("POST", "/data/_test/questionnaires/pin", {
        questionnaire_id: WALK_QUESTIONNAIRE_ID,
        by: WALKER,
      });
      const workbook = (
        await kit.socket.ask("POST", "/data/_test/questionnaires/seed", {
          workbook: true,
          by: WALKER,
        })
      ).body as { name?: string; content?: string };
      await open(page, kit, `${BASE}/questionnaires/new?entry=${entryId}`, "#questionnaire-file");
      await page.locator("#questionnaire-file").setInputFiles({
        name: workbook.name ?? "walk-vendor-review.xlsx",
        mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        buffer: Buffer.from(workbook.content ?? "", "base64"),
      });
      await page.locator("button", { hasText: "Read the file" }).click();
      const read = await until(page, async () =>
        flat(await page.locator(".hqdata-qimport").innerText()).includes(
          "12 questions are under it",
        ),
      );
      const said = flat(await page.locator(".hqdata-qimport").innerText());
      const map = {
        question: await page.locator("#questionnaire-map-question").inputValue(),
        id: await page.locator("#questionnaire-map-id").inputValue(),
        section: await page.locator("#questionnaire-map-section").inputValue(),
        answer: await page.locator("#questionnaire-map-answer").inputValue(),
        comment: await page.locator("#questionnaire-map-comment").inputValue(),
      };
      kit.check(
        "questionnaires QU3: the preview reads the header at row 3, guesses the map, and says 12 questions",
        read &&
          said.includes("the header is row 3") &&
          JSON.stringify(map) ===
            JSON.stringify({ question: "2", id: "0", section: "1", answer: "3", comment: "4" }) &&
          (await page.locator("button", { hasText: "Import 12 questions" }).count()) === 1,
        `${said.slice(0, 200)} · ${JSON.stringify(map)}`,
      );
      await kit.audit("questionnaire-preview");
      await page.locator("button", { hasText: "Import 12 questions" }).click();
      await page.waitForURL(`**${questionnairePath}`, { timeout: 30_000 }).catch(() => undefined);
      kit.check(
        "questionnaires QU3: Import opens the questionnaire, linked to the firm's diligence",
        page.url().endsWith(questionnairePath) && (await mine(kit))?.counts.total === 12,
        page.url(),
      );
    }

    // ---------------------------------------------------------------- QU4: accept by ID, answer two more
    const before = await mine(kit);
    if (before && before.counts.answered === 0) {
      await open(page, kit, questionnairePath, "#table-questions");
      await page.locator("button", { hasText: "Accept the 1 match by ID" }).click();
      await until(page, async () => ((await mine(kit))?.counts.answered ?? 0) >= 1);
      for (const row of [6, 7]) {
        await open(page, kit, questionnairePath, "#table-questions");
        await page
          .locator(`#question-${row} button[aria-label="Use this answer for row ${row}"]`)
          .first()
          .click();
        await until(page, async () => ((await mine(kit))?.counts.answered ?? 0) >= row - 4);
      }
    }
    await open(page, kit, `/data/waitlist/${entryId}`, '[data-section="waitlist-diligence"]');
    const section = flat(await page.locator('[data-section="waitlist-diligence"]').innerText());
    const due = ((await kit.socket.ask("GET", "/data/overview")).body.due ?? []) as {
      title: string;
      sub: string;
    }[];
    kit.check(
      "questionnaires QU4: the count reads 3 of 12 answered, on the firm's Diligence and in Due",
      section.includes("3 of 12 answered") &&
        due.some(
          (row) =>
            row.title === "Answer Walk Capital 2000's questionnaire" &&
            row.sub === "Diligence · their questionnaire · 3 of 12 answered",
        ),
      `${section.slice(0, 200)} · ${due
        .map((row) => `${row.title}: ${row.sub}`)
        .join(" | ")
        .slice(0, 300)}`,
    );

    // ---------------------------------------------------------------- QU5: both exports, read back
    await open(page, kit, questionnairePath, "#table-questions");
    const files: Record<string, Buffer> = {};
    for (const format of ["CSV", "XLSX"]) {
      const [download] = await Promise.all([
        page.waitForEvent("download", { timeout: 60_000 }),
        page.locator("main a", { hasText: `Export ${format}` }).click(),
      ]);
      const path = await download.path();
      files[format] = path ? readFileSync(path) : Buffer.alloc(0);
    }
    const csv = files.CSV?.toString("utf8") ?? "";
    let xlsxRows: string[][] = [];
    try {
      xlsxRows = readXlsx(new Uint8Array(files.XLSX ?? Buffer.alloc(0))).sheet.rows;
    } catch {
      xlsxRows = [];
    }
    kit.check(
      "questionnaires QU5: CSV and XLSX download, with their header and the three answers in their cells",
      csv.startsWith("﻿Question ID,Section,Question,Answer,Comments") &&
        xlsxRows[0]?.join("|") === "Question ID|Section|Question|Answer|Comments" &&
        [1, 3, 4].every((index) => xlsxRows[index]?.[3] === "Yes") &&
        xlsxRows[2]?.[3] === undefined,
      `${csv.slice(0, 80)} · ${JSON.stringify(xlsxRows.slice(0, 2))}`,
    );

    // ---------------------------------------------------------------- QU6: keep a copy, mark as sent
    const sentBefore = await mine(kit);
    if (sentBefore && sentBefore.questionnaire.state === "open") {
      await page.locator("summary", { hasText: "Keep a copy in Files" }).click();
      await page
        .locator("form", { has: page.locator("#keep-format") })
        .locator("button", {
          hasText: "Keep the copy",
        })
        .click();
      await until(page, async () => ((await mine(kit))?.questionnaire.kept.length ?? 0) >= 1);
      await open(page, kit, questionnairePath, "#table-questions");
      await page.locator("summary", { hasText: "Mark as sent" }).click();
      const form = page.locator("form", { has: page.locator("#sent-how") });
      await form.locator("#sent-on").fill(today);
      await form.locator("#sent-how").fill("By email to their security team");
      await form.locator("button", { hasText: "Record it" }).click();
      await until(page, async () => (await mine(kit))?.questionnaire.state === "sent");
    }
    await open(page, kit, BASE, "#table-buyer-diligence");
    const row = flat(
      await page
        .locator("#table-buyer-diligence tr", { hasText: "Walk Capital 2000" })
        .first()
        .innerText(),
    );
    const after = await mine(kit);
    kit.check(
      "questionnaires QU6: a copy kept and marked sent; the firm's Diligence row reads answered; nothing sent",
      (after?.questionnaire.kept.length ?? 0) >= 1 &&
        after?.questionnaire.state === "sent" &&
        row.includes(`Answered ${short(today)}`) &&
        kit.outbox().length === outboxAtStart,
      `${row} · ${after?.questionnaire.state}`,
    );
  }

  // ---------------------------------------------------------------- every pass: the pages, no %
  for (const [path, name] of [
    [`${BASE}/questionnaires`, "questionnaires"],
    [`${BASE}/answers`, "answers"],
  ] as const) {
    if (!(await open(page, kit, path, ".hqdata-questionnaires"))) return;
    const text = flat(await kit.text());
    kit.check(
      `questionnaires: ${name} says no "%" and no demo`,
      !text.includes("%"),
      text.slice(0, 120),
    );
    await kit.audit(name);
  }
  if (await mine(kit)) {
    if (!(await open(page, kit, questionnairePath, "#table-questions"))) return;
    const text = flat(await kit.text());
    await kit.audit("questionnaire");
    // ---------------------------------------------------------------- QU7: 412px, a long question wraps
    if (kit.pass.width === "phone") {
      const cell = page.locator("#question-13 .hqdata-qtext").first();
      const fits = await cell.evaluate(
        (element) =>
          element.scrollWidth <= element.clientWidth + 1 && element.getClientRects().length > 0,
      );
      const words = flat(await cell.innerText());
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      kit.check(
        "questionnaires QU7: at 412px the long question wraps whole, the page does not scroll sideways, no %",
        fits && words === WALK_LONG_QUESTION && overflow <= 1 && !text.includes("%"),
        `${overflow}px · ${words.length} of ${WALK_LONG_QUESTION.length} characters`,
      );
    }
  }
}
