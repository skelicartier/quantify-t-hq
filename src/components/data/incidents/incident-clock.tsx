"use client";

import { useEffect, useState } from "react";

import { istParts, minutesBetween, spanWords } from "@/lib/data/labels-duties";

/** "4 hours 40 minutes left" before the deadline; "1 hour 5 minutes ago" after it. */
export function clockWords(deadline: string, now: string): string {
  return now > deadline
    ? `${spanWords(minutesBetween(deadline, now))} ago`
    : `${spanWords(minutesBetween(now, deadline))} left`;
}

/**
 * The time left on an incident's clock (ws-notes/duties/spec.md §6.3). It starts from the
 * service's minute (`now`, which a walk may pin) and moves on with this browser's own
 * clock, re-read every 30 seconds; without script the server's words stand. "as of" names
 * the minute the words were worked out at, so a printed page says when it was true.
 */
export function IncidentClock({ deadline, now }: { deadline: string; now: string }) {
  const [shown, setShown] = useState<string | null>(null);
  useEffect(() => {
    const start = Date.now();
    const base = new Date(now).getTime();
    const timer = setInterval(() => {
      setShown(new Date(base + (Date.now() - start)).toISOString());
    }, 30_000);
    return () => clearInterval(timer);
  }, [now]);
  const at = shown ?? now;
  return (
    <span className="hqdata-incident-clock">
      <span className="hqdata-incident-clock__words">{clockWords(deadline, at)}</span>{" "}
      <span className="hqdata-incident-clock__as-of">as of {istParts(at).time} IST</span>
    </span>
  );
}
