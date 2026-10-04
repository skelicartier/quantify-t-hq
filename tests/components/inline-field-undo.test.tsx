import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { InlineField } from "@/components/ui/inline-field";
import type { ActionState } from "@/lib/forms/action-state";

/**
 * An edit can be undone where it was made, for a few seconds: the value it had goes back
 * through the same action (so the history keeps both), and the offer then goes away.
 */
describe("undoing an inline edit", () => {
  it("puts the value back through the same action, once", async () => {
    const calls: Record<string, string>[] = [];
    const action = async (_previous: ActionState, formData: FormData): Promise<ActionState> => {
      calls.push(
        Object.fromEntries([...formData.entries()].map(([key, value]) => [key, String(value)])),
      );
      return { status: "sent", message: null, sentAt: calls.length };
    };
    render(
      <dl>
        <InlineField
          action={action}
          idName="company_id"
          id="c1"
          name="country"
          label="Country"
          value="India"
        />
      </dl>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Edit Country" }));
    const input = screen.getByLabelText("Country") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "Singapore" } });
    await act(async () => {
      fireEvent.submit(input.closest("form")!);
    });
    const undo = await screen.findByRole("button", { name: "Undo the change to Country" });
    expect(calls.at(-1)?.["country"]).toBe("Singapore");
    await act(async () => {
      fireEvent.click(undo);
    });
    await waitFor(() => expect(calls).toHaveLength(2));
    expect(calls[1]).toMatchObject({ company_id: "c1", country: "India" });
    // An undo is not itself undoable: the offer is gone.
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "Undo the change to Country" })).toBeNull(),
    );
  });

  it("offers nothing when the value did not change", async () => {
    const action = async (): Promise<ActionState> => ({ status: "sent", message: null, sentAt: 1 });
    render(
      <dl>
        <InlineField
          action={action}
          idName="company_id"
          id="c1"
          name="country"
          label="Country"
          value="India"
        />
      </dl>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Edit Country" }));
    const input = screen.getByLabelText("Country") as HTMLInputElement;
    await act(async () => {
      fireEvent.submit(input.closest("form")!);
    });
    await screen.findByText("Saved");
    expect(screen.queryByRole("button", { name: "Undo the change to Country" })).toBeNull();
  });
});
