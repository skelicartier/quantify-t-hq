"use client";

import { useActionState, useState } from "react";

import { Button } from "@/components/ui/button";
import { FormFeedback } from "@/components/ui/form-feedback";
import { Field, Input, Select } from "@/components/ui/field";
import { AttemptField } from "@/components/ui/attempt-field";
import { applyMapping, guessMapping, parseCsv, type CsvTable } from "@/lib/crm/csv";
import { INITIAL_ACTION_STATE, type ActionState } from "@/lib/forms/action-state";

export type ImportField = { key: string; label: string; aliases: readonly string[] };

type ImportOutcome = {
  created: { name: string }[];
  skipped: { row: number; name: string; reason: string }[];
  invalid: { row: number; reason: string }[];
  rows: number;
};

function parseOutcome(detail: string | undefined): ImportOutcome | null {
  if (!detail) return null;
  try {
    const parsed: unknown = JSON.parse(detail);
    if (typeof parsed !== "object" || parsed === null) return null;
    return parsed as ImportOutcome;
  } catch {
    return null;
  }
}

/**
 * Three steps on one page: read the file (in the browser; nothing leaves until the
 * mapping is confirmed), map its columns to ours, then send the mapped rows. The
 * service validates every row as if typed, skips what it already knows and says why.
 */
export function CsvImport({
  action,
  fields,
  noun,
}: {
  action: (previous: ActionState, formData: FormData) => Promise<ActionState>;
  fields: readonly ImportField[];
  noun: "companies" | "people";
}) {
  const [state, formAction, isPending] = useActionState(action, INITIAL_ACTION_STATE);
  const [table, setTable] = useState<CsvTable | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [fileName, setFileName] = useState("");
  const [readError, setReadError] = useState<string | null>(null);

  const load = (text: string, name: string) => {
    const parsed = parseCsv(text);
    if (parsed.header.length === 0 || parsed.rows.length === 0) {
      setReadError("The file has no rows under its header.");
      setTable(null);
      return;
    }
    setReadError(null);
    setFileName(name);
    setTable(parsed);
    setMapping(guessMapping(parsed.header, fields));
  };

  const onFile = (file: File | null) => {
    if (!file) return;
    if (file.size > 2_000_000) {
      setReadError("Files over 2 MB are too big for one import; split it.");
      return;
    }
    file
      .text()
      .then((text) => load(text, file.name))
      .catch(() => setReadError("The file could not be read."));
  };

  const mapped = table ? applyMapping(table, mapping) : [];
  const outcome = state.status === "sent" ? parseOutcome(state.detail) : null;
  const mappedKeys = new Set(Object.keys(mapping));

  return (
    <div className="csv-import">
      <section className="csv-import__step" aria-labelledby="import-step-file">
        <h2 id="import-step-file" className="record-section__title">
          1. The file
        </h2>
        <p className="page-note">
          A CSV with a header row. It is read here in your browser; nothing is sent until you
          confirm the mapping below.
        </p>
        <label className="btn btn--small" htmlFor="import-file">
          {fileName ? `Replace ${fileName}` : "Choose a CSV file"}
        </label>
        <input
          id="import-file"
          className="sr-only"
          type="file"
          accept=".csv,text/csv"
          onChange={(event) => onFile(event.target.files?.[0] ?? null)}
        />
        <details className="csv-import__paste">
          <summary>Or paste the rows</summary>
          <textarea
            className="textarea"
            rows={6}
            placeholder={"name,domain,country\nMeridian Fund,meridian.example,United Kingdom"}
            onBlur={(event) => event.target.value.trim() && load(event.target.value, "pasted rows")}
            aria-label="Pasted CSV"
          />
        </details>
        {readError && <p className="form-feedback form-feedback--error">{readError}</p>}
      </section>

      {table && (
        <section className="csv-import__step" aria-labelledby="import-step-map">
          <h2 id="import-step-map" className="record-section__title">
            2. Which column is which
          </h2>
          <p className="page-note">
            {table.rows.length} {table.rows.length === 1 ? "row" : "rows"} in {fileName}. Leave a
            field unmapped to skip it.
          </p>
          <div className="csv-import__map">
            {fields.map((field) => (
              <Field key={field.key} id={`map-${field.key}`} label={field.label}>
                <Select
                  id={`map-${field.key}`}
                  value={mapping[field.key] ?? ""}
                  onChange={(event) => {
                    const next = { ...mapping };
                    if (event.target.value) next[field.key] = event.target.value;
                    else delete next[field.key];
                    setMapping(next);
                  }}
                >
                  <option value="">Not in the file</option>
                  {table.header.map((column) => (
                    <option key={column} value={column}>
                      {column}
                    </option>
                  ))}
                </Select>
              </Field>
            ))}
          </div>
          <table className="csv-import__preview">
            <caption className="sr-only">The first rows as they will be imported</caption>
            <thead>
              <tr>
                {fields
                  .filter((field) => mappedKeys.has(field.key))
                  .map((field) => (
                    <th key={field.key} scope="col">
                      {field.label}
                    </th>
                  ))}
              </tr>
            </thead>
            <tbody>
              {mapped.slice(0, 5).map((row, index) => (
                <tr key={index}>
                  {fields
                    .filter((field) => mappedKeys.has(field.key))
                    .map((field) => (
                      <td key={field.key}>{row[field.key] ?? ""}</td>
                    ))}
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {table && (
        <section className="csv-import__step" aria-labelledby="import-step-send">
          <h2 id="import-step-send" className="record-section__title">
            3. Import
          </h2>
          <form className="stack-form stack-form--tight" action={formAction}>
            <AttemptField state={state} />
            <input type="hidden" name="rows_json" value={JSON.stringify(mapped.slice(0, 500))} />
            <Field
              id="import-reason"
              label="Where this file came from"
              hint="Kept in the audit log with the counts."
            >
              <Input
                id="import-reason"
                name="reason"
                maxLength={400}
                placeholder="e.g. Attendee list, London conference, September"
                required
                disabled={isPending}
              />
            </Field>
            <Button type="submit" variant="primary" disabled={isPending || mapped.length === 0}>
              {isPending
                ? "Importing…"
                : `Import ${Math.min(mapped.length, 500)} ${mapped.length === 1 ? "row" : "rows"} as ${noun}`}
            </Button>
            {mapped.length > 500 && (
              <p className="field__hint">
                Only the first 500 rows go in one import; run it again for the rest.
              </p>
            )}
            <FormFeedback state={state} />
          </form>
        </section>
      )}

      {outcome && (
        <section className="csv-import__step" aria-labelledby="import-step-result">
          <h2 id="import-step-result" className="record-section__title">
            What happened
          </h2>
          <ul className="report-facts">
            <li>
              <span>Created</span>
              <strong>{outcome.created.length}</strong>
            </li>
            <li>
              <span>Skipped as already known</span>
              <strong>{outcome.skipped.length}</strong>
            </li>
            <li>
              <span>Invalid</span>
              <strong className={outcome.invalid.length > 0 ? "num--down" : undefined}>
                {outcome.invalid.length}
              </strong>
            </li>
          </ul>
          {(outcome.skipped.length > 0 || outcome.invalid.length > 0) && (
            <ul className="csv-import__issues">
              {outcome.skipped.map((row) => (
                <li key={`s-${row.row}`}>
                  Row {row.row} · {row.name}: {row.reason}
                </li>
              ))}
              {outcome.invalid.map((row) => (
                <li key={`i-${row.row}`}>
                  Row {row.row}: {row.reason}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
