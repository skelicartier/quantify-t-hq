import {
  importCompaniesAction,
  rollbackCompaniesImportAction,
} from "@/app/(portal)/companies/actions";
import { RecordImport, type RecordImportField } from "@/components/crm/record-import";
import { RecordImportHistory } from "@/components/crm/record-import-history";
import { PageHeader } from "@/components/shell/page-header";
import { Callout } from "@/components/ui/callout";
import { hasCapability, requireStaff } from "@/lib/access/core";
import { HqApiRequestError, HqApiUnavailableError } from "@/lib/api/core";
import { readCompanyImports, type RecordImports } from "@/lib/api/crm";
import { readFields, type FieldsSettings } from "@/lib/api/fields";
import { directoryOrNull } from "@/lib/api/staff";
import { formatAbsolute } from "@/lib/format";
import { requestNow } from "@/lib/request-time";

export const metadata = { title: "Import companies" };
export const dynamic = "force-dynamic";

const BASE = "/companies/import";

/** Our columns, and the headers a spreadsheet (or an HQ export) is likely to use. */
const FIELDS: readonly RecordImportField[] = [
  { key: "id", label: "ID from an HQ export", aliases: ["company id", "record id"] },
  {
    key: "name",
    label: "Name",
    aliases: ["company", "company name", "firm", "organisation", "organization", "account"],
  },
  { key: "domain", label: "Web domain", aliases: ["domain", "website", "web", "url", "site"] },
  { key: "lifecycle", label: "Lifecycle", aliases: ["stage", "status"] },
  { key: "firm_type", label: "Firm type", aliases: ["type", "segment", "category"] },
  { key: "team_size_band", label: "Team size", aliases: ["size", "team size", "headcount"] },
  { key: "country", label: "Country", aliases: ["location", "hq country"] },
  {
    key: "owner",
    label: "Owner's email",
    aliases: ["owner", "owner email", "account owner", "assigned to"],
  },
  { key: "source", label: "Source", aliases: ["lead source", "channel"] },
  { key: "notes", label: "Notes", aliases: ["comments", "note", "description"] },
];

export default async function ImportCompaniesPage() {
  const context = await requireStaff(BASE);
  const now = requestNow();
  const canWrite = hasCapability(context, "crm:write");
  let history: RecordImports | null = null;
  let fields: FieldsSettings | null = null;
  const [historyRead, fieldsRead, directory] = await Promise.allSettled([
    readCompanyImports(context.token),
    readFields(context.token, "company"),
    directoryOrNull(context.token),
  ]);
  for (const read of [historyRead, fieldsRead]) {
    if (
      read.status === "rejected" &&
      !(read.reason instanceof HqApiUnavailableError || read.reason instanceof HqApiRequestError)
    )
      throw read.reason;
  }
  if (historyRead.status === "fulfilled") history = historyRead.value;
  if (fieldsRead.status === "fulfilled") fields = fieldsRead.value;
  const colleagues =
    directory.status === "fulfilled" && directory.value
      ? [...directory.value.values()]
          .filter((entry) => entry.is_active && entry.staff_id !== context.me.staff.staff_id)
          .map((entry) => ({ staff_id: entry.staff_id, name: entry.display_name }))
          .sort((a, b) => a.name.localeCompare(b.name))
      : [];
  const untilLabel = context.me.sudo_until
    ? (formatAbsolute(context.me.sudo_until).split(", ")[1] ?? null)
    : null;

  return (
    <>
      <PageHeader
        eyebrow="CRM"
        title="Import companies"
        description="A spreadsheet of firms becomes companies. Every row is accounted for — added, filled in, already here, or left out with the reason — and the same accounting can be had first without writing anything. A file can be taken back while nobody has worked on what it added."
      />
      <div className="page-content">
        {canWrite ? (
          history === null || fields === null ? (
            <Callout tone="danger" role="alert">
              The import settings could not be read just now, so importing is paused. Nothing is
              lost.
            </Callout>
          ) : (
            <RecordImport
              kind="companies"
              action={importCompaniesAction}
              fields={FIELDS}
              customFields={fields.fields
                .filter((field) => !field.archived)
                .map((field) => ({ key: field.key, label: field.label }))}
              columns={history.columns}
              maxRows={history.max_rows}
              colleagues={colleagues}
            />
          )
        ) : (
          <Callout tone="neutral">Your role reads the CRM without writing to it.</Callout>
        )}
        <RecordImportHistory
          kind="companies"
          history={history}
          canWrite={canWrite}
          rollback={rollbackCompaniesImportAction}
          sudoFresh={context.me.sudo_fresh}
          sudoUntilLabel={untilLabel}
          returnPath={BASE}
          now={now}
        />
      </div>
    </>
  );
}
