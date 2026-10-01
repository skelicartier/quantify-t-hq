import Link from "next/link";

import { createReviewAction } from "@/app/(portal)/success/relationship-actions";
import { ReviewStatePill } from "@/components/success/relationship-parts";
import { ActForm } from "@/components/ui/act-form";
import { Callout } from "@/components/ui/callout";
import { DataTable } from "@/components/ui/data-table";
import { Field, Input } from "@/components/ui/field";
import { Popover } from "@/components/ui/popover";
import { HqApiRequestError, HqApiUnavailableError } from "@/lib/api/core";
import { readCompanyReviews, type CompanyReviews as Reviews } from "@/lib/api/relationships";
import { formatDate } from "@/lib/format";

const COLUMNS = [
  { key: "review", label: "Review" },
  { key: "period", label: "Period" },
  { key: "state", label: "State" },
  { key: "held", label: "Held" },
  { key: "by", label: "Started by" },
];

/**
 * The firm's business reviews, newest period first, and starting one: its figures are read
 * and frozen then, for the words to be written over.
 */
export async function CompanyReviews({ token, companyId }: { token: string; companyId: string }) {
  let list: Reviews | null = null;
  try {
    list = await readCompanyReviews(token, companyId);
  } catch (error) {
    if (!(error instanceof HqApiUnavailableError || error instanceof HqApiRequestError))
      throw error;
  }
  if (list === null)
    return (
      <Callout tone="danger" role="alert">
        The reviews could not be read just now.
      </Callout>
    );
  return (
    <div className="stack-form">
      <DataTable
        caption="Business reviews with this firm, newest first"
        columns={COLUMNS}
        isEmpty={list.reviews.length === 0}
        empty={<p className="muted">No business review yet.</p>}
        columnMenu={false}
      >
        {list.reviews.map((review) => (
          <tr key={review.review_id}>
            <td>
              <Link href={`/success/reviews/${review.review_id}`}>{review.title}</Link>
            </td>
            <td>
              {formatDate(review.period_start)} to {formatDate(review.period_end)}
            </td>
            <td>
              <ReviewStatePill status={review.status} />
            </td>
            <td>{formatDate(review.held_on, "—")}</td>
            <td>{review.created_by_name || "—"}</td>
          </tr>
        ))}
      </DataTable>
      {list.can_create && (
        <Popover label="Start a review" width="wide" align="start">
          <ActForm
            action={createReviewAction}
            hidden={{ company_id: companyId }}
            act="create"
            label="Start it"
            primary
            tight={false}
          >
            <p className="muted">
              The period&apos;s figures are read now and frozen: seats, what they pay, their
              tickets, what they asked for and what shipped.
            </p>
            <Field id="review-title" label="Title">
              <Input
                id="review-title"
                name="title"
                maxLength={160}
                defaultValue={list.suggested.title}
              />
            </Field>
            <div className="form-grid">
              <Field id="review-start" label="From">
                <Input
                  id="review-start"
                  name="period_start"
                  type="date"
                  defaultValue={list.suggested.period_start}
                />
              </Field>
              <Field id="review-end" label="To">
                <Input
                  id="review-end"
                  name="period_end"
                  type="date"
                  defaultValue={list.suggested.period_end}
                />
              </Field>
            </div>
          </ActForm>
        </Popover>
      )}
    </div>
  );
}
