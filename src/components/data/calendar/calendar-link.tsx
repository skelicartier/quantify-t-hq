"use client";

import { useActionState, useId, useRef, useState } from "react";

import { MailForm } from "@/components/mail/mail-form";
import { Button } from "@/components/ui/button";
import { FormFeedback } from "@/components/ui/form-feedback";
import { Popover } from "@/components/ui/popover";
import { Timestamp } from "@/components/ui/timestamp";
import { INITIAL_ACTION_STATE, type ActionState } from "@/lib/forms/action-state";

type Action = (previous: ActionState, formData: FormData) => Promise<ActionState>;

export type CalendarLinkFeed = {
  on: boolean;
  made_at: string | null;
  made_by_name: string;
  last_read_at: string | null;
};

/** The same address for Calendar to open: `webcal://` in place of `http://` or `https://`. */
export function webcalOf(link: string): string {
  return link.replace(/^https?:\/\//i, "webcal://");
}

function madeAtOf(state: ActionState): string | null {
  if (!state.detail) return null;
  try {
    const parsed = JSON.parse(state.detail) as { made_at?: unknown };
    return typeof parsed.made_at === "string" ? parsed.made_at : null;
  } catch {
    return null;
  }
}

/** The link just made: shown to the person who made it, once, until the page reloads. */
function JustMade({ link, message }: { link: string; message: string | null }) {
  const id = useId();
  const box = useRef<HTMLInputElement>(null);
  const [said, setSaid] = useState("");
  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setSaid("Copied.");
    } catch {
      box.current?.select();
      setSaid("Select the link and copy it.");
    }
  }
  return (
    <div className="hqdata-calendar-made" role="status">
      {message && <p className="form-sent">{message}</p>}
      <label className="sr-only" htmlFor={id}>
        Your calendar link
      </label>
      <input
        ref={box}
        id={id}
        className="input mono hqdata-calendar-made__link"
        readOnly
        value={link}
        onFocus={(event) => event.currentTarget.select()}
      />
      <div className="hqdata-calendar-made__acts">
        <Button type="button" size="small" onClick={copy}>
          Copy
        </Button>
        <a className="btn btn--small" href={webcalOf(link)}>
          Open in Calendar
        </a>
        <span className="quiet" aria-live="polite">
          {said}
        </span>
      </div>
    </div>
  );
}

/**
 * "The link": none yet and the button to make it; or when it was made, when the calendar
 * last read it, a new one, and off. The link itself is shown only in the answer to making
 * it, here, and never again: the service keeps only its SHA-256.
 */
export function CalendarLink({
  feed,
  now,
  make,
  off,
}: {
  feed: CalendarLinkFeed;
  now: number;
  make: Action;
  off: Action;
}) {
  const [state, formAction, isPending] = useActionState(make, INITIAL_ACTION_STATE);
  const fresh =
    state.status === "sent" && state.secret && feed.on && madeAtOf(state) === feed.made_at
      ? state.secret
      : null;
  return (
    <div className="hqdata-calendar-link">
      {feed.on ? (
        <>
          <p className="hqdata-calendar-link__line">
            Made <Timestamp value={feed.made_at} now={now} mode="relative" /> by{" "}
            {feed.made_by_name || "someone"} · last read by your calendar{" "}
            {feed.last_read_at ? (
              <Timestamp value={feed.last_read_at} now={now} mode="relative" />
            ) : (
              "not yet"
            )}
          </p>
          <div className="hqdata-calendar-link__acts">
            <Popover label="Make a new link" align="start">
              <form className="stack-form stack-form--tight" action={formAction}>
                <p className="page-note">The old link stops working at once.</p>
                <div className="form-actions">
                  <Button type="submit" size="small" variant="primary" disabled={isPending}>
                    {isPending ? "Making…" : "Make a new link"}
                  </Button>
                </div>
              </form>
            </Popover>
            <MailForm
              action={off}
              submitLabel="Turn the feed off"
              pendingLabel="Turning it off…"
              className="hqdata-calendar-link__off"
            />
          </div>
        </>
      ) : (
        <>
          <p className="hqdata-calendar-link__line">No link yet.</p>
          <form className="hqdata-calendar-link__acts" action={formAction}>
            <Button type="submit" size="small" variant="primary" disabled={isPending}>
              {isPending ? "Making…" : "Make the link"}
            </Button>
          </form>
        </>
      )}
      {state.status === "error" && <FormFeedback state={state} />}
      {fresh && <JustMade link={fresh} message={state.message} />}
    </div>
  );
}
