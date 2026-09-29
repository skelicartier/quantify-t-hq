import { describe, expect, it } from "vitest";

import { fillVariables } from "@/components/support/composer";

describe("saved reply variables", () => {
  const variables = { first_name: "Rhea", name: "Rhea Kapoor", plan: "Team", me: "The Owner" };

  it("fills each variable from the ticket", () => {
    expect(
      fillVariables("Hi {{first_name}}, your {{plan}} seats are live. — {{me}}", variables),
    ).toBe("Hi Rhea, your Team seats are live. — The Owner");
  });

  it("uses the fallback after | when the value is empty, and ignores case and spaces", () => {
    expect(fillVariables("Hi {{ First_Name | there }},", { ...variables, first_name: "" })).toBe(
      "Hi there,",
    );
  });

  it("leaves an unknown variable as written so it is noticed before sending", () => {
    expect(fillVariables("Ref {{ticket_number}}", variables)).toBe("Ref {{ticket_number}}");
  });
});
