"use client";

import { setPreferenceAction } from "@/app/(portal)/_actions/preferences";

/**
 * Device-local storage stays the fast path for display preferences; this mirrors a
 * change to the account (debounced per key) so another device picks it up on its next
 * page load, through the hydrator. A failed sync is silent: the device still remembers.
 */

const timers = new Map<string, number>();

export function syncPreference(key: string, value: string) {
  const existing = timers.get(key);
  if (existing !== undefined) window.clearTimeout(existing);
  timers.set(
    key,
    window.setTimeout(() => {
      timers.delete(key);
      void setPreferenceAction(key, value).catch(() => undefined);
    }, 400),
  );
}
