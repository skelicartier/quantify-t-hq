import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { csvCell, toCsv } from "@/lib/crm/csv-download";
import {
  COLD_CHECKS,
  OVERWRITABLE_COLUMNS,
  PROSPECT_FIELD_KEYS,
  PROSPECT_SORTS,
  facetLabel,
  parseTags,
  prospectFilterFields,
  verifierWord,
  verifierWordState,
} from "@/lib/crm/prospects";
import { exportView, safeReturnQuery } from "@/lib/exports";
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

  it("has a negative, and so does contains", () => {
    const none = parseFilters(["country:nin:india,brazil"], fields);
    expect(applyFilters(rows, none, read).map((row) => row.country)).toEqual(["Singapore", ""]);
    expect(describeFilter(none[0]!, fields)).toBe("Country is none of india,brazil");
    const without = parseFilters(["country:nhas:a"], fields);
    expect(applyFilters(rows, without, read).map((row) => row.country)).toEqual([""]);
    expect(describeFilter(without[0]!, fields)).toBe("Country does not contain a");
    expect(parseFilters(["country:nhas:"], fields)).toEqual([]);
  });
});

describe("a verifier's words", () => {
  const words = {
    valid: ["valid", "deliverable"],
    risky: ["catch-all", "catch_all"],
    invalid: ["invalid"],
  };

  it("keeps a word the way the service does, then reads it under the service's table", () => {
    expect(verifierWord("  Catch All ")).toBe("catch_all");
    expect(verifierWord("Deliverable")).toBe("deliverable");
    expect(verifierWord("x".repeat(60))).toHaveLength(40);
    expect(verifierWordState("catch_all", words)).toBe("risky");
    expect(verifierWordState("deliverable", words)).toBe("valid");
    expect(verifierWordState("maybe", words)).toBe("");
  });
});

describe("a file made in the browser", () => {
  it("quotes what needs quoting and defuses what a spreadsheet would run", () => {
    expect(csvCell("plain")).toBe("plain");
    expect(csvCell('say "hi", twice')).toBe('"say ""hi"", twice"');
    expect(csvCell("=SUM(A1)")).toBe("'=SUM(A1)");
    expect(csvCell("+91 98")).toBe("'+91 98");
    expect(csvCell("@handle")).toBe("'@handle");
    expect(csvCell(12)).toBe("12");
    expect(toCsv(["row", "why"], [[1, "No address"]])).toBe("row,why\r\n1,No address\r\n");
  });
});

describe("what travels with an export", () => {
  it("carries only a list's own query back, each value bounded", () => {
    const kept = safeReturnQuery("f=country%3Ais%3AIndia&f=fit_band%3Ais%3AA&stage=new&evil=1&q=x");
    expect(kept.getAll("f")).toEqual(["country:is:India", "fit_band:is:A"]);
    expect(kept.get("stage")).toBe("new");
    expect(kept.get("evil")).toBeNull();
    expect(safeReturnQuery(`q=${"a".repeat(300)}`).get("q")).toBeNull();
    expect([...safeReturnQuery("x".repeat(5_000))]).toEqual([]);
  });

  it("reads a view as the service expects it and nothing else", () => {
    expect(
      exportView(
        JSON.stringify({
          conditions: ["country:is:India", 7],
          stage_filter: "new",
          q: "pms",
          extra: true,
        }),
      ),
    ).toEqual({
      conditions: ["country:is:India"],
      stage_filter: "new",
      q: "pms",
    });
    expect(exportView("")).toEqual({ conditions: [], stage_filter: "", q: "" });
    expect(exportView("[1]")).toBeNull();
    expect(exportView("{not json")).toBeNull();
  });
});

describe("the import's replaceable columns and the sending checks", () => {
  it("name only what the service lets a file replace", () => {
    expect(OVERWRITABLE_COLUMNS.map((column) => column.column)).toEqual([
      "title",
      "company_name",
      "firm_type",
      "website",
      "country",
      "city",
      "phone",
      "registration_no",
      "source_url",
      "notes",
    ]);
  });

  it("are the four switches the service reads", () => {
    expect(COLD_CHECKS.map((check) => check.key)).toEqual([
      "require_verified",
      "allow_risky",
      "skip_role_like",
      "one_per_firm",
    ]);
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
