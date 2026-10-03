import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { INBOX_REASONS, PRIORITY_DEFAULT } from "@/lib/inbox/reasons";

const FIXTURE = resolve(
  process.cwd(),
  "../Quantify Terminal/tests/fixtures/hq_payload_samples.json",
);

type Sampled = {
  reasons?: { reason: string; label: string }[];
  rule?: { reasons: string[]; default: boolean };
};

describe("the inbox's reasons and the default Priority", () => {
  it.skipIf(!existsSync(FIXTURE))("are the service's own, in its order", () => {
    const fixture = JSON.parse(readFileSync(FIXTURE, "utf8")) as {
      owner: Record<string, Sampled>;
    };
    const sampled = fixture.owner["hq/inbox"];
    expect(INBOX_REASONS.map(({ reason, label }) => ({ reason, label }))).toEqual(sampled?.reasons);
    expect(sampled?.rule?.default).toBe(true);
    expect([...PRIORITY_DEFAULT]).toEqual(sampled?.rule?.reasons);
  });

  it("names every default reason among the reasons", () => {
    const known = new Set(INBOX_REASONS.map((item) => item.reason));
    for (const reason of PRIORITY_DEFAULT) expect(known.has(reason)).toBe(true);
  });
});
