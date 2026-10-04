"use client";

import { useSyncExternalStore } from "react";

import { syncPreference } from "@/lib/prefs/sync";

/**
 * Single-key shortcuts (`g` then a letter, `j`/`k`, `/`, `?`, the desk's letters) can be
 * switched off, as WCAG 2.1.4 asks: a speech-input user saying a word can otherwise fire
 * a string of them. Kept with the account like the other display preferences, so it
 * holds on every device; ⌘K (a key with a modifier) always opens search.
 */

export const SINGLE_KEYS = "hq-single-keys";
export const SINGLE_KEYS_EVENT = "hq-single-keys-change";

function read(): string {
  try {
    return window.localStorage.getItem(SINGLE_KEYS) ?? "on";
  } catch {
    return "on";
  }
}

/** Whether single-key shortcuts may act. On unless the person switched them off. */
export function singleKeysOn(): boolean {
  return read() !== "off";
}

export function setSingleKeys(on: boolean) {
  const value = on ? "on" : "off";
  try {
    window.localStorage.setItem(SINGLE_KEYS, value);
  } catch {
    // Without storage the choice lasts for the page.
  }
  window.dispatchEvent(new Event(SINGLE_KEYS_EVENT));
  syncPreference(SINGLE_KEYS, value);
}

function subscribe(onChange: () => void) {
  window.addEventListener(SINGLE_KEYS_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(SINGLE_KEYS_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

export function useSingleKeys(): boolean {
  return useSyncExternalStore(subscribe, singleKeysOn, () => true);
}
