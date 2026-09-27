"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

const STALE_AFTER_MS = 10_000;

type Navigation = { from: string; to: string };

/**
 * A thin bar along the top edge while a same-origin link is loading. Clicks are
 * observed on the document, so every console link — sidebar, paging, "Open" — gets the
 * same indicator without wrapping each one; it ends when the location changes.
 */
export function RouteProgress() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const current = `${pathname}?${searchParams.toString()}`;
  const [navigation, setNavigation] = useState<Navigation | null>(null);

  useEffect(() => {
    function onClick(event: MouseEvent) {
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const target = event.target instanceof Element ? event.target : null;
      const anchor = target?.closest("a[href]");
      if (!(anchor instanceof HTMLAnchorElement)) return;
      if (anchor.target === "_blank" || anchor.hasAttribute("download")) return;
      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      const to = `${url.pathname}?${url.searchParams.toString()}`;
      if (to === current) return;
      const started: Navigation = { from: current, to };
      setNavigation(started);
      window.setTimeout(
        () => setNavigation((active) => (active === started ? null : active)),
        STALE_AFTER_MS,
      );
    }
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, [current]);

  const pending = navigation !== null && navigation.from === current;
  if (!pending) return null;
  return <div className="route-progress" role="progressbar" aria-label="Loading page" />;
}
