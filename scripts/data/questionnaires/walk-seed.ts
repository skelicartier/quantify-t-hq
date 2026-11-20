/**
 * The walk's and the tests' invented questionnaire (ws-notes/security/spec.md §9.8): twelve
 * questions a buyer might send, written here (no CAIQ or SIG text: the one CAIQ-shaped ID is
 * the sample "A&A-01.1"), and three library answers, one carrying that ID. The workbook is made
 * with U4's own writer, so the walk's import reads what HQ writes. Every firm is invented.
 */

import { readFileSync, rmSync } from "node:fs";

import { writeXlsx } from "./xlsx-write";

export const WALK_SHEET = "Vendor review";

/** A title row the header guess passes over, a blank row, then the header (row 3). */
export const WALK_TITLE = "Walk Capital 2000 · Vendor security review";
export const WALK_HEADER = ["Question ID", "Section", "Question", "Answer", "Comments"] as const;

export const WALK_LONG_QUESTION =
  "Describe how long application, database and sign-in logs are kept, where they are stored (in which country and with which kind of provider), who can read them, how they are protected from change, and how quickly you could produce a given day's logs to a regulator or to us if we asked for them after an incident affecting our accounts.";

export const WALK_QUESTIONS: readonly { id: string; section: string; text: string }[] = [
  {
    id: "A&A-01.1",
    section: "Policies",
    text: "Do you keep a written information security policy, reviewed every year?",
  },
  {
    id: "WQ-02",
    section: "Access",
    text: "Is multi-factor authentication enforced for all users?",
  },
  { id: "WQ-03", section: "Data", text: "Do you encrypt customer data at rest?" },
  { id: "WQ-04", section: "Incidents", text: "Do you have an incident response plan?" },
  {
    id: "WQ-05",
    section: "Access",
    text: "Are access rights reviewed and removed when staff leave?",
  },
  { id: "WQ-06", section: "Testing", text: "Do you perform annual penetration tests?" },
  { id: "WQ-07", section: "Backups", text: "Describe your backup policy and frequency." },
  {
    id: "WQ-08",
    section: "Suppliers",
    text: "Do you keep a list of the sub-processors that handle our data?",
  },
  {
    id: "WQ-09",
    section: "Devices",
    text: "Are company laptops encrypted and locked after a few minutes idle?",
  },
  { id: "WQ-10", section: "Logging", text: WALK_LONG_QUESTION },
  {
    id: "WQ-11",
    section: "People",
    text: "Do staff sign a confidentiality agreement before they start?",
  },
  { id: "WQ-12", section: "Insurance", text: "Do you hold cyber insurance, and to what limit?" },
];

/** The rows of the walk's sheet: title, blank, header, then the twelve questions. */
export function walkRows(): string[][] {
  return [
    [WALK_TITLE],
    [],
    [...WALK_HEADER],
    ...WALK_QUESTIONS.map((question) => [question.id, question.section, question.text]),
  ];
}

/** Three approved answers: one by its CAIQ ID, two that match their questions by words. */
export const WALK_ANSWERS = [
  {
    question: "Is a written information security policy kept and reviewed each year?",
    answer: "The information security policy is written down and reviewed every year.",
    short: "yes",
    topic: "policies",
    caiq_ids: "A&A-01.1",
    other_ids: "",
  },
  {
    question: "Is customer data encrypted at rest?",
    answer: "Customer data is encrypted at rest with keys the company controls.",
    short: "yes",
    topic: "data_protection",
    caiq_ids: "",
    other_ids: "",
  },
  {
    question: "Is there a written incident response plan?",
    answer: "A written incident response plan names who acts in the first hours.",
    short: "yes",
    topic: "incidents",
    caiq_ids: "",
    other_ids: "",
  },
] as const;

export const WALK_FILE_NAME = "walk-vendor-review.xlsx";

/** The walk's workbook, as bytes: written with the writer at `path`, read back, removed. */
export async function walkWorkbook(path: string): Promise<Uint8Array> {
  try {
    await writeXlsx(path, { sheet: WALK_SHEET, rows: walkRows(), wide: [2, 3, 4] });
    return new Uint8Array(readFileSync(path));
  } finally {
    rmSync(path, { force: true });
  }
}
