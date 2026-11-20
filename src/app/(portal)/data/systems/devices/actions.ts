"use server";

import { attemptOf, copyFrom, idOf, isState } from "@/components/data/meetings/form-values";
import { fieldValue } from "@/lib/auth/forms";
import * as api from "@/lib/data/api/devices";
import { gate, refreshData, refusal, refused, sent, staffOf } from "@/lib/data/gate";
import { gateOwner } from "@/lib/data/owner";
import type { ActionState } from "@/lib/forms/action-state";

/**
 * The writes of Systems › Devices (ws-notes/security/spec.md §7.4): add or edit a device, mark
 * a company one returned, mark one no longer used for work, record a self-check with its
 * screenshots or an acknowledgement with its copy, save the settings, and, for the Owner only,
 * link a device to a person in the people ledger. Each: the gate, one call, the pages
 * refreshed, and a sentence.
 */

const BASE = "/data/systems/devices";
const NOT_HERE: ActionState = { status: "error", message: "That device is not here." };
/** Screenshots go to the service as base64 in one request: a third bigger on the way. */
const MAX_SHOTS_BYTES = 3 * 1024 * 1024;
const MAX_SHOTS = 5;

const DEVICE_FIELDS = [
  "holder",
  "kind",
  "ownership",
  "model",
  "serial",
  "platform",
  "issued_on",
  "notes",
] as const;
const CHECK_FIELDS = [
  "on",
  "by_name",
  "encryption",
  "screen_lock_minutes",
  "os_version",
  "updates_automatic",
  "password_manager",
  "malware_protection",
  "firewall",
  "work_data_local",
  "note",
] as const;

function fieldsOf(formData: FormData, names: readonly string[]): Record<string, string> {
  const input: Record<string, string> = {};
  for (const name of names) if (formData.has(name)) input[name] = fieldValue(formData, name, 2000);
  return input;
}

function refresh(deviceId?: string): void {
  refreshData(BASE, ...(deviceId ? [`${BASE}/${deviceId}`] : []));
}

async function act(
  formData: FormData,
  deviceId: string | null,
  call: (by: ReturnType<typeof staffOf>) => Promise<unknown>,
  said: string,
): Promise<ActionState> {
  const context = await gate(formData, deviceId ? `${BASE}/${deviceId}` : BASE);
  if (refused(context)) return context;
  try {
    await call(staffOf(context));
  } catch (error) {
    return refusal(error);
  }
  refresh(deviceId ?? undefined);
  return sent(said);
}

export async function addDeviceAction(_previous: ActionState, formData: FormData) {
  return act(
    formData,
    null,
    (by) => api.addDevice(fieldsOf(formData, DEVICE_FIELDS), by, attemptOf(formData)),
    "Added. Record its first self-check from its page.",
  );
}

export async function updateDeviceAction(_previous: ActionState, formData: FormData) {
  const deviceId = idOf(formData, "device_id");
  if (!deviceId) return NOT_HERE;
  return act(
    formData,
    deviceId,
    (by) => api.updateDevice(deviceId, fieldsOf(formData, DEVICE_FIELDS), by),
    "Saved.",
  );
}

export async function returnDeviceAction(_previous: ActionState, formData: FormData) {
  const deviceId = idOf(formData, "device_id");
  if (!deviceId) return NOT_HERE;
  return act(
    formData,
    deviceId,
    (by) => api.returnDevice(deviceId, fieldValue(formData, "on", 10), by),
    "Marked returned. It stays listed.",
  );
}

export async function retireDeviceAction(_previous: ActionState, formData: FormData) {
  const deviceId = idOf(formData, "device_id");
  if (!deviceId) return NOT_HERE;
  const undo = fieldValue(formData, "undo", 4) === "1";
  return act(
    formData,
    deviceId,
    (by) =>
      api.retireDevice(
        deviceId,
        undo
          ? { undo: true }
          : {
              on: fieldValue(formData, "on", 10),
              why: fieldValue(formData, "why", 300),
              work_removed: fieldValue(formData, "work_removed", 4),
            },
        by,
      ),
    undo ? "Back in use." : "Marked as no longer used for work. It stays listed.",
  );
}

/** The screenshots a form carries: one chosen from Files, and up to five attached (3 MB in all). */
async function screenshotsOf(formData: FormData): Promise<api.Screenshot[] | ActionState> {
  const shots: api.Screenshot[] = [];
  const chosen = idOf(formData, "screenshot_file_id");
  if (chosen) shots.push({ file_id: chosen });
  const attached = formData
    .getAll("screenshots")
    .filter((item): item is File => item instanceof File && item.size > 0);
  if (shots.length + attached.length > MAX_SHOTS)
    return { status: "error", message: "Add at most 5 screenshots to one check." };
  const total = attached.reduce((sum, file) => sum + file.size, 0);
  if (total > MAX_SHOTS_BYTES)
    return {
      status: "error",
      message:
        "Those screenshots are over 3 MB in all. Put them in Files, then choose them from there.",
    };
  for (const file of attached)
    shots.push({
      name: file.name.slice(0, 200),
      content: Buffer.from(await file.arrayBuffer()).toString("base64"),
    });
  return shots;
}

export async function recordCheckAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const deviceId = idOf(formData, "device_id");
  if (!deviceId) return NOT_HERE;
  const shots = await screenshotsOf(formData);
  if (!Array.isArray(shots)) return shots;
  return act(
    formData,
    deviceId,
    (by) =>
      api.recordCheck(deviceId, fieldsOf(formData, CHECK_FIELDS), shots, by, attemptOf(formData)),
    "Self-check recorded.",
  );
}

export async function recordAckAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const deviceId = idOf(formData, "device_id");
  if (!deviceId) return NOT_HERE;
  const copy = await copyFrom(formData);
  if (isState(copy)) return copy;
  return act(
    formData,
    deviceId,
    (by) =>
      api.recordAcknowledgement(
        deviceId,
        fieldsOf(formData, ["policy_file_id", "on", "how", "by_name"]),
        copy,
        by,
        attemptOf(formData),
      ),
    "Acknowledgement recorded.",
  );
}

export async function saveSetupAction(_previous: ActionState, formData: FormData) {
  return act(
    formData,
    null,
    (by) => api.saveDevicesSetup(fieldsOf(formData, ["screen_lock_max", "check_months"]), by),
    "Saved.",
  );
}

/** Owner only: the link to a person in the people ledger. An Admin is refused with the owner line. */
export async function linkDeviceAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const deviceId = idOf(formData, "device_id");
  if (!deviceId) return NOT_HERE;
  const context = await gateOwner(formData, `${BASE}/${deviceId}`);
  if (refused(context)) return context;
  const personId = idOf(formData, "person_id");
  let linked = false;
  try {
    linked = (await api.linkDevice(deviceId, personId, staffOf(context))).linked;
  } catch (error) {
    return refusal(error);
  }
  refresh(deviceId);
  return sent(linked ? "Linked." : "No longer linked.");
}
