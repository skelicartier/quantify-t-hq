"use client";

import { useActionState, useMemo, useState } from "react";

import { AttemptField } from "@/components/ui/attempt-field";
import { Button } from "@/components/ui/button";
import { FormFeedback } from "@/components/ui/form-feedback";
import { INITIAL_ACTION_STATE, type ActionState } from "@/lib/forms/action-state";

type Action = (previous: ActionState, formData: FormData) => Promise<ActionState>;
type Option = { id: string; name: string; sub: string };
type Contact = { kind: "person" | "lead"; id: string };

/**
 * People and leads from the CRM, added to a list: the list keeps their address, name,
 * firm, title and country as they are today, linked to the record.
 */
export function ListCrmPicker({
  listId,
  action,
  people,
  leads,
}: {
  listId: string;
  action: Action;
  people: readonly Option[];
  leads: readonly Option[];
}) {
  const [state, formAction, pending] = useActionState(action, INITIAL_ACTION_STATE);
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
    ).slice(0, 300);
  }, [options, needle]);
  const isChosen = (id: string) => chosen.some((item) => item.id === id);
  const toggle = (id: string) =>
    setChosen(isChosen(id) ? chosen.filter((item) => item.id !== id) : [...chosen, { kind, id }]);

  return (
    <form className="enrol-panel" action={formAction}>
      <AttemptField state={state} />
      <input type="hidden" name="list_id" value={listId} />
      <input type="hidden" name="contacts_json" value={JSON.stringify(chosen)} />
      <input type="hidden" name="basis" value="legitimate_interest" />
      <div className="audience-kinds" role="radiogroup" aria-label="Choose from">
        {(["person", "lead"] as const).map((option) => (
          <label
            key={option}
            className={`audience-kind${kind === option ? " audience-kind--on" : ""}`}
          >
            <input
              type="radio"
              name="list_crm_kind"
              checked={kind === option}
              onChange={() => setKind(option)}
            />
            {option === "person" ? "People" : "Leads"}
          </label>
        ))}
      </div>
      <div className="audience-pick">
        <div className="audience-pick__bar">
          <label className="sr-only" htmlFor="list-crm-search">
            Search
          </label>
          <input
            id="list-crm-search"
            className="input input--small"
            value={needle}
            onChange={(event) => setNeedle(event.target.value)}
            placeholder="Name, email or firm"
          />
          <button
            type="button"
            className="btn btn--small btn--ghost"
            onClick={() => {
              const next = [...chosen];
              for (const option of shown)
                if (!next.some((item) => item.id === option.id)) next.push({ kind, id: option.id });
              setChosen(next);
            }}
          >
            Select all shown
          </button>
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
      <p className="page-note">
        Added as business contacts. Their stops, bounces and do-not-contact still apply.
      </p>
      <div className="form-actions">
        <Button
          type="submit"
          size="small"
          variant="primary"
          disabled={pending || chosen.length === 0}
        >
          {pending ? "Adding…" : `Add ${chosen.length || ""} to the list`.replace("  ", " ")}
        </Button>
      </div>
      <FormFeedback state={state} />
    </form>
  );
}

/**
 * The bar above the members table: the checkboxes in the rows belong to this form (their
 * `form` attribute names it), so one press removes every ticked member.
 */
export function ListRemoveForm({
  formId,
  listId,
  action,
}: {
  formId: string;
  listId: string;
  action: Action;
}) {
  const [state, formAction, pending] = useActionState(action, INITIAL_ACTION_STATE);
  return (
    <form
      id={formId}
      className="list-remove"
      action={formAction}
      onSubmit={(event) => {
        const ticked = new FormData(event.currentTarget).getAll("member_id").length;
        if (ticked === 0) {
          event.preventDefault();
          return;
        }
        if (!window.confirm(`Take ${ticked} ${ticked === 1 ? "person" : "people"} off this list?`))
          event.preventDefault();
      }}
    >
      <AttemptField state={state} />
      <input type="hidden" name="list_id" value={listId} />
      <Button type="submit" size="small" variant="ghost" disabled={pending}>
        {pending ? "Removing…" : "Remove ticked"}
      </Button>
      <FormFeedback state={state} />
    </form>
  );
}
