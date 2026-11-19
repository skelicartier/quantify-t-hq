"use client";

import { useActionState } from "react";

import { AttemptField } from "@/components/ui/attempt-field";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { FormFeedback } from "@/components/ui/form-feedback";
import { dayWords } from "@/lib/data/labels-company";
import { periodWords } from "@/lib/data/labels-duties";
import {
  PDF_WORDS,
  WIDEN_WORDS,
  XLS_WORDS,
  accountLabel,
  alreadyImportedWords,
  balancesWords,
  exactWords,
  previewWords,
} from "@/lib/data/labels-statements";
import { INITIAL_ACTION_STATE, type ActionState } from "@/lib/forms/action-state";

type Action = (previous: ActionState, formData: FormData) => Promise<ActionState>;

export type ImportAccount = { account_id: string; name: string; last4: string; currency: string };

type Mapping = {
  delimiter: string;
  header_row: number;
  date?: number;
  date_format?: string;
  narration?: number;
  reference?: number | null;
  amount?:
    | { style: "two_columns"; debit: number; credit: number }
    | { style: "signed"; column: number }
    | { style: "marker"; column: number; marker: number };
  balance?: number | null;
};

type ReadRow = {
  row: number;
  posted_on: string;
  direction: "debit" | "credit";
  amount_minor: number;
  balance_minor: number | null;
  narration: string;
  reference: string;
};

export type PreviewShown =
  | {
      import_id: string;
      source: "delimited" | "ofx";
      mapping: Mapping | null;
      header: string[];
      day_first_chosen: boolean;
      rows: ReadRow[];
      from: string;
      to: string;
      lines: number;
      already_here: number;
      ignored_rows: number;
      opening_minor: number | null;
      closing_minor: number | null;
      adds_up: { ok: true } | { ok: false; at_line: number; words: string } | { ok: null };
      locked_months: string[];
      already_imported_on: string | null;
    }
  | { import_id: string; refused: string; header: string[]; mapping: Partial<Mapping> | null };

const DATE_FORMATS = [
  "DD/MM/YYYY",
  "DD-MM-YYYY",
  "DD/MM/YY",
  "DD-MMM-YYYY",
  "DD MMM YYYY",
  "YYYY-MM-DD",
  "MM/DD/YYYY",
];

/** What step 1 handed back: the account and its preview, or nothing yet. */
export function previewOf(
  state: ActionState,
): { account_id: string; preview: PreviewShown } | null {
  if (!state.detail) return null;
  try {
    const parsed = JSON.parse(state.detail) as { account_id?: unknown; preview?: unknown };
    if (typeof parsed.account_id !== "string" || !parsed.preview) return null;
    return { account_id: parsed.account_id, preview: parsed.preview as PreviewShown };
  } catch {
    return null;
  }
}

/**
 * "Import a statement" (ws-notes/duties/spec.md §9.11): one form component in two steps.
 * Step 1 chooses the account and the file and reads it; step 2 shows what was read (the
 * sentence, the first twenty rows, the columns to confirm or change, the days it covers,
 * the balances and whether the lines add up) and imports it. A refusal prints the
 * parser's own sentence. Nothing is kept until Import is pressed.
 */
export function StatementImport({
  accounts,
  preview: previewAction,
  importAction,
}: {
  accounts: ImportAccount[];
  preview: Action;
  importAction: Action;
}) {
  const [read, readAction, reading] = useActionState(previewAction, INITIAL_ACTION_STATE);
  const [done, doAction, importing] = useActionState(importAction, INITIAL_ACTION_STATE);
  const shown = done.status === "sent" ? null : previewOf(read);
  const account = shown ? accounts.find((item) => item.account_id === shown.account_id) : null;
  return (
    <div className="hqdata-import">
      <form className="stack-form stack-form--tight" action={readAction}>
        <AttemptField state={read} />
        <Field id="import-account" label="Account">
          <Select
            id="import-account"
            name="account_id"
            required
            defaultValue={accounts[0]?.account_id}
          >
            {accounts.map((item) => (
              <option key={item.account_id} value={item.account_id}>
                {accountLabel(item)} · {item.currency}
              </option>
            ))}
          </Select>
        </Field>
        <Field
          id="import-file"
          label="The bank's file"
          hint="CSV or text separated by commas, semicolons, tabs or bars, or OFX or QFX. Amounts with a dot for paise."
        >
          <Input
            id="import-file"
            name="file"
            type="file"
            accept=".csv,.txt,.tsv,.ofx,.qfx"
            required
          />
        </Field>
        <p className="page-note">
          {XLS_WORDS.replace(/^Save it/, "A spreadsheet (.xls, .xlsx): save it")} {PDF_WORDS}
        </p>
        <div className="form-actions">
          <Button type="submit" size="small" disabled={reading}>
            {reading ? "Reading…" : "Read the file"}
          </Button>
        </div>
        {read.status === "error" && <FormFeedback state={read} />}
      </form>
      {shown && account && (
        <StatementPreview
          key={`${shown.preview.import_id}-${read.sentAt ?? ""}-${JSON.stringify(
            "mapping" in shown.preview ? shown.preview.mapping : null,
          )}`}
          account={account}
          preview={shown.preview}
          readAction={readAction}
          reading={reading}
          doAction={doAction}
          importing={importing}
          done={done}
        />
      )}
      {done.status === "sent" && <FormFeedback state={done} />}
    </div>
  );
}

/** Step 2: what the file read as, the columns, the days it covers, and Import. */
export function StatementPreview({
  account,
  preview,
  readAction,
  reading,
  doAction,
  importing,
  done,
}: {
  account: ImportAccount;
  preview: PreviewShown;
  readAction: (formData: FormData) => void;
  reading: boolean;
  doAction: (formData: FormData) => void;
  importing: boolean;
  done: ActionState;
}) {
  const currency = account.currency;
  const refusedWords = "refused" in preview ? preview.refused : null;
  const mapping = (
    "refused" in preview ? preview.mapping : preview.mapping
  ) as Partial<Mapping> | null;
  const header = preview.header;
  const pickers =
    header.length > 0 && mapping ? <Columns header={header} mapping={mapping} /> : null;
  return (
    <div className="hqdata-import__step" aria-live="polite">
      {refusedWords ? (
        <p className="hqdata-import__said">{refusedWords}</p>
      ) : (
        "rows" in preview && (
          <>
            <p className="hqdata-import__said">
              {previewWords({
                source: preview.source,
                delimiter: preview.mapping?.delimiter ?? null,
                date_format: preview.mapping?.date_format ?? null,
                lines: preview.lines,
                from: preview.from,
                to: preview.to,
                already_here: preview.already_here,
                ignored_rows: preview.ignored_rows,
              })}
              {preview.day_first_chosen ? " Read as day first." : ""}
            </p>
            {preview.already_imported_on && (
              <p className="hqdata-import__warn">
                {alreadyImportedWords(preview.already_imported_on)}
              </p>
            )}
            {preview.locked_months.length > 0 && (
              <p className="hqdata-import__warn">
                New lines fall in {preview.locked_months.map(periodWords).join(" and ")}, which{" "}
                {preview.locked_months.length === 1 ? "is" : "are"} locked. Reopen{" "}
                {preview.locked_months.length === 1 ? "it" : "them"} on Month close first.
              </p>
            )}
            <div
              className="table-frame"
              role="region"
              aria-label="The first rows as read"
              tabIndex={0}
            >
              <table className="data-table">
                <caption className="sr-only">The first rows as read</caption>
                <thead>
                  <tr>
                    <th scope="col">Day</th>
                    <th scope="col">Narration</th>
                    <th scope="col">Reference</th>
                    <th scope="col" className="data-table__num">
                      Money out
                    </th>
                    <th scope="col" className="data-table__num">
                      Money in
                    </th>
                    <th scope="col" className="data-table__num">
                      Balance
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.map((row) => (
                    <tr key={`${row.row}-${row.posted_on}`}>
                      <td className="nowrap">{dayWords(row.posted_on)}</td>
                      <td>{row.narration}</td>
                      <td>{row.reference}</td>
                      <td className="data-table__num">
                        {row.direction === "debit" ? exactWords(row.amount_minor, currency) : ""}
                      </td>
                      <td className="data-table__num">
                        {row.direction === "credit" ? exactWords(row.amount_minor, currency) : ""}
                      </td>
                      <td className="data-table__num">
                        {row.balance_minor === null ? "" : exactWords(row.balance_minor, currency)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="hqdata-import__said">
              {balancesWords({
                currency,
                opening_minor: preview.opening_minor,
                closing_minor: preview.closing_minor,
                adds_up: preview.adds_up,
              })}
            </p>
          </>
        )
      )}
      {pickers && (
        <form className="stack-form stack-form--tight" action={readAction}>
          <input type="hidden" name="account_id" value={account.account_id} />
          <input type="hidden" name="import_id" value={preview.import_id} />
          {pickers}
          <div className="form-actions">
            <Button type="submit" size="small" disabled={reading}>
              {reading ? "Reading…" : "Read again with these columns"}
            </Button>
          </div>
        </form>
      )}
      {"rows" in preview && (
        <form className="stack-form stack-form--tight" action={doAction}>
          <AttemptField state={done} />
          <input type="hidden" name="account_id" value={account.account_id} />
          <input type="hidden" name="import_id" value={preview.import_id} />
          {preview.mapping && <MappingFields mapping={preview.mapping} />}
          <fieldset className="hqdata-import__days">
            <legend>Covers from / to</legend>
            <Field id="import-from" label="From">
              <Input
                id="import-from"
                name="from"
                type="date"
                defaultValue={preview.from}
                max={preview.from}
                required
              />
            </Field>
            <Field id="import-to" label="To">
              <Input
                id="import-to"
                name="to"
                type="date"
                defaultValue={preview.to}
                min={preview.to}
                required
              />
            </Field>
            <p className="page-note">{WIDEN_WORDS}</p>
          </fieldset>
          {preview.opening_minor === null && (
            <Field
              id="import-opening"
              label="Opening balance"
              hint="This file gives no balances: type what the account held at the start of its first day."
            >
              <Input
                id="import-opening"
                name="opening_balance"
                inputMode="decimal"
                maxLength={24}
                autoComplete="off"
              />
            </Field>
          )}
          <div className="form-actions">
            <Button type="submit" size="small" variant="primary" disabled={importing}>
              {importing ? "Importing…" : "Import"}
            </Button>
          </div>
          {done.status === "error" && <FormFeedback state={done} />}
        </form>
      )}
    </div>
  );
}

/** The mapping as read, carried into the import as hidden fields. */
function MappingFields({ mapping }: { mapping: Mapping }) {
  const amount = mapping.amount;
  const fields: Record<string, string> = {
    delimiter: mapping.delimiter === "\t" ? "tab" : mapping.delimiter,
    header_row: String(mapping.header_row),
    date_col: String(mapping.date ?? ""),
    date_format: mapping.date_format ?? "",
    narration_col: String(mapping.narration ?? -1),
    reference_col:
      mapping.reference === null || mapping.reference === undefined
        ? ""
        : String(mapping.reference),
    balance_col:
      mapping.balance === null || mapping.balance === undefined ? "" : String(mapping.balance),
    amount_style: amount?.style ?? "signed",
    debit_col: amount?.style === "two_columns" ? String(amount.debit) : "",
    credit_col: amount?.style === "two_columns" ? String(amount.credit) : "",
    amount_col: amount && amount.style !== "two_columns" ? String(amount.column) : "",
    marker_col: amount?.style === "marker" ? String(amount.marker) : "",
  };
  return (
    <>
      {Object.entries(fields).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
    </>
  );
}

/** He confirms or changes each column the guess chose. */
function Columns({ header, mapping }: { header: string[]; mapping: Partial<Mapping> }) {
  const options = (
    <>
      <option value="">None</option>
      {header.map((name, index) => (
        <option key={`${index}-${name}`} value={String(index)}>
          {name || `Column ${index + 1}`}
        </option>
      ))}
    </>
  );
  const amount = mapping.amount;
  const pick = (id: string, label: string, name: string, value: number | null | undefined) => (
    <Field id={id} label={label}>
      <Select
        id={id}
        name={name}
        defaultValue={value === null || value === undefined || value < 0 ? "" : String(value)}
      >
        {options}
      </Select>
    </Field>
  );
  return (
    <fieldset className="hqdata-import__columns">
      <legend>Columns</legend>
      <input
        type="hidden"
        name="delimiter"
        value={mapping.delimiter === "\t" ? "tab" : (mapping.delimiter ?? ",")}
      />
      <input type="hidden" name="header_row" value={String(mapping.header_row ?? 0)} />
      {pick("import-date-col", "Day", "date_col", mapping.date)}
      <Field id="import-date-format" label="Day written as">
        <Select
          id="import-date-format"
          name="date_format"
          defaultValue={mapping.date_format ?? "DD/MM/YYYY"}
        >
          {DATE_FORMATS.map((format) => (
            <option key={format} value={format}>
              {format}
            </option>
          ))}
        </Select>
      </Field>
      {pick("import-narration-col", "Narration", "narration_col", mapping.narration)}
      {pick("import-reference-col", "Reference", "reference_col", mapping.reference)}
      <Field id="import-amount-style" label="Amounts">
        <Select
          id="import-amount-style"
          name="amount_style"
          defaultValue={amount?.style ?? "two_columns"}
        >
          <option value="two_columns">Money out and money in in two columns</option>
          <option value="signed">One column, a minus sign or brackets for money out</option>
          <option value="marker">One column, and a column saying Dr or Cr</option>
        </Select>
      </Field>
      {pick(
        "import-debit-col",
        "Money out",
        "debit_col",
        amount?.style === "two_columns" ? amount.debit : null,
      )}
      {pick(
        "import-credit-col",
        "Money in",
        "credit_col",
        amount?.style === "two_columns" ? amount.credit : null,
      )}
      {pick(
        "import-amount-col",
        "Amount",
        "amount_col",
        amount && amount.style !== "two_columns" ? amount.column : null,
      )}
      {pick(
        "import-marker-col",
        "Dr or Cr",
        "marker_col",
        amount?.style === "marker" ? amount.marker : null,
      )}
      {pick("import-balance-col", "Balance", "balance_col", mapping.balance)}
    </fieldset>
  );
}
