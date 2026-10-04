"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { isAway, onReturn, watchActivity } from "@/lib/activity";

/**
 * Keeps a server-rendered page current without a reload.
 *
 * Everything in this console is `force-dynamic` and every fetch is `no-store`, so the page
 * is already a fresh read on every request — what was missing was anything that asks for
 * one. This asks: `router.refresh()` re-runs the server render in place and React
 * reconciles the result, so nothing is remounted and no second data path exists to keep in
 * step with the first.
 *
 * Three rules, each of them there because the obvious version is worse:
 *
 * 1. **Nothing happens while the tab is hidden.** A desk leaves the queue open all day;
 *    polling a background tab spends the operator's battery and the service's rate limit
 *    to redraw something nobody is looking at. Coming back to the tab refreshes at once,
 *    so what they see on return is current rather than however old the last poll was.
 * 2. **Nothing happens while somebody is typing.** A reply half-written in a box is the
 *    one thing on these pages worth protecting, and the safest way to protect it is not to
 *    re-render the tree around it mid-sentence.
 * 3. **It can be turned off.** Somebody reading a long thread does not want the ground
 *    moving under them, and a live view with no off switch is one people work around by
 *    closing the page.
 * 4. **Nothing happens once nobody is there.** Each refresh counts as the person being
 *    here, so a screen left on would never reach the session's idle sign-out. After two
 *    minutes untouched it stops asking and says so; the first touch refreshes at once.
 */

type LiveRefreshProps = {
  /** How often to ask, in seconds. A desk answers in minutes, so this is not a stream. */
  intervalSeconds?: number;
  /** What is being kept current, for the control's accessible name. */
  label: string;
};

const MIN_INTERVAL_SECONDS = 5;

/** Whether the person is mid-sentence somewhere on the page. */
function isTyping(): boolean {
  const active = document.activeElement;
  if (!(active instanceof HTMLElement)) return false;
  if (active.isContentEditable) return true;
  const tag = active.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

export function LiveRefresh({ intervalSeconds = 30, label }: LiveRefreshProps) {
  const router = useRouter();
  const [live, setLive] = useState(true);
  const [away, setAway] = useState(false);

  // `live` is a dependency rather than something read through a ref: pausing tears the
  // timer and the listener down instead of leaving them running and throwing the result
  // away, so a paused indicator means nothing is scheduled at all.
  useEffect(() => {
    if (!live) return;
    watchActivity();

    const refresh = () => {
      const unattended = isAway();
      setAway(unattended);
      if (document.hidden || isTyping() || unattended) return;
      router.refresh();
    };
    const seconds = Math.max(MIN_INTERVAL_SECONDS, intervalSeconds);
    const timer = window.setInterval(refresh, seconds * 1_000);
    const onVisible = () => {
      // Returning to the tab is exactly when the page is most likely to be stale and most
      // likely to be read, so it does not wait for the next tick.
      if (!document.hidden) refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    const stopReturn = onReturn(refresh);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      stopReturn();
    };
  }, [intervalSeconds, live, router]);

  return (
    <span className="live-refresh">
      <button
        type="button"
        className="live-refresh__toggle"
        aria-pressed={live}
        onClick={() => setLive((current) => !current)}
      >
        <span
          className={["live-refresh__dot", live && !away ? "live-refresh__dot--on" : ""]
            .filter(Boolean)
            .join(" ")}
          aria-hidden="true"
        />
        {!live
          ? `${label} updates paused`
          : away
            ? `${label} paused while nobody is here`
            : `${label} updates automatically`}
      </button>
    </span>
  );
}
