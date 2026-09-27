import { Callout } from "@/components/ui/callout";
import type { ActionState } from "@/lib/forms/action-state";

/** The one line under a form that says what happened. Errors are announced. */
export function FormFeedback({ state, sentLabel }: { state: ActionState; sentLabel?: string }) {
  if (state.status === "error" && state.message) {
    return (
      <Callout tone="danger" role="alert" compact>
        {state.message}
      </Callout>
    );
  }
  if (state.status === "sent" && (state.message || sentLabel)) {
    return (
      <p className="form-sent" role="status">
        {state.message ?? sentLabel}
      </p>
    );
  }
  return null;
}
