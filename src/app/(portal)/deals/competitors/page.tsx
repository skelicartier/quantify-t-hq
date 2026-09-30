import Link from "next/link";

import { createCompetitorAction } from "@/app/(portal)/deals/inspection-actions";
import { CompetitorForm } from "@/components/deals/inspection-forms";
import { PipelineTabs } from "@/components/deals/pipeline-tabs";
import { PageHeader } from "@/components/shell/page-header";
import { Callout } from "@/components/ui/callout";
import { Section } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { Popover } from "@/components/ui/popover";
import { StatusPill } from "@/components/ui/status-pill";
import { hasCapability, requireStaff } from "@/lib/access/core";
import { HqApiRequestError, HqApiUnavailableError } from "@/lib/api/core";
import { readCompetitors, type Competitor } from "@/lib/api/inspection";
import { formatDate } from "@/lib/format";

export const metadata = { title: "Competitors" };
export const dynamic = "force-dynamic";

const COLUMNS = [
  { key: "name", label: "Competitor" },
  { key: "open", label: "On open deals", align: "end" as const },
  { key: "record", label: "Against them" },
  { key: "dismiss", label: "The quick dismiss" },
  { key: "reviewed", label: "Card reviewed" },
];

/**
 * Who we meet in deals: how often, how we have done against each (as counts until there
 * are enough deals to mean a percentage), and a battlecard that goes stale after 90 days
 * nobody has read it.
 */
export default async function CompetitorsPage() {
  const context = await requireStaff("/deals/competitors");
  let competitors: Competitor[] | null = null;
  let staleAfter = 90;
  try {
    const page = await readCompetitors(context.token);
    competitors = page.competitors;
    staleAfter = page.stale_after_days;
  } catch (error) {
    if (!(error instanceof HqApiUnavailableError || error instanceof HqApiRequestError))
      throw error;
  }
  const canWrite = hasCapability(context, "deals:write");

  return (
    <>
      <PageHeader
        eyebrow="CRM"
        title="Competitors"
        description={`Who we meet in deals and how it went, with a battlecard each. A card nobody has reviewed in ${staleAfter} days is marked stale.`}
        actions={
          <>
            <PipelineTabs current="/deals/competitors" />
            {canWrite && (
              <Popover label="Add a competitor" variant="primary" width="wide">
                <CompetitorForm action={createCompetitorAction} submitLabel="Add the card" />
              </Popover>
            )}
          </>
        }
      />
      {competitors === null ? (
        <Callout tone="danger" role="alert">
          The competitors could not be read just now.
        </Callout>
      ) : (
        <div className="page-content">
          <Section id="competitors" title="The field">
            <DataTable
              caption="Competitors, most often met first"
              columns={COLUMNS}
              isEmpty={competitors.length === 0}
              empty={<p className="muted">No competitors recorded yet.</p>}
            >
              {competitors.map((row) => (
                <tr key={row.id}>
                  <td>
                    <Link href={`/deals/competitors/${row.id}`}>{row.name}</Link>
                  </td>
                  <td className="data-table__num">{row.record.open}</td>
                  <td>{row.record.text}</td>
                  <td>{row.quick_dismiss || "—"}</td>
                  <td>
                    {row.stale ? (
                      <StatusPill value="stale" label="Stale" tone="attention" />
                    ) : (
                      formatDate(row.reviewed_at, "—")
                    )}
                  </td>
                </tr>
              ))}
            </DataTable>
          </Section>
        </div>
      )}
    </>
  );
}
