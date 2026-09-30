import { createRuleAction, toggleRuleAction } from "@/app/(portal)/_actions/platform";
import { AdminTabs } from "@/components/admin/admin-tabs";
import { RuleForm } from "@/components/platform/platform-forms";
import { PageHeader } from "@/components/shell/page-header";
import { Callout } from "@/components/ui/callout";
import { Section } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { RowAction } from "@/components/ui/row-action";
import { hasCapability, requireStaff } from "@/lib/access/core";
import { HqApiRequestError, HqApiUnavailableError } from "@/lib/api/core";
import { readRules, type RulesBoard } from "@/lib/api/platform";

export const metadata = { title: "Rules" };
export const dynamic = "force-dynamic";

const RECORD_LABELS: Record<string, string> = {
  deal: "Deal",
  lead: "Lead",
  company: "Company",
  person: "Person",
};
const CHECK_LABELS: Record<string, string> = {
  required: "Must be filled in",
  at_least: "At least",
  at_most: "At most",
  not_past: "Not in the past",
};

/**
 * The rules every write keeps: a field that must be filled in, a number within bounds, a
 * date not in the past. They are checked where records are saved — every form, bulk edit
 * and import — and the person sees the rule's own message on the field.
 */
export default async function RulesPage() {
  const context = await requireStaff("/admin/rules");
  if (!hasCapability(context, "hq:admin")) {
    return (
      <>
        <PageHeader eyebrow="Admin" title="Rules" />
        <Callout tone="neutral">Rules are kept by HQ owners and admins.</Callout>
      </>
    );
  }
  let board: RulesBoard | null = null;
  try {
    board = await readRules(context.token);
  } catch (error) {
    if (!(error instanceof HqApiUnavailableError || error instanceof HqApiRequestError))
      throw error;
  }
  return (
    <>
      <PageHeader
        eyebrow="Admin"
        title="Rules"
        description="Checked wherever a deal, lead, company or person is saved. The website's form is never refused: a prospect is not lost over a field the desk wants. Stage rules live with each stage, under Pipeline."
        actions={<AdminTabs current="/admin/rules" />}
      />
      {board === null ? (
        <Callout tone="danger" role="alert">
          The rules could not be read just now.
        </Callout>
      ) : (
        <div className="page-content">
          <Section id="rules" title="Validation rules">
            <DataTable
              caption="Validation rules"
              columns={[
                { key: "field", label: "Field" },
                { key: "rule", label: "Rule" },
                { key: "message", label: "What they are told" },
                { key: "on", label: "On" },
                { key: "act", label: "Action" },
              ]}
              isEmpty={board.rules.length === 0}
              empty={<p className="muted">No rules yet. Every field is optional.</p>}
              columnMenu={false}
            >
              {board.rules.map((rule) => (
                <tr key={rule.rule_id}>
                  <td>
                    {RECORD_LABELS[rule.record_type] ?? rule.record_type}: {rule.field_label}
                  </td>
                  <td>
                    {CHECK_LABELS[rule.check_kind] ?? rule.check_kind}
                    {rule.value ? ` ${rule.value}` : ""}
                  </td>
                  <td>{rule.message}</td>
                  <td>{rule.active ? "Yes" : "No"}</td>
                  <td>
                    <RowAction
                      action={toggleRuleAction}
                      fields={{ rule_id: rule.rule_id, active: rule.active ? "false" : "true" }}
                      buttons={[
                        {
                          label: rule.active ? "Switch off" : "Switch on",
                          pendingLabel: "Saving…",
                          className: "btn btn--small btn--ghost",
                          ariaLabel: `${rule.active ? "Switch off" : "Switch on"} the rule on ${rule.field_label}`,
                        },
                      ]}
                    />
                  </td>
                </tr>
              ))}
            </DataTable>
            <details className="disclosure">
              <summary>Add a rule</summary>
              <RuleForm
                action={createRuleAction}
                fields={board.fields}
                checks={board.checks}
                disabled={false}
              />
            </details>
          </Section>
        </div>
      )}
    </>
  );
}
