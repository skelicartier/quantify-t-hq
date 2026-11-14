"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";

/**
 * "Copy as text": the monthly update's words exactly as "The email" shows them, ready to
 * paste into a mailing in Mail merge. Says so when the browser refuses rather than failing
 * quietly; nothing is sent from here.
 */
export function CopyTextButton({ text, label = "Copy as text" }: { text: string; label?: string }) {
  const [said, setSaid] = useState("");
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setSaid("Copied.");
    } catch {
      setSaid("The browser would not copy it: select the text under “The email” instead.");
    }
    window.setTimeout(() => setSaid(""), 2500);
  }
  return (
    <span className="hqdata-copy">
      <Button type="button" size="small" onClick={copy}>
        {label}
      </Button>
      <span className="quiet" role="status" aria-live="polite">
        {said}
      </span>
    </span>
  );
}
