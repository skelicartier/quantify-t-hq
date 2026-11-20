import Link from "next/link";

import {
  answerQuestionAction,
  clearQuestionAction,
  toLibraryAction,
} from "@/app/(portal)/data/waitlist/diligence/questionnaires/actions";
import { MailForm } from "@/components/mail/mail-form";
import { buttonClass } from "@/components/ui/button";
import { Field, Select, Textarea } from "@/components/ui/field";
import { RowAction } from "@/components/ui/row-action";
import type { LibraryLine, QuestionView } from "@/lib/data/api/questionnaires";
import {
  SHORT_WORDS,
  SSRM_WORDS,
  SUGGESTION_WORDS,
  reviewDueWords,
} from "@/lib/data/labels-questionnaires";

/**
 * A question's Answer cell (ws-notes/security/spec.md §9.7): its answer with Clear, Change
 * and (for a typed one) "Save to the library"; or the suggestions, each with its strength in
 * words ("By ID", "Likely", "Possible") and "Use this"; and "Answer", which opens in place.
 * Nothing is answered on its own.
 */
export function AnswerCell({
  questionnaireId,
  entryId,
  question,
  library,
  caiq,
  closed,
}: {
  questionnaireId: string;
  entryId: string;
  question: QuestionView;
  library: ReadonlyMap<string, LibraryLine>;
  caiq: boolean;
  closed: boolean;
}) {
  const fields = {
    questionnaire_id: questionnaireId,
    entry_id: entryId,
    row: String(question.row),
  };
  const answer = question.answer;
  if (answer)
    return (
      <div className="hqdata-qanswer">
        <span className="hqdata-qanswer__text">
          {SHORT_WORDS[answer.short] && <strong>{SHORT_WORDS[answer.short]}</strong>}
          {SHORT_WORDS[answer.short] && answer.text ? ". " : ""}
          {answer.text}
        </span>
        {answer.ssrm && <span className="table-sub">Ownership: {SSRM_WORDS[answer.ssrm]}</span>}
        {!closed && (
          <span className="hqdata-actions">
            <RowAction
              action={clearQuestionAction}
              fields={fields}
              className="hqdata-inline-action"
              sentLabel="Cleared."
              buttons={[{ label: "Clear", className: "btn btn--small btn--ghost" }]}
            />
            {answer.answer_id === null && (
              <RowAction
                action={toLibraryAction}
                fields={fields}
                className="hqdata-inline-action"
                sentLabel="Saved as a draft."
                buttons={[{ label: "Save to the library", className: "btn btn--small" }]}
              />
            )}
            <TypedAnswer fields={fields} question={question} caiq={caiq} label="Change" />
          </span>
        )}
      </div>
    );
  return (
    <div className="hqdata-qanswer">
      {question.suggestions.length > 0 && (
        <ul className="hqdata-suggestions" aria-label={`Suggestions for row ${question.row}`}>
          {question.suggestions.map((suggestion) => {
            const line = library.get(suggestion.answer_id);
            if (!line) return null;
            return (
              <li key={suggestion.answer_id} className="hqdata-suggestion">
                <span
                  className={`hqdata-suggestion__how hqdata-suggestion__how--${suggestion.how}`}
                >
                  {SUGGESTION_WORDS[suggestion.how]}
                </span>
                <Link className="text-link" href={line.href}>
                  {line.question}
                </Link>
                <span className="hqdata-qanswer__text">
                  {SHORT_WORDS[line.short] ? `${SHORT_WORDS[line.short]}. ` : ""}
                  {line.answer}
                </span>
                {line.review_due && line.review_by && (
                  <span className="hqdata-attention">{reviewDueWords(line.review_by)}</span>
                )}
                {!closed && (
                  <RowAction
                    action={answerQuestionAction}
                    fields={{ ...fields, answer_id: suggestion.answer_id }}
                    className="hqdata-inline-action"
                    sentLabel="Answered."
                    buttons={[
                      {
                        label: "Use this",
                        className: "btn btn--small",
                        ariaLabel: `Use this answer for row ${question.row}`,
                      },
                    ]}
                  />
                )}
              </li>
            );
          })}
        </ul>
      )}
      {question.suggestions.length === 0 && <span className="table-sub">Not answered</span>}
      {!closed && <TypedAnswer fields={fields} question={question} caiq={caiq} label="Answer" />}
    </div>
  );
}

/** "Answer" (or "Change"): the short answer, the words and, for the CAIQ, the ownership. Opens in place. */
function TypedAnswer({
  fields,
  question,
  caiq,
  label,
}: {
  fields: Record<string, string>;
  question: QuestionView;
  caiq: boolean;
  label: string;
}) {
  const prefix = `answer-${question.row}`;
  const answer = question.answer;
  return (
    <details className="hqdata-disclose">
      <summary
        className={buttonClass({
          size: "small",
          variant: label === "Change" ? "ghost" : "default",
        })}
        aria-label={`${label} row ${question.row}`}
      >
        {label}
      </summary>
      <div className="hqdata-disclose__panel">
        <MailForm
          action={answerQuestionAction}
          fields={fields}
          submitLabel="Save the answer"
          pendingLabel="Saving…"
        >
          <Field id={`${prefix}-short`} label="Short answer">
            <Select id={`${prefix}-short`} name="short" defaultValue={answer?.short ?? ""}>
              {Object.entries(SHORT_WORDS).map(([key, words]) => (
                <option key={key} value={key}>
                  {words || "None"}
                </option>
              ))}
            </Select>
          </Field>
          <Field id={`${prefix}-text`} label="The answer" hint="4,000 characters at most.">
            <Textarea
              id={`${prefix}-text`}
              name="text"
              rows={4}
              maxLength={4000}
              defaultValue={answer?.text ?? ""}
            />
          </Field>
          {caiq ? (
            <Field id={`${prefix}-ssrm`} label="Who owns the control (SSRM)">
              <Select id={`${prefix}-ssrm`} name="ssrm" defaultValue={answer?.ssrm ?? ""}>
                {Object.entries(SSRM_WORDS).map(([key, words]) => (
                  <option key={key} value={key}>
                    {words || "Not given"}
                  </option>
                ))}
              </Select>
            </Field>
          ) : (
            <input type="hidden" name="ssrm" value={answer?.ssrm ?? ""} />
          )}
        </MailForm>
      </div>
    </details>
  );
}
