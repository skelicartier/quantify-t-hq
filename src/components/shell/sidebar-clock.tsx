"use client";

import { useSyncExternalStore } from "react";

import { useTimeZone } from "@/components/shell/time-zone-context";
import { partsInZone, zoneName } from "@/lib/time-zone";

/**
 * The second the clock shows, in seconds since the epoch; 0 until a clock is on screen.
 *
 * It moves only when the tick moves it, never when it is read. React reads a store twice
 * in a row to see that it holds still, and a read that asked the system clock each time
 * gave two answers whenever a second turned over between the two: "The result of
 * getSnapshot should be cached", once in some thousands of page loads, on any screen.
 */
let second = 0;

function subscribe(onTick: () => void) {
  second = Math.floor(Date.now() / 1000);
  const id = window.setInterval(() => {
    second = Math.floor(Date.now() / 1000);
    onTick();
  }, 1000);
  return () => window.clearInterval(id);
}

function readSecond(): number {
  return second;
}

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function nameOf(zone: string, moment: Date): string {
  return zone && zone !== "UTC" ? zoneName(zone, moment, partsInZone(moment, zone).offset) : "UTC";
}

/**
 * A ticking clock for the sidebar status line, in the person's zone (UTC until they have
 * one). Rendered as a placeholder on the server so hydration always matches, then driven
 * by an external-store subscription.
 */
export function SidebarClock() {
  const zone = useTimeZone();
  const shown = useSyncExternalStore(subscribe, readSecond, () => 0);
  if (shown === 0) {
    return <span className="sidebar__clock">{`--:--:-- ${nameOf(zone, new Date())}`}</span>;
  }
  const moment = new Date(shown * 1000);
  const parts = partsInZone(moment, zone);
  return (
    <span className="sidebar__clock">
      {`${pad(parts.hour)}:${pad(parts.minute)}:${pad(moment.getUTCSeconds())} ${nameOf(zone, moment)}`}
    </span>
  );
}
