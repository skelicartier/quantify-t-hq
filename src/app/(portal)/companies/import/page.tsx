import { importCompaniesAction } from "@/app/(portal)/companies/actions";
import { CsvImport } from "@/components/crm/csv-import";
import { PageHeader } from "@/components/shell/page-header";
import { Callout } from "@/components/ui/callout";
import { hasCapability, requireStaff } from "@/lib/access/core";

export const metadata = { title: "Import companies" };
export const dynamic = "force-dynamic";

const FIELDS = [
  {
    key: "name",
    label: "Name",
    aliases: ["company", "company name", "firm", "organisation", "organization", "account"],
  },
  { key: "domain", label: "Web domain", aliases: ["website", "web", "url", "site"] },
  { key: "firm_type", label: "Type", aliases: ["firm type", "type", "segment"] },
  { key: "team_size_band", label: "Team size", aliases: ["size", "team size", "headcount"] },
  { key: "country", label: "Country", aliases: ["location", "hq country"] },
  { key: "source_key", label: "Source", aliases: ["source", "lead source", "channel"] },
  { key: "notes", label: "Notes", aliases: ["comments", "note", "description"] },
] as const;

export default async function ImportCompaniesPage() {
  const context = await requireStaff("/companies/import");
  if (!hasCapability(context, "crm:write")) {
    return (
      <>
        <PageHeader eyebrow="CRM" title="Import companies" />
        <Callout tone="neutral">Your role reads the CRM without writing to it.</Callout>
      </>
    );
  }
  return (
    <>
      <PageHeader
        eyebrow="CRM"
        title="Import companies"
        description="A spreadsheet of firms becomes companies here. Each row is checked as if typed; a firm already known by its domain or its name is skipped and named, never merged blindly."
      />
      <CsvImport action={importCompaniesAction} fields={FIELDS} noun="companies" />
    </>
  );
}
