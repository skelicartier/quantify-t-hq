import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  PROSPECT_FIELD_KEYS,
  PROSPECT_SORTS,
  facetLabel,
  parseTags,
  prospectFilterFields,
} from "@/lib/crm/prospects";
import { applyFilters, describeFilter, parseFilters } from "@/lib/lists/filters";

const FIXTURE = resolve(
  process.cwd(),
  "../Quantify Terminal/tests/fixtures/hq_payload_samples.json",
);
const STAGES = { new: "New", attempting: "Attempting" };

describe("the prospect list's filter fields", () => {
  const fields = prospectFilterFields(STAGES, [{ key: "outbound", label: "Outbound" }]);

  it("offers exactly the keys it declares, each once", () => {
    const keys = fields.map((field) => field.key);
    expect([...keys].sort()).toEqual([...PROSPECT_FIELD_KEYS].sort());
    expect(new Set(keys).size).toBe(keys.length);
  });

  it.skipIf(!existsSync(FIXTURE))("are the fields the service itself filters leads on", () => {
    const fixture = JSON.parse(readFileSync(FIXTURE, "utf8")) as {
      owner: Record<string, { fields?: { key: string }[]; ops?: string[] }>;
    };
    const sampled = fixture.owner["hq/leads"];
    expect(sampled?.fields?.map((field) => field.key).sort()).toEqual(
      [...PROSPECT_FIELD_KEYS].sort(),
    );
    // "is any of" is the service's too, not only the portal's.
    expect(sampled?.ops).toContain("in");
  });

  it("sorts only by what the service sorts by", () => {
    expect(Object.values(PROSPECT_SORTS).sort()).toEqual(
      ["company", "country", "firm_type", "fit", "name", "owner", "stage"].sort(),
    );
  });
});

describe("is any of", () => {
  const fields = [{ key: "country", label: "Country", kind: "text" as const }];
  const rows = [
    { country: "India" },
    { country: "Singapore" },
    { country: "Brazil" },
    { country: "" },
  ];
  const read = (row: (typeof rows)[number]) => row.country;

  it("keeps a row whose value is one of a comma-separated list, whatever the case", () => {
    const conditions = parseFilters(["country:in:india, SINGAPORE ,"], fields);
    expect(conditions).toEqual([{ field: "country", op: "in", value: "india, SINGAPORE ," }]);
    expect(applyFilters(rows, conditions, read).map((row) => row.country)).toEqual([
      "India",
      "Singapore",
    ]);
    expect(describeFilter(conditions[0]!, fields)).toBe("Country is any of india, SINGAPORE ,");
  });

  it("needs a value", () => {
    expect(parseFilters(["country:in:"], fields)).toEqual([]);
  });
});

describe("tags and facet words", () => {
  it("cleans tags the way the service stores them", () => {
    expect(parseTags(" PMS, mumbai ,pms,, Long   Tag ")).toEqual(["pms", "mumbai", "long tag"]);
    expect(parseTags("")).toEqual([]);
    expect(parseTags(Array.from({ length: 30 }, (_, index) => `t${index}`).join(","))).toHaveLength(
      20,
    );
  });

  it("reads a facet value as a person would", () => {
    expect(facetLabel("email_kind", "personal-domain", STAGES)).toBe("Free mail");
    expect(facetLabel("fit_band", "A", STAGES)).toBe("A · Best fit");
    expect(facetLabel("stage", "attempting", STAGES)).toBe("Attempting");
    expect(facetLabel("verified", "unchecked", STAGES)).toBe("Unchecked");
    expect(facetLabel("country", "", STAGES)).toBe("Not set");
    expect(facetLabel("firm_type", "PMS", STAGES)).toBe("PMS");
  });
});
