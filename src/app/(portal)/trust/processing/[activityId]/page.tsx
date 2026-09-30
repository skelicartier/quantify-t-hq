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
import { readActivity, type ProcessingDetail } from "@/lib/api/trust";
import { formatAbsolute, formatDate } from "@/lib/format";
import { requestNow } from "@/lib/request-time";

export const metadata = { title: "Processing activity" };
export const dynamic = "force-dynamic";

type Params = Promise<{ activityId: string }>;

/** One line of the record of processing, its yearly review and its history. */
export default async function ActivityPage({ params }: { params: Params }) {
  const { activityId } = await params;
  const context = await requireStaff(`/trust/processing/${activityId}`);
  if (!hasCapability(context, "privacy:read")) {
    return (
      <>
        <PageHeader title="Processing activity" />
        <Callout tone="neutral">
          The record of processing is kept by Support, Admins and Owners.
        </Callout>
      </>
    );
  }
  let detail: ProcessingDetail | null = null;
  try {
    detail = await readActivity(context.token, activityId);
  } catch (error) {
    if (error instanceof HqApiRequestError && error.status === 404) notFound();
    if (!(error instanceof HqApiUnavailableError || error instanceof HqApiRequestError))
      throw error;
  }
  if (detail === null) {
    return (
      <>
        <PageHeader title="Processing activity" />
        <Callout tone="danger" role="alert">
          This activity could not be read just now.
        </Callout>
      </>
    );
  }
  const now = requestNow();
  const { activity } = detail;
  const canWrite = hasCapability(context, "privacy:write");
  const hidden = { register: "processing", record_id: activity.activity_id };

  return (
    <>
      <RecordHeader
        crumbs={[{ href: "/trust/processing", label: "Record of processing" }]}
        title={activity.name}
        status={
          activity.archived ? (
            <TrustPill state="archived" />
          ) : activity.review_owed ? (
            <TrustPill state="due" />
          ) : (
            <TrustPill state="ok" />
          )
        }
        readouts={[
          { label: "Lawful basis", value: activity.lawful_basis_label },
          { label: "Reviewed", value: formatDate(activity.reviewed_at, "Never") },
          {
            label: "Next review",
            value: activity.review_owed ? "Now" : formatDate(activity.review_due, "—"),
          },
        ]}
      />
      {activity.review_owed && (
        <Callout tone="attention" compact>
          Not reviewed this year. Check it against how the data is really used, then record the
          review.
        </Callout>
      )}
      <RecordGrid
        side={
          <Properties title="The record">
            <Property label="Owner">{activity.owner_name || "Nobody"}</Property>
            <Property label="Last changed">{formatAbsolute(activity.updated_at, "—")}</Property>
          </Properties>
        }
      >
        <RecordSection id="purpose" title="Why the data is used">
          <p className="prewrap">{activity.purpose}</p>
        </RecordSection>
        <RecordSection id="data" title="Whose data, and which">
          <dl className="props__list">
            <div className="prop">
              <dt className="prop__label">Whose</dt>
              <dd className="prop__value">{activity.data_subjects}</dd>
            </div>
            <div className="prop">
              <dt className="prop__label">Which</dt>
              <dd className="prop__value">{activity.data_categories}</dd>
            </div>
            <div className="prop">
              <dt className="prop__label">Shared with</dt>
              <dd className="prop__value">{activity.recipients || "Nobody outside"}</dd>
            </div>
            <div className="prop">
              <dt className="prop__label">Sent abroad</dt>
              <dd className="prop__value">{activity.transfers || "No"}</dd>
            </div>
            <div className="prop">
              <dt className="prop__label">Kept for</dt>
              <dd className="prop__value">{activity.retention}</dd>
            </div>
            <div className="prop">
              <dt className="prop__label">Protected by</dt>
              <dd className="prop__value">{activity.security_measures || "Not recorded"}</dd>
            </div>
          </dl>
        </RecordSection>

        {canWrite && (
          <RecordSection id="work" title="Work it">
            <div className="form-grid">
              {!activity.archived && (
                <Card
                  title="Review it"
                  titleAs="h3"
                  description="Checked against how the data is really used today. The next review is a year on."
                >
                  <ActForm
                    action={actOnTrustRecordAction}
                    hidden={hidden}
                    act="review"
                    label="Record the review"
                    primary
                  >
                    <Field id="review-note" label="What you checked">
                      <Textarea id="review-note" name="note" rows={2} maxLength={2000} />
                    </Field>
                  </ActForm>
                </Card>
              )}
              {activity.archived ? (
                <Card title="Restore it" titleAs="h3" description="The activity has started again.">
                  <ActForm
                    action={actOnTrustRecordAction}
                    hidden={hidden}
                    act="restore"
                    label="Restore"
                  />
                </Card>
              ) : (
                <Card
                  title="It stopped"
                  titleAs="h3"
                  description="Kept on the record as stopped, with why."
                >
                  <ActForm
                    action={actOnTrustRecordAction}
                    hidden={hidden}
                    act="archive"
                    label="Mark as stopped"
                    danger
                  >
                    <Field id="archive-reason" label="Why it stopped">
                      <Textarea id="archive-reason" name="reason" rows={2} maxLength={400} />
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
                  <Field id="activity-note" label="Note">
                    <Textarea id="activity-note" name="note" rows={2} maxLength={2000} />
                  </Field>
                </ActForm>
              </Card>
            </div>
            {!activity.archived && (
              <details className="disclosure">
                <summary>Edit the activity</summary>
                <ActForm
                  action={actOnTrustRecordAction}
                  hidden={hidden}
                  act="update"
                  label="Save changes"
                  tight={false}
                >
                  <div className="form-grid">
                    <Field id="edit-name" label="Activity">
                      <Input
                        id="edit-name"
                        name="name"
                        maxLength={160}
                        defaultValue={activity.name}
                      />
                    </Field>
                    <Field id="edit-basis" label="Lawful basis">
                      <Select
                        id="edit-basis"
                        name="lawful_basis"
                        defaultValue={activity.lawful_basis}
                      >
                        {detail.bases.map((item) => (
                          <option key={item.value} value={item.value}>
                            {item.label}
                          </option>
                        ))}
                      </Select>
                    </Field>
                  </div>
                  <Field id="edit-purpose" label="Why the data is used">
                    <Textarea
                      id="edit-purpose"
                      name="purpose"
                      rows={2}
                      maxLength={1000}
                      defaultValue={activity.purpose}
                    />
                  </Field>
                  <div className="form-grid">
                    <Field id="edit-subjects" label="Whose data">
                      <Input
                        id="edit-subjects"
                        name="data_subjects"
                        maxLength={400}
                        defaultValue={activity.data_subjects}
                      />
                    </Field>
                    <Field id="edit-categories" label="Which data">
                      <Input
                        id="edit-categories"
                        name="data_categories"
                        maxLength={400}
                        defaultValue={activity.data_categories}
                      />
                    </Field>
                  </div>
                  <div className="form-grid">
                    <Field id="edit-recipients" label="Shared with">
                      <Input
                        id="edit-recipients"
                        name="recipients"
                        maxLength={400}
                        defaultValue={activity.recipients}
                      />
                    </Field>
                    <Field id="edit-transfers" label="Sent abroad, and the safeguard">
                      <Input
                        id="edit-transfers"
                        name="transfers"
                        maxLength={400}
                        defaultValue={activity.transfers}
                      />
                    </Field>
                  </div>
                  <Field id="edit-retention" label="How long it is kept">
                    <Input
                      id="edit-retention"
                      name="retention"
                      maxLength={400}
                      defaultValue={activity.retention}
                    />
                  </Field>
                  <Field id="edit-security" label="How it is protected">
                    <Textarea
                      id="edit-security"
                      name="security_measures"
                      rows={2}
                      maxLength={1000}
                      defaultValue={activity.security_measures}
                    />
                  </Field>
                  <Field id="edit-owner" label="Owner">
                    <Select
                      id="edit-owner"
                      name="owner_staff_id"
                      defaultValue={activity.owner_staff_id ?? ""}
                    >
                      <option value="">Nobody</option>
                      {detail.staff.map((person) => (
                        <option key={person.staff_id} value={person.staff_id}>
                          {person.name}
                        </option>
                      ))}
                    </Select>
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
