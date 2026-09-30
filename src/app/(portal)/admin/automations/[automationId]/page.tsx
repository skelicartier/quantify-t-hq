import Link from "next/link";
import { notFound } from "next/navigation";

import {
  actOnAutomationAction,
  dryRunAutomationAction,
  publishAutomationAction,
  saveAutomationDraftAction,
} from "@/app/(portal)/_actions/automations";
import { AutomationBuilder, DryRunPanel } from "@/components/platform/automation-builder";
import { PageHeader } from "@/components/shell/page-header";
import { ActForm } from "@/components/ui/act-form";
import { Callout } from "@/components/ui/callout";
import { Card } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { Field, Input } from "@/components/ui/field";
import {
  Properties,
  Property,
  RecordGrid,
  RecordHeader,
  RecordSection,
} from "@/components/ui/record-shell";
import { StatusPill, type PillTone } from "@/components/ui/status-pill";
import { hasCapability, requireStaff } from "@/lib/access/core";
import { readAutomation, type AutomationDetail } from "@/lib/api/automations";
import { HqApiRequestError, HqApiUnavailableError } from "@/lib/api/core";
import { formatAbsolute } from "@/lib/format";

export const metadata = { title: "Automation" };
export const dynamic = "force-dynamic";

const STATUS: Record<string, { label: string; tone: PillTone }> = {
  active: { label: "Running", tone: "live" },
  paused: { label: "Paused", tone: "attention" },
  draft: { label: "Draft", tone: "neutral" },
  archived: { label: "Archived", tone: "neutral" },
};
const OUTCOME: Record<string, { label: string; tone: PillTone }> = {
  done: { label: "Done", tone: "live" },
  failed: { label: "Failed", tone: "danger" },
  skipped_loop: { label: "Stopped by the loop guard", tone: "attention" },
};
const RECORD_PATH: Record<string, string> = {
  company: "/companies",
  person: "/people",
  deal: "/deals",
  lead: "/leads",
};
const RUN_COLUMNS = [
  { key: "when", label: "When" },
  { key: "record", label: "Record" },
  { key: "trigger", label: "Trigger" },
  { key: "outcome", label: "Outcome" },
  { key: "version", label: "Version", align: "end" as const },
  { key: "detail", label: "What it did" },
];

type Params = Promise<{ automationId: string }>;

/** One automation: its draft in the builder, the version running, and every run. */
export default async function AutomationPage({ params }: { params: Params }) {
  const { automationId } = await params;
  const context = await requireStaff(`/admin/automations/${automationId}`);
  if (!hasCapability(context, "hq:admin")) {
    return (
      <>
        <PageHeader eyebrow="Admin" title="Automation" />
        <Callout tone="neutral">Automations are kept by HQ owners and admins.</Callout>
      </>
    );
  }
  let detail: AutomationDetail | null = null;
  try {
    detail = await readAutomation(context.token, automationId);
  } catch (error) {
    if (error instanceof HqApiRequestError && error.status === 404) notFound();
    if (!(error instanceof HqApiUnavailableError || error instanceof HqApiRequestError))
      throw error;
  }
  if (detail === null) {
    return (
      <>
        <PageHeader eyebrow="Admin" title="Automation" />
        <Callout tone="danger" role="alert">
          This automation could not be read just now.
        </Callout>
      </>
    );
  }
  const { automation } = detail;
  const status = STATUS[automation.status] ?? {
    label: automation.status,
    tone: "neutral" as PillTone,
  };
  const hidden = { automation_id: automation.automation_id };
  const archived = automation.status === "archived";

  return (
    <>
      <RecordHeader
        crumbs={[{ href: "/admin/automations", label: "Automations" }]}
        title={automation.name}
        status={<StatusPill value={automation.status} label={status.label} tone={status.tone} />}
        readouts={[
          { label: "On", value: automation.record_label },
          { label: "Version running", value: automation.version || "None yet" },
          { label: "Runs, 30 days", value: automation.runs_30_days },
          { label: "Failed", value: automation.failed_30_days },
        ]}
      />
      {automation.status === "paused" && automation.paused_reason && (
        <Callout tone="attention" compact>
          {automation.paused_reason}
        </Callout>
      )}
      <RecordGrid
        side={
          <>
            <Properties title="Running now">
              <Property label="Version">{automation.version || "Not published"}</Property>
              <Property label="When">
                {automation.version ? automation.trigger_label : "—"}
              </Property>
              <Property label="Then">
                {detail.published_summary.length ? detail.published_summary.join(" · ") : "—"}
              </Property>
              <Property label="Draft">
                {automation.draft_differs ? "Differs from what runs" : "The same as what runs"}
              </Property>
              <Property label="Loop guard">
                {automation.skipped_30_days
                  ? `${automation.skipped_30_days} run${automation.skipped_30_days === 1 ? "" : "s"} stopped in 30 days`
                  : "Nothing stopped in 30 days"}
              </Property>
            </Properties>
            <Properties title="Versions">
              {detail.versions.length === 0 ? (
                <Property label="None">Publish to make the first.</Property>
              ) : (
                detail.versions.map((version) => (
                  <Property key={version.version} label={`Version ${version.version}`}>
                    {version.published_by_name}, {formatAbsolute(version.published_at, "—")}
                  </Property>
                ))
              )}
            </Properties>
          </>
        }
      >
        {!archived && (
          <RecordSection id="builder" title="The draft">
            <AutomationBuilder
              action={saveAutomationDraftAction}
              automationId={automation.automation_id}
              name={automation.name}
              draft={{
                trigger: detail.draft.trigger,
                conditions: detail.draft.conditions,
                actions: detail.draft.actions,
              }}
              options={detail.options}
              limits={detail.limits}
              disabled={false}
            />
          </RecordSection>
        )}
        {!archived && (
          <RecordSection id="try" title="Try it, then publish it">
            <div className="form-grid">
              <Card
                title="Try the saved draft"
                titleAs="h3"
                description={`On the last ${detail.limits.dry_run} records: who would match, and what it would do. Nothing is changed.`}
              >
                <DryRunPanel
                  action={dryRunAutomationAction}
                  automationId={automation.automation_id}
                />
              </Card>
              <Card
                title="Publish"
                titleAs="h3"
                description={
                  automation.draft_differs
                    ? `The saved draft becomes version ${automation.version + 1} and starts running.`
                    : "The saved draft is what already runs."
                }
              >
                <ActForm
                  action={publishAutomationAction}
                  hidden={hidden}
                  act="publish"
                  label={`Publish version ${automation.version + 1}`}
                  primary
                  disabled={!automation.draft_differs}
                />
              </Card>
            </div>
          </RecordSection>
        )}
        <RecordSection id="runs" title="Runs">
          <DataTable
            caption="Runs, newest first"
            columns={RUN_COLUMNS}
            isEmpty={detail.runs.length === 0}
            empty={<p className="muted">No runs yet.</p>}
          >
            {detail.runs.map((run) => {
              const outcome = OUTCOME[run.outcome] ?? {
                label: run.outcome,
                tone: "neutral" as PillTone,
              };
              return (
                <tr key={run.run_id}>
                  <td>{formatAbsolute(run.at, "—")}</td>
                  <td>
                    <Link href={`${RECORD_PATH[run.record_type] ?? ""}/${run.record_id}`}>
                      {run.record_label || "The record"}
                    </Link>
                  </td>
                  <td>
                    {run.trigger === "button" && run.started_by_name
                      ? `Button, ${run.started_by_name}`
                      : run.trigger.replace(/_/g, " ")}
                  </td>
                  <td>
                    <StatusPill value={run.outcome} label={outcome.label} tone={outcome.tone} />
                  </td>
                  <td className="data-table__num">{run.version}</td>
                  <td className="prewrap">{run.detail}</td>
                </tr>
              );
            })}
          </DataTable>
        </RecordSection>
        <RecordSection id="state" title="Running or not">
          <div className="form-grid">
            {automation.status === "active" && (
              <Card title="Pause it" titleAs="h3" description="Nothing runs until it is resumed.">
                <ActForm action={actOnAutomationAction} hidden={hidden} act="pause" label="Pause">
                  <Field id="pause-reason" label="Why">
                    <Input id="pause-reason" name="reason" maxLength={400} />
                  </Field>
                </ActForm>
              </Card>
            )}
            {automation.status === "paused" && (
              <Card
                title="Resume it"
                titleAs="h3"
                description="Runs again from the next trigger; the failure count starts over."
              >
                <ActForm
                  action={actOnAutomationAction}
                  hidden={hidden}
                  act="resume"
                  label="Resume"
                  primary
                />
              </Card>
            )}
            <Card
              title={archived ? "Restore it" : "Archive it"}
              titleAs="h3"
              description={
                archived
                  ? "Back as it was, paused until someone resumes it."
                  : "Stops it and takes it off the list; its runs stay."
              }
            >
              <ActForm
                action={actOnAutomationAction}
                hidden={hidden}
                act={archived ? "restore" : "archive"}
                label={archived ? "Restore" : "Archive"}
                danger={!archived}
              />
            </Card>
          </div>
        </RecordSection>
      </RecordGrid>
    </>
  );
}
