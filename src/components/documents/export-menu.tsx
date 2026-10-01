"use client";

import { Download } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useState } from "react";

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
  sudoFresh: boolean;
  sudoUntilLabel: string | null;
  sudoAction: (previous: ActionState, formData: FormData) => Promise<ActionState>;
};

/**
 * "Export" in a list's header: the whole list as a CSV, a spreadsheet or a PDF on the
 * letterhead. Every one goes through the same door as the reports page — a fresh code,
 * a written reason, the day's quota and an audit row — so it is offered only to people
 * whose role exports, and says so when the service refuses.
 */
export function ExportMenu({
  kind,
  returnPath,
  sudoFresh,
  sudoUntilLabel,
  sudoAction,
}: ExportMenuProps) {
  const params = useSearchParams();
  const outcome = EXPORT_OUTCOMES[params.get("export") ?? ""];
  const [format, setFormat] = useState<ExportFormat>("pdf");
  const id = `export-${kind}`;
  return (
    <details className="popover popover--end export-menu" open={Boolean(outcome) || undefined}>
      <summary className={buttonClass({ size: "small", className: "popover__trigger" })}>
        <Download size={14} aria-hidden="true" />
        Export
      </summary>
      <div className="popover__panel popover__panel--wide">
        <p className="export-menu__title">Export {EXPORT_LABELS[kind].toLowerCase()}</p>
        <p className="field__hint">
          Every record in the list, not only the page shown. It needs a reason and is kept in the
          audit log.
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
          <button
            className={buttonClass({ variant: "primary" })}
            type="submit"
            disabled={!sudoFresh}
          >
            Download {FORMAT_LABELS[format].label}
          </button>
        </form>
      </div>
    </details>
  );
}
