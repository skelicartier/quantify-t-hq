import { Field, Input, Select, Textarea, describedBy } from "@/components/ui/field";
import { NOTE_KINDS } from "@/lib/data/labels";

/**
 * The fields of a note, for the Notes section's composer ("Add a note", with three action
 * rows) and the note's own "Edit" (without them), and the Investor FAQ's two fields.
 */

export type NoteValues = {
  kind: string;
  held_on: string;
  title: string;
  body: string;
  people: string;
  /** One per line. */
  objections: string;
};

export const ACTION_ROWS = [0, 1, 2] as const;

const OBJECTIONS_HINT = "One per line. Answer them from the Investor FAQ on the note's page.";

export function NoteFields({
  prefix,
  values,
  today,
  withActions = false,
}: {
  prefix: string;
  values: NoteValues;
  today: string;
  withActions?: boolean;
}) {
  const objections = `${prefix}-objections`;
  return (
    <>
      <div className="hqdata-note-form__pair">
        <Field id={`${prefix}-kind`} label="Kind">
          <Select id={`${prefix}-kind`} name="kind" defaultValue={values.kind}>
            {Object.entries(NOTE_KINDS).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </Select>
        </Field>
        <Field id={`${prefix}-held`} label="Held on">
          <Input
            id={`${prefix}-held`}
            name="held_on"
            type="date"
            max={today}
            required
            defaultValue={values.held_on}
          />
        </Field>
      </div>
      <Field id={`${prefix}-title`} label="Title">
        <Input
          id={`${prefix}-title`}
          name="title"
          maxLength={200}
          required
          placeholder="First call with the partner"
          defaultValue={values.title}
        />
      </Field>
      <Field id={`${prefix}-body`} label="What was said">
        <Textarea
          id={`${prefix}-body`}
          name="body"
          rows={5}
          maxLength={8_000}
          defaultValue={values.body}
        />
      </Field>
      <Field id={`${prefix}-people`} label="Who was there">
        <Input id={`${prefix}-people`} name="people" maxLength={200} defaultValue={values.people} />
      </Field>
      <Field id={objections} label="Objections" hint={OBJECTIONS_HINT}>
        <Textarea
          id={objections}
          name="objections"
          rows={3}
          maxLength={4_000}
          aria-describedby={describedBy(objections, { hint: OBJECTIONS_HINT })}
          defaultValue={values.objections}
        />
      </Field>
      {withActions && (
        <fieldset className="fieldset hqdata-note-form__actions">
          <legend className="fieldset__legend">Actions</legend>
          {ACTION_ROWS.map((index) => (
            <div key={index} className="hqdata-note-form__action">
              <Field
                id={`${prefix}-action-${index}`}
                label={
                  <>
                    Action<span className="sr-only"> {index + 1}</span>
                  </>
                }
              >
                <Input
                  id={`${prefix}-action-${index}`}
                  name={`action_title_${index}`}
                  maxLength={200}
                />
              </Field>
              <Field
                id={`${prefix}-action-${index}-due`}
                label={
                  <>
                    By<span className="sr-only">, action {index + 1}</span>
                  </>
                }
              >
                <Input
                  id={`${prefix}-action-${index}-due`}
                  name={`action_due_${index}`}
                  type="date"
                  min={today}
                />
              </Field>
              <Field
                id={`${prefix}-action-${index}-who`}
                label={
                  <>
                    Who<span className="sr-only">, action {index + 1}</span>
                  </>
                }
              >
                <Input
                  id={`${prefix}-action-${index}-who`}
                  name={`action_owner_${index}`}
                  maxLength={120}
                />
              </Field>
            </div>
          ))}
          <p className="field__hint">Each action with a day joins Due on that day.</p>
        </fieldset>
      )}
    </>
  );
}

/** "Question" and "Your answer": an FAQ entry. */
export function FaqFields({
  prefix,
  question = "",
  answer = "",
}: {
  prefix: string;
  question?: string;
  answer?: string;
}) {
  return (
    <>
      <Field id={`${prefix}-question`} label="Question">
        <Input
          id={`${prefix}-question`}
          name="question"
          maxLength={300}
          required
          defaultValue={question}
        />
      </Field>
      <Field id={`${prefix}-answer`} label="Your answer">
        <Textarea
          id={`${prefix}-answer`}
          name="answer"
          rows={5}
          maxLength={4_000}
          defaultValue={answer}
        />
      </Field>
    </>
  );
}

/** "3 objections", "1 open action": a count and its noun. */
export function counted(count: number, one: string, many = `${one}s`): string {
  return `${count.toLocaleString("en-GB")} ${count === 1 ? one : many}`;
}
