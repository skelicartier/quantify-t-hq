import Link from "next/link";
import { notFound } from "next/navigation";

import {
  reviewCompetitorAction,
  updateCompetitorAction,
} from "@/app/(portal)/deals/inspection-actions";
import { CompetitorForm } from "@/components/deals/inspection-forms";
import { ActForm } from "@/components/ui/act-form";
import { PageHeader } from "@/components/shell/page-header";
import { Callout } from "@/components/ui/callout";
import { Card } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import {
  Properties,
  Property,
  RecordGrid,
  RecordHeader,
  RecordSection,
} from "@/components/ui/record-shell";
import { StatusPill } from "@/components/ui/status-pill";
import { hasCapability, requireStaff } from "@/lib/access/core";
import { HqApiRequestError, HqApiUnavailableError } from "@/lib/api/core";
import { readCompetitor, type CompetitorDetail } from "@/lib/api/inspection";
import { formatDate } from "@/lib/format";

export const metadata = { title: "Competitor" };
export const dynamic = "force-dynamic";

const STATUS: Record<string, { label: string; tone: "live" | "danger" | "attention" | "neutral" }> =
  {
    open: { label: "Open", tone: "attention" },
    won: { label: "Won", tone: "live" },
    lost: { label: "Lost", tone: "danger" },
    unqualified: { label: "Unqualified", tone: "neutral" },
  };

type Params = Promise<{ competitorId: string }>;

/** A battlecard and the deals behind its record. */
export default async function CompetitorPage({ params }: { params: Params }) {
  const { competitorId } = await params;
  const context = await requireStaff(`/deals/competitors/${competitorId}`);
  let detail: CompetitorDetail | null = null;
  try {
    detail = await readCompetitor(context.token, competitorId);
  } catch (error) {
    if (error instanceof HqApiRequestError && error.status === 404) notFound();
    if (!(error instanceof HqApiUnavailableError || error instanceof HqApiRequestError))
      throw error;
  }
  if (detail === null) {
    return (
      <>
        <PageHeader eyebrow="Competitors" title="Competitor" />
        <Callout tone="danger" role="alert">
          This competitor could not be read just now.
        </Callout>
      </>
    );
  }
  const { competitor: card } = detail;
  const canWrite = hasCapability(context, "deals:write");

  return (
    <>
      <RecordHeader
        crumbs={[{ href: "/deals/competitors", label: "Competitors" }]}
        title={card.name}
        status={
          card.stale ? <StatusPill value="stale" label="Card stale" tone="attention" /> : undefined
        }
        readouts={[
          { label: "Against them", value: card.record.text },
          { label: "On open deals", value: card.record.open },
          { label: "Reviewed", value: formatDate(card.reviewed_at, "Never") },
        ]}
      />
      {card.stale && (
        <Callout tone="attention" compact>
          Nobody has reviewed this card in 90 days. Read it; if it is still true, say so.
        </Callout>
      )}
      <RecordGrid
        side={
          <Properties title="The card">
            <Property label="Website">{card.website || "—"}</Property>
            <Property label="Reviewed by">{card.reviewed_by || "—"}</Property>
            <Property label="Won">{card.record.won}</Property>
            <Property label="Closed against">{card.record.closed}</Property>
          </Properties>
        }
      >
        <RecordSection id="card" title="Battlecard">
          {card.summary && <p className="prewrap">{card.summary}</p>}
          <div className="form-grid">
            <Card title="The quick dismiss" titleAs="h3">
              <p className="prewrap">{card.quick_dismiss || "Not written yet."}</p>
            </Card>
            <Card title="Why we win" titleAs="h3">
              <p className="prewrap">{card.why_we_win || "Not written yet."}</p>
            </Card>
          </div>
          <Card title="Why we lose" titleAs="h3">
            <p className="prewrap">{card.why_we_lose || "Not written yet."}</p>
          </Card>
          <Card title="Objections and answers" titleAs="h3">
            {card.objections.length === 0 ? (
              <p className="muted">None recorded.</p>
            ) : (
              <dl className="objection-answers">
                {card.objections.map((row, index) => (
                  <div key={index} className="objection-answers__row">
                    <dt>{row.objection}</dt>
                    <dd>{row.response || "—"}</dd>
                  </div>
                ))}
              </dl>
            )}
          </Card>
          {canWrite && (
            <ActForm
              action={reviewCompetitorAction}
              hidden={{ competitor_id: card.id }}
              act="review"
              label="Still true: mark reviewed"
            />
          )}
        </RecordSection>

        <RecordSection id="deals" title="Deals against them">
          <DataTable
            caption="Deals this competitor was on"
            columns={[
              { key: "deal", label: "Deal" },
              { key: "status", label: "Outcome" },
              { key: "stage", label: "Stage" },
              { key: "strengths", label: "Their strengths there" },
              { key: "weaknesses", label: "Their weaknesses there" },
            ]}
            isEmpty={detail.deals.length === 0}
            empty={<p className="muted">Not on any deal yet.</p>}
          >
            {detail.deals.map((line) => (
              <tr key={line.deal_id}>
                <td>
                  <Link href={`/deals/${line.deal_id}`}>{line.name}</Link>
                  <span className="quiet"> · {line.company}</span>
                </td>
                <td>
                  <StatusPill
                    value={line.status}
                    label={`${STATUS[line.status]?.label ?? line.status}${line.state === "eliminated" ? " · they dropped out" : ""}`}
                    tone={STATUS[line.status]?.tone ?? "neutral"}
                  />
                </td>
                <td>{line.stage}</td>
                <td>{line.strengths || "—"}</td>
                <td>{line.weaknesses || line.loss_detail || "—"}</td>
              </tr>
            ))}
          </DataTable>
        </RecordSection>

        {canWrite && (
          <RecordSection id="edit" title="Edit the card">
            <CompetitorForm
              action={updateCompetitorAction}
              competitorId={card.id}
              initial={card}
              submitLabel="Save the card"
            />
          </RecordSection>
        )}
      </RecordGrid>
    </>
  );
}
