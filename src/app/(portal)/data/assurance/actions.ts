"use server";

import { attemptOf, copyFrom, idOf, isState } from "@/components/data/meetings/form-values";
import { fieldValue } from "@/lib/auth/forms";
import * as assurance from "@/lib/data/api/assurance";
import * as findings from "@/lib/data/api/findings";
import * as policies from "@/lib/data/api/policies";
import { gate, refreshData, refusal, refused, sent, staffOf } from "@/lib/data/gate";
import { REVIEW_INPUT_KEYS } from "@/lib/data/labels-assurance";
import { countWords } from "@/lib/data/labels-controls";
import type { ActionState } from "@/lib/forms/action-state";

/**
 * Assurance's writes (ws-notes/security/spec.md §8): linking a policy to its document in
 * Files and its details; pen tests, findings and how each ended; the dependency-alert import
 * in two steps (a preview that travels back as JSON, then the import); certification,
 * insurance, management reviews and their actions; his windows and months. Each: the gate,
 * one call to the service, the pages refreshed, and a sentence. Nothing is sent from here.
 */

const BASE = "/data/assurance";
const POLICIES = `${BASE}/policies`;
const FINDINGS = `${BASE}/findings`;
const CERTIFICATION = `${BASE}/certification`;
const INSURANCE = `${BASE}/insurance`;
const REVIEWS = `${BASE}/reviews`;
/** The dependency-alert file: 3 MB at most, as the service reads it. */
const MAX_ALERTS_BYTES = 3 * 1024 * 1024;

const POLICY_KEY = /^[a-z0-9_-]{1,64}$/;
const NOT_HERE: ActionState = { status: "error", message: "That record is not here." };

const policyKey = (formData: FormData): string => {
  const key = fieldValue(formData, "key", 64);
  return POLICY_KEY.test(key) ? key : "";
};

function refresh(...paths: string[]): void {
  refreshData(BASE, ...paths);
}

// ------------------------------------------------------------------ policies

export async function linkPolicyAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const context = await gate(formData, POLICIES);
  if (refused(context)) return context;
  const key = policyKey(formData);
  if (!key) return NOT_HERE;
  const fileId = idOf(formData, "file_id") || null;
  try {
    await policies.linkPolicy(key, fileId, staffOf(context));
  } catch (error) {
    return refusal(error);
  }
  refresh(POLICIES, "/data/files");
  return sent(fileId ? "Linked." : "Unlinked.");
}

export async function policyDetailsAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const context = await gate(formData, POLICIES);
  if (refused(context)) return context;
  const key = policyKey(formData);
  if (!key) return NOT_HERE;
  try {
    await policies.updatePolicy(
      key,
      {
        owner: fieldValue(formData, "owner", 120),
        approved_by: fieldValue(formData, "approved_by", 120),
        approved_on: fieldValue(formData, "approved_on", 10),
        note: fieldValue(formData, "note", 4000),
        ...(formData.has("title") ? { title: fieldValue(formData, "title", 120) } : {}),
      },
      staffOf(context),
    );
  } catch (error) {
    return refusal(error);
  }
  refresh(POLICIES);
  return sent("Saved.");
}

export async function policyNotNeededAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const context = await gate(formData, POLICIES);
  if (refused(context)) return context;
  const key = policyKey(formData);
  if (!key) return NOT_HERE;
  const undo = fieldValue(formData, "undo", 4) === "1";
  try {
    await policies.policyNotNeeded(
      key,
      undo ? { undo: true } : { why: fieldValue(formData, "why", 300) },
      staffOf(context),
    );
  } catch (error) {
    return refusal(error);
  }
  refresh(POLICIES);
  return sent(undo ? "Needed again." : "Marked not needed.");
}

export async function addOwnPolicyAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const context = await gate(formData, POLICIES);
  if (refused(context)) return context;
  try {
    await policies.addOwnPolicy(
      fieldValue(formData, "title", 120),
      staffOf(context),
      attemptOf(formData),
    );
  } catch (error) {
    return refusal(error);
  }
  refresh(POLICIES);
  return sent("Added. Link its document from Files.");
}

// ------------------------------------------------------------------ findings

function findingFields(formData: FormData): findings.FindingInput {
  const input: findings.FindingInput = {};
  for (const [name, limit] of [
    ["title", 200],
    ["description", 4000],
    ["source", 12],
    ["severity", 10],
    ["found_on", 10],
    ["owner", 120],
    ["evidence", 4000],
  ] as const)
    if (formData.has(name)) input[name] = fieldValue(formData, name, limit);
  if (formData.has("pen_test_id")) input.pen_test_id = idOf(formData, "pen_test_id");
  return input;
}

function findingRefresh(findingId: string): void {
  refresh(FINDINGS, `${FINDINGS}/${findingId}`, "/data/files");
}

export async function addFindingAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const context = await gate(formData, FINDINGS);
  if (refused(context)) return context;
  let said = "Added.";
  try {
    const { finding } = await findings.addFinding(
      findingFields(formData),
      staffOf(context),
      attemptOf(formData),
    );
    said = `Added. ${finding.fix.words}.`;
  } catch (error) {
    return refusal(error);
  }
  refresh(FINDINGS);
  return sent(said);
}

export async function updateFindingAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const findingId = idOf(formData, "finding_id");
  const context = await gate(formData, `${FINDINGS}/${findingId}`);
  if (refused(context)) return context;
  if (!findingId) return NOT_HERE;
  try {
    await findings.updateFinding(findingId, findingFields(formData), staffOf(context));
  } catch (error) {
    return refusal(error);
  }
  findingRefresh(findingId);
  return sent("Saved.");
}

export async function findingFixedAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const findingId = idOf(formData, "finding_id");
  const context = await gate(formData, `${FINDINGS}/${findingId}`);
  if (refused(context)) return context;
  if (!findingId) return NOT_HERE;
  const copy = await copyFrom(formData);
  if (isState(copy)) return copy;
  try {
    await findings.findingFixed(
      findingId,
      {
        on: fieldValue(formData, "on", 10),
        ...(formData.has("evidence") ? { evidence: fieldValue(formData, "evidence", 4000) } : {}),
        ...copy,
      },
      staffOf(context),
    );
  } catch (error) {
    return refusal(error);
  }
  findingRefresh(findingId);
  return sent("Marked fixed.");
}

export async function acceptFindingAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const findingId = idOf(formData, "finding_id");
  const context = await gate(formData, `${FINDINGS}/${findingId}`);
  if (refused(context)) return context;
  if (!findingId) return NOT_HERE;
  try {
    await findings.acceptFinding(
      findingId,
      {
        why: fieldValue(formData, "why", 500),
        decided_by: fieldValue(formData, "decided_by", 120),
        on: fieldValue(formData, "on", 10),
      },
      staffOf(context),
    );
  } catch (error) {
    return refusal(error);
  }
  findingRefresh(findingId);
  return sent("The risk is accepted.");
}

export async function dismissFindingAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const findingId = idOf(formData, "finding_id");
  const context = await gate(formData, `${FINDINGS}/${findingId}`);
  if (refused(context)) return context;
  if (!findingId) return NOT_HERE;
  try {
    await findings.dismissFinding(
      findingId,
      { why: fieldValue(formData, "why", 500) },
      staffOf(context),
    );
  } catch (error) {
    return refusal(error);
  }
  findingRefresh(findingId);
  return sent("Dismissed. It stays in the register.");
}

export async function reopenFindingAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const findingId = idOf(formData, "finding_id");
  const context = await gate(formData, `${FINDINGS}/${findingId}`);
  if (refused(context)) return context;
  if (!findingId) return NOT_HERE;
  try {
    await findings.reopenFinding(findingId, staffOf(context));
  } catch (error) {
    return refusal(error);
  }
  findingRefresh(findingId);
  return sent("Reopened.");
}

export async function moveFindingAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const findingId = idOf(formData, "finding_id");
  const context = await gate(formData, `${FINDINGS}/${findingId}`);
  if (refused(context)) return context;
  if (!findingId) return NOT_HERE;
  const undo = fieldValue(formData, "undo", 4) === "1";
  try {
    await findings.moveFinding(
      findingId,
      undo
        ? { undo: true }
        : { on: fieldValue(formData, "on", 10), why: fieldValue(formData, "why", 300) },
      staffOf(context),
    );
  } catch (error) {
    return refusal(error);
  }
  findingRefresh(findingId);
  return sent(undo ? "Back to the worked-out day." : "Moved.");
}

function penTestFields(formData: FormData): findings.PenTestInput {
  const input: findings.PenTestInput = {};
  for (const [name, limit] of [
    ["tester", 120],
    ["kind", 12],
    ["empanelled", 4],
    ["scope", 1000],
    ["started_on", 10],
    ["report_on", 10],
    ["notes", 4000],
  ] as const)
    if (formData.has(name)) input[name] = fieldValue(formData, name, limit);
  return input;
}

export async function addPenTestAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const context = await gate(formData, FINDINGS);
  if (refused(context)) return context;
  const copy = await copyFrom(formData);
  if (isState(copy)) return copy;
  try {
    await findings.addPenTest(
      { ...penTestFields(formData), ...copy },
      staffOf(context),
      attemptOf(formData),
    );
  } catch (error) {
    return refusal(error);
  }
  refresh(FINDINGS, "/data/files");
  return sent("Recorded.");
}

export async function updatePenTestAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const penTestId = idOf(formData, "pen_test_id");
  const context = await gate(formData, `${FINDINGS}/pen-tests/${penTestId}`);
  if (refused(context)) return context;
  if (!penTestId) return NOT_HERE;
  const copy = await copyFrom(formData);
  if (isState(copy)) return copy;
  try {
    await findings.updatePenTest(
      penTestId,
      { ...penTestFields(formData), ...copy },
      staffOf(context),
    );
  } catch (error) {
    return refusal(error);
  }
  refresh(FINDINGS, `${FINDINGS}/pen-tests/${penTestId}`, "/data/files");
  return sent("Saved.");
}

export async function retestAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const penTestId = idOf(formData, "pen_test_id");
  const context = await gate(formData, `${FINDINGS}/pen-tests/${penTestId}`);
  if (refused(context)) return context;
  if (!penTestId) return NOT_HERE;
  const copy = await copyFrom(formData);
  if (isState(copy)) return copy;
  try {
    await findings.recordRetest(
      penTestId,
      {
        ...(formData.has("planned_on")
          ? { planned_on: fieldValue(formData, "planned_on", 10) }
          : {}),
        ...(formData.has("done_on") ? { done_on: fieldValue(formData, "done_on", 10) } : {}),
        ...copy,
      },
      staffOf(context),
    );
  } catch (error) {
    return refusal(error);
  }
  refresh(FINDINGS, `${FINDINGS}/pen-tests/${penTestId}`, "/data/files");
  return sent("Saved.");
}

export async function largeChangeAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const penTestId = idOf(formData, "pen_test_id");
  const context = await gate(formData, `${FINDINGS}/pen-tests/${penTestId}`);
  if (refused(context)) return context;
  if (!penTestId) return NOT_HERE;
  const undo = fieldValue(formData, "undo", 4) === "1";
  try {
    await findings.recordLargeChange(
      penTestId,
      undo
        ? { undo: true }
        : { on: fieldValue(formData, "on", 10), what: fieldValue(formData, "what", 300) },
      staffOf(context),
    );
  } catch (error) {
    return refusal(error);
  }
  refresh(FINDINGS, `${FINDINGS}/pen-tests/${penTestId}`);
  return sent(undo ? "Taken back." : "Recorded. The next pen test is due on that day.");
}

export async function findingsSetupAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const context = await gate(formData, FINDINGS);
  if (refused(context)) return context;
  try {
    await findings.saveFindingsSetup(
      {
        windows: {
          critical: fieldValue(formData, "critical", 6),
          high: fieldValue(formData, "high", 6),
          medium: fieldValue(formData, "medium", 6),
          low: fieldValue(formData, "low", 6),
        },
        pen_test_months: fieldValue(formData, "pen_test_months", 4),
      },
      staffOf(context),
    );
  } catch (error) {
    return refusal(error);
  }
  refresh(FINDINGS);
  return sent("Saved. Every fix-by day is worked out again.");
}

/** Step 1: the file is read and the preview travels back as JSON; nothing is kept yet. */
export async function previewAlertsAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const context = await gate(formData, FINDINGS);
  if (refused(context)) return context;
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0)
    return { status: "error", message: "Choose the file the command saved." };
  if (file.size > MAX_ALERTS_BYTES)
    return {
      status: "error",
      message: "The file is over 3 MB. Save open alerts only: add &state=open to the command.",
    };
  const content = Buffer.from(await file.arrayBuffer()).toString("base64");
  try {
    const preview = await findings.previewAlerts(
      { content, name: file.name.slice(0, 200) },
      staffOf(context),
    );
    return { status: "idle", message: null, detail: JSON.stringify(preview) };
  } catch (error) {
    return refusal(error);
  }
}

/** Step 2: the previewed alerts go in. */
export async function importAlertsAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const context = await gate(formData, FINDINGS);
  if (refused(context)) return context;
  let said: string;
  try {
    const { counts } = await findings.importAlerts(
      idOf(formData, "import_id"),
      staffOf(context),
      attemptOf(formData),
    );
    said = `Imported ${countWords(counts.alerts, "alert")}: ${counts.new} new, ${counts.changed} changed, ${counts.unchanged} unchanged.`;
  } catch (error) {
    return refusal(error);
  }
  refresh(FINDINGS);
  return sent(said);
}

// ------------------------------------------------------------------ certification

const CERT_FIELDS = [
  ["standard", 12],
  ["name", 120],
  ["status", 12],
  ["body", 120],
  ["accredited_by", 120],
  ["accreditation_checked_on", 10],
  ["consultant", 120],
  ["scope", 1000],
  ["stage1_on", 10],
  ["stage2_on", 10],
  ["certificate_number", 80],
  ["issued_on", 10],
  ["expires_on", 10],
  ["report_kind", 6],
  ["report_from", 10],
  ["report_to", 10],
  ["notes", 4000],
] as const;

function certFields(formData: FormData): assurance.CertificationInput {
  const input: assurance.CertificationInput = {};
  for (const [name, limit] of CERT_FIELDS)
    if (formData.has(name)) input[name] = fieldValue(formData, name, limit);
  return input;
}

export async function addCertificationAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const context = await gate(formData, CERTIFICATION);
  if (refused(context)) return context;
  const copy = await copyFrom(formData);
  if (isState(copy)) return copy;
  try {
    await assurance.addCertification(
      { ...certFields(formData), ...copy },
      staffOf(context),
      attemptOf(formData),
    );
  } catch (error) {
    return refusal(error);
  }
  refresh(CERTIFICATION, "/data/files");
  return sent("Recorded.");
}

export async function updateCertificationAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const certId = idOf(formData, "cert_id");
  const context = await gate(formData, `${CERTIFICATION}/${certId}`);
  if (refused(context)) return context;
  if (!certId) return NOT_HERE;
  const copy = await copyFrom(formData);
  if (isState(copy)) return copy;
  try {
    await assurance.updateCertification(
      certId,
      { ...certFields(formData), ...copy },
      staffOf(context),
    );
  } catch (error) {
    return refusal(error);
  }
  refresh(CERTIFICATION, `${CERTIFICATION}/${certId}`, "/data/files");
  return sent("Saved.");
}

export async function surveillanceAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const certId = idOf(formData, "cert_id");
  const context = await gate(formData, `${CERTIFICATION}/${certId}`);
  if (refused(context)) return context;
  if (!certId) return NOT_HERE;
  const n = fieldValue(formData, "n", 1) === "2" ? 2 : 1;
  const copy = await copyFrom(formData);
  if (isState(copy)) return copy;
  try {
    await assurance.recordSurveillance(
      certId,
      n,
      {
        due_on: fieldValue(formData, "due_on", 10),
        held_on: fieldValue(formData, "held_on", 10),
        outcome: fieldValue(formData, "outcome", 1000),
        ...copy,
      },
      staffOf(context),
    );
  } catch (error) {
    return refusal(error);
  }
  refresh(CERTIFICATION, `${CERTIFICATION}/${certId}`, "/data/files");
  return sent("Saved.");
}

// ------------------------------------------------------------------ insurance

const INSURANCE_FIELDS = [
  ["kind", 24],
  ["name", 120],
  ["insurer", 120],
  ["policy_number", 80],
  ["cover", 40],
  ["currency", 3],
  ["premium", 40],
  ["starts_on", 10],
  ["ends_on", 10],
  ["broker", 120],
  ["notes", 4000],
] as const;

function insuranceFields(formData: FormData): assurance.InsuranceInput {
  const input: assurance.InsuranceInput = {};
  for (const [name, limit] of INSURANCE_FIELDS)
    if (formData.has(name)) input[name] = fieldValue(formData, name, limit);
  return input;
}

export async function addInsuranceAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const context = await gate(formData, INSURANCE);
  if (refused(context)) return context;
  const copy = await copyFrom(formData);
  if (isState(copy)) return copy;
  try {
    await assurance.addInsurance(
      { ...insuranceFields(formData), ...copy },
      staffOf(context),
      attemptOf(formData),
    );
  } catch (error) {
    return refusal(error);
  }
  refresh(INSURANCE, "/data/files");
  return sent("Recorded.");
}

export async function updateInsuranceAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const insuranceId = idOf(formData, "insurance_id");
  const context = await gate(formData, INSURANCE);
  if (refused(context)) return context;
  if (!insuranceId) return NOT_HERE;
  const copy = await copyFrom(formData);
  if (isState(copy)) return copy;
  try {
    await assurance.updateInsurance(
      insuranceId,
      { ...insuranceFields(formData), ...copy },
      staffOf(context),
    );
  } catch (error) {
    return refusal(error);
  }
  refresh(INSURANCE, "/data/files");
  return sent("Saved.");
}

export async function renewInsuranceAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const insuranceId = idOf(formData, "insurance_id");
  const context = await gate(formData, INSURANCE);
  if (refused(context)) return context;
  if (!insuranceId) return NOT_HERE;
  const copy = await copyFrom(formData);
  if (isState(copy)) return copy;
  try {
    await assurance.renewInsurance(
      insuranceId,
      { ...insuranceFields(formData), ...copy },
      staffOf(context),
      attemptOf(formData),
    );
  } catch (error) {
    return refusal(error);
  }
  refresh(INSURANCE, "/data/files");
  return sent("Renewed: the new policy continues this one.");
}

// ------------------------------------------------------------------ management reviews

/** How many action rows the review form offers. */
const ACTION_ROWS = 5;

function reviewFields(formData: FormData): assurance.ReviewInput {
  const input: assurance.ReviewInput = {};
  if (formData.has("held_on")) input.held_on = fieldValue(formData, "held_on", 10);
  if (formData.has("attendees")) input.attendees = fieldValue(formData, "attendees", 500);
  if (formData.has("decisions")) input.decisions = fieldValue(formData, "decisions", 4000);
  const inputs: NonNullable<assurance.ReviewInput["inputs"]> = {};
  let any = false;
  for (const key of REVIEW_INPUT_KEYS)
    if (formData.has(`input_${key}`)) {
      inputs[key] = fieldValue(formData, `input_${key}`, 4000);
      any = true;
    }
  if (any) input.inputs = inputs;
  return input;
}

function actionRows(formData: FormData): { what: string; owner: string; due_on: string }[] {
  const rows: { what: string; owner: string; due_on: string }[] = [];
  for (let n = 1; n <= ACTION_ROWS; n += 1) {
    const what = fieldValue(formData, `action_${n}_what`, 300);
    if (!what.trim()) continue;
    rows.push({
      what,
      owner: fieldValue(formData, `action_${n}_owner`, 120),
      due_on: fieldValue(formData, `action_${n}_due_on`, 10),
    });
  }
  return rows;
}

export async function addReviewAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const context = await gate(formData, REVIEWS);
  if (refused(context)) return context;
  const copy = await copyFrom(formData);
  if (isState(copy)) return copy;
  try {
    await assurance.addReview(
      { ...reviewFields(formData), actions: actionRows(formData), ...copy },
      staffOf(context),
      attemptOf(formData),
    );
  } catch (error) {
    return refusal(error);
  }
  refresh(REVIEWS, "/data/files");
  return sent("Recorded.");
}

export async function updateReviewAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const reviewId = idOf(formData, "review_id");
  const context = await gate(formData, `${REVIEWS}/${reviewId}`);
  if (refused(context)) return context;
  if (!reviewId) return NOT_HERE;
  const copy = await copyFrom(formData);
  if (isState(copy)) return copy;
  try {
    await assurance.updateReview(
      reviewId,
      { ...reviewFields(formData), ...copy },
      staffOf(context),
    );
  } catch (error) {
    return refusal(error);
  }
  refresh(REVIEWS, `${REVIEWS}/${reviewId}`, "/data/files");
  return sent("Saved.");
}

export async function addReviewActionAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const reviewId = idOf(formData, "review_id");
  const context = await gate(formData, `${REVIEWS}/${reviewId}`);
  if (refused(context)) return context;
  if (!reviewId) return NOT_HERE;
  try {
    await assurance.addReviewAction(
      reviewId,
      {
        what: fieldValue(formData, "what", 300),
        owner: fieldValue(formData, "owner", 120),
        due_on: fieldValue(formData, "due_on", 10),
      },
      staffOf(context),
    );
  } catch (error) {
    return refusal(error);
  }
  refresh(REVIEWS, `${REVIEWS}/${reviewId}`);
  return sent("Added.");
}

export async function reviewActionDoneAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const reviewId = idOf(formData, "review_id");
  const actionId = idOf(formData, "action_id");
  const context = await gate(formData, `${REVIEWS}/${reviewId}`);
  if (refused(context)) return context;
  if (!actionId) return NOT_HERE;
  const undo = fieldValue(formData, "undo", 4) === "1";
  try {
    await assurance.reviewActionDone(actionId, undo ? { undo: true } : {}, staffOf(context));
  } catch (error) {
    return refusal(error);
  }
  refresh(REVIEWS, `${REVIEWS}/${reviewId}`);
  return sent(undo ? "Open again." : "Marked done.");
}

export async function assuranceSetupAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const context = await gate(formData, REVIEWS);
  if (refused(context)) return context;
  try {
    await assurance.saveAssuranceSetup(
      { review_months: fieldValue(formData, "review_months", 4) },
      staffOf(context),
    );
  } catch (error) {
    return refusal(error);
  }
  refresh(REVIEWS);
  return sent("Saved.");
}
