import { describe, expect, it } from "vitest";

import { decisionFieldsOf, isState } from "@/app/(portal)/data/decisions/fields";

/**
 * What the decision forms read from a submitted form. A decision carries a `status` of its
 * own ("decided"), so the reader's fields must never be taken for a refusal: the walk once
 * found every decision form answering with its own fields and recording nothing.
 */

function form(values: Record<string, string>): FormData {
  const data = new FormData();
  for (const [name, value] of Object.entries(values)) data.set(name, value);
  return data;
}

describe("the decision form's reader", () => {
  it("gives the fields back, not a refusal, though a decision has a status of its own", () => {
    const fields = decisionFieldsOf(
      form({
        title: "  Raise on a SAFE  ",
        why: "Fast to close.",
        decided_by: "Walk Owner",
        decided_on: "2026-11-13",
        status: "decided",
        supersedes: "",
      }),
    );
    expect(isState(fields)).toBe(false);
    expect(fields).toEqual({
      title: "Raise on a SAFE",
      why: "Fast to close.",
      decided_by: "Walk Owner",
      decided_on: "2026-11-13",
      status: "decided",
      supersedes: "",
    });
  });

  it("refuses a missing title, a day that is not one and an unknown status", () => {
    for (const [values, message] of [
      [{ title: " ", status: "decided" }, "Write the decision."],
      [{ title: "x", status: "decided", decided_on: "13/11/2026" }, "That is not a day."],
      [{ title: "x", status: "maybe" }, "Choose the status of the decision."],
    ] as const) {
      const answer = decisionFieldsOf(form(values));
      expect(isState(answer)).toBe(true);
      expect(answer).toMatchObject({ status: "error", message });
    }
  });
});
