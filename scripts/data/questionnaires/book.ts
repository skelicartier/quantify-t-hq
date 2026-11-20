/**
 * Where the answer library and the questionnaires live (ws-notes/security/spec.md §9.2):
 * `questionnaires/answers.json`, `questionnaires/questionnaires.json`, `questionnaires/setup.json`
 * and `questionnaires/events.jsonl`, and the files read in step 1 of an import, held under
 * core's `tmp/` (emptied at every start) until step 2 or an hour.
 */

import { createHash, randomUUID } from "node:crypto";

import { Refused } from "../../mail-merge/engine";
import type { DataCore } from "../core";
import type { Staff } from "../protocol";
import { writePrivate } from "../statements/book";
import { IMPORT_GONE_WORDS, IMPORT_KEEP_MS } from "./limits";
import type { LibraryAnswer, Questionnaire, QuestionnaireEvent } from "./types";

const ANSWERS = "questionnaires/answers.json";
const QUESTIONNAIRES = "questionnaires/questionnaires.json";
const SETUP = "questionnaires/setup.json";
const EVENTS = "questionnaires/events.jsonl";

export type Pending = {
  import_id: string;
  name: string;
  sha256: string;
  bytes: number;
  at: number;
};

export class QuestionnairesBook {
  readonly #core: DataCore;
  answers: LibraryAnswer[];
  questionnaires: Questionnaire[];
  setup: { review_months: number | null };
  readonly #pending = new Map<string, Pending>();
  /** Test routes only: the next questionnaire made takes this id. */
  pinned: string | null = null;

  constructor(core: DataCore) {
    this.#core = core;
    core.store.ensureDir("questionnaires");
    const answers = core.store.readJson<{ answers?: LibraryAnswer[] }>(ANSWERS, {});
    this.answers = Array.isArray(answers.answers)
      ? answers.answers.filter((item) => typeof item?.answer_id === "string")
      : [];
    const questionnaires = core.store.readJson<{ questionnaires?: Questionnaire[] }>(
      QUESTIONNAIRES,
      {},
    );
    this.questionnaires = Array.isArray(questionnaires.questionnaires)
      ? questionnaires.questionnaires
          .filter((item) => typeof item?.questionnaire_id === "string")
          .map((item) => ({ ...item, other_rows: item.other_rows ?? [], kept: item.kept ?? [] }))
      : [];
    const setup = core.store.readJson<{ review_months?: unknown }>(SETUP, {});
    const months = setup.review_months;
    this.setup = {
      review_months:
        typeof months === "number" && Number.isInteger(months) && months >= 1 && months <= 60
          ? months
          : null,
    };
  }

  saveAnswers(): void {
    this.#core.store.writeJson(ANSWERS, { format: 1, answers: this.answers });
  }

  saveQuestionnaires(): void {
    this.#core.store.writeJson(QUESTIONNAIRES, { format: 1, questionnaires: this.questionnaires });
  }

  saveSetup(): void {
    this.#core.store.writeJson(SETUP, { format: 1, review_months: this.setup.review_months });
  }

  log(target: QuestionnaireEvent["target"], id: string, verb: string, detail: string, by: Staff) {
    const event: QuestionnaireEvent = {
      event_id: randomUUID(),
      target,
      id,
      verb,
      detail,
      by,
      at: this.#core.now(),
    };
    this.#core.store.appendLine(EVENTS, event);
  }

  events(target: QuestionnaireEvent["target"], id: string): QuestionnaireEvent[] {
    return this.#core.store
      .readLines<QuestionnaireEvent>(EVENTS)
      .filter((event) => event?.target === target && event.id === id)
      .reverse();
  }

  answer(id: string | undefined): LibraryAnswer | null {
    return this.answers.find((item) => item.answer_id === id) ?? null;
  }

  mustAnswer(id: string | undefined): LibraryAnswer {
    const found = this.answer(id);
    if (!found) throw new Refused(404, "not_found", "That answer is not in the library.");
    return found;
  }

  questionnaire(id: string | undefined): Questionnaire | null {
    return this.questionnaires.find((item) => item.questionnaire_id === id) ?? null;
  }

  mustQuestionnaire(id: string | undefined): Questionnaire {
    const found = this.questionnaire(id);
    if (!found) throw new Refused(404, "not_found", "That questionnaire is not here.");
    return found;
  }

  // ---------------------------------------------------------------- step 1's files

  #sweep(): void {
    const cutoff = Date.now() - IMPORT_KEEP_MS;
    for (const [id, pending] of this.#pending)
      if (pending.at < cutoff) {
        this.#pending.delete(id);
        this.#core.store.remove(`tmp/questionnaire-${id}`);
      }
  }

  /** Keep the bytes read in step 1 under `tmp/`, for step 2. */
  hold(name: string, bytes: Uint8Array): Pending {
    this.#sweep();
    const pending: Pending = {
      import_id: randomUUID(),
      name,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      bytes: bytes.length,
      at: Date.now(),
    };
    this.#core.store.ensureDir("tmp");
    writePrivate(this.#core, `tmp/questionnaire-${pending.import_id}`, bytes);
    this.#pending.set(pending.import_id, pending);
    return pending;
  }

  /** The bytes held for an import, or a refusal: "That import is no longer here." */
  held(importId: string): { pending: Pending; bytes: Uint8Array } {
    this.#sweep();
    const pending = this.#pending.get(importId);
    const bytes = pending ? this.#core.store.readBytes(`tmp/questionnaire-${importId}`) : null;
    if (!pending || !bytes) throw new Refused(404, "not_found", IMPORT_GONE_WORDS);
    return { pending, bytes };
  }

  /** Step 2 is done: the held bytes go. */
  release(importId: string): void {
    this.#pending.delete(importId);
    this.#core.store.remove(`tmp/questionnaire-${importId}`);
  }
}
