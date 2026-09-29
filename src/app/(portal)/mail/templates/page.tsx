import Link from "next/link";

import { MailTabs } from "@/components/mail/mail-tabs";
import { PageHeader } from "@/components/shell/page-header";
import { Callout } from "@/components/ui/callout";
import { DataTable } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { Timestamp } from "@/components/ui/timestamp";
import { hasCapability, requireStaff } from "@/lib/access/core";
import { HqApiRequestError, HqApiUnavailableError } from "@/lib/api/core";
import { readTemplates, type MailTemplate } from "@/lib/api/mail";
import { requestNow } from "@/lib/request-time";

export const metadata = { title: "Templates" };
export const dynamic = "force-dynamic";

const COLUMNS = [
  { key: "name", label: "Template" },
  { key: "kind", label: "Kind" },
  { key: "subject", label: "Subject" },
  { key: "version", label: "Version", align: "end" as const },
  { key: "required", label: "Needs" },
  { key: "updated", label: "Updated" },
];

export default async function TemplatesPage() {
  const context = await requireStaff("/mail/templates");
  const now = requestNow();
  let templates: MailTemplate[] | null = null;
  try {
    templates = (await readTemplates(context.token)).templates;
  } catch (error) {
    if (!(error instanceof HqApiUnavailableError || error instanceof HqApiRequestError))
      throw error;
  }
  const canWrite = hasCapability(context, "crm:write");
  const live = (templates ?? []).filter((row) => !row.archived_at);
  const archived = (templates ?? []).filter((row) => row.archived_at);
  return (
    <>
      <PageHeader
        eyebrow="Mail"
        title="Templates"
        description="What a campaign or a sequence step says. Every save is a new version; a scheduled campaign keeps the version it was approved with."
        actions={
          <>
            {canWrite && (
              <Link className="btn btn--small btn--primary" href="/mail/templates/new">
                New template
              </Link>
            )}
            <MailTabs current="/mail/templates" />
          </>
        }
      />
      <div className="page-content">
        {templates === null ? (
          <Callout tone="danger" role="alert">
            Templates could not be read just now. This is a read failure, not an empty library.
          </Callout>
        ) : (
          <DataTable
            caption="Templates"
            columns={COLUMNS}
            isEmpty={live.length === 0}
            empty={
              <EmptyState
                title="No templates yet"
                description="Campaign templates are designed HTML; sequence templates are short plain text from one person."
              />
            }
          >
            {[...live, ...archived].map((template) => (
              <tr
                key={template.template_id}
                className={template.archived_at ? "row--muted" : undefined}
              >
                <td>
                  <Link className="table-title" href={`/mail/templates/${template.template_id}`}>
                    {template.name}
                  </Link>
                  {template.archived_at && <span className="table-sub">Archived</span>}
                </td>
                <td>{template.kind === "campaign" ? "Campaign" : "Sequence step"}</td>
                <td>{template.subject}</td>
                <td className="data-table__num">v{template.current_version}</td>
                <td>
                  {template.required_vars.length ? (
                    template.required_vars.join(", ")
                  ) : (
                    <span className="table-sub">Nothing</span>
                  )}
                </td>
                <td>
                  <Timestamp value={template.updated_at} now={now} mode="relative" />
                </td>
              </tr>
            ))}
          </DataTable>
        )}
      </div>
    </>
  );
}
