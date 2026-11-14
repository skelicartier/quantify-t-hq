"use server";

import { headers } from "next/headers";

import { fieldValue } from "@/lib/auth/forms";
import * as api from "@/lib/data/api/calendar";
import { gate, refreshData, refusal, refused, sent, staffOf } from "@/lib/data/gate";
import type { ActionState } from "@/lib/forms/action-state";

/**
 * The calendar feed's writes: making the link (its answer carries the link once, for the
 * page to show to the person who made it, and is never stored), what the events say, and
 * turning the feed off.
 */

const BASE = "/data/calendar";

/** Where this portal is, as the calendar on this Mac will reach it. */
async function portalOrigin(): Promise<string> {
  const configured = (process.env.NEXT_PUBLIC_SITE_URL ?? "").trim();
  if (configured) return configured.replace(/\/+$/, "");
  const list = await headers();
  const host = list.get("x-forwarded-host") ?? list.get("host") ?? "127.0.0.1:3000";
  const protocol = list.get("x-forwarded-proto") ?? "http";
  return `${protocol}://${host}`;
}

export async function makeCalendarLinkAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const context = await gate(formData, BASE);
  if (refused(context)) return context;
  let answer: Awaited<ReturnType<typeof api.makeCalendarLink>>;
  try {
    answer = await api.makeCalendarLink(null, staffOf(context));
  } catch (error) {
    return refusal(error);
  }
  refreshData(BASE);
  return {
    ...sent("Made the link. Copy it now: it is shown once."),
    secret: `${await portalOrigin()}/cal/${answer.token}`,
    detail: JSON.stringify({ made_at: answer.feed.made_at }),
  };
}

export async function calendarDetailAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const context = await gate(formData, BASE);
  if (refused(context)) return context;
  const parsed = api.calendarDetailSchema.safeParse(fieldValue(formData, "detail", 10));
  if (!parsed.success) return { status: "error", message: "Choose full titles or kinds only." };
  try {
    await api.setCalendarDetail(parsed.data, staffOf(context));
  } catch (error) {
    return refusal(error);
  }
  refreshData(BASE);
  return sent("Saved.");
}

export async function turnCalendarOffAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const context = await gate(formData, BASE);
  if (refused(context)) return context;
  try {
    await api.turnCalendarOff(staffOf(context));
  } catch (error) {
    return refusal(error);
  }
  refreshData(BASE);
  return sent("The feed is off: the link no longer works.");
}
