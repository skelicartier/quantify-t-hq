"use client";

import { useActionState, useState } from "react";

import { ControlRefNote } from "@/components/data/security/control-ref";
import { AttemptField } from "@/components/ui/attempt-field";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { FormFeedback } from "@/components/ui/form-feedback";
import { CAIQ_LINE, LINKED_DUE, QUESTIONNAIRE_KIND_WORDS } from "@/lib/data/labels-questionnaires";
import { INITIAL_ACTION_STATE, type ActionState } from "@/lib/forms/action-state";

type Action = (previous: ActionState, formData: FormData) => Promise<ActionState>;

export type ImportFirm = {
  entry_id: string;
  firm: string;
  diligence_id: string | null;
  due_on: string | null;
};

type Guess = {
  id: number | null;
  question: number | null;
  section: number | null;
  answer: number | null;
  comment: number | null;
  ssrm: number | null;
};

export type PreviewShown = {
  import_id: string;
  name: string;
  format: "csv" | "xlsx";
  sheets: { name: string; rows: number }[];
  sheet: string | null;
  header_row: number;
  columns: string[];
  rows: string[][];
  guess: Guess;
  questions: number;
  notes: string[];
};

type Step = { kind: string; entry_id: string };

/** What step 1 handed back: the kind and firm chosen, and the preview; or nothing yet. */
export function previewOf(state: ActionState): { step: Step; preview: PreviewShown } | null {
  if (!state.detail) return null;
  try {
    const parsed = JSON.parse(state.detail) as { step?: Step; preview?: PreviewShown };
    if (!parsed.step || !parsed.preview) return null;
    return { step: parsed.step, preview: parsed.preview };
  } catch {
    return null;
  }
}

const KINDS = ["buyer", "caiq", "other"] as const;

const ROLES: { key: keyof Guess; label: string; hint?: string }[] = [
  { key: "question", label: "Question" },
  { key: "id", label: "Question ID" },
  { key: "section", label: "Section" },
  {
    key: "answer",
    label: "Answer",
    hint: "The short answer goes here, or the whole answer when no comment column is chosen.",
  },
  { key: "comment", label: "Comment", hint: "The answer's words go here when it is chosen." },
  { key: "ssrm", label: "Ownership (SSRM)" },
];

const letters = (index: number): string => {
  let left = index + 1;
  let text = "";
  while (left > 0) {
    const rest = (left - 1) % 26;
    text = String.fromCharCode(65 + rest) + text;
    left = Math.floor((left - 1) / 26);
  }
  return text;
};

/**
 * "Import a questionnaire" (ws-notes/security/spec.md §9.7): one form component in two steps.
 * Step 1 chooses the file, the kind and the firm (its open diligence is linked when there is
 * one) and reads it; step 2 shows what was read (the sheet, the header row, the column map,
 * the first twenty rows, how many questions) and imports it. Nothing is kept until "Import".
 */
export function QuestionnaireImport({
  firms,
  entryId = "",
  preview: previewAction,
  importAction,
}: {
  firms: ImportFirm[];
  /** The firm chosen to begin with: the firm's page links here with it. */
  entryId?: string;
  preview: Action;
  importAction: Action;
}) {
  const [read, readAction, reading] = useActionState(previewAction, INITIAL_ACTION_STATE);
  const [done, doAction, importing] = useActionState(importAction, INITIAL_ACTION_STATE);
  const [kind, setKind] = useState<string>("buyer");
  const shown = previewOf(read);
  return (
    <div className="hqdata-qimport">
      <form className="stack-form stack-form--tight" action={readAction}>
        <AttemptField state={read} />
        <Field
          id="questionnaire-file"
          label="Their file"
          hint="CSV or .xlsx, 3 MB at most. An older .xls, or a workbook with a password, is refused with what to do."
        >
          <Input
            id="questionnaire-file"
            name="file"
            type="file"
            accept=".csv,.txt,.xlsx"
            required
          />
        </Field>
        <Field id="questionnaire-kind" label="What it is">
          <Select
            id="questionnaire-kind"
            name="kind"
            value={kind}
            onChange={(event) => setKind(event.target.value)}
          >
            {KINDS.map((key) => (
              <option key={key} value={key}>
                {QUESTIONNAIRE_KIND_WORDS[key]}
              </option>
            ))}
          </Select>
        </Field>
        {kind === "caiq" ? (
          <p className="page-note">
            {CAIQ_LINE} <ControlRefNote refs={["star_l1"]} />
          </p>
        ) : (
          <Field
            id="questionnaire-firm"
            label="The firm"
            hint="A firm with open diligence is linked to it: the diligence's due day is the one day."
          >
            <Select
              id="questionnaire-firm"
              name="entry_id"
              defaultValue={firms.some((firm) => firm.entry_id === entryId) ? entryId : ""}
            >
              <option value="">{kind === "buyer" ? "Choose the firm" : "No firm"}</option>
              {firms.map((firm) => (
                <option key={firm.entry_id} value={firm.entry_id}>
                  {firm.diligence_id ? `${firm.firm} · open diligence` : firm.firm}
                </option>
              ))}
            </Select>
          </Field>
        )}
        <div className="form-actions">
          <Button type="submit" size="small" disabled={reading}>
            {reading ? "Reading…" : "Read the file"}
          </Button>
        </div>
        {read.status === "error" && !shown && <FormFeedback state={read} />}
      </form>
      {shown && (
        <PreviewStep
          key={`${shown.preview.import_id}-${shown.preview.sheet ?? ""}-${shown.preview.header_row}-${read.sentAt ?? ""}`}
          step={shown.step}
          preview={shown.preview}
          firm={firms.find((firm) => firm.entry_id === shown.step.entry_id) ?? null}
          readAction={readAction}
          reading={reading}
          readState={read}
          doAction={doAction}
          importing={importing}
          done={done}
        />
      )}
    </div>
  );
}

function PreviewStep({
  step,
  preview,
  firm,
  readAction,
  reading,
  readState,
  doAction,
  importing,
  done,
}: {
  step: Step;
  preview: PreviewShown;
  firm: ImportFirm | null;
  readAction: (formData: FormData) => void;
  reading: boolean;
  readState: ActionState;
  doAction: (formData: FormData) => void;
  importing: boolean;
  done: ActionState;
}) {
  const options = preview.columns.map((name, index) => (
    <option key={`${index}-${name}`} value={String(index)}>
      {name ? `${letters(index)} · ${name}` : `Column ${letters(index)}`}
    </option>
  ));
  const linked = Boolean(firm?.diligence_id);
  const fallbackTitle =
    step.kind === "caiq"
      ? "The CAIQ for STAR Level 1"
      : firm
        ? `${firm.firm}'s security questionnaire`
        : "";
  const hidden = (
    <>
      <input type="hidden" name="import_id" value={preview.import_id} />
      <input type="hidden" name="kind" value={step.kind} />
      <input type="hidden" name="entry_id" value={step.entry_id} />
    </>
  );
  return (
    <div className="hqdata-qimport__step" aria-live="polite">
      <p className="hqdata-qimport__said">
        Read {preview.name} as {preview.format === "csv" ? "CSV" : "a workbook"}
        {preview.sheet ? `, the sheet ${preview.sheet}` : ""}: the header is row{" "}
        {preview.header_row}, and{" "}
        {preview.questions === 1 ? "1 question" : `${preview.questions} questions`}{" "}
        {preview.questions === 1 ? "is" : "are"} under it.
      </p>
      {preview.notes.map((note) => (
        <p key={note} className="page-note">
          {note}
        </p>
      ))}
      <form className="stack-form stack-form--tight" action={readAction}>
        {hidden}
        {preview.sheets.length > 1 && (
          <Field id="questionnaire-sheet" label="The sheet">
            <Select id="questionnaire-sheet" name="sheet" defaultValue={preview.sheet ?? ""}>
              {preview.sheets.map((sheet) => (
                <option key={sheet.name} value={sheet.name}>
                  {sheet.name} · {sheet.rows === 1 ? "1 row" : `${sheet.rows} rows`}
                </option>
              ))}
            </Select>
          </Field>
        )}
        {preview.sheets.length <= 1 && preview.sheet && (
          <input type="hidden" name="sheet" value={preview.sheet} />
        )}
        <Field
          id="questionnaire-header-row"
          label="The header row"
          hint="The row that names each column."
        >
          <Input
            id="questionnaire-header-row"
            name="header_row"
            type="number"
            min={1}
            max={5000}
            defaultValue={String(preview.header_row)}
          />
        </Field>
        <div className="form-actions">
          <Button type="submit" size="small" disabled={reading}>
            {reading ? "Reading…" : "Read again"}
          </Button>
        </div>
        {readState.status === "error" && <FormFeedback state={readState} />}
      </form>
      <div className="table-frame" role="region" aria-label="The first rows as read" tabIndex={0}>
        <table className="data-table">
          <caption className="sr-only">The first rows as read</caption>
          <thead>
            <tr>
              {preview.columns.map((name, index) => (
                <th key={`${index}-${name}`} scope="col">
                  {name || `Column ${letters(index)}`}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {preview.rows.map((row, index) => (
              <tr key={index}>
                {row.map((cell, column) => (
                  <td key={column} className="hqdata-qimport__cell">
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <form className="stack-form stack-form--tight" action={doAction}>
        <AttemptField state={done} />
        {hidden}
        <input type="hidden" name="sheet" value={preview.sheet ?? ""} />
        <input type="hidden" name="header_row" value={String(preview.header_row)} />
        <fieldset className="hqdata-qimport__map">
          <legend>Which column holds what</legend>
          {ROLES.map((role) => (
            <Field
              key={role.key}
              id={`questionnaire-map-${role.key}`}
              label={role.label}
              {...(role.hint ? { hint: role.hint } : {})}
            >
              <Select
                id={`questionnaire-map-${role.key}`}
                name={`map_${role.key}`}
                defaultValue={
                  preview.guess[role.key] === null ? "" : String(preview.guess[role.key])
                }
                required={role.key === "question"}
              >
                <option value="">{role.key === "question" ? "Choose the column" : "None"}</option>
                {options}
              </Select>
            </Field>
          ))}
        </fieldset>
        <Field id="questionnaire-title" label="Title" hint="3 to 200 characters.">
          <Input
            id="questionnaire-title"
            name="title"
            maxLength={200}
            defaultValue={fallbackTitle}
            required
          />
        </Field>
        {linked ? (
          <p className="page-note">{LINKED_DUE}</p>
        ) : (
          <Field id="questionnaire-due" label="Due">
            <Input id="questionnaire-due" name="due_on" type="date" />
          </Field>
        )}
        <Field id="questionnaire-received" label="Received" hint="Today when left blank.">
          <Input id="questionnaire-received" name="received_on" type="date" />
        </Field>
        <div className="form-actions">
          <Button
            type="submit"
            size="small"
            variant="primary"
            disabled={importing || preview.questions === 0}
          >
            {importing
              ? "Importing…"
              : preview.questions === 1
                ? "Import 1 question"
                : `Import ${preview.questions} questions`}
          </Button>
        </div>
        {done.status === "error" && <FormFeedback state={done} />}
      </form>
    </div>
  );
}
