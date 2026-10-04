import { describe, expect, it } from "vitest";

import { canPutBack, putBackValue, stillAsChanged } from "@/lib/crm/put-back";

/**
 * What a record's History can put back: plain fields only, never a value the audit row
 * cut short, never a count that was never set; and only over the value the change made.
 */
describe("putting a change back", () => {
  it("offers only plain fields a record's own update takes", () => {
    expect(canPutBack("company", "lifecycle", "prospect")).toBe(true);
    expect(canPutBack("deal", "stage_key", "proposal")).toBe(false);
    expect(canPutBack("ticket", "priority", "high")).toBe(false);
    expect(canPutBack("company", "name", `${"a".repeat(199)}…`)).toBe(false);
    expect(canPutBack("deal", "seats", "")).toBe(false);
    expect(canPutBack("person", "do_not_contact", "False")).toBe(true);
  });

  it("reads the audit row's text as the update takes it", () => {
    expect(putBackValue("bool", "True")).toBe(true);
    expect(putBackValue("number", "3")).toBe(3);
    expect(putBackValue("date", "2026-11-30T00:00:00")).toBe("2026-11-30");
    expect(putBackValue("text", "")).toBe("");
  });

  it("puts back only over the value the change made", () => {
    expect(stillAsChanged("text", "customer", "customer")).toBe(true);
    expect(stillAsChanged("text", "churned", "customer")).toBe(false);
    expect(stillAsChanged("number", 3, "3.00")).toBe(true);
    expect(stillAsChanged("date", "2026-11-30", "2026-11-30")).toBe(true);
    expect(stillAsChanged("bool", false, "False")).toBe(true);
    expect(stillAsChanged("text", null, "")).toBe(true);
    expect(
      stillAsChanged(
        "text",
        "aa000000-0000-4000-8000-00000000000a",
        "AA000000-0000-4000-8000-00000000000A",
        "owner_staff_id",
      ),
    ).toBe(true);
  });
});
