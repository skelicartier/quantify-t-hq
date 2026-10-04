import { afterEach, describe, expect, it, vi } from "vitest";

describe("when somebody last touched the page", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.resetModules();
  });

  it("counts the page unattended after two minutes untouched, and calls back on the first touch", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-04T09:00:00Z"));
    const activity = await import("@/lib/activity");
    activity.watchActivity();
    expect(activity.isAway()).toBe(false);
    const returned = vi.fn();
    const stop = activity.onReturn(returned);

    vi.setSystemTime(new Date("2026-10-04T09:01:59Z"));
    expect(activity.isAway()).toBe(false);
    window.dispatchEvent(new Event("keydown"));
    expect(returned).not.toHaveBeenCalled();

    vi.setSystemTime(new Date("2026-10-04T09:04:00Z"));
    expect(activity.isAway()).toBe(true);
    window.dispatchEvent(new Event("pointerdown"));
    expect(activity.isAway()).toBe(false);
    expect(returned).toHaveBeenCalledTimes(1);

    stop();
    vi.setSystemTime(new Date("2026-10-04T09:10:00Z"));
    window.dispatchEvent(new Event("wheel"));
    expect(returned).toHaveBeenCalledTimes(1);
  });
});
