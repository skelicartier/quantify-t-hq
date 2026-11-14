"use server";

import {
  attemptOf,
  checked,
  copyOf,
  investorIdOf,
  isRefusal,
  routeIdOf,
} from "@/components/data/closing/form-copy";
import { fieldValue } from "@/lib/auth/forms";
import * as api from "@/lib/data/api/closing";
import { gate, refreshData, refusal, refused, sent, staffOf } from "@/lib/data/gate";
import type { ActionState } from "@/lib/forms/action-state";

/**
 * The close's writes (ws-notes/company/spec.md §9.4): start a firm's checklist, its terms,
 * each step (with "Add the deadlines to Key dates", ticked, on the two that start clocks),
 * clearing a step, the dates added again, the refund date, and the round's own steps. Each
 * refreshes the firm's page, the Closing view, Key dates and Files.
 */

const BASE = "/data/investors/closing";
const NO_FIRM: ActionState = { status: "error", message: "That firm is not here." };
const STEPS = new Set<string>(api.CLOSING_STEP_SLUGS);
const ROUND_STEPS = new Set<string>(api.ROUND_STEP_SLUGS);

function refreshClosing(investorId: string): void {
  refreshData(
    BASE,
    "/data/investors",
    "/data/dates",
    "/data/files",
    ...(investorId ? [`/data/investors/${investorId}`] : []),
  );
}

export async function startClosingAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const investorId = investorIdOf(formData);
  const context = await gate(formData, `/data/investors/${investorId}`);
  if (refused(context)) return context;
  if (!investorId) return NO_FIRM;
  try {
    await api.startClosing(investorId, staffOf(context), attemptOf(formData));
  } catch (error) {
    return refusal(error);
  }
  refreshClosing(investorId);
  return sent("Started.");
}

/** "Walk Backer 1, 250000, INR" one a line. */
function backersOf(text: string): { name: string; amount: string; currency: string }[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split(",").map((part) => part.trim());
      const currency = (parts.length > 2 ? (parts.pop() ?? "") : "INR").toUpperCase();
      const amount = parts.length > 1 ? (parts.pop() ?? "") : "";
      return { name: parts.join(", "), amount, currency };
    });
}

export async function closingTermsAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const investorId = investorIdOf(formData);
  const context = await gate(formData, `/data/investors/${investorId}`);
  if (refused(context)) return context;
  if (!investorId) return NO_FIRM;
  const pooledKind = fieldValue(formData, "pooled_kind", 20);
  try {
    await api.saveClosingTerms(
      investorId,
      {
        instrument: fieldValue(formData, "instrument", 40),
        class_id: routeIdOf(formData, "class_id"),
        shares: fieldValue(formData, "shares", 20).trim(),
        price_per_share: fieldValue(formData, "price_per_share", 20).trim(),
        holder: {
          name: fieldValue(formData, "holder_name", 200).trim(),
          kind: fieldValue(formData, "holder_kind", 20),
          email: fieldValue(formData, "holder_email", 254).trim(),
          address: fieldValue(formData, "holder_address", 400).trim(),
        },
        pooled: pooledKind
          ? {
              kind: pooledKind,
              backers: backersOf(fieldValue(formData, "backers", 20_000)),
              fee_note: fieldValue(formData, "fee_note", 300).trim(),
            }
          : null,
        notes: fieldValue(formData, "notes", 4_000),
      },
      staffOf(context),
    );
  } catch (error) {
    return refusal(error);
  }
  refreshClosing(investorId);
  return sent("Saved.");
}

/** The step's fields as the service takes them; files as base64. */
async function stepInput(
  formData: FormData,
): Promise<Record<string, string | boolean> | ActionState> {
  const input: Record<string, string | boolean> = {};
  for (const name of [
    "on",
    "what",
    "serial",
    "amount",
    "currency",
    "reference",
    "by_name",
    "kind",
    "resolution_id",
    "words",
    "shares",
    "price_per_share",
    "class_id",
    "folio",
    "number",
    "interest",
    "note",
  ]) {
    const value = fieldValue(formData, name, 2_000).trim();
    if (value) input[name] = value;
  }
  for (const name of ["own_account", "from_receiving_bank", "from_round", "add_dates"])
    input[name] = checked(formData, name);
  const copy = await copyOf(formData, "file");
  if (isRefusal(copy)) return copy;
  if (copy && !isRefusal(copy)) {
    input.content = copy.content;
    input.name = copy.name;
  }
  return input;
}

export async function closingStepAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const investorId = investorIdOf(formData);
  const context = await gate(formData, `/data/investors/${investorId}`);
  if (refused(context)) return context;
  if (!investorId) return NO_FIRM;
  const step = fieldValue(formData, "step", 40);
  if (!STEPS.has(step)) return { status: "error", message: "No such step." };
  const input = await stepInput(formData);
  if (isRefusal(input)) return input;
  let said = "Recorded.";
  try {
    const answer = await api.recordClosingStep(
      investorId,
      step as api.ClosingStepSlug,
      input as Record<string, string | boolean>,
      staffOf(context),
    );
    if (step === "register" && answer.closing.register)
      said = `Entered in folio ${answer.closing.register.folio}.`;
  } catch (error) {
    return refusal(error);
  }
  refreshClosing(investorId);
  return sent(said);
}

export async function clearClosingStepAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const investorId = investorIdOf(formData);
  const context = await gate(formData, `/data/investors/${investorId}`);
  if (refused(context)) return context;
  if (!investorId) return NO_FIRM;
  const step = fieldValue(formData, "step", 40);
  if (!STEPS.has(step)) return { status: "error", message: "No such step." };
  try {
    await api.clearClosingStep(investorId, step as api.ClosingStepSlug, staffOf(context));
  } catch (error) {
    return refusal(error);
  }
  refreshClosing(investorId);
  return sent("Cleared.");
}

export async function addClosingDatesAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const investorId = investorIdOf(formData);
  const context = await gate(formData, `/data/investors/${investorId}`);
  if (refused(context)) return context;
  if (!investorId) return NO_FIRM;
  try {
    await api.addClosingDates(investorId, staffOf(context));
  } catch (error) {
    return refusal(error);
  }
  refreshClosing(investorId);
  return sent("Added to Key dates.");
}

export async function addRefundDateAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const investorId = investorIdOf(formData);
  const context = await gate(formData, `/data/investors/${investorId}`);
  if (refused(context)) return context;
  if (!investorId) return NO_FIRM;
  try {
    await api.addRefundDate(investorId, staffOf(context));
  } catch (error) {
    return refusal(error);
  }
  refreshClosing(investorId);
  return sent("Added to Key dates.");
}

export async function roundStepAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const context = await gate(formData, BASE);
  if (refused(context)) return context;
  const step = fieldValue(formData, "step", 40);
  if (!ROUND_STEPS.has(step)) return { status: "error", message: "No such step." };
  const input = await stepInput(formData);
  if (isRefusal(input)) return input;
  const bank = fieldValue(formData, "bank", 120).trim();
  if (bank) (input as Record<string, string | boolean>).bank = bank;
  try {
    await api.recordRoundStep(
      step as api.RoundStepSlug,
      input as Record<string, string | boolean>,
      staffOf(context),
    );
  } catch (error) {
    return refusal(error);
  }
  refreshClosing("");
  return sent("Recorded.");
}
