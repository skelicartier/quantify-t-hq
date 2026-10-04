"use client";

import { useActionState } from "react";

import { AttemptField } from "@/components/ui/attempt-field";
import { Button } from "@/components/ui/button";
import { FormFeedback } from "@/components/ui/form-feedback";
import { INITIAL_ACTION_STATE, type ActionState } from "@/lib/forms/action-state";

type Action = (previous: ActionState, formData: FormData) => Promise<ActionState>;

/**
 * The customer's answer: accept with their name, address and a tick against the terms, or
 * decline with a word of why. Either is recorded once; the page then shows the answer.
 */
export function QuoteAnswer({
  token,
  customer,
  acceptAction,
  declineAction,
}: {
  token: string;
  customer: string;
  acceptAction: Action;
  declineAction: Action;
}) {
  const [accepted, accept, accepting] = useActionState(acceptAction, INITIAL_ACTION_STATE);
  const [declined, decline, declining] = useActionState(declineAction, INITIAL_ACTION_STATE);
  return (
    <div className="quote-answer">
      <form className="stack-form" action={accept}>
        <AttemptField state={accepted} />
        <input type="hidden" name="token" value={token} />
        <h2 className="quote-answer__title">Accept this quote</h2>
        <div className="form-row">
          <div className="field">
            <div className="field__label">
              <label htmlFor="answer-name">Your full name</label>
            </div>
            <input
              id="answer-name"
              className="input"
              name="name"
              required
              minLength={2}
              maxLength={160}
              autoComplete="name"
            />
          </div>
          <div className="field">
            <div className="field__label">
              <label htmlFor="answer-email">Your work email</label>
            </div>
            <input
              id="answer-email"
              className="input"
              name="email"
              type="email"
              required
              maxLength={254}
              autoComplete="email"
            />
          </div>
        </div>
        <label className="quote-answer__agree">
          <input type="checkbox" name="agree" value="yes" required />
          <span>
            I accept this quote and its terms{customer ? ` on behalf of ${customer}` : ""}, and I
            may do so.
          </span>
        </label>
        <Button type="submit" variant="primary" disabled={accepting}>
          {accepting ? "Accepting…" : "Accept the quote"}
        </Button>
        <FormFeedback state={accepted} />
      </form>
      <details className="quote-answer__decline">
        <summary>Decline instead</summary>
        <form className="stack-form stack-form--tight" action={decline}>
          <AttemptField state={declined} />
          <input type="hidden" name="token" value={token} />
          <div className="field">
            <div className="field__label">
              <label htmlFor="decline-name">Your name</label>
            </div>
            <input id="decline-name" className="input" name="name" maxLength={160} />
          </div>
          <div className="field">
            <div className="field__label">
              <label htmlFor="decline-reason">What would have made it a yes</label>
            </div>
            <textarea
              id="decline-reason"
              className="input"
              name="reason"
              rows={2}
              maxLength={300}
            />
          </div>
          <Button type="submit" disabled={declining}>
            {declining ? "Sending…" : "Decline the quote"}
          </Button>
          <FormFeedback state={declined} />
        </form>
      </details>
    </div>
  );
}
