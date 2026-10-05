"use client";

import { useSyncExternalStore } from "react";

import { useTimeZone } from "@/components/shell/time-zone-context";
import { formatDateTime } from "@/lib/format";

type LocalTimeProps = {
  value: string | null | undefined;
  /** Shown when the instant is missing or unparseable. */
  fallback?: string | undefined;
  prefix?: string | undefined;
  /** "time" draws only the clock, for a list that is already about one day. */
  mode?: "datetime" | "time" | undefined;
};

// Nothing to subscribe to: the store exists only to distinguish "rendered on the server
// or during hydration" from "running in the browser", which is the one moment the
// device's timezone becomes knowable.
const subscribe = () => () => {};
const onClient = () => true;
const onServer = () => false;

/**
 * An absolute instant in the reader's own zone.
 *
 * The API sends quota resets as instants rather than as "midnight" precisely so the
 * page can say when that is where the reader lives: a daily allowance that rolls over
 * at 05:30 in India is confusing enough without the console also making them convert.
 *
 * With a zone on the account it is printed in that zone on the server and the client
 * alike. Before one is set, the server render and the hydration render are both UTC, so
 * the markup matches exactly, and the device's form replaces it on the first browser
 * render. The UTC form stays as the tooltip either way.
 */
export function LocalTime({
  value,
  fallback = "Not available",
  prefix,
  mode = "datetime",
}: LocalTimeProps) {
  const zone = useTimeZone();
  const hydrated = useSyncExternalStore(subscribe, onClient, onServer);
  const formatted = formatDateTime(value, { zone });
  if (!formatted.valid) return <span className="quiet">{fallback}</span>;

  let local =
    mode === "time"
      ? (formatted.absolute.split(", ")[1] ?? formatted.absolute)
      : formatted.absolute;
  if (!zone && hydrated) {
    try {
      local = new Intl.DateTimeFormat(
        undefined,
        mode === "time"
          ? { hour: "2-digit", minute: "2-digit" }
          : { dateStyle: "medium", timeStyle: "short", timeZoneName: "short" },
      ).format(new Date(formatted.iso));
    } catch {
      local = formatted.absolute;
    }
  }

  return (
    <time className="timestamp" dateTime={formatted.iso} title={formatted.utc}>
      {prefix ? `${prefix} ` : ""}
      {local}
    </time>
  );
}
