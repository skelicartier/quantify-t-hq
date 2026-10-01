"use client";

import { useEffect, useRef } from "react";

import { stampLabel } from "@/lib/documents/cells";

/**
 * "Printed by … on 1 Oct 2026, 08:02 UTC": the moment the page is printed, not the moment
 * it was loaded — written just before the browser lays the page out for paper.
 */
export function PrintStamp({ printedBy }: { printedBy: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const stamp = () => {
      if (ref.current)
        ref.current.textContent = `Printed by ${printedBy} on ${stampLabel(new Date().toISOString())}`;
    };
    stamp();
    window.addEventListener("beforeprint", stamp);
    return () => window.removeEventListener("beforeprint", stamp);
  }, [printedBy]);
  // No React children: the text is the effect's alone, so a re-render never fights it.
  return <span ref={ref} />;
}
