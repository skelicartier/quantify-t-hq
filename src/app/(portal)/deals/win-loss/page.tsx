import Link from "next/link";

import { PipelineTabs } from "@/components/deals/pipeline-tabs";
import { PageHeader } from "@/components/shell/page-header";
import { Callout } from "@/components/ui/callout";
import { Card, Section } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { Stat, StatGrid } from "@/components/ui/stat";
import { StatusPill } from "@/components/ui/status-pill";
import { requireStaff } from "@/lib/access/core";
import { HqApiRequestError, HqApiUnavailableError } from "@/lib/api/core";
import { readWinLoss, type WinLoss } from "@/lib/api/inspection";
import { formatDate } from "@/lib/format";

export const metadata = { title: "Win/loss" };
export const dynamic = "force-dynamic";

function Tally({ rows, empty }: { rows: WinLoss["tally"]["won"]; empty: string }) {
  if (rows.length === 0) return <p className="muted">{empty}</p>;
  return (
    <ul className="match-list">
      {rows.map((row) => (
        <li key={row.driver} className="match-list__row">
          <span className="match-list__what">{row.label}</span>
          <span>
            {row.positive > 0 && `${row.positive} for us`}
            {row.positive > 0 && row.negative > 0 && " · "}
            {row.negative > 0 && `${row.negative} against`}
          </span>
        </li>
      ))}
    </ul>
  );
}

/**
 * Why deals were won and lost, from the buyer: each interview's reason in their words
 * beside the reason the seller gave, what weighed for and against us, and the closed
 * deals nobody has asked yet.
 */
export default async function WinLossPage() {
  const context = await requireStaff("/deals/win-loss");
  let page: WinLoss | null = null;
  try {
    page = await readWinLoss(context.token);
  } catch (error) {
    if (!(error instanceof HqApiUnavailableError || error instanceof HqApiRequestError))
      throw error;
  }

  return (
    <>
      <PageHeader
        eyebrow="CRM"
        title="Win/loss"
        description="The buyer's reason beside the seller's. Record an interview on the closed deal's page."
        actions={<PipelineTabs current="/deals/win-loss" />}
      />
      {page === null ? (
        <Callout tone="danger" role="alert">
          The interviews could not be read just now.
        </Callout>
      ) : (
        <div className="page-content">
          <StatGrid columns={3} label="Interviews">
            <Stat label="Interviews" value={page.counts.interviews} />
            <Stat label="On won deals" value={page.counts.won} />
            <Stat label="On lost deals" value={page.counts.lost} />
          </StatGrid>

          <Section id="interviews" title="What buyers said">
            <DataTable
              caption="Interviews, newest first"
              columns={[
                { key: "deal", label: "Deal" },
                { key: "outcome", label: "Outcome" },
                { key: "seller", label: "Seller's reason" },
                { key: "buyer", label: "Buyer's reason" },
                { key: "who", label: "Who said it" },
                { key: "when", label: "Held" },
              ]}
              isEmpty={page.interviews.length === 0}
              empty={<p className="muted">No interviews recorded yet.</p>}
            >
              {page.interviews.map((row) => (
                <tr key={row.id}>
                  <td>
                    <Link href={`/deals/${row.deal_id}`}>{row.deal_name}</Link>
                    <span className="quiet"> · {row.company}</span>
                  </td>
                  <td>
                    <StatusPill
                      value={row.outcome}
                      label={row.outcome === "won" ? "Won" : "Lost"}
                      tone={row.outcome === "won" ? "live" : "danger"}
                    />
                  </td>
                  <td>
                    {row.seller_reason}
                    {row.seller_detail && <span className="quiet"> · {row.seller_detail}</span>}
                  </td>
                  <td>{row.buyer_reason}</td>
                  <td>
                    {row.interviewee_name || "—"}
                    {row.interviewee_title && (
                      <span className="quiet"> · {row.interviewee_title}</span>
                    )}
                  </td>
                  <td>{formatDate(row.held_on, "—")}</td>
                </tr>
              ))}
            </DataTable>
          </Section>

          <div className="form-grid">
            <Card
              title="Why we won"
              titleAs="h3"
              description="How often each came up in won deals."
            >
              <Tally rows={page.tally.won} empty="No interviews on won deals yet." />
            </Card>
            <Card
              title="Why we lost"
              titleAs="h3"
              description="How often each came up in lost deals."
            >
              <Tally rows={page.tally.lost} empty="No interviews on lost deals yet." />
            </Card>
          </div>

          <Section id="ask" title="Closed in the last six months, not yet asked">
            <DataTable
              caption="Closed deals without an interview"
              columns={[
                { key: "deal", label: "Deal" },
                { key: "outcome", label: "Outcome" },
                { key: "closed", label: "Closed" },
              ]}
              isEmpty={page.not_interviewed.length === 0}
              empty={<p className="muted">Every recent closed deal has been asked.</p>}
            >
              {page.not_interviewed.map((row) => (
                <tr key={row.deal_id}>
                  <td>
                    <Link href={`/deals/${row.deal_id}#interviews`}>{row.name}</Link>
                    <span className="quiet"> · {row.company}</span>
                  </td>
                  <td>{row.outcome === "won" ? "Won" : "Lost"}</td>
                  <td>{formatDate(row.closed_at, "—")}</td>
                </tr>
              ))}
            </DataTable>
          </Section>
        </div>
      )}
    </>
  );
}
