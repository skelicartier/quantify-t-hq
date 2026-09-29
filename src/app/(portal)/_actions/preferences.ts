"use server";

import { requireStaff } from "@/lib/access/core";
import { setPreference } from "@/lib/api/views";
import { HqApiRequestError, HqApiUnavailableError } from "@/lib/api/core";

/**
 * One display preference, saved with the account so every device shows the same list
 * the same way. Fire-and-forget from the client: a failure leaves the device's own copy
 * in place and is not worth interrupting anybody for.
 */
export async function setPreferenceAction(key: string, value: string): Promise<boolean> {
  const context = await requireStaff("/home");
  if (!/^[a-z][a-z0-9_.:-]{1,63}$/.test(key) || typeof value !== "string" || value.length > 2000) {
    return false;
  }
  try {
    await setPreference(context.token, key, value);
    return true;
  } catch (error) {
    if (error instanceof HqApiRequestError || error instanceof HqApiUnavailableError) return false;
    throw error;
  }
}
