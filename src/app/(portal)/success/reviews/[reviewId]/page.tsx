import Link from "next/link";
import { notFound } from "next/navigation";

import { reviewAction } from "@/app/(portal)/success/relationship-actions";
import { ReviewStatePill } from "@/components/success/relationship-parts";
import { PageHeader } from "@/components/shell/page-header";
import { CopyAnswer } from "@/components/trust/copy-answer";
import { ActForm } from "@/components/ui/act-form";
import { Callout } from "@/components/ui/callout";
import { Card } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { Field, Input, Textarea } from "@/components/ui/field";
import { RecordHeader, RecordSection } from "@/components/ui/record-shell";
import { requireStaff } from "@/lib/access/core";
import { HqApiRequestError, HqApiUnavailableError } from "@/lib/api/core";
import { readReview, type Review } from "@/lib/api/relationships";
import { formatAbsolute, formatDate, formatMoneyExact } from "@/lib/format";
import { requestNow } from "@/lib/request-time";

export const metadata = { title: "Business review" };
export const dynamic = "force-dynamic";

const MOVE_LABELS: Record<string, string> = {
  new: "New",
  expansion: "Expansion",
  reactivation: "Reactivation",
  contraction: "Contraction",
  churn: "Churn",
  adjustment: "Adjustment",
};

type Params = Promise<{ reviewId: string }>;

const hours = (value: number | null) =>
  value === null ? "—" : value < 1 ? `${Math.round(value * 60)} min` : `${value} h`;

/** The review as text, to paste into the follow-up mail: the words, then the figures. */
function asText(review: Review): string {
  const snap = review.snapshot;
  const lines = [
    `${review.title}, ${review.company_name}`,
    `${formatDate(snap.period_start)} to ${formatDate(snap.period_end)}`,
    "",
    "Goals",
    review.goals || "—",
    "",
    "Wins",
    review.wins || "—",
    "",
    "Risks",
    review.risks || "—",
    "",
    "Actions agreed",
    review.actions || "—",
    "",
    "The figures",
    `Seats: ${snap.usage.active_30d} of ${snap.seats_paid} paid seats signed in within 30 days (as read ${formatDate(snap.usage_read_on)})`,
    snap.tickets
      ? `Tickets: ${snap.tickets.opened} opened, ${snap.tickets.resolved} resolved, median first reply ${hours(snap.tickets.median_first_reply_hours)}`
      : `Tickets: ${snap.tickets_note}`,
    `Asked for: ${snap.asks.in_period} (${snap.asks.requests.join(", ") || "nothing new"})`,
    `Shipped for them: ${snap.shipped.map((item) => item.title).join(", ") || "nothing this period"}`,
  ];
  return lines.join("\n");
}

/**
 * One business review: the period's figures frozen when it was started, the words written
 * over them, and finishing it once it has been held.
 */
export default async function ReviewPage({ params }: { params: Params }) {
  const { reviewId } = await params;
  const context = await requireStaff(`/success/reviews/${reviewId}`);
  let review: Review | null = null;
  try {
    review = (await readReview(context.token, reviewId)).review;
  } catch (error) {
    if (error instanceof HqApiRequestError && error.status === 404) notFound();
    if (!(error instanceof HqApiUnavailableError || error instanceof HqApiRequestError))
      throw error;
  }
  if (review === null) {
    return (
      <>
        <PageHeader eyebrow="Customer success" title="Business review" />
        <Callout tone="danger" role="alert">
          This review could not be read just now.
        </Callout>
      </>
    );
  }
  const snap = review.snapshot;
  const draft = review.status === "draft";
  const editable = draft && review.can_edit;
  const hidden = { review_id: review.review_id };
  const today = new Date(requestNow()).toISOString().slice(0, 10);
  const currencies = Object.keys(snap.money ?? {});

  return (
    <>
      <RecordHeader
        crumbs={[
          { href: `/companies/${review.company_id}?tab=success`, label: review.company_name },
        ]}
        title={review.title}
        status={<ReviewStatePill status={review.status} />}
        readouts={[
          {
            label: "Period",
            value: `${formatDate(snap.period_start)} – ${formatDate(snap.period_end)}`,
          },
          { label: "Figures as of", value: formatDate(snap.as_of) },
          { label: "Held", value: formatDate(review.held_on, "Not yet") },
        ]}
      />
      {!draft && (
        <Callout tone="neutral" compact>
          Final, by {review.finalised_by_name} on {formatAbsolute(review.finalised_at)}: kept as it
          was held.
        </Callout>
      )}
      <div className="page-content">
        <RecordSection
          id="figures"
          title="The figures"
          actions={<CopyAnswer text={asText(review)} label="Copy as text" />}
        >
          <div className="stat-grid">
            <div className="stat">
              <span className="stat__label">Seats paid</span>
              <span className="stat__value">{snap.seats_paid}</span>
            </div>
            <div className="stat">
              <span className="stat__label">Signed in, 30 days</span>
              <span className="stat__value">{snap.usage.active_30d}</span>
              <span className="stat__hint">as read {formatDate(snap.usage_read_on)}</span>
            </div>
            <div className="stat">
              <span className="stat__label">Tickets opened</span>
              <span className="stat__value">{snap.tickets ? snap.tickets.opened : "—"}</span>
            </div>
            <div className="stat">
              <span className="stat__label">Median first reply</span>
              <span className="stat__value">
                {snap.tickets ? hours(snap.tickets.median_first_reply_hours) : "—"}
              </span>
              {snap.tickets?.slowest_first_reply_hours !== null && snap.tickets && (
                <span className="stat__hint">
                  slowest {hours(snap.tickets.slowest_first_reply_hours)}
                </span>
              )}
            </div>
          </div>
          {!snap.tickets && <p className="page-note">{snap.tickets_note}</p>}
          {snap.tickets && (
            <p className="page-note">
              {snap.tickets.resolved} resolved in the period · {snap.tickets.open_at_end} open at
              its end · {snap.tickets.answered} answered
            </p>
          )}
          {snap.money === null ? (
            <p className="page-note">What the firm pays is shown to Sales, Admins and Owners.</p>
          ) : (
            <DataTable
              caption="What the firm pays a month, and what moved it"
              columns={[
                { key: "line", label: "A month" },
                ...currencies.map((code) => ({ key: code, label: code, align: "end" as const })),
              ]}
              isEmpty={currencies.length === 0}
              empty={<p className="muted">No contract money recorded for this firm.</p>}
              columnMenu={false}
            >
              <tr>
                <td>At the start</td>
                {currencies.map((code) => (
                  <td key={code} className="data-table__num">
                    {formatMoneyExact(snap.money![code]!.opening, code)}
                  </td>
                ))}
              </tr>
              {Object.keys(MOVE_LABELS)
                .filter((kind) =>
                  currencies.some((code) => snap.money![code]!.moves[kind] !== undefined),
                )
                .map((kind) => (
                  <tr key={kind}>
                    <td>{MOVE_LABELS[kind]}</td>
                    {currencies.map((code) => (
                      <td key={code} className="data-table__num">
                        {snap.money![code]!.moves[kind] === undefined
                          ? "—"
                          : formatMoneyExact(snap.money![code]!.moves[kind]!, code)}
                      </td>
                    ))}
                  </tr>
                ))}
              <tr>
                <td>
                  <strong>At the end</strong>
                </td>
                {currencies.map((code) => (
                  <td key={code} className="data-table__num">
                    <strong>{formatMoneyExact(snap.money![code]!.closing, code)}</strong>
                  </td>
                ))}
              </tr>
            </DataTable>
          )}
          <div className="form-grid">
            <Card title="What they asked for" titleAs="h3">
              {snap.asks.in_period === 0 ? (
                <p className="muted">Nothing new in the period.</p>
              ) : (
                <>
                  <p className="page-note">
                    {snap.asks.in_period} ask{snap.asks.in_period === 1 ? "" : "s"}
                    {snap.asks.blockers > 0 && `, ${snap.asks.blockers} blocking them`}
                  </p>
                  <ul className="plain-list">
                    {snap.asks.requests.map((title) => (
                      <li key={title}>{title}</li>
                    ))}
                  </ul>
                </>
              )}
            </Card>
            <Card title="What shipped for them" titleAs="h3">
              {snap.shipped.length === 0 ? (
                <p className="muted">Nothing they asked for shipped in the period.</p>
              ) : (
                <ul className="plain-list">
                  {snap.shipped.map((item) => (
                    <li key={item.title}>
                      {item.title}
                      <span className="quiet"> · {formatDate(item.shipped_on)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
          <div className="form-grid">
            <Card title="Renewal" titleAs="h3">
              {snap.renewal ? (
                <p>
                  Renews {formatDate(snap.renewal.renews_on)}
                  {snap.renewal.notice_date &&
                    `; notice by ${formatDate(snap.renewal.notice_date)}`}
                  {snap.renewal.status && (
                    <span className="quiet"> · {snap.renewal.status.replace("_", " ")}</span>
                  )}
                </p>
              ) : (
                <p className="muted">No renewal date on a contract in force.</p>
              )}
            </Card>
            <Card
              title="Signals"
              titleAs="h3"
              description="As they stood when the figures were read."
            >
              {snap.signals.length === 0 ? (
                <p className="muted">None matched.</p>
              ) : (
                <ul className="plain-list">
                  {snap.signals.map((signal) => (
                    <li key={signal.label}>
                      <strong>{signal.label}</strong>
                      <span className="quiet"> · {signal.evidence}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        </RecordSection>

        <RecordSection id="words" title="The review">
          {editable ? (
            <ActForm action={reviewAction} hidden={hidden} act="edit" label="Save" tight={false}>
              <Field id="review-goals" label="Their goals">
                <Textarea
                  id="review-goals"
                  name="goals"
                  rows={3}
                  maxLength={4000}
                  defaultValue={review.goals}
                />
              </Field>
              <Field id="review-wins" label="Wins">
                <Textarea
                  id="review-wins"
                  name="wins"
                  rows={3}
                  maxLength={4000}
                  defaultValue={review.wins}
                />
              </Field>
              <Field id="review-risks" label="Risks">
                <Textarea
                  id="review-risks"
                  name="risks"
                  rows={3}
                  maxLength={4000}
                  defaultValue={review.risks}
                />
              </Field>
              <Field id="review-actions" label="Actions agreed">
                <Textarea
                  id="review-actions"
                  name="actions"
                  rows={3}
                  maxLength={4000}
                  defaultValue={review.actions}
                />
              </Field>
              <div className="form-grid">
                <Field id="review-attendees" label="Who attended">
                  <Input
                    id="review-attendees"
                    name="attendees"
                    maxLength={1000}
                    defaultValue={review.attendees}
                  />
                </Field>
                <Field id="review-held" label="Held on">
                  <Input
                    id="review-held"
                    name="held_on"
                    type="date"
                    max={today}
                    defaultValue={review.held_on ?? ""}
                  />
                </Field>
              </div>
            </ActForm>
          ) : (
            <>
              <h3>Their goals</h3>
              <p className="prewrap">{review.goals || "—"}</p>
              <h3>Wins</h3>
              <p className="prewrap">{review.wins || "—"}</p>
              <h3>Risks</h3>
              <p className="prewrap">{review.risks || "—"}</p>
              <h3>Actions agreed</h3>
              <p className="prewrap">{review.actions || "—"}</p>
              <p className="page-note">Attended by {review.attendees || "—"}</p>
            </>
          )}
        </RecordSection>

        {editable && (
          <RecordSection id="finish" title="Finish it">
            <div className="form-grid">
              <Card
                title="Read the figures again"
                titleAs="h3"
                description="As of now, or the period's end if it has passed. Your words stay."
              >
                <ActForm
                  action={reviewAction}
                  hidden={hidden}
                  act="refresh"
                  label="Read them again"
                />
              </Card>
              <Card
                title="Finalise"
                titleAs="h3"
                description="Once it has been held. Nothing on it changes after this."
              >
                <ActForm
                  action={reviewAction}
                  hidden={hidden}
                  act="finalise"
                  label="Finalise"
                  primary
                >
                  <Field id="finalise-held" label="Held on">
                    <Input
                      id="finalise-held"
                      name="held_on"
                      type="date"
                      max={today}
                      defaultValue={review.held_on ?? today}
                    />
                  </Field>
                </ActForm>
              </Card>
            </div>
          </RecordSection>
        )}
        <p className="page-note">
          <Link href={`/companies/${review.company_id}?tab=success`}>
            Back to {review.company_name}
          </Link>
        </p>
      </div>
    </>
  );
}
