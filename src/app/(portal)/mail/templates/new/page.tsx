import { saveTemplateAction } from "@/app/(portal)/mail/actions";
import { MailTabs } from "@/components/mail/mail-tabs";
import { TemplateForm } from "@/components/mail/template-form";
import { PageHeader } from "@/components/shell/page-header";
import { Callout } from "@/components/ui/callout";
import { hasCapability, requireStaff } from "@/lib/access/core";
import { readTemplates } from "@/lib/api/mail";
import { firstSearchValue } from "@/lib/search-params";

export const metadata = { title: "New template" };
export const dynamic = "force-dynamic";

const STARTERS = {
  campaign: {
    subject: "What's new in Quantify Terminal for {{company | your desk}}",
    body_html:
      '<p>Hi {{first_name | there}},</p>\n<p>One paragraph on what changed and why it matters to a fund like yours.</p>\n<p><a href="https://quantifyterminal.com">See what\'s new</a></p>\n<p>{{sender_name}}</p>',
  },
  sequence: {
    subject: "Quick question, {{first_name}}",
    body_text:
      "Hi {{first_name}},\n\nOne line on why you are writing to {{company | them}} in particular.\n\nOne question they can answer in a sentence?\n\n{{owner_name}}",
  },
};

type NewTemplateProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function NewTemplatePage({ searchParams }: NewTemplateProps) {
  const context = await requireStaff("/mail/templates/new");
  if (!hasCapability(context, "crm:write")) {
    return (
      <>
        <PageHeader eyebrow="Mail" title="New template" />
        <div className="page-content">
          <Callout tone="neutral">Your role reads mail without drafting it.</Callout>
        </div>
      </>
    );
  }
  const kind = firstSearchValue((await searchParams).kind) === "sequence" ? "sequence" : "campaign";
  const { variables } = await readTemplates(context.token);
  return (
    <>
      <PageHeader
        eyebrow="Mail"
        title="New template"
        actions={<MailTabs current="/mail/templates" />}
      />
      <div className="page-content">
        <TemplateForm
          action={saveTemplateAction}
          variables={variables}
          kindLocked={false}
          initial={{
            name: "",
            kind,
            subject: STARTERS[kind].subject,
            body_html: kind === "campaign" ? STARTERS.campaign.body_html : "",
            body_text: kind === "sequence" ? STARTERS.sequence.body_text : "",
          }}
        />
      </div>
    </>
  );
}
