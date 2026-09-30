import { notFound } from "next/navigation";

import { actOnTrustRecordAction } from "@/app/(portal)/trust/actions";
import { EventTimeline } from "@/components/privacy/event-timeline";
import { PageHeader } from "@/components/shell/page-header";
import { TRUST_EVENT_LABELS, TrustPill } from "@/components/trust/trust-parts";
import { ActForm } from "@/components/ui/act-form";
import { Callout } from "@/components/ui/callout";
import { Card } from "@/components/ui/card";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import {
  Properties,
  Property,
  RecordGrid,
  RecordHeader,
  RecordSection,
} from "@/components/ui/record-shell";
import { hasCapability, requireStaff } from "@/lib/access/core";
import { HqApiRequestError, HqApiUnavailableError } from "@/lib/api/core";
import { readChange, type ChangeDetail } from "@/lib/api/trust";
import { formatAbsolute } from "@/lib/format";
import { requestNow } from "@/lib/request-time";

export const metadata = { title: "Change" };
export const dynamic = "force-dynamic";

type Params = Promise<{ changeId: string }>;

/** One production change: what, where, how risky, how it is undone, who approved it. */
export default async function ChangePage({ params }: { params: Params }) {
  const { changeId } = await params;
  const context = await requireStaff(`/trust/changes/${changeId}`);
  if (!hasCapability(context, "audit:read")) {
    return (
      <>
        <PageHeader title="Change" />
        <Callout tone="neutral">The trust registers are kept by Admins and Owners.</Callout>
      </>
    );
  }
  let detail: ChangeDetail | null = null;
  try {
    detail = await readChange(context.token, changeId);
  } catch (error) {
    if (error instanceof HqApiRequestError && error.status === 404) notFound();
    if (!(error instanceof HqApiUnavailableError || error instanceof HqApiRequestError))
      throw error;
  }
  if (detail === null) {
    return (
      <>
        <PageHeader title="Change" />
        <Callout tone="danger" role="alert">
          This change could not be read just now.
        </Callout>
      </>
    );
  }
  const now = requestNow();
  const { change } = detail;
  const canWrite = hasCapability(context, "hq:admin");
  const hidden = { register: "change", record_id: change.change_id };
  const needsApproval = change.approval === "awaiting" || change.approval === "retrospective";
  const outcomes = detail.outcomes.filter(
    (item) => item.value !== "planned" && item.value !== change.outcome,
  );

  return (
    <>
      <RecordHeader
        crumbs={[
          { href: "/trust", label: "Trust" },
          { href: "/trust/changes", label: "Changes" },
        ]}
        title={change.title}
        status={
          <>
            <TrustPill state={change.outcome} /> <TrustPill state={change.approval} />
          </>
        }
        readouts={[
          {
            label: change.outcome === "planned" ? "Planned for" : "When",
            value: formatAbsolute(change.happened_at, "—"),
          },
          { label: "Risk", value: change.risk.charAt(0).toUpperCase() + change.risk.slice(1) },
          { label: "Where", value: change.system },
        ]}
      />
      {change.approval === "awaiting" && (
        <Callout tone="attention" compact>
          High risk: it waits for a second person&apos;s approval before it goes ahead.
          {change.recorded_by_you ? " You recorded it, so someone else approves it." : ""}
        </Callout>
      )}
      {change.approval === "retrospective" && (
        <Callout tone="danger" compact>
          High risk, and it went ahead without approval. It stays flagged until someone other than{" "}
          {change.recorded_by_you ? "you" : change.recorded_by_name} approves it.
        </Callout>
      )}
      <RecordGrid
        side={
          <Properties title="The change">
            <Property label="Kind">{change.kind_label}</Property>
            <Property label="Recorded by">{change.recorded_by_name}</Property>
            <Property label="Approved by">
              {change.approved_by_name
                ? `${change.approved_by_name}, ${formatAbsolute(change.approved_at, "")}`
                : change.approval === "not_needed"
                  ? "Not needed"
                  : "Nobody yet"}
            </Property>
            {change.incident_reference && (
              <Property label="Incident" mono>
                {change.incident_reference}
              </Property>
            )}
          </Properties>
        }
      >
        <RecordSection id="about" title="What changed">
          <p className="prewrap">{change.description || "No more detail recorded."}</p>
        </RecordSection>
        <RecordSection id="rollback" title="How it is undone">
          <p className="prewrap">{change.rollback_plan || "Not recorded (low risk)."}</p>
        </RecordSection>

        {canWrite && (
          <RecordSection id="work" title="Work it">
            <div className="form-grid">
              {needsApproval && (
                <Card
                  title="Approve it"
                  titleAs="h3"
                  description={
                    change.recorded_by_you
                      ? "You recorded this change, so the approval has to come from someone else."
                      : change.approval === "retrospective"
                        ? "It already went ahead: approving it records that you have looked at it after the fact."
                        : "You have read what it does and how it is undone."
                  }
                >
                  <ActForm
                    action={actOnTrustRecordAction}
                    hidden={hidden}
                    act="approve"
                    label="Approve"
                    primary
                    disabled={change.recorded_by_you}
                  >
                    <Field id="approve-note" label="Note">
                      <Input
                        id="approve-note"
                        name="note"
                        maxLength={2000}
                        disabled={change.recorded_by_you}
                      />
                    </Field>
                  </ActForm>
                </Card>
              )}
              {outcomes.length > 0 && (
                <Card
                  title={change.outcome === "planned" ? "It happened" : "Correct the outcome"}
                  titleAs="h3"
                  description={
                    change.approval === "awaiting"
                      ? "It can be recorded as done once someone else approves it."
                      : "How it went."
                  }
                >
                  <ActForm
                    action={actOnTrustRecordAction}
                    hidden={hidden}
                    act="outcome"
                    label="Record the outcome"
                  >
                    <Field id="outcome-value" label="Outcome">
                      <Select id="outcome-value" name="outcome" defaultValue={outcomes[0]?.value}>
                        {outcomes.map((item) => (
                          <option key={item.value} value={item.value}>
                            {item.label}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <Field id="outcome-incident" label="Incident reference">
                      <Input
                        id="outcome-incident"
                        name="incident_reference"
                        maxLength={64}
                        defaultValue={change.incident_reference}
                      />
                    </Field>
                    <Field id="outcome-note" label="Note">
                      <Textarea id="outcome-note" name="note" rows={2} maxLength={2000} />
                    </Field>
                  </ActForm>
                </Card>
              )}
              <Card title="A note on the timeline" titleAs="h3">
                <ActForm
                  action={actOnTrustRecordAction}
                  hidden={hidden}
                  act="note"
                  label="Add the note"
                >
                  <Field id="change-note" label="Note">
                    <Textarea id="change-note" name="note" rows={2} maxLength={2000} />
                  </Field>
                </ActForm>
              </Card>
            </div>
          </RecordSection>
        )}

        <RecordSection id="timeline" title="Timeline">
          <EventTimeline events={detail.events} labels={TRUST_EVENT_LABELS} now={now} />
        </RecordSection>
      </RecordGrid>
    </>
  );
}
