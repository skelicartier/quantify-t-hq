/**
 * The reports a person has pinned to their dashboard, in their order: a display
 * preference kept with the account (`hq-dashboard`), so it follows them between machines.
 * A pin whose report was deleted or stopped being shared simply stops showing.
 */

export const DASHBOARD_PREFERENCE = "hq-dashboard";
/** A preference holds 2,000 characters; two dozen ids fit with room to spare. */
export const MAX_PINS = 24;

const ID = /^[0-9a-z-]{8,64}$/i;

export function parsePins(value: string | undefined | null): string[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    const seen = new Set<string>();
    const out: string[] = [];
    for (const item of parsed) {
      const id = typeof item === "string" ? item.toLowerCase() : "";
      if (!ID.test(id) || seen.has(id)) continue;
      seen.add(id);
      out.push(id);
      if (out.length >= MAX_PINS) break;
    }
    return out;
  } catch {
    return [];
  }
}

export function serializePins(pins: readonly string[]): string {
  return pins.length ? JSON.stringify(pins.slice(0, MAX_PINS)) : "";
}

/** Pinned → unpinned, unpinned → pinned at the end (refused past the cap). */
export function togglePin(pins: readonly string[], id: string): string[] | null {
  const key = id.toLowerCase();
  if (pins.includes(key)) return pins.filter((pin) => pin !== key);
  if (pins.length >= MAX_PINS) return null;
  return [...pins, key];
}

/** One place earlier ("up") or later ("down"); unchanged at either end. */
export function movePin(pins: readonly string[], id: string, direction: "up" | "down"): string[] {
  const key = id.toLowerCase();
  const index = pins.indexOf(key);
  const target = direction === "up" ? index - 1 : index + 1;
  if (index < 0 || target < 0 || target >= pins.length) return [...pins];
  const next = [...pins];
  [next[index], next[target]] = [next[target]!, next[index]!];
  return next;
}
