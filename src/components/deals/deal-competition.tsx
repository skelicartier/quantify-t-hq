import Link from "next/link";

import {
  dealCompetitorAction,
  recordInterviewAction,
} from "@/app/(portal)/deals/inspection-actions";
import { AddDealCompetitorForm, InterviewForm } from "@/components/deals/inspection-forms";
import { ActForm } from "@/components/ui/act-form";
import { Card } from "@/components/ui/card";
import { RecordSection } from "@/components/ui/record-shell";
import { StatusPill } from "@/components/ui/status-pill";
import type { DealDetail } from "@/lib/api/deals";
import { formatDate } from "@/lib/format";

/**
 * Who else is in this deal and what each has going for them here, with the battlecard's
 * quick dismiss beside them; and, once it closes, what the buyer said about why.
 */
export function DealCompetition({
  detail,
  canDeal,
  open,
}: {
  detail: DealDetail;
  canDeal: boolean;
  open: boolean;
}) {
  const dealId = detail.deal.deal_id;
  const onDeal = new Set(detail.competitors.map((row) => row.competitor_id));
  const options = detail.competitor_options.filter((option) => !onDeal.has(option.id));
  const closed = detail.deal.status === "won" || detail.deal.status === "lost";
  return (
    <>
      <RecordSection id="deal-competitors" title="Competitors">
        {detail.competitors.length === 0 ? (
          <p className="muted">No competitor recorded on this deal.</p>
        ) : (
          <ul className="competitor-list">
            {detail.competitors.map((row) => (
              <li key={row.competitor_id} className="competitor-row">
                <div className="competitor-row__head">
                  <Link href={`/deals/competitors/${row.competitor_id}`}>{row.name}</Link>
                  <StatusPill
                    value={row.state}
                    label={row.state === "active" ? "In the running" : "Dropped out"}
                    tone={row.state === "active" ? "attention" : "neutral"}
                  />
                  {row.card_stale && <span className="quiet">Card stale</span>}
                </div>
                <ul className="match-list">
                  <li className="match-list__row">
                    <span className="match-list__what">Their strengths here</span>
                    <span>{row.strengths || "—"}</span>
                  </li>
                  <li className="match-list__row">
                    <span className="match-list__what">Their weaknesses here</span>
                    <span>{row.weaknesses || "—"}</span>
                  </li>
                  <li className="match-list__row">
                    <span className="match-list__what">The quick dismiss</span>
                    <span>{row.quick_dismiss || "—"}</span>
                  </li>
                </ul>
                {canDeal && (
                  <div className="inline-actions">
                    <ActForm
                      action={dealCompetitorAction}
                      hidden={{ deal_id: dealId, competitor_id: row.competitor_id }}
                      act={row.state === "active" ? "eliminate" : "restore"}
                      label={row.state === "active" ? "They dropped out" : "Back in the running"}
                    />
                    <ActForm
                      action={dealCompetitorAction}
                      hidden={{ deal_id: dealId, competitor_id: row.competitor_id }}
                      act="remove"
                      label="Remove from the deal"
                    />
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
        {canDeal && open && options.length > 0 && (
          <Card title="Add a competitor" titleAs="h3">
            <AddDealCompetitorForm
              action={dealCompetitorAction}
              dealId={dealId}
              options={options}
            />
          </Card>
        )}
        {canDeal && detail.competitor_options.length === 0 && (
          <p className="muted">
            No competitors on the list yet. <Link href="/deals/competitors">Add one</Link>.
          </p>
        )}
      </RecordSection>

      <RecordSection id="interviews" title="Why they decided">
        {!closed ? (
          <p className="muted">
            Once the deal is won or lost, record what the buyer says about why.
          </p>
        ) : (
          <>
            {detail.interviews.length === 0 ? (
              <p className="muted">Nobody has asked the buyer yet.</p>
            ) : (
              detail.interviews.map((interview) => (
                <Card
                  key={interview.id}
                  title={interview.buyer_reason}
                  titleAs="h3"
                  description={`${interview.interviewee_name || "The buyer"}${interview.interviewee_title ? `, ${interview.interviewee_title}` : ""} · ${formatDate(interview.held_on, "—")} · asked by ${interview.interviewer || "HQ"}. Seller's reason: ${interview.seller_reason}.`}
                >
                  {interview.drivers.length > 0 && (
                    <ul className="match-list">
                      {interview.drivers.map((item) => (
                        <li key={item.driver} className="match-list__row">
                          <span className="match-list__what">{item.label}</span>
                          <span>{item.effect === "positive" ? "For us" : "Against us"}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                  {interview.quotes && <p className="prewrap">{interview.quotes}</p>}
                  {interview.summary && <p className="prewrap">{interview.summary}</p>}
                </Card>
              ))
            )}
            {canDeal && (
              <Card title="Record an interview" titleAs="h3">
                <InterviewForm
                  action={recordInterviewAction}
                  dealId={dealId}
                  drivers={detail.drivers}
                />
              </Card>
            )}
          </>
        )}
      </RecordSection>
    </>
  );
}
