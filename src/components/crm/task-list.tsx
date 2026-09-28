import Link from "next/link";

import { DueChip } from "@/components/crm/pills";
import { RowAction } from "@/components/ui/row-action";
import { StatusPill } from "@/components/ui/status-pill";
import type { Task } from "@/lib/api/crm";
import { nameFor, type DirectoryEntry } from "@/lib/api/staff";
import { TASK_PRIORITY_LABELS, taskPriorityTone } from "@/lib/crm/vocabulary";
import type { ActionState } from "@/lib/forms/action-state";

type TaskListProps = {
  tasks: readonly Task[];
  today: string;
  /** Server action taking `task_id` + `status` + `return_path`; reports its outcome. */
  setStatus?: ((previous: ActionState, formData: FormData) => Promise<ActionState>) | undefined;
  returnPath: string;
  /** Null when the directory could not be read: names say so rather than "—". */
  names: ReadonlyMap<string, DirectoryEntry> | null;
  /** Show which record each task belongs to (the all-tasks page does; a record page doesn't). */
  showRecord?: boolean;
  emptyLabel?: string;
};

function recordLink(task: Task) {
  const name = task.record_label;
  if (task.deal_id) return { href: `/deals/${task.deal_id}`, label: name || "Deal" };
  if (task.company_id) return { href: `/companies/${task.company_id}`, label: name || "Company" };
  if (task.person_id) return { href: `/people/${task.person_id}`, label: name || "Person" };
  if (task.lead_id) return { href: `/leads/${task.lead_id}`, label: name || "Lead" };
  if (task.ticket_id) return { href: `/support/${task.ticket_id}`, label: "Ticket" };
  return null;
}

export function TaskList({
  tasks,
  today,
  setStatus,
  returnPath,
  names,
  showRecord = false,
  emptyLabel = "No open tasks.",
}: TaskListProps) {
  if (tasks.length === 0) return <p className="timeline-empty">{emptyLabel}</p>;
  return (
    <ul className="task-list">
      {tasks.map((task) => {
        const done = task.status === "done";
        const link = showRecord ? recordLink(task) : null;
        const assignee = task.assignee_staff_id
          ? nameFor(names, task.assignee_staff_id, "A colleague")
          : "Anyone";
        return (
          <li key={task.task_id} className={done ? "task task--done" : "task"}>
            {setStatus ? (
              <RowAction
                action={setStatus}
                className="task__check-form"
                fields={{
                  task_id: task.task_id,
                  status: done ? "open" : "done",
                  return_path: returnPath,
                }}
                buttons={[
                  {
                    label: "",
                    className: "task__check",
                    ariaPressed: done,
                    ariaLabel: done ? `Reopen: ${task.title}` : `Mark done: ${task.title}`,
                  },
                ]}
              />
            ) : (
              <span className="task__check task__check--static" aria-hidden="true" />
            )}
            <div className="task__main">
              <p className="task__title">{task.title}</p>
              {task.body && <p className="task__body">{task.body}</p>}
              <p className="task__meta">
                {!done && <DueChip due={task.due_on} today={today} />}
                {task.priority !== "medium" && (
                  <StatusPill
                    value={task.priority}
                    label={TASK_PRIORITY_LABELS[task.priority] ?? task.priority}
                    tone={taskPriorityTone(task.priority)}
                  />
                )}
                <span className="task__who">{assignee}</span>
                {link && (
                  <Link className="task__record" href={link.href}>
                    {link.label}
                  </Link>
                )}
              </p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
