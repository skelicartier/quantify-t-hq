"use client";

import { Check, Pencil, X } from "lucide-react";
import { startTransition, useActionState, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";

import { AttemptField } from "@/components/ui/attempt-field";
import { INITIAL_ACTION_STATE, type ActionState } from "@/lib/forms/action-state";

export type InlineOption = { value: string; label: string };

type InlineFieldProps = {
  /** The record's update action; it receives the id field and this one field only. */
  action: (previous: ActionState, formData: FormData) => Promise<ActionState>;
  idName: string;
  id: string;
  name: string;
  label: string;
  /** The stored value, as the input needs it. */
  value: string;
  /** How the value reads when not being edited; defaults to the value or a dash. */
  display?: ReactNode;
  type?: "text" | "select" | "date" | "textarea" | "number" | "url" | "email";
  options?: readonly InlineOption[];
  placeholder?: string;
  /** Read-only for this role: the value shows, the pencil does not. */
  readOnly?: boolean;
  /** Extra fields the action needs alongside the one being edited. */
  extra?: Record<string, string>;
};

/** How long a saved change can be undone from where it was made. */
const UNDO_SECONDS = 15;

/**
 * A property that edits where it sits. Click the value (or press Enter on it) to get
 * the field; Enter saves, Escape cancels; the row says "Saved" for a moment and shows
 * the new value once the page re-renders from the service. One field per submission,
 * so nothing else on the record can be blanked by accident.
 *
 * For a few seconds after a change it can be undone: the value it had is saved back
 * through the same action, so the record's history keeps both the change and its undo.
 */
export function InlineField({
  action,
  idName,
  id,
  name,
  label,
  value,
  display,
  type = "text",
  options = [],
  placeholder,
  readOnly = false,
  extra = {},
}: InlineFieldProps) {
  const [state, formAction, isPending] = useActionState(action, INITIAL_ACTION_STATE);
  const [editing, setEditing] = useState(false);
  const fieldRef = useRef<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(null);
  const seenSent = useRef<number | undefined>(undefined);
  /** The value when editing began, and the one sent: what an undo puts back, and whether it changed. */
  const before = useRef(value);
  const submitted = useRef<string | null>(null);
  const undoing = useRef(false);
  const [undoable, setUndoable] = useState(false);
  const [undoError, setUndoError] = useState("");

  // A success closes the editor; the effect only reacts to the action's answer.
  useEffect(() => {
    if (state.status === "sent" && state.sentAt !== seenSent.current) {
      seenSent.current = state.sentAt;
      const changed = submitted.current !== null && submitted.current !== before.current;
      const offer = changed && !undoing.current;
      undoing.current = false;
      submitted.current = null;
      const close = window.setTimeout(() => {
        setEditing(false);
        setUndoable(offer);
      }, 0);
      const expire = offer
        ? window.setTimeout(() => setUndoable(false), UNDO_SECONDS * 1_000)
        : undefined;
      return () => {
        window.clearTimeout(close);
        if (expire !== undefined) window.clearTimeout(expire);
      };
    }
    if (state.status === "error" && undoing.current) {
      // An undo the service refused: said beside the value, which is still the new one.
      undoing.current = false;
      const shown = window.setTimeout(() => setUndoError(state.message ?? "Not undone."), 0);
      return () => window.clearTimeout(shown);
    }
    return undefined;
  }, [state]);

  function begin() {
    setUndoError("");
    before.current = value;
    setUndoable(false);
    setEditing(true);
  }

  function undo() {
    const data = new FormData();
    data.set("attempt", crypto.randomUUID());
    data.set(idName, id);
    for (const [key, val] of Object.entries(extra)) data.set(key, val);
    data.set(name, before.current);
    undoing.current = true;
    submitted.current = before.current;
    setUndoable(false);
    setUndoError("");
    startTransition(() => formAction(data));
  }

  useEffect(() => {
    if (editing) fieldRef.current?.focus();
  }, [editing]);

  const shown =
    display ??
    (type === "select"
      ? (options.find((option) => option.value === value)?.label ?? (value || "—"))
      : value || "—");

  if (readOnly) {
    return (
      <div className="prop">
        <dt className="prop__label">{label}</dt>
        <dd className="prop__value">{shown}</dd>
      </div>
    );
  }

  if (!editing) {
    // A custom display may carry its own link, so it sits beside the pencil rather
    // than inside it — a control inside a control is a control nobody can reach.
    return (
      <div className="prop prop--editable">
        <dt className="prop__label">{label}</dt>
        <dd className="prop__value">
          {display !== undefined ? (
            <>
              <span className="prop__shown">{shown}</span>
              <button
                type="button"
                className="prop__edit prop__edit--icon"
                onClick={begin}
                aria-label={`Edit ${label}`}
              >
                <Pencil size={12} strokeWidth={1.8} aria-hidden="true" />
              </button>
            </>
          ) : (
            <button
              type="button"
              className="prop__edit"
              onClick={begin}
              aria-label={`Edit ${label}`}
            >
              <span className="prop__shown">{shown}</span>
              <Pencil size={12} strokeWidth={1.8} aria-hidden="true" />
            </button>
          )}
          {state.status === "sent" && (
            <span className="prop__saved" role="status">
              Saved
            </span>
          )}
          {undoable && (
            <button
              type="button"
              className="prop__undo"
              onClick={undo}
              disabled={isPending}
              aria-label={`Undo the change to ${label}`}
            >
              Undo
            </button>
          )}
          {undoError && (
            <span className="prop__error" role="alert">
              {undoError}
            </span>
          )}
        </dd>
      </div>
    );
  }

  const fieldId = `inline-${idName}-${name}`;
  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Escape") {
      event.preventDefault();
      setEditing(false);
    } else if (event.key === "Enter" && type !== "textarea") {
      event.preventDefault();
      (event.currentTarget as HTMLElement).closest("form")?.requestSubmit();
    }
  };

  return (
    <div className="prop prop--editing">
      <dt className="prop__label">
        <label htmlFor={fieldId}>{label}</label>
      </dt>
      <dd className="prop__value">
        <form
          action={formAction}
          className="prop__form"
          onSubmit={(event) => {
            submitted.current = String(new FormData(event.currentTarget).get(name) ?? "");
          }}
        >
          <AttemptField state={state} />
          <input type="hidden" name={idName} value={id} />
          {Object.entries(extra).map(([key, val]) => (
            <input key={key} type="hidden" name={key} value={val} />
          ))}
          {type === "select" ? (
            <select
              id={fieldId}
              name={name}
              defaultValue={value}
              className="select select--small"
              disabled={isPending}
              ref={fieldRef as React.RefObject<HTMLSelectElement>}
              onKeyDown={onKeyDown}
            >
              {options.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          ) : type === "textarea" ? (
            <textarea
              id={fieldId}
              name={name}
              defaultValue={value}
              className="textarea"
              rows={4}
              disabled={isPending}
              ref={fieldRef as React.RefObject<HTMLTextAreaElement>}
              onKeyDown={onKeyDown}
              placeholder={placeholder}
            />
          ) : (
            <input
              id={fieldId}
              name={name}
              type={type}
              defaultValue={value}
              className="input input--small"
              disabled={isPending}
              ref={fieldRef as React.RefObject<HTMLInputElement>}
              onKeyDown={onKeyDown}
              placeholder={placeholder}
            />
          )}
          <span className="prop__buttons">
            <button
              type="submit"
              className="prop__btn prop__btn--save"
              disabled={isPending}
              aria-label={`Save ${label}`}
            >
              <Check size={13} strokeWidth={2} aria-hidden="true" />
            </button>
            <button
              type="button"
              className="prop__btn"
              onClick={() => setEditing(false)}
              disabled={isPending}
              aria-label="Cancel"
            >
              <X size={13} strokeWidth={2} aria-hidden="true" />
            </button>
          </span>
          {state.status === "error" && state.message && (
            <p className="prop__error" role="alert">
              {state.message}
            </p>
          )}
        </form>
      </dd>
    </div>
  );
}
