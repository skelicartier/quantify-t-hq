import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SidebarClock } from "@/components/shell/sidebar-clock";
import { TimeZoneProvider } from "@/components/shell/time-zone-context";

/**
 * The clock is a store React reads twice in a row to see that it holds still. It must
 * move with its tick and not with the system clock, or a second turning over between
 * the two reads is an error in the console of whatever screen was open.
 */
describe("the sidebar clock", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-05T09:00:00.900Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows the time once it is on screen, in UTC outside a provider", () => {
    const { container } = render(<SidebarClock />);
    expect(container.textContent).toBe("09:00:00 UTC");
  });

  it("holds still between ticks, however far the system clock moves, and says nothing", () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const { container, rerender } = render(<SidebarClock />);
    // The second turns over, and more, with no tick: every read must give the same answer.
    vi.setSystemTime(new Date("2026-11-05T09:00:07.100Z"));
    rerender(<SidebarClock />);
    expect(container.textContent).toBe("09:00:00 UTC");
    expect(errors).not.toHaveBeenCalled();
    errors.mockRestore();
  });

  it("moves on with the tick, in the person's zone", () => {
    const { container } = render(
      <TimeZoneProvider zone="Asia/Kolkata" adopt={async () => false}>
        <SidebarClock />
      </TimeZoneProvider>,
    );
    expect(container.textContent).toBe("14:30:00 IST");
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(container.textContent).toBe("14:30:01 IST");
  });
});
