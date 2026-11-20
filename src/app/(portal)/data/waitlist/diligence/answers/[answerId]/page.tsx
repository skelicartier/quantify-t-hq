import Link from "next/link";
import { notFound } from "next/navigation";

import { DataUnavailable } from "@/components/data/data-down";
import { AnswerFields } from "@/components/data/questionnaires/answer-fields";
import { QuestionnaireTabs } from "@/components/data/questionnaires/questionnaire-tabs";
import { PracticeNote } from "@/components/data/security/control-ref";
import { MailForm } from "@/components/mail/mail-form";
import { PageHeader } from "@/components/shell/page-header";
import { Callout } from "@/components/ui/callout";
import { Field, Input } from "@/components/ui/field";
import { Popover } from "@/components/ui/popover";
import { RecordHeader, RecordSection } from "@/components/ui/record-shell";
import { RowAction } from "@/components/ui/row-action";
import { StatusPill } from "@/components/ui/status-pill";
import { Timestamp } from "@/components/ui/timestamp";
import { DATA_ROLE_LINE, requireData } from "@/lib/data/access";
import { readAnswer, type AnswerPage } from "@/lib/data/api/questionnaires";
import { dayWords } from "@/lib/data/labels-company";
import { NOT_ADVICE } from "@/lib/data/labels-controls";
import {
  ANSWER_STATE_WORDS,
  SHORT_WORDS,
  SSRM_WORDS,
  TOPIC_WORDS,
  outOfDateWords,
  reviewDueWords,
} from "@/lib/data/labels-questionnaires";
import { dataRead } from "@/lib/data/read";
import { requestNow } from "@/lib/request-time";

import { approveAnswerAction, archiveAnswerAction, updateAnswerAction } from "../actions";
import "@/components/data/closing/closing.css";
import "@/components/data/questionnaires/questionnaires.css";

export const metadata = { title: "Answer" };
export const dynamic = "force-dynamic";

const BASE = "/data/waitlist/diligence/answers";
const ID = /^[A-Za-z0-9-]{1,64}$/;

const VERBS: Record<string, string> = {
  added: "Added",
  edited: "Edited",
  approved: "Approved",
  archived: "Archived",
  restored: "Restored",
};

export default async function AnswerRecordPage({
  params,
}: {
  params: Promise<{ answerId: string }>;
}) {
  const { answerId } = await params;
  const { allowed, context } = await requireData(`${BASE}/${answerId}`);
  if (!ID.test(answerId)) notFound();
  const now = requestNow();
  const read = allowed ? await dataRead(() => readAnswer(answerId)) : null;
  if (!allowed || !read || !read.ok)
    return (
      <>
        <PageHeader title="Answer" />
        <div className="page-content">
          {!allowed || !read ? (
            <Callout tone="neutral">{DATA_ROLE_LINE}</Callout>
          ) : (
            !read.ok && <DataUnavailable failure={read} />
          )}
        </div>
      </>
    );
  const me = context.me.staff.display_name || context.me.staff.email;
  return <Answer page={read.data} now={now} me={me} />;
}

function Answer({ page, now, me }: { page: AnswerPage; now: number; me: string }) {
  const { answer, today } = page;
  const fields = { answer_id: answer.answer_id };
  const archived = answer.state === "archived";
  return (
    <div className="hqdata-questionnaires">
      <RecordHeader
        crumbs={[
          { href: "/data/waitlist/diligence", label: "Diligence" },
          { href: BASE, label: "Answer library" },
        ]}
        title={<span className="hqdata-qtext">{answer.question}</span>}
        status={
          <StatusPill
            value={answer.state}
            label={ANSWER_STATE_WORDS[answer.state]}
            tone={answer.state === "approved" ? "live" : "neutral"}
          />
        }
        readouts={[
          { label: "Short answer", value: SHORT_WORDS[answer.short] || "None" },
          {
            label: "Approved",
            value: answer.approved
              ? `${dayWords(answer.approved.on)} by ${answer.approved.by_name}`
              : "Not yet",
          },
          { label: "Review by", value: answer.review_by ? dayWords(answer.review_by) : "None" },
        ]}
        actions={
          <span className="hqdata-actions">
            {!archived && (
              <Popover
                label={answer.state === "approved" ? "Approve again" : "Approve"}
                align="start"
              >
                <MailForm
                  action={approveAnswerAction}
                  fields={fields}
                  submitLabel="Approve"
                  pendingLabel="Approving…"
                  variant="primary"
                >
                  <Field id="approve-by" label="Approved by">
                    <Input
                      id="approve-by"
                      name="by_name"
                      maxLength={120}
                      defaultValue={me}
                      required
                    />
                  </Field>
                  <Field id="approve-on" label="On" hint="Today when left blank.">
                    <Input id="approve-on" name="on" type="date" max={today} />
                  </Field>
                  <Field
                    id="approve-review"
                    label="Read it again by"
                    hint="Blank: a year after it was approved, or your own months."
                  >
                    <Input id="approve-review" name="review_by" type="date" />
                  </Field>
                </MailForm>
              </Popover>
            )}
            <Popover label="Edit" align="start" width="wide">
              <MailForm
                action={updateAnswerAction}
                fields={fields}
                submitLabel="Save"
                pendingLabel="Saving…"
              >
                <AnswerFields
                  prefix="answer-edit"
                  answer={answer}
                  options={page.evidence_options}
                  absent={page.sources_absent}
                  files={page.files}
                  filesHere={page.files_here}
                />
                {answer.state === "approved" && (
                  <Field id="answer-edit-review" label="Read it again by">
                    <Input
                      id="answer-edit-review"
                      name="review_by"
                      type="date"
                      defaultValue={answer.review_by ?? ""}
                    />
                  </Field>
                )}
              </MailForm>
            </Popover>
            <RowAction
              action={archiveAnswerAction}
              fields={{ ...fields, ...(archived ? { restore: "1" } : {}) }}
              className="hqdata-inline-action"
              buttons={[
                { label: archived ? "Restore" : "Archive", className: "btn btn--small btn--ghost" },
              ]}
            />
          </span>
        }
      />
      <QuestionnaireTabs current="answers" />
      <p className="page-note">{NOT_ADVICE}</p>
      {answer.review_due && answer.review_by && (
        <Callout tone="attention" compact>
          {reviewDueWords(answer.review_by)}
        </Callout>
      )}
      <RecordSection id="answer-words" title="The answer">
        <p className="hqdata-prose">{answer.answer}</p>
        <dl className="hqdata-kv">
          <div className="hqdata-kv__row">
            <dt>Topic</dt>
            <dd>{TOPIC_WORDS[answer.topic]}</dd>
          </div>
          <div className="hqdata-kv__row">
            <dt>CAIQ IDs</dt>
            <dd className="hqdata-qid">{answer.caiq_ids.join(", ") || "None"}</dd>
          </div>
          <div className="hqdata-kv__row">
            <dt>Other IDs</dt>
            <dd className="hqdata-qid">{answer.other_ids.join(", ") || "None"}</dd>
          </div>
          <div className="hqdata-kv__row">
            <dt>Who owns the control</dt>
            <dd>{SSRM_WORDS[answer.ssrm] || "Not given"}</dd>
          </div>
          <div className="hqdata-kv__row">
            <dt>Owner</dt>
            <dd>{answer.owner || "None named"}</dd>
          </div>
        </dl>
        <p className="page-note">
          <PracticeNote
            practice="answer_review"
            {...(page.review_months !== null ? { amount: page.review_months } : {})}
          />
        </p>
      </RecordSection>
      <RecordSection id="answer-evidence" title="Evidence">
        {page.evidence.length === 0 ? (
          <p className="page-note">No evidence pointed at yet.</p>
        ) : (
          <ul className="hqdata-evidence">
            {page.evidence.map((item) => (
              <li key={item.ref} className="hqdata-evidence__item">
                {"missing" in item ? (
                  <span className="table-sub">{item.missing}</span>
                ) : (
                  <>
                    <Link className="text-link" href={item.href}>
                      {item.label}
                    </Link>
                    {!item.current && (
                      <span className="hqdata-attention table-sub">
                        {outOfDateWords(item.label, item.why)}
                      </span>
                    )}
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </RecordSection>
      <RecordSection id="answer-used" title="Where it was used">
        {page.used_in.length === 0 ? (
          <p className="page-note">Not used in a questionnaire yet.</p>
        ) : (
          <ul className="hqdata-evidence">
            {page.used_in.map((use) => (
              <li key={`${use.questionnaire_id}-${use.row}`} className="hqdata-evidence__item">
                <Link
                  className="text-link"
                  href={`/data/waitlist/diligence/questionnaires/${use.questionnaire_id}#question-${use.row}`}
                >
                  {use.title}
                </Link>{" "}
                <span className="table-sub">Row {use.row}</span>
              </li>
            ))}
          </ul>
        )}
      </RecordSection>
      <RecordSection id="answer-activity" title="Activity">
        {page.events.length === 0 ? (
          <p className="page-note">Nothing yet.</p>
        ) : (
          <ul className="hqdata-evidence">
            {page.events.map((event) => (
              <li key={event.event_id} className="hqdata-evidence__item">
                {VERBS[event.verb] ?? event.verb}
                {event.detail ? ` · ${event.detail}` : ""} · {event.by.name} ·{" "}
                <Timestamp value={event.at} now={now} />
              </li>
            ))}
          </ul>
        )}
      </RecordSection>
    </div>
  );
}
