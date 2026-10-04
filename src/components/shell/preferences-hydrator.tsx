"use client";

import { useEffect } from "react";

import { clearPending, pendingPreferences, syncPreference } from "@/lib/prefs/sync";

/**
 * Brings the account's display preferences onto this device: any key the account has
 * that the device lacks (or holds differently) is written to local storage and the
 * matching change event fired, so column menus and the density toggle re-read it.
 *
 * A change this device made that the account never confirmed (the page was left inside
 * the sync's debounce, or the write failed) is newer than the account's copy: it is kept,
 * and sent again, rather than overwritten by the older value.
 */
export function PreferencesHydrator({
  preferences,
}: {
  preferences: Readonly<Record<string, string>>;
}) {
  useEffect(() => {
    const events: Record<string, string> = {
      "hq-density": "hq-density-change",
      "hq-favourites": "hq-favourites-change",
      "hq-single-keys": "hq-single-keys-change",
    };
    const pending = pendingPreferences();
    for (const [key, value] of pending) {
      // An empty value clears the account's copy, so an absent key is that change saved.
      if ((preferences[key] ?? "") === value) clearPending(key, value);
      else syncPreference(key, value);
    }
    for (const [key, value] of Object.entries(preferences)) {
      if (pending.has(key)) continue;
      try {
        if (window.localStorage.getItem(key) === value) continue;
        window.localStorage.setItem(key, value);
      } catch {
        continue;
      }
      const event =
        events[key] ??
        (key.startsWith("hq-columns:")
          ? "hq-columns-change"
          : key.startsWith("hq-views:")
            ? "hq-views-change"
            : "");
      if (event) window.dispatchEvent(new Event(event));
    }
  }, [preferences]);
  return null;
}
