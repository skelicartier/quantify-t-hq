import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { DECISION_STATUSES, DECISION_STATUS_ORDER } from "@/lib/data/labels";

/**
 * The fields of a decision: "Decision", "Why", "Who decided", "On", "Status" (Decided
 * first) and, optionally, "It replaces" (a decided decision).
 */

export type DecisionValues = {
  title: string;
  why: string;
  decided_by: string;
  decided_on: string;
  status: string;
};

export function DecisionFields({
  prefix,
  values,
  replaces,
}: {
  prefix: string;
  values: DecisionValues;
  /** The decided decisions it may replace; left out, there is no "It replaces". */
  replaces?: readonly { decision_id: string; title: string }[];
}) {
  return (
    <>
      <Field id={`${prefix}-title`} label="Decision">
        <Input
          id={`${prefix}-title`}
          name="title"
          maxLength={200}
          required
          defaultValue={values.title}
        />
      </Field>
      <Field id={`${prefix}-why`} label="Why">
        <Textarea
          id={`${prefix}-why`}
          name="why"
          rows={4}
          maxLength={4_000}
          defaultValue={values.why}
        />
      </Field>
      <div className="hqdata-note-form__pair">
        <Field id={`${prefix}-by`} label="Who decided">
          <Input
            id={`${prefix}-by`}
            name="decided_by"
            maxLength={120}
            defaultValue={values.decided_by}
          />
        </Field>
        <Field id={`${prefix}-on`} label="On">
          <Input
            id={`${prefix}-on`}
            name="decided_on"
            type="date"
            defaultValue={values.decided_on}
          />
        </Field>
      </div>
      <Field id={`${prefix}-status`} label="Status">
        <Select id={`${prefix}-status`} name="status" defaultValue={values.status}>
          {DECISION_STATUS_ORDER.map((key) => (
            <option key={key} value={key}>
              {DECISION_STATUSES[key].label}
            </option>
          ))}
        </Select>
      </Field>
      {replaces && replaces.length > 0 && (
        <Field id={`${prefix}-replaces`} label="It replaces">
          <Select id={`${prefix}-replaces`} name="supersedes" defaultValue="">
            <option value="">Nothing</option>
            {replaces.map((decision) => (
              <option key={decision.decision_id} value={decision.decision_id}>
                {decision.title}
              </option>
            ))}
          </Select>
        </Field>
      )}
    </>
  );
}
