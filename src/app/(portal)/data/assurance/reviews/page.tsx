import Link from "next/link";

import { DataUnavailable } from "@/components/data/data-down";
import { ReviewFields } from "@/components/data/assurance/assurance-fields";
import { AssuranceTabs } from "@/components/data/assurance/assurance-tabs";
import { CopyFields } from "@/components/data/meetings/copy-fields";
import { ControlRefNote, PracticeNote } from "@/components/data/security/control-ref";
import { MailForm } from "@/components/mail/mail-form";
import { PageHeader } from "@/components/shell/page-header";
import { Callout } from "@/components/ui/callout";
import { DataTable } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input } from "@/components/ui/field";
import { Popover } from "@/components/ui/popover";
import { DATA_ROLE_LINE, requireData } from "@/lib/data/access";
import {
  readAssuranceSummary,
  readReviews,
  type AssuranceSummary,
  type ReviewsPage,
} from "@/lib/data/api/assurance";
import { dayWords } from "@/lib/data/labels-company";
import { REVIEWS_EMPTY } from "@/lib/data/labels-assurance";
import { NOT_ADVICE, PRACTICES } from "@/lib/data/labels-controls";
import { dataRead } from "@/lib/data/read";
import { formatNumber } from "@/lib/format";

import { addReviewAction, assuranceSetupAction } from "../actions";
import "../assurance.css";

export const metadata = { title: "Management review" };
export const dynamic = "force-dynamic";

const BASE = "/data/assurance/reviews";
const ABOUT = `Once a year, look at how security has gone, decide what to change, and write the actions down: each review with what it looked at, what was decided, its actions and its minutes. ${NOT_ADVICE}`;
/** The action rows the form offers; the service holds 50 a review. */
const ACTION_ROWS = 5;

/** Assurance › Management review (ws-notes/security/spec.md §8.6). */
export default async function ReviewsPage() {
  const { context, allowed } = await requireData(BASE);
  const owner = context.me.role === "owner";
  const read = allowed ? await dataRead(readReviews) : null;
  const summary = allowed ? await dataRead(() => readAssuranceSummary(owner)) : null;
  const data = read?.ok ? read.data : null;
  return (
    <>
      <PageHeader
        title="Management review"
        description={ABOUT}
        actions={
          data ? (
            <Popover label="Record a review" variant="primary" align="end" width="wide">
              <MailForm action={addReviewAction} submitLabel="Record it" pendingLabel="Recording…">
                {summary?.ok && <HoldsToday summary={summary.data} />}
                <ReviewFields
                  prefix="review-new"
                  today={data.today}
                  values={{ held_on: data.today, attendees: "", inputs: {}, decisions: "" }}
                  actionRows={ACTION_ROWS}
                />
                <CopyFields
                  prefix="review-new"
                  label="The minutes"
                  files={data.files}
                  filesHere={data.files_here}
                  folder="Security › Management reviews"
                />
              </MailForm>
            </Popover>
          ) : undefined
        }
      />
      <div className="page-content">
        <AssuranceTabs current="reviews" />
        {!allowed || !read ? (
          <Callout tone="neutral">{DATA_ROLE_LINE}</Callout>
        ) : !read.ok ? (
          <DataUnavailable failure={read} />
        ) : (
          <div className="hqdata-assurance">
            <Reviews page={read.data} />
            <p className="page-note">{NOT_ADVICE}</p>
          </div>
        )}
      </div>
    </>
  );
}

/** "What HQ holds today": the Summary's lines, beside the review's inputs. */
function HoldsToday({ summary }: { summary: AssuranceSummary }) {
  const lines = summary.areas.flatMap((area) => area.lines);
  return (
    <section className="hqdata-assurance__holds" aria-label="What HQ holds today">
      <p>
        <strong>What HQ holds today</strong>
      </p>
      <dl>
        {lines.map((line) => (
          <div key={line.key}>
            <dt>{line.title}</dt>
            <dd>{line.words}</dd>
          </div>
        ))}
        {summary.absent.map((item) => (
          <div key={item.name}>
            <dt>{item.title}</dt>
            <dd>{item.words}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function Reviews({ page }: { page: ReviewsPage }) {
  const next = page.next;
  return (
    <section data-section="reviews-list">
      <p>
        <ControlRefNote refs={["c9_3"]} />
      </p>
      <div className="hqdata-assurance__tools">
        <p>
          {next.next_on ? (
            <>
              Next management review due{" "}
              <span className={next.next_on < page.today ? "hqdata-assurance__late" : undefined}>
                {dayWords(next.next_on)}
              </span>
              .{" "}
            </>
          ) : (
            "No review recorded yet. "
          )}
          <PracticeNote
            practice="management_review"
            {...(next.yours ? { amount: next.months } : {})}
          />
        </p>
        <Popover label="Settings" align="end">
          <MailForm action={assuranceSetupAction} submitLabel="Save" pendingLabel="Saving…">
            <Field
              id="review-months"
              label="Months between reviews"
              hint={
                <PracticeNote
                  practice="management_review"
                  {...(next.yours ? { amount: next.months } : {})}
                />
              }
            >
              <Input
                id="review-months"
                name="review_months"
                type="number"
                min={1}
                max={24}
                defaultValue={next.yours ? String(next.months) : ""}
                placeholder={String(PRACTICES.management_review.amount)}
              />
            </Field>
            <p className="field__hint">Leave it empty for HQ&apos;s default.</p>
          </MailForm>
        </Popover>
      </div>
      {page.reviews.length > 0 && (
        <div className="hqdata-assurance__links">
          <a className="text-link" href={`${BASE}/export`}>
            Download as CSV
          </a>
        </div>
      )}
      <DataTable
        caption="Management reviews"
        columns={[
          { key: "held", label: "Held" },
          { key: "attendees", label: "Attendees", width: "36%" },
          { key: "actions", label: "Actions open" },
          { key: "minutes", label: "Minutes" },
        ]}
        columnMenu={false}
        scroll={false}
        isEmpty={page.reviews.length === 0}
        empty={<EmptyState compact title="No management review" description={REVIEWS_EMPTY} />}
      >
        {page.reviews.map((review) => (
          <tr key={review.review_id} id={`review-${review.review_id}`}>
            <td className="nowrap">
              <Link className="table-title" href={review.href}>
                {dayWords(review.held_on)}
              </Link>
            </td>
            <td>{review.attendees || <span className="quiet">Not recorded</span>}</td>
            <td>
              {formatNumber(review.actions_open)} of {formatNumber(review.actions.length)}
              {review.actions_late > 0 && (
                <span className="table-sub hqdata-assurance__late">
                  {formatNumber(review.actions_late)} past their day
                </span>
              )}
            </td>
            <td>
              {review.minutes_file ? (
                <Link className="text-link" href={`/data/files/${review.minutes_file.file_id}`}>
                  {review.minutes_file.title}
                </Link>
              ) : (
                <span className="quiet">None attached</span>
              )}
            </td>
          </tr>
        ))}
      </DataTable>
    </section>
  );
}
