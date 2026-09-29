"use client";

import { useEffect } from "react";

/**
 * Brings the account's display preferences onto this device: any key the account has
 * that the device lacks (or holds differently) is written to local storage and the
 * matching change event fired, so column menus and the density toggle re-read it. The
 * device's own recent change wins for the page it was made on, because the sync back to
 * the account has already run by the next load.
 */
export function PreferencesHydrator({
  preferences,
}: {
  preferences: Readonly<Record<string, string>>;
}) {
  useEffect(() => {
    const events: Record<string, string> = {
      "hq-density": "hq-density-change",
    };
    for (const [key, value] of Object.entries(preferences)) {
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
