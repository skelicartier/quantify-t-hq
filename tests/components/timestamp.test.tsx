import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { TimeZoneProvider } from "@/components/shell/time-zone-context";
import { LocalTime } from "@/components/ui/local-time";
import { Timestamp } from "@/components/ui/timestamp";

/**
 * A timestamp prints in the zone the provider hands down and keeps the UTC form as its
 * title; outside a provider it prints UTC, as the public and sign-in pages do.
 */
describe("Timestamp in the person's zone", () => {
  it("shows the zone's wall clock with the UTC form on hover", () => {
    render(
      <TimeZoneProvider zone="Asia/Kolkata" adopt={async () => false}>
        <Timestamp value="2026-09-05T04:05:00Z" mode="absolute" />
      </TimeZoneProvider>,
    );
    const time = screen.getByText("5 Sep 2026, 09:35 IST");
    expect(time).toHaveAttribute("title", "5 Sep 2026, 04:05 UTC");
    expect(time).toHaveAttribute("dateTime", "2026-09-05T04:05:00.000Z");
  });

  it("prints UTC outside a provider, and a calendar date unshifted anywhere", () => {
    render(
      <>
        <Timestamp value="2026-09-05T04:05:00Z" mode="absolute" />
        <TimeZoneProvider zone="America/Los_Angeles" adopt={async () => false}>
          <Timestamp value="2026-09-05" mode="date" />
        </TimeZoneProvider>
      </>,
    );
    expect(screen.getByText("5 Sep 2026, 04:05 UTC")).toBeInTheDocument();
    expect(screen.getByText("5 Sep 2026")).toBeInTheDocument();
  });

  it("LocalTime follows the person's zone once there is one", () => {
    render(
      <TimeZoneProvider zone="Europe/London" adopt={async () => false}>
        <LocalTime value="2026-07-01T12:00:00Z" mode="time" />
      </TimeZoneProvider>,
    );
    expect(screen.getByText("13:00 BST")).toHaveAttribute("title", "1 Jul 2026, 12:00 UTC");
  });
});
