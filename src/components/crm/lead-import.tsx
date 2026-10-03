"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input, Select } from "@/components/ui/field";
import type { LeadImportResult } from "@/lib/api/crm";
import { guessMapping, parseCsv, type CsvTable } from "@/lib/crm/csv";
import { downloadText, toCsv } from "@/lib/crm/csv-download";
import { LEAD_IMPORT_SKIP_LABELS, OVERWRITABLE_COLUMNS } from "@/lib/crm/prospects";
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
  { key: "title", label: "Title", aliases: ["job title", "role", "position", "designation"] },
  {
    key: "company",
    label: "Firm",
    aliases: ["company name", "firm", "organisation", "organization", "account", "fund"],
  },
  { key: "firm_type", label: "Firm type", aliases: ["type", "category", "segment"] },
  { key: "website", label: "Website", aliases: ["url", "web", "domain", "site"] },
  { key: "country", label: "Country", aliases: ["hq country", "nation"] },
  { key: "city", label: "City", aliases: ["town", "location"] },
  { key: "phone", label: "Phone", aliases: ["telephone", "mobile", "tel"] },
  {
    key: "registration_no",
    label: "Registration number",
    aliases: ["registration", "reg no", "licence", "license", "sebi registration"],
  },
  {
    key: "source_url",
    label: "Where it was published",
    aliases: ["source url", "source link", "page", "found on"],
  },
  { key: "email_kind", label: "Kind of address", aliases: ["email kind", "address kind"] },
  { key: "notes", label: "Notes", aliases: ["note", "comment", "comments", "remarks"] },
  { key: "tags", label: "Tags", aliases: ["tag", "labels"] },
  {
    key: "verified_state",
    label: "Verification result",
    aliases: ["verified", "verification", "status", "result"],
  },
] as const;

/** Under the service's thousand, so a part with long notes still fits one request. */
const PART_SIZE = 500;
const MAX_FILE_BYTES = 25_000_000;
const MAX_EXTRA = 20;
/** Rows left out that the page lists; the download has every one. */
const SHOWN = 200;

function columnKey(raw: string): string {
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

function resultOf(state: ActionState): LeadImportResult | null {
  if (state.status !== "sent" || !state.detail) return null;
  try {
    return JSON.parse(state.detail) as LeadImportResult;
  } catch {
    return null;
  }
}

type Totals = Omit<LeadImportResult, "ok" | "import_id" | "dry_run">;

/**
 * A researched list into prospects, in four steps on one page: read the file here in
 * the browser (nothing leaves until a button), say which column is which, say where
 * it came from, and send it in parts. Every row comes back accounted for — and the
 * same accounting can be had first as a rehearsal that writes nothing.
 */
export function LeadImport({
  action,
  sources,
}: {
  action: Action;
  sources: readonly { key: string; label: string }[];
}) {
  const router = useRouter();
  const [table, setTable] = useState<CsvTable | null>(null);
  const [fileName, setFileName] = useState("");
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [source, setSource] = useState(
    sources.find((item) => item.key === "outbound")?.key ?? sources[0]?.key ?? "",
  );
  const [reason, setReason] = useState("");
  const [updateExisting, setUpdateExisting] = useState(false);
  /** The lead's columns the file may replace, by the service's names. */
  const [overwrite, setOverwrite] = useState<string[]>([]);
  const [readError, setReadError] = useState<string | null>(null);
  const [progress, setProgress] = useState<{
    sent: number;
    total: number;
    rehearsal: boolean;
  } | null>(null);
  const [outcome, setOutcome] = useState<Totals | null>(null);
  /** The outcome on screen is a rehearsal: nothing was written. */
  const [rehearsed, setRehearsed] = useState(false);
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
    setReadError(null);
    setFileName(name);
    setTable(parsed);
    setMapping(guessMapping(parsed.header, STANDARD_FIELDS));
    setOverwrite([]);
  };

  const mapped = new Set(Object.values(mapping));
  const extras = useMemo(
    () =>
      (table?.header ?? [])
        .filter((column) => !mapped.has(column) && columnKey(column) !== "")
        .slice(0, MAX_EXTRA),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `mapped` derives from mapping
    [table, mapping],
  );

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
      for (const column of extras) {
        const value = cell(cells, column);
        if (value) fields[columnKey(column)] = value;
      }
      if (Object.keys(fields).length) row.fields = fields;
      return row;
    });
  }, [table, mapping, extras]);
  const withEmail = rows.filter((row) => row.email).length;
  const ready = Boolean(mapping.email) && reason.trim().length >= 4 && progress === null;

  // Only a column the file carries can replace anything.
  const replaceable = OVERWRITABLE_COLUMNS.filter((column) => mapping[column.field]);
  const replacing = updateExisting
    ? overwrite.filter((name) => replaceable.some((column) => column.column === name))
    : [];

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
      skipped: [],
      skipped_count: 0,
      invalid: 0,
    };
    // The service sees one part at a time, so an address repeated a thousand rows later
    // would read as "already here". The whole file is here: the repeat is found now,
    // left out, and named for what it is. `numbered` keeps each row's place in the file.
    const seen = new Set<string>();
    const numbered: { row: Record<string, unknown>; at: number }[] = [];
    rows.forEach((row, index) => {
      const email = String(row.email ?? "")
        .trim()
        .toLowerCase();
      if (email && seen.has(email)) {
        total.rows += 1;
        total.skipped_count += 1;
        total.skipped.push({ row: index + 1, email, reason: "DUPLICATE_IN_FILE" });
        return;
      }
      if (email) seen.add(email);
      numbered.push({ row, at: index + 1 });
    });
    // One run: every part adds to the same line in the history, and a retried part
    // replays rather than importing twice.
    const run = crypto.randomUUID();
    for (let start = 0; start < numbered.length; start += PART_SIZE) {
      const chunk = numbered.slice(start, start + PART_SIZE);
      setProgress({ sent: start, total: numbered.length, rehearsal });
      const form = new FormData();
      form.set("rows_json", JSON.stringify(chunk.map((item) => item.row)));
      form.set("source_key", source);
      form.set("reason", reason.trim());
      form.set("label", fileName);
      form.set("run_id", run);
      if (updateExisting) form.set("update_existing", "on");
      if (replacing.length) form.set("overwrite_json", JSON.stringify(replacing));
      if (rehearsal) form.set("dry_run", "on");
      form.set("attempt", `${run}-${start}`);
      const state = await action(INITIAL_ACTION_STATE, form);
      const part = resultOf(state);
      if (!part) {
        setFailure(
          rehearsal
            ? `${state.message ?? "The rehearsal stopped."} Nothing was added.`
            : `${state.message ?? "The import stopped."} Rows 1 to ${start.toLocaleString("en-GB")} are in; send the file again to finish — rows already in are left as they are.`,
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
      total.skipped_count += part.skipped_count;
      total.invalid += part.invalid;
      // The service numbers rows within the part; the file's own row number is shown.
      total.skipped.push(
        ...part.skipped.map((item) => ({ ...item, row: chunk[item.row - 1]?.at ?? item.row })),
      );
    }
    total.skipped.sort((a, b) => a.row - b.row);
    setProgress(null);
    setOutcome(total);
    if (!rehearsal) router.refresh();
  };

  return (
    <div className="list-import">
      <section className="campaign-form__step" aria-labelledby="lead-import-file">
        <h2 id="lead-import-file" className="record-section__title">
          1 · The file
        </h2>
        <p className="page-note">
          A CSV with a header row: an email column, and whatever else it has. It is read here in
          your browser; nothing is sent until you press the button at the end.
        </p>
        <div className="form-actions">
          <label className="btn btn--small" htmlFor="lead-csv">
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
          id="lead-csv"
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
          <section className="campaign-form__step" aria-labelledby="lead-import-map">
            <h2 id="lead-import-map" className="record-section__title">
              2 · Which column is which
            </h2>
            <div className="csv-import__map">
              {STANDARD_FIELDS.map((field) => (
                <Field key={field.key} id={`lead-map-${field.key}`} label={field.label}>
                  <Select
                    id={`lead-map-${field.key}`}
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
              <p className="page-note">
                Other columns are kept on each lead as they are:{" "}
                {extras.map((column) => column).join(", ")}. An email can use one as{" "}
                {`{{custom.${columnKey(extras[0] ?? "")}}}`}.
              </p>
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
                    <th scope="col">Title</th>
                    <th scope="col">Firm</th>
                    <th scope="col">Type</th>
                    <th scope="col">Country</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, 5).map((row, index) => {
                    const name =
                      [row.first_name, row.last_name].filter(Boolean).join(" ") ||
                      String(row.full_name ?? "");
                    return (
                      <tr key={index}>
                        <td>{String(row.email ?? "") || "—"}</td>
                        <td>{name || "—"}</td>
                        <td>{String(row.title ?? "") || "—"}</td>
                        <td>{String(row.company ?? "") || "—"}</td>
                        <td>{String(row.firm_type ?? "") || "—"}</td>
                        <td>{String(row.country ?? "") || "—"}</td>
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

          <section className="campaign-form__step" aria-labelledby="lead-import-source">
            <h2 id="lead-import-source" className="record-section__title">
              3 · Where it came from
            </h2>
            <div className="form-row">
              <Field id="lead-import-source-key" label="File these leads under">
                <Select
                  id="lead-import-source-key"
                  value={source}
                  onChange={(event) => setSource(event.target.value)}
                >
                  {sources.map((item) => (
                    <option key={item.key} value={item.key}>
                      {item.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field
                id="lead-import-reason"
                label="Where the addresses were published"
                hint="Kept in the audit log with the import: a register, firms' own pages, an event list."
              >
                <Input
                  id="lead-import-reason"
                  value={reason}
                  maxLength={400}
                  onChange={(event) => setReason(event.target.value)}
                  placeholder="Public registers and firms' own team pages"
                />
              </Field>
            </div>
            <Checkbox
              id="lead-update-existing"
              label="Fill in leads that are already here"
              description="A lead already in the table has its blanks filled from the file. Nothing somebody typed is overwritten. Otherwise such rows are left alone."
              checked={updateExisting}
              onChange={(event) => setUpdateExisting(event.target.checked)}
            />
            {updateExisting && replaceable.length > 0 && (
              <fieldset className="list-import__extras">
                <legend className="record-section__title">
                  Let the file replace what is there
                </legend>
                <p className="page-note">
                  Normally only blanks are filled. Tick a column and the file&rsquo;s value replaces
                  the lead&rsquo;s wherever the file has one. Names, addresses and tags are never
                  replaced.
                </p>
                <ul className="list-import__columns">
                  {replaceable.map((column) => (
                    <li key={column.column}>
                      <Checkbox
                        id={`lead-overwrite-${column.column}`}
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
              An address that is already a person in the CRM, or on the stop list, is left out and
              named. Importing is not sending: nothing is mailed until a campaign is approved.
            </p>
            <div className="form-actions">
              <Button
                type="button"
                variant="primary"
                disabled={!ready}
                onClick={() => void send(false)}
              >
                {progress && !progress.rehearsal
                  ? `Adding… ${progress.sent.toLocaleString("en-GB")} of ${progress.total.toLocaleString("en-GB")}`
                  : `Add ${rows.length.toLocaleString("en-GB")} rows as prospects`}
              </Button>
              <Button type="button" disabled={!ready} onClick={() => void send(true)}>
                {progress?.rehearsal
                  ? `Checking… ${progress.sent.toLocaleString("en-GB")} of ${progress.total.toLocaleString("en-GB")}`
                  : "Try it first"}
              </Button>
              {!ready && progress === null && mapping.email && (
                <span className="page-note">Say where the addresses were published first.</span>
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
        <section className="list-import__result" aria-labelledby="lead-import-done" role="status">
          <h2 id="lead-import-done" className="record-section__title">
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
              <dd>{outcome.skipped_count.toLocaleString("en-GB")}</dd>
            </div>
          </dl>
          {rehearsed ? (
            <p className="page-note">
              Nothing has been added. When this reads right, press Add above and the same thing
              happens for real.
            </p>
          ) : (
            <p className="page-note">
              <Link className="text-link" href="/leads/prospects">
                Open the prospects
              </Link>{" "}
              or see what the leads now suggest under{" "}
              <Link className="text-link" href="/leads/segments">
                Segments
              </Link>
              .
            </p>
          )}
          {outcome.skipped.length > 0 && (
            <div className="form-actions">
              <Button
                type="button"
                size="small"
                onClick={() =>
                  downloadText(
                    "rows-left-out.csv",
                    toCsv(
                      ["row", "email", "why"],
                      outcome.skipped.map((item) => [
                        item.row,
                        item.email,
                        LEAD_IMPORT_SKIP_LABELS[item.reason] ?? item.reason,
                      ]),
                    ),
                  )
                }
              >
                Download the {outcome.skipped.length.toLocaleString("en-GB")}{" "}
                {outcome.skipped.length === 1 ? "row" : "rows"} left out
              </Button>
            </div>
          )}
          {outcome.skipped.length > 0 && (
            <div className="table-frame" role="region" aria-label="Rows left out" tabIndex={0}>
              <table className="data-table">
                <caption className="sr-only">Rows left out</caption>
                <thead>
                  <tr>
                    <th scope="col">Row</th>
                    <th scope="col">Email</th>
                    <th scope="col">Why</th>
                  </tr>
                </thead>
                <tbody>
                  {outcome.skipped.slice(0, SHOWN).map((item) => (
                    <tr key={`${item.row}-${item.email}`}>
                      <td className="data-table__num">{item.row}</td>
                      <td>{item.email || "—"}</td>
                      <td>{LEAD_IMPORT_SKIP_LABELS[item.reason] ?? item.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {outcome.skipped.length > SHOWN && (
                <p className="page-note">
                  The first {SHOWN} of {outcome.skipped.length.toLocaleString("en-GB")} are listed;
                  the download has them all.
                </p>
              )}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
