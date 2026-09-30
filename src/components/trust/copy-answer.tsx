"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";

/**
 * Copies an approved answer's words for pasting into a questionnaire. Says so when the
 * browser refuses (an insecure origin, a denied permission) rather than failing quietly.
 */
export function CopyAnswer({ text, label = "Copy the answer" }: { text: string; label?: string }) {
  const [said, setSaid] = useState("");
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setSaid("Copied.");
    } catch {
      setSaid("The browser would not copy it: select the text instead.");
    }
    window.setTimeout(() => setSaid(""), 2500);
  }
  return (
    <span className="copy-answer">
      <Button type="button" size="small" onClick={copy}>
        {label}
      </Button>
      <span className="quiet" role="status" aria-live="polite">
        {said}
      </span>
    </span>
  );
}
