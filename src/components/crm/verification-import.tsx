"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Field, Select } from "@/components/ui/field";
import type { LeadVerificationResult } from "@/lib/api/crm";
import { guessMapping, parseCsv, type CsvTable } from "@/lib/crm/csv";
import { downloadText, toCsv } from "@/lib/crm/csv-download";
import {
  VERIFICATION_PROBLEM_LABELS,
  VERIFIED_READS,
  verifierWord,
  verifierWordState,
} from "@/lib/crm/prospects";
import { INITIAL_ACTION_STATE, type ActionState } from "@/lib/forms/action-state";

type Action = (previous: ActionState, formData: FormData) => Promise<ActionState>;

const FIELDS = [
  {
    key: "email",
    label: "Email",
    aliases: ["e-mail", "email address", "mail", "address", "work email"],
  },
  {
    key: "result",
    label: "What the verifier said",
    aliases: [
      "status",
      "verification",
      "verification result",
      "verification status",
      "verified",
      "verified state",
      "verdict",
      "state",
      "deliverability",
      "quality",
      "email status",
      "zb status",
      "result code",
    ],
  },
] as const;

/** Half the service's ceiling for one request, so a part always fits. */
const PART_SIZE = 1_000;
const MAX_FILE_BYTES = 25_000_000;
const SHOWN = 200;

type Totals = {
  rows: number;
  updated: number;
  unchanged: number;
  not_found: number;
  unknown_result: number;
  counts: { valid: number; risky: number; invalid: number };
  problems: { row: number; email: string; reason: string }[];
};

function resultOf(state: ActionState): LeadVerificationResult | null {
  if (state.status !== "sent" || !state.detail) return null;
  try {
    return JSON.parse(state.detail) as LeadVerificationResult;
  } catch {
    return null;
  }
}

/**
 * A verifier's results onto the leads they name. The file is read here in the browser;
 * its own words are shown sorted into valid, risky and invalid before anything is sent,
 * and a word nobody recognises is left out by name rather than guessed at. A result never
 * creates a lead: it only says what is known about one that is here.
 */
export function VerificationImport({
  action,
  words,
}: {
  action: Action;
  /** The service's vocabulary: each state and the words read as it. */
  words: Readonly<Record<string, readonly string[]>>;
}) {
  const router = useRouter();
  const [table, setTable] = useState<CsvTable | null>(null);
  const [fileName, setFileName] = useState("");
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [readError, setReadError] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ sent: number; total: number } | null>(null);
  const [outcome, setOutcome] = useState<Totals | null>(null);
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
    setMapping(guessMapping(parsed.header, FIELDS));
  };

  // One row per address, the first time it appears; `at` is its row in the file.
  const read = useMemo(() => {
    const rows: { email: string; result: string; at: number }[] = [];
    let blank = 0;
    let repeated = 0;
    if (!table || !mapping.email || !mapping.result) return { rows, blank, repeated };
    const emailAt = table.header.indexOf(mapping.email);
    const resultAt = table.header.indexOf(mapping.result);
    const seen = new Set<string>();
    table.rows.forEach((cells, index) => {
      const email = (cells[emailAt] ?? "").trim().toLowerCase();
      const result = (cells[resultAt] ?? "").trim();
      if (!email || !result) {
        blank += 1;
        return;
      }
      if (seen.has(email)) {
        repeated += 1;
        return;
      }
      seen.add(email);
      rows.push({ email, result, at: index + 1 });
    });
    return { rows, blank, repeated };
  }, [table, mapping]);

  // The file's own words, most frequent first, each with how it will be read.
  const breakdown = useMemo(() => {
    const counts = new Map<string, number>();
    for (const row of read.rows) {
      const word = verifierWord(row.result);
      counts.set(word, (counts.get(word) ?? 0) + 1);
    }
    return [...counts.entries()]
      .map(([word, count]) => ({ word, count, state: verifierWordState(word, words) }))
      .sort((a, b) => b.count - a.count || a.word.localeCompare(b.word));
  }, [read, words]);
  const recognised = breakdown
    .filter((entry) => entry.state)
    .reduce((sum, entry) => sum + entry.count, 0);
  const ready = read.rows.length > 0 && progress === null;

  const send = async () => {
    setFailure(null);
    setOutcome(null);
    const total: Totals = {
      rows: 0,
      updated: 0,
      unchanged: 0,
      not_found: 0,
      unknown_result: 0,
      counts: { valid: 0, risky: 0, invalid: 0 },
      problems: [],
    };
    const run = crypto.randomUUID();
    for (let start = 0; start < read.rows.length; start += PART_SIZE) {
      const chunk = read.rows.slice(start, start + PART_SIZE);
      setProgress({ sent: start, total: read.rows.length });
      const form = new FormData();
      form.set(
        "rows_json",
        JSON.stringify(chunk.map((row) => ({ email: row.email, result: row.result }))),
      );
      form.set("label", fileName);
      form.set("attempt", `${run}-${start}`);
      const part = resultOf(await action(INITIAL_ACTION_STATE, form));
      if (!part) {
        setFailure(
          `The results stopped part way: rows 1 to ${start.toLocaleString("en-GB")} are in. Send the file again to finish; a result already applied only has its date moved.`,
        );
        setProgress(null);
        setOutcome(start ? total : null);
        router.refresh();
        return;
      }
      total.rows += part.rows;
      total.updated += part.updated;
      total.unchanged += part.unchanged;
      total.not_found += part.not_found;
      total.unknown_result += part.unknown_result;
      total.counts.valid += part.counts.valid;
      total.counts.risky += part.counts.risky;
      total.counts.invalid += part.counts.invalid;
      // The service numbers rows within the part; the file's own row number is shown.
      total.problems.push(
        ...part.problems.map((item) => ({ ...item, row: chunk[item.row - 1]?.at ?? item.row })),
      );
    }
    total.problems.sort((a, b) => a.row - b.row);
    setProgress(null);
    setOutcome(total);
    router.refresh();
  };

  return (
    <div className="list-import">
      <p className="page-note">
        Give a verifier the same file the leads came from, then bring its answer here: a CSV with
        the address and what it said about it. It is read in your browser; nothing is sent until you
        press the button.
      </p>
      <div className="form-actions">
        <label className="btn btn--small" htmlFor="verification-csv">
          {fileName ? `Replace ${fileName}` : "Choose the verifier's CSV"}
        </label>
        {table && (
          <span className="page-note">
            {table.rows.length.toLocaleString("en-GB")} rows,{" "}
            {table.header.length.toLocaleString("en-GB")} columns
          </span>
        )}
      </div>
      <input
        id="verification-csv"
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

      {table && (
        <>
          <div className="csv-import__map">
            {FIELDS.map((field) => (
              <Field key={field.key} id={`verification-map-${field.key}`} label={field.label}>
                <Select
                  id={`verification-map-${field.key}`}
                  value={mapping[field.key] ?? ""}
                  onChange={(event) => {
                    const next = { ...mapping };
                    if (event.target.value) next[field.key] = event.target.value;
                    else delete next[field.key];
                    setMapping(next);
                  }}
                >
                  <option value="">Choose the column</option>
                  {table.header.map((column) => (
                    <option key={column} value={column}>
                      {column}
                    </option>
                  ))}
                </Select>
              </Field>
            ))}
          </div>
          {(!mapping.email || !mapping.result) && (
            <p className="form-feedback form-feedback--error">
              Choose both columns: the address, and what the verifier said about it.
            </p>
          )}
          {breakdown.length > 0 && (
            <div
              className="table-frame"
              role="region"
              aria-label="What the file says and how it is read"
              tabIndex={0}
            >
              <table className="data-table">
                <caption className="sr-only">What the file says and how it is read</caption>
                <thead>
                  <tr>
                    <th scope="col">The file says</th>
                    <th scope="col" className="data-table__num">
                      Rows
                    </th>
                    <th scope="col">Read as</th>
                  </tr>
                </thead>
                <tbody>
                  {breakdown.slice(0, 30).map((entry) => (
                    <tr key={entry.word} className={entry.state ? undefined : "row--muted"}>
                      <td className="mono">{entry.word}</td>
                      <td className="data-table__num">{entry.count.toLocaleString("en-GB")}</td>
                      <td>{VERIFIED_READS[entry.state] ?? VERIFIED_READS[""]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {mapping.email && mapping.result && (
            <p className="page-note">
              {read.rows.length.toLocaleString("en-GB")} addresses have a result;{" "}
              {recognised.toLocaleString("en-GB")} of them in words this page knows.
              {read.repeated > 0 &&
                ` ${read.repeated.toLocaleString("en-GB")} repeat an address earlier in the file and are left out.`}
              {read.blank > 0 &&
                ` ${read.blank.toLocaleString("en-GB")} rows have no address or no result.`}
            </p>
          )}
          <div className="form-actions">
            <Button type="button" variant="primary" disabled={!ready} onClick={() => void send()}>
              {progress
                ? `Applying… ${progress.sent.toLocaleString("en-GB")} of ${progress.total.toLocaleString("en-GB")}`
                : `Apply ${read.rows.length.toLocaleString("en-GB")} results`}
            </Button>
          </div>
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
          aria-labelledby="verification-import-done"
          role="status"
        >
          <h3 id="verification-import-done" className="record-section__title">
            What the results changed
          </h3>
          <dl className="list-import__counts">
            <div>
              <dt>Updated</dt>
              <dd>{outcome.updated.toLocaleString("en-GB")}</dd>
            </div>
            <div>
              <dt>Same as before</dt>
              <dd>{outcome.unchanged.toLocaleString("en-GB")}</dd>
            </div>
            <div>
              <dt>Not a lead here</dt>
              <dd>{outcome.not_found.toLocaleString("en-GB")}</dd>
            </div>
            <div>
              <dt>Word not recognised</dt>
              <dd>{outcome.unknown_result.toLocaleString("en-GB")}</dd>
            </div>
          </dl>
          <p className="page-note">
            Of the results applied: {outcome.counts.valid.toLocaleString("en-GB")} valid,{" "}
            {outcome.counts.risky.toLocaleString("en-GB")} risky,{" "}
            {outcome.counts.invalid.toLocaleString("en-GB")} invalid. An invalid address is never
            written to; a risky one is held unless the sending rules allow it.
          </p>
          {outcome.problems.length > 0 && (
            <>
              <div className="form-actions">
                <Button
                  type="button"
                  size="small"
                  onClick={() =>
                    downloadText(
                      "verification-rows-not-applied.csv",
                      toCsv(
                        ["row", "email", "why"],
                        outcome.problems.map((item) => [
                          item.row,
                          item.email,
                          VERIFICATION_PROBLEM_LABELS[item.reason] ?? item.reason,
                        ]),
                      ),
                    )
                  }
                >
                  Download the {outcome.problems.length.toLocaleString("en-GB")}{" "}
                  {outcome.problems.length === 1 ? "row" : "rows"} not applied
                </Button>
              </div>
              <div
                className="table-frame"
                role="region"
                aria-label="Results not applied"
                tabIndex={0}
              >
                <table className="data-table">
                  <caption className="sr-only">Results not applied</caption>
                  <thead>
                    <tr>
                      <th scope="col">Row</th>
                      <th scope="col">Email</th>
                      <th scope="col">Why</th>
                    </tr>
                  </thead>
                  <tbody>
                    {outcome.problems.slice(0, SHOWN).map((item) => (
                      <tr key={`${item.row}-${item.email}`}>
                        <td className="data-table__num">{item.row}</td>
                        <td>{item.email || "—"}</td>
                        <td>{VERIFICATION_PROBLEM_LABELS[item.reason] ?? item.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {outcome.problems.length > SHOWN && (
                  <p className="page-note">
                    The first {SHOWN} of {outcome.problems.length.toLocaleString("en-GB")} are
                    listed; the download has them all.
                  </p>
                )}
              </div>
            </>
          )}
        </section>
      )}
    </div>
  );
}
