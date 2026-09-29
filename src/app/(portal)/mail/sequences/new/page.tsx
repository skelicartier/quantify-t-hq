import { saveSequenceAction } from "@/app/(portal)/mail/actions";
import { MailTabs } from "@/components/mail/mail-tabs";
import { SequenceEditor } from "@/components/mail/sequence-editor";
import { PageHeader } from "@/components/shell/page-header";
import { Callout } from "@/components/ui/callout";
import { hasCapability, requireStaff } from "@/lib/access/core";
import { readSenders, readTemplates } from "@/lib/api/mail";

export const metadata = { title: "New sequence" };
export const dynamic = "force-dynamic";

export default async function NewSequencePage() {
  const context = await requireStaff("/mail/sequences/new");
  if (!hasCapability(context, "crm:write")) {
    return (
      <>
        <PageHeader eyebrow="Mail" title="New sequence" />
        <div className="page-content">
          <Callout tone="neutral">Your role reads mail without drafting it.</Callout>
        </div>
      </>
    );
  }
  const [senders, templates] = await Promise.all([
    readSenders(context.token),
    readTemplates(context.token),
  ]);
  return (
    <>
      <PageHeader
        eyebrow="Mail"
        title="New sequence"
        description="Saved as a draft; an owner or admin makes it live. A sensible start is below — change the waits and templates to suit."
        actions={<MailTabs current="/mail/sequences" />}
      />
      <div className="page-content">
        <SequenceEditor
          action={saveSequenceAction}
          disabled={false}
          templates={templates.templates
            .filter((template) => template.kind === "sequence" && !template.archived_at)
            .map((template) => ({ id: template.template_id, label: template.name }))}
          senders={senders.senders
            .filter((sender) => sender.kind === "sales" && sender.active)
            .map((sender) => ({
              id: sender.sender_id,
              label: `${sender.from_name || sender.staff_name} <${sender.from_email}>`,
            }))}
          initial={{
            name: "",
            kind: "prospect",
            sender_id: "",
            cooling_days: 90,
            recent_contact_days: 14,
            company_limit: 2,
            steps: [],
          }}
        />
      </div>
    </>
  );
}
