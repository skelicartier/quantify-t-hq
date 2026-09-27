import "server-only";

/**
 * The instant a page is being rendered, read once per request so every relative
 * timestamp on the page agrees with the others. Pages pass it down as a prop; client
 * components never read the clock themselves, which keeps server and client output
 * identical during hydration.
 */
export function requestNow(): number {
  return Date.now();
}
