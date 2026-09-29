"use client";

import { useEffect } from "react";

import { isTypingTarget } from "@/components/shell/palette-bus";

export const COMPOSER_MODE_EVENT = "hq-composer-mode";

/**
 * Single keys inside an open conversation: `r` reply, `n` note, `a` assignee, `s`
 * status, `p` priority, `t` tags, `z` snooze. Each one puts the cursor where the work
 * is; none of them sends anything. Mounted once per open ticket, ignored while typing.
 */
export function DeskKeys() {
  useEffect(() => {
    const focusField = (id: string) => {
      const field = document.getElementById(id);
      if (field instanceof HTMLElement) {
        field.focus();
        field.scrollIntoView({ block: "nearest" });
        return true;
      }
      return false;
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (isTypingTarget(event.target)) return;
      if (document.querySelector("dialog[open]")) return;
      const map: Record<string, () => boolean> = {
        r: () => {
          window.dispatchEvent(new CustomEvent(COMPOSER_MODE_EVENT, { detail: "reply" }));
          return true;
        },
        n: () => {
          window.dispatchEvent(new CustomEvent(COMPOSER_MODE_EVENT, { detail: "note" }));
          return true;
        },
        a: () => focusField("ticket-assignee"),
        s: () => focusField("ticket-status"),
        p: () => focusField("ticket-priority"),
        t: () => focusField("ticket-tags"),
        z: () => focusField("ticket-snooze"),
      };
      const handler = map[event.key];
      if (handler && handler()) event.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return null;
}
