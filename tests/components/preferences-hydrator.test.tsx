import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const saved = vi.hoisted(() => ({ calls: [] as [string, string][] }));
vi.mock("@/app/(portal)/_actions/preferences", () => ({
  setPreferenceAction: async (key: string, value: string) => {
    saved.calls.push([key, value]);
    return true;
  },
}));

import { PreferencesHydrator } from "@/components/shell/preferences-hydrator";
import { syncPreference } from "@/lib/prefs/sync";

/** The test environment has no local storage of its own: a plain one in memory. */
class MemoryStorage implements Storage {
  private items = new Map<string, string>();
  get length() {
    return this.items.size;
  }
  key(index: number) {
    return [...this.items.keys()][index] ?? null;
  }
  getItem(key: string) {
    return this.items.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.items.set(key, String(value));
  }
  removeItem(key: string) {
    this.items.delete(key);
  }
  clear() {
    this.items.clear();
  }
}

/**
 * The account's copy comes onto the device — unless the device changed the preference
 * and the account never heard (a page left inside the sync's debounce): then the
 * device's newer choice is kept and sent again, not overwritten by the older one.
 */
describe("PreferencesHydrator", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    Object.defineProperty(window, "localStorage", {
      value: new MemoryStorage(),
      configurable: true,
    });
    saved.calls = [];
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("brings the account's copy onto a device that has not changed it", () => {
    window.localStorage.setItem("hq-density", "comfortable");
    render(<PreferencesHydrator preferences={{ "hq-density": "compact" }} />);
    expect(window.localStorage.getItem("hq-density")).toBe("compact");
  });

  it("keeps a change the account never received, and sends it again", async () => {
    // Switched back on, and the page left before the 400ms sync ran.
    window.localStorage.setItem("hq-single-keys", "on");
    syncPreference("hq-single-keys", "on");
    render(<PreferencesHydrator preferences={{ "hq-single-keys": "off" }} />);
    expect(window.localStorage.getItem("hq-single-keys")).toBe("on");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });
    expect(saved.calls).toEqual([["hq-single-keys", "on"]]);
    expect(window.localStorage.getItem("hq-pending:hq-single-keys")).toBeNull();
  });

  it("forgets a pending change the account already holds", () => {
    window.localStorage.setItem("hq-pending:hq-favourites", "[]");
    render(<PreferencesHydrator preferences={{ "hq-favourites": "[]" }} />);
    expect(window.localStorage.getItem("hq-pending:hq-favourites")).toBeNull();
    expect(saved.calls).toEqual([]);
  });
});
