"use client";

import { useActionState, useState } from "react";

import { Button } from "@/components/ui/button";
import { FormFeedback } from "@/components/ui/form-feedback";
import { INITIAL_ACTION_STATE, type ActionState } from "@/lib/forms/action-state";
import { ACTIVITY_KIND_LABELS, LOGGABLE_KINDS } from "@/lib/crm/vocabulary";

type Links = Partial<
  Record<"company_id" | "person_id" | "deal_id" | "lead_id" | "meeting_id", string>
>;

type LogActivityFormProps = {
  action: (previous: ActionState, formData: FormData) => Promise<ActionState>;
  links: Links;
  /** The page to refresh after logging. */
  returnPath: string;
  /** Leads say what logging does to their clock and stage. */
  context?: "lead" | "record";
};

const PLACEHOLDERS: Record<string, string> = {
  note: "What should the next person to open this know?",
  call: "Who you spoke to, what they said, what was agreed.",
  email_out: "What you sent and why.",
  email_in: "What they wrote back.",
};

export function LogActivityForm({
  action,
  links,
  returnPath,
  context = "record",
}: LogActivityFormProps) {
  const [state, formAction, isPending] = useActionState(action, INITIAL_ACTION_STATE);
  const [kind, setKind] = useState<string>("note");
  const bodyId = `log-body-${Object.values(links).join("-") || "record"}`;
  return (
    <form className="log-form" action={formAction} key={state.sentAt ?? "log"}>
      {Object.entries(links).map(([name, value]) =>
        value ? <input key={name} type="hidden" name={name} value={value} /> : null,
      )}
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="return_path" value={returnPath} />
      <div className="log-form__kinds" role="group" aria-label="What happened">
        {LOGGABLE_KINDS.map((option) => (
          <button
            key={option}
            type="button"
            className="log-form__kind"
            aria-pressed={kind === option}
            onClick={() => setKind(option)}
            disabled={isPending}
          >
            {ACTIVITY_KIND_LABELS[option]}
          </button>
        ))}
      </div>
      <label className="sr-only" htmlFor={bodyId}>
        {ACTIVITY_KIND_LABELS[kind]} details
      </label>
      <textarea
        id={bodyId}
        className="log-form__body"
        name="body"
        rows={3}
        maxLength={8000}
        required
        placeholder={PLACEHOLDERS[kind]}
        disabled={isPending}
      />
      <div className="log-form__foot">
        <span className="log-form__hint">
          {context === "lead"
            ? "A call or a sent email stops the first-reply clock. A reply moves the lead to Connected."
            : "Logged work resets a deal's quiet-days count."}
        </span>
        <Button variant="primary" size="small" type="submit" disabled={isPending}>
          {isPending ? "Logging…" : `Log ${ACTIVITY_KIND_LABELS[kind]?.toLowerCase()}`}
        </Button>
      </div>
      <FormFeedback state={state} />
    </form>
  );
}
