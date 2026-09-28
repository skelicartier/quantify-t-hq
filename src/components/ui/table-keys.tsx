"use client";

import { useEffect } from "react";

import { isTypingTarget } from "@/components/shell/palette-bus";

/**
 * `j`/`k` walk the rows of every list on the page, `Enter` opens the active row's
 * link, `Escape` clears. Mounted once per page by the table frame; the active row is
 * marked with `data-active` and styled by the table.
 */
export function TableKeys() {
  useEffect(() => {
    let active: HTMLElement | null = null;
    // Table rows and any element that declares itself a navigable row (a queue entry).
    const rows = () =>
      Array.from(
        document.querySelectorAll<HTMLElement>(".data-table tbody tr, [data-nav-row]"),
      ).filter((row) => !row.classList.contains("data-table__category"));
    const mark = (row: HTMLElement | null) => {
      active?.removeAttribute("data-active");
      active = row;
      if (row) {
        row.setAttribute("data-active", "");
        row.scrollIntoView({ block: "nearest" });
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (isTypingTarget(event.target)) return;
      if (document.querySelector("dialog[open]")) return;
      const list = rows();
      if (list.length === 0) return;
      if (event.key === "j" || event.key === "k") {
        event.preventDefault();
        const index = active ? list.indexOf(active) : -1;
        const next =
          event.key === "j" ? Math.min(index + 1, list.length - 1) : Math.max(index - 1, 0);
        mark(list[next] ?? null);
      } else if (event.key === "Enter" && active) {
        const link =
          active instanceof HTMLAnchorElement
            ? active
            : active.querySelector<HTMLAnchorElement>("a[href]");
        if (link) {
          event.preventDefault();
          link.click();
        }
      } else if (event.key === "Escape" && active) {
        mark(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      active?.removeAttribute("data-active");
    };
  }, []);
  return null;
}
