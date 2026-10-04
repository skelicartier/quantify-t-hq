import Link from "next/link";

import { restoreRecordAction } from "@/app/(portal)/_actions/share";
import { PageHeader } from "@/components/shell/page-header";
import { Callout } from "@/components/ui/callout";
import { DataTable } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { RowAction } from "@/components/ui/row-action";
import { Timestamp } from "@/components/ui/timestamp";
import { SegmentedLinks } from "@/components/ui/toolbar";
import { hasCapability, requireStaff } from "@/lib/access/core";
import { readArchive, type Archive } from "@/lib/api/archive";
import { HqApiRequestError, HqApiUnavailableError } from "@/lib/api/core";
import { requestNow } from "@/lib/request-time";
import { firstSearchValue } from "@/lib/search-params";

export const metadata = { title: "Archived" };
export const dynamic = "force-dynamic";

const COMPANY_COLUMNS = [
  { key: "company", label: "Company" },
  { key: "when", label: "Archived" },
  { key: "who", label: "By" },
  { key: "why", label: "Why" },
  { key: "act", label: "", align: "end" as const },
];
const PEOPLE_COLUMNS = [
  { key: "person", label: "Person" },
  { key: "when", label: "Archived" },
  { key: "who", label: "By" },
  { key: "why", label: "Why" },
  { key: "act", label: "", align: "end" as const },
];

type ArchivePageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/**
 * What was taken off the lists: every archived company and person, kept whole, with who
 * archived it, when and why — and Put back, or the reason it cannot come back.
 */
export default async function ArchivePage({ searchParams }: ArchivePageProps) {
  const context = await requireStaff("/archive");
  const parameters = await searchParams;
  const tab = firstSearchValue(parameters.tab) === "people" ? "people" : "companies";
  let archive: Archive | null = null;
  try {
    archive = await readArchive(context.token);
  } catch (error) {
    if (!(error instanceof HqApiUnavailableError || error instanceof HqApiRequestError))
      throw error;
  }
  const now = requestNow();
  const canWrite = hasCapability(context, "crm:write");
  const restore = (
    kind: "companies" | "people",
    id: string,
    canRestore: boolean,
    whyNot: string,
  ) =>
    canWrite && canRestore ? (
      <RowAction
        action={restoreRecordAction}
        fields={{ kind, record_id: id }}
        buttons={[
          { label: "Put back", className: "btn btn--small", pendingLabel: "Putting back…" },
        ]}
      />
    ) : (
      <span className="table-sub">{whyNot ? `Stays: ${whyNot}` : ""}</span>
    );

  return (
    <>
      <PageHeader
        eyebrow="CRM"
        title="Archived"
        description="Companies and people taken off the lists. Nothing here is deleted: each keeps everything linked to it and comes back whole."
        actions={
          <SegmentedLinks
            label="Archived records"
            items={[
              {
                href: "/archive",
                label: `Companies${archive ? ` · ${archive.companies.length}` : ""}`,
                current: tab === "companies",
              },
              {
                href: "/archive?tab=people",
                label: `People${archive ? ` · ${archive.people.length}` : ""}`,
                current: tab === "people",
              },
            ]}
          />
        }
      />
      {archive === null ? (
        <Callout tone="danger" role="alert">
          The archive could not be read just now. This is a read failure, not an empty archive.
        </Callout>
      ) : (
        <>
          {tab === "companies" ? (
            <DataTable
              caption="Archived companies"
              columns={COMPANY_COLUMNS}
              isEmpty={archive.companies.length === 0}
              empty={
                <EmptyState
                  title="No company is archived"
                  description="Archive a company from its page when it should leave the lists."
                />
              }
            >
              {archive.companies.map((row) => (
                <tr key={row.company_id}>
                  <td>
                    <Link className="table-title" href={`/companies/${row.company_id}`}>
                      {row.name || "A company"}
                    </Link>
                    <span className="table-sub">
                      {row.merged ? "Merged into another company" : row.domain || "No domain"}
                    </span>
                  </td>
                  <td>
                    <Timestamp value={row.archived_at} now={now} mode="relative" />
                  </td>
                  <td>{row.by || <span className="table-sub">—</span>}</td>
                  <td>{row.reason || <span className="table-sub">—</span>}</td>
                  <td className="data-table__num">
                    {restore("companies", row.company_id, row.can_restore, row.why_not)}
                  </td>
                </tr>
              ))}
            </DataTable>
          ) : (
            <DataTable
              caption="Archived people"
              columns={PEOPLE_COLUMNS}
              isEmpty={archive.people.length === 0}
              empty={
                <EmptyState
                  title="Nobody is archived"
                  description="Archive a person from their page when they should leave the lists."
                />
              }
            >
              {archive.people.map((row) => (
                <tr key={row.person_id}>
                  <td>
                    <Link className="table-title" href={`/people/${row.person_id}`}>
                      {row.name || row.email || "A person"}
                    </Link>
                    <span className="table-sub">
                      {row.merged
                        ? "Merged into another person"
                        : [row.email, row.company].filter(Boolean).join(" · ") || "—"}
                    </span>
                  </td>
                  <td>
                    <Timestamp value={row.archived_at} now={now} mode="relative" />
                  </td>
                  <td>{row.by || <span className="table-sub">—</span>}</td>
                  <td>{row.reason || <span className="table-sub">—</span>}</td>
                  <td className="data-table__num">
                    {restore("people", row.person_id, row.can_restore, row.why_not)}
                  </td>
                </tr>
              ))}
            </DataTable>
          )}
        </>
      )}
    </>
  );
}
