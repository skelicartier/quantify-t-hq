import { updateAiSettingsAction } from "@/app/(portal)/admin/ai/actions";
import { confirmSudoAction } from "@/app/(portal)/admin/actions";
import { AdminTabs } from "@/components/admin/admin-tabs";
import { SudoGate } from "@/components/admin/sudo-gate";
import { AiSettingsForm } from "@/components/ai/ai-settings-form";
import { PageHeader } from "@/components/shell/page-header";
import { Callout } from "@/components/ui/callout";
import { Section } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { Stat, StatGrid } from "@/components/ui/stat";
import { hasCapability, requireStaff } from "@/lib/access/core";
import { HqApiRequestError, HqApiUnavailableError } from "@/lib/api/core";
import { readAiSettings, type AiSettings } from "@/lib/api/ai";
import { formatAbsolute } from "@/lib/format";

export const metadata = { title: "AI assistance" };
export const dynamic = "force-dynamic";

const OUTCOME_LABELS: Record<string, string> = {
  ok: "Shown",
  no_grounded_answer: "Nothing to go on",
  rejected: "Failed the checks",
  error: "Model unreachable",
};
const VERDICT_LABELS: Record<string, string> = {
  used: "Used",
  edited: "Used, edited",
  dismissed: "Dismissed",
  "": "—",
};
const SUBJECT_LABELS: Record<string, string> = {
  ticket: "Ticket",
  company: "Company",
  deal: "Deal",
  meeting: "Meeting",
  list: "List",
};

/**
 * AI assistance, from the owners' side: whether it is set up, which features are on,
 * the caps, and every call — what it read, how it came out, and whether anyone used it.
 */
export default async function AiSettingsPage() {
  const context = await requireStaff("/admin/ai");
  if (!hasCapability(context, "hq:admin")) {
    return (
      <>
        <PageHeader eyebrow="Admin" title="AI assistance" />
        <Callout tone="neutral">AI assistance is set up by HQ owners and admins.</Callout>
      </>
    );
  }
  let data: AiSettings | null = null;
  try {
    data = await readAiSettings(context.token);
  } catch (error) {
    if (!(error instanceof HqApiUnavailableError || error instanceof HqApiRequestError))
      throw error;
  }
  const fresh = context.me.sudo_fresh;
  const untilLabel = context.me.sudo_until
    ? (formatAbsolute(context.me.sudo_until).split(", ")[1] ?? null)
    : null;
  const runs30 = data?.features.reduce((sum, feature) => sum + feature.runs_30d, 0) ?? 0;
  const used30 = data?.features.reduce((sum, feature) => sum + feature.used_30d, 0) ?? 0;

  return (
    <>
      <PageHeader
        eyebrow="Admin"
        title="AI assistance"
        description="Drafts, briefs and suggestions a person reads before anything happens. Each answer is checked against the records before it is shown; nothing it writes is kept."
        actions={<AdminTabs current="/admin/ai" />}
      />
      {data === null ? (
        <Callout tone="danger" role="alert">
          The AI settings could not be read just now.
        </Callout>
      ) : (
        <div className="page-content">
          {!data.configured && (
            <Callout tone="neutral" title="Not configured">
              No model is connected, so every feature says so instead of answering. Add the
              provider&rsquo;s key to the service settings to connect one; the features stay off
              until they are turned on here.
            </Callout>
          )}
          <StatGrid columns={4} label="AI assistance, last 30 days">
            <Stat label="Model" value={data.configured ? data.model : "None"} />
            <Stat label="Calls" value={runs30} hint="Last 30 days" />
            <Stat label="Used" value={used30} hint="Drafts and suggestions someone kept" />
            <Stat
              label="Tokens this month"
              value={data.tokens_this_month.toLocaleString("en-GB")}
              hint={`of ${data.monthly_tokens.toLocaleString("en-GB")}`}
            />
          </StatGrid>
          <SudoGate
            action={confirmSudoAction}
            fresh={fresh}
            untilLabel={untilLabel}
            returnPath="/admin/ai"
            purpose="Turning features on or off and changing the caps needs a fresh code from your authenticator app."
          />
          <Section
            id="features"
            title="Features"
            description="Each is off until turned on, and each needs its own permission: drafts and triage the desk's, briefs and filters reading the CRM, tasks from notes writing it."
          >
            <DataTable
              caption="What each feature has done in the last 30 days"
              columns={[
                { key: "feature", label: "Feature" },
                { key: "on", label: "On" },
                { key: "calls", label: "Calls", align: "end" },
                { key: "shown", label: "Shown", align: "end" },
                { key: "failed", label: "Failed the checks", align: "end" },
                { key: "used", label: "Used", align: "end" },
                { key: "dismissed", label: "Dismissed", align: "end" },
              ]}
              isEmpty={false}
              empty={null}
              columnMenu={false}
            >
              {data.features.map((feature) => (
                <tr key={feature.key}>
                  <td>{feature.label}</td>
                  <td>{feature.enabled ? "Yes" : "No"}</td>
                  <td className="num">{feature.runs_30d}</td>
                  <td className="num">{feature.outcomes_30d.ok ?? 0}</td>
                  <td className="num">{feature.outcomes_30d.rejected ?? 0}</td>
                  <td className="num">{feature.used_30d}</td>
                  <td className="num">{feature.dismissed_30d}</td>
                </tr>
              ))}
            </DataTable>
            <AiSettingsForm
              action={updateAiSettingsAction}
              features={data.features}
              dailyCalls={data.daily_calls}
              monthlyTokens={data.monthly_tokens}
              disabled={!fresh}
            />
          </Section>
          <Section
            id="runs"
            title="Calls, last 30 days"
            description="Who asked, about what, how it came out and what they did with it. The words themselves are not kept."
          >
            <DataTable
              caption="Calls to the model"
              columns={[
                { key: "when", label: "When" },
                { key: "who", label: "Who" },
                { key: "feature", label: "Feature" },
                { key: "about", label: "About" },
                { key: "outcome", label: "Outcome" },
                { key: "verdict", label: "Then" },
                { key: "tokens", label: "Tokens", align: "end" },
              ]}
              isEmpty={data.runs.length === 0}
              empty={<p className="muted">No calls yet.</p>}
            >
              {data.runs.map((run) => (
                <tr key={run.run_id}>
                  <td>{formatAbsolute(run.created_at ?? "")}</td>
                  <td>{run.staff_name}</td>
                  <td>{run.feature_label}</td>
                  <td>{SUBJECT_LABELS[run.subject_type] ?? run.subject_type}</td>
                  <td>{OUTCOME_LABELS[run.outcome] ?? run.outcome}</td>
                  <td>{VERDICT_LABELS[run.verdict] ?? run.verdict}</td>
                  <td className="num">{run.tokens.toLocaleString("en-GB")}</td>
                </tr>
              ))}
            </DataTable>
          </Section>
        </div>
      )}
    </>
  );
}
