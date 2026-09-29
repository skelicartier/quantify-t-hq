"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { FormFeedback } from "@/components/ui/form-feedback";
import { INITIAL_ACTION_STATE, type ActionState } from "@/lib/forms/action-state";

type Action = (previous: ActionState, formData: FormData) => Promise<ActionState>;

/** The recipient's two choices: stop everything, or keep only some topics. */
export function UnsubscribeChoices({
  action,
  token,
  kind,
  topics,
  showChoices,
}: {
  action: Action;
  token: string;
  kind: "marketing" | "sales";
  topics: readonly { key: string; label: string; off: boolean }[];
  showChoices: boolean;
}) {
  const [stopState, stop, stopping] = useActionState(action, INITIAL_ACTION_STATE);
  const [topicState, saveTopics, saving] = useActionState(action, INITIAL_ACTION_STATE);
  return (
    <div className="unsub">
      <form action={stop} className="unsub__stop">
        <input type="hidden" name="token" value={token} />
        <input type="hidden" name="mode" value={kind === "sales" ? "sales" : "all"} />
        <Button
          type="submit"
          variant="primary"
          block
          disabled={stopping || stopState.status === "sent"}
        >
          {stopping
            ? "Stopping…"
            : kind === "sales"
              ? "Stop these emails"
              : "Unsubscribe from everything"}
        </Button>
        <FormFeedback state={stopState} />
      </form>
      {kind === "marketing" && (
        <details className="unsub__choices" open={showChoices}>
          <summary>Or choose what you hear about</summary>
          <form action={saveTopics} className="stack-form stack-form--tight">
            <input type="hidden" name="token" value={token} />
            <input type="hidden" name="mode" value="topics" />
            <fieldset className="unsub__topics">
              <legend className="sr-only">Topics</legend>
              {topics.map((topic) => (
                <label key={topic.key} className="unsub__topic">
                  <input
                    type="checkbox"
                    name="topics_off"
                    value={topic.key}
                    defaultChecked={topic.off}
                  />
                  <span>Stop {topic.label.toLowerCase()}</span>
                </label>
              ))}
            </fieldset>
            <Button type="submit" disabled={saving}>
              {saving ? "Saving…" : "Save my choices"}
            </Button>
            <FormFeedback state={topicState} />
          </form>
        </details>
      )}
    </div>
  );
}
