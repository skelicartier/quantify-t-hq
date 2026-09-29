import Link from "next/link";
import { notFound } from "next/navigation";

import {
  createTaskAction,
  logActivityAction,
  setTaskStatusAction,
} from "@/app/(portal)/_actions/work";
import { updatePersonAction } from "@/app/(portal)/people/actions";
import { ActivityTimeline } from "@/components/crm/activity-timeline";
import { RecordHistory } from "@/components/crm/record-history";
import { LogActivityForm } from "@/components/crm/log-activity-form";
import { LifecyclePill } from "@/components/crm/pills";
import { TaskList } from "@/components/crm/task-list";
import { TaskQuickAdd } from "@/components/crm/task-quick-add";
import { Callout } from "@/components/ui/callout";
import { InlineField } from "@/components/ui/inline-field";
import {
  Properties,
  Property,
  RecordGrid,
  RecordHeader,
  RecordSection,
  RecordTabs,
  currentTab,
} from "@/components/ui/record-shell";
import { StatusPill } from "@/components/ui/status-pill";
import { Timestamp } from "@/components/ui/timestamp";
import { hasCapability, requireStaff } from "@/lib/access/core";
import { HqApiRequestError, HqApiUnavailableError } from "@/lib/api/core";
import { readCompanies, readPerson, type PersonDetail } from "@/lib/api/crm";
import { directoryOrNull } from "@/lib/api/staff";
import { isoDay } from "@/lib/crm/dates";
import { requestNow } from "@/lib/request-time";
import { firstSearchValue } from "@/lib/search-params";

export const metadata = { title: "Person" };
export const dynamic = "force-dynamic";

const ROLE_LABELS: Record<string, string> = {
  decision_maker: "Decides",
  champion: "Champions us",
  user: "Uses it day to day",
  gatekeeper: "Gatekeeper",
  other: "Other",
};

const TABS = [
  { key: "activity", label: "Activity" },
  { key: "tasks", label: "Tasks" },
  { key: "history", label: "History" },
];

type PersonPageProps = {
  params: Promise<{ personId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function PersonPage({ params, searchParams }: PersonPageProps) {
  const { personId } = await params;
  const tab = currentTab(firstSearchValue((await searchParams).tab), TABS);
  const context = await requireStaff(`/people/${personId}`);
  const now = requestNow();
  const today = isoDay(now);

  let detail: PersonDetail;
  try {
    detail = await readPerson(context.token, personId);
  } catch (error) {
    if (error instanceof HqApiRequestError && error.status === 404) notFound();
    throw error;
  }
  const names = await directoryOrNull(context.token);
  const canWrite = hasCapability(context, "crm:write");
  let companyOptions: { company_id: string; name: string }[] = [];
  if (canWrite) {
    try {
      companyOptions = (await readCompanies(context.token)).companies.map((row) => ({
        company_id: row.company_id,
        name: row.name,
      }));
    } catch (error) {
      if (!(error instanceof HqApiUnavailableError || error instanceof HqApiRequestError))
        throw error;
    }
  }

  const { person, company, activities, open_tasks: openTasks } = detail;
  const base = `/people/${person.person_id}`;
  const assignees = [...(names ?? new Map()).values()]
    .filter((entry) => entry.is_active)
    .map((entry) => ({ staff_id: entry.staff_id, display_name: entry.display_name }));
  const inline = {
    action: updatePersonAction,
    idName: "person_id",
    id: person.person_id,
    readOnly: !canWrite,
  };

  const tasks = (
    <RecordSection id="person-tasks" title="Open tasks">
      <TaskList
        tasks={openTasks}
        today={today}
        setStatus={canWrite ? setTaskStatusAction : undefined}
        returnPath={base}
        names={names}
        emptyLabel="Nothing promised to this person."
      />
      {canWrite && (
        <TaskQuickAdd
          action={createTaskAction}
          links={{ person_id: person.person_id }}
          returnPath={base}
          assignees={assignees}
          selfId={context.me.staff.staff_id}
        />
      )}
    </RecordSection>
  );

  return (
    <>
      <RecordHeader
        crumbs={[
          { href: "/people", label: "People" },
          ...(company ? [{ href: `/companies/${company.company_id}`, label: company.name }] : []),
        ]}
        title={person.full_name || person.email}
        favourite={{ href: base, label: person.full_name || person.email, kind: "Person" }}
        status={
          <>
            {person.title && <span className="quiet">{person.title}</span>}
            {person.do_not_contact && (
              <StatusPill value="blocked" label="Do not contact" tone="danger" />
            )}
            {person.account_user_id && <StatusPill value="active" label="Has a product account" />}
          </>
        }
        readouts={[
          {
            label: "Last contact",
            value: (
              <Timestamp
                value={person.last_contacted_at}
                now={now}
                mode="relative"
                fallback="Never"
              />
            ),
          },
          { label: "Open tasks", value: openTasks.length },
          { label: "Activity", value: activities.length },
        ]}
        actions={
          person.email && !person.do_not_contact ? (
            <a className="btn btn--small" href={`mailto:${person.email}`}>
              Email
            </a>
          ) : undefined
        }
      />
      {person.do_not_contact && (
        <Callout tone="danger" compact>
          This person asked not to be contacted. Log what you learn, but do not reach out.
        </Callout>
      )}
      <RecordTabs
        base={base}
        tabs={[
          { ...TABS[0]!, count: activities.length },
          { ...TABS[1]!, count: openTasks.length },
          TABS[2]!,
        ]}
        current={tab}
        label="Person sections"
      />
      <RecordGrid
        side={
          <>
            <Properties title="Contact">
              <InlineField {...inline} name="full_name" label="Name" value={person.full_name} />
              <Property label="Email" mono>
                {person.email ? <a href={`mailto:${person.email}`}>{person.email}</a> : "—"}
              </Property>
              <InlineField
                {...inline}
                name="phone"
                label="Phone"
                value={person.phone}
                placeholder="+41 …"
              />
              <InlineField {...inline} name="title" label="Title" value={person.title} />
              <InlineField
                {...inline}
                name="role_category"
                label="Part in the decision"
                type="select"
                value={person.role_category}
                options={[
                  { value: "", label: "Not known yet" },
                  ...Object.entries(ROLE_LABELS).map(([value, label]) => ({ value, label })),
                ]}
              />
              <InlineField
                {...inline}
                name="do_not_contact_choice"
                label="Contact"
                type="select"
                value={person.do_not_contact ? "yes" : "no"}
                options={[
                  { value: "no", label: "May be contacted" },
                  { value: "yes", label: "Do not contact" },
                ]}
              />
              <InlineField
                {...inline}
                name="company_id"
                label="Company"
                type="select"
                value={person.company_id}
                options={[
                  { value: "", label: "No company" },
                  ...companyOptions.map((row) => ({ value: row.company_id, label: row.name })),
                ]}
                display={
                  company ? (
                    <Link href={`/companies/${company.company_id}`}>{company.name}</Link>
                  ) : (
                    "Not attached to a company"
                  )
                }
                readOnly={!canWrite || companyOptions.length === 0}
              />
              {company && (
                <Property label="Lifecycle">
                  <LifecyclePill lifecycle={company.lifecycle} />
                </Property>
              )}
              <Property label="Added">
                <Timestamp value={person.created_at} mode="date" />
              </Property>
              <InlineField
                {...inline}
                name="notes"
                label="Notes"
                type="textarea"
                value={person.notes}
                placeholder="What the next person to open this should know"
              />
            </Properties>
            {tab !== "tasks" && tasks}
          </>
        }
      >
        {tab === "activity" && (
          <RecordSection id="person-activity" title="Activity">
            {canWrite && (
              <LogActivityForm
                action={logActivityAction}
                links={{
                  person_id: person.person_id,
                  ...(person.company_id ? { company_id: person.company_id } : {}),
                }}
                returnPath={base}
              />
            )}
            <ActivityTimeline activities={activities} now={now} />
          </RecordSection>
        )}
        {tab === "tasks" && tasks}
        {tab === "history" && (
          <RecordSection id="person-history" title="History">
            <RecordHistory
              token={context.token}
              entityType="person"
              entityId={person.person_id}
              names={names}
              canRead={hasCapability(context, "audit:read")}
              now={now}
            />
          </RecordSection>
        )}
      </RecordGrid>
    </>
  );
}
