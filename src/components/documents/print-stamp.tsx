"use client";

import { useEffect, useRef } from "react";

import { useTimeZone } from "@/components/shell/time-zone-context";
import { stampLabel } from "@/lib/documents/cells";

/**
 * "Printed by … on 1 Oct 2026, 13:32 IST": the moment the page is printed, not the moment
 * it was loaded — written just before the browser lays the page out for paper, in the
 * zone the page's own times are in.
 */
export function PrintStamp({ printedBy }: { printedBy: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const zone = useTimeZone();
  useEffect(() => {
    const stamp = () => {
      if (ref.current)
        ref.current.textContent = `Printed by ${printedBy} on ${stampLabel(new Date().toISOString(), zone)}`;
    };
    stamp();
    window.addEventListener("beforeprint", stamp);
    return () => window.removeEventListener("beforeprint", stamp);
  }, [printedBy, zone]);
  // No React children: the text is the effect's alone, so a re-render never fights it.
  return <span ref={ref} />;
}
