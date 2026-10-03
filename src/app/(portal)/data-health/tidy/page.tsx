import Link from "next/link";

import { applyStandardiseAction } from "@/app/(portal)/leads/actions";
import { PageHeader } from "@/components/shell/page-header";
import { ActForm } from "@/components/ui/act-form";
import { Callout } from "@/components/ui/callout";
import { DataTable } from "@/components/ui/data-table";
import { RecordSection } from "@/components/ui/record-shell";
import { Stat, StatGrid } from "@/components/ui/stat";
import { hasCapability, requireStaff } from "@/lib/access/core";
import { HqApiRequestError, HqApiUnavailableError } from "@/lib/api/core";
import { readStandardisePreview, type StandardisePreview } from "@/lib/api/data-quality";
import { TIDY_UPS } from "@/lib/crm/data-health";
import { formatNumber, pluralize } from "@/lib/format";
import { firstSearchValue } from "@/lib/search-params";

export const metadata = { title: "Put right" };
export const dynamic = "force-dynamic";

const BASE = "/data-health/tidy";

type TidyPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function TidyPage({ searchParams }: TidyPageProps) {
  const context = await requireStaff(BASE);
  const parameters = await searchParams;
  const kind = firstSearchValue(parameters.kind) ?? "";
  const tidy = TIDY_UPS[kind];
  let preview: StandardisePreview | null = null;
  if (tidy) {
    try {
      preview = await readStandardisePreview(context.token, kind);
    } catch (error) {
      if (!(error instanceof HqApiUnavailableError || error instanceof HqApiRequestError))
        throw error;
    }
  }
  const canWrite = hasCapability(context, "crm:write");
  const leads = preview ? new Set(preview.changes.map((change) => change.lead_id)).size : 0;

  return (
    <>
      <PageHeader
        eyebrow="Data health"
        title={tidy ? tidy.title : "Put right"}
        description="Every change the tidy-up would make, before it is made. Each lead is judged again when it is reached, so a record someone edits in the meantime is changed only if it still needs it; the change is written to each lead's history and to the audit log."
      />
      <div className="page-content">
        {!tidy ? (
          <Callout tone="attention" role="alert">
            There is no tidy-up of that name. <Link href="/data-health">Back to data health</Link>
          </Callout>
        ) : preview === null ? (
          <Callout tone="danger" role="alert">
            The preview could not be read just now. Nothing has changed.
          </Callout>
        ) : preview.count === 0 ? (
          <Callout tone="neutral">
            Nothing to put right: no lead has {kind === "name_case" ? "a name" : "a country"} that
            needs it. <Link href="/data-health">Back to data health</Link>
          </Callout>
        ) : (
          <>
            <StatGrid columns={2} label="What the tidy-up changes">
              <Stat label="Leads it changes" value={formatNumber(preview.count)} />
              <Stat
                label="How it runs"
                value={preview.count > preview.inline_limit ? "In the background" : "At once"}
                text
                hint={
                  preview.count > preview.inline_limit
                    ? `more than ${formatNumber(preview.inline_limit)} leads; Prospects shows how far it has got`
                    : undefined
                }
              />
            </StatGrid>
            <RecordSection id="tidy-changes" title="The changes">
              {leads < preview.count && (
                <p className="page-note">
                  The first {pluralize(leads, "lead")}&rsquo;s changes are listed; all{" "}
                  {formatNumber(preview.count)} are changed.
                </p>
              )}
              <DataTable
                caption="The changes the tidy-up makes"
                columns={[
                  { key: "lead", label: "Lead" },
                  { key: "field", label: "Field" },
                  { key: "from", label: "Now" },
                  { key: "to", label: "After" },
                ]}
                columnMenu={false}
                scroll={false}
              >
                {preview.changes.map((change) => (
                  <tr key={`${change.lead_id}-${change.field}`}>
                    <td>
                      <Link className="table-title" href={`/leads/${change.lead_id}`}>
                        {change.label || "Unnamed"}
                      </Link>
                    </td>
                    <td>{tidy.field[change.field] ?? change.field}</td>
                    <td>{change.from}</td>
                    <td>{change.to}</td>
                  </tr>
                ))}
              </DataTable>
            </RecordSection>
            {canWrite ? (
              <ActForm
                action={applyStandardiseAction}
                hidden={{ kind }}
                act="apply"
                label={`Change ${pluralize(preview.count, "lead")}`}
                primary
              />
            ) : (
              <p className="page-note">Your role reads the CRM without writing to it.</p>
            )}
          </>
        )}
      </div>
    </>
  );
}
