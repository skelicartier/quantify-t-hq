"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useActionState, useEffect, useState, useTransition } from "react";

import { AttemptField } from "@/components/ui/attempt-field";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Field, Input } from "@/components/ui/field";
import { FormFeedback } from "@/components/ui/form-feedback";
import { INITIAL_ACTION_STATE, type ActionState } from "@/lib/forms/action-state";
import { useTimeZone } from "@/components/shell/time-zone-context";
import { formatAbsolute, formatDate } from "@/lib/format";

type Action = (previous: ActionState, formData: FormData) => Promise<ActionState>;

/** The composer listens for this and puts the text in the reply box, in reply mode. */
export const COMPOSER_INSERT_EVENT = "hq-composer-insert";

type Answer = { state: string; message: string; run_id: string | null } & Record<string, unknown>;

function answerOf(state: ActionState): Answer | null {
  if (state.status !== "sent" || !state.detail) return null;
  try {
    return JSON.parse(state.detail) as Answer;
  } catch {
    return null;
  }
}

/** Every state but "ok", said plainly: never a blank panel, never a made-up answer. */
function Notice({ answer }: { answer: Answer }) {
  const tone = answer.state === "rejected" || answer.state === "error" ? "attention" : "neutral";
  return (
    <Callout tone={tone} compact>
      {answer.message}
    </Callout>
  );
}

function useFeedback(action: Action) {
  const [, start] = useTransition();
  return (runId: string | null, verdict: "used" | "edited" | "dismissed") => {
    if (!runId) return;
    const form = new FormData();
    form.set("run_id", runId);
    form.set("verdict", verdict);
    start(async () => {
      await action(INITIAL_ACTION_STATE, form);
    });
  };
}

function AskButton({
  action,
  hidden,
  label,
  pending,
  children,
}: {
  action: (formData: FormData) => void;
  hidden: Record<string, string>;
  label: string;
  pending: boolean;
  children?: React.ReactNode;
}) {
  return (
    <form className="ai-ask" action={action}>
      {Object.entries(hidden).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      {children}
      <Button type="submit" size="small" disabled={pending}>
        {pending ? "Asking…" : label}
      </Button>
    </form>
  );
}

const SOURCE_KIND: Record<string, string> = {
  saved_reply: "Saved reply",
  resolved_ticket: "Earlier answer",
};

/** A reply drafted from saved replies and earlier answers, with what it drew on. Never sent by itself. */
export function AiReplyDraft({
  ticketId,
  action,
  feedback,
}: {
  ticketId: string;
  action: Action;
  feedback: Action;
}) {
  const [state, formAction, isPending] = useActionState(action, INITIAL_ACTION_STATE);
  const [closed, setClosed] = useState(0);
  const answer = answerOf(state);
  const send = useFeedback(feedback);
  const open = answer && closed !== state.sentAt;
  const draft = String(answer?.draft ?? "");
  const sources = (answer?.sources ?? []) as Array<{ kind: string; id: string; title: string }>;
  return (
    <div className="ai-panel">
      <AskButton
        action={formAction}
        hidden={{ ticket_id: ticketId }}
        label="Draft a reply"
        pending={isPending}
      />
      <FormFeedback state={state} />
      {open && answer.state !== "ok" && <Notice answer={answer} />}
      {open && answer.state === "ok" && (
        <div className="ai-panel__body">
          <p className="ai-panel__label">A draft to read before anything is sent</p>
          <p className="ai-panel__text">{draft}</p>
          <ul className="ai-sources" aria-label="What it drew on">
            {sources.map((source) => (
              <li key={`${source.kind}-${source.id}`}>
                {SOURCE_KIND[source.kind] ?? source.kind}:{" "}
                {source.kind === "resolved_ticket" ? (
                  <Link href={`/support/${source.id}`}>{source.title}</Link>
                ) : (
                  source.title
                )}
              </li>
            ))}
          </ul>
          <div className="ai-panel__actions">
            <Button
              size="small"
              variant="primary"
              onClick={() => {
                window.dispatchEvent(new CustomEvent(COMPOSER_INSERT_EVENT, { detail: draft }));
                send(answer.run_id, "used");
                setClosed(state.sentAt ?? 0);
              }}
            >
              Put it in the reply box
            </Button>
            <Button
              size="small"
              variant="ghost"
              onClick={() => {
                send(answer.run_id, "dismissed");
                setClosed(state.sentAt ?? 0);
              }}
            >
              Dismiss
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Tags, a priority and a possible repeat from the same firm; applied only by pressing Apply. */
export function AiTriage({
  ticketId,
  action,
  apply,
  feedback,
}: {
  ticketId: string;
  action: Action;
  apply: Action;
  feedback: Action;
}) {
  const [state, formAction, isPending] = useActionState(action, INITIAL_ACTION_STATE);
  const [applied, applyAction, applying] = useActionState(apply, INITIAL_ACTION_STATE);
  const [closed, setClosed] = useState(0);
  const answer = answerOf(state);
  const send = useFeedback(feedback);
  const suggestion = answer?.suggestion as
    | {
        tags: string[];
        priority: string;
        duplicate: { ticket_id: string; subject: string } | null;
        why: string;
      }
    | undefined;
  const open = answer && closed !== state.sentAt;
  return (
    <div className="ai-panel">
      <AskButton
        action={formAction}
        hidden={{ ticket_id: ticketId }}
        label="Suggest filing"
        pending={isPending}
      />
      <FormFeedback state={state} />
      {open && answer.state !== "ok" && <Notice answer={answer} />}
      {open && answer.state === "ok" && suggestion && (
        <div className="ai-panel__body">
          <dl className="ai-facts">
            <dt>Tags</dt>
            <dd>{suggestion.tags.length ? suggestion.tags.join(", ") : "None"}</dd>
            <dt>Priority</dt>
            <dd>{suggestion.priority}</dd>
            {suggestion.duplicate && (
              <>
                <dt>Looks like</dt>
                <dd>
                  <Link href={`/support/${suggestion.duplicate.ticket_id}`}>
                    {suggestion.duplicate.subject || suggestion.duplicate.ticket_id}
                  </Link>
                </dd>
              </>
            )}
          </dl>
          {suggestion.why && <p className="field__hint">{suggestion.why}</p>}
          <div className="ai-panel__actions">
            <form action={applyAction}>
              <AttemptField state={applied} />
              <input type="hidden" name="ticket_id" value={ticketId} />
              <input type="hidden" name="tags" value={suggestion.tags.join(",")} />
              <input type="hidden" name="priority" value={suggestion.priority} />
              <input type="hidden" name="run_id" value={answer.run_id ?? ""} />
              <Button type="submit" size="small" variant="primary" disabled={applying}>
                {applying ? "Applying…" : "Apply tags and priority"}
              </Button>
            </form>
            <Button
              size="small"
              variant="ghost"
              onClick={() => {
                send(answer.run_id, "dismissed");
                setClosed(state.sentAt ?? 0);
              }}
            >
              Dismiss
            </Button>
          </div>
          <FormFeedback state={applied} />
        </div>
      )}
    </div>
  );
}

/** A brief before a call: prose around facts the records hold, every figure from them. Never stored. */
export function AiBrief({
  subjectType,
  subjectId,
  action,
  feedback,
}: {
  subjectType: "company" | "deal" | "meeting";
  subjectId: string;
  action: Action;
  feedback: Action;
}) {
  const zone = useTimeZone();
  const [state, formAction, isPending] = useActionState(action, INITIAL_ACTION_STATE);
  const [closed, setClosed] = useState(0);
  const answer = answerOf(state);
  const send = useFeedback(feedback);
  const open = answer && closed !== state.sentAt;
  const facts = (answer?.facts ?? []) as Array<{ key: string; label: string; value: string }>;
  return (
    <div className="ai-panel">
      <AskButton
        action={formAction}
        hidden={{ subject_type: subjectType, subject_id: subjectId }}
        label="Brief me"
        pending={isPending}
      />
      <FormFeedback state={state} />
      {open && answer.state !== "ok" && <Notice answer={answer} />}
      {open && answer.state === "ok" && (
        <div className="ai-panel__body">
          <p className="ai-panel__text">{String(answer.brief ?? "")}</p>
          <p className="field__hint">
            As of {formatAbsolute(String(answer.as_of ?? ""), "Not available", zone)}, from{" "}
            {facts.length} facts on record. Every figure is taken from them.
          </p>
          <details className="disclosure">
            <summary>What it was given</summary>
            <ul className="ai-sources">
              {facts.map((fact) => (
                <li key={fact.key}>
                  {fact.label}: {fact.value}
                </li>
              ))}
            </ul>
          </details>
          <div className="ai-panel__actions">
            <Button
              size="small"
              variant="ghost"
              onClick={() => {
                send(answer.run_id, "dismissed");
                setClosed(state.sentAt ?? 0);
              }}
            >
              Close
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Follow-ups found in meeting notes, each quoting its line; added one by one, by a person. */
export function AiTaskProposals({
  meetingId,
  action,
  add,
}: {
  meetingId: string;
  action: Action;
  add: Action;
}) {
  const [state, formAction, isPending] = useActionState(action, INITIAL_ACTION_STATE);
  const answer = answerOf(state);
  const proposals = (answer?.proposals ?? []) as Array<{
    title: string;
    quote: string;
    due_on: string;
  }>;
  return (
    <div className="ai-panel">
      <AskButton
        action={formAction}
        hidden={{ meeting_id: meetingId }}
        label="Suggest tasks from the notes"
        pending={isPending}
      />
      <FormFeedback state={state} />
      {answer && answer.state !== "ok" && <Notice answer={answer} />}
      {answer && answer.state === "ok" && (
        <ul className="ai-proposals">
          {proposals.map((proposal) => (
            <li key={proposal.quote} className="ai-proposals__item">
              <strong>{proposal.title}</strong>
              <span className="field__hint">
                “{proposal.quote}”{proposal.due_on ? ` · due ${formatDate(proposal.due_on)}` : ""}
              </span>
              <ProposalAdd
                add={add}
                meetingId={meetingId}
                companyId={String(answer.company_id ?? "")}
                runId={answer.run_id ?? ""}
                proposal={proposal}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ProposalAdd({
  add,
  meetingId,
  companyId,
  runId,
  proposal,
}: {
  add: Action;
  meetingId: string;
  companyId: string;
  runId: string;
  proposal: { title: string; quote: string; due_on: string };
}) {
  const [state, formAction, isPending] = useActionState(add, INITIAL_ACTION_STATE);
  if (state.status === "sent") return <span className="ai-proposals__done">Added</span>;
  return (
    <form action={formAction}>
      <AttemptField state={state} />
      {Object.entries({
        meeting_id: meetingId,
        company_id: companyId,
        run_id: runId,
        title: proposal.title,
        quote: proposal.quote,
        due_on: proposal.due_on,
      }).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <Button type="submit" size="small" disabled={isPending}>
        {isPending ? "Adding…" : "Add task"}
      </Button>
      <FormFeedback state={state} />
    </form>
  );
}

/**
 * A filter described in words. The words and the list's field names go to the service —
 * never a row — and what comes back is checked against the fields, then applied as the
 * ordinary filter in the address bar, where it can be read and changed.
 */
export function AiFilterBox({
  list,
  fields,
  action,
}: {
  list: string;
  fields: ReadonlyArray<{
    key: string;
    label: string;
    kind: string;
    choices?: ReadonlyArray<{ value: string; label: string }> | undefined;
  }>;
  action: Action;
}) {
  const [state, formAction, isPending] = useActionState(action, INITIAL_ACTION_STATE);
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const answer = answerOf(state);
  useEffect(() => {
    if (!answer || answer.state !== "ok") return;
    const conditions = (answer.conditions ?? []) as Array<{
      field: string;
      op: string;
      value: string;
    }>;
    const next = new URLSearchParams(search.toString());
    next.delete("f");
    for (const condition of conditions)
      next.append("f", `${condition.field}:${condition.op}:${condition.value}`);
    router.push(`${pathname}?${next.toString()}`);
    // Runs once per answer: the answer's sentAt is its identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.sentAt]);
  return (
    <div className="ai-panel ai-panel--filter">
      <form className="ai-filter" action={formAction}>
        <input type="hidden" name="list" value={list} />
        <input type="hidden" name="fields" value={JSON.stringify(fields)} />
        <Field id={`ai-filter-${list}`} label="Filter in plain words">
          <Input
            id={`ai-filter-${list}`}
            name="text"
            maxLength={300}
            placeholder="e.g. new leads waiting over an hour"
            required
            disabled={isPending}
          />
        </Field>
        <Button type="submit" size="small" disabled={isPending}>
          {isPending ? "Reading…" : "Filter"}
        </Button>
      </form>
      <FormFeedback state={state} />
      {answer && answer.state !== "ok" && <Notice answer={answer} />}
    </div>
  );
}
