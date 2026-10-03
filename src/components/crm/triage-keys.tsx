"use client";

import { useEffect } from "react";

import { isTypingTarget } from "@/components/shell/palette-bus";

/**
 * Triage's four verbs and the skip, on the keyboard: `1` take it, `2` its look-alikes,
 * `3` disqualify, `h` set it aside, `j` the next one. A key that needs a word more (a
 * reason, a date) puts the cursor in that field; the others press their button or link.
 * Each element declares its key (`data-triage-key`), so the page prints what it binds.
 */
export function TriageKeys() {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (isTypingTarget(event.target)) return;
      if (document.querySelector("dialog[open]")) return;
      const key = event.key.toLowerCase();
      if (!["1", "2", "3", "h", "j"].includes(key)) return;
      const target = document.querySelector<HTMLElement>(`[data-triage-key="${key}"]`);
      if (!target) return;
      event.preventDefault();
      if (target instanceof HTMLInputElement && target.type === "hidden") {
        // A form that needs no word more: its key sends it.
        target.form?.requestSubmit();
      } else if (target instanceof HTMLInputElement || target instanceof HTMLSelectElement) {
        target.closest("details")?.setAttribute("open", "");
        target.focus();
      } else {
        target.click();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return null;
}
