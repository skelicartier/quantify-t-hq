import { importPeopleAction } from "@/app/(portal)/people/actions";
import { CsvImport } from "@/components/crm/csv-import";
import { PageHeader } from "@/components/shell/page-header";
import { Callout } from "@/components/ui/callout";
import { hasCapability, requireStaff } from "@/lib/access/core";

export const metadata = { title: "Import people" };
export const dynamic = "force-dynamic";

const FIELDS = [
  { key: "full_name", label: "Name", aliases: ["name", "full name", "contact", "contact name"] },
  { key: "email", label: "Email", aliases: ["e-mail", "email address", "mail"] },
  { key: "title", label: "Title", aliases: ["job title", "role", "position"] },
  { key: "phone", label: "Phone", aliases: ["telephone", "mobile", "phone number"] },
  {
    key: "company",
    label: "Company name",
    aliases: ["company", "firm", "organisation", "organization", "account"],
  },
  {
    key: "company_domain",
    label: "Company domain",
    aliases: ["website", "domain", "company website"],
  },
  { key: "source_key", label: "Source", aliases: ["source", "lead source", "channel"] },
  { key: "notes", label: "Notes", aliases: ["comments", "note"] },
] as const;

export default async function ImportPeoplePage() {
  const context = await requireStaff("/people/import");
  if (!hasCapability(context, "crm:write")) {
    return (
      <>
        <PageHeader eyebrow="CRM" title="Import people" />
        <Callout tone="neutral">Your role reads the CRM without writing to it.</Callout>
      </>
    );
  }
  return (
    <>
      <PageHeader
        eyebrow="CRM"
        title="Import people"
        description="A spreadsheet of contacts becomes people here. A row joins its company by domain, by name, or by the domain of its address; an address already on file is skipped and named."
      />
      <CsvImport action={importPeopleAction} fields={FIELDS} noun="people" />
    </>
  );
}
