"use client";

import { useActionState } from "react";

import { AttemptField } from "@/components/ui/attempt-field";
import { Button } from "@/components/ui/button";
import { CopyLink } from "@/components/ui/copy-link";
import { FormFeedback } from "@/components/ui/form-feedback";
import { RowAction } from "@/components/ui/row-action";
import { StatusPill, type PillTone } from "@/components/ui/status-pill";
import type { QuoteLink } from "@/lib/api/quotes";
import { INITIAL_ACTION_STATE, type ActionState } from "@/lib/forms/action-state";
import { useTimeZone } from "@/components/shell/time-zone-context";
import { formatAbsolute } from "@/lib/format";

type Action = (previous: ActionState, formData: FormData) => Promise<ActionState>;

const STATES: Record<QuoteLink["state"], { label: string; tone: PillTone }> = {
  live: { label: "Open", tone: "live" },
  expired: { label: "Ended", tone: "neutral" },
  revoked: { label: "Revoked", tone: "neutral" },
  accepted: { label: "Accepted", tone: "live" },
  declined: { label: "Declined", tone: "attention" },
};

/**
 * The customer's links for a sent quote: make one (its address is shown once, to copy and
 * send), see how often each was opened and whether it was answered, revoke one that went
 * to the wrong place.
 */
export function QuoteLinks({
  createAction,
  revokeAction,
  dealId,
  quoteId,
  links,
  canLink,
}: {
  createAction: Action;
  revokeAction: Action;
  dealId: string;
  quoteId: string;
  links: readonly QuoteLink[];
  canLink: boolean;
}) {
  const [state, formAction, isPending] = useActionState(createAction, INITIAL_ACTION_STATE);
  const zone = useTimeZone();
  return (
    <div className="quote-links">
      {canLink && (
        <form className="quote-links__make" action={formAction}>
          <AttemptField state={state} />
          <input type="hidden" name="deal_id" value={dealId} />
          <input type="hidden" name="quote_id" value={quoteId} />
          <div className="field">
            <div className="field__label">
              <label htmlFor={`quote-link-days-${quoteId}`}>Open for</label>
            </div>
            <select
              id={`quote-link-days-${quoteId}`}
              className="input"
              name="days"
              defaultValue="30"
            >
              <option value="7">A week</option>
              <option value="14">Two weeks</option>
              <option value="30">Thirty days</option>
              <option value="60">Sixty days</option>
            </select>
          </div>
          <Button type="submit" variant="primary" disabled={isPending}>
            {isPending ? "Making it…" : "Make a link for the customer"}
          </Button>
        </form>
      )}
      {state.status === "sent" && state.secret ? (
        <div className="one-time-secret" role="status">
          <p className="one-time-secret__label">{state.message}</p>
          <code className="one-time-secret__value">{state.secret}</code>
          <CopyLink path={state.secret} label="Copy the link" />
        </div>
      ) : (
        <FormFeedback state={state} />
      )}
      {links.length > 0 && (
        <ul className="quote-links__list">
          {links.map((link) => (
            <li key={link.link_id} className="quote-links__row">
              <div className="quote-links__main">
                <StatusPill
                  value={link.state}
                  label={STATES[link.state].label}
                  tone={STATES[link.state].tone}
                />
                <span>
                  Made by {link.created_by_name || "a colleague"}{" "}
                  {formatAbsolute(link.created_at, "", zone)} ·{" "}
                  {link.state === "live" ? "open until" : "ran to"}{" "}
                  {formatAbsolute(link.expires_at, "—", zone)}
                </span>
                <span className="quiet">
                  {link.views === 0
                    ? "Not opened yet"
                    : `Opened ${link.views === 1 ? "once" : `${link.views} times`}, last ${formatAbsolute(link.last_viewed_at, "—", zone)}`}
                  {link.answer &&
                    ` · ${link.answer === "accepted" ? "accepted" : "declined"} by ${link.answer_name || "the customer"} ${formatAbsolute(link.answered_at, "", zone)}`}
                </span>
              </div>
              {link.state === "live" && canLink && (
                <RowAction
                  action={revokeAction}
                  fields={{ deal_id: dealId, quote_id: quoteId, link_id: link.link_id }}
                  buttons={[
                    {
                      label: "Revoke",
                      className: "btn btn--small btn--ghost",
                      pendingLabel: "Revoking…",
                    },
                  ]}
                />
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
