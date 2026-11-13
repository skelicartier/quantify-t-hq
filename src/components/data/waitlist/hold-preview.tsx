"use client";

import { useActionState, useState } from "react";

import { AttemptField } from "@/components/ui/attempt-field";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { FormFeedback } from "@/components/ui/form-feedback";
import { INITIAL_ACTION_STATE, type ActionState } from "@/lib/forms/action-state";
import { formatNumber } from "@/lib/format";

type Action = (previous: ActionState, formData: FormData) => Promise<ActionState>;

export type HoldCandidate = { email: string; name: string; title: string; lists: string[] };

function personLine(candidate: HoldCandidate): string {
  const who = [candidate.name, candidate.title].filter(Boolean).join(", ");
  const lists = candidate.lists.filter(Boolean);
  const where =
    lists.length === 0
      ? "On no Mail merge list"
      : `On ${lists.map((list) => `“${list}”`).join(", ")}`;
  return [candidate.email, who, where].filter(Boolean).join(" · ");
}

/**
 * The preview of a hold (spec §3.8.2): every address at the firm never written to and not
 * on the stop list, each ticked, with the Mail merge lists it sits on. Nothing is held until
 * "Hold back these {n}" is pressed; then they go on Mail merge's own stop list.
 */
export function HoldPreview({
  action,
  entryId,
  candidates,
  large,
  peopleAtDomain,
  domain,
}: {
  action: Action;
  entryId: string;
  candidates: readonly HoldCandidate[];
  large: boolean;
  peopleAtDomain: number;
  domain: string;
}) {
  const [state, formAction, isPending] = useActionState(action, INITIAL_ACTION_STATE);
  // What was unticked, not what is ticked: when the page comes back with fewer addresses
  // after a hold, the count stays right and the form (with its sentence) is not remade.
  const [unticked, setUnticked] = useState<ReadonlySet<string>>(() => new Set());
  const count = candidates.filter((candidate) => !unticked.has(candidate.email)).length;
  const toggle = (email: string, on: boolean) =>
    setUnticked((current) => {
      const next = new Set(current);
      if (on) next.delete(email);
      else next.add(email);
      return next;
    });
  // With nobody left to hold, the form's last sentence (what was just held) stays in view.
  if (candidates.length === 0)
    return (
      <div className="hqdata-hold">
        <FormFeedback state={state} />
        <p className="page-note" role="status">
          Nobody at {domain} is waiting to be written to.
        </p>
      </div>
    );
  return (
    <div className="hqdata-hold">
      {large && (
        <Callout tone="attention" compact>
          This firm has {formatNumber(peopleAtDomain)} addresses on file. A large firm may have
          separate teams who decide for themselves; hold back only the ones on the same team.
        </Callout>
      )}
      <form className="stack-form stack-form--tight" action={formAction}>
        <AttemptField state={state} />
        <input type="hidden" name="entry_id" value={entryId} />
        <fieldset className="hqdata-hold__list">
          <legend className="sr-only">The unsent addresses to hold back</legend>
          {candidates.map((candidate, index) => (
            <div key={candidate.email} className="hqdata-hold__row checkbox">
              <input
                type="checkbox"
                id={`hold-${index}`}
                name="email"
                value={candidate.email}
                checked={!unticked.has(candidate.email)}
                onChange={(event) => toggle(candidate.email, event.target.checked)}
              />
              <label className="checkbox__label" htmlFor={`hold-${index}`}>
                {personLine(candidate)}
              </label>
            </div>
          ))}
        </fieldset>
        <p className="field__hint" id={`hold-hint-${entryId}`}>
          They go on the stop list as &ldquo;Firm already joined&rdquo;, so no mailing writes to
          them. Release them here at any time.
        </p>
        <div className="form-actions">
          <Button
            type="submit"
            size="small"
            variant="primary"
            disabled={isPending || count === 0}
            aria-describedby={`hold-hint-${entryId}`}
          >
            {isPending ? "Holding back…" : `Hold back these ${formatNumber(count)}`}
          </Button>
        </div>
        <FormFeedback state={state} />
      </form>
    </div>
  );
}
