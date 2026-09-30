import Link from "next/link";

import { createInvestorUpdateAction } from "@/app/(portal)/finance/actions";
import { FinanceTabs } from "@/components/finance/finance-parts";
import { PageHeader } from "@/components/shell/page-header";
import { ActForm } from "@/components/ui/act-form";
import { Callout } from "@/components/ui/callout";
import { Section } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { Field, Input } from "@/components/ui/field";
import { StatusPill } from "@/components/ui/status-pill";
import { hasCapability, requireStaff } from "@/lib/access/core";
import { HqApiRequestError, HqApiUnavailableError } from "@/lib/api/core";
import { readInvestorUpdates, type InvestorUpdates } from "@/lib/api/finance";
import { formatAbsolute } from "@/lib/format";

export const metadata = { title: "Investor updates" };
export const dynamic = "force-dynamic";

const COLUMNS = [
  { key: "period", label: "Month" },
  { key: "title", label: "Update" },
  { key: "state", label: "State" },
  { key: "figures", label: "Figures read" },
  { key: "final", label: "Finalised" },
];

/**
 * A monthly update drafted over figures frozen when it is started — so the words and the
 * numbers they describe cannot drift apart before it goes out.
 */
export default async function InvestorUpdatesPage() {
  const context = await requireStaff("/finance/updates");
  if (!hasCapability(context, "revenue:write")) {
    return (
      <>
        <PageHeader eyebrow="Business" title="Investor updates" />
        <Callout tone="neutral">Investor updates are kept by Owners and Admins.</Callout>
      </>
    );
  }
  let list: InvestorUpdates | null = null;
  try {
    list = await readInvestorUpdates(context.token);
  } catch (error) {
    if (!(error instanceof HqApiUnavailableError || error instanceof HqApiRequestError))
      throw error;
  }
  return (
    <>
      <PageHeader
        eyebrow="Business"
        title="Investor updates"
        description="Start one for a month: its figures — MRR and what moved it, customers, pipeline, cash and runway, headcount — are read and frozen then. Write the highlights, lowlights and asks over them; finalise it when it goes out."
        actions={<FinanceTabs current="/finance/updates" />}
      />
      {list === null ? (
        <Callout tone="danger" role="alert">
          The updates could not be read just now.
        </Callout>
      ) : (
        <div className="page-content">
          <Section id="updates" title="Updates">
            <DataTable
              caption="Investor updates, newest month first"
              columns={COLUMNS}
              isEmpty={list.updates.length === 0}
              empty={<p className="muted">None yet.</p>}
              columnMenu={false}
            >
              {list.updates.map((update) => (
                <tr key={update.update_id}>
                  <td>{update.period}</td>
                  <td>
                    <Link href={`/finance/updates/${update.update_id}`}>{update.title}</Link>
                  </td>
                  <td>
                    <StatusPill
                      value={update.status}
                      label={update.status === "final" ? "Final" : "Draft"}
                      tone={update.status === "final" ? "live" : "attention"}
                    />
                  </td>
                  <td>{formatAbsolute(update.snapshot_at, "—")}</td>
                  <td>
                    {update.finalised_at
                      ? `${update.finalised_by_name}, ${formatAbsolute(update.finalised_at)}`
                      : "—"}
                  </td>
                </tr>
              ))}
            </DataTable>
            <details className="disclosure">
              <summary>Start an update</summary>
              <ActForm
                action={createInvestorUpdateAction}
                hidden={{}}
                act="create"
                label="Start it"
                primary
                tight={false}
              >
                <Field
                  id="update-period"
                  label="Month"
                  hint="YYYY-MM. Its figures are read now and frozen."
                >
                  <Input
                    id="update-period"
                    name="period"
                    maxLength={7}
                    defaultValue={list.suggested_period}
                  />
                </Field>
              </ActForm>
            </details>
          </Section>
        </div>
      )}
    </>
  );
}
