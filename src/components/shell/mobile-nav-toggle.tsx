"use client";

import { Menu, X } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

const OPEN_ATTRIBUTE = "data-nav-open";

/**
 * Opens the sidebar as a full-screen overlay on small screens. The sidebar itself is the
 * same node the desktop layout renders, so there is exactly one navigation landmark.
 */
export function MobileNavToggle() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  // Close on navigation by adjusting state during render rather than in an effect, so
  // the closed frame is the first one painted after a route change.
  const [seenPathname, setSeenPathname] = useState(pathname);
  if (pathname !== seenPathname) {
    setSeenPathname(pathname);
    setOpen(false);
  }
  const buttonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    const root = document.documentElement;
    if (!open) {
      root.removeAttribute(OPEN_ATTRIBUTE);
      return undefined;
    }
    root.setAttribute(OPEN_ATTRIBUTE, "");
    document.querySelector<HTMLElement>("#shell-sidebar a, #shell-sidebar button")?.focus();
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      root.removeAttribute(OPEN_ATTRIBUTE);
    };
  }, [open]);

  return (
    <button
      ref={buttonRef}
      className="nav-toggle"
      type="button"
      aria-controls="shell-sidebar"
      aria-expanded={open}
      aria-label={open ? "Close menu" : "Open menu"}
      onClick={() => setOpen((value) => !value)}
    >
      {open ? <X size={20} aria-hidden="true" /> : <Menu size={20} aria-hidden="true" />}
    </button>
  );
}
