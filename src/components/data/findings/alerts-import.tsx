"use client";

import { useActionState } from "react";

import { AttemptField } from "@/components/ui/attempt-field";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { Field, Input } from "@/components/ui/field";
import { FormFeedback } from "@/components/ui/form-feedback";
import { dayWords } from "@/lib/data/labels-company";
import { GH_COMMAND, HOST_STATES, IMPORT_LINE, type HostState } from "@/lib/data/labels-assurance";
import {
  CONTROL_SOURCES,
  CONTROLS_CHECKED,
  SEVERITY_WORDS,
  type Severity,
} from "@/lib/data/labels-controls";
import { INITIAL_ACTION_STATE, type ActionState } from "@/lib/forms/action-state";

type Action = (previous: ActionState, formData: FormData) => Promise<ActionState>;

export type PreviewShown = {
  import_id: string;
  repos: string[];
  counts: { alerts: number; new: number; changed: number; unchanged: number; refused: number };
  words: string;
  sample: {
    index: number;
    key: string;
    title: string;
    package: string;
    ghsa_id: string;
    cve_id: string | null;
    severity: Severity;
    state: HostState;
    found_on: string;
    plan: "new" | "changed" | "unchanged";
  }[];
  refused: { index: number; why: string }[];
  file_name: string;
};

const PLAN_WORDS = { new: "New", changed: "Changed", unchanged: "Unchanged" } as const;

/** What step 1 handed back, or nothing yet. */
export function previewOf(state: ActionState): PreviewShown | null {
  if (!state.detail) return null;
  try {
    const parsed = JSON.parse(state.detail) as Partial<PreviewShown>;
    return typeof parsed.import_id === "string" && Array.isArray(parsed.sample)
      ? (parsed as PreviewShown)
      : null;
  } catch {
    return null;
  }
}

function Source({ source }: { source: { name: string; url: string } }) {
  return (
    <>
      <a
        className="text-link"
        href={source.url}
        target="_blank"
        rel="noopener noreferrer"
        title={source.name}
      >
        Source
      </a>
      <span className="hqdata-control-ref__url"> ({source.url})</span>
    </>
  );
}

/**
 * "Import dependency alerts" (ws-notes/security/spec.md §8.6): the command he runs in the
 * product's folder (HQ never connects to the code host), then the file he saved; step 2 shows
 * what it read (the sentence, the first twenty alerts, the refused ones with why) and imports
 * them. Nothing is kept until Import is pressed; a preview lasts ten minutes.
 */
export function AlertsImport({ preview, importAction }: { preview: Action; importAction: Action }) {
  const [read, readAction, reading] = useActionState(preview, INITIAL_ACTION_STATE);
  const [done, doAction, importing] = useActionState(importAction, INITIAL_ACTION_STATE);
  const shown = done.status === "sent" ? null : previewOf(read);
  return (
    <div className="hqdata-assurance__import" data-section="findings-import">
      <p>{IMPORT_LINE}</p>
      <code className="hqdata-assurance__command">{GH_COMMAND}</code>
      <p>
        <span className="hqdata-control-ref">
          <Source source={CONTROL_SOURCES.ghApi} /> · <Source source={CONTROL_SOURCES.dependabot} />
          , checked {dayWords(CONTROLS_CHECKED)}
        </span>
      </p>
      <form className="stack-form stack-form--tight" action={readAction}>
        <AttemptField state={read} />
        <Field
          id="alerts-file"
          label="The file it saved"
          hint="The JSON file the command saved, 3 MB at most."
        >
          <Input
            id="alerts-file"
            name="file"
            type="file"
            accept=".json,application/json"
            required
          />
        </Field>
        <div className="form-actions">
          <Button type="submit" size="small" disabled={reading}>
            {reading ? "Reading…" : "Read the file"}
          </Button>
        </div>
        {read.status === "error" && <FormFeedback state={read} />}
      </form>
      {shown && (
        <div className="hqdata-assurance__preview" data-section="findings-import-preview">
          <p>
            <strong>{shown.words}</strong>
          </p>
          {shown.sample.length > 0 && (
            <DataTable
              caption="Alerts in the file"
              columns={[
                { key: "alert", label: "Alert", width: "50%" },
                { key: "severity", label: "Severity" },
                { key: "state", label: "On the code host" },
                { key: "here", label: "Here" },
              ]}
              columnMenu={false}
              scroll={false}
            >
              {shown.sample.map((row) => (
                <tr key={row.key}>
                  <td>
                    {row.title}
                    <span className="table-sub mono">
                      {row.ghsa_id}
                      {row.cve_id ? ` · ${row.cve_id}` : ""} · found {dayWords(row.found_on)}
                    </span>
                  </td>
                  <td>{SEVERITY_WORDS[row.severity]}</td>
                  <td>{HOST_STATES[row.state]}</td>
                  <td>{PLAN_WORDS[row.plan]}</td>
                </tr>
              ))}
            </DataTable>
          )}
          {shown.counts.alerts > shown.sample.length && (
            <p className="page-note">
              The first {shown.sample.length} of {shown.counts.alerts} are shown.
            </p>
          )}
          {shown.refused.length > 0 && (
            <>
              <p>Left out, and why:</p>
              <ul className="hqdata-assurance__list">
                {shown.refused.map((item) => (
                  <li key={item.index}>{item.why}</li>
                ))}
              </ul>
            </>
          )}
          {shown.counts.alerts > 0 && (
            <form className="stack-form stack-form--tight" action={doAction}>
              <AttemptField state={done} />
              <input type="hidden" name="import_id" value={shown.import_id} />
              <div className="form-actions">
                <Button type="submit" size="small" variant="primary" disabled={importing}>
                  {importing
                    ? "Importing…"
                    : `Import ${shown.counts.alerts} ${shown.counts.alerts === 1 ? "alert" : "alerts"}`}
                </Button>
              </div>
              {done.status === "error" && <FormFeedback state={done} />}
            </form>
          )}
        </div>
      )}
      {done.status === "sent" && <FormFeedback state={done} />}
    </div>
  );
}
