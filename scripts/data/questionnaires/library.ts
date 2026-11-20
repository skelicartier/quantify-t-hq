/**
 * The answer library (ws-notes/security/spec.md §9.2, §9.4, §5.5): what an approved answer
 * holds, how it is checked, when it is read again, and what its evidence says today. An
 * answer points at evidence by an `EvidenceOption.ref` another module offers ("policies:
 * policy:access_control") or a Files file ("file:<file_id>"); an answer whose evidence has
 * lapsed says so in a sentence. Pure but for the lookups it is handed.
 */

import { Refused } from "../../mail-merge/engine";
import { addMonths } from "../company-contracts";
import { clean, cleanText, isDay } from "../guard";
import type { FileRow } from "../leads/contracts";
import type { EvidenceOption } from "../security-contracts";
import { notLoaded } from "../../../src/lib/data/labels-controls";
import { invalid } from "../closing/limits";
import { ANSWER_LIMITS, CAIQ_ID_WORDS, OTHER_ID_WORDS, REVIEW_MONTHS_DEFAULT } from "./limits";
import { caiqIdOf, otherIdOf } from "./match";
import {
  ANSWER_TOPICS,
  SHORT_ANSWERS,
  SSRM_VALUES,
  type AnswerTopic,
  type LibraryAnswer,
  type ShortAnswer,
  type Ssrm,
} from "./types";

/** The modules whose records an answer may point at, with the name a page says when one is absent. */
export const EVIDENCE_SOURCES = [
  { name: "tools", label: "Tools" },
  { name: "devices", label: "Devices" },
  { name: "logs", label: "Logs and time" },
  { name: "recovery", label: "Backups" },
  { name: "policies", label: "Policies" },
  { name: "findings", label: "Pen tests and findings" },
  { name: "assurance", label: "Certification and insurance" },
] as const;
export type EvidenceSourceName = (typeof EVIDENCE_SOURCES)[number]["name"];

const EVIDENCE_REF =
  /^(tools|devices|logs|recovery|policies|findings|assurance):[a-z_]{1,40}:[A-Za-z0-9_.-]{1,80}$/;
const FILE_REF = /^file:[A-Za-z0-9-]{1,64}$/;

export const isEvidenceSource = (value: string): value is EvidenceSourceName =>
  EVIDENCE_SOURCES.some((source) => source.name === value);

export const sourceLabel = (name: string): string =>
  EVIDENCE_SOURCES.find((source) => source.name === name)?.label ?? name;

/** The words a refusal of an answer's fields reads. */
export const WORDS = {
  question: "Write the question as you would ask it, in 3 to 500 characters.",
  answer: "Write the answer, in 1 to 4,000 characters.",
  short: "Choose Yes, No, Partly, Not applicable or none.",
  topic: "Choose a topic.",
  ssrm: "Choose who owns the control, or none.",
  caiq: `${CAIQ_ID_WORDS} 20 at most.`,
  other: `${OTHER_ID_WORDS} 10 at most.`,
  evidence: "Point at 10 pieces of evidence at most, each a record HQ offers or a file in Files.",
  file: "That file is not in Files, or it is in the trash.",
  by_name: "Say who approved it.",
  future: "That day has not come yet.",
  full: `Data holds ${ANSWER_LIMITS.answers.toLocaleString("en-GB")} answers at most.`,
} as const;

/** IDs typed in one box: commas, semicolons or new lines between them. */
export function idList(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((item) => clean(item, 80)).filter(Boolean);
  return clean(value, 4_000)
    .split(/[,;\n]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function caiqIdsOf(value: unknown): string[] {
  const given = idList(value);
  const ids = given.map(caiqIdOf);
  if (ids.some((id) => id === null) || ids.length > ANSWER_LIMITS.caiq_ids)
    throw invalid(WORDS.caiq);
  return [...new Set(ids as string[])];
}

export function otherIdsOf(value: unknown): string[] {
  const given = idList(value);
  const ids = given.map(otherIdOf);
  if (ids.some((id) => id === null) || ids.length > ANSWER_LIMITS.other_ids)
    throw invalid(WORDS.other);
  return [...new Set(ids as string[])];
}

export function shortOf(value: unknown): ShortAnswer {
  const text = clean(value, 20);
  if ((SHORT_ANSWERS as readonly string[]).includes(text)) return text as ShortAnswer;
  throw invalid(WORDS.short);
}

export function ssrmOf(value: unknown): Ssrm {
  const text = clean(value, 30);
  if ((SSRM_VALUES as readonly string[]).includes(text)) return text as Ssrm;
  throw invalid(WORDS.ssrm);
}

export function topicOf(value: unknown): AnswerTopic {
  const text = clean(value, 30) || "other";
  if ((ANSWER_TOPICS as readonly string[]).includes(text)) return text as AnswerTopic;
  throw invalid(WORDS.topic);
}

/** Evidence refs, each a form another module offers or a Files file not in the trash. */
export function evidenceOf(value: unknown, fileRow: (fileId: string) => FileRow | null): string[] {
  const refs = [...new Set(idList(value))];
  if (refs.length > ANSWER_LIMITS.evidence) throw invalid(WORDS.evidence);
  for (const ref of refs) {
    if (FILE_REF.test(ref)) {
      const row = fileRow(ref.slice(5));
      if (!row || row.trashed_at) throw new Refused(400, "invalid", WORDS.file);
      continue;
    }
    if (!EVIDENCE_REF.test(ref)) throw invalid(WORDS.evidence);
  }
  return refs;
}

export type AnswerFields = Pick<
  LibraryAnswer,
  | "question"
  | "answer"
  | "short"
  | "topic"
  | "caiq_ids"
  | "other_ids"
  | "ssrm"
  | "evidence"
  | "owner"
>;

/** Every field of an answer, checked as §9.4 says. */
export function answerFieldsOf(
  body: Record<string, unknown>,
  fileRow: (fileId: string) => FileRow | null,
): AnswerFields {
  const question = cleanText(body.question, ANSWER_LIMITS.question + 1);
  if (question.length < ANSWER_LIMITS.question_min || question.length > ANSWER_LIMITS.question)
    throw invalid(WORDS.question);
  const answer = cleanText(body.answer, ANSWER_LIMITS.answer + 1);
  if (answer.length < 1 || answer.length > ANSWER_LIMITS.answer) throw invalid(WORDS.answer);
  return {
    question,
    answer,
    short: shortOf(body.short),
    topic: topicOf(body.topic),
    caiq_ids: caiqIdsOf(body.caiq_ids),
    other_ids: otherIdsOf(body.other_ids),
    ssrm: ssrmOf(body.ssrm),
    evidence: evidenceOf(body.evidence, fileRow),
    owner: cleanText(body.owner, ANSWER_LIMITS.owner),
  };
}

/** An approval: who, and a day not in the future (today when blank); his own review day if typed. */
export function approvalOf(
  body: Record<string, unknown>,
  today: string,
  months: number | null,
): { approved: { by_name: string; on: string }; review_by: string } {
  const byName = cleanText(body.by_name, ANSWER_LIMITS.by_name);
  if (!byName) throw invalid(WORDS.by_name);
  const onGiven = clean(body.on, 10);
  if (onGiven && !isDay(onGiven)) throw invalid("That is not a day.");
  const on = onGiven || today;
  if (on > today) throw invalid(WORDS.future);
  const typed = clean(body.review_by, 10);
  if (typed && !isDay(typed)) throw invalid("That is not a day.");
  return { approved: { by_name: byName, on }, review_by: typed || reviewByOf(on, months) };
}

/** §5.5: `addMonths(approved on, his months ?? 12)`. 31 Jan 2027 → 31 Jan 2028. */
export function reviewByOf(approvedOn: string, months: number | null): string {
  return addMonths(approvedOn, months ?? REVIEW_MONTHS_DEFAULT);
}

/** An approved answer whose review day has come. */
export function reviewDue(answer: LibraryAnswer, today: string): boolean {
  return answer.state === "approved" && answer.review_by !== null && answer.review_by <= today;
}

export type EvidenceView =
  | { ref: string; label: string; href: string; current: boolean; why: string }
  | { ref: string; missing: string };

/**
 * What each piece of an answer's evidence says today: the offered option (current or not),
 * the Files file, or why it cannot be shown (its module is not loaded, it is gone).
 */
export function evidenceViews(
  refs: readonly string[],
  lookup: {
    options: (name: EvidenceSourceName) => EvidenceOption[] | null;
    fileRow: (fileId: string) => FileRow | null;
    filesHere: boolean;
  },
): EvidenceView[] {
  return refs.map((ref): EvidenceView => {
    if (ref.startsWith("file:")) {
      if (!lookup.filesHere) return { ref, missing: notLoaded("Files") };
      const row = lookup.fileRow(ref.slice(5));
      if (!row) return { ref, missing: "That file is no longer in Files." };
      return {
        ref,
        label: row.title,
        href: `/data/files/${row.file_id}`,
        current: !row.trashed_at,
        why: row.trashed_at ? "It is in the trash in Files." : "",
      };
    }
    const name = ref.split(":")[0] ?? "";
    if (!isEvidenceSource(name)) return { ref, missing: "HQ does not know this evidence." };
    const options = lookup.options(name);
    if (options === null) return { ref, missing: notLoaded(sourceLabel(name)) };
    const found = options.find((option) => option.ref === ref);
    if (!found) return { ref, missing: "That record is no longer offered as evidence." };
    return {
      ref,
      label: found.label,
      href: found.href,
      current: found.current,
      why: found.why,
    };
  });
}
