// @vitest-environment node
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { addDays, localDay } from "../../scripts/data/days";
import { walkRows } from "../../scripts/data/questionnaires/walk-seed";
import { writeXlsx } from "../../scripts/data/questionnaires/xlsx-write";
import { openBuild, startBuild, waitForBuild } from "@/lib/data/api/builds";
import {
  openDiligence,
  readDiligence,
  readEntryDiligence,
  saveQuestionnaire,
} from "@/lib/data/api/diligence";
import {
  acceptById,
  addAnswer,
  answerQuestion,
  approveAnswer,
  archiveAnswer,
  clearQuestion,
  closeQuestionnaire,
  importQuestionnaire,
  keepQuestionnaireCopy,
  markQuestionnaireSent,
  previewQuestionnaire,
  questionToLibrary,
  readAnswer,
  readAnswers,
  readQuestionnaire,
  readQuestionnaires,
  reopenQuestionnaire,
  restoreAnswer,
  saveAnswerSetup,
  updateAnswer,
  updateQuestionnaire,
} from "@/lib/data/api/questionnaires";
import { DataRequestError } from "@/lib/data/socket";
import { readXlsx } from "../../scripts/data/questionnaires/xlsx-read";
import { WALKER, startStack, type Stack } from "./helpers";

/**
 * The portal's questionnaires client (ws-notes/security/spec.md §9.5) against the real stack
 * with Files, the waitlist and diligence: every answer passes the portal's own schema, the
 * exports come back as builds, and a refusal comes back as the service's sentence.
 */

let stack: Stack;
let entryId = "";
const dir = mkdtempSync(join(tmpdir(), "hqc-"));
const today = () => localDay(new Date());

beforeAll(async () => {
  stack = await startStack({
    env: true,
    modules: ["files", "leads", "replies", "waitlist", "diligence", "questionnaires"],
  });
  const added = await stack.ask("POST", "/data/waitlist", {
    email: "asha@walkcapital.example",
    firm: "Walk Capital",
    by: WALKER,
  });
  entryId = String((added.json?.entry as { entry_id: string }).entry_id);
}, 60_000);
afterAll(async () => {
  await stack.stop();
  rmSync(dir, { recursive: true, force: true });
});

const input = (question: string, change: Record<string, string> = {}) => ({
  question,
  answer: "Yes, written down.",
  short: "yes",
  topic: "policies",
  caiq_ids: "",
  other_ids: "",
  ssrm: "",
  evidence: [] as string[],
  owner: "Walk Owner",
  ...change,
});

describe("the portal and the questionnaires module agree", () => {
  it("on the library", async () => {
    const made = await addAnswer(
      input("Is a policy kept?", { caiq_ids: "A&A-01.1" }),
      WALKER,
      crypto.randomUUID(),
    );
    const id = made.answer.answer_id;
    await updateAnswer(id, input("Is a written policy kept?", { caiq_ids: "A&A-01.1" }), WALKER);
    const approved = await approveAnswer(
      id,
      { by_name: "Walk Owner", on: "", review_by: "" },
      WALKER,
    );
    expect(approved.answer.state).toBe("approved");
    await archiveAnswer(id, WALKER);
    await restoreAnswer(id, WALKER);
    await saveAnswerSetup("", WALKER);
    const page = await readAnswers({ state: "approved" });
    expect(page.answers.map((answer) => answer.answer_id)).toEqual([id]);
    expect(page.sources_absent).toHaveLength(7);
    const one = await readAnswer(id);
    expect(one.answer.caiq_ids).toEqual(["A&A-01.1"]);
    await expect(addAnswer(input("Hi"), WALKER, crypto.randomUUID())).rejects.toThrow(
      "Write the question as you would ask it, in 3 to 500 characters.",
    );
  });

  it("on a questionnaire, from preview to sent, with both exports as builds", async () => {
    const opened = await openDiligence(entryId, WALKER, crypto.randomUUID());
    await saveQuestionnaire(
      opened.diligence.diligence_id,
      {
        received_on: "",
        due_on: addDays(today(), 4),
        answered_on: "",
        questions: "",
        file: null,
        answers: null,
      },
      WALKER,
    );
    const path = join(dir, "walk.xlsx");
    await writeXlsx(path, { sheet: "Vendor review", rows: walkRows(), wide: [2] });
    const preview = await previewQuestionnaire(
      { content: readFileSync(path).toString("base64"), name: "walk.xlsx" },
      WALKER,
    );
    expect(preview.questions).toBe(12);
    const again = await previewQuestionnaire(
      { import_id: preview.import_id, header_row: "3" },
      WALKER,
    );
    expect(again.guess.question).toBe(2);
    const made = await importQuestionnaire(
      {
        import_id: preview.import_id,
        map: { ...preview.guess, question: preview.guess.question ?? 2 },
        header_row: String(preview.header_row),
        sheet: preview.sheet ?? "",
        title: "",
        kind: "buyer",
        entry_id: entryId,
        diligence_id: "",
        due_on: "",
        received_on: "",
      },
      WALKER,
      crypto.randomUUID(),
    );
    const id = made.questionnaire.questionnaire_id;
    const list = await readQuestionnaires();
    expect(list.questionnaires.map((row) => row.questionnaire_id)).toEqual([id]);
    expect((await readQuestionnaires("closed")).questionnaires).toEqual([]);
    const page = await readQuestionnaire(id);
    expect(page.counts).toEqual({ total: 12, answered: 0, by_id: 1, likely: 0, unanswered: 12 });
    expect((await acceptById(id, WALKER)).accepted).toBe(1);
    await answerQuestion(id, 5, { short: "yes", text: "Enforced for everyone.", ssrm: "" }, WALKER);
    const saved = await questionToLibrary(id, 5, WALKER);
    expect(saved.answer.state).toBe("draft");
    await clearQuestion(id, 5, WALKER);
    await answerQuestion(id, 5, { short: "no", text: "", ssrm: "" }, WALKER);
    const suggested = await readQuestionnaire(id, "unanswered");
    expect(suggested.questions).toHaveLength(10);
    expect(suggested.show).toBe("unanswered");
    await updateQuestionnaire(id, { title: "Walk Capital's vendor review", due_on: "" }, WALKER);
    for (const format of ["csv", "xlsx"] as const) {
      const started = await startBuild({
        kind: `questionnaire_${format}`,
        questionnaire_id: id,
        by: WALKER,
      });
      const build = await waitForBuild(started.build.build_id, { timeoutMs: 10_000, everyMs: 20 });
      expect(build.state).toBe("ready");
      expect(build.name).toBe(`Walk Capital's vendor review answers.${format}`);
      const file = await openBuild(build.build_id);
      const chunks: Buffer[] = [];
      for await (const chunk of file.body) chunks.push(chunk as Buffer);
      const bytes = Buffer.concat(chunks);
      if (format === "csv") expect(bytes.toString("utf8")).toContain("A&A-01.1,Policies,");
      else {
        const sheet = readXlsx(new Uint8Array(bytes)).sheet;
        expect(sheet.name).toBe("Vendor review");
        expect(sheet.rows[0]).toEqual(["Question ID", "Section", "Question", "Answer", "Comments"]);
        expect(sheet.rows[2]![3]).toBe("No");
      }
    }
    const kept = await keepQuestionnaireCopy(id, "csv", WALKER);
    await markQuestionnaireSent(
      id,
      { on: today(), how: "By email", file_id: kept.file_id },
      WALKER,
    );
    const entry = await readEntryDiligence(entryId);
    expect(entry.diligence?.questionnaire.answered_on).toBe(today());
    expect(entry.linked).toMatchObject({
      questionnaire_id: id,
      answered: 2,
      total: 12,
      state: "sent",
    });
    expect((await readDiligence()).diligence[0]!.linked?.questionnaire_id).toBe(id);
    await closeQuestionnaire(id, WALKER);
    await reopenQuestionnaire(id, WALKER);
    const refused = await answerQuestion(id, 999, { answer_id: "nope" }, WALKER).catch(
      (error: unknown) => error,
    );
    expect(refused).toBeInstanceOf(DataRequestError);
    expect((refused as DataRequestError).message).toBe(
      "That question is not in this questionnaire.",
    );
  });
});
