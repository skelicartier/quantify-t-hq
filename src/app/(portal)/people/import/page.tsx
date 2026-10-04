import { importPeopleAction, rollbackPeopleImportAction } from "@/app/(portal)/people/actions";
import { RecordImport, type RecordImportField } from "@/components/crm/record-import";
import { RecordImportHistory } from "@/components/crm/record-import-history";
import { PageHeader } from "@/components/shell/page-header";
import { Callout } from "@/components/ui/callout";
import { hasCapability, requireStaff } from "@/lib/access/core";
import { HqApiRequestError, HqApiUnavailableError } from "@/lib/api/core";
import { readPeopleImports, type RecordImports } from "@/lib/api/crm";
import { readFields, type FieldsSettings } from "@/lib/api/fields";
import { formatAbsolute } from "@/lib/format";
import { requestNow } from "@/lib/request-time";

export const metadata = { title: "Import people" };
export const dynamic = "force-dynamic";

const BASE = "/people/import";

/** Our columns, and the headers a spreadsheet (or an HQ export) is likely to use. */
const FIELDS: readonly RecordImportField[] = [
  { key: "id", label: "ID from an HQ export", aliases: ["person id", "contact id", "record id"] },
  { key: "full_name", label: "Full name", aliases: ["name", "contact", "contact name"] },
  { key: "first_name", label: "First name", aliases: ["first", "given name", "forename"] },
  { key: "last_name", label: "Last name", aliases: ["last", "surname", "family name"] },
  { key: "email", label: "Email", aliases: ["e-mail", "email address", "mail", "work email"] },
  { key: "title", label: "Title", aliases: ["job title", "position", "designation"] },
  { key: "role_category", label: "Role", aliases: ["role", "function", "department"] },
  { key: "phone", label: "Phone", aliases: ["telephone", "mobile", "phone number", "tel"] },
  {
    key: "company",
    label: "Company name",
    aliases: ["company", "firm", "organisation", "organization", "account"],
  },
  {
    key: "company_domain",
    label: "Company domain",
    aliases: ["domain", "website", "company website"],
  },
  { key: "do_not_contact", label: "Do not contact", aliases: ["do not contact", "opted out"] },
  { key: "source", label: "Source", aliases: ["lead source", "channel"] },
  { key: "notes", label: "Notes", aliases: ["comments", "note"] },
];

export default async function ImportPeoplePage() {
  const context = await requireStaff(BASE);
  const now = requestNow();
  const canWrite = hasCapability(context, "crm:write");
  let history: RecordImports | null = null;
  let fields: FieldsSettings | null = null;
  const [historyRead, fieldsRead] = await Promise.allSettled([
    readPeopleImports(context.token),
    readFields(context.token, "person"),
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
  const untilLabel = context.me.sudo_until
    ? (formatAbsolute(context.me.sudo_until).split(", ")[1] ?? null)
    : null;

  return (
    <>
      <PageHeader
        eyebrow="CRM"
        title="Import people"
        description="A spreadsheet of contacts becomes people. A row joins its company by the company's domain, its name, or the domain of the person's address. Every row is accounted for, the same accounting can be had first without writing anything, and a file can be taken back while nobody has worked on what it added."
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
              kind="people"
              action={importPeopleAction}
              fields={FIELDS}
              customFields={fields.fields
                .filter((field) => !field.archived)
                .map((field) => ({ key: field.key, label: field.label }))}
              columns={history.columns}
              maxRows={history.max_rows}
            />
          )
        ) : (
          <Callout tone="neutral">Your role reads the CRM without writing to it.</Callout>
        )}
        <RecordImportHistory
          kind="people"
          history={history}
          canWrite={canWrite}
          rollback={rollbackPeopleImportAction}
          sudoFresh={context.me.sudo_fresh}
          sudoUntilLabel={untilLabel}
          returnPath={BASE}
          now={now}
        />
      </div>
    </>
  );
}
