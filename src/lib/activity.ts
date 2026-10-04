/**
 * When somebody last touched the page.
 *
 * A page that asks the service for things on a timer (a live list, who else has a
 * conversation open) is asking on nobody's behalf once its person has walked away, and
 * every one of those requests counts as them being there: a screen left on would never
 * reach the session's idle sign-out. The pollers ask `isAway()` before each tick and stay
 * quiet once nobody has touched the page for `AWAY_AFTER_MS`, so the idle allowance runs
 * out as it should; the first touch after that asks again at once (`onReturn`).
 *
 * Client-only: every function here is called from an effect.
 */

/** How long without a key, a click, a scroll or a pointer move before a page is unattended. */
export const AWAY_AFTER_MS = 2 * 60_000;

const EVENTS = ["pointerdown", "pointermove", "keydown", "wheel", "touchstart", "scroll"] as const;

let lastActivity = Date.now();
let listening = false;
const returning = new Set<() => void>();

function mark() {
  const wasAway = isAway();
  lastActivity = Date.now();
  if (wasAway) for (const callback of returning) callback();
}

/** Starts listening, once per page load; later calls do nothing. */
export function watchActivity(): void {
  if (listening || typeof window === "undefined") return;
  listening = true;
  for (const name of EVENTS) window.addEventListener(name, mark, { passive: true, capture: true });
}

export function isAway(now = Date.now()): boolean {
  return now - lastActivity > AWAY_AFTER_MS;
}

/** Called on the first touch after the page was unattended. Returns the unsubscribe. */
export function onReturn(callback: () => void): () => void {
  returning.add(callback);
  return () => {
    returning.delete(callback);
  };
}
