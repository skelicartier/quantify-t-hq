"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input, Select } from "@/components/ui/field";
import type { RecordImportKind, RecordImportResult } from "@/lib/api/crm";
import { guessMapping, parseCsv, type CsvTable } from "@/lib/crm/csv";
import { downloadText, toCsv } from "@/lib/crm/csv-download";
import { INITIAL_ACTION_STATE, type ActionState } from "@/lib/forms/action-state";

type Action = (previous: ActionState, formData: FormData) => Promise<ActionState>;

export type RecordImportField = { key: string; label: string; aliases: readonly string[] };

/** Why a row was left out, when the service gave no sentence of its own. */
const LEFT_OUT_LABELS: Record<string, string> = {
  INVALID: "Not valid",
  DUPLICATE_IN_FILE: "Repeated in the file",
  LOOKS_LIKE: "Looks like one already here",
  ARCHIVED: "Archived",
  NO_SUCH_RECORD: "No record with this ID",
};

const MAX_FILE_BYTES = 25_000_000;
/** Rows left out that the page lists; the download has every one. */
const SHOWN = 200;

const NOUNS: Record<RecordImportKind, { one: string; many: string; key: string }> = {
  companies: { one: "company", many: "companies", key: "domain" },
  people: { one: "person", many: "people", key: "email" },
};

type Totals = Omit<RecordImportResult, "ok" | "import_id" | "dry_run" | "created_records">;

/** The reason in one sentence: "Not valid: …" for a refused value, else the service's own. */
function whyText(reason: string, detail: string): string {
  if (!detail) return LEFT_OUT_LABELS[reason] ?? reason;
  if (reason === "INVALID") return `Not valid: ${detail}`;
  return `${detail.charAt(0).toUpperCase()}${detail.slice(1)}`;
}

function resultOf(state: ActionState): RecordImportResult | null {
  if (state.status !== "sent" || !state.detail) return null;
  try {
    return JSON.parse(state.detail) as RecordImportResult;
  } catch {
    return null;
  }
}

/** A cell as the person typed it: an HQ export defuses a formula-like cell with a quote. */
function cellText(raw: string | undefined): string {
  const text = (raw ?? "").trim();
  return /^'[=+\-@]/.test(text) ? text.slice(1) : text;
}

/**
 * Companies or people from a file, in the leads' four steps on one page: read the file
 * here in the browser (nothing leaves until a button), say which column is which, say
 * where it came from and what to do with records already here, and send it in parts.
 * Every row comes back accounted for; the same accounting can be had first as a
 * rehearsal that writes nothing; and the rows left out download as the file's own
 * columns with the reason beside each, ready to fix and bring in again.
 */
export function RecordImport({
  kind,
  action,
  fields,
  customFields,
  columns,
  maxRows,
  colleagues,
}: {
  kind: RecordImportKind;
  action: Action;
  fields: readonly RecordImportField[];
  customFields: readonly { key: string; label: string }[];
  columns: readonly { column: string; label: string }[];
  maxRows: number;
  /** Companies only: who a new company without an owner in the file goes to. */
  colleagues?: readonly { staff_id: string; name: string }[];
}) {
  const router = useRouter();
  const noun = NOUNS[kind];
  const [table, setTable] = useState<CsvTable | null>(null);
  const [fileName, setFileName] = useState("");
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [reason, setReason] = useState("");
  const [defaultOwner, setDefaultOwner] = useState("");
  const [updateExisting, setUpdateExisting] = useState(false);
  const [overwrite, setOverwrite] = useState<string[]>([]);
  const [readError, setReadError] = useState<string | null>(null);
  const [progress, setProgress] = useState<{
    sent: number;
    total: number;
    rehearsal: boolean;
  } | null>(null);
  const [outcome, setOutcome] = useState<Totals | null>(null);
  const [rehearsed, setRehearsed] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const targets = useMemo(
    () => [
      ...fields,
      ...customFields.map((field) => ({
        key: `custom.${field.key}`,
        label: field.label,
        aliases: [field.label, field.key],
      })),
    ],
    [fields, customFields],
  );

  const load = (text: string, name: string) => {
    const parsed = parseCsv(text);
    setOutcome(null);
    setFailure(null);
    if (parsed.header.length === 0 || parsed.rows.length === 0) {
      setReadError("The file has no rows under its header.");
      setTable(null);
      return;
    }
    setReadError(null);
    setFileName(name);
    setTable(parsed);
    setMapping(guessMapping(parsed.header, targets));
    setOverwrite([]);
  };

  const rows = useMemo(() => {
    if (!table) return [];
    const position = new Map(table.header.map((name, index) => [name, index]));
    return table.rows.map((cells) => {
      const row: Record<string, unknown> = {};
      const custom: Record<string, string> = {};
      for (const target of targets) {
        const column = mapping[target.key];
        if (column === undefined) continue;
        const value = cellText(cells[position.get(column) ?? -1]);
        if (!value) continue;
        if (target.key.startsWith("custom.")) custom[target.key.slice(7)] = value;
        else row[target.key] = value;
      }
      if (Object.keys(custom).length) row.custom = custom;
      return row;
    });
  }, [table, mapping, targets]);

  const ready = reason.trim().length >= 4 && progress === null && rows.length > 0;
  // A column the file does not carry has nothing to replace with.
  const mappedField: Record<string, string> = {
    owner_staff_id: "owner",
    source_key: "source",
    company_id: "company",
  };
  const replaceable = columns.filter((column) => {
    const field = mappedField[column.column] ?? column.column;
    return Boolean(mapping[field] || (column.column === "company_id" && mapping.company_domain));
  });
  const replacing = updateExisting
    ? overwrite.filter((name) => replaceable.some((column) => column.column === name))
    : [];

  const keyOf = (row: Record<string, unknown>) => {
    const id = String(row.id ?? "")
      .trim()
      .toLowerCase();
    if (id) return `id:${id}`;
    const value = String(row[noun.key] ?? "")
      .trim()
      .toLowerCase();
    return value ? `${noun.key}:${value}` : "";
  };

  const send = async (rehearsal: boolean) => {
    if (!table) return;
    setFailure(null);
    setOutcome(null);
    setRehearsed(rehearsal);
    const total: Totals = {
      rows: 0,
      created: 0,
      updated: 0,
      unchanged: 0,
      left_out_count: 0,
      left_out: [],
      owners_not_found: [],
      firms_not_found: [],
    };
    // The service sees one part at a time, so a row repeated five hundred rows later would
    // read as "already here". The whole file is here: the repeat is left out now and named
    // for what it is. `numbered` keeps each row's place in the file.
    const seen = new Set<string>();
    const numbered: { row: Record<string, unknown>; at: number }[] = [];
    rows.forEach((row, index) => {
      const key = keyOf(row);
      if (key && seen.has(key)) {
        total.rows += 1;
        total.left_out_count += 1;
        total.left_out.push({
          row: index + 1,
          name: String(row.name ?? row.full_name ?? row[noun.key] ?? ""),
          reason: "DUPLICATE_IN_FILE",
          detail: `an earlier row is the same ${noun.one}`,
        });
        return;
      }
      if (key) seen.add(key);
      numbered.push({ row, at: index + 1 });
    });
    // One run: every part adds to the same line in the history.
    const run = crypto.randomUUID();
    for (let start = 0; start < numbered.length; start += maxRows) {
      const chunk = numbered.slice(start, start + maxRows);
      setProgress({ sent: start, total: numbered.length, rehearsal });
      const form = new FormData();
      form.set("rows_json", JSON.stringify(chunk.map((item) => item.row)));
      form.set("reason", reason.trim());
      form.set("label", fileName);
      form.set("run_id", run);
      if (kind === "companies") form.set("default_owner", defaultOwner);
      if (updateExisting) form.set("update_existing", "on");
      if (replacing.length) form.set("overwrite_json", JSON.stringify(replacing));
      if (rehearsal) form.set("dry_run", "on");
      // The repeats found above are told once, with the first part.
      if (start === 0) form.set("repeats", String(total.left_out_count));
      form.set("attempt", crypto.randomUUID());
      const state = await action(INITIAL_ACTION_STATE, form);
      const part = resultOf(state);
      if (!part) {
        setFailure(
          rehearsal
            ? `${state.message ?? "The rehearsal stopped."} Nothing was added.`
            : `${state.message ?? "The import stopped."} Rows 1 to ${start.toLocaleString("en-GB")} are in; send the file again to finish — rows already in are counted as already here.`,
        );
        setProgress(null);
        setOutcome(start ? total : null);
        if (!rehearsal) router.refresh();
        return;
      }
      total.rows += part.rows;
      total.created += part.created;
      total.updated += part.updated;
      total.unchanged += part.unchanged;
      total.left_out_count += part.left_out_count;
      // The service numbers rows within the part; the file's own row number is shown.
      total.left_out.push(
        ...part.left_out.map((item) => ({ ...item, row: chunk[item.row - 1]?.at ?? item.row })),
      );
      for (const email of part.owners_not_found)
        if (!total.owners_not_found.includes(email)) total.owners_not_found.push(email);
      for (const firm of part.firms_not_found)
        if (!total.firms_not_found.includes(firm)) total.firms_not_found.push(firm);
    }
    total.left_out.sort((a, b) => a.row - b.row);
    setProgress(null);
    setOutcome(total);
    if (!rehearsal) router.refresh();
  };

  /** The rows left out as the file had them, with the reason in a last column. */
  const downloadLeftOut = () => {
    if (!table || !outcome) return;
    const header = [...table.header, "Why it was left out"];
    const body = outcome.left_out.map((item) => {
      const cells = table.rows[item.row - 1] ?? [];
      const why = whyText(item.reason, item.detail);
      return [...table.header.map((_, index) => cells[index] ?? ""), why];
    });
    downloadText(
      `${fileName.replace(/\.csv$/i, "") || noun.many}-left-out.csv`,
      toCsv(header, body),
    );
  };

  const preview = targets.filter((target) => mapping[target.key]).slice(0, 6);

  return (
    <div className="list-import">
      <section className="campaign-form__step" aria-labelledby={`${kind}-import-file`}>
        <h2 id={`${kind}-import-file`} className="record-section__title">
          1 · The file
        </h2>
        <p className="page-note">
          A CSV with a header row. It is read here in your browser; nothing is sent until you press
          a button at the end. An export from HQ comes back in as it is: its ID column matches each
          row to its {noun.one}.
        </p>
        <div className="form-actions">
          <label className="btn btn--small" htmlFor={`${kind}-csv`}>
            {fileName ? `Replace ${fileName}` : "Choose a CSV file"}
          </label>
          {table && (
            <span className="page-note">
              {table.rows.length.toLocaleString("en-GB")} rows,{" "}
              {table.header.length.toLocaleString("en-GB")} columns
            </span>
          )}
        </div>
        <input
          id={`${kind}-csv`}
          className="sr-only"
          type="file"
          accept=".csv,text/csv"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (!file) return;
            if (file.size > MAX_FILE_BYTES) {
              setReadError("Files over 25 MB are too big for one import; split it.");
              return;
            }
            file
              .text()
              .then((text) => load(text, file.name))
              .catch(() => setReadError("The file could not be read."));
          }}
        />
        {readError && <p className="form-feedback form-feedback--error">{readError}</p>}
      </section>

      {table && (
        <>
          <section className="campaign-form__step" aria-labelledby={`${kind}-import-map`}>
            <h2 id={`${kind}-import-map`} className="record-section__title">
              2 · Which column is which
            </h2>
            <div className="csv-import__map">
              {targets.map((target) => (
                <Field key={target.key} id={`${kind}-map-${target.key}`} label={target.label}>
                  <Select
                    id={`${kind}-map-${target.key}`}
                    value={mapping[target.key] ?? ""}
                    onChange={(event) => {
                      const next = { ...mapping };
                      if (event.target.value) next[target.key] = event.target.value;
                      else delete next[target.key];
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
            {preview.length > 0 && (
              <div
                className="table-frame list-import__preview"
                role="region"
                aria-label="The first rows as they will be brought in"
                tabIndex={0}
              >
                <table className="data-table">
                  <caption className="sr-only">The first rows as they will be brought in</caption>
                  <thead>
                    <tr>
                      {preview.map((target) => (
                        <th key={target.key} scope="col">
                          {target.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.slice(0, 5).map((row, index) => (
                      <tr key={index}>
                        {preview.map((target) => {
                          const value = target.key.startsWith("custom.")
                            ? ((row.custom as Record<string, string> | undefined)?.[
                                target.key.slice(7)
                              ] ?? "")
                            : String(row[target.key] ?? "");
                          return <td key={target.key}>{value || "—"}</td>;
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="campaign-form__step" aria-labelledby={`${kind}-import-how`}>
            <h2 id={`${kind}-import-how`} className="record-section__title">
              3 · Where it came from, and what to do
            </h2>
            <div className="form-row">
              <Field
                id={`${kind}-import-reason`}
                label="Where this file came from"
                hint="Kept in the audit log and in the history below, with the counts."
              >
                <Input
                  id={`${kind}-import-reason`}
                  value={reason}
                  maxLength={400}
                  onChange={(event) => setReason(event.target.value)}
                  placeholder="Attendee list, London conference, September"
                />
              </Field>
              {kind === "companies" && colleagues && (
                <Field
                  id={`${kind}-import-owner`}
                  label="New companies without an owner go to"
                  hint="A row's own owner column wins when it holds a colleague's address."
                >
                  <Select
                    id={`${kind}-import-owner`}
                    value={defaultOwner}
                    onChange={(event) => setDefaultOwner(event.target.value)}
                  >
                    <option value="">Nobody</option>
                    <option value="me">Me</option>
                    {colleagues.map((colleague) => (
                      <option key={colleague.staff_id} value={colleague.staff_id}>
                        {colleague.name}
                      </option>
                    ))}
                  </Select>
                </Field>
              )}
            </div>
            <Checkbox
              id={`${kind}-update-existing`}
              label={`Fill in ${noun.many} that are already here`}
              description={`A ${noun.one} already in HQ — matched by its ID, or by its ${noun.key === "domain" ? "web domain" : "address"} — has its blanks filled from the file. Nothing somebody typed is replaced unless you tick it below. Otherwise such rows are counted and left alone.`}
              checked={updateExisting}
              onChange={(event) => setUpdateExisting(event.target.checked)}
            />
            {updateExisting && replaceable.length > 0 && (
              <fieldset className="list-import__extras">
                <legend className="record-section__title">
                  Let the file replace what is there
                </legend>
                <p className="page-note">
                  Tick a column and the file&rsquo;s value replaces the {noun.one}&rsquo;s wherever
                  the file has one. An empty cell never wipes anything, and names,{" "}
                  {noun.key === "domain" ? "domains" : "addresses"} and custom fields are never
                  replaced.
                </p>
                <ul className="list-import__columns">
                  {replaceable.map((column) => (
                    <li key={column.column}>
                      <Checkbox
                        id={`${kind}-overwrite-${column.column}`}
                        label={column.label}
                        checked={overwrite.includes(column.column)}
                        onChange={(event) =>
                          setOverwrite(
                            event.target.checked
                              ? [...overwrite, column.column]
                              : overwrite.filter((name) => name !== column.column),
                          )
                        }
                      />
                    </li>
                  ))}
                </ul>
              </fieldset>
            )}
            <p className="page-note">
              Imported rows skip validation rules and required fields, as every bulk change does:
              the first person to edit one is asked for them. Automations do not run on them.
              Everything the file does is written down, so it can be taken back below.
            </p>
            <div className="form-actions">
              <Button
                type="button"
                variant="primary"
                disabled={!ready}
                onClick={() => void send(false)}
              >
                {progress && !progress.rehearsal
                  ? `Bringing in… ${progress.sent.toLocaleString("en-GB")} of ${progress.total.toLocaleString("en-GB")}`
                  : `Bring in ${rows.length.toLocaleString("en-GB")} rows as ${noun.many}`}
              </Button>
              <Button type="button" disabled={!ready} onClick={() => void send(true)}>
                {progress?.rehearsal
                  ? `Checking… ${progress.sent.toLocaleString("en-GB")} of ${progress.total.toLocaleString("en-GB")}`
                  : "Try it first"}
              </Button>
              {!ready && progress === null && (
                <span className="page-note">Say where the file came from first.</span>
              )}
            </div>
            <p className="page-note">
              Trying it first goes through every row and writes nothing: the same counts, before
              anything changes.
            </p>
          </section>
        </>
      )}

      {failure && (
        <p className="form-feedback form-feedback--error" role="alert">
          {failure}
        </p>
      )}
      {outcome && (
        <section
          className="list-import__result"
          aria-labelledby={`${kind}-import-done`}
          role="status"
        >
          <h2 id={`${kind}-import-done`} className="record-section__title">
            {rehearsed ? "What this file would do" : "What happened"}
          </h2>
          <dl className="list-import__counts">
            <div>
              <dt>{rehearsed ? "Would be added" : "Added"}</dt>
              <dd>{outcome.created.toLocaleString("en-GB")}</dd>
            </div>
            <div>
              <dt>{rehearsed ? "Would be filled in" : "Filled in"}</dt>
              <dd>{outcome.updated.toLocaleString("en-GB")}</dd>
            </div>
            <div>
              <dt>Already here</dt>
              <dd>{outcome.unchanged.toLocaleString("en-GB")}</dd>
            </div>
            <div>
              <dt>{rehearsed ? "Would be left out" : "Left out"}</dt>
              <dd>{outcome.left_out_count.toLocaleString("en-GB")}</dd>
            </div>
          </dl>
          {outcome.owners_not_found.length > 0 && (
            <p className="page-note">
              No active colleague has{" "}
              {outcome.owners_not_found.length === 1 ? "this address" : "these addresses"}, so those{" "}
              {noun.many} went to the default: {outcome.owners_not_found.join(", ")}.
            </p>
          )}
          {outcome.firms_not_found.length > 0 && (
            <p className="page-note">
              HQ has no company called {outcome.firms_not_found.join(", ")}, so those people are not
              linked to one. Bring the companies in first and run this file again with “Fill in”
              ticked to link them.
            </p>
          )}
          {rehearsed ? (
            <p className="page-note">
              Nothing has been added. When this reads right, press Bring in above and the same thing
              happens for real.
            </p>
          ) : (
            <p className="page-note">
              <Link className="text-link" href={kind === "companies" ? "/companies" : "/people"}>
                Open the {noun.many}
              </Link>
              , or take the file back below while nobody has worked on what it added.
            </p>
          )}
          {outcome.left_out.length > 0 && (
            <div className="form-actions">
              <Button type="button" size="small" onClick={downloadLeftOut}>
                Download the {outcome.left_out.length.toLocaleString("en-GB")}{" "}
                {outcome.left_out.length === 1 ? "row" : "rows"} left out
              </Button>
              <span className="page-note">
                The file&rsquo;s own columns, with the reason last: fix them and bring the file in
                again.
              </span>
            </div>
          )}
          {outcome.left_out.length > 0 && (
            <>
              <ul className="left-out-list" aria-label="Rows left out">
                {outcome.left_out.slice(0, SHOWN).map((item) => (
                  <li key={`${item.row}-${item.reason}`} className="left-out-list__row">
                    <span className="left-out-list__at">Row {item.row}</span>
                    <span className="left-out-list__name">{item.name || "—"}</span>
                    <span className="left-out-list__why">{whyText(item.reason, item.detail)}</span>
                  </li>
                ))}
              </ul>
              {outcome.left_out.length > SHOWN && (
                <p className="page-note">
                  The first {SHOWN} of {outcome.left_out.length.toLocaleString("en-GB")} are listed;
                  the download has them all.
                </p>
              )}
            </>
          )}
        </section>
      )}
    </div>
  );
}
