import Link from "next/link";

import { createAutomationAction } from "@/app/(portal)/_actions/automations";
import { AdminTabs } from "@/components/admin/admin-tabs";
import { PageHeader } from "@/components/shell/page-header";
import { ActForm } from "@/components/ui/act-form";
import { Callout } from "@/components/ui/callout";
import { Section } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { Field, Input, Select } from "@/components/ui/field";
import { StatusPill, type PillTone } from "@/components/ui/status-pill";
import { hasCapability, requireStaff } from "@/lib/access/core";
import { type AutomationList, readAutomations } from "@/lib/api/automations";
import { HqApiRequestError, HqApiUnavailableError } from "@/lib/api/core";
import { formatAbsolute } from "@/lib/format";

export const metadata = { title: "Automations" };
export const dynamic = "force-dynamic";

const COLUMNS = [
  { key: "name", label: "Automation" },
  { key: "on", label: "On" },
  { key: "trigger", label: "When" },
  { key: "status", label: "State" },
  { key: "version", label: "Version", align: "end" as const },
  { key: "runs", label: "Runs, 30 days", align: "end" as const },
  { key: "failed", label: "Failed", align: "end" as const },
  { key: "last", label: "Last run" },
];

const STATUS: Record<string, { label: string; tone: PillTone }> = {
  active: { label: "Running", tone: "live" },
  paused: { label: "Paused", tone: "attention" },
  draft: { label: "Draft", tone: "neutral" },
  archived: { label: "Archived", tone: "neutral" },
};

/**
 * What HQ does by itself: when something happens to a company, person, deal or lead, and
 * the conditions hold, the actions follow. Every run is on the automation's page.
 */
export default async function AutomationsPage() {
  const context = await requireStaff("/admin/automations");
  if (!hasCapability(context, "hq:admin")) {
    return (
      <>
        <PageHeader eyebrow="Admin" title="Automations" />
        <Callout tone="neutral">Automations are kept by HQ owners and admins.</Callout>
      </>
    );
  }
  let list: AutomationList | null = null;
  try {
    list = await readAutomations(context.token);
  } catch (error) {
    if (!(error instanceof HqApiUnavailableError || error instanceof HqApiRequestError))
      throw error;
  }
  return (
    <>
      <PageHeader
        eyebrow="Admin"
        title="Automations"
        description="A trigger, conditions, then actions: a task, a field set, a notification, a webhook. A draft never runs; publishing makes the next version. An automation's own changes never start it again, nothing chains past three, and five failures in a row pause it."
        actions={<AdminTabs current="/admin/automations" />}
      />
      {list === null ? (
        <Callout tone="danger" role="alert">
          The automations could not be read just now.
        </Callout>
      ) : (
        <div className="page-content">
          {list.paused > 0 && (
            <Callout tone="attention" compact>
              {list.paused} automation{list.paused === 1 ? " is" : "s are"} paused. Open it for the
              reason.
            </Callout>
          )}
          <Section id="automations" title="Automations">
            <DataTable
              caption="Automations, running first"
              columns={COLUMNS}
              isEmpty={list.automations.length === 0}
              empty={<p className="muted">None yet. Start one below.</p>}
              columnMenu={false}
            >
              {list.automations.map((item) => {
                const status = STATUS[item.status] ?? {
                  label: item.status,
                  tone: "neutral" as PillTone,
                };
                return (
                  <tr key={item.automation_id}>
                    <td>
                      <Link href={`/admin/automations/${item.automation_id}`}>{item.name}</Link>
                    </td>
                    <td>{item.record_label}</td>
                    <td>{item.trigger_label}</td>
                    <td>
                      <StatusPill value={item.status} label={status.label} tone={status.tone} />
                    </td>
                    <td className="data-table__num">{item.version || "—"}</td>
                    <td className="data-table__num">{item.runs_30_days}</td>
                    <td className="data-table__num">{item.failed_30_days}</td>
                    <td>{formatAbsolute(item.last_run_at, "Never")}</td>
                  </tr>
                );
              })}
            </DataTable>
            <details className="disclosure">
              <summary>Start an automation</summary>
              <ActForm
                action={createAutomationAction}
                hidden={{}}
                act="create"
                label="Start it"
                primary
                tight={false}
              >
                <div className="form-grid">
                  <Field id="auto-new-name" label="Name">
                    <Input
                      id="auto-new-name"
                      name="name"
                      maxLength={120}
                      required
                      placeholder="Welcome every new customer"
                    />
                  </Field>
                  <Field id="auto-new-type" label="On">
                    <Select id="auto-new-type" name="record_type" defaultValue="deal">
                      {list.record_types.map((item) => (
                        <option key={item.value} value={item.value}>
                          {item.label}
                        </option>
                      ))}
                    </Select>
                  </Field>
                </div>
              </ActForm>
            </details>
          </Section>
        </div>
      )}
    </>
  );
}
