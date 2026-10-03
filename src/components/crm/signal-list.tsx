import Link from "next/link";

import { ActForm } from "@/components/ui/act-form";
import { Field, Input } from "@/components/ui/field";
import { Popover } from "@/components/ui/popover";
import { RowAction } from "@/components/ui/row-action";
import { StatusPill, type PillTone } from "@/components/ui/status-pill";
import { Timestamp } from "@/components/ui/timestamp";
import type { Signal } from "@/lib/api/signals";
import type { ActionState } from "@/lib/forms/action-state";

type Action = (previous: ActionState, formData: FormData) => Promise<ActionState>;

const KIND_TONES: Record<string, PillTone> = {
  product_signup: "live",
  product_use: "live",
  colleague_wrote_in: "attention",
  mail_click: "neutral",
};

/**
 * Signs of interest, newest first: what happened and what it rests on, with "Acted on"
 * (and a line) or "Dismiss" while a sign is open. `showSubject` names the record each is
 * on — off on the record's own page.
 */
export function SignalList({
  signals,
  now,
  action,
  canWrite,
  returnPath,
  showSubject,
}: {
  signals: readonly Signal[];
  now: number;
  action: Action;
  canWrite: boolean;
  returnPath: string;
  showSubject: boolean;
}) {
  return (
    <ul className="signal-list" aria-label="Signs of interest">
      {signals.map((signal) => (
        <li key={signal.signal_id} className="signal-list__row">
          <div className="signal-list__main">
            <p className="signal-list__head">
              <StatusPill
                value={signal.kind}
                label={signal.kind_label}
                tone={KIND_TONES[signal.kind] ?? "neutral"}
              />
              {showSubject && (
                <Link className="table-title" href={signal.link_path}>
                  {signal.subject_label || "A record"}
                </Link>
              )}
            </p>
            <p className="signal-list__evidence">{signal.evidence}</p>
            <p className="table-sub">
              <Timestamp value={signal.observed_at} now={now} mode="relative" />
              {signal.state !== "open" &&
                ` · ${signal.state === "acted" ? "acted on" : "dismissed"}${
                  signal.decided_by_name ? ` by ${signal.decided_by_name}` : ""
                }${signal.note ? `: ${signal.note}` : ""}`}
            </p>
          </div>
          {canWrite && signal.state === "open" && (
            <div className="signal-list__actions">
              <Popover align="end" label="Acted on">
                <ActForm
                  action={action}
                  hidden={{ signal_id: signal.signal_id, state: "acted", return_path: returnPath }}
                  act="acted"
                  label="Save"
                  primary
                >
                  <Field id={`signal-note-${signal.signal_id}`} label="What you did">
                    <Input
                      id={`signal-note-${signal.signal_id}`}
                      name="note"
                      maxLength={400}
                      placeholder="Called the CIO; a demo is booked"
                    />
                  </Field>
                </ActForm>
              </Popover>
              <RowAction
                action={action}
                fields={{
                  signal_id: signal.signal_id,
                  state: "dismissed",
                  return_path: returnPath,
                }}
                buttons={[
                  {
                    label: "Dismiss",
                    className: "btn btn--small btn--ghost",
                    ariaLabel: `Dismiss: ${signal.evidence}`,
                  },
                ]}
              />
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}
