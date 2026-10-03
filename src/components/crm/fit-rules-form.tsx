"use client";

import { useActionState, useState } from "react";

import { AttemptField } from "@/components/ui/attempt-field";
import { Button } from "@/components/ui/button";
import { FormFeedback } from "@/components/ui/form-feedback";
import type { Facet, FitRules } from "@/lib/api/crm";
import { EMAIL_KINDS, EMAIL_KIND_LABELS } from "@/lib/crm/prospects";
import { INITIAL_ACTION_STATE, type ActionState } from "@/lib/forms/action-state";

type Action = (previous: ActionState, formData: FormData) => Promise<ActionState>;
type Row = { name: string; points: string };

function rowsFrom(points: Record<string, number>, seen: Facet = []): Row[] {
  const rows = Object.entries(points).map(([name, value]) => ({ name, points: String(value) }));
  // What the leads actually carry but the rules do not yet score: offered at nought.
  for (const entry of seen)
    if (entry.value && !(entry.value in points)) rows.push({ name: entry.value, points: "0" });
  return rows;
}

function tableOf(rows: readonly Row[], lower = false): Record<string, number> {
  const out: Record<string, number> = {};
  for (const row of rows) {
    const name = lower ? row.name.trim().toLowerCase() : row.name.trim();
    if (!name) continue;
    out[name] = Number.parseInt(row.points || "0", 10) || 0;
  }
  return out;
}

function PointsTable({
  title,
  hint,
  rows,
  onChange,
  counts,
  readOnly,
  addLabel,
  namePlaceholder,
}: {
  title: string;
  hint: string;
  rows: readonly Row[];
  onChange: (rows: Row[]) => void;
  counts?: Record<string, number>;
  readOnly: boolean;
  addLabel: string;
  namePlaceholder: string;
}) {
  const slug = title.toLowerCase().replace(/[^a-z]+/g, "-");
  return (
    <fieldset className="fit-rules__table">
      <legend className="fit-rules__title">{title}</legend>
      <p className="page-note">{hint}</p>
      <ul className="fit-rules__rows">
        {rows.map((row, index) => (
          <li key={index} className="fit-rules__row">
            <input
              className="input input--small"
              aria-label={`${title}: name ${index + 1}`}
              value={row.name}
              maxLength={60}
              placeholder={namePlaceholder}
              disabled={readOnly}
              onChange={(event) =>
                onChange(
                  rows.map((item, at) =>
                    at === index ? { ...item, name: event.target.value } : item,
                  ),
                )
              }
            />
            <input
              className="input input--small fit-rules__points"
              aria-label={`${title}: points for ${row.name || `row ${index + 1}`}`}
              type="number"
              min={-100}
              max={100}
              step={1}
              value={row.points}
              disabled={readOnly}
              onChange={(event) =>
                onChange(
                  rows.map((item, at) =>
                    at === index ? { ...item, points: event.target.value } : item,
                  ),
                )
              }
            />
            <span className="fit-rules__count">
              {counts && row.name in counts ? counts[row.name]!.toLocaleString("en-GB") : ""}
            </span>
          </li>
        ))}
      </ul>
      {!readOnly && rows.length < 60 && (
        <button
          type="button"
          className="btn btn--small btn--ghost"
          id={`fit-add-${slug}`}
          onClick={() => onChange([...rows, { name: "", points: "0" }])}
        >
          {addLabel}
        </button>
      )}
    </fieldset>
  );
}

/**
 * What makes a prospect a good fit: points for the firm's type, the kind of address, words
 * in the title and the country, summed into a score and a band. Saving re-bands every
 * lead at once, because the band is worked out when a lead is read.
 */
export function FitRulesForm({
  action,
  rules,
  firmTypes,
  countries,
  readOnly,
  customised,
}: {
  action: Action;
  rules: FitRules;
  firmTypes: Facet;
  countries: Facet;
  readOnly: boolean;
  customised: boolean;
}) {
  const [state, formAction, isPending] = useActionState(action, INITIAL_ACTION_STATE);
  const [firmRows, setFirmRows] = useState(() => rowsFrom(rules.firm_type, firmTypes));
  const [titleRows, setTitleRows] = useState(() => rowsFrom(rules.title_words));
  const [countryRows, setCountryRows] = useState(() => rowsFrom(rules.country));
  const [kinds, setKinds] = useState<Record<string, string>>(() =>
    Object.fromEntries(EMAIL_KINDS.map((kind) => [kind, String(rules.email_kind[kind] ?? 0)])),
  );
  const [named, setNamed] = useState(String(rules.named_person));
  const [bandA, setBandA] = useState(String(rules.bands.A));
  const [bandB, setBandB] = useState(String(rules.bands.B));
  const whole = (raw: string) => Number.parseInt(raw || "0", 10) || 0;
  const serialised = JSON.stringify({
    firm_type: tableOf(firmRows),
    email_kind: Object.fromEntries(Object.entries(kinds).map(([kind, raw]) => [kind, whole(raw)])),
    title_words: tableOf(titleRows, true),
    country: tableOf(countryRows),
    named_person: whole(named),
    bands: { A: whole(bandA), B: whole(bandB) },
  });
  const countOf = (facet: Facet) =>
    Object.fromEntries(facet.map((entry) => [entry.value, entry.count]));
  const disabled = readOnly || isPending;

  return (
    <form className="fit-rules" action={formAction}>
      <AttemptField state={state} />
      <input type="hidden" name="rules_json" value={serialised} />
      <div className="fit-rules__grid">
        <PointsTable
          title="Firm type"
          hint="Points for the kind of firm. The number on the right is how many prospects carry it."
          rows={firmRows}
          onChange={setFirmRows}
          counts={countOf(firmTypes)}
          readOnly={disabled}
          addLabel="Add a firm type"
          namePlaceholder="Firm type"
        />
        <PointsTable
          title="Words in the title"
          hint="Points when the title contains the words. Case does not matter; a minus counts against."
          rows={titleRows}
          onChange={setTitleRows}
          readOnly={disabled}
          addLabel="Add words"
          namePlaceholder="portfolio manager"
        />
        <PointsTable
          title="Country"
          hint="Points for where the firm is. A country not listed scores nothing."
          rows={countryRows}
          onChange={setCountryRows}
          counts={countOf(countries)}
          readOnly={disabled}
          addLabel="Add a country"
          namePlaceholder="Country"
        />
        <fieldset className="fit-rules__table">
          <legend className="fit-rules__title">Address, name and bands</legend>
          <p className="page-note">
            A person&rsquo;s own address is worth more than a shared mailbox. A is the score a
            best-fit lead reaches; B the score worth a look; anything under B is C.
          </p>
          <ul className="fit-rules__rows">
            {EMAIL_KINDS.map((kind) => (
              <li key={kind} className="fit-rules__row">
                <label htmlFor={`fit-kind-${kind}`}>{EMAIL_KIND_LABELS[kind]}</label>
                <input
                  id={`fit-kind-${kind}`}
                  className="input input--small fit-rules__points"
                  type="number"
                  min={-100}
                  max={100}
                  step={1}
                  value={kinds[kind] ?? "0"}
                  disabled={disabled}
                  onChange={(event) => setKinds({ ...kinds, [kind]: event.target.value })}
                />
                <span className="fit-rules__count" />
              </li>
            ))}
            <li className="fit-rules__row">
              <label htmlFor="fit-named">A named person</label>
              <input
                id="fit-named"
                className="input input--small fit-rules__points"
                type="number"
                min={-100}
                max={100}
                step={1}
                value={named}
                disabled={disabled}
                onChange={(event) => setNamed(event.target.value)}
              />
              <span className="fit-rules__count" />
            </li>
            <li className="fit-rules__row">
              <label htmlFor="fit-band-a">Band A from</label>
              <input
                id="fit-band-a"
                className="input input--small fit-rules__points"
                type="number"
                min={1}
                max={400}
                step={1}
                value={bandA}
                disabled={disabled}
                onChange={(event) => setBandA(event.target.value)}
              />
              <span className="fit-rules__count">points</span>
            </li>
            <li className="fit-rules__row">
              <label htmlFor="fit-band-b">Band B from</label>
              <input
                id="fit-band-b"
                className="input input--small fit-rules__points"
                type="number"
                min={0}
                max={399}
                step={1}
                value={bandB}
                disabled={disabled}
                onChange={(event) => setBandB(event.target.value)}
              />
              <span className="fit-rules__count">points</span>
            </li>
          </ul>
        </fieldset>
      </div>
      {!readOnly && (
        <div className="form-actions">
          <Button type="submit" variant="primary" size="small" disabled={isPending}>
            {isPending ? "Saving…" : "Save the rules"}
          </Button>
          {customised && (
            <Button
              type="submit"
              size="small"
              variant="ghost"
              name="reset"
              value="1"
              formNoValidate
              disabled={isPending}
            >
              Put the defaults back
            </Button>
          )}
        </div>
      )}
      <FormFeedback state={state} />
    </form>
  );
}
