"use client";

import { useActionState, useState } from "react";

import { AttemptField } from "@/components/ui/attempt-field";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input, Select } from "@/components/ui/field";
import { FormFeedback } from "@/components/ui/form-feedback";
import type { ColdJurisdiction, ColdRules } from "@/lib/api/crm";
import { COLD_CHECKS } from "@/lib/crm/prospects";
import { INITIAL_ACTION_STATE, type ActionState } from "@/lib/forms/action-state";

type Action = (previous: ActionState, formData: FormData) => Promise<ActionState>;

type CheckKey = (typeof COLD_CHECKS)[number]["key"];

/**
 * The checks and how long a verification counts, saved together under one reason. Held
 * in state rather than left to the browser: a saved form shows what was saved, not what
 * the page was first rendered with.
 */
export function ColdChecksForm({
  action,
  rules,
  disabled,
}: {
  action: Action;
  rules: ColdRules;
  /** No fresh code yet: the form reads, and the gate above it says why. */
  disabled: boolean;
}) {
  const [state, formAction, isPending] = useActionState(action, INITIAL_ACTION_STATE);
  const [checks, setChecks] = useState(
    () =>
      Object.fromEntries(COLD_CHECKS.map((check) => [check.key, rules[check.key]])) as Record<
        CheckKey,
        boolean
      >,
  );
  const [days, setDays] = useState(String(rules.verify_stale_days));
  const off = disabled || isPending;
  return (
    <form className="stack-form stack-form--tight" action={formAction}>
      <AttemptField state={state} />
      {COLD_CHECKS.map((check) => (
        <Checkbox
          key={check.key}
          id={`cold-${check.key}`}
          name={check.key}
          label={check.label}
          description={check.description}
          tone={"tone" in check ? check.tone : "default"}
          checked={checks[check.key]}
          onChange={(event) => setChecks({ ...checks, [check.key]: event.target.checked })}
          disabled={off}
        />
      ))}
      <Field
        id="cold-stale-days"
        label="A verification counts for"
        hint={`Days, from 1 to ${rules.max_stale_days}. After that the address needs checking again.`}
      >
        <Input
          id="cold-stale-days"
          name="verify_stale_days"
          type="number"
          inputMode="numeric"
          min={1}
          max={rules.max_stale_days}
          value={days}
          onChange={(event) => setDays(event.target.value)}
          required
          disabled={off}
        />
      </Field>
      <Field
        id="cold-checks-reason"
        label="Why it is changing"
        hint="Kept in the audit log with the change."
      >
        <Input
          key={state.sentAt ?? "reason"}
          id="cold-checks-reason"
          name="reason"
          minLength={4}
          maxLength={400}
          required
          disabled={off}
        />
      </Field>
      <div className="form-actions">
        <Button type="submit" size="small" variant="primary" disabled={off}>
          {isPending ? "Saving…" : "Save the checks"}
        </Button>
      </div>
      <FormFeedback state={state} />
    </form>
  );
}

/**
 * One country's rule. Choosing a country shows what is in force for it; a country the
 * table does not name can be typed. A rule set here can be put back to the default.
 */
export function CountryRuleForm({
  action,
  jurisdictions,
  ruleLabels,
  initialCountry,
  disabled,
}: {
  action: Action;
  jurisdictions: readonly ColdJurisdiction[];
  ruleLabels: Readonly<Record<string, string>>;
  initialCountry: string;
  disabled: boolean;
}) {
  const [state, formAction, isPending] = useActionState(action, INITIAL_ACTION_STATE);
  const find = (name: string) =>
    jurisdictions.find(
      (row) => row.country !== "" && row.country.toLowerCase() === name.trim().toLowerCase(),
    );
  const first = find(initialCountry);
  const [country, setCountry] = useState(first?.country ?? initialCountry);
  const [rule, setRule] = useState(first?.rule ?? "opt_out");
  // A default's note describes the default; a new decision gets its own words.
  const [note, setNote] = useState(first?.set_by === "admin" ? first.note : "");
  const [prefix, setPrefix] = useState(first?.subject_prefix ?? "");
  const known = find(country);
  const off = disabled || isPending;

  const choose = (name: string) => {
    setCountry(name);
    const row = find(name);
    if (!row) return;
    setRule(row.rule);
    setNote(row.set_by === "admin" ? row.note : "");
    setPrefix(row.subject_prefix);
  };

  return (
    <form className="stack-form stack-form--tight" action={formAction}>
      <AttemptField state={state} />
      <Field
        id="cold-country"
        label="Country"
        hint={
          known
            ? `Today: ${known.rule_label.toLowerCase()}${
                known.set_by === "admin"
                  ? ", set by an admin"
                  : known.set_by === "default"
                    ? ", the default"
                    : ", nobody has decided"
              }.`
            : country.trim()
              ? "Not in the table yet: it is held until a rule is saved."
              : "As the leads spell it."
        }
      >
        <Input
          id="cold-country"
          name="country"
          list="cold-countries"
          value={country}
          onChange={(event) => choose(event.target.value)}
          maxLength={60}
          required
          disabled={off}
          autoComplete="off"
        />
      </Field>
      <datalist id="cold-countries">
        {jurisdictions
          .filter((row) => row.country)
          .map((row) => (
            <option key={row.country} value={row.country} />
          ))}
      </datalist>
      <Field id="cold-rule" label="Rule">
        <Select
          id="cold-rule"
          name="rule"
          value={rule}
          onChange={(event) => setRule(event.target.value)}
          disabled={off}
        >
          {Object.entries(ruleLabels).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </Select>
      </Field>
      <Field
        id="cold-note"
        label="What was decided"
        hint="Shown beside the rule: the advice it rests on, or the condition it carries."
      >
        <Input
          id="cold-note"
          name="note"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          maxLength={300}
          disabled={off}
        />
      </Field>
      <Field
        id="cold-prefix"
        label="Label before the subject"
        hint="Only where a country asks for one, such as <ADV>. Leave empty otherwise."
      >
        <Input
          id="cold-prefix"
          name="subject_prefix"
          value={prefix}
          onChange={(event) => setPrefix(event.target.value)}
          maxLength={12}
          disabled={off}
        />
      </Field>
      <Field
        id="cold-country-reason"
        label="Why it is changing"
        hint="Kept in the audit log with the change."
      >
        <Input
          key={state.sentAt ?? "reason"}
          id="cold-country-reason"
          name="reason"
          minLength={4}
          maxLength={400}
          required
          disabled={off}
        />
      </Field>
      <div className="form-actions">
        <Button type="submit" size="small" variant="primary" disabled={off}>
          {isPending ? "Saving…" : "Save the rule"}
        </Button>
        {known?.set_by === "admin" && (
          <Button type="submit" size="small" variant="ghost" name="reset" value="1" disabled={off}>
            Put back to the default
          </Button>
        )}
      </div>
      <FormFeedback state={state} />
    </form>
  );
}
