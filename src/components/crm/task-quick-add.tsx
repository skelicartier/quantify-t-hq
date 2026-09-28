"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { FormFeedback } from "@/components/ui/form-feedback";
import { AttemptField } from "@/components/ui/attempt-field";
import { INITIAL_ACTION_STATE, type ActionState } from "@/lib/forms/action-state";
import { TASK_PRIORITIES, TASK_PRIORITY_LABELS } from "@/lib/crm/vocabulary";

type Links = Partial<Record<"company_id" | "person_id" | "deal_id" | "lead_id", string>>;

type TaskQuickAddProps = {
  action: (previous: ActionState, formData: FormData) => Promise<ActionState>;
  links?: Links;
  returnPath: string;
  /** Active colleagues; the first option is the person adding the task. */
  assignees: ReadonlyArray<{ staff_id: string; display_name: string }>;
  selfId: string;
};

/** One line to promise something: what, by when, for whom. */
export function TaskQuickAdd({
  action,
  links = {},
  returnPath,
  assignees,
  selfId,
}: TaskQuickAddProps) {
  const [state, formAction, isPending] = useActionState(action, INITIAL_ACTION_STATE);
  const scope = Object.values(links).find(Boolean) ?? "all";
  const others = assignees.filter((person) => person.staff_id !== selfId);
  return (
    <form className="task-add" action={formAction} key={state.sentAt ?? "task"}>
      <AttemptField state={state} />
      {Object.entries(links).map(([name, value]) =>
        value ? <input key={name} type="hidden" name={name} value={value} /> : null,
      )}
      <input type="hidden" name="return_path" value={returnPath} />
      <label className="sr-only" htmlFor={`task-title-${scope}`}>
        Task
      </label>
      <input
        id={`task-title-${scope}`}
        className="input task-add__title"
        name="title"
        maxLength={200}
        required
        placeholder="Add a task — what will you do next?"
        disabled={isPending}
      />
      <div className="task-add__row">
        <label className="task-add__field">
          <span className="task-add__label">Due</span>
          <input className="input" type="date" name="due_on" disabled={isPending} />
        </label>
        <label className="task-add__field">
          <span className="task-add__label">Priority</span>
          <select className="select" name="priority" defaultValue="medium" disabled={isPending}>
            {TASK_PRIORITIES.map((priority) => (
              <option key={priority} value={priority}>
                {TASK_PRIORITY_LABELS[priority]}
              </option>
            ))}
          </select>
        </label>
        <label className="task-add__field">
          <span className="task-add__label">For</span>
          <select
            className="select"
            name="assignee_staff_id"
            defaultValue={selfId}
            disabled={isPending}
          >
            <option value={selfId}>Me</option>
            {others.map((person) => (
              <option key={person.staff_id} value={person.staff_id}>
                {person.display_name}
              </option>
            ))}
          </select>
        </label>
        <Button type="submit" size="small" disabled={isPending}>
          {isPending ? "Adding…" : "Add task"}
        </Button>
      </div>
      <FormFeedback state={state} sentLabel="Task added." />
    </form>
  );
}
