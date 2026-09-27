import { describe, expect, it } from "vitest";

import { formatRateLimitMessage } from "@/lib/auth/rate-limit";

describe("rate-limit copy", () => {
  it("rounds the wait UP to whole minutes", () => {
    expect(formatRateLimitMessage(59)).toContain("about a minute");
    expect(formatRateLimitMessage(61)).toContain("about 2 minutes");
    expect(formatRateLimitMessage(240)).toContain("about 4 minutes");
  });

  it("never names which limit was hit", () => {
    for (const message of [formatRateLimitMessage(60), formatRateLimitMessage()]) {
      expect(message.toLowerCase()).not.toContain("account");
      expect(message.toLowerCase()).not.toContain("address");
    }
  });
});
