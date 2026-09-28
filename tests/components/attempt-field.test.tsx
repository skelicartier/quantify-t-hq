import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { AttemptField } from "@/components/ui/attempt-field";
import type { ActionState } from "@/lib/forms/action-state";

/**
 * The attempt id is what makes a repeated submit a replay rather than a second write:
 * it must be present on submit, identical across a double click, kept while the last
 * outcome is unknown, and fresh after any other outcome.
 */

const IDLE: ActionState = { status: "idle", message: null };

function mount(state: ActionState) {
  const view = render(
    <form data-testid="form">
      <AttemptField state={state} />
    </form>,
  );
  const form = view.getByTestId("form") as HTMLFormElement;
  const input = form.querySelector('input[name="attempt"]') as HTMLInputElement;
  const submit = () => {
    fireEvent.submit(form);
    return input.value;
  };
  return { view, form, input, submit };
}

describe("AttemptField", () => {
  it("is empty until the form submits, then carries a UUID", () => {
    const { input, submit } = mount(IDLE);
    expect(input.value).toBe("");
    expect(submit()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });

  it("reuses the id across a double submit with no outcome in between", () => {
    const { submit } = mount(IDLE);
    const first = submit();
    expect(submit()).toBe(first);
  });

  it("keeps the id while the outcome is unknown and retires it after any other outcome", () => {
    const { view, form, input } = mount(IDLE);
    fireEvent.submit(form);
    const first = input.value;

    view.rerender(
      <form data-testid="form">
        <AttemptField state={{ status: "error", message: "unknown", keepAttempt: true }} />
      </form>,
    );
    fireEvent.submit(form);
    expect(input.value).toBe(first);

    view.rerender(
      <form data-testid="form">
        <AttemptField state={{ status: "error", message: "refused" }} />
      </form>,
    );
    fireEvent.submit(form);
    const afterRefusal = input.value;
    expect(afterRefusal).not.toBe(first);

    view.rerender(
      <form data-testid="form">
        <AttemptField state={{ status: "sent", message: null, sentAt: 1 }} />
      </form>,
    );
    fireEvent.submit(form);
    expect(input.value).not.toBe(afterRefusal);
  });
});
