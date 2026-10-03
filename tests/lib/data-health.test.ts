import { describe, expect, it } from "vitest";

import { sampleHref, viewHref } from "@/lib/crm/data-health";

describe("where a data health count's records are shown", () => {
  it("opens prospects with every filter the service named", () => {
    expect(
      viewHref({
        list: "prospects",
        conditions: ["verified:is:invalid", "stage:in:new,attempting,connected"],
      }),
    ).toBe(
      "/leads/prospects?f=verified%3Ais%3Ainvalid&f=stage%3Ain%3Anew%2Cattempting%2Cconnected",
    );
    expect(viewHref({ list: "companies", conditions: ["domain:empty:"] })).toBe(
      "/companies?f=domain%3Aempty%3A",
    );
  });

  it("opens the duplicate reviews and the fields", () => {
    expect(viewHref({ list: "lead_duplicates", reason: "crm" })).toBe(
      "/leads/duplicates?reason=crm",
    );
    expect(viewHref({ list: "crm_duplicates" })).toBe("/companies/duplicates");
    expect(viewHref({ list: "fields" })).toBe("/admin/fields");
    // A list the portal does not know stays on the page rather than guessing.
    expect(viewHref({ list: "nonsense" })).toBe("/data-health");
  });

  it("links a record, never a value", () => {
    expect(sampleHref("person", "p1")).toBe("/people/p1");
    expect(sampleHref("value", "Atlantis")).toBeNull();
  });
});
