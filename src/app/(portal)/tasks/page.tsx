import Link from "next/link";

import { createTaskAction, setTaskStatusAction } from "@/app/(portal)/_actions/work";
import { TaskList } from "@/components/crm/task-list";
import { TaskQuickAdd } from "@/components/crm/task-quick-add";
import { PageHeader } from "@/components/shell/page-header";
import { Callout } from "@/components/ui/callout";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Stat, StatGrid } from "@/components/ui/stat";
import { SegmentedLinks } from "@/components/ui/toolbar";
import { hasCapability, requireStaff } from "@/lib/access/core";
import { HqApiRequestError, HqApiUnavailableError } from "@/lib/api/core";
import { readTasks, type Task, type TasksPage } from "@/lib/api/crm";
import { directoryOrEmpty } from "@/lib/api/staff";
import { isoDay } from "@/lib/crm/dates";
import { dueState } from "@/lib/format";
import { requestNow } from "@/lib/request-time";
import { firstSearchValue } from "@/lib/search-params";

export const metadata = { title: "Tasks" };
export const dynamic = "force-dynamic";

type TasksPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const GROUPS = [
  ["overdue", "Overdue"],
  ["today", "Today"],
  ["upcoming", "Coming up"],
  ["none", "No date"],
] as const;

export default async function TasksIndexPage({ searchParams }: TasksPageProps) {
  const context = await requireStaff("/tasks");
  const parameters = await searchParams;
  const scope = firstSearchValue(parameters.scope) === "all" ? "all" : "mine";
  const status = firstSearchValue(parameters.status) === "done" ? "done" : "open";
  const now = requestNow();
  const today = isoDay(now);

  let page: TasksPage | null = null;
  try {
    page = await readTasks(context.token, { scope, status });
  } catch (error) {
    if (!(error instanceof HqApiUnavailableError || error instanceof HqApiRequestError))
      throw error;
  }
  const names = await directoryOrEmpty(context.token);
  const canWrite = hasCapability(context, "crm:write");
  const assignees = [...names.values()]
    .filter((entry) => entry.is_active)
    .map((entry) => ({ staff_id: entry.staff_id, display_name: entry.display_name }));

  const link = (next: { scope?: string; status?: string }) => {
    const query = new URLSearchParams();
    if ((next.scope ?? scope) === "all") query.set("scope", "all");
    if ((next.status ?? status) === "done") query.set("status", "done");
    const rendered = query.toString();
    return rendered ? `/tasks?${rendered}` : "/tasks";
  };

  const grouped = new Map<string, Task[]>();
  for (const task of page?.tasks ?? []) {
    const bucket = status === "done" ? "done" : dueState(task.due_on, today);
    grouped.set(bucket, [...(grouped.get(bucket) ?? []), task]);
  }

  return (
    <>
      <PageHeader
        eyebrow="Work"
        title="Tasks"
        description="What each of us promised to do next. Ticking one off logs it on the record it belongs to."
        actions={
          <SegmentedLinks
            label="Whose tasks"
            items={[
              { href: link({ scope: "mine" }), label: "Mine", current: scope === "mine" },
              { href: link({ scope: "all" }), label: "Everyone's", current: scope === "all" },
            ]}
          />
        }
      />
      {page === null ? (
        <Callout tone="danger" role="alert">
          Tasks could not be read just now. This is a read failure, not an empty list.
        </Callout>
      ) : (
        <div className="record-layout">
          <div className="record-layout__main">
            <StatGrid columns={3} label="Tasks">
              <Stat
                label="Overdue"
                value={page.counts.overdue}
                tone={page.counts.overdue > 0 ? "danger" : "default"}
              />
              <Stat label="Due today" value={(grouped.get("today") ?? []).length} />
              <Stat label={status === "done" ? "Done" : "Open"} value={page.counts.open} />
            </StatGrid>
            <nav className="filter-strip" aria-label="Task filters">
              <span className="eyebrow">Show</span>
              <Link
                href={link({ status: "open" })}
                aria-current={status === "open" ? "page" : undefined}
              >
                Open
              </Link>
              <Link
                href={link({ status: "done" })}
                aria-current={status === "done" ? "page" : undefined}
              >
                Done
              </Link>
            </nav>
            {page.tasks.length === 0 ? (
              <EmptyState
                title={status === "done" ? "Nothing finished yet" : "Nothing open"}
                description={
                  status === "done"
                    ? "Completed tasks appear here."
                    : "Add one on the right, or from any lead, company, person or deal."
                }
              />
            ) : status === "done" ? (
              <TaskList
                tasks={page.tasks}
                today={today}
                setStatus={canWrite ? setTaskStatusAction : undefined}
                returnPath="/tasks"
                names={names}
                showRecord
              />
            ) : (
              GROUPS.map(([key, label]) => {
                const tasks = grouped.get(key) ?? [];
                if (tasks.length === 0) return null;
                return (
                  <section key={key} className="task-group" aria-labelledby={`tasks-${key}`}>
                    <h2
                      className={`task-group__title task-group__title--${key}`}
                      id={`tasks-${key}`}
                    >
                      {label} <span className="task-group__count">{tasks.length}</span>
                    </h2>
                    <TaskList
                      tasks={tasks}
                      today={today}
                      setStatus={canWrite ? setTaskStatusAction : undefined}
                      returnPath="/tasks"
                      names={names}
                      showRecord
                    />
                  </section>
                );
              })
            )}
          </div>
          {canWrite && (
            <aside className="record-layout__side">
              <Card
                title="New task"
                titleAs="h3"
                description="Tasks added here belong to no record. Add from a record page to attach one."
              >
                <TaskQuickAdd
                  action={createTaskAction}
                  returnPath="/tasks"
                  assignees={assignees}
                  selfId={context.me.staff.staff_id}
                />
              </Card>
            </aside>
          )}
        </div>
      )}
    </>
  );
}
