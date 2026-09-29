"use client";

import { useActionState, useEffect, useRef, useState } from "react";

import { AttemptField } from "@/components/ui/attempt-field";
import { FormFeedback } from "@/components/ui/form-feedback";
import { RowAction } from "@/components/ui/row-action";
import { INITIAL_ACTION_STATE, type ActionState } from "@/lib/forms/action-state";

/**
 * The bar that appears when rows are selected: the count, one change to apply to all of
 * them, and a way out. Selection lives in the rows' own checkboxes (`input[data-select]`
 * inside the named table), so the server-rendered table stays plain HTML; this bar only
 * counts them, supports shift-click ranges, and gathers the ids when a change is sent.
 */

export type BulkChoice = { value: string; label: string };

export type BulkField = {
  field: string;
  label: string;
  choices: readonly BulkChoice[];
};

export function SelectionBar({
  tableId,
  kind,
  noun,
  fields,
  action,
  undoAction,
}: {
  tableId: string;
  kind: string;
  noun: [singular: string, plural: string];
  fields: readonly BulkField[];
  action: (previous: ActionState, formData: FormData) => Promise<ActionState>;
  /** Puts the last change back; offered beside the outcome while the plan is fresh. */
  undoAction?: ((previous: ActionState, formData: FormData) => Promise<ActionState>) | undefined;
}) {
  const [count, setCount] = useState(0);
  const [state, formAction, isPending] = useActionState(action, INITIAL_ACTION_STATE);
  const seenSent = useRef<number | undefined>(undefined);

  // A change that took clears the selection: the rows re-render unchecked from the
  // service, and the bar steps aside to show what happened.
  useEffect(() => {
    if (state.status !== "sent" || state.sentAt === seenSent.current) return undefined;
    seenSent.current = state.sentAt;
    const timer = window.setTimeout(() => {
      const table = document.getElementById(tableId);
      for (const box of table?.querySelectorAll<HTMLInputElement>(
        "input[data-select], input[data-select-all]",
      ) ?? []) {
        box.checked = false;
      }
      setCount(0);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [state, tableId]);

  useEffect(() => {
    const table = document.getElementById(tableId);
    if (!table) return undefined;
    const boxes = () => Array.from(table.querySelectorAll<HTMLInputElement>("input[data-select]"));
    const recount = () => setCount(boxes().filter((box) => box.checked).length);
    let last: HTMLInputElement | null = null;
    const onClick = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof HTMLInputElement) || !target.hasAttribute("data-select")) return;
      if (event.shiftKey && last && last !== target) {
        const all = boxes();
        const a = all.indexOf(last);
        const b = all.indexOf(target);
        for (const box of all.slice(Math.min(a, b), Math.max(a, b) + 1))
          box.checked = target.checked;
      }
      last = target;
      recount();
    };
    const onChange = (event: Event) => {
      const target = event.target;
      if (target instanceof HTMLInputElement && target.hasAttribute("data-select")) recount();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && boxes().some((box) => box.checked)) {
        for (const box of boxes()) box.checked = false;
        const all = table.querySelector<HTMLInputElement>("input[data-select-all]");
        if (all) all.checked = false;
        recount();
      }
    };
    table.addEventListener("click", onClick);
    table.addEventListener("change", onChange);
    window.addEventListener("keydown", onKey);
    recount();
    return () => {
      table.removeEventListener("click", onClick);
      table.removeEventListener("change", onChange);
      window.removeEventListener("keydown", onKey);
    };
  }, [tableId]);

  const gather = (form: HTMLFormElement) => {
    const table = document.getElementById(tableId);
    const ids = table
      ? Array.from(table.querySelectorAll<HTMLInputElement>("input[data-select]:checked")).map(
          (box) => box.value,
        )
      : [];
    const field = form.elements.namedItem("ids");
    if (field instanceof HTMLInputElement) field.value = ids.join(",");
  };
  const clear = () => {
    const table = document.getElementById(tableId);
    if (!table) return;
    for (const box of table.querySelectorAll<HTMLInputElement>(
      "input[data-select], input[data-select-all]",
    )) {
      box.checked = false;
    }
    setCount(0);
  };

  if (count === 0) {
    return state.status === "sent" ? (
      <p className="selbar__done" role="status">
        {state.message}
        {undoAction && state.detail && (
          <RowAction
            action={undoAction}
            fields={{ undo_json: state.detail }}
            buttons={[
              {
                label: "Undo",
                className: "btn btn--small btn--ghost",
                pendingLabel: "Putting back…",
              },
            ]}
            className="selbar__undo"
          />
        )}
      </p>
    ) : null;
  }

  return (
    <div className="selbar" role="region" aria-label="Selected rows">
      <strong className="selbar__count">
        {count} {count === 1 ? noun[0] : noun[1]} selected
      </strong>
      {fields.map((spec) => (
        <form
          key={spec.field}
          className="selbar__form"
          action={formAction}
          onSubmit={(event) => gather(event.currentTarget)}
        >
          <AttemptField state={state} />
          <input type="hidden" name="kind" value={kind} />
          <input type="hidden" name="field" value={spec.field} />
          <input type="hidden" name="ids" value="" />
          <label className="selbar__label">
            <span>{spec.label}</span>
            <select className="select select--small" name="value" defaultValue="" required>
              <option value="" disabled>
                Choose…
              </option>
              {spec.choices.map((choice) => (
                <option key={choice.value || "none"} value={choice.value}>
                  {choice.label}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" className="btn btn--small btn--primary" disabled={isPending}>
            {isPending ? "Applying…" : "Apply"}
          </button>
        </form>
      ))}
      <button type="button" className="btn btn--small btn--ghost" onClick={clear}>
        Clear
      </button>
      <FormFeedback state={state} />
    </div>
  );
}
