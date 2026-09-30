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
import { readRisk, type RiskDetail } from "@/lib/api/trust";
import { formatAbsolute, formatDate } from "@/lib/format";
import { requestNow } from "@/lib/request-time";

export const metadata = { title: "Risk" };
export const dynamic = "force-dynamic";

type Params = Promise<{ riskId: string }>;

const SCALE = [1, 2, 3, 4, 5];

/**
 * One risk: its score and band, who owns it, what is being done, when it is next looked
 * at — and the decisions on it, each with who made it and why.
 */
export default async function RiskPage({ params }: { params: Params }) {
  const { riskId } = await params;
  const context = await requireStaff(`/trust/risks/${riskId}`);
  if (!hasCapability(context, "audit:read")) {
    return (
      <>
        <PageHeader title="Risk" />
        <Callout tone="neutral">The trust registers are kept by Admins and Owners.</Callout>
      </>
    );
  }
  let detail: RiskDetail | null = null;
  try {
    detail = await readRisk(context.token, riskId);
  } catch (error) {
    if (error instanceof HqApiRequestError && error.status === 404) notFound();
    if (!(error instanceof HqApiUnavailableError || error instanceof HqApiRequestError))
      throw error;
  }
  if (detail === null) {
    return (
      <>
        <PageHeader title="Risk" />
        <Callout tone="danger" role="alert">
          This risk could not be read just now.
        </Callout>
      </>
    );
  }
  const now = requestNow();
  const { risk } = detail;
  const canWrite = hasCapability(context, "hq:admin");
  const hidden = { register: "risk", record_id: risk.risk_id };
  const closed = risk.status === "closed";
  const decided = risk.status === "accepted" || risk.status === "closed";
  const acceptBlocked = risk.band === "critical" && !detail.can_accept_critical;

  return (
    <>
      <RecordHeader
        crumbs={[
          { href: "/trust", label: "Trust" },
          { href: "/trust/risks", label: "Risks" },
        ]}
        title={risk.title}
        status={
          <>
            <BandPill band={risk.band} /> <TrustPill state={risk.status} />
          </>
        }
        readouts={[
          { label: "Score", value: `${risk.likelihood} × ${risk.impact} = ${risk.score}` },
          { label: "Next review", value: formatDate(risk.review_due, "—") },
          { label: "Owner", value: risk.owner_name || "Nobody" },
        ]}
      />
      {risk.review_overdue && (
        <Callout tone="attention" compact>
          The review was due {formatDate(risk.review_due)}. Look at it again and record what you
          found.
        </Callout>
      )}
      <RecordGrid
        side={
          <Properties title="The risk">
            <Property label="Category">{risk.category_label}</Property>
            <Property label="Likelihood">{risk.likelihood} of 5</Property>
            <Property label="Impact">{risk.impact} of 5</Property>
            <Property label="Treatment">{risk.treatment_label}</Property>
            <Property label="Last reviewed">
              {formatAbsolute(risk.last_reviewed_at, "Never")}
            </Property>
            <Property label="Recorded">{formatDate(risk.created_at, "—")}</Property>
            {decided && risk.decided_by_name && (
              <Property label={risk.status === "accepted" ? "Accepted by" : "Closed by"}>
                {risk.decided_by_name}
              </Property>
            )}
          </Properties>
        }
      >
        {decided && risk.decision_reason && (
          <RecordSection
            id="decision"
            title={risk.status === "accepted" ? "Why it is accepted" : "Why it is closed"}
          >
            <p className="prewrap">{risk.decision_reason}</p>
          </RecordSection>
        )}
        <RecordSection id="about" title="What could go wrong">
          <p className="prewrap">{risk.description || "No more detail recorded."}</p>
        </RecordSection>
        <RecordSection id="plan" title="What is being done">
          <p className="prewrap">{risk.treatment_plan || "No treatment plan yet."}</p>
        </RecordSection>

        {canWrite && (
          <RecordSection id="work" title="Work it">
            <div className="form-grid">
              {!closed && (
                <Card
                  title="Review it"
                  titleAs="h3"
                  description={`Say what you looked at. The next review is set from the band (${detail.review_days[risk.band] ?? "—"} days now).`}
                >
                  <ActForm
                    action={actOnTrustRecordAction}
                    hidden={hidden}
                    act="review"
                    label="Record the review"
                  >
                    <Field id="review-note" label="What you looked at, and found">
                      <Textarea id="review-note" name="note" rows={2} maxLength={2000} />
                    </Field>
                    <div className="form-grid">
                      <Field id="review-likelihood" label="Likelihood now">
                        <Select
                          id="review-likelihood"
                          name="likelihood"
                          defaultValue={String(risk.likelihood)}
                        >
                          {SCALE.map((value) => (
                            <option key={value} value={value}>
                              {value}
                            </option>
                          ))}
                        </Select>
                      </Field>
                      <Field id="review-impact" label="Impact now">
                        <Select id="review-impact" name="impact" defaultValue={String(risk.impact)}>
                          {SCALE.map((value) => (
                            <option key={value} value={value}>
                              {value}
                            </option>
                          ))}
                        </Select>
                      </Field>
                    </div>
                  </ActForm>
                </Card>
              )}
              {risk.status === "open" && (
                <Card
                  title="Start treating it"
                  titleAs="h3"
                  description="The plan, as it will be carried out."
                >
                  <ActForm
                    action={actOnTrustRecordAction}
                    hidden={hidden}
                    act="treat"
                    label="Mark as being treated"
                  >
                    <Field id="treat-plan" label="The plan">
                      <Textarea
                        id="treat-plan"
                        name="treatment_plan"
                        rows={2}
                        maxLength={2000}
                        defaultValue={risk.treatment_plan}
                      />
                    </Field>
                  </ActForm>
                </Card>
              )}
              {!decided && (
                <Card
                  title="Accept it"
                  titleAs="h3"
                  description={
                    acceptBlocked
                      ? "A critical risk is accepted by an owner."
                      : "Living with it is a decision: say why. It is still reviewed on its date."
                  }
                >
                  <ActForm
                    action={actOnTrustRecordAction}
                    hidden={hidden}
                    act="accept"
                    label="Accept the risk"
                    disabled={acceptBlocked}
                  >
                    <Field id="accept-reason" label="Why living with it is right">
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
              {!closed && (
                <Card title="Close it" titleAs="h3" description="It no longer applies: say why.">
                  <ActForm
                    action={actOnTrustRecordAction}
                    hidden={hidden}
                    act="close"
                    label="Close"
                    danger
                  >
                    <Field id="close-reason" label="Why it no longer applies">
                      <Textarea id="close-reason" name="reason" rows={2} maxLength={400} />
                    </Field>
                  </ActForm>
                </Card>
              )}
              {decided && (
                <Card title="Reopen it" titleAs="h3" description="Something changed: say what.">
                  <ActForm
                    action={actOnTrustRecordAction}
                    hidden={hidden}
                    act="reopen"
                    label="Reopen"
                  >
                    <Field id="reopen-reason" label="What changed">
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
                  <Field id="risk-note" label="Note">
                    <Textarea id="risk-note" name="note" rows={2} maxLength={2000} />
                  </Field>
                </ActForm>
              </Card>
            </div>
            {!closed && (
              <details className="disclosure">
                <summary>Edit the risk</summary>
                <ActForm
                  action={actOnTrustRecordAction}
                  hidden={hidden}
                  act="update"
                  label="Save changes"
                  tight={false}
                >
                  <Field id="edit-title" label="What could go wrong">
                    <Input id="edit-title" name="title" maxLength={200} defaultValue={risk.title} />
                  </Field>
                  <div className="form-grid">
                    <Field id="edit-category" label="Category">
                      <Select id="edit-category" name="category" defaultValue={risk.category}>
                        {detail.categories.map((item) => (
                          <option key={item.value} value={item.value}>
                            {item.label}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <Field id="edit-owner" label="Owner">
                      <Select
                        id="edit-owner"
                        name="owner_staff_id"
                        defaultValue={risk.owner_staff_id ?? ""}
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
                  <div className="form-grid">
                    <Field id="edit-likelihood" label="Likelihood">
                      <Select
                        id="edit-likelihood"
                        name="likelihood"
                        defaultValue={String(risk.likelihood)}
                      >
                        {SCALE.map((value) => (
                          <option key={value} value={value}>
                            {value}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <Field id="edit-impact" label="Impact">
                      <Select id="edit-impact" name="impact" defaultValue={String(risk.impact)}>
                        {SCALE.map((value) => (
                          <option key={value} value={value}>
                            {value}
                          </option>
                        ))}
                      </Select>
                    </Field>
                  </div>
                  <Field id="edit-plan" label="What is being done">
                    <Textarea
                      id="edit-plan"
                      name="treatment_plan"
                      rows={2}
                      maxLength={2000}
                      defaultValue={risk.treatment_plan}
                    />
                  </Field>
                  <Field id="edit-description" label="More detail">
                    <Textarea
                      id="edit-description"
                      name="description"
                      rows={3}
                      maxLength={2000}
                      defaultValue={risk.description}
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
