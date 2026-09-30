import { notFound } from "next/navigation";

import { actOnTrustRecordAction } from "@/app/(portal)/trust/actions";
import { EventTimeline } from "@/components/privacy/event-timeline";
import { PageHeader } from "@/components/shell/page-header";
import { CopyAnswer } from "@/components/trust/copy-answer";
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
import { readAnswer, type AnswerDetail } from "@/lib/api/trust";
import { formatAbsolute, formatDate } from "@/lib/format";
import { requestNow } from "@/lib/request-time";

export const metadata = { title: "Answer" };
export const dynamic = "force-dynamic";

type Params = Promise<{ answerId: string }>;

const STATE_NOTE: Record<string, string> = {
  draft: "Not approved: not for sending yet.",
  expired: "Its approval ran out. An admin re-approves it, or it is changed first.",
  archived: "Archived: no longer offered in the library.",
};

/** One approved answer: its words, its evidence, who approved it and until when. */
export default async function AnswerPage({ params }: { params: Params }) {
  const { answerId } = await params;
  const context = await requireStaff(`/trust/answers/${answerId}`);
  if (!hasCapability(context, "crm:read")) {
    return (
      <>
        <PageHeader title="Answer" />
        <Callout tone="neutral">The answer library is for the team that answers customers.</Callout>
      </>
    );
  }
  let detail: AnswerDetail | null = null;
  try {
    detail = await readAnswer(context.token, answerId);
  } catch (error) {
    if (error instanceof HqApiRequestError && error.status === 404) notFound();
    if (!(error instanceof HqApiUnavailableError || error instanceof HqApiRequestError))
      throw error;
  }
  if (detail === null) {
    return (
      <>
        <PageHeader title="Answer" />
        <Callout tone="danger" role="alert">
          This answer could not be read just now.
        </Callout>
      </>
    );
  }
  const now = requestNow();
  const { answer } = detail;
  const hidden = { register: "answer", record_id: answer.answer_id };
  const archived = answer.state === "archived";

  return (
    <>
      <RecordHeader
        crumbs={[{ href: "/trust/answers", label: "Answer library" }]}
        title={answer.question}
        status={<TrustPill state={answer.state} />}
        readouts={[
          { label: "Topic", value: answer.topic_label },
          {
            label: "Approved until",
            value: answer.approved_at ? formatDate(answer.review_due, "—") : "Not approved",
          },
          { label: "Keeps it current", value: answer.owner_name || "Nobody" },
        ]}
      />
      {STATE_NOTE[answer.state] && (
        <Callout tone={answer.state === "expired" ? "attention" : "neutral"} compact>
          {STATE_NOTE[answer.state]}
        </Callout>
      )}
      <RecordGrid
        side={
          <Properties title="Approval">
            <Property label="Approved by">{answer.approved_by_name || "—"}</Property>
            <Property label="Approved">{formatAbsolute(answer.approved_at, "—")}</Property>
            <Property label="Re-approve by">{formatDate(answer.review_due, "—")}</Property>
            <Property label="Last changed">{formatAbsolute(answer.updated_at, "—")}</Property>
          </Properties>
        }
      >
        <RecordSection
          id="answer"
          title="The answer"
          actions={answer.state === "approved" ? <CopyAnswer text={answer.answer} /> : undefined}
        >
          <p className="prewrap">{answer.answer}</p>
        </RecordSection>
        <RecordSection id="evidence" title="Evidence behind it">
          <p>{answer.evidence || "None recorded."}</p>
        </RecordSection>

        {(detail.can_write || detail.can_approve) && (
          <RecordSection id="work" title="Work it">
            <div className="form-grid">
              {detail.can_approve && !archived && answer.state !== "approved" && (
                <Card
                  title="Approve it"
                  titleAs="h3"
                  description="You have checked the words against how things are today. The approval lasts a year."
                >
                  <ActForm
                    action={actOnTrustRecordAction}
                    hidden={hidden}
                    act="approve"
                    label="Approve"
                    primary
                  />
                </Card>
              )}
              {detail.can_approve && (
                <Card
                  title={archived ? "Restore it" : "Archive it"}
                  titleAs="h3"
                  description={
                    archived
                      ? "Offer it in the library again."
                      : "It no longer holds and should not be offered."
                  }
                >
                  <ActForm
                    action={actOnTrustRecordAction}
                    hidden={hidden}
                    act={archived ? "restore" : "archive"}
                    label={archived ? "Restore" : "Archive"}
                  />
                </Card>
              )}
              {detail.can_write && (
                <Card title="A note on the timeline" titleAs="h3">
                  <ActForm
                    action={actOnTrustRecordAction}
                    hidden={hidden}
                    act="note"
                    label="Add the note"
                  >
                    <Field id="answer-note" label="Note">
                      <Textarea id="answer-note" name="note" rows={2} maxLength={2000} />
                    </Field>
                  </ActForm>
                </Card>
              )}
            </div>
            {detail.can_write && !archived && (
              <details className="disclosure">
                <summary>Change the answer</summary>
                <p className="page-note">
                  New words need a new approval; the evidence, topic and owner do not.
                </p>
                <ActForm
                  action={actOnTrustRecordAction}
                  hidden={hidden}
                  act="update"
                  label="Save changes"
                  tight={false}
                >
                  <Field id="edit-question" label="The question">
                    <Input
                      id="edit-question"
                      name="question"
                      maxLength={400}
                      defaultValue={answer.question}
                    />
                  </Field>
                  <Field id="edit-answer" label="The answer">
                    <Textarea
                      id="edit-answer"
                      name="answer"
                      rows={6}
                      maxLength={4000}
                      defaultValue={answer.answer}
                    />
                  </Field>
                  <div className="form-grid">
                    <Field id="edit-topic" label="Topic">
                      <Select id="edit-topic" name="topic" defaultValue={answer.topic}>
                        {detail.topics.map((item) => (
                          <option key={item.value} value={item.value}>
                            {item.label}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <Field id="edit-owner" label="Keeps it current">
                      <Select
                        id="edit-owner"
                        name="owner_staff_id"
                        defaultValue={answer.owner_staff_id ?? ""}
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
                  <Field id="edit-evidence" label="Evidence behind it">
                    <Input
                      id="edit-evidence"
                      name="evidence"
                      maxLength={400}
                      defaultValue={answer.evidence}
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
