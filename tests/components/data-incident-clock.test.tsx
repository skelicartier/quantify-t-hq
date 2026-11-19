import { act, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { IncidentClock, clockWords } from "@/components/data/incidents/incident-clock";

/**
 * The incident's clock (ws-notes/duties/spec.md §6.3, §6.6): its words at three instants
 * around the CERT-In deadline of 03:40 IST on 14 Nov 2026, the minute it moves on with the
 * browser's own clock from the service's (pinned) one, and no per cent sign anywhere.
 */

const DEADLINE = "2026-11-13T22:10:00.000Z"; // 03:40 IST, 14 Nov 2026

afterEach(() => {
  vi.useRealTimers();
});

describe("the incident clock", () => {
  it("reads the time left, nothing left, and the time since, at three instants", () => {
    expect(clockWords(DEADLINE, "2026-11-13T17:30:00.000Z")).toBe("4 hours 40 minutes left");
    expect(clockWords(DEADLINE, DEADLINE)).toBe("0 minutes left");
    expect(clockWords(DEADLINE, "2026-11-13T23:15:00.000Z")).toBe("1 hour 5 minutes ago");
  });

  it("renders the server's words as of its minute, then moves on every 30 seconds", () => {
    vi.useFakeTimers();
    const { container } = render(
      <IncidentClock deadline={DEADLINE} now="2026-11-13T17:30:00.000Z" />,
    );
    expect(container.textContent).toBe("4 hours 40 minutes left as of 23:00 IST");
    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(container.textContent).toBe("4 hours 39 minutes left as of 23:01 IST");
    expect(container.textContent).not.toContain("%");
    expect(container.querySelector("progress, meter, [role='progressbar']")).toBeNull();
  });
});
