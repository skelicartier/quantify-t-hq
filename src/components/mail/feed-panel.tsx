"use client";

import { useActionState, useState } from "react";

import { AttemptField } from "@/components/ui/attempt-field";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { FormFeedback } from "@/components/ui/form-feedback";
import { SKIP_REASON_LABELS, type FeedJudge } from "@/lib/api/mail-schema";
import { INITIAL_ACTION_STATE, type ActionState } from "@/lib/forms/action-state";

type Action = (previous: ActionState, formData: FormData) => Promise<ActionState>;
type SegmentOption = { segment_id: string; name: string; kind: string; last_count: number | null };

function judgeFrom(detail: string | undefined): FeedJudge | null {
  if (!detail) return null;
  try {
    return JSON.parse(detail) as FeedJudge;
  } catch {
    return null;
  }
}

/**
 * A feed: the sequence takes up to a daily cap from a segment each day, best fit first,
 * under the cold-mail rules and its own. "Check today's take" shows what the first day
 * would do — who it would enrol, how many it would judge to find them, what it would
 * hold back and why — before the feed exists.
 */
export function FeedPanel({
  sequenceId,
  segments,
  maxDailyCap,
  previewAction,
  createAction,
  disabled,
}: {
  sequenceId: string;
  segments: readonly SegmentOption[];
  maxDailyCap: number;
  previewAction: Action;
  createAction: Action;
  /** The sequence is not live, or the role cannot set a standing send. */
  disabled: boolean;
}) {
  const [checkState, check, checking] = useActionState(previewAction, INITIAL_ACTION_STATE);
  const [startState, start, starting] = useActionState(createAction, INITIAL_ACTION_STATE);
  const leads = segments.filter((segment) => segment.kind === "leads");
  const others = segments.filter((segment) => segment.kind !== "leads");
  const [segmentId, setSegmentId] = useState(leads[0]?.segment_id ?? segments[0]?.segment_id ?? "");
  const [cap, setCap] = useState("50");
  const [note, setNote] = useState("");
  const judged =
    startState.status === "sent"
      ? null
      : checkState.status === "sent"
        ? judgeFrom(checkState.detail)
        : null;
  const fields = (
    <>
      <input type="hidden" name="sequence_id" value={sequenceId} />
      <input type="hidden" name="segment_id" value={segmentId} />
      <input type="hidden" name="daily_cap" value={cap} />
      <input type="hidden" name="note" value={note} />
    </>
  );
  if (segments.length === 0) {
    return (
      <p className="page-note">
        No segment to take from yet. Save a view of the prospects as a segment first; the feed asks
        it again every day.
      </p>
    );
  }
  return (
    <div className="enrol-panel">
      <div className="form-row">
        <Field
          id="feed-segment"
          label="Take from"
          hint="Asked again every day, so people who join the segment later are taken too."
        >
          <Select
            id="feed-segment"
            value={segmentId}
            onChange={(event) => setSegmentId(event.target.value)}
            disabled={checking || starting}
          >
            {leads.map((segment) => (
              <option key={segment.segment_id} value={segment.segment_id}>
                {segment.name}
                {segment.last_count === null ? "" : ` · ${segment.last_count} leads`}
              </option>
            ))}
            {others.map((segment) => (
              <option key={segment.segment_id} value={segment.segment_id}>
                {segment.name}
                {segment.last_count === null ? "" : ` · ${segment.last_count} people`}
              </option>
            ))}
          </Select>
        </Field>
        <Field
          id="feed-cap"
          label="Up to, each day"
          hint={`From 1 to ${maxDailyCap.toLocaleString("en-GB")}. The sender's own daily cap still applies; the research's advice is twenty-five to fifty a mailbox.`}
        >
          <Input
            id="feed-cap"
            type="number"
            inputMode="numeric"
            min={1}
            max={maxDailyCap}
            value={cap}
            onChange={(event) => setCap(event.target.value)}
            disabled={checking || starting}
          />
        </Field>
      </div>
      <Field
        id="feed-note"
        label="Note"
        hint="Optional: what this feed is for, for whoever reads the list later."
      >
        <Input
          id="feed-note"
          value={note}
          maxLength={400}
          onChange={(event) => setNote(event.target.value)}
          disabled={checking || starting}
        />
      </Field>
      <div className="form-actions">
        <form action={check}>
          {fields}
          <Button type="submit" size="small" disabled={checking || !segmentId}>
            {checking ? "Checking…" : "Check today's take"}
          </Button>
        </form>
        <form action={start}>
          <AttemptField state={startState} />
          {fields}
          <Button
            type="submit"
            size="small"
            variant="primary"
            disabled={starting || disabled || !segmentId}
          >
            {starting ? "Starting…" : "Start the feed"}
          </Button>
        </form>
      </div>
      {checkState.status === "error" && <FormFeedback state={checkState} />}
      <FormFeedback state={startState} />
      {judged && (
        <div className="feed-judge" role="status">
          <p className="audience-summary">
            <strong>{judged.would_enrol.toLocaleString("en-GB")}</strong> would be enrolled today
            {judged.pool > 0 && (
              <>
                , of <strong>{judged.pool.toLocaleString("en-GB")}</strong> in the segment the
                sequence has not had
              </>
            )}
            .{" "}
            {judged.already_had > 0 &&
              `${judged.already_had.toLocaleString("en-GB")} it has had already are out. `}
            {judged.considered > judged.would_enrol &&
              `${judged.considered.toLocaleString("en-GB")} judged to find them.`}
          </p>
          {judged.limited_by_room && (
            <p className="page-note">
              Held to the room in your mailboxes: {judged.room.toLocaleString("en-GB")} more first
              emails can go today. A feed never enrols more prospects than can be written to.
            </p>
          )}
          <p className="page-note">
            {judged.per_day > 0
              ? `At about ${judged.per_day.toLocaleString("en-GB")} new a day, the ${judged.remaining_estimate.toLocaleString("en-GB")} likely to pass would take ${judged.drain_days === 1 ? "a working day" : `${(judged.drain_days ?? 0).toLocaleString("en-GB")} working days`}.`
              : "No connected mailbox of yours can send yet, so prospects wait. Connect one under Mailboxes."}
          </p>
          {Object.keys(judged.reasons).length > 0 && (
            <ul className="reason-list">
              {Object.entries(judged.reasons).map(([reason, count]) => (
                <li key={reason}>
                  <span>{SKIP_REASON_LABELS[reason] ?? reason}</span>
                  <span className="reason-list__count">{count}</span>
                </li>
              ))}
            </ul>
          )}
          {judged.sample.length > 0 && (
            <p className="page-note">
              Among them:{" "}
              {judged.sample
                .map((row) => `${row.name || row.email}${row.company ? ` (${row.company})` : ""}`)
                .join(", ")}
              .
            </p>
          )}
        </div>
      )}
    </div>
  );
}
