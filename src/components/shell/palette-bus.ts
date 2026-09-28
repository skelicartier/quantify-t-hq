/** A tiny event bus so any button can open the palette without prop-drilling. */
export const PALETTE_OPEN_EVENT = "hq-palette-open";
export const SHORTCUTS_OPEN_EVENT = "hq-shortcuts-open";

export function openPalette() {
  window.dispatchEvent(new Event(PALETTE_OPEN_EVENT));
}

export function openShortcuts() {
  window.dispatchEvent(new Event(SHORTCUTS_OPEN_EVENT));
}

/** Whether a key press belongs to a field the person is typing in. */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}
