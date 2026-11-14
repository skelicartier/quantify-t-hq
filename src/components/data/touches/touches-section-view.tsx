import Link from "next/link";

import { DataUnavailable } from "@/components/data/data-down";
import { MailForm } from "@/components/mail/mail-form";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Popover } from "@/components/ui/popover";
import { RecordSection } from "@/components/ui/record-shell";
import { StatusPill } from "@/components/ui/status-pill";
import type { TouchesPage } from "@/lib/data/api/touches";
import { TOUCH_KINDS } from "@/lib/data/labels-people";
import type { DataRead } from "@/lib/data/read";
import type { ActionState } from "@/lib/forms/action-state";
import { formatDate, formatNumber } from "@/lib/format";

/**
 * The Touches section a lead's page and an investor firm's page draw (ws-notes/company/
 * spec.md §8.9.4), from what was read: the newest touches, the way to all of them, the week's
 * count of connection requests, and "Log a touch". A failed read draws the Data state, never
 * an empty list. Kept apart from `touches-section.tsx` (which reads) so it can be drawn from
 * fixed data.
 */

export type TouchesSubjectView = { kind: "lead" | "investor"; id: string; name: string };

type Action = (previous: ActionState, formData: FormData) => Promise<ActionState>;

/** The section lists this many; the rest are a link away. */
export const SECTION_ROWS = 20;

export const NO_TOUCHES =
  "No touches logged. Log a connection request, a message or a call made outside email.";

/** "1 connection request", "3 connection requests". */
export const requestsWords = (count: number): string =>
  `${formatNumber(count)} connection ${count === 1 ? "request" : "requests"}`;

export const touchesWords = (count: number): string =>
  `${formatNumber(count)} ${count === 1 ? "touch" : "touches"}`;

/** "Day", "Kind" and "Note", for the section's form. */
export function TouchFields({ prefix, today }: { prefix: string; today: string }) {
  return (
    <>
      <div className="hqdata-touch-form__pair">
        <Field id={`${prefix}-on`} label="Day">
          <Input
            id={`${prefix}-on`}
            name="on"
            type="date"
            max={today}
            defaultValue={today}
            required
          />
        </Field>
        <Field id={`${prefix}-kind`} label="Kind">
          <Select id={`${prefix}-kind`} name="kind" defaultValue="request" required>
            {Object.entries(TOUCH_KINDS).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <Field id={`${prefix}-note`} label="Note">
        <Textarea id={`${prefix}-note`} name="note" rows={3} maxLength={1_000} />
      </Field>
      <p className="field__hint">Logged here by hand. Nothing is sent from HQ.</p>
    </>
  );
}

export function TouchesSectionView({
  subject,
  today,
  path,
  read,
  action,
}: {
  subject: TouchesSubjectView;
  today: string;
  path: string;
  read: DataRead<TouchesPage>;
  action: Action;
}) {
  const id = `${subject.kind}-touches`;
  const all = `/data/touches?subject_kind=${subject.kind}&subject_id=${encodeURIComponent(subject.id)}`;
  return (
    <RecordSection
      id={id}
      title="Touches"
      actions={
        read.ok ? (
          <Popover label="Log a touch" align="end">
            <MailForm
              action={action}
              fields={{
                subject_kind: subject.kind,
                subject_id: subject.id,
                subject_name: subject.name,
                path,
              }}
              submitLabel="Log it"
              pendingLabel="Logging…"
              className="stack-form stack-form--tight hqdata-touch-form"
            >
              <TouchFields prefix={`${id}-new`} today={today} />
            </MailForm>
          </Popover>
        ) : undefined
      }
    >
      {!read.ok ? (
        <DataUnavailable failure={read} />
      ) : (
        <>
          {read.data.touches.length === 0 ? (
            <p className="page-note hqdata-touches-section__empty">{NO_TOUCHES}</p>
          ) : (
            <>
              <ul className="hqdata-touches-list" aria-label={`Touches with ${subject.name}`}>
                {read.data.touches.slice(0, SECTION_ROWS).map((touch) => (
                  <li
                    key={touch.touch_id}
                    className={
                      touch.withdrawn
                        ? "hqdata-touches-list__row hqdata-touches__row--withdrawn"
                        : "hqdata-touches-list__row"
                    }
                  >
                    <span className="hqdata-touches-list__day">{formatDate(touch.on)}</span>
                    <span>
                      <StatusPill
                        value={touch.kind}
                        label={TOUCH_KINDS[touch.kind]}
                        tone="neutral"
                      />
                    </span>
                    <span className="hqdata-touches-list__note">
                      {touch.note || <span className="quiet">No note</span>}
                      {touch.withdrawn && <span className="quiet"> · Withdrawn</span>}
                    </span>
                    <span className="hqdata-touches-list__by">{touch.by.name}</span>
                  </li>
                ))}
              </ul>
              <p className="hqdata-touches-section__all">
                <Link className="text-link" href={all}>
                  All {touchesWords(read.data.total)}
                </Link>
              </p>
            </>
          )}
          <p className="page-note hqdata-touches-section__week">
            This week: {requestsWords(read.data.this_week.requests)} logged in all.
          </p>
        </>
      )}
    </RecordSection>
  );
}
