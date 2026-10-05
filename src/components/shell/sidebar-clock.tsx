"use client";

import { useSyncExternalStore } from "react";

import { useTimeZone } from "@/components/shell/time-zone-context";
import { partsInZone, zoneName } from "@/lib/time-zone";

function subscribe(onTick: () => void) {
  const id = window.setInterval(onTick, 1000);
  return () => window.clearInterval(id);
}

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function readClock(zone: string): string {
  const now = new Date();
  const parts = partsInZone(now, zone);
  const name = zone && zone !== "UTC" ? zoneName(zone, now, parts.offset) : "UTC";
  return `${pad(parts.hour)}:${pad(parts.minute)}:${pad(now.getUTCSeconds())} ${name}`;
}

/**
 * A ticking clock for the sidebar status line, in the person's zone (UTC until they have
 * one). Rendered as a placeholder on the server so hydration always matches, then driven
 * by an external-store subscription.
 */
export function SidebarClock() {
  const zone = useTimeZone();
  const clock = useSyncExternalStore(
    subscribe,
    () => readClock(zone),
    () =>
      `--:--:-- ${zone && zone !== "UTC" ? zoneName(zone, new Date(), partsInZone(new Date(), zone).offset) : "UTC"}`,
  );
  return <span className="sidebar__clock">{clock}</span>;
}
