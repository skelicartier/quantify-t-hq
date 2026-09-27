import Link from "next/link";

import { DueChip } from "@/components/crm/pills";
import { StatusPill } from "@/components/ui/status-pill";
import type { Task } from "@/lib/api/crm";
import type { DirectoryEntry } from "@/lib/api/staff";
import { TASK_PRIORITY_LABELS, taskPriorityTone } from "@/lib/crm/vocabulary";

type TaskListProps = {
  tasks: readonly Task[];
  today: string;
  /** Void server action taking `task_id` + `status` + `return_path`. */
  setStatus?: ((formData: FormData) => Promise<void>) | undefined;
  returnPath: string;
  names: ReadonlyMap<string, DirectoryEntry>;
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
          ? (names.get(task.assignee_staff_id)?.display_name ?? "A colleague")
          : "Anyone";
        return (
          <li key={task.task_id} className={done ? "task task--done" : "task"}>
            {setStatus ? (
              <form action={setStatus} className="task__check-form">
                <input type="hidden" name="task_id" value={task.task_id} />
                <input type="hidden" name="status" value={done ? "open" : "done"} />
                <input type="hidden" name="return_path" value={returnPath} />
                <button
                  type="submit"
                  className="task__check"
                  aria-pressed={done}
                  aria-label={done ? `Reopen: ${task.title}` : `Mark done: ${task.title}`}
                />
              </form>
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
