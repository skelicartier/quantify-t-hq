"use server";

import { currentStaff } from "@/lib/access/core";
import { HqApiRequestError, HqApiUnavailableError } from "@/lib/api/core";
import { readNotificationPrefs, setNotificationTimeZone } from "@/lib/api/inbox";
import { canonicalZone, isValidZone } from "@/lib/time-zone";

/**
 * The device's zone, taken as the person's because they have none yet. Saved on the
 * notification preferences, where "Your time zone" lives; a zone already chosen is never
 * overwritten (a second tab racing the first). Silent on failure: the page prints UTC,
 * and the next load asks again.
 */
export async function setTimeZoneAction(zone: string): Promise<boolean> {
  const state = await currentStaff();
  if (typeof state === "string") return false;
  const clean = canonicalZone(String(zone ?? "").slice(0, 64));
  if (!clean || !/^[A-Za-z_+-]+(\/[A-Za-z0-9_+-]+){0,2}$/.test(clean) || !isValidZone(clean))
    return false;
  try {
    const current = (await readNotificationPrefs(state.token)).prefs;
    if (state.me.time_zone || current.time_zone) return false;
    await setNotificationTimeZone(state.token, clean);
    return true;
  } catch (error) {
    if (error instanceof HqApiRequestError || error instanceof HqApiUnavailableError) return false;
    throw error;
  }
}
