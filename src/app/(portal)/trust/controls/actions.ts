"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { hasCapability, requireStaff } from "@/lib/access/core";
import { HqApiRequestError } from "@/lib/api/core";
import * as ctl from "@/lib/api/controls";
import { fieldValue, refusalMessage } from "@/lib/auth/forms";
import type { ActionState } from "@/lib/forms/action-state";
import { requireSameOriginServerAction } from "@/lib/security/action-origin";

const NOT_ADMIN: ActionState = {
  status: "error",
  message: "The control map is kept by Admins and Owners.",
};

function refusal(error: unknown): ActionState {
  if (error instanceof HqApiRequestError) {
    if (error.details.sudo_required === true)
      return { status: "error", message: "Confirm it's you with a code first; then try again." };
    const detail = Object.values(error.details).find((value) => typeof value === "string");
    if (
      (error.code === "malformed_request" || error.code === "forbidden") &&
      typeof detail === "string"
    )
      return { status: "error", message: `${detail.charAt(0).toUpperCase()}${detail.slice(1)}.` };
  }
  return { status: "error", message: refusalMessage(error) };
}

function collect(formData: FormData, fields: ReadonlyArray<readonly [string, number]>) {
  const body: Record<string, string> = {};
  for (const [name, limit] of fields) {
    if (formData.has(name)) body[name] = fieldValue(formData, name, limit).trim();
  }
  return body;
}

async function admin(formData: FormData, path: string) {
  await requireSameOriginServerAction(formData);
  const context = await requireStaff(path);
  return { context, allowed: hasCapability(context, "hq:admin") };
}

const CONTROL_FIELDS = [
  ["ref", 16],
  ["title", 200],
  ["description", 4000],
  ["domain", 12],
  ["frequency", 12],
  ["owner_staff_id", 64],
  ["frameworks", 1000],
] as const;

export async function createControlAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { context, allowed } = await admin(formData, "/trust/controls");
  if (!allowed) return NOT_ADMIN;
  let controlId = "";
  try {
    controlId = (await ctl.createControl(context.token, collect(formData, CONTROL_FIELDS))).control
      .control_id;
  } catch (error) {
    return refusal(error);
  }
  revalidatePath("/trust/controls");
  redirect(`/trust/controls/${controlId}`);
}

const SAID: Record<string, string> = {
  edit: "Saved.",
  operate: "Operating. Its evidence is now due on its cadence.",
  retire: "Retired.",
  restore: "Back to being designed.",
  evidence: "Evidence recorded.",
  link: "Linked.",
  unlink: "Unlinked.",
};

export async function controlAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const controlId = fieldValue(formData, "control_id", 64);
  const { context, allowed } = await admin(formData, `/trust/controls/${controlId}`);
  if (!allowed) return NOT_ADMIN;
  const action = fieldValue(formData, "action", 10);
  const body: Record<string, string> = {
    action,
    ...collect(formData, [
      ...CONTROL_FIELDS.filter(([name]) => name !== "ref"),
      ["reason", 400],
      ["reference", 400],
      ["collected_on", 10],
      ["period_start", 10],
      ["period_end", 10],
      ["note", 1000],
      ["link_id", 64],
    ]),
  };
  if (action === "evidence") body.title = fieldValue(formData, "evidence_title", 200).trim();
  // One select carries both halves of a link: "risk:<id>".
  if (action === "link") {
    const [recordType = "", recordId = ""] = fieldValue(formData, "record", 120).split(":");
    body.record_type = recordType;
    body.record_id = recordId;
  }
  for (const name of ["period_start", "period_end", "collected_on"])
    if (body[name] === "") delete body[name];
  try {
    await ctl.actOnControl(context.token, controlId, body);
  } catch (error) {
    return refusal(error);
  }
  revalidatePath(`/trust/controls/${controlId}`);
  revalidatePath("/trust/controls");
  return { status: "sent", message: SAID[action] ?? "Saved.", sentAt: Date.now() };
}

export async function mintAuditorLinkAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { context, allowed } = await admin(formData, "/trust/controls");
  if (!allowed) return NOT_ADMIN;
  let made: Awaited<ReturnType<typeof ctl.createAuditorLink>>;
  try {
    made = await ctl.createAuditorLink(
      context.token,
      collect(formData, [
        ["label", 160],
        ["days", 2],
        ["reason", 400],
      ]),
    );
  } catch (error) {
    return refusal(error);
  }
  revalidatePath("/trust/controls");
  return {
    status: "sent",
    message: "Copy the link now: it is shown once, and only its hash is kept.",
    secret: `${(process.env.NEXT_PUBLIC_SITE_URL ?? "").replace(/\/$/, "")}/audit/${made.token}`,
    sentAt: Date.now(),
  };
}

export async function revokeAuditorLinkAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { context, allowed } = await admin(formData, "/trust/controls");
  if (!allowed) return NOT_ADMIN;
  try {
    await ctl.revokeAuditorLink(context.token, fieldValue(formData, "link_id", 64));
  } catch (error) {
    return refusal(error);
  }
  revalidatePath("/trust/controls");
  return { status: "sent", message: "Revoked: the link no longer opens.", sentAt: Date.now() };
}
