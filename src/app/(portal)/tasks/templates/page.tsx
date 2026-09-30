import { archiveTemplateAction, saveTemplateAction } from "@/app/(portal)/_actions/platform";
import { TemplateEditor } from "@/components/platform/platform-forms";
import { PageHeader } from "@/components/shell/page-header";
import { Callout } from "@/components/ui/callout";
import { Section } from "@/components/ui/card";
import { RowAction } from "@/components/ui/row-action";
import { hasCapability, requireStaff } from "@/lib/access/core";
import { HqApiRequestError, HqApiUnavailableError } from "@/lib/api/core";
import { readTemplates, type RecordTemplate } from "@/lib/api/platform";

export const metadata = { title: "Task templates" };
export const dynamic = "force-dynamic";

const FOR_LABELS: Record<string, string> = { deal: "Deals", company: "Companies", lead: "Leads" };

/**
 * Named sets of tasks — a security review, an onboarding call series — added to a deal,
 * company or lead from its page, each task dated from the day it is added.
 */
export default async function TemplatesPage() {
  const context = await requireStaff("/tasks/templates");
  let templates: RecordTemplate[] | null = null;
  try {
    templates = (await readTemplates(context.token)).templates;
  } catch (error) {
    if (!(error instanceof HqApiUnavailableError || error instanceof HqApiRequestError))
      throw error;
  }
  const canWrite = hasCapability(context, "crm:write");
  return (
    <>
      <PageHeader
        eyebrow="Work"
        title="Task templates"
        description="Named sets of tasks added to a deal, company or lead from its page, each dated from the day it is added."
      />
      {templates === null ? (
        <Callout tone="danger" role="alert">
          The templates could not be read just now.
        </Callout>
      ) : (
        <div className="page-content">
          {templates.length === 0 && <p className="muted">No templates yet.</p>}
          {templates.map((template) => (
            <Section
              key={template.template_id}
              id={`template-${template.template_id.slice(0, 8)}`}
              title={template.name}
              eyebrow={`${FOR_LABELS[template.applies_to] ?? template.applies_to}${template.archived ? " · archived" : ""}`}
              description={template.description || undefined}
            >
              <ol className="template-list">
                {template.items.map((item, index) => (
                  <li key={`${item.title}-${index}`}>
                    <strong>{item.title}</strong>
                    <span className="quiet">
                      {" "}
                      · {item.due_in_days === 0
                        ? "the same day"
                        : `${item.due_in_days} days after`}{" "}
                      · {item.priority}
                    </span>
                  </li>
                ))}
              </ol>
              {canWrite && (
                <>
                  <details className="disclosure">
                    <summary>Edit</summary>
                    <TemplateEditor action={saveTemplateAction} template={template} />
                  </details>
                  <RowAction
                    action={archiveTemplateAction}
                    fields={{
                      template_id: template.template_id,
                      archived: template.archived ? "false" : "true",
                    }}
                    buttons={[
                      {
                        label: template.archived ? "Restore" : "Archive",
                        pendingLabel: "Saving…",
                        className: "btn btn--small btn--ghost",
                        ariaLabel: `${template.archived ? "Restore" : "Archive"} ${template.name}`,
                      },
                    ]}
                  />
                </>
              )}
            </Section>
          ))}
          {canWrite && (
            <Section id="template-new" title="A new template">
              <TemplateEditor action={saveTemplateAction} />
            </Section>
          )}
        </div>
      )}
    </>
  );
}
