import Link from "next/link";

import { createTrustRecordAction } from "@/app/(portal)/trust/actions";
import { PageHeader } from "@/components/shell/page-header";
import { CopyAnswer } from "@/components/trust/copy-answer";
import { TrustPill, TrustTabs } from "@/components/trust/trust-parts";
import { ActForm } from "@/components/ui/act-form";
import { Callout } from "@/components/ui/callout";
import { Section } from "@/components/ui/card";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Popover } from "@/components/ui/popover";
import { hasCapability, requireStaff } from "@/lib/access/core";
import { HqApiRequestError, HqApiUnavailableError } from "@/lib/api/core";
import { readAnswers, type AnswerLibrary } from "@/lib/api/trust";
import { formatDate } from "@/lib/format";

export const metadata = { title: "Answer library" };
export const dynamic = "force-dynamic";

const STATES = [
  { value: "", label: "In use and drafts" },
  { value: "approved", label: "Approved" },
  { value: "draft", label: "Drafts" },
  { value: "expired", label: "To re-approve" },
  { value: "archived", label: "Archived" },
];

type SearchParams = Promise<{ q?: string; topic?: string; state?: string }>;

/**
 * The answers security questionnaires keep asking for, approved once and reused: search
 * by any words, copy an approved answer as it stands. Sales drafts; an admin approves for
 * a year, and changing the words withdraws the approval.
 */
export default async function AnswersPage({ searchParams }: { searchParams: SearchParams }) {
  const { q = "", topic = "", state = "" } = await searchParams;
  const context = await requireStaff("/trust/answers");
  if (!hasCapability(context, "crm:read")) {
    return (
      <>
        <PageHeader title="Answer library" />
        <Callout tone="neutral">The answer library is for the team that answers customers.</Callout>
      </>
    );
  }
  let library: AnswerLibrary | null = null;
  try {
    library = await readAnswers(context.token, { q, topic, state });
  } catch (error) {
    if (!(error instanceof HqApiUnavailableError || error instanceof HqApiRequestError))
      throw error;
  }

  return (
    <>
      <PageHeader
        title="Answer library"
        description="Approved answers to the questions a customer's security or procurement review asks. Copy one as it stands; if it no longer holds, change it and ask an admin to approve the new words."
        actions={
          <>
            <TrustTabs context={context} current="/trust/answers" />
            {library?.can_write && (
              <Popover label="Draft an answer" variant="primary" width="wide">
                <ActForm
                  action={createTrustRecordAction}
                  hidden={{ register: "answer" }}
                  act="create"
                  label="Save the draft"
                  primary
                  tight={false}
                >
                  <Field id="answer-question" label="The question, as questionnaires ask it">
                    <Input id="answer-question" name="question" maxLength={400} required />
                  </Field>
                  <Field id="answer-text" label="The answer">
                    <Textarea id="answer-text" name="answer" rows={5} maxLength={4000} required />
                  </Field>
                  <div className="form-grid">
                    <Field id="answer-topic" label="Topic">
                      <Select id="answer-topic" name="topic" defaultValue="security">
                        {library.topics.map((item) => (
                          <option key={item.value} value={item.value}>
                            {item.label}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <Field id="answer-owner" label="Keeps it current">
                      <Select id="answer-owner" name="owner_staff_id" defaultValue="">
                        <option value="">Nobody yet</option>
                        {library.staff.map((person) => (
                          <option key={person.staff_id} value={person.staff_id}>
                            {person.name}
                          </option>
                        ))}
                      </Select>
                    </Field>
                  </div>
                  <Field id="answer-evidence" label="Evidence behind it">
                    <Input
                      id="answer-evidence"
                      name="evidence"
                      maxLength={400}
                      placeholder="The document or record that shows it"
                    />
                  </Field>
                </ActForm>
              </Popover>
            )}
          </>
        }
      />
      {library === null ? (
        <Callout tone="danger" role="alert">
          The answer library could not be read just now.
        </Callout>
      ) : (
        <div className="page-content">
          <Section
            id="library"
            title={`${library.counts.approved ?? 0} approved · ${library.counts.draft ?? 0} draft${
              library.counts.expired ? ` · ${library.counts.expired} to re-approve` : ""
            }`}
          >
            <form className="filter-strip" action="/trust/answers" role="search">
              <label className="sr-only" htmlFor="answers-q">
                Search the answers
              </label>
              <input
                id="answers-q"
                className="input input--small"
                name="q"
                defaultValue={library.q}
                placeholder="Any words"
              />
              <label className="sr-only" htmlFor="answers-topic">
                Topic
              </label>
              <select
                id="answers-topic"
                className="input input--small"
                name="topic"
                defaultValue={library.topic}
              >
                <option value="">Every topic</option>
                {library.topics.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
              <label className="sr-only" htmlFor="answers-state">
                Which answers
              </label>
              <select
                id="answers-state"
                className="input input--small"
                name="state"
                defaultValue={library.state}
              >
                {STATES.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
              <button className="btn btn--small" type="submit">
                Search
              </button>
            </form>
            {library.answers.length === 0 ? (
              <p className="muted">
                {library.q || library.topic || library.state
                  ? "Nothing matches. Try fewer words."
                  : "No answers yet. Draft the first from the button above."}
              </p>
            ) : (
              <div>
                {library.answers.map((answer) => (
                  <article key={answer.answer_id} className="answer-card">
                    <h3 className="answer-card__question">
                      <Link href={`/trust/answers/${answer.answer_id}`}>{answer.question}</Link>
                    </h3>
                    <p className="answer-card__answer">{answer.answer}</p>
                    <div className="answer-card__meta">
                      <TrustPill state={answer.state} />
                      <span>{answer.topic_label}</span>
                      {answer.state === "approved" && (
                        <span>
                          Approved by {answer.approved_by_name} until{" "}
                          {formatDate(answer.review_due, "—")}
                        </span>
                      )}
                      {answer.evidence && <span>Evidence: {answer.evidence}</span>}
                      {answer.state === "approved" ? (
                        <CopyAnswer text={answer.answer} />
                      ) : (
                        <span>
                          {answer.state === "expired"
                            ? "Not for sending until it is re-approved."
                            : "Not for sending until it is approved."}
                        </span>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            )}
          </Section>
        </div>
      )}
    </>
  );
}
