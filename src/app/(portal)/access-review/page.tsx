import Link from "next/link";

import { confirmSudoAction } from "@/app/(portal)/admin/actions";
import {
  completeReviewAction,
  decideReviewItemAction,
  startReviewAction,
} from "@/app/(portal)/team/actions";
import { SudoGate } from "@/components/admin/sudo-gate";
import { PageHeader } from "@/components/shell/page-header";
import { CompleteReviewForm, ReviewItemForm, StartReviewForm } from "@/components/team/team-forms";
import { Callout } from "@/components/ui/callout";
import { Card } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { Meter } from "@/components/ui/meter";
import { StatusPill } from "@/components/ui/status-pill";
import { hasCapability, requireStaff } from "@/lib/access/core";
import { HqApiRequestError, HqApiUnavailableError } from "@/lib/api/core";
import { readAccessReview, readAccessReviews, type AccessReview } from "@/lib/api/team";
import { formatAbsolute, formatDate } from "@/lib/format";

export const metadata = { title: "Access review" };
export const dynamic = "force-dynamic";

const FINDING_WORDS: Record<string, string> = {
  orphan: "Orphan",
  shared: "Shared account",
  conflict: "Conflict",
};

/** "conflict:Bank portal" reads as "Conflicts with Bank portal". */
function flagLabel(flag: string): string {
  const [kind, rest] = flag.split(/:(.*)/s);
  if (kind === "conflict") return rest ? `Conflicts with ${rest}` : "Conflict";
  return FINDING_WORDS[kind ?? ""] ?? flag;
}

export default async function AccessReviewPage() {
  const context = await requireStaff("/access-review");
  if (!hasCapability(context, "hr:read")) {
    return (
      <>
        <PageHeader eyebrow="Team" title="Access review" />
        <Callout tone="neutral">Access reviews are run by HQ admins.</Callout>
      </>
    );
  }
  let listing: Awaited<ReturnType<typeof readAccessReviews>> | null = null;
  try {
    listing = await readAccessReviews(context.token);
  } catch (error) {
    if (!(error instanceof HqApiUnavailableError || error instanceof HqApiRequestError))
      throw error;
  }
  const open = listing?.reviews.find((review) => !review.completed_at);
  let current: AccessReview | null = null;
  if (open) {
    try {
      current = (await readAccessReview(context.token, open.review_id)).review;
    } catch (error) {
      if (!(error instanceof HqApiUnavailableError || error instanceof HqApiRequestError))
        throw error;
    }
  }
  const canWrite = hasCapability(context, "hr:write");
  const past = (listing?.reviews ?? []).filter((review) => review.completed_at);
  const untilLabel = context.me.sudo_until
    ? (formatAbsolute(context.me.sudo_until).split(", ")[1] ?? null)
    : null;

  return (
    <>
      <PageHeader
        eyebrow="Team"
        title="Access review"
        description="Once a quarter, every live grant in the register is kept or revoked, each with what the decision rests on."
      />
      {listing === null ? (
        <Callout tone="danger" role="alert">
          Reviews could not be read just now.
        </Callout>
      ) : current ? (
        <>
          <Card
            title={`${current.quarter} review`}
            titleAs="h2"
            description={`Started ${formatDate(current.started_at)}. ${current.decided} of ${current.total} decided, ${current.revoked} revoked.`}
          >
            <Meter
              value={current.decided}
              limit={current.total}
              label={`${current.decided} of ${current.total} decided`}
            />
          </Card>
          {current.findings.length > 0 && (
            <Callout tone="attention" role="status">
              <strong>
                {current.findings.length} {current.findings.length === 1 ? "finding" : "findings"}{" "}
                to look at first.
              </strong>
              <ul className="review-findings">
                {current.findings.map((finding, index) => (
                  <li key={`${finding.kind}-${finding.access_id}-${index}`}>
                    <span className={`tag tag--${finding.kind}`}>
                      {FINDING_WORDS[finding.kind] ?? finding.kind}
                    </span>{" "}
                    {finding.staff_name || "A colleague"} · {finding.system}: {finding.detail}.
                  </li>
                ))}
              </ul>
            </Callout>
          )}
          <DataTable
            caption="Grants under review"
            scroll={false}
            columns={[
              { key: "who", label: "Person" },
              { key: "system", label: "System" },
              { key: "since", label: "Since" },
              { key: "decision", label: "Decision" },
            ]}
          >
            {current.items.map((item) => (
              <tr key={item.access_id}>
                <td>
                  <Link className="table-title" href={`/team/${item.access.staff_id}`}>
                    {item.staff_name || "A colleague"}
                  </Link>
                </td>
                <td>
                  {item.access.system}
                  <span className="table-sub">{item.access.level || "Access"}</span>
                  {item.flags.length > 0 && (
                    <span className="review-flags">
                      {item.flags.map((flag) => (
                        <span key={flag} className={`tag tag--${flag.split(":")[0]}`}>
                          {flagLabel(flag)}
                        </span>
                      ))}
                    </span>
                  )}
                </td>
                <td>{formatDate(item.access.granted_on)}</td>
                <td>
                  {item.decision === "pending" ? (
                    canWrite ? (
                      <ReviewItemForm
                        action={decideReviewItemAction}
                        reviewId={current.review_id}
                        accessId={item.access_id}
                        label={`${item.staff_name}: ${item.access.system}`}
                      />
                    ) : (
                      <span className="table-sub">Pending</span>
                    )
                  ) : (
                    <>
                      <StatusPill
                        value={item.decision}
                        label={item.decision === "keep" ? "Kept" : "Revoked"}
                        tone={item.decision === "keep" ? "live" : "danger"}
                      />
                      <span className="table-sub">{item.evidence}</span>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </DataTable>
          {canWrite && (
            <Card title="Finish" titleAs="h3" className="review-finish">
              <CompleteReviewForm
                action={completeReviewAction}
                reviewId={current.review_id}
                ready={current.decided === current.total}
              />
            </Card>
          )}
        </>
      ) : (
        <Card title={`No review open for ${listing.quarter}`} titleAs="h2">
          {canWrite ? (
            <>
              <SudoGate
                action={confirmSudoAction}
                fresh={context.me.sudo_fresh}
                untilLabel={untilLabel}
                returnPath="/access-review"
                purpose="Starting a review needs a fresh code from your authenticator app."
              />
              <StartReviewForm action={startReviewAction} disabled={!context.me.sudo_fresh} />
            </>
          ) : (
            <p className="side-quiet">An HQ admin starts each quarter&apos;s review.</p>
          )}
        </Card>
      )}
      {past.length > 0 && (
        <section className="record-section report-section" aria-labelledby="reviews-past">
          <h2 className="record-section__title" id="reviews-past">
            Completed reviews
          </h2>
          <ul className="side-list">
            {past.map((review) => (
              <li key={review.review_id} className="renewal">
                <span>
                  <strong>{review.quarter}</strong> · completed {formatDate(review.completed_at)}
                </span>
                <span className="side-quiet">
                  {review.total} checked · {review.revoked} revoked
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
