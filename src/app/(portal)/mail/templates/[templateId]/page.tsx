import Link from "next/link";
import { notFound } from "next/navigation";

import { archiveTemplateAction, saveTemplateAction } from "@/app/(portal)/mail/actions";
import { MailForm } from "@/components/mail/mail-form";
import { RenderedPreview } from "@/components/mail/rendered-preview";
import { TemplateForm } from "@/components/mail/template-form";
import { Callout } from "@/components/ui/callout";
import {
  Properties,
  Property,
  RecordGrid,
  RecordHeader,
  RecordSection,
} from "@/components/ui/record-shell";
import { StatusPill } from "@/components/ui/status-pill";
import { Timestamp } from "@/components/ui/timestamp";
import { hasCapability, requireStaff } from "@/lib/access/core";
import { HqApiRequestError, HqApiUnavailableError } from "@/lib/api/core";
import { readPeople } from "@/lib/api/crm";
import { previewTemplate, readTemplate, type RenderedPreview as Rendered } from "@/lib/api/mail";
import { requestNow } from "@/lib/request-time";
import { firstSearchValue } from "@/lib/search-params";

export const metadata = { title: "Template" };
export const dynamic = "force-dynamic";

type TemplatePageProps = {
  params: Promise<{ templateId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function TemplatePage({ params, searchParams }: TemplatePageProps) {
  const { templateId } = await params;
  const context = await requireStaff(`/mail/templates/${templateId}`);
  const parameters = await searchParams;
  const now = requestNow();
  let detail: Awaited<ReturnType<typeof readTemplate>> | null = null;
  try {
    detail = await readTemplate(context.token, templateId);
  } catch (error) {
    if (error instanceof HqApiRequestError && error.status === 404) notFound();
    if (!(error instanceof HqApiUnavailableError || error instanceof HqApiRequestError))
      throw error;
  }
  if (detail === null) {
    return (
      <Callout tone="danger" role="alert">
        This template could not be read just now.
      </Callout>
    );
  }
  const { template, versions } = detail;
  const previewPerson = firstSearchValue(parameters.person) ?? "";
  let people: { person_id: string; full_name: string; email: string }[] = [];
  try {
    people = (await readPeople(context.token)).people.filter((row) => row.email).slice(0, 200);
  } catch (error) {
    if (!(error instanceof HqApiUnavailableError || error instanceof HqApiRequestError))
      throw error;
  }
  let rendered: Rendered | null = null;
  try {
    rendered = await previewTemplate(context.token, template.template_id, {
      ...(previewPerson ? { contact_kind: "person", contact_id: previewPerson } : {}),
      topic: template.kind === "sequence" ? "sales" : "updates",
    });
  } catch (error) {
    if (!(error instanceof HqApiUnavailableError || error instanceof HqApiRequestError))
      throw error;
  }
  const canWrite = hasCapability(context, "crm:write");
  return (
    <>
      <RecordHeader
        crumbs={[
          { href: "/mail", label: "Mail" },
          { href: "/mail/templates", label: "Templates" },
        ]}
        title={template.name}
        status={
          template.archived_at ? (
            <StatusPill value="archived" label="Archived" tone="neutral" />
          ) : (
            <StatusPill value="live" label={`Version ${template.current_version}`} tone="live" />
          )
        }
        readouts={[
          { label: "Kind", value: template.kind === "campaign" ? "Campaign" : "Sequence step" },
          { label: "Needs", value: template.required_vars.join(", ") || "Nothing" },
        ]}
        actions={
          canWrite ? (
            <MailForm
              action={archiveTemplateAction}
              fields={{
                template_id: template.template_id,
                restore: template.archived_at ? "1" : "0",
              }}
              submitLabel={template.archived_at ? "Restore" : "Archive"}
              variant="ghost"
              className="inline-form"
            />
          ) : undefined
        }
      />
      <RecordGrid
        side={
          <>
            <Properties title="Versions">
              {versions.map((version) => (
                <Property key={version.version} label={`v${version.version}`}>
                  {version.subject}
                  <span className="table-sub">
                    {version.created_by?.name ?? "—"} ·{" "}
                    <Timestamp value={version.created_at} now={now} mode="relative" />
                  </span>
                </Property>
              ))}
            </Properties>
            <section className="side-panel" aria-labelledby="template-preview-heading">
              <h2 id="template-preview-heading" className="record-section__title">
                Preview as
              </h2>
              <form className="inline-form" action={`/mail/templates/${template.template_id}`}>
                <label className="sr-only" htmlFor="preview-person">
                  Person
                </label>
                <select
                  id="preview-person"
                  name="person"
                  className="select select--small"
                  defaultValue={previewPerson}
                >
                  <option value="">A sample contact</option>
                  {people.map((person) => (
                    <option key={person.person_id} value={person.person_id}>
                      {person.full_name || person.email}
                    </option>
                  ))}
                </select>
                <button className="btn btn--small" type="submit">
                  Show
                </button>
              </form>
            </section>
          </>
        }
      >
        <RecordSection id="template-rendered" title="As it arrives">
          {rendered === null ? (
            <Callout tone="danger" compact>
              The preview could not be rendered just now.
            </Callout>
          ) : rendered.ok_render ? (
            <RenderedPreview
              subject={rendered.subject ?? ""}
              html={rendered.html ?? ""}
              text={rendered.text ?? ""}
            />
          ) : (
            <Callout tone="attention" compact>
              This contact has no <strong>{rendered.missing}</strong>, and the template has no
              fallback for it: they would be skipped. Add{" "}
              <code>{`{{${rendered.missing} | …}}`}</code> to send anyway.
            </Callout>
          )}
        </RecordSection>
        {canWrite && (
          <RecordSection id="template-edit" title="Edit">
            <TemplateForm
              action={saveTemplateAction}
              variables={template.variables}
              kindLocked
              initial={{
                template_id: template.template_id,
                name: template.name,
                kind: template.kind,
                subject: template.subject,
                body_html: template.body_html,
                body_text: template.body_text,
              }}
            />
          </RecordSection>
        )}
        {template.kind === "sequence" && (
          <p className="page-note">
            Used by sequences as a step; see <Link href="/mail/sequences">Sequences</Link>.
          </p>
        )}
      </RecordGrid>
    </>
  );
}
