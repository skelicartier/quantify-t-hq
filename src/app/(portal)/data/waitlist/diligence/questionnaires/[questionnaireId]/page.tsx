import Link from "next/link";
import { notFound } from "next/navigation";

import { DueChip } from "@/components/crm/pills";
import { DataUnavailable } from "@/components/data/data-down";
import { QuestionnaireCounts } from "@/components/data/questionnaires/counts-line";
import { AnswerCell } from "@/components/data/questionnaires/question-cell";
import { QuestionnaireTabs } from "@/components/data/questionnaires/questionnaire-tabs";
import { ControlRefNote } from "@/components/data/security/control-ref";
import { MailForm } from "@/components/mail/mail-form";
import { PageHeader } from "@/components/shell/page-header";
import { buttonClass } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { DataTable } from "@/components/ui/data-table";
import { Field, Input, Select } from "@/components/ui/field";
import { Popover } from "@/components/ui/popover";
import { RecordHeader } from "@/components/ui/record-shell";
import { RowAction } from "@/components/ui/row-action";
import { StatusPill } from "@/components/ui/status-pill";
import { SegmentedLinks } from "@/components/ui/toolbar";
import { DATA_ROLE_LINE, requireData } from "@/lib/data/access";
import { readQuestionnaire, type QuestionnairePage } from "@/lib/data/api/questionnaires";
import { dayWords } from "@/lib/data/labels-company";
import { NOT_ADVICE } from "@/lib/data/labels-controls";
import {
  EXPORT_KEEPS,
  LINKED_DUE,
  QUESTIONNAIRE_KIND_WORDS,
  QUESTIONNAIRE_STATE_WORDS,
  SENT_LINE,
  ofCount,
} from "@/lib/data/labels-questionnaires";
import { dataRead } from "@/lib/data/read";
import { formatNumber } from "@/lib/format";

import {
  acceptByIdAction,
  closeQuestionnaireAction,
  keepCopyAction,
  markSentAction,
  updateQuestionnaireAction,
} from "../actions";
import "@/components/data/closing/closing.css";
import "@/components/data/questionnaires/questionnaires.css";

export const metadata = { title: "Questionnaire" };
export const dynamic = "force-dynamic";

const BASE = "/data/waitlist/diligence/questionnaires";
const ID = /^[A-Za-z0-9-]{1,64}$/;

const COLUMNS = [
  { key: "row", label: "Row", width: "56px" },
  { key: "id", label: "ID" },
  { key: "question", label: "Question", width: "38%" },
  { key: "answer", label: "Answer", width: "34%" },
  { key: "library", label: "From the library" },
];

const SHOWS = [
  { key: "all", label: "All" },
  { key: "unanswered", label: "Not answered" },
  { key: "suggested", label: "Suggested" },
] as const;

export default async function QuestionnaireRecordPage({
  params,
  searchParams,
}: {
  params: Promise<{ questionnaireId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { questionnaireId } = await params;
  const query = await searchParams;
  const { allowed } = await requireData(`${BASE}/${questionnaireId}`);
  if (!ID.test(questionnaireId)) notFound();
  const show = typeof query.show === "string" ? query.show : "";
  const read = allowed ? await dataRead(() => readQuestionnaire(questionnaireId, show)) : null;
  if (!allowed || !read || !read.ok)
    return (
      <>
        <PageHeader title="Questionnaire" />
        <div className="page-content">
          {!allowed || !read ? (
            <Callout tone="neutral">{DATA_ROLE_LINE}</Callout>
          ) : (
            !read.ok && <DataUnavailable failure={read} />
          )}
        </div>
      </>
    );
  return <Questionnaire page={read.data} />;
}

function Questionnaire({ page }: { page: QuestionnairePage }) {
  const { questionnaire, counts, today } = page;
  const id = questionnaire.questionnaire_id;
  const entryId = questionnaire.entry_id ?? "";
  const fields = { questionnaire_id: id, entry_id: entryId };
  const closed = questionnaire.state === "closed";
  const caiq = questionnaire.kind === "caiq";
  const library = new Map(page.library.map((line) => [line.answer_id, line]));
  const kept = [...questionnaire.kept].reverse();
  return (
    <div className="hqdata-questionnaires">
      <RecordHeader
        crumbs={[
          { href: "/data/waitlist/diligence", label: "Diligence" },
          { href: BASE, label: "Questionnaires" },
        ]}
        title={<span className="hqdata-qtext">{questionnaire.title}</span>}
        status={
          <StatusPill
            value={questionnaire.state}
            label={QUESTIONNAIRE_STATE_WORDS[questionnaire.state]}
            tone={questionnaire.state === "open" ? "attention" : "neutral"}
          />
        }
        readouts={[
          { label: "Answered", value: ofCount(counts.answered, counts.total) },
          {
            label: "Due",
            value: questionnaire.due ? (
              questionnaire.state === "open" ? (
                <DueChip due={questionnaire.due} today={today} />
              ) : (
                dayWords(questionnaire.due)
              )
            ) : (
              "None set"
            ),
          },
          { label: "Received", value: dayWords(questionnaire.received_on) },
        ]}
        actions={
          <span className="hqdata-actions">
            {!closed && counts.by_id > 0 && (
              <RowAction
                action={acceptByIdAction}
                fields={fields}
                className="hqdata-inline-action"
                buttons={[
                  {
                    label:
                      counts.by_id === 1
                        ? "Accept the 1 match by ID"
                        : `Accept the ${formatNumber(counts.by_id)} matches by ID`,
                    className: "btn btn--small btn--primary",
                  },
                ]}
              />
            )}
            <a className={buttonClass({ size: "small" })} href={`${BASE}/${id}/export?format=csv`}>
              Export CSV
            </a>
            <a className={buttonClass({ size: "small" })} href={`${BASE}/${id}/export?format=xlsx`}>
              Export XLSX
            </a>
            {page.files_here && (
              <Popover label="Keep a copy in Files" align="start">
                <MailForm
                  action={keepCopyAction}
                  fields={fields}
                  submitLabel="Keep the copy"
                  pendingLabel="Keeping…"
                >
                  <Field id="keep-format" label="As">
                    <Select
                      id="keep-format"
                      name="format"
                      defaultValue={questionnaire.source.format}
                    >
                      <option value="xlsx">XLSX</option>
                      <option value="csv">CSV</option>
                    </Select>
                  </Field>
                  <p className="field__hint">
                    It goes into 06 Contracts and NDAs › Diligence, in Files.
                  </p>
                </MailForm>
              </Popover>
            )}
            {!closed && (
              <Popover label="Mark as sent" align="start" width="wide">
                <MailForm
                  action={markSentAction}
                  fields={fields}
                  submitLabel="Record it"
                  pendingLabel="Recording…"
                >
                  <p className="field__hint">{SENT_LINE}</p>
                  <Field id="sent-on" label="Sent on" hint="Today when left blank.">
                    <Input id="sent-on" name="on" type="date" max={today} />
                  </Field>
                  <Field id="sent-how" label="How" hint="By email to their security team, say.">
                    <Input id="sent-how" name="how" maxLength={200} />
                  </Field>
                  <Field id="sent-file" label="The copy sent">
                    <Select id="sent-file" name="file_id" defaultValue={kept[0]?.file_id ?? ""}>
                      <option value="">None kept</option>
                      {kept.map((copy) => (
                        <option key={copy.file_id} value={copy.file_id}>
                          {copy.format.toUpperCase()} kept {dayWords(copy.at.slice(0, 10))}
                        </option>
                      ))}
                    </Select>
                  </Field>
                </MailForm>
              </Popover>
            )}
            <Popover label="Edit" align="start">
              <MailForm
                action={updateQuestionnaireAction}
                fields={fields}
                submitLabel="Save"
                pendingLabel="Saving…"
              >
                <Field id="edit-title" label="Title">
                  <Input
                    id="edit-title"
                    name="title"
                    maxLength={200}
                    defaultValue={questionnaire.title}
                    required
                  />
                </Field>
                {questionnaire.diligence_id ? (
                  <p className="field__hint">{LINKED_DUE}</p>
                ) : (
                  <Field id="edit-due" label="Due">
                    <Input
                      id="edit-due"
                      name="due_on"
                      type="date"
                      defaultValue={questionnaire.due_on ?? ""}
                    />
                  </Field>
                )}
              </MailForm>
            </Popover>
            <RowAction
              action={closeQuestionnaireAction}
              fields={{ ...fields, ...(closed ? { reopen: "1" } : {}) }}
              className="hqdata-inline-action"
              buttons={[
                { label: closed ? "Reopen" : "Close", className: "btn btn--small btn--ghost" },
              ]}
            />
          </span>
        }
      />
      <>
        <QuestionnaireTabs current="questionnaires" />
        <p className="page-note">{NOT_ADVICE}</p>
        <p className="hqdata-line">
          {QUESTIONNAIRE_KIND_WORDS[questionnaire.kind]}
          {questionnaire.entry_id && (
            <>
              {" "}
              from{" "}
              <Link className="text-link" href={`/data/waitlist/${questionnaire.entry_id}`}>
                {questionnaire.firm}
              </Link>
            </>
          )}
          {questionnaire.diligence && (
            <>
              {" "}
              ·{" "}
              <Link
                className="text-link"
                href={`/data/waitlist/${questionnaire.diligence.entry_id}#waitlist-diligence`}
              >
                its diligence
              </Link>
              {questionnaire.diligence.answered_on
                ? `, answered ${dayWords(questionnaire.diligence.answered_on)}`
                : ""}
            </>
          )}
          {" · "}
          {questionnaire.source.name}
          {questionnaire.source.sheet ? `, sheet ${questionnaire.source.sheet}` : ""}
          {" · "}
          <Link className="text-link" href={`/data/files/${questionnaire.source.file_id}`}>
            their file in Files
          </Link>
        </p>
        {questionnaire.sent && (
          <p className="hqdata-line">
            Sent {dayWords(questionnaire.sent.on)}
            {questionnaire.sent.how ? ` · ${questionnaire.sent.how}` : ""} · recorded by{" "}
            {questionnaire.sent.by_name}
          </p>
        )}
        {caiq && (
          <p className="page-note">
            <ControlRefNote refs={["star_l1"]} />
          </p>
        )}
        <QuestionnaireCounts counts={counts} />
        <div className="hqdata-qviews">
          <SegmentedLinks
            label="Which questions"
            items={SHOWS.map((item) => ({
              href: item.key === "all" ? `${BASE}/${id}` : `${BASE}/${id}?show=${item.key}`,
              label: item.label,
              current: page.show === item.key,
            }))}
          />
        </div>
        <DataTable
          caption="Questions"
          columns={COLUMNS}
          scroll={false}
          columnMenu={false}
          isEmpty={page.questions.length === 0}
          empty={<p className="page-note">No question in this view.</p>}
        >
          {page.questions.map((question) => {
            const from = question.answer?.answer_id ? library.get(question.answer.answer_id) : null;
            return (
              <tr key={question.row} id={`question-${question.row}`}>
                <td className="hqdata-qid">{question.row}</td>
                <td className="hqdata-qid">
                  {question.qid || <span className="table-sub">None</span>}
                </td>
                <td>
                  <span className="hqdata-qtext">{question.text}</span>
                  {question.section && <span className="table-sub">{question.section}</span>}
                </td>
                <td>
                  <AnswerCell
                    questionnaireId={id}
                    entryId={entryId}
                    question={question}
                    library={library}
                    caiq={caiq}
                    closed={closed}
                  />
                </td>
                <td>
                  {from ? (
                    <Link className="text-link hqdata-qtext" href={from.href}>
                      {from.question}
                    </Link>
                  ) : question.answer ? (
                    <span className="table-sub">Typed here</span>
                  ) : (
                    <span className="table-sub">None</span>
                  )}
                </td>
              </tr>
            );
          })}
        </DataTable>
        <p className="page-note">{EXPORT_KEEPS}</p>
      </>
    </div>
  );
}
