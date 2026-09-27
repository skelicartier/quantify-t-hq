import Link from "next/link";
import { notFound } from "next/navigation";

import {
  createTaskAction,
  logActivityAction,
  setTaskStatusAction,
} from "@/app/(portal)/_actions/work";
import { updatePersonAction } from "@/app/(portal)/people/actions";
import { ActivityTimeline } from "@/components/crm/activity-timeline";
import { LogActivityForm } from "@/components/crm/log-activity-form";
import { PersonEditForm } from "@/components/crm/person-forms";
import { LifecyclePill } from "@/components/crm/pills";
import { TaskList } from "@/components/crm/task-list";
import { TaskQuickAdd } from "@/components/crm/task-quick-add";
import { PageHeader } from "@/components/shell/page-header";
import { Callout } from "@/components/ui/callout";
import { Card } from "@/components/ui/card";
import { KeyValue, KeyValueRow } from "@/components/ui/key-value";
import { Popover } from "@/components/ui/popover";
import { StatusPill } from "@/components/ui/status-pill";
import { Timestamp } from "@/components/ui/timestamp";
import { hasCapability, requireStaff } from "@/lib/access/core";
import { HqApiRequestError, HqApiUnavailableError } from "@/lib/api/core";
import { readCompanies, readPerson, type PersonDetail } from "@/lib/api/crm";
import { directoryOrEmpty } from "@/lib/api/staff";
import { isoDay } from "@/lib/crm/dates";
import { requestNow } from "@/lib/request-time";

export const metadata = { title: "Person" };
export const dynamic = "force-dynamic";

const ROLE_LABELS: Record<string, string> = {
  decision_maker: "Decides",
  champion: "Champions us",
  user: "Uses it day to day",
  gatekeeper: "Gatekeeper",
  other: "Other",
};

type PersonPageProps = { params: Promise<{ personId: string }> };

export default async function PersonPage({ params }: PersonPageProps) {
  const { personId } = await params;
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
  const names = await directoryOrEmpty(context.token);
  const canWrite = hasCapability(context, "crm:write");
  let companyOptions: { company_id: string; name: string }[] = [];
  if (canWrite) {
    try {
      companyOptions = (await readCompanies(context.token)).companies.map((company) => ({
        company_id: company.company_id,
        name: company.name,
      }));
    } catch (error) {
      if (!(error instanceof HqApiUnavailableError || error instanceof HqApiRequestError))
        throw error;
    }
  }

  const { person, company, activities, open_tasks: openTasks } = detail;
  const returnPath = `/people/${person.person_id}`;
  const assignees = [...names.values()]
    .filter((entry) => entry.is_active)
    .map((entry) => ({ staff_id: entry.staff_id, display_name: entry.display_name }));

  return (
    <>
      <PageHeader
        eyebrow="Person"
        title={person.full_name || person.email}
        breadcrumbs={[{ label: "People", href: "/people" }]}
        description={
          <>
            {[person.title, company?.name].filter(Boolean).join(" at ") || "No title or firm yet"}
          </>
        }
        meta={
          <>
            {person.do_not_contact && (
              <StatusPill value="blocked" label="Do not contact" tone="danger" />
            )}
            {person.account_user_id && <StatusPill value="active" label="Has a product account" />}
          </>
        }
        actions={
          canWrite ? (
            <Popover label="Edit person" width="wide">
              <PersonEditForm
                action={updatePersonAction}
                person={person}
                companies={companyOptions}
              />
            </Popover>
          ) : undefined
        }
      />
      {person.do_not_contact && (
        <Callout tone="danger" compact>
          This person asked not to be contacted. Log what you learn, but do not reach out.
        </Callout>
      )}
      <div className="record-layout">
        <div className="record-layout__main">
          <section className="record-section" aria-labelledby="person-activity">
            <h2 className="record-section__title" id="person-activity">
              Activity
            </h2>
            {canWrite && (
              <LogActivityForm
                action={logActivityAction}
                links={{
                  person_id: person.person_id,
                  ...(person.company_id ? { company_id: person.company_id } : {}),
                }}
                returnPath={returnPath}
              />
            )}
            <ActivityTimeline activities={activities} now={now} />
          </section>
        </div>
        <aside className="record-layout__side">
          <Card title="Contact" titleAs="h3">
            <KeyValue>
              <KeyValueRow label="Email" mono>
                {person.email ? <a href={`mailto:${person.email}`}>{person.email}</a> : "—"}
              </KeyValueRow>
              <KeyValueRow label="Phone" mono>
                {person.phone || "—"}
              </KeyValueRow>
              <KeyValueRow label="Part in the decision">
                {ROLE_LABELS[person.role_category] ?? "Not known yet"}
              </KeyValueRow>
              <KeyValueRow label="Last contacted">
                <Timestamp
                  value={person.last_contacted_at}
                  now={now}
                  mode="relative"
                  fallback="Never"
                />
              </KeyValueRow>
            </KeyValue>
            {person.notes && <p className="prose-block prose-block--side">{person.notes}</p>}
          </Card>
          <Card title="Company" titleAs="h3">
            {company ? (
              <KeyValue>
                <KeyValueRow label="Firm">
                  <Link href={`/companies/${company.company_id}`}>{company.name}</Link>
                </KeyValueRow>
                <KeyValueRow label="Lifecycle">
                  <LifecyclePill lifecycle={company.lifecycle} />
                </KeyValueRow>
              </KeyValue>
            ) : (
              <p className="side-quiet">Not attached to a company.</p>
            )}
          </Card>
          <Card title="Open tasks" titleAs="h3">
            <TaskList
              tasks={openTasks}
              today={today}
              setStatus={canWrite ? setTaskStatusAction : undefined}
              returnPath={returnPath}
              names={names}
              emptyLabel="Nothing promised to this person."
            />
            {canWrite && (
              <TaskQuickAdd
                action={createTaskAction}
                links={{ person_id: person.person_id }}
                returnPath={returnPath}
                assignees={assignees}
                selfId={context.me.staff.staff_id}
              />
            )}
          </Card>
        </aside>
      </div>
    </>
  );
}
