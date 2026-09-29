"use client";

import { useActionState, useMemo, useState } from "react";

import { AttemptField } from "@/components/ui/attempt-field";
import { Button } from "@/components/ui/button";
import { FormFeedback } from "@/components/ui/form-feedback";
import { SKIP_REASON_LABELS, type EnrolVerdict } from "@/lib/api/mail-schema";
import { INITIAL_ACTION_STATE, type ActionState } from "@/lib/forms/action-state";

type Action = (previous: ActionState, formData: FormData) => Promise<ActionState>;
type Option = { id: string; name: string; sub: string };
type Contact = { kind: "person" | "lead"; id: string };

function verdictsFrom(detail: string | undefined): EnrolVerdict[] {
  if (!detail) return [];
  try {
    const parsed = JSON.parse(detail) as { verdicts?: EnrolVerdict[] };
    return parsed.verdicts ?? [];
  } catch {
    return [];
  }
}

/**
 * Choose people or leads, check who the sequence would take and who it refuses and why,
 * then enrol. Nothing is sent until the first step's slot in each person's working day.
 */
export function EnrolPanel({
  sequenceId,
  previewAction,
  enrolAction,
  people,
  leads,
  disabled,
}: {
  sequenceId: string;
  previewAction: Action;
  enrolAction: Action;
  people: readonly Option[];
  leads: readonly Option[];
  disabled: boolean;
}) {
  const [checkState, check, checking] = useActionState(previewAction, INITIAL_ACTION_STATE);
  const [enrolState, enrol, enrolling] = useActionState(enrolAction, INITIAL_ACTION_STATE);
  const [kind, setKind] = useState<"person" | "lead">("person");
  const [needle, setNeedle] = useState("");
  const [chosen, setChosen] = useState<Contact[]>([]);
  const options = kind === "person" ? people : leads;
  const shown = useMemo(() => {
    const text = needle.trim().toLowerCase();
    return (
      text
        ? options.filter((option) => `${option.name} ${option.sub}`.toLowerCase().includes(text))
        : options
    ).slice(0, 200);
  }, [options, needle]);
  const isChosen = (id: string) => chosen.some((item) => item.id === id);
  const toggle = (id: string) =>
    setChosen(isChosen(id) ? chosen.filter((item) => item.id !== id) : [...chosen, { kind, id }]);
  const verdicts =
    enrolState.status === "sent"
      ? verdictsFrom(enrolState.detail)
      : checkState.status === "sent"
        ? verdictsFrom(checkState.detail)
        : [];
  const contactsJson = JSON.stringify(chosen);

  return (
    <div className="enrol-panel">
      <div className="audience-kinds" role="radiogroup" aria-label="Choose from">
        {(["person", "lead"] as const).map((option) => (
          <label
            key={option}
            className={`audience-kind${kind === option ? " audience-kind--on" : ""}`}
          >
            <input
              type="radio"
              name="enrol_kind"
              checked={kind === option}
              onChange={() => setKind(option)}
            />
            {option === "person" ? "People" : "Leads"}
          </label>
        ))}
      </div>
      <div className="audience-pick">
        <div className="audience-pick__bar">
          <label className="sr-only" htmlFor="enrol-search">
            Search
          </label>
          <input
            id="enrol-search"
            className="input input--small"
            value={needle}
            onChange={(event) => setNeedle(event.target.value)}
            placeholder="Name, email or firm"
          />
          <button type="button" className="btn btn--small btn--ghost" onClick={() => setChosen([])}>
            Clear
          </button>
          <span className="audience-pick__count" aria-live="polite">
            {chosen.length} chosen
          </span>
        </div>
        <ul className="audience-pick__list" aria-label="Choices">
          {shown.map((option) => (
            <li key={option.id}>
              <label>
                <input
                  type="checkbox"
                  checked={isChosen(option.id)}
                  onChange={() => toggle(option.id)}
                />
                <span className="audience-pick__name">{option.name || "Unnamed"}</span>
                <span className="audience-pick__sub">{option.sub}</span>
              </label>
            </li>
          ))}
          {shown.length === 0 && <li className="audience-pick__none">Nothing matches.</li>}
        </ul>
      </div>
      <div className="form-actions">
        <form action={check}>
          <input type="hidden" name="sequence_id" value={sequenceId} />
          <input type="hidden" name="contacts_json" value={contactsJson} />
          <Button type="submit" size="small" disabled={checking || chosen.length === 0}>
            {checking ? "Checking…" : "Check who it takes"}
          </Button>
        </form>
        <form action={enrol}>
          <AttemptField state={enrolState} />
          <input type="hidden" name="sequence_id" value={sequenceId} />
          <input type="hidden" name="contacts_json" value={contactsJson} />
          <Button
            type="submit"
            size="small"
            variant="primary"
            disabled={enrolling || chosen.length === 0 || disabled}
          >
            {enrolling ? "Enrolling…" : `Enrol ${chosen.length || ""}`.trim()}
          </Button>
        </form>
      </div>
      {checkState.status === "error" && <FormFeedback state={checkState} />}
      <FormFeedback state={enrolState} />
      {verdicts.length > 0 && (
        <ul className="verdicts" aria-label="Who it takes">
          {verdicts.map((verdict) => (
            <li
              key={`${verdict.contact_kind}:${verdict.contact_id}`}
              className={verdict.allowed ? "verdict verdict--ok" : "verdict verdict--no"}
            >
              <span className="verdict__name">{verdict.name || verdict.email || "Unnamed"}</span>
              <span className="verdict__sub">
                {[verdict.company, verdict.email].filter(Boolean).join(" · ")}
              </span>
              <span className="verdict__reason">
                {verdict.allowed
                  ? verdict.enrolment_id
                    ? "Enrolled"
                    : "Takes them"
                  : (SKIP_REASON_LABELS[verdict.reason] ?? verdict.reason)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
