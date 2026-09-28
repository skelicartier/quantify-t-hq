import Link from "next/link";
import { notFound } from "next/navigation";

import {
  createTaskAction,
  logActivityAction,
  setTaskStatusAction,
} from "@/app/(portal)/_actions/work";
import { updateCompanyAction } from "@/app/(portal)/companies/actions";
import { createDealAction } from "@/app/(portal)/deals/actions";
import { createPersonAction } from "@/app/(portal)/people/actions";
import { ActivityTimeline } from "@/components/crm/activity-timeline";
import { CompanyEditForm } from "@/components/crm/company-forms";
import { DealCreateForm } from "@/components/crm/deal-forms";
import { LogActivityForm } from "@/components/crm/log-activity-form";
import { PersonCreateForm } from "@/components/crm/person-forms";
import { DealFlags, DealStatusPill, DueChip, LifecyclePill } from "@/components/crm/pills";
import { TaskList } from "@/components/crm/task-list";
import { TaskQuickAdd } from "@/components/crm/task-quick-add";
import { PageHeader } from "@/components/shell/page-header";
import { Callout } from "@/components/ui/callout";
import { Card } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { KeyValue, KeyValueRow } from "@/components/ui/key-value";
import { Popover } from "@/components/ui/popover";
import { Stat, StatGrid } from "@/components/ui/stat";
import { StatusPill } from "@/components/ui/status-pill";
import { Timestamp } from "@/components/ui/timestamp";
import { hasCapability, requireStaff } from "@/lib/access/core";
import { HqApiRequestError, HqApiUnavailableError } from "@/lib/api/core";
import { readCompany, readCrmSettings, type CompanyDetail, type CrmSettings } from "@/lib/api/crm";
import { directoryOrNull, nameFor } from "@/lib/api/staff";
import { isoDay, isoDayPlus } from "@/lib/crm/dates";
import { sourceLabel, sourceNamesFrom } from "@/lib/crm/vocabulary";
import { formatDate, formatMrr, formatMrrBy, sumMoneyByCurrency } from "@/lib/format";
import { requestNow } from "@/lib/request-time";

export const metadata = { title: "Company" };
export const dynamic = "force-dynamic";

const DEAL_COLUMNS = [
  { key: "deal", label: "Deal" },
  { key: "stage", label: "Stage" },
  { key: "value", label: "Monthly value", align: "end" as const },
  { key: "next", label: "Next step" },
];

type CompanyPageProps = { params: Promise<{ companyId: string }> };

/**
 * One firm, everything HQ knows: who works there, what we are selling them, which
 * product accounts are theirs, what was promised and what happened.
 */
export default async function CompanyPage({ params }: CompanyPageProps) {
  const { companyId } = await params;
  const context = await requireStaff(`/companies/${companyId}`);
  const now = requestNow();
  const today = isoDay(now);

  let detail: CompanyDetail;
  try {
    detail = await readCompany(context.token, companyId);
  } catch (error) {
    if (error instanceof HqApiRequestError && error.status === 404) notFound();
    throw error;
  }
  let settings: CrmSettings | null = null;
  try {
    settings = await readCrmSettings(context.token);
  } catch (error) {
    if (!(error instanceof HqApiUnavailableError || error instanceof HqApiRequestError))
      throw error;
  }
  const names = await directoryOrNull(context.token);

  const { company, people, deals, accounts, open_tasks: openTasks, activities } = detail;
  const canWrite = hasCapability(context, "crm:write");
  const canDeal = hasCapability(context, "deals:write");
  const stageNames = new Map((settings?.pipeline ?? []).map((stage) => [stage.key, stage.label]));
  const sourceNames = sourceNamesFrom(settings);
  const openStages = (settings?.pipeline ?? [])
    .filter((stage) => !stage.outcome)
    .map((stage) => ({ key: stage.key, label: stage.label }));
  const openDeals = deals.filter((deal) => deal.status === "open");
  const pipelineMrr = sumMoneyByCurrency(
    openDeals.map((deal) => ({ amount: deal.mrr_amount, currency: deal.currency })),
  );
  const assignees = [...(names ?? new Map()).values()]
    .filter((entry) => entry.is_active)
    .map((entry) => ({ staff_id: entry.staff_id, display_name: entry.display_name }));
  const returnPath = `/companies/${company.company_id}`;

  return (
    <>
      <PageHeader
        eyebrow="Company"
        title={company.name}
        breadcrumbs={[{ label: "Companies", href: "/companies" }]}
        description={
          [company.domain, company.firm_type, company.country].filter(Boolean).join(" · ") ||
          "No details yet"
        }
        meta={
          <>
            <LifecyclePill lifecycle={company.lifecycle} />
            {company.customer_since && (
              <span className="meta-note">Customer since {formatDate(company.customer_since)}</span>
            )}
          </>
        }
        actions={
          canWrite ? (
            <Popover label="Edit details" width="wide">
              <CompanyEditForm action={updateCompanyAction} company={company} />
            </Popover>
          ) : undefined
        }
      />
      <StatGrid columns={4} label="This account">
        <Stat label="MRR" value={formatMrrBy(detail.mrr)} text hint="From contracts, today" />
        <Stat
          label="Open pipeline"
          value={formatMrrBy(pipelineMrr)}
          text
          hint={`${openDeals.length} open ${openDeals.length === 1 ? "deal" : "deals"}`}
        />
        <Stat label="People" value={people.length} />
        <Stat label="Product accounts" value={accounts.length} />
      </StatGrid>

      <div className="record-layout">
        <div className="record-layout__main">
          <section className="record-section" aria-labelledby="company-deals">
            <div className="record-section__head">
              <h2 className="record-section__title" id="company-deals">
                Deals
              </h2>
              {canDeal && openStages.length > 0 && (
                <Popover label="Open a deal" width="wide">
                  <DealCreateForm
                    action={createDealAction}
                    companyId={company.company_id}
                    stages={openStages}
                    people={people.map((person) => ({
                      person_id: person.person_id,
                      label: person.full_name || person.email,
                    }))}
                    defaultDue={isoDayPlus(now, 3)}
                  />
                </Popover>
              )}
            </div>
            <DataTable
              caption="Deals with this company"
              columns={DEAL_COLUMNS}
              scroll={false}
              isEmpty={deals.length === 0}
              empty={<p className="timeline-empty">No deals with this company yet.</p>}
            >
              {deals.map((deal) => (
                <tr
                  key={deal.deal_id}
                  className={deal.status === "open" ? undefined : "row--muted"}
                >
                  <td>
                    <Link className="table-title" href={`/deals/${deal.deal_id}`}>
                      {deal.name}
                    </Link>
                    <DealFlags
                      flags={deal.flags}
                      idleDays={deal.idle_days}
                      daysInStage={deal.days_in_stage}
                    />
                  </td>
                  <td>
                    {deal.status === "open" ? (
                      <StatusPill value="open" label={deal.stage_label} tone="neutral" />
                    ) : (
                      <DealStatusPill status={deal.status} />
                    )}
                  </td>
                  <td className="data-table__num">{formatMrr(deal.mrr_amount, deal.currency)}</td>
                  <td>
                    {deal.status === "open" ? (
                      <>
                        {deal.next_step || <span className="table-sub">None</span>}
                        {deal.next_step && (
                          <span className="table-sub">
                            <DueChip due={deal.next_step_due} today={today} />
                          </span>
                        )}
                      </>
                    ) : (
                      <span className="table-sub">
                        Closed <Timestamp value={deal.closed_at} mode="date" />
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </DataTable>
          </section>

          <section className="record-section" aria-labelledby="company-people">
            <div className="record-section__head">
              <h2 className="record-section__title" id="company-people">
                People
              </h2>
              {canWrite && (
                <Popover label="Add person">
                  <PersonCreateForm
                    action={createPersonAction}
                    companies={[]}
                    companyId={company.company_id}
                  />
                </Popover>
              )}
            </div>
            {people.length === 0 ? (
              <p className="timeline-empty">Nobody from this firm is on file yet.</p>
            ) : (
              <ul className="people-grid">
                {people.map((person) => (
                  <li key={person.person_id} className="person-chip">
                    <Link className="person-chip__name" href={`/people/${person.person_id}`}>
                      {person.full_name || person.email}
                    </Link>
                    <span className="person-chip__title">{person.title || "No title"}</span>
                    <span className="person-chip__email">{person.email}</span>
                    {person.do_not_contact && (
                      <StatusPill value="blocked" label="Do not contact" tone="danger" />
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="record-section" aria-labelledby="company-activity">
            <h2 className="record-section__title" id="company-activity">
              Activity
            </h2>
            {canWrite && (
              <LogActivityForm
                action={logActivityAction}
                links={{ company_id: company.company_id }}
                returnPath={returnPath}
              />
            )}
            <ActivityTimeline activities={activities} now={now} stageLabels={stageNames} />
          </section>
        </div>

        <aside className="record-layout__side">
          <Card title="Account" titleAs="h3">
            <KeyValue>
              <KeyValueRow label="Owner">
                {company.owner_staff_id ? nameFor(names, company.owner_staff_id) : "Unowned"}
              </KeyValueRow>
              <KeyValueRow label="Source">
                {sourceLabel(company.source_key, sourceNames)}
              </KeyValueRow>
              <KeyValueRow label="Team size">
                {company.team_size_band ? `${company.team_size_band} people` : "—"}
              </KeyValueRow>
              <KeyValueRow label="Added">
                <Timestamp value={company.created_at} mode="date" />
              </KeyValueRow>
            </KeyValue>
            {company.notes && <p className="prose-block prose-block--side">{company.notes}</p>}
          </Card>
          <Card title="Product accounts" titleAs="h3">
            {accounts.length === 0 ? (
              <p className="side-quiet">No product account is linked to this firm yet.</p>
            ) : (
              <ul className="side-list">
                {accounts.map((account) => (
                  <li key={account.account_user_id} className="account-row">
                    <span className="account-row__email">
                      {account.email || "Account details unavailable"}
                    </span>
                    <span className="side-quiet">
                      {account.profile_available ? (
                        <>
                          {account.plan || "No plan"} · signed in{" "}
                          <Timestamp
                            value={account.last_login_at}
                            now={now}
                            mode="relative"
                            fallback="never"
                          />
                        </>
                      ) : (
                        "The product record could not be read."
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card title="Open tasks" titleAs="h3">
            <TaskList
              tasks={openTasks}
              today={today}
              setStatus={canWrite ? setTaskStatusAction : undefined}
              returnPath={returnPath}
              names={names}
              emptyLabel="Nothing promised here."
            />
            {canWrite && (
              <TaskQuickAdd
                action={createTaskAction}
                links={{ company_id: company.company_id }}
                returnPath={returnPath}
                assignees={assignees}
                selfId={context.me.staff.staff_id}
              />
            )}
          </Card>
          {settings === null && (
            <Callout tone="attention" compact>
              Pipeline names could not be read; stages show their keys.
            </Callout>
          )}
        </aside>
      </div>
    </>
  );
}
