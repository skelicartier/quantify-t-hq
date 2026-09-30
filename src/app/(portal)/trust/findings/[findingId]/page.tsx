import Link from "next/link";
import { notFound } from "next/navigation";

import { actOnTrustRecordAction } from "@/app/(portal)/trust/actions";
import { EventTimeline } from "@/components/privacy/event-timeline";
import { PageHeader } from "@/components/shell/page-header";
import { BandPill, TRUST_EVENT_LABELS, TrustPill } from "@/components/trust/trust-parts";
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
import { readFinding, type FindingDetail } from "@/lib/api/trust";
import { formatDate } from "@/lib/format";
import { requestNow } from "@/lib/request-time";

export const metadata = { title: "Finding" };
export const dynamic = "force-dynamic";

type Params = Promise<{ findingId: string }>;

/** One finding: its deadline, who owns it, and how it ended — or why it has not. */
export default async function FindingPage({ params }: { params: Params }) {
  const { findingId } = await params;
  const context = await requireStaff(`/trust/findings/${findingId}`);
  if (!hasCapability(context, "audit:read")) {
    return (
      <>
        <PageHeader title="Finding" />
        <Callout tone="neutral">The trust registers are kept by Admins and Owners.</Callout>
      </>
    );
  }
  let detail: FindingDetail | null = null;
  try {
    detail = await readFinding(context.token, findingId);
  } catch (error) {
    if (error instanceof HqApiRequestError && error.status === 404) notFound();
    if (!(error instanceof HqApiUnavailableError || error instanceof HqApiRequestError))
      throw error;
  }
  if (detail === null) {
    return (
      <>
        <PageHeader title="Finding" />
        <Callout tone="danger" role="alert">
          This finding could not be read just now.
        </Callout>
      </>
    );
  }
  const now = requestNow();
  const today = new Date(now).toISOString().slice(0, 10);
  const { finding, continuity_test: test } = detail;
  const canWrite = hasCapability(context, "hq:admin");
  const hidden = { register: "finding", record_id: finding.finding_id };
  const live = finding.status === "open" || finding.status === "in_progress";
  const acceptBlocked = finding.severity === "critical" && !detail.can_accept_critical;
  const deadline =
    finding.days_left === null
      ? "—"
      : finding.days_left < 0
        ? `${-finding.days_left} days late`
        : `${finding.days_left} days left`;

  return (
    <>
      <RecordHeader
        crumbs={[
          { href: "/trust", label: "Trust" },
          { href: "/trust/findings", label: "Findings" },
        ]}
        title={finding.title}
        status={
          <>
            <BandPill band={finding.severity} /> <TrustPill state={finding.status} />
          </>
        }
        readouts={[
          { label: "Fix by", value: formatDate(finding.due_on, "—") },
          {
            label: "Deadline",
            value: live ? deadline : finding.status === "fixed" ? "Fixed" : "Accepted",
          },
          { label: "Owner", value: finding.owner_name || "Nobody" },
        ]}
      />
      {finding.overdue && (
        <Callout tone="danger" compact>
          Past its deadline of {formatDate(finding.due_on)}. Fix it, or accept it with a reason.
        </Callout>
      )}
      <RecordGrid
        side={
          <Properties title="The finding">
            <Property label="Found by">{finding.source_label}</Property>
            <Property label="Found on">{formatDate(finding.found_on, "—")}</Property>
            <Property label="Window">{detail.windows[finding.severity] ?? "—"} days</Property>
            {finding.fixed_on && (
              <Property label="Fixed on">{formatDate(finding.fixed_on)}</Property>
            )}
            {finding.status === "accepted" && (
              <Property label="Accepted by">{finding.decided_by_name || "—"}</Property>
            )}
          </Properties>
        }
      >
        <RecordSection id="about" title="What is wrong">
          <p className="prewrap">{finding.description || "No more detail recorded."}</p>
        </RecordSection>
        {test && (
          <RecordSection id="test" title="The continuity test that found it">
            <p>
              <Link href="/trust/continuity">{test.kind_label}</Link> on{" "}
              {formatDate(test.performed_on, "—")}: {test.scenario}.{" "}
              {test.target_minutes !== null && test.actual_minutes !== null
                ? `Aimed for ${test.target_minutes} minutes, took ${test.actual_minutes}.`
                : ""}
            </p>
          </RecordSection>
        )}
        {finding.status === "fixed" && (
          <RecordSection id="evidence" title="How we know it is fixed">
            <p className="prewrap">{finding.evidence}</p>
          </RecordSection>
        )}
        {finding.status === "accepted" && (
          <RecordSection id="decision" title="Why it is not being fixed">
            <p className="prewrap">{finding.decision_reason}</p>
          </RecordSection>
        )}

        {canWrite && (
          <RecordSection id="work" title="Work it">
            <div className="form-grid">
              {finding.status === "open" && (
                <Card title="Start on it" titleAs="h3" description="Someone is working on the fix.">
                  <ActForm
                    action={actOnTrustRecordAction}
                    hidden={hidden}
                    act="start"
                    label="Mark in progress"
                  />
                </Card>
              )}
              {live && (
                <Card
                  title="It is fixed"
                  titleAs="h3"
                  description="Name the evidence: the change, the retest, the document."
                >
                  <ActForm
                    action={actOnTrustRecordAction}
                    hidden={hidden}
                    act="fix"
                    label="Mark fixed"
                    primary
                  >
                    <Field id="fix-evidence" label="Evidence">
                      <Textarea id="fix-evidence" name="evidence" rows={2} maxLength={1000} />
                    </Field>
                    <Field id="fix-on" label="Fixed on">
                      <Input
                        id="fix-on"
                        name="fixed_on"
                        type="date"
                        defaultValue={today}
                        max={today}
                      />
                    </Field>
                  </ActForm>
                </Card>
              )}
              {live && (
                <Card
                  title="Accept it instead"
                  titleAs="h3"
                  description={
                    acceptBlocked
                      ? "A critical finding is accepted by an owner."
                      : "Not fixing it is a decision: say why."
                  }
                >
                  <ActForm
                    action={actOnTrustRecordAction}
                    hidden={hidden}
                    act="accept"
                    label="Accept the finding"
                    disabled={acceptBlocked}
                  >
                    <Field id="accept-reason" label="Why it is not being fixed">
                      <Textarea
                        id="accept-reason"
                        name="reason"
                        rows={2}
                        maxLength={400}
                        disabled={acceptBlocked}
                      />
                    </Field>
                  </ActForm>
                </Card>
              )}
              {!live && (
                <Card title="Reopen it" titleAs="h3" description="It is back: say what showed it.">
                  <ActForm
                    action={actOnTrustRecordAction}
                    hidden={hidden}
                    act="reopen"
                    label="Reopen"
                  >
                    <Field id="reopen-reason" label="What showed it is not settled">
                      <Textarea id="reopen-reason" name="reason" rows={2} maxLength={400} />
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
                  <Field id="finding-note" label="Note">
                    <Textarea id="finding-note" name="note" rows={2} maxLength={2000} />
                  </Field>
                </ActForm>
              </Card>
            </div>
            {live && (
              <details className="disclosure">
                <summary>Edit the finding</summary>
                <ActForm
                  action={actOnTrustRecordAction}
                  hidden={hidden}
                  act="update"
                  label="Save changes"
                  tight={false}
                >
                  <Field id="edit-title" label="What is wrong">
                    <Input
                      id="edit-title"
                      name="title"
                      maxLength={200}
                      defaultValue={finding.title}
                    />
                  </Field>
                  <div className="form-grid">
                    <Field
                      id="edit-severity"
                      label="Severity"
                      hint="A new severity moves the deadline, counted from the day it was found."
                    >
                      <Select id="edit-severity" name="severity" defaultValue={finding.severity}>
                        {detail.severities.map((severity) => (
                          <option key={severity} value={severity}>
                            {severity.charAt(0).toUpperCase() + severity.slice(1)} ·{" "}
                            {detail.windows[severity]} days
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <Field id="edit-owner" label="Owner">
                      <Select
                        id="edit-owner"
                        name="owner_staff_id"
                        defaultValue={finding.owner_staff_id ?? ""}
                      >
                        <option value="">Nobody</option>
                        {detail.staff.map((person) => (
                          <option key={person.staff_id} value={person.staff_id}>
                            {person.name}
                          </option>
                        ))}
                      </Select>
                    </Field>
                  </div>
                  <Field id="edit-description" label="Detail">
                    <Textarea
                      id="edit-description"
                      name="description"
                      rows={3}
                      maxLength={2000}
                      defaultValue={finding.description}
                    />
                  </Field>
                </ActForm>
              </details>
            )}
          </RecordSection>
        )}

        <RecordSection id="timeline" title="Timeline">
          <EventTimeline events={detail.events} labels={TRUST_EVENT_LABELS} now={now} />
        </RecordSection>
      </RecordGrid>
    </>
  );
}
