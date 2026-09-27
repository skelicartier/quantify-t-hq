"use client";

import { useSyncExternalStore } from "react";

const PLACEHOLDER = "--:--:-- UTC";

function subscribe(onTick: () => void) {
  const id = window.setInterval(onTick, 1000);
  return () => window.clearInterval(id);
}

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function readClock() {
  const now = new Date();
  return `${pad(now.getUTCHours())}:${pad(now.getUTCMinutes())}:${pad(now.getUTCSeconds())} UTC`;
}

function readServerClock() {
  return PLACEHOLDER;
}

/**
 * A ticking UTC clock for the sidebar status line. Rendered as a placeholder on the
 * server so hydration always matches, then driven by an external-store subscription.
 */
export function SidebarClock() {
  const clock = useSyncExternalStore(subscribe, readClock, readServerClock);
  return <span className="sidebar__clock">{clock}</span>;
}
