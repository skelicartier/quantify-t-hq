"use client";

import { useSyncExternalStore } from "react";

import { formatDateTime } from "@/lib/format";

type LocalTimeProps = {
  value: string | null | undefined;
  /** Shown when the instant is missing or unparseable. */
  fallback?: string | undefined;
  prefix?: string | undefined;
};

// Nothing to subscribe to: the store exists only to distinguish "rendered on the server
// or during hydration" from "running in the browser", which is the one moment the
// reader's timezone becomes knowable.
const subscribe = () => () => {};
const onClient = () => true;
const onServer = () => false;

/**
 * An absolute instant rendered in the reader's own timezone.
 *
 * The API sends quota resets as instants rather than as "midnight" precisely so the
 * client can say when that is where the reader lives: a daily allowance that rolls over
 * at 05:30 in India is confusing enough without the console also making them convert.
 *
 * The server render and the hydration render are both the console's UTC form, so the
 * markup matches exactly; the local form replaces it on the first browser render. The
 * UTC form stays as the tooltip either way, so a support conversation can still quote
 * one shared instant.
 */
export function LocalTime({ value, fallback = "Not available", prefix }: LocalTimeProps) {
  const hydrated = useSyncExternalStore(subscribe, onClient, onServer);
  const formatted = formatDateTime(value);
  if (!formatted.valid) return <span className="quiet">{fallback}</span>;

  let local = formatted.absolute;
  if (hydrated) {
    try {
      local = new Intl.DateTimeFormat(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
        timeZoneName: "short",
      }).format(new Date(formatted.iso));
    } catch {
      local = formatted.absolute;
    }
  }

  return (
    <time className="timestamp" dateTime={formatted.iso} title={`${formatted.absolute} (UTC)`}>
      {prefix ? `${prefix} ` : ""}
      {local}
    </time>
  );
}
