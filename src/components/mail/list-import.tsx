"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Checkbox, Field, Select } from "@/components/ui/field";
import { IMPORT_SKIP_LABELS, type ListImportResult } from "@/lib/api/mail-schema";
import { guessMapping, parseCsv, type CsvTable } from "@/lib/crm/csv";
import { INITIAL_ACTION_STATE, type ActionState } from "@/lib/forms/action-state";

type Action = (previous: ActionState, formData: FormData) => Promise<ActionState>;

const STANDARD_FIELDS = [
  {
    key: "email",
    label: "Email",
    aliases: ["e-mail", "email address", "mail", "work email", "business email"],
  },
  { key: "first_name", label: "First name", aliases: ["first", "given name", "forename"] },
  { key: "last_name", label: "Last name", aliases: ["last", "surname", "family name"] },
  { key: "full_name", label: "Full name", aliases: ["name", "contact", "contact name"] },
  {
    key: "company",
    label: "Company",
    aliases: ["company name", "firm", "organisation", "organization", "account", "fund"],
  },
  { key: "title", label: "Title", aliases: ["job title", "role", "position"] },
  { key: "country", label: "Country", aliases: ["location", "hq country"] },
] as const;

const PART_SIZE = 1_000;
const MAX_FILE_BYTES = 10_000_000;

/** mail_lists.column_key, the same rule: "Fund size (USD)" → "fund_size_usd". */
export function columnKey(raw: string): string {
  let text = raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40)
    .replace(/_+$/g, "");
  if (/^[0-9]/.test(text)) text = `c_${text}`;
  return text;
}

function resultOf(state: ActionState): ListImportResult | null {
  if (state.status !== "sent" || !state.detail) return null;
  try {
    return JSON.parse(state.detail) as ListImportResult;
  } catch {
    return null;
  }
}

/**
 * Three steps on one page: read the file here in the browser (nothing leaves until the
 * button), say which column is which — every other column is kept as the list's own —
 * and send it in parts of a thousand rows. Every row comes back accounted for.
 */
export function ListImport({
  listId,
  action,
  maxMembers,
  current,
}: {
  listId: string;
  action: Action;
  maxMembers: number;
  current: number;
}) {
  const router = useRouter();
  const [table, setTable] = useState<CsvTable | null>(null);
  const [fileName, setFileName] = useState("");
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [dropped, setDropped] = useState<Set<string>>(new Set());
  const [basis, setBasis] = useState<"legitimate_interest" | "consent">("legitimate_interest");
  const [updateExisting, setUpdateExisting] = useState(false);
  const [readError, setReadError] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ sent: number; total: number } | null>(null);
  const [outcome, setOutcome] = useState<ListImportResult | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  const load = (text: string, name: string) => {
    const parsed = parseCsv(text);
    setOutcome(null);
    setFailure(null);
    if (parsed.header.length === 0 || parsed.rows.length === 0) {
      setReadError("The file has no rows under its header.");
      setTable(null);
      return;
    }
    if (parsed.rows.length + current > maxMembers) {
      setReadError(
        `A list holds at most ${maxMembers.toLocaleString("en-GB")} people; this file would take it past that.`,
      );
      setTable(null);
      return;
    }
    setReadError(null);
    setFileName(name);
    setTable(parsed);
    setMapping(guessMapping(parsed.header, STANDARD_FIELDS));
    setDropped(new Set());
  };

  const mappedColumns = new Set(Object.values(mapping));
  const extras = useMemo(
    () =>
      (table?.header ?? []).filter(
        (column) => !mappedColumns.has(column) && columnKey(column) !== "",
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mappedColumns derives from mapping
    [table, mapping],
  );
  const kept = extras.filter((column) => !dropped.has(column));

  const rows = useMemo(() => {
    if (!table) return [];
    const position = new Map(table.header.map((name, index) => [name, index]));
    const cell = (cells: string[], column: string | undefined) =>
      column === undefined ? "" : (cells[position.get(column) ?? -1] ?? "").trim();
    return table.rows.map((cells) => {
      const row: Record<string, unknown> = {};
      for (const field of STANDARD_FIELDS) {
        const value = cell(cells, mapping[field.key]);
        if (value) row[field.key] = value;
      }
      const fields: Record<string, string> = {};
      for (const column of kept) {
        const value = cell(cells, column);
        if (value) fields[columnKey(column)] = value;
      }
      if (Object.keys(fields).length) row.fields = fields;
      return row;
    });
  }, [table, mapping, kept]);
  const withEmail = rows.filter((row) => row.email).length;

  const send = async () => {
    if (!table) return;
    setFailure(null);
    setOutcome(null);
    const total: ListImportResult = {
      added: 0,
      updated: 0,
      unchanged: 0,
      skipped: [],
      skipped_count: 0,
      consent_recorded: 0,
      columns_added: [],
      columns_dropped: [],
      rows: 0,
    };
    // One run, one set of attempt ids: a retried part replays, a new import is new.
    const run = crypto.randomUUID();
    for (let start = 0; start < rows.length; start += PART_SIZE) {
      setProgress({ sent: start, total: rows.length });
      const form = new FormData();
      form.set("list_id", listId);
      form.set("rows_json", JSON.stringify(rows.slice(start, start + PART_SIZE)));
      form.set("basis", basis);
      if (updateExisting) form.set("update_existing", "on");
      form.set("label", fileName);
      form.set("attempt", `${run}-${start}`);
      const state = await action(INITIAL_ACTION_STATE, form);
      const part = resultOf(state);
      if (!part) {
        setFailure(
          `${state.message ?? "The import stopped."} Rows 1 to ${start.toLocaleString("en-GB")} are in; send the file again to finish — rows already in are left as they are.`,
        );
        setProgress(null);
        setOutcome(start ? total : null);
        router.refresh();
        return;
      }
      total.added += part.added;
      total.updated += part.updated;
      total.unchanged += part.unchanged;
      total.skipped_count += part.skipped_count;
      total.consent_recorded += part.consent_recorded;
      total.rows += part.rows;
      total.skipped.push(...part.skipped.map((item) => ({ ...item, row: item.row + start })));
      for (const column of part.columns_added)
        if (!total.columns_added.includes(column)) total.columns_added.push(column);
      for (const column of part.columns_dropped)
        if (!total.columns_dropped.includes(column)) total.columns_dropped.push(column);
    }
    setProgress(null);
    setOutcome(total);
    router.refresh();
  };

  return (
    <div className="list-import">
      <section className="campaign-form__step" aria-labelledby="list-import-file">
        <h2 id="list-import-file" className="record-section__title">
          1 · The file
        </h2>
        <p className="page-note">
          A CSV with a header row: an email column, and any others you have. It is read here in your
          browser; nothing is sent until you press Add to the list.
        </p>
        <div className="form-actions">
          <label className="btn btn--small" htmlFor="list-csv">
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
          id="list-csv"
          className="sr-only"
          type="file"
          accept=".csv,text/csv"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (!file) return;
            if (file.size > MAX_FILE_BYTES) {
              setReadError("Files over 10 MB are too big for one import; split it.");
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
          <section className="campaign-form__step" aria-labelledby="list-import-map">
            <h2 id="list-import-map" className="record-section__title">
              2 · Which column is which
            </h2>
            <div className="csv-import__map">
              {STANDARD_FIELDS.map((field) => (
                <Field key={field.key} id={`list-map-${field.key}`} label={field.label}>
                  <Select
                    id={`list-map-${field.key}`}
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
            {!mapping.email && (
              <p className="form-feedback form-feedback--error">
                Choose the email column: it is the one thing every row needs.
              </p>
            )}
            {extras.length > 0 && (
              <fieldset className="list-import__extras">
                <legend className="record-section__title">
                  Other columns, kept as this list&rsquo;s own
                </legend>
                <p className="page-note">
                  Each kept column can go into an email as {"{{custom.column}}"}. Untick any you do
                  not need.
                </p>
                <ul className="list-import__columns">
                  {extras.map((column) => (
                    <li key={column}>
                      <Checkbox
                        id={`list-keep-${columnKey(column)}`}
                        label={column}
                        description={`{{custom.${columnKey(column)}}}`}
                        checked={!dropped.has(column)}
                        onChange={(event) => {
                          const next = new Set(dropped);
                          if (event.target.checked) next.delete(column);
                          else next.add(column);
                          setDropped(next);
                        }}
                      />
                    </li>
                  ))}
                </ul>
              </fieldset>
            )}
            <div
              className="table-frame list-import__preview"
              role="region"
              aria-label="The first rows as they will be added"
              tabIndex={0}
            >
              <table className="data-table">
                <caption className="sr-only">The first rows as they will be added</caption>
                <thead>
                  <tr>
                    <th scope="col">Email</th>
                    <th scope="col">Name</th>
                    <th scope="col">Company</th>
                    {kept.map((column) => (
                      <th key={column} scope="col">
                        {column}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, 5).map((row, index) => {
                    const fields = (row.fields ?? {}) as Record<string, string>;
                    const name =
                      [row.first_name, row.last_name].filter(Boolean).join(" ") ||
                      String(row.full_name ?? "");
                    return (
                      <tr key={index}>
                        <td>{String(row.email ?? "") || "—"}</td>
                        <td>{name || "—"}</td>
                        <td>{String(row.company ?? "") || "—"}</td>
                        {kept.map((column) => (
                          <td key={column}>{fields[columnKey(column)] ?? "—"}</td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="page-note">
              {withEmail.toLocaleString("en-GB")} of {rows.length.toLocaleString("en-GB")} rows have
              an address. Rows without one are counted, not added.
            </p>
          </section>

          <section className="campaign-form__step" aria-labelledby="list-import-basis">
            <h2 id="list-import-basis" className="record-section__title">
              3 · Why you may mail them
            </h2>
            <div className="audience-kinds" role="radiogroup" aria-label="Basis for mailing">
              {(
                [
                  ["legitimate_interest", "Business contacts"],
                  ["consent", "They asked to hear from us"],
                ] as const
              ).map(([value, label]) => (
                <label
                  key={value}
                  className={`audience-kind${basis === value ? " audience-kind--on" : ""}`}
                >
                  <input
                    type="radio"
                    name="list_basis"
                    value={value}
                    checked={basis === value}
                    onChange={() => setBasis(value)}
                  />
                  {label}
                </label>
              ))}
            </div>
            <p className="page-note">
              {basis === "consent"
                ? "Records a yes for every new address that has no consent on file. Choose it only when these people signed up — a form, an event registration."
                : "People you deal with in business. Anyone in Germany or Austria is skipped by marketing until they say yes. Nothing is recorded as consent."}{" "}
              Someone who unsubscribed stays unsubscribed either way.
            </p>
            <Checkbox
              id="list-update-existing"
              label="Update people already on the list"
              description="Their details are overwritten by the file's. Otherwise they are left as they are."
              checked={updateExisting}
              onChange={(event) => setUpdateExisting(event.target.checked)}
            />
            <div className="form-actions">
              <Button
                type="button"
                variant="primary"
                disabled={!mapping.email || progress !== null}
                onClick={() => void send()}
              >
                {progress
                  ? `Adding… ${progress.sent.toLocaleString("en-GB")} of ${progress.total.toLocaleString("en-GB")}`
                  : `Add ${rows.length.toLocaleString("en-GB")} rows to the list`}
              </Button>
            </div>
          </section>
        </>
      )}

      {failure && (
        <p className="form-feedback form-feedback--error" role="alert">
          {failure}
        </p>
      )}
      {outcome && (
        <section className="list-import__result" aria-labelledby="list-import-done" role="status">
          <h2 id="list-import-done" className="record-section__title">
            What happened
          </h2>
          <dl className="list-import__counts">
            <div>
              <dt>Added</dt>
              <dd>{outcome.added.toLocaleString("en-GB")}</dd>
            </div>
            <div>
              <dt>Updated</dt>
              <dd>{outcome.updated.toLocaleString("en-GB")}</dd>
            </div>
            <div>
              <dt>Already on the list</dt>
              <dd>{outcome.unchanged.toLocaleString("en-GB")}</dd>
            </div>
            <div>
              <dt>Skipped</dt>
              <dd>{outcome.skipped_count.toLocaleString("en-GB")}</dd>
            </div>
          </dl>
          {outcome.consent_recorded > 0 && (
            <p className="page-note">
              A yes was recorded for {outcome.consent_recorded.toLocaleString("en-GB")} new
              addresses.
            </p>
          )}
          {outcome.columns_added.length > 0 && (
            <p className="page-note">
              New columns: {outcome.columns_added.map((key) => `{{custom.${key}}}`).join(", ")}.
            </p>
          )}
          {outcome.columns_dropped.length > 0 && (
            <p className="form-feedback form-feedback--error">
              A list keeps at most twenty columns; these were not kept:{" "}
              {outcome.columns_dropped.join(", ")}.
            </p>
          )}
          {outcome.skipped.length > 0 && (
            <div className="table-frame" role="region" aria-label="Rows not added" tabIndex={0}>
              <table className="data-table">
                <caption className="sr-only">Rows not added</caption>
                <thead>
                  <tr>
                    <th scope="col">Row</th>
                    <th scope="col">Email</th>
                    <th scope="col">Why</th>
                  </tr>
                </thead>
                <tbody>
                  {outcome.skipped.slice(0, 200).map((item) => (
                    <tr key={`${item.row}-${item.email}`}>
                      <td className="data-table__num">{item.row}</td>
                      <td>{item.email || "—"}</td>
                      <td>{IMPORT_SKIP_LABELS[item.reason] ?? item.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
