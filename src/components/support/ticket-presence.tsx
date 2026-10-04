"use client";

import { useEffect, useRef, useState } from "react";

import { COMPOSING_EVENT } from "@/components/support/composer";
import { isAway, onReturn, watchActivity } from "@/lib/activity";

type Other = { name: string; composing: boolean };

function names(list: readonly string[]): string {
  if (list.length <= 2) return list.join(" and ");
  return `${list.slice(0, -1).join(", ")} and ${list[list.length - 1]}`;
}

/**
 * Who else has this conversation open, and who is writing in it — so two people do not
 * answer the same customer at once. The page says it is here every fifteen seconds while
 * it is visible and somebody is at it (`isAway`), at once when its writer starts or stops,
 * and shows what comes back. A page left unattended stops saying so: to its colleagues it
 * has gone, and the service never counts a heartbeat as the person being there.
 */
export function TicketPresence({
  ticketId,
  action,
}: {
  ticketId: string;
  action: (ticketId: string, composing: boolean) => Promise<Other[]>;
}) {
  const [others, setOthers] = useState<Other[]>([]);
  const composing = useRef(false);

  useEffect(() => {
    let stopped = false;
    watchActivity();
    const beat = () => {
      if (document.hidden || isAway()) return;
      action(ticketId, composing.current)
        .then((list) => {
          if (!stopped) setOthers(list);
        })
        .catch(() => undefined);
    };
    beat();
    const timer = window.setInterval(beat, 15_000);
    const onComposing = (event: Event) => {
      const next = Boolean((event as CustomEvent<boolean>).detail);
      if (next === composing.current) return;
      composing.current = next;
      beat();
    };
    const onVisible = () => {
      if (!document.hidden) beat();
    };
    window.addEventListener(COMPOSING_EVENT, onComposing);
    document.addEventListener("visibilitychange", onVisible);
    const stopReturn = onReturn(beat);
    return () => {
      stopped = true;
      window.clearInterval(timer);
      window.removeEventListener(COMPOSING_EVENT, onComposing);
      document.removeEventListener("visibilitychange", onVisible);
      stopReturn();
    };
  }, [ticketId, action]);

  if (others.length === 0) return null;
  const writing = others.filter((other) => other.composing).map((other) => other.name);
  const reading = others.filter((other) => !other.composing).map((other) => other.name);
  return (
    <p className="ticket-presence" role="status" aria-live="polite">
      {writing.length > 0 && (
        <span className="ticket-presence__writing">
          {names(writing)} {writing.length === 1 ? "is" : "are"} writing a reply.
        </span>
      )}
      {reading.length > 0 && (
        <span>
          {names(reading)} {reading.length === 1 ? "has" : "have"} this open too.
        </span>
      )}
    </p>
  );
}
