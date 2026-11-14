"use client";

import Link from "next/link";
import { useActionState, useId, useState, useSyncExternalStore } from "react";

import { AnswerToCopy } from "@/components/data/replies/answer-to-copy";
import { useTimeZone } from "@/components/shell/time-zone-context";
import { AttemptField } from "@/components/ui/attempt-field";
import { Checkbox, Field, Input, Textarea } from "@/components/ui/field";
import { FormFeedback } from "@/components/ui/form-feedback";
import { INITIAL_ACTION_STATE, type ActionState } from "@/lib/forms/action-state";
import { submitWithoutReset } from "@/lib/forms/submit-without-reset";
import { isoToLocalInput } from "@/lib/format";

type Action = (previous: ActionState, formData: FormData) => Promise<ActionState>;

// Nothing to subscribe to: true only once the browser runs this, false on the server and
// while hydrating, so the markup without scripts has every field and every button submits.
const subscribe = () => () => {};
const onClient = () => true;
const onServer = () => false;

/** A calendar date plus whole days, with no zone involved. */
function addDays(day: string, count: number): string {
  const [year = 0, month = 1, date = 1] = day.split("-").map(Number);
  const moved = new Date(Date.UTC(year, month - 1, date + count));
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${moved.getUTCFullYear()}-${pad(moved.getUTCMonth() + 1)}-${pad(moved.getUTCDate())}`;
}

function detailOf(state: ActionState): { href?: unknown; label?: unknown; answer?: unknown } {
  if (!state.detail) return {};
  try {
    const parsed = JSON.parse(state.detail) as unknown;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function linkOf(state: ActionState): { href: string; label: string } | null {
  const parsed = detailOf(state);
  return typeof parsed.href === "string" && parsed.href.startsWith("/")
    ? { href: parsed.href, label: typeof parsed.label === "string" ? parsed.label : "Open it" }
    : null;
}

/** The answer to a yes, filled in, when the service gave one. */
function answerOf(state: ActionState): string | null {
  const parsed = detailOf(state);
  return typeof parsed.answer === "string" && parsed.answer ? parsed.answer : null;
}

/**
 * Record one reply in one press. Yes, Meeting request, No, Question and Needs review submit
 * at once; Later and Wrong person open the few fields they need first. Without scripts
 * every field shows and every button records its own answer. A double press records once:
 * the form carries an attempt, and the service replays the first answer for it.
 *
 * "Hold the rest of their firm" is ticked to begin with: the rest of the firm goes onto
 * the stop list while he answers, and he can untick it. After a yes or a meeting request
 * the answer to copy is shown under the sentence; nothing is sent.
 */
export function ReplyForm({
  action,
  today,
  now,
  email,
  defaultEmail = "",
  autoFocus = false,
}: {
  action: Action;
  /** This Mac's day, as the service counts it: the reminder's default is 14 days on. */
  today: string;
  /** The page's clock (`requestNow()`): "Received" starts at it. */
  now: number;
  /** A lead's own page fixes the address: no address field, no "add them" box. */
  email?: string | undefined;
  defaultEmail?: string | undefined;
  autoFocus?: boolean | undefined;
}) {
  const [state, formAction, isPending] = useActionState(action, INITIAL_ACTION_STATE);
  const scripted = useSyncExternalStore(subscribe, onClient, onServer);
  const zone = useTimeZone();
  const [open, setOpen] = useState<"later" | "named" | null>(null);
  const [pressed, setPressed] = useState("");
  const id = useId();
  const field = (name: string) => `${id}-${name}`;
  const link = state.status === "sent" ? linkOf(state) : null;
  const answer = state.status === "sent" ? answerOf(state) : null;
  const submit = submitWithoutReset(formAction);
  const label = (value: string, text: string) =>
    isPending && pressed === value ? "Recording…" : text;
  const toggle = (which: "later" | "named") =>
    setOpen((current) => (current === which ? null : which));

  return (
    <div className="hqdata-reply-form">
      <form
        key={state.status === "sent" ? (state.sentAt ?? "sent") : "reply"}
        className="stack-form"
        action={formAction}
        onSubmit={(event) => {
          const submitter = (event.nativeEvent as SubmitEvent)
            .submitter as HTMLButtonElement | null;
          setPressed(submitter?.value ?? "");
          submit(event);
        }}
      >
        <AttemptField state={state} />
        {email ? (
          <input type="hidden" name="email" value={email} />
        ) : (
          <Field id={field("email")} label="Their address" hint="The address they wrote from.">
            <Input
              id={field("email")}
              name="email"
              type="email"
              required
              maxLength={254}
              autoComplete="off"
              defaultValue={defaultEmail}
              autoFocus={autoFocus}
              aria-describedby={`${field("email")}-hint`}
            />
          </Field>
        )}
        <Field
          id={field("words")}
          label="What they said"
          hint="Paste their words. They are kept as the proof of a yes."
        >
          <Textarea
            id={field("words")}
            name="words"
            rows={4}
            maxLength={4_000}
            aria-describedby={`${field("words")}-hint`}
          />
        </Field>
        <div className="form-grid">
          <Field id={field("received")} label="Received" hint="When their reply arrived.">
            <Input
              id={field("received")}
              name="received_at"
              type="datetime-local"
              defaultValue={isoToLocalInput(new Date(now).toISOString(), zone)}
              aria-describedby={`${field("received")}-hint`}
            />
          </Field>
          <Field id={field("subject")} label="Subject" note="Optional">
            <Input id={field("subject")} name="subject" maxLength={200} />
          </Field>
        </div>
        {!email && (
          <Checkbox
            id={field("add")}
            name="add_if_missing"
            label="If they are not a lead yet, add them"
            defaultChecked
          />
        )}
        <fieldset className="fieldset">
          <legend className="fieldset__legend">Their answer</legend>
          <div className="hqdata-outcomes">
            <button
              type="submit"
              name="outcome"
              value="replied_positive"
              className="btn btn--small btn--primary"
              aria-label="Record a yes: add the firm to the waitlist"
              disabled={isPending}
            >
              {label("replied_positive", "Yes")}
            </button>
            <button
              type="submit"
              name="outcome"
              value="meeting_request"
              className="btn btn--small"
              aria-label="Record a meeting request: they asked to meet"
              disabled={isPending}
            >
              {label("meeting_request", "Meeting request")}
            </button>
            <button
              type="submit"
              name="outcome"
              value="not_interested"
              className="btn btn--small"
              aria-label="Record a no: put them on the stop list"
              disabled={isPending}
            >
              {label("not_interested", "No")}
            </button>
            {scripted ? (
              <button
                type="button"
                className="btn btn--small"
                aria-expanded={open === "later"}
                aria-controls={field("later")}
                onClick={() => toggle("later")}
                disabled={isPending}
              >
                Later
              </button>
            ) : (
              <button type="submit" name="outcome" value="not_now" className="btn btn--small">
                Later
              </button>
            )}
            {scripted ? (
              <button
                type="button"
                className="btn btn--small"
                aria-expanded={open === "named"}
                aria-controls={field("named")}
                onClick={() => toggle("named")}
                disabled={isPending}
              >
                Wrong person
              </button>
            ) : (
              <button type="submit" name="outcome" value="wrong_person" className="btn btn--small">
                Wrong person
              </button>
            )}
            <button
              type="submit"
              name="outcome"
              value="question"
              className="btn btn--small"
              disabled={isPending}
            >
              {label("question", "Question")}
            </button>
            <button
              type="submit"
              name="outcome"
              value="needs_review"
              className="btn btn--small"
              aria-label="Record that it needs review: decide what it means later"
              disabled={isPending}
            >
              {label("needs_review", "Needs review")}
            </button>
          </div>
          <Checkbox
            id={field("hold")}
            name="hold_firm"
            className="hqdata-reply-form__hold"
            label="Hold the rest of their firm"
            description="Nobody else at their firm is written to while you answer. Not for free-mail addresses or out-of-office replies; release it from Replies."
            defaultChecked
          />
        </fieldset>
        <fieldset
          id={field("later")}
          className="fieldset hqdata-reply-form__later"
          hidden={scripted && open !== "later"}
        >
          <legend className="fieldset__legend">Later</legend>
          <Field
            id={field("later-until")}
            label="Write to them again on"
            hint="You are reminded on this day; nothing is sent."
          >
            <Input
              id={field("later-until")}
              name="later_until"
              type="date"
              min={today}
              defaultValue={addDays(today, 14)}
              aria-describedby={`${field("later-until")}-hint`}
            />
          </Field>
          <Checkbox
            id={field("auto")}
            name="auto_reply"
            label="It was an automatic out-of-office reply"
          />
          <div className="form-actions">
            <button
              type="submit"
              name="outcome"
              value="not_now"
              className="btn btn--small btn--primary"
              disabled={isPending}
            >
              {label("not_now", "Record: later")}
            </button>
          </div>
        </fieldset>
        <fieldset
          id={field("named")}
          className="fieldset hqdata-reply-form__named"
          hidden={scripted && open !== "named"}
        >
          <legend className="fieldset__legend">Who they named</legend>
          <div className="form-grid">
            <Field id={field("ref-name")} label="Name">
              <Input id={field("ref-name")} name="referral_name" maxLength={120} />
            </Field>
            <Field id={field("ref-email")} label="Their address">
              <Input
                id={field("ref-email")}
                name="referral_email"
                type="email"
                maxLength={254}
                autoComplete="off"
              />
            </Field>
            <Field id={field("ref-title")} label="Their title">
              <Input id={field("ref-title")} name="referral_title" maxLength={120} />
            </Field>
          </div>
          <div className="form-actions">
            <button
              type="submit"
              name="outcome"
              value="wrong_person"
              className="btn btn--small btn--primary"
              disabled={isPending}
            >
              {label("wrong_person", "Record: wrong person")}
            </button>
          </div>
        </fieldset>
        <FormFeedback state={state} />
        {answer && <AnswerToCopy answer={answer} />}
        {link && (
          <p className="hqdata-reply-form__link">
            <Link className="text-link" href={link.href}>
              {link.label}
            </Link>
          </p>
        )}
      </form>
    </div>
  );
}
