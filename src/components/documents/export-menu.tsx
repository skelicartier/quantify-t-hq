"use client";

import { Download } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";

import { exportColumnsAction } from "@/app/(portal)/_actions/exports";
import { SudoGate } from "@/components/admin/sudo-gate";
import { buttonClass } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import type { ActionState } from "@/lib/forms/action-state";
import {
  EXPORT_FORMATS,
  EXPORT_LABELS,
  EXPORT_OUTCOMES,
  FORMAT_LABELS,
  type ExportFormat,
  type ExportKind,
} from "@/lib/exports";

type ExportMenuProps = {
  kind: ExportKind;
  /** The page the menu sits on; a refused export comes back here with the reason. */
  returnPath: string;
  /** The list's current query, so a refused export comes back to the same view. */
  returnQuery?: string | undefined;
  /** The trigger's words when "Export" alone would not say what leaves. */
  label?: string | undefined;
  /** What the file holds, when it is a view of the list and not every record. */
  scope?: string | undefined;
  /** The view's filters, sent with the request for the kinds that export a view. */
  view?: Record<string, unknown> | undefined;
  /**
   * How many records the page shows when its view is narrower than the whole list: the
   * menu then offers the view or every record, the view first.
   */
  viewCount?: number | undefined;
  sudoFresh: boolean;
  sudoUntilLabel: string | null;
  sudoAction: (previous: ActionState, formData: FormData) => Promise<ActionState>;
};

type Column = { key: string; label: string; custom: boolean };

/**
 * "Export" in a list's header: the view on screen or the whole list, every column or the
 * ones chosen, as a CSV, a spreadsheet or a PDF on the letterhead. Every one goes through
 * the same door as the reports page — a fresh code, a written reason, the day's quota and
 * an audit row — so it is offered only to people whose role exports, and says so when
 * the service refuses.
 */
export function ExportMenu({
  kind,
  returnPath,
  returnQuery,
  label,
  scope,
  view,
  viewCount,
  sudoFresh,
  sudoUntilLabel,
  sudoAction,
}: ExportMenuProps) {
  const params = useSearchParams();
  const outcome = EXPORT_OUTCOMES[params.get("export") ?? ""];
  const [format, setFormat] = useState<ExportFormat>("pdf");
  const [records, setRecords] = useState<"view" | "all">("view");
  const [choosing, setChoosing] = useState(false);
  const [columns, setColumns] = useState<Column[] | null>(null);
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set());
  const [columnsNote, setColumnsNote] = useState("");
  const [loading, startLoading] = useTransition();
  const id = `export-${kind}`;
  const noun = EXPORT_LABELS[kind].toLowerCase();
  const offersView = viewCount !== undefined;

  const chooseColumns = (on: boolean) => {
    setChoosing(on);
    if (!on || columns !== null) return;
    startLoading(async () => {
      const result = await exportColumnsAction(kind);
      if (result.ok) {
        setColumns(result.columns);
        setPicked(new Set(result.columns.map((column) => column.key)));
        setColumnsNote("");
      } else {
        setChoosing(false);
        setColumnsNote(result.message);
      }
    });
  };
  const toggle = (key: string) =>
    setPicked((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  const noneChosen = choosing && columns !== null && picked.size === 0;

  return (
    <details className="popover popover--end export-menu" open={Boolean(outcome) || undefined}>
      <summary className={buttonClass({ size: "small", className: "popover__trigger" })}>
        <Download size={14} aria-hidden="true" />
        {label ?? "Export"}
      </summary>
      <div className="popover__panel popover__panel--wide">
        <p className="export-menu__title">Export {noun}</p>
        <p className="field__hint">
          {scope ??
            (offersView
              ? "The records on screen, or every one in the list."
              : "Every record in the list, not only the page shown.")}{" "}
          It needs a reason and is kept in the audit log.
        </p>
        {outcome && (
          <Callout tone="danger" role="alert" compact>
            {outcome}
          </Callout>
        )}
        <SudoGate
          action={sudoAction}
          fresh={sudoFresh}
          untilLabel={sudoUntilLabel}
          returnPath={returnPath}
          purpose="Exports need a fresh code from your authenticator app."
        />
        <form className="stack-form stack-form--tight" method="post" action="/exports">
          <input type="hidden" name="kind" value={kind} />
          <input type="hidden" name="back" value={returnPath} />
          {returnQuery && <input type="hidden" name="back_query" value={returnQuery} />}
          {view && <input type="hidden" name="view_json" value={JSON.stringify(view)} />}
          {offersView && (
            <fieldset className="format-choice format-choice--pair" disabled={!sudoFresh}>
              <legend className="format-choice__legend">Records</legend>
              <label
                className={`format-choice__option${records === "view" ? " format-choice__option--on" : ""}`}
              >
                <input
                  type="radio"
                  name="scope"
                  value="view"
                  checked={records === "view"}
                  onChange={() => setRecords("view")}
                />
                <span className="format-choice__name">This view</span>
                <span className="format-choice__hint">
                  The {viewCount.toLocaleString("en-GB")} on screen, in their order
                </span>
              </label>
              <label
                className={`format-choice__option${records === "all" ? " format-choice__option--on" : ""}`}
              >
                <input
                  type="radio"
                  name="scope"
                  value="all"
                  checked={records === "all"}
                  onChange={() => setRecords("all")}
                />
                <span className="format-choice__name">Every record</span>
                <span className="format-choice__hint">All {noun}, whatever the filters</span>
              </label>
            </fieldset>
          )}
          <fieldset className="format-choice" disabled={!sudoFresh}>
            <legend className="format-choice__legend">Format</legend>
            {EXPORT_FORMATS.map((option) => (
              <label
                key={option}
                className={`format-choice__option${format === option ? " format-choice__option--on" : ""}`}
              >
                <input
                  type="radio"
                  name="format"
                  value={option}
                  checked={format === option}
                  onChange={() => setFormat(option)}
                />
                <span className="format-choice__name">{FORMAT_LABELS[option].label}</span>
                <span className="format-choice__hint">{FORMAT_LABELS[option].hint}</span>
              </label>
            ))}
          </fieldset>
          <fieldset className="format-choice format-choice--pair" disabled={!sudoFresh}>
            <legend className="format-choice__legend">Columns</legend>
            <label
              className={`format-choice__option${!choosing ? " format-choice__option--on" : ""}`}
            >
              <input
                type="radio"
                name="column_mode"
                value="all"
                checked={!choosing}
                onChange={() => chooseColumns(false)}
              />
              <span className="format-choice__name">Every column</span>
              <span className="format-choice__hint">Custom fields included</span>
            </label>
            <label
              className={`format-choice__option${choosing ? " format-choice__option--on" : ""}`}
            >
              <input
                type="radio"
                name="column_mode"
                value="chosen"
                checked={choosing}
                onChange={() => chooseColumns(true)}
              />
              <span className="format-choice__name">Choose columns</span>
              <span className="format-choice__hint">Only what the file is for</span>
            </label>
          </fieldset>
          {columnsNote && <p className="field__hint">{columnsNote}</p>}
          {choosing && loading && <p className="field__hint">Reading the columns…</p>}
          {choosing && columns !== null && (
            <fieldset className="export-columns" disabled={!sudoFresh}>
              <legend className="sr-only">Columns to export</legend>
              <div className="export-columns__tools">
                <button
                  type="button"
                  className={buttonClass({ size: "small", variant: "ghost" })}
                  onClick={() => setPicked(new Set(columns.map((column) => column.key)))}
                >
                  All
                </button>
                <button
                  type="button"
                  className={buttonClass({ size: "small", variant: "ghost" })}
                  onClick={() => setPicked(new Set())}
                >
                  None
                </button>
                <span className="field__hint">
                  {picked.size} of {columns.length}
                </span>
              </div>
              <div className="export-columns__list">
                {columns.map((column) => (
                  <label key={column.key} className="export-columns__item">
                    <input
                      type="checkbox"
                      name="columns"
                      value={column.key}
                      checked={picked.has(column.key)}
                      onChange={() => toggle(column.key)}
                    />
                    <span>{column.label}</span>
                    {column.custom && <span className="export-columns__tag">Custom</span>}
                  </label>
                ))}
              </div>
            </fieldset>
          )}
          <div className="field">
            <div className="field__label">
              <label htmlFor={`${id}-reason`}>What it is for</label>
            </div>
            <input
              id={`${id}-reason`}
              className="input"
              name="reason"
              minLength={8}
              maxLength={400}
              required
              placeholder="e.g. Quarterly board pack"
              disabled={!sudoFresh}
            />
          </div>
          {noneChosen && <p className="field__hint">Choose at least one column.</p>}
          <button
            className={buttonClass({ variant: "primary" })}
            type="submit"
            disabled={!sudoFresh || noneChosen || (choosing && loading)}
          >
            Download {FORMAT_LABELS[format].label}
          </button>
        </form>
      </div>
    </details>
  );
}
