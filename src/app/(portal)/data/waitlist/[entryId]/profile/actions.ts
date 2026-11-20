"use server";

import {
  attemptOf,
  checked,
  copyOf,
  isRefusal,
  routeIdOf,
} from "@/components/data/closing/form-copy";
import { fieldValue } from "@/lib/auth/forms";
import * as api from "@/lib/data/api/profiles";
import { gate, refreshData, refusal, refused, sent, staffOf } from "@/lib/data/gate";
import type { ActionState } from "@/lib/forms/action-state";

/**
 * A regulatory profile's writes (ws-notes/security/spec.md §9.5): start it, the rules and the
 * day it applies from (ticking a regime adds its duties, unchecked), a duty added from the list
 * or in his own words, a duty's state, agreement, copy and note, and a duty withdrawn with why.
 * Nothing is deleted.
 */

const NO_PROFILE: ActionState = { status: "error", message: "That profile is not here." };

function refreshProfile(entryId: string): void {
  refreshData(
    "/data/assurance/customers",
    "/data/files",
    ...(entryId ? [`/data/waitlist/${entryId}`, `/data/waitlist/${entryId}/profile`] : []),
  );
}

const pathOf = (formData: FormData) => `/data/waitlist/${routeIdOf(formData, "entry_id")}/profile`;

export async function startProfileAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const context = await gate(formData, pathOf(formData));
  if (refused(context)) return context;
  const entryId = routeIdOf(formData, "entry_id");
  if (!entryId) return { status: "error", message: "That firm is not on the waitlist." };
  try {
    await api.startProfile(entryId, staffOf(context), attemptOf(formData));
  } catch (error) {
    return refusal(error);
  }
  refreshProfile(entryId);
  return sent("Started.");
}

export async function updateProfileAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const context = await gate(formData, pathOf(formData));
  if (refused(context)) return context;
  const profileId = routeIdOf(formData, "profile_id");
  if (!profileId) return NO_PROFILE;
  try {
    await api.updateProfile(
      profileId,
      {
        sebi: checked(formData, "sebi"),
        sebi_category: fieldValue(formData, "sebi_category", 30),
        dora: checked(formData, "dora"),
        dora_critical: fieldValue(formData, "dora_critical", 4),
        uk: checked(formData, "uk"),
        uk_note: fieldValue(formData, "uk_note", 300).trim(),
        other: fieldValue(formData, "other", 300).trim(),
        applies_from: fieldValue(formData, "applies_from", 10).trim(),
        notes: fieldValue(formData, "notes", 2_000).trim(),
      },
      staffOf(context),
    );
  } catch (error) {
    return refusal(error);
  }
  refreshProfile(routeIdOf(formData, "entry_id"));
  return sent("Saved.");
}

export async function addDutyAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const context = await gate(formData, pathOf(formData));
  if (refused(context)) return context;
  const profileId = routeIdOf(formData, "profile_id");
  if (!profileId) return NO_PROFILE;
  const key = fieldValue(formData, "key", 40);
  const words = fieldValue(formData, "words", 300).trim();
  try {
    await api.addDuty(profileId, key ? { key } : { words }, staffOf(context), attemptOf(formData));
  } catch (error) {
    return refusal(error);
  }
  refreshProfile(routeIdOf(formData, "entry_id"));
  return sent("Added.");
}

export async function saveDutyAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const context = await gate(formData, pathOf(formData));
  if (refused(context)) return context;
  const profileId = routeIdOf(formData, "profile_id");
  const dutyId = routeIdOf(formData, "duty_id");
  if (!profileId || !dutyId) return NO_PROFILE;
  const attached = await copyOf(formData, "file");
  if (isRefusal(attached)) return attached;
  const chosen = routeIdOf(formData, "file_id");
  try {
    await api.saveDuty(
      profileId,
      dutyId,
      {
        state: fieldValue(formData, "state", 20),
        agreement_id: routeIdOf(formData, "agreement_id"),
        note: fieldValue(formData, "note", 500).trim(),
        file: attached ?? (chosen ? { file_id: chosen } : null),
      },
      staffOf(context),
    );
  } catch (error) {
    return refusal(error);
  }
  refreshProfile(routeIdOf(formData, "entry_id"));
  return sent("Saved.");
}

export async function withdrawDutyAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const context = await gate(formData, pathOf(formData));
  if (refused(context)) return context;
  const profileId = routeIdOf(formData, "profile_id");
  const dutyId = routeIdOf(formData, "duty_id");
  if (!profileId || !dutyId) return NO_PROFILE;
  try {
    await api.withdrawDuty(
      profileId,
      dutyId,
      fieldValue(formData, "why", 300).trim(),
      staffOf(context),
    );
  } catch (error) {
    return refusal(error);
  }
  refreshProfile(routeIdOf(formData, "entry_id"));
  return sent("Withdrawn.");
}
