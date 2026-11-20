import Link from "next/link";

import { DataUnavailable } from "@/components/data/data-down";
import { AnswerFields } from "@/components/data/questionnaires/answer-fields";
import { QuestionnaireTabs } from "@/components/data/questionnaires/questionnaire-tabs";
import { PracticeNote } from "@/components/data/security/control-ref";
import { MailForm } from "@/components/mail/mail-form";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { DataTable } from "@/components/ui/data-table";
import { Field, Input, Select } from "@/components/ui/field";
import { Popover } from "@/components/ui/popover";
import { StatusPill } from "@/components/ui/status-pill";
import { SegmentedLinks } from "@/components/ui/toolbar";
import { DATA_ROLE_LINE, requireData } from "@/lib/data/access";
import { readAnswers, type AnswerRow } from "@/lib/data/api/questionnaires";
import { dayWords } from "@/lib/data/labels-company";
import { NOT_ADVICE, notLoaded } from "@/lib/data/labels-controls";
import {
  ANSWERS_EMPTY,
  ANSWER_STATE_WORDS,
  SHORT_WORDS,
  TOPIC_WORDS,
} from "@/lib/data/labels-questionnaires";
import { dataRead } from "@/lib/data/read";
import { formatNumber } from "@/lib/format";

import { addAnswerAction, answerSetupAction } from "./actions";
import "@/components/data/closing/closing.css";
import "@/components/data/questionnaires/questionnaires.css";

export const metadata = { title: "Answer library" };
export const dynamic = "force-dynamic";

const BASE = "/data/waitlist/diligence/answers";
const ABOUT = `Each answer written once, approved, and pointed at its evidence. Approved answers are suggested for a buyer's questions by ID and by words; nothing is answered on its own. ${NOT_ADVICE}`;

const COLUMNS = [
  { key: "question", label: "Question", width: "32%" },
  { key: "short", label: "Short answer" },
  { key: "topic", label: "Topic" },
  { key: "ids", label: "IDs" },
  { key: "evidence", label: "Evidence" },
  { key: "approved", label: "Approved" },
  { key: "review", label: "Review by" },
];

const VIEWS = [
  { key: "approved", label: "Approved" },
  { key: "draft", label: "Drafts" },
  { key: "archived", label: "Archived" },
  { key: "review_due", label: "Review due" },
] as const;
type View = (typeof VIEWS)[number]["key"];

const one = (value: string | string[] | undefined) => (typeof value === "string" ? value : "");

export default async function AnswerLibraryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const asked = one(params.state);
  const view: View = VIEWS.some((item) => item.key === asked) ? (asked as View) : "approved";
  const topic = one(params.topic).slice(0, 30);
  const q = one(params.q).slice(0, 200);
  const { allowed } = await requireData(BASE);
  const read = allowed ? await dataRead(() => readAnswers({ state: view, topic, q })) : null;
  const data = read?.ok ? read.data : null;
  const hrefFor = (next: { state?: string; topic?: string; q?: string }) => {
    const query = new URLSearchParams();
    const state = next.state ?? view;
    if (state !== "approved") query.set("state", state);
    if (next.topic ?? topic) query.set("topic", next.topic ?? topic);
    if (next.q ?? q) query.set("q", next.q ?? q);
    const text = query.toString();
    return text ? `${BASE}?${text}` : BASE;
  };
  return (
    <>
      <PageHeader
        title="Answer library"
        description={ABOUT}
        meta={
          data ? (
            <span className="quiet">{formatNumber(data.counts.approved)} approved</span>
          ) : undefined
        }
        actions={
          data ? (
            <>
              <a className="btn btn--small" href={`${BASE}/export`}>
                Export CSV
              </a>
              <Popover label="Add an answer" align="end" width="wide">
                <MailForm
                  action={addAnswerAction}
                  submitLabel="Add the answer"
                  pendingLabel="Adding…"
                >
                  <AnswerFields
                    prefix="answer-new"
                    answer={null}
                    options={data.evidence_options}
                    absent={data.sources_absent}
                    files={data.files}
                    filesHere={data.files_here}
                  />
                </MailForm>
              </Popover>
            </>
          ) : undefined
        }
      />
      <div className="page-content">
        {!allowed || !read ? (
          <Callout tone="neutral">{DATA_ROLE_LINE}</Callout>
        ) : !read.ok ? (
          <DataUnavailable failure={read} />
        ) : (
          <div className="hqdata-questionnaires">
            <QuestionnaireTabs current="answers" />
            <div className="page-note hqdata-practice">
              <PracticeNote
                practice="answer_review"
                {...(read.data.review_months !== null ? { amount: read.data.review_months } : {})}
              />{" "}
              <span className="hqdata-inline-action">
                <Popover label="Months between looks" align="start">
                  <MailForm action={answerSetupAction} submitLabel="Save" pendingLabel="Saving…">
                    <Field
                      id="answers-months"
                      label="Months between looks"
                      hint="1 to 60; blank for HQ's default of 12."
                    >
                      <Input
                        id="answers-months"
                        name="review_months"
                        type="number"
                        min={1}
                        max={60}
                        defaultValue={read.data.review_months ?? ""}
                      />
                    </Field>
                  </MailForm>
                </Popover>
              </span>
            </div>
            <div className="hqdata-qviews">
              <SegmentedLinks
                label="Which answers"
                items={VIEWS.map((item) => ({
                  href: hrefFor({ state: item.key }),
                  label: `${item.label} ${formatNumber(read.data.counts[item.key])}`,
                  current: item.key === view,
                }))}
              />
            </div>
            <form className="hqdata-qfilters" action={BASE} method="get">
              {view !== "approved" && <input type="hidden" name="state" value={view} />}
              <Field id="answers-topic" label="Topic">
                <Select id="answers-topic" name="topic" defaultValue={topic}>
                  <option value="">Every topic</option>
                  {read.data.topics.map((item) => (
                    <option key={item.key} value={item.key}>
                      {item.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field id="answers-q" label="Search">
                <Input id="answers-q" name="q" type="search" maxLength={200} defaultValue={q} />
              </Field>
              <Button type="submit" size="small">
                Show
              </Button>
              {(topic || q) && (
                <Link className="text-link" href={hrefFor({ topic: "", q: "" })}>
                  Clear
                </Link>
              )}
            </form>
            {read.data.sources_absent.length > 0 && (
              <p className="page-note">
                {read.data.sources_absent.map((name) => notLoaded(name)).join(" ")} An answer can
                still point at a file in Files.
              </p>
            )}
            <DataTable
              caption="Answers"
              columns={COLUMNS}
              isEmpty={read.data.answers.length === 0}
              empty={
                <p className="page-note">
                  {read.data.counts.approved +
                    read.data.counts.draft +
                    read.data.counts.archived ===
                  0
                    ? ANSWERS_EMPTY
                    : "No answer in this view."}
                </p>
              }
            >
              {read.data.answers.map((answer) => (
                <AnswerLine key={answer.answer_id} answer={answer} />
              ))}
            </DataTable>
          </div>
        )}
      </div>
    </>
  );
}

function AnswerLine({ answer }: { answer: AnswerRow }) {
  const ids = [...answer.caiq_ids, ...answer.other_ids];
  return (
    <tr>
      <td>
        <Link className="table-title hqdata-qtext" href={`${BASE}/${answer.answer_id}`}>
          {answer.question}
        </Link>
        {answer.state !== "approved" && (
          <span className="table-sub">{ANSWER_STATE_WORDS[answer.state]}</span>
        )}
      </td>
      <td>{SHORT_WORDS[answer.short] || <span className="table-sub">None</span>}</td>
      <td>{TOPIC_WORDS[answer.topic]}</td>
      <td className="hqdata-qid">
        {ids.length > 0 ? ids.join(", ") : <span className="table-sub">None</span>}
      </td>
      <td>
        {answer.evidence.length === 0 ? (
          <span className="table-sub">None</span>
        ) : (
          <>
            {formatNumber(answer.evidence.length)}
            {answer.evidence_lapsed > 0 && (
              <span className="hqdata-attention table-sub">
                {formatNumber(answer.evidence_lapsed)} out of date
              </span>
            )}
            {answer.evidence_missing > 0 && (
              <span className="table-sub">
                {formatNumber(answer.evidence_missing)} not shown here
              </span>
            )}
          </>
        )}
      </td>
      <td>
        {answer.approved ? (
          <>
            {dayWords(answer.approved.on)}
            <span className="table-sub">{answer.approved.by_name}</span>
          </>
        ) : (
          <StatusPill value="draft" label="Not yet" tone="neutral" />
        )}
      </td>
      <td>
        {answer.review_by ? (
          answer.review_due ? (
            <span className="hqdata-attention">Due since {dayWords(answer.review_by)}</span>
          ) : (
            dayWords(answer.review_by)
          )
        ) : (
          <span className="table-sub">None</span>
        )}
      </td>
    </tr>
  );
}
