"use client";

import { useTimeZone } from "@/components/shell/time-zone-context";
import { formatDateTime } from "@/lib/format";

type TimestampProps = {
  value: string | null | undefined;
  /** Reference instant for the relative form; omit to render the absolute form only. */
  now?: number | undefined;
  mode?: "relative" | "absolute" | "both" | "date" | undefined;
  prefix?: string | undefined;
  fallback?: string | undefined;
};

/**
 * `<time>` with a machine-readable `dateTime`, the person's own zone for what it shows,
 * the UTC form as its title so one shared instant can still be quoted, and a relative
 * form when the page supplies `now`. Never reads the clock itself, so server and client
 * output match; the zone comes from the provider on both sides.
 */
export function Timestamp({
  value,
  now,
  mode = "relative",
  prefix,
  fallback = "Not available",
}: TimestampProps) {
  const zone = useTimeZone();
  const formatted = formatDateTime(value, {
    now,
    style: mode === "date" ? "date" : "datetime",
    zone,
  });
  if (!formatted.valid) return <span className="quiet">{fallback}</span>;

  const hasRelative = formatted.relative !== "";
  const primary =
    mode === "absolute" || mode === "date" || !hasRelative
      ? formatted.absolute
      : formatted.relative;
  const secondary = mode === "both" && hasRelative ? formatted.absolute : null;

  return (
    <time className="timestamp" dateTime={formatted.iso} title={formatted.utc}>
      {prefix ? `${prefix} ` : ""}
      {primary}
      {secondary && <span className="timestamp__secondary">{secondary}</span>}
    </time>
  );
}
