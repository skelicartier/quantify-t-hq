import {
  confirmSudoAction,
  runRetentionAction,
  signEveryoneOutAction,
  updateRetentionAction,
} from "@/app/(portal)/admin/actions";
import { AdminTabs } from "@/components/admin/admin-tabs";
import {
  RetentionRulesForm,
  RetentionRunForm,
  SignEveryoneOutForm,
} from "@/components/admin/danger-forms";
import { SudoGate } from "@/components/admin/sudo-gate";
import { PageHeader } from "@/components/shell/page-header";
import { Callout } from "@/components/ui/callout";
import { Card } from "@/components/ui/card";
import { KeyValue, KeyValueRow } from "@/components/ui/key-value";
import { Timestamp } from "@/components/ui/timestamp";
import { hasCapability, requireStaff } from "@/lib/access/core";
import { HqApiRequestError, HqApiUnavailableError } from "@/lib/api/core";
import { readRetention, type Retention } from "@/lib/api/settings";
import { formatAbsolute, formatDate } from "@/lib/format";
import { requestNow } from "@/lib/request-time";

export const metadata = { title: "Danger zone" };
export const dynamic = "force-dynamic";

const RULE_LABELS: Record<string, string> = {
  disqualified: "Disqualified leads",
  quiet: "Open leads nobody works",
};

function leads(count: number): string {
  return `${count} ${count === 1 ? "lead" : "leads"}`;
}

export default async function DangerZonePage() {
  const context = await requireStaff("/admin/danger");
  if (!hasCapability(context, "hq:admin")) {
    return (
      <>
        <PageHeader eyebrow="Admin" title="Danger zone" />
        <Callout tone="neutral">This page is for HQ admins.</Callout>
      </>
    );
  }
  let retention: Retention | null = null;
  try {
    retention = await readRetention(context.token);
  } catch (error) {
    if (!(error instanceof HqApiUnavailableError || error instanceof HqApiRequestError))
      throw error;
  }
  const now = requestNow();
  const fresh = context.me.sudo_fresh;
  const untilLabel = context.me.sudo_until
    ? (formatAbsolute(context.me.sudo_until).split(", ")[1] ?? null)
    : null;
  const days = Object.fromEntries((retention?.rules ?? []).map((rule) => [rule.rule, rule.days]));

  return (
    <>
      <PageHeader
        eyebrow="Admin"
        title="Danger zone"
        description="Acts that cannot be taken back. Each needs a fresh confirm-it's-you and a written reason; the two that cannot be undone also need their phrase typed out."
        actions={<AdminTabs current="/admin/danger" />}
      />
      <SudoGate
        action={confirmSudoAction}
        fresh={fresh}
        untilLabel={untilLabel}
        returnPath="/admin/danger"
        purpose="Everything on this page needs a fresh code from your authenticator app."
      />
      <div className="record-layout">
        <div className="record-layout__main">
          <Card
            title="Retention"
            titleAs="h2"
            description="Leads that never became anything are anonymised: the name, address and message go; the stage, source and dates stay, so the funnel still adds up. A converted lead is never reached, nor one with an open task on it. The rules run once a day by themselves."
          >
            {retention === null ? (
              <Callout tone="danger" compact>
                The retention rules could not be read just now. Nothing was changed.
              </Callout>
            ) : (
              <>
                <KeyValue columns={2}>
                  {retention.rules.map((rule) => (
                    <KeyValueRow key={rule.rule} label={RULE_LABELS[rule.rule] ?? rule.rule}>
                      {rule.days === 0
                        ? "Kept: this rule is off"
                        : `After ${rule.days} untouched days · ${rule.due} due now`}
                      {rule.untouched_since && (
                        <span className="table-sub">
                          Reaches leads untouched since {formatDate(rule.untouched_since)}
                        </span>
                      )}
                    </KeyValueRow>
                  ))}
                  <KeyValueRow label="Last run">
                    {retention.last_sweep ? (
                      <>
                        <Timestamp value={retention.last_sweep.at} now={now} mode="relative" />
                        <span className="table-sub">
                          {leads(retention.last_sweep.leads)} ·{" "}
                          {retention.last_sweep.by_staff ? "run by hand" : "the daily run"}
                        </span>
                      </>
                    ) : (
                      "No lead has been anonymised yet"
                    )}
                  </KeyValueRow>
                </KeyValue>
                <details className="integration-danger">
                  <summary>Change the rules</summary>
                  <RetentionRulesForm
                    action={updateRetentionAction}
                    rules={{ disqualified: days.disqualified ?? 0, quiet: days.quiet ?? 0 }}
                    minDays={retention.min_days}
                    maxDays={retention.max_days}
                    disabled={!fresh}
                  />
                </details>
              </>
            )}
          </Card>
          <Card
            title="Anonymise now"
            titleAs="h2"
            description="For when the daily run cannot wait. It applies the rules above exactly as the daily run would, and the audit log names every lead."
          >
            {retention === null ? (
              <p className="side-quiet">Unavailable until the rules can be read.</p>
            ) : (
              <RetentionRunForm
                action={runRetentionAction}
                phrase={retention.confirm_phrase}
                thisRun={retention.this_run}
                due={retention.due}
                batch={retention.batch}
                disabled={!fresh}
              />
            )}
          </Card>
          <Card
            title="Sign everyone out"
            titleAs="h2"
            description="Ends every session but yours, at once: the first move when a laptop or a password may be in the wrong hands. Colleagues sign in again with their authenticator app."
          >
            <SignEveryoneOutForm
              action={signEveryoneOutAction}
              phrase={retention?.sign_out_phrase ?? "sign everyone out"}
              disabled={!fresh}
            />
          </Card>
        </div>
        <aside className="record-layout__side">
          <Card title="Never deleted" titleAs="h3">
            <ul className="side-list">
              <li>The audit log. Nothing on this page, or anywhere in HQ, removes an audit row.</li>
              <li>Customers, contracts, deals and people. Retention reaches leads only.</li>
              <li>
                A lead itself. Anonymising empties its personal fields and keeps the row, so reports
                stay whole.
              </li>
            </ul>
          </Card>
          {retention && (
            <Callout tone="neutral" compact>
              The notification log keeps {retention.webhook_ledger_days} days of deliveries. It
              records what arrived, not work anyone did, and is trimmed by the same daily run.
            </Callout>
          )}
        </aside>
      </div>
    </>
  );
}
