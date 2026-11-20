import Link from "next/link";
import { notFound } from "next/navigation";

import { DataUnavailable } from "@/components/data/data-down";
import { ReviewFields } from "@/components/data/assurance/assurance-fields";
import { AssuranceTabs } from "@/components/data/assurance/assurance-tabs";
import { CopyFields } from "@/components/data/meetings/copy-fields";
import { ControlRefNote } from "@/components/data/security/control-ref";
import { MailForm } from "@/components/mail/mail-form";
import { PageHeader } from "@/components/shell/page-header";
import { Callout } from "@/components/ui/callout";
import { DataTable } from "@/components/ui/data-table";
import { Field, Input } from "@/components/ui/field";
import { Popover } from "@/components/ui/popover";
import {
  Properties,
  Property,
  RecordGrid,
  RecordHeader,
  RecordSection,
} from "@/components/ui/record-shell";
import { RowAction } from "@/components/ui/row-action";
import { StatusPill } from "@/components/ui/status-pill";
import { Timestamp } from "@/components/ui/timestamp";
import { DATA_ROLE_LINE, requireData } from "@/lib/data/access";
import { readReview, type ReviewPage } from "@/lib/data/api/assurance";
import { dayWords } from "@/lib/data/labels-company";
import { NOT_ADVICE } from "@/lib/data/labels-controls";
import { dataRead } from "@/lib/data/read";
import { requestNow } from "@/lib/request-time";

import { addReviewActionAction, reviewActionDoneAction, updateReviewAction } from "../../actions";
import "../../assurance.css";

export const metadata = { title: "Management review" };
export const dynamic = "force-dynamic";

const BASE = "/data/assurance/reviews";
const ID = /^[A-Za-z0-9-]{1,64}$/;

export default async function ReviewRecordPage({
  params,
}: {
  params: Promise<{ reviewId: string }>;
}) {
  const { reviewId } = await params;
  const { allowed } = await requireData(`${BASE}/${reviewId}`);
  if (!ID.test(reviewId)) notFound();
  const now = requestNow();
  const read = allowed ? await dataRead(() => readReview(reviewId)) : null;
  if (!allowed || !read || !read.ok)
    return (
      <>
        <PageHeader title="Management review" />
        <div className="page-content">
          {!allowed || !read ? (
            <Callout tone="neutral">{DATA_ROLE_LINE}</Callout>
          ) : (
            !read.ok && <DataUnavailable failure={read} />
          )}
        </div>
      </>
    );
  return <ReviewRecord page={read.data} now={now} />;
}

function ReviewRecord({ page, now }: { page: ReviewPage; now: number }) {
  const review = page.review;
  const fields = { review_id: review.review_id };
  return (
    <>
      <RecordHeader
        crumbs={[
          { href: "/data/assurance", label: "Assurance" },
          { href: BASE, label: "Management review" },
        ]}
        title={`Management review of ${dayWords(review.held_on)}`}
        status={
          <StatusPill
            value={review.actions_open > 0 ? "open" : "done"}
            label={review.actions_open > 0 ? `${review.actions_open} open` : "Actions done"}
            tone={review.actions_late > 0 ? "attention" : "neutral"}
          />
        }
        readouts={[
          { label: "Held", value: dayWords(review.held_on) },
          { label: "Actions", value: `${review.actions_open} open of ${review.actions.length}` },
          { label: "Minutes", value: review.minutes_file ? "Attached" : "None" },
        ]}
        actions={
          <Popover label="Edit" align="start" width="wide">
            <MailForm
              action={updateReviewAction}
              fields={fields}
              submitLabel="Save"
              pendingLabel="Saving…"
            >
              <ReviewFields prefix="review-edit" today={page.today} values={review} />
              <CopyFields
                prefix="review-edit"
                label="The minutes"
                files={page.files}
                filesHere={page.files_here}
                folder="Security › Management reviews"
              />
            </MailForm>
          </Popover>
        }
      />
      <RecordGrid side={<Side page={page} />}>
        <AssuranceTabs current="reviews" />
        <div className="hqdata-assurance">
          <RecordSection
            id="review-actions"
            title="Actions"
            actions={
              <Popover label="Add an action" align="end" width="wide">
                <MailForm
                  action={addReviewActionAction}
                  fields={fields}
                  submitLabel="Add it"
                  pendingLabel="Adding…"
                >
                  <Field id="action-what" label="What is to be done">
                    <Input id="action-what" name="what" minLength={3} maxLength={300} required />
                  </Field>
                  <div className="hqdata-assurance__pair">
                    <Field id="action-owner" label="Owner">
                      <Input id="action-owner" name="owner" maxLength={120} />
                    </Field>
                    <Field id="action-due" label="By">
                      <Input id="action-due" name="due_on" type="date" />
                    </Field>
                  </div>
                </MailForm>
              </Popover>
            }
          >
            <DataTable
              caption="Actions"
              columns={[
                { key: "what", label: "Action", width: "44%" },
                { key: "owner", label: "Owner" },
                { key: "due", label: "By" },
                { key: "done", label: "Done" },
              ]}
              columnMenu={false}
              scroll={false}
              isEmpty={review.actions.length === 0}
              empty={<p className="page-note">No actions from this review.</p>}
            >
              {review.actions.map((action) => (
                <tr key={action.action_id} id={`action-${action.action_id}`}>
                  <td>{action.what}</td>
                  <td>{action.owner || <span className="quiet">—</span>}</td>
                  <td className="nowrap">
                    {action.due_on ? (
                      <span
                        className={
                          !action.done_on && action.due_on < page.today
                            ? "hqdata-assurance__late"
                            : undefined
                        }
                      >
                        {dayWords(action.due_on)}
                      </span>
                    ) : (
                      <span className="quiet">—</span>
                    )}
                  </td>
                  <td>
                    {action.done_on ? (
                      <>
                        {dayWords(action.done_on)}
                        <RowAction
                          action={reviewActionDoneAction}
                          fields={{ ...fields, action_id: action.action_id, undo: "1" }}
                          buttons={[
                            { label: "Open again", className: "btn btn--small btn--ghost" },
                          ]}
                          className="hqdata-assurance__inline"
                        />
                      </>
                    ) : (
                      <RowAction
                        action={reviewActionDoneAction}
                        fields={{ ...fields, action_id: action.action_id }}
                        buttons={[{ label: "Mark done", className: "btn btn--small" }]}
                        className="hqdata-assurance__inline"
                      />
                    )}
                  </td>
                </tr>
              ))}
            </DataTable>
          </RecordSection>
          <RecordSection id="review-inputs" title="What it looked at">
            <p>
              <ControlRefNote refs={["c9_3"]} />
            </p>
            <dl className="hqdata-assurance__holds">
              {page.inputs.map((input) => (
                <div key={input.key}>
                  <dt>{input.label}</dt>
                  <dd className="hqdata-assurance__prose">
                    {review.inputs[input.key] || "Nothing written."}
                  </dd>
                </div>
              ))}
            </dl>
          </RecordSection>
          <RecordSection id="review-decisions" title="What was decided">
            <p className="hqdata-assurance__prose">{review.decisions || "Nothing written."}</p>
          </RecordSection>
          <RecordSection id="review-activity" title="Activity">
            {page.events.length === 0 ? (
              <p className="timeline-empty">Nothing has happened yet.</p>
            ) : (
              <ol className="timeline">
                {page.events.map((event) => (
                  <li key={event.event_id} className="timeline__item">
                    <span className="timeline__kind">
                      {event.verb.charAt(0).toUpperCase() + event.verb.slice(1)}
                    </span>
                    <div>
                      <p className="timeline__meta">
                        <span className="timeline__actor">{event.by.name}</span>
                        <Timestamp value={event.at} now={now} mode="relative" />
                      </p>
                      {event.detail && <p className="timeline__body">{event.detail}</p>}
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </RecordSection>
          <p className="page-note">{NOT_ADVICE}</p>
        </div>
      </RecordGrid>
    </>
  );
}

function Side({ page }: { page: ReviewPage }) {
  const review = page.review;
  return (
    <Properties title="The review">
      <Property label="Held">{dayWords(review.held_on)}</Property>
      <Property label="Attendees">{review.attendees || "Not recorded"}</Property>
      <Property label="Minutes">
        {review.minutes_file ? (
          <Link className="text-link" href={`/data/files/${review.minutes_file.file_id}`}>
            {review.minutes_file.title}
          </Link>
        ) : (
          "None attached"
        )}
      </Property>
    </Properties>
  );
}
