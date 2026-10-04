"use client";

import { setPreferenceAction } from "@/app/(portal)/_actions/preferences";

/**
 * Device-local storage stays the fast path for display preferences; this mirrors a
 * change to the account (debounced per key) so another device picks it up on its next
 * page load, through the hydrator. A failed sync is silent: the device still remembers.
 *
 * Until the account has the change, the device marks it pending (`hq-pending:<key>`). A
 * page left inside the debounce, or a write that failed, would otherwise leave the
 * account's older copy to overwrite the device's newer one on the next load; the
 * hydrator lets a pending change win and sends it again.
 */

const timers = new Map<string, number>();
const PENDING = "hq-pending:";

export function syncPreference(key: string, value: string) {
  try {
    window.localStorage.setItem(PENDING + key, value);
  } catch {
    // Without storage there is no next load to protect; the write below still runs.
  }
  const existing = timers.get(key);
  if (existing !== undefined) window.clearTimeout(existing);
  timers.set(
    key,
    window.setTimeout(() => {
      timers.delete(key);
      void setPreferenceAction(key, value)
        .then((saved) => {
          if (saved) clearPending(key, value);
        })
        .catch(() => undefined);
    }, 400),
  );
}

/** Changes this device made that the account has not confirmed, by key. */
export function pendingPreferences(): Map<string, string> {
  const pending = new Map<string, string>();
  try {
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const name = window.localStorage.key(index);
      if (!name?.startsWith(PENDING)) continue;
      pending.set(name.slice(PENDING.length), window.localStorage.getItem(name) ?? "");
    }
  } catch {
    // No storage, nothing pending.
  }
  return pending;
}

/** The account holds `value` for `key` now: nothing is pending for it. */
export function clearPending(key: string, value: string) {
  try {
    if (window.localStorage.getItem(PENDING + key) === value)
      window.localStorage.removeItem(PENDING + key);
  } catch {
    // Nothing to clear without storage.
  }
}
