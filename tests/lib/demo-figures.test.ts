import { describe, expect, it } from "vitest";

import { onDemoService } from "@/lib/demo-figures";

describe("demo figures", () => {
  it("are flagged when a development build reads a service on this machine", () => {
    expect(
      onDemoService({ NODE_ENV: "development", HQ_ACCOUNT_API_BASE_URL: "http://127.0.0.1:7071" }),
    ).toBe(true);
    expect(
      onDemoService({ NODE_ENV: "development", HQ_ACCOUNT_API_BASE_URL: "http://localhost:7071" }),
    ).toBe(true);
  });

  it("are not flagged against a real service or in production", () => {
    expect(
      onDemoService({
        NODE_ENV: "development",
        HQ_ACCOUNT_API_BASE_URL: "https://api.quantifyterminal.com",
      }),
    ).toBe(false);
    expect(
      onDemoService({ NODE_ENV: "production", HQ_ACCOUNT_API_BASE_URL: "http://127.0.0.1:7071" }),
    ).toBe(false);
    expect(onDemoService({ NODE_ENV: "development" })).toBe(false);
  });
});
