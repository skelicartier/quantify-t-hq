import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  CHANNEL_LABELS,
  NOT_SAID,
  channelLabel,
  referrerHost,
  visitTags,
} from "@/lib/crm/attribution";

const FIXTURE = resolve(
  process.cwd(),
  "../Quantify Terminal/tests/fixtures/hq_payload_samples.json",
);

describe("the channels a lead comes from", () => {
  it.skipIf(!existsSync(FIXTURE))("are named as the service names them", () => {
    const fixture = JSON.parse(readFileSync(FIXTURE, "utf8")) as {
      owner: Record<string, { channels?: Record<string, string> }>;
    };
    const sampled = fixture.owner["hq/reports/attribution?days=90"]?.channels;
    expect(sampled).toBeDefined();
    expect(CHANNEL_LABELS).toEqual(sampled);
  });

  it("names a lead that left the question empty, and an unknown key as itself", () => {
    expect(channelLabel(NOT_SAID)).toBe("Did not say");
    expect(channelLabel("")).toBe("Did not say");
    expect(channelLabel("podcast")).toBe("A podcast");
    expect(channelLabel("podcast", { podcast: "Podcasts" })).toBe("Podcasts");
    expect(channelLabel("carrier_pigeon")).toBe("carrier_pigeon");
  });

  it("writes a visit as its tags and the host that sent it", () => {
    expect(visitTags({ utm_source: "google", utm_medium: "cpc", utm_campaign: "brand" })).toBe(
      "google · cpc · brand",
    );
    expect(visitTags({ utm_source: "", utm_medium: "", utm_campaign: "" })).toBe("");
    expect(referrerHost("https://www.google.co.in/search?q=x")).toBe("google.co.in");
    expect(referrerHost("not a url")).toBe("");
    expect(referrerHost("")).toBe("");
  });
});
