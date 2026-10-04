import { RecordAutomations } from "@/components/platform/record-automations";
import { CustomFieldInputs } from "@/components/platform/custom-field-inputs";
import { readFields, type CustomField } from "@/lib/api/fields";
import { CustomFieldsSection } from "@/components/platform/custom-fields-section";
import Link from "next/link";
import { RecordComments } from "@/components/platform/comments-section";
import { RecordTemplates } from "@/components/platform/record-templates";
import { AiBrief } from "@/components/ai/ai-assist";
import { aiFeedbackAction, briefAction } from "@/app/(portal)/_actions/ai";
import { notFound } from "next/navigation";

import {
  createTaskAction,
  logActivityAction,
  setTaskStatusAction,
} from "@/app/(portal)/_actions/work";
import {
  mergeCompanyAction,
  removeTargetAction,
  setTargetAction,
  updateCompanyAction,
} from "@/app/(portal)/companies/actions";
import { TargetPlanForm } from "@/components/crm/target-plan-form";
import { SignalList } from "@/components/crm/signal-list";
import { decideSignalAction } from "@/app/(portal)/leads/actions";
import { RowAction } from "@/components/ui/row-action";
import { MergeRecordForm } from "@/components/crm/merge-record-form";
import { createDealAction } from "@/app/(portal)/deals/actions";
import { createPersonAction } from "@/app/(portal)/people/actions";
import { ActivityTimeline } from "@/components/crm/activity-timeline";
import { RecordHistory } from "@/components/crm/record-history";
import { DealCreateForm } from "@/components/crm/deal-forms";
import { LogActivityForm } from "@/components/crm/log-activity-form";
import { PersonCreateForm } from "@/components/crm/person-forms";
import { DealFlags, DealStatusPill, DueChip, LifecyclePill } from "@/components/crm/pills";
import { TaskList } from "@/components/crm/task-list";
import { TaskQuickAdd } from "@/components/crm/task-quick-add";
import { Callout } from "@/components/ui/callout";
import { DataTable } from "@/components/ui/data-table";
import { InlineField } from "@/components/ui/inline-field";
import { Popover } from "@/components/ui/popover";
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
import { RecordFollow } from "@/components/inbox/record-follow";
import { ViewedBy } from "@/components/security/viewed-by";
import { CompanyPrivacy } from "@/components/privacy/company-privacy";
import { CompanySuccess } from "@/components/success/company-success";
import { CompanyReferences } from "@/components/success/company-references";
import { CompanyReviews } from "@/components/success/company-reviews";
import { CompanyBilling } from "@/components/revenue/company-billing";
import { HqApiRequestError, HqApiUnavailableError } from "@/lib/api/core";
import {
  readCompanies,
  readCompany,
  readCrmSettings,
  type CompanyDetail,
  type CrmSettings,
} from "@/lib/api/crm";
import { directoryOrNull, nameFor } from "@/lib/api/staff";
import { colleaguesOf } from "@/lib/api/share";
import {
  archiveRecordAction,
  restoreRecordAction,
  shareRecordAction,
} from "@/app/(portal)/_actions/share";
import { ArchiveForm } from "@/components/crm/archive-forms";
import { ArchivedBanner } from "@/components/crm/archived-banner";
import { ShareMenu } from "@/components/crm/share-menu";
import { isoDay, isoDayPlus } from "@/lib/crm/dates";
import { TIER_LABELS, untouchedWords } from "@/lib/crm/targets";
import {
  FIRM_TYPES,
  LIFECYCLES,
  LIFECYCLE_LABELS,
  TEAM_SIZE_BANDS,
  sourceLabel,
  sourceNamesFrom,
} from "@/lib/crm/vocabulary";
import { formatDate, formatMrr, formatMrrBy, sumMoneyByCurrency } from "@/lib/format";
import { requestNow } from "@/lib/request-time";
import { firstSearchValue } from "@/lib/search-params";

export const metadata = { title: "Company" };
export const dynamic = "force-dynamic";

const DEAL_COLUMNS = [
  { key: "deal", label: "Deal" },
  { key: "stage", label: "Stage" },
  { key: "value", label: "Monthly value", align: "end" as const },
  { key: "next", label: "Next step" },
];

const PEOPLE_COLUMNS = [
  { key: "person", label: "Person" },
  { key: "title", label: "Title" },
  { key: "email", label: "Email" },
  { key: "flags", label: "" },
];

const TABS = [
  { key: "overview", label: "Overview" },
  { key: "activity", label: "Activity" },
  { key: "deals", label: "Deals" },
  { key: "people", label: "People" },
  { key: "history", label: "History" },
  { key: "billing", label: "Billing" },
  { key: "privacy", label: "Privacy" },
  { key: "success", label: "Success" },
];

type CompanyPageProps = {
  params: Promise<{ companyId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/**
 * One firm, everything HQ knows: who works there, what we are selling them, which
 * product accounts are theirs, what was promised and what happened. Attributes edit
 * where they sit; the body is tabbed so the page never grows past a screen.
 */
export default async function CompanyPage({ params, searchParams }: CompanyPageProps) {
  const { companyId } = await params;
  const tab = currentTab(firstSearchValue((await searchParams).tab), TABS);
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
  // The required fields of the deals and people this page creates.
  let required: CustomField[] = [];
  try {
    required = (await readFields(context.token)).fields.filter(
      (field) => field.required && !field.archived,
    );
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
  const staff = [...(names ?? new Map()).values()].filter((entry) => entry.is_active);
  const assignees = staff.map((entry) => ({
    staff_id: entry.staff_id,
    display_name: entry.display_name,
  }));
  const ownerOptions = [
    { value: "", label: "Unowned" },
    ...staff.map((entry) => ({ value: entry.staff_id, label: entry.display_name })),
  ];
  const base = `/companies/${company.company_id}`;
  const roles = {
    decision_maker: people.filter((person) => person.role_category === "decision_maker").length,
    champion: people.filter((person) => person.role_category === "champion").length,
    user: people.filter((person) => person.role_category === "user").length,
  };
  const singleThreaded =
    people.length <= 1 && ["customer", "early_access", "prospect"].includes(company.lifecycle);
  // Every other live company, for the parent picker and the merge target.
  let otherCompanies: { company_id: string; name: string; domain: string }[] = [];
  try {
    otherCompanies = (await readCompanies(context.token)).companies
      .filter((row) => row.company_id !== company.company_id)
      .map((row) => ({ company_id: row.company_id, name: row.name, domain: row.domain }))
      .sort((a, b) => a.name.localeCompare(b.name));
  } catch (error) {
    if (!(error instanceof HqApiUnavailableError || error instanceof HqApiRequestError))
      throw error;
  }
  const inline = {
    action: updateCompanyAction,
    idName: "company_id",
    id: company.company_id,
    readOnly: !canWrite,
  };

  // The overview shows only what is still in play; the Deals tab shows the history too.
  const dealsTableFor = (rows: typeof deals, empty: string) => (
    <DataTable
      caption="Deals with this company"
      columns={DEAL_COLUMNS}
      scroll={false}
      isEmpty={rows.length === 0}
      empty={<p className="timeline-empty">{empty}</p>}
    >
      {rows.map((deal) => (
        <tr key={deal.deal_id} className={deal.status === "open" ? undefined : "row--muted"}>
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
  );
  const dealsTable = dealsTableFor(deals, "No deals with this company yet.");
  const openDealsTable = dealsTableFor(
    openDeals,
    deals.length === 0
      ? "No deals with this company yet."
      : "Nothing open; the history is under Deals.",
  );

  const peopleTable = (
    <DataTable
      caption="People at this company"
      columns={PEOPLE_COLUMNS}
      scroll={false}
      minWidth={520}
      isEmpty={people.length === 0}
      empty={<p className="timeline-empty">Nobody from this firm is on file yet.</p>}
    >
      {people.map((person) => (
        <tr key={person.person_id}>
          <td>
            <Link className="table-title" href={`/people/${person.person_id}`}>
              {person.full_name || person.email}
            </Link>
          </td>
          <td>{person.title || <span className="table-sub">No title</span>}</td>
          <td className="mono">{person.email}</td>
          <td>
            {person.do_not_contact && (
              <StatusPill value="blocked" label="Do not contact" tone="danger" />
            )}
          </td>
        </tr>
      ))}
    </DataTable>
  );

  const activity = (
    <RecordSection id="company-activity" title="Activity">
      {canWrite && (
        <LogActivityForm
          action={logActivityAction}
          links={{ company_id: company.company_id }}
          returnPath={base}
        />
      )}
      <ActivityTimeline activities={activities} now={now} stageLabels={stageNames} />
    </RecordSection>
  );

  return (
    <>
      <RecordHeader
        crumbs={[{ href: "/companies", label: "Companies" }]}
        title={company.name}
        favourite={{ href: base, label: company.name, kind: "Company" }}
        status={
          <>
            <LifecyclePill lifecycle={company.lifecycle} />
            {company.domain && <span className="mono quiet">{company.domain}</span>}
            {company.customer_since && (
              <span className="quiet">Customer since {formatDate(company.customer_since)}</span>
            )}
            {singleThreaded && (
              <StatusPill
                value="single"
                label={people.length === 0 ? "Nobody on file" : "Single-threaded"}
                tone="attention"
              />
            )}
          </>
        }
        readouts={[
          { label: "MRR", value: formatMrrBy(detail.mrr) },
          { label: "Pipeline", value: formatMrrBy(pipelineMrr) },
          { label: "People", value: people.length },
          { label: "Accounts", value: accounts.length },
        ]}
        actions={
          <>
            <RecordFollow
              token={context.token}
              subjectType="company"
              subjectId={company.company_id}
              label={company.name}
              path={`/companies/${company.company_id}`}
            />
            {canWrite && people.some((person) => person.email && !person.do_not_contact) && (
              <Link
                className="btn btn--small"
                href={`/mail/campaigns/new?companies=${company.company_id}`}
              >
                Email everyone here
              </Link>
            )}
            {canDeal && openStages.length > 0 && (
              <Popover align="start" label="Open a deal" variant="primary" width="wide">
                <DealCreateForm
                  action={createDealAction}
                  companyId={company.company_id}
                  stages={openStages}
                  people={people.map((person) => ({
                    person_id: person.person_id,
                    label: person.full_name || person.email,
                  }))}
                  defaultDue={isoDayPlus(now, 3)}
                  plans={settings?.plans ?? []}
                  extra={
                    <CustomFieldInputs
                      idPrefix="new-deal"
                      fields={required.filter((field) => field.record_type === "deal")}
                    />
                  }
                />
              </Popover>
            )}
            {canWrite && (
              <Popover align="start" label="Add person">
                <PersonCreateForm
                  action={createPersonAction}
                  companies={[]}
                  companyId={company.company_id}
                  extra={
                    <CustomFieldInputs
                      idPrefix="new-person"
                      fields={required.filter((field) => field.record_type === "person")}
                    />
                  }
                />
              </Popover>
            )}
            {canWrite && (
              <Popover align="start" label="Merge" width="wide">
                <MergeRecordForm
                  action={mergeCompanyAction}
                  idField="company_id"
                  recordId={company.company_id}
                  noun="company"
                  candidates={otherCompanies.slice(0, 40).map((row) => ({
                    id: row.company_id,
                    label: `${row.name}${row.domain ? ` · ${row.domain}` : ""}`,
                  }))}
                />
              </Popover>
            )}
            <ShareMenu
              subjectType="company"
              subjectId={company.company_id}
              path={base}
              colleagues={colleaguesOf(names, context.me.staff.staff_id)}
              action={shareRecordAction}
            />
            {canWrite && !company.archived && (
              <ArchiveForm
                action={archiveRecordAction}
                kind="companies"
                recordId={company.company_id}
                noun="company"
              />
            )}
          </>
        }
      />
      {company.archived && (
        <ArchivedBanner
          kind="companies"
          recordId={company.company_id}
          archivedAt={company.archived_at}
          canRestore={canWrite}
          action={restoreRecordAction}
        />
      )}
      <RecordTabs
        base={base}
        tabs={[
          TABS[0]!,
          { ...TABS[1]!, count: activities.length },
          { ...TABS[2]!, count: deals.length },
          { ...TABS[3]!, count: people.length },
          TABS[4]!,
          ...(hasCapability(context, "revenue:read") ? [TABS[5]!] : []),
          ...(hasCapability(context, "privacy:read") ? [TABS[6]!] : []),
          TABS[7]!,
        ]}
        current={tab}
        label="Company sections"
      />
      <RecordGrid
        side={
          <>
            {context.me.ai?.features.includes("brief") && (
              <RecordSection id="company-brief" title="Before you call">
                <AiBrief
                  subjectType="company"
                  subjectId={company.company_id}
                  action={briefAction}
                  feedback={aiFeedbackAction}
                />
              </RecordSection>
            )}
            {canWrite && (
              <RecordSection id="company-templates" title="Tasks from a template">
                <RecordTemplates
                  token={context.token}
                  appliesTo="company"
                  subjectId={company.company_id}
                  returnPath={`/companies/${company.company_id}`}
                />
              </RecordSection>
            )}
            <Properties title="Details">
              <InlineField {...inline} name="name" label="Name" value={company.name} />
              <InlineField
                {...inline}
                name="lifecycle"
                label="Lifecycle"
                type="select"
                value={company.lifecycle}
                options={LIFECYCLES.map((key) => ({
                  value: key,
                  label: LIFECYCLE_LABELS[key] ?? key,
                }))}
              />
              <InlineField
                {...inline}
                name="domain"
                label="Web domain"
                value={company.domain}
                placeholder="fundco.com"
              />
              <InlineField
                {...inline}
                name="firm_type"
                label="Type"
                type="select"
                value={company.firm_type}
                options={[
                  { value: "", label: "Not known yet" },
                  ...FIRM_TYPES.map((type) => ({ value: type, label: type })),
                ]}
              />
              <InlineField
                {...inline}
                name="team_size_band"
                label="Team size"
                type="select"
                value={company.team_size_band}
                options={[
                  { value: "", label: "Not known yet" },
                  ...TEAM_SIZE_BANDS.map((band) => ({
                    value: band,
                    label: band === "1" ? "Just one person" : `${band} people`,
                  })),
                ]}
              />
              <InlineField {...inline} name="country" label="Country" value={company.country} />
              <InlineField
                {...inline}
                name="owner_staff_id"
                label="Owner"
                type="select"
                value={company.owner_staff_id}
                options={ownerOptions}
                display={
                  company.owner_staff_id ? nameFor(names, company.owner_staff_id) : "Unowned"
                }
                readOnly={!canWrite || names === null}
              />
              <Property label="Source">{sourceLabel(company.source_key, sourceNames)}</Property>
              <InlineField
                {...inline}
                name="parent_id"
                label="Part of"
                type="select"
                value={company.parent_id}
                options={[
                  { value: "", label: "No parent company" },
                  ...otherCompanies.map((row) => ({ value: row.company_id, label: row.name })),
                ]}
                display={
                  detail.parent ? (
                    <Link href={`/companies/${detail.parent.company_id}`}>
                      {detail.parent.name}
                    </Link>
                  ) : (
                    "—"
                  )
                }
              />
              <Property label="Added">
                <Timestamp value={company.created_at} mode="date" />
              </Property>
              {detail.imported && (
                <Property label="Came in with">
                  <Link className="text-link" href="/companies/import">
                    {detail.imported.label || "A file"}
                  </Link>
                  {detail.imported.by_name ? `, brought in by ${detail.imported.by_name}` : ""}
                </Property>
              )}
              <InlineField
                {...inline}
                name="notes"
                label="Notes"
                type="textarea"
                value={company.notes}
                placeholder="What the next person to open this should know"
              />
            </Properties>
            <CustomFieldsSection
              recordType="company"
              recordId={company.company_id}
              fields={detail.custom_fields}
              canWrite={canWrite}
            />
            <RecordAutomations
              token={context.token}
              recordType="company"
              recordId={company.company_id}
              returnPath={`/companies/${company.company_id}`}
            />
            {detail.children.length > 0 && (
              <RecordSection id="company-group" title="Group">
                <ul className="side-list">
                  {detail.children.map((child) => (
                    <li key={child.company_id} className="renewal">
                      <Link href={`/companies/${child.company_id}`}>{child.name}</Link>
                      <span className="side-quiet">
                        {child.mrr
                          ? formatMrrBy(child.mrr)
                          : (LIFECYCLE_LABELS[child.lifecycle] ?? child.lifecycle)}
                      </span>
                    </li>
                  ))}
                </ul>
                {detail.group_mrr && (
                  <p className="side-quiet">
                    Group MRR, this company and its children: {formatMrrBy(detail.group_mrr)}.
                  </p>
                )}
              </RecordSection>
            )}
            <Properties title="Stakeholders">
              <Property label="Decide">{roles.decision_maker}</Property>
              <Property label="Champion us">{roles.champion}</Property>
              <Property label="Use it">{roles.user}</Property>
              <Property label="Coverage">
                {people.length === 0
                  ? "Nobody on file"
                  : singleThreaded
                    ? "One contact; a second keeps the relationship if they move on"
                    : roles.decision_maker === 0
                      ? "No decision-maker known"
                      : "More than one thread"}
              </Property>
            </Properties>
            <Properties title="Product accounts">
              {accounts.length === 0 ? (
                <Property label="Linked">None yet</Property>
              ) : (
                accounts.map((account) => (
                  <Property key={account.account_user_id} label={account.plan || "No plan"} mono>
                    {account.email || "Account details unavailable"}
                    {account.profile_available && (
                      <span className="quiet">
                        {" "}
                        · signed in{" "}
                        <Timestamp
                          value={account.last_login_at}
                          now={now}
                          mode="relative"
                          fallback="never"
                        />
                      </span>
                    )}
                  </Property>
                ))
              )}
            </Properties>
            {hasCapability(context, "audit:read") && (
              <ViewedBy
                token={context.token}
                entityType="company"
                record={company.company_id}
                now={now}
              />
            )}
            <RecordSection id="company-tasks" title="Open tasks">
              <TaskList
                tasks={openTasks}
                today={today}
                setStatus={canWrite ? setTaskStatusAction : undefined}
                returnPath={base}
                names={names}
                emptyLabel="Nothing promised here."
              />
              {canWrite && (
                <TaskQuickAdd
                  action={createTaskAction}
                  links={{ company_id: company.company_id }}
                  returnPath={base}
                  assignees={assignees}
                  selfId={context.me.staff.staff_id}
                />
              )}
            </RecordSection>
            {settings === null && (
              <Callout tone="attention" compact>
                Pipeline names could not be read; stages show their keys.
              </Callout>
            )}
          </>
        }
      >
        {tab === "overview" && (
          <>
            {(detail.target || canWrite) && (
              <RecordSection id="company-target" title="Target account">
                {detail.target ? (
                  <div className="target-plan">
                    <p className="target-plan__head">
                      <strong>
                        {TIER_LABELS[detail.target.tier] ?? `Tier ${detail.target.tier}`}
                      </strong>
                      <span className={detail.target.untouched ? "due due--overdue" : "quiet"}>
                        {untouchedWords(detail.target.days_untouched)}
                      </span>
                    </p>
                    {detail.target.why && <p className="prose-block">{detail.target.why}</p>}
                    <p>
                      {detail.target.next_step ? (
                        <>
                          Next: {detail.target.next_step}
                          {detail.target.next_step_due && (
                            <span
                              className={
                                detail.target.next_step_overdue ? "due due--overdue" : "table-sub"
                              }
                            >
                              {detail.target.next_step_overdue ? "Was due " : "By "}
                              {formatDate(detail.target.next_step_due)}
                            </span>
                          )}
                        </>
                      ) : (
                        <span className="quiet">No next step yet.</span>
                      )}
                    </p>
                    {detail.target.reach.length > 0 ? (
                      <ul className="target-plan__reach">
                        {detail.target.reach.map((person) => (
                          <li key={person.person_id}>
                            <Link href={`/people/${person.person_id}`}>{person.full_name}</Link>
                            <span className="table-sub">
                              {[person.title, person.role_category.replace(/_/g, " ")]
                                .filter(Boolean)
                                .join(" · ") || "No role on file"}
                              {" · "}
                              {person.last_touched_at ? (
                                <>
                                  touched{" "}
                                  <Timestamp
                                    value={person.last_touched_at}
                                    now={now}
                                    mode="relative"
                                  />
                                </>
                              ) : (
                                "not touched yet"
                              )}
                            </span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="quiet">Nobody chosen to reach yet.</p>
                    )}
                    {canWrite && (
                      <div className="target-plan__actions">
                        <Popover align="start" label="Change the plan" width="wide">
                          <TargetPlanForm
                            action={setTargetAction}
                            companyId={company.company_id}
                            people={people.map((person) => ({
                              person_id: person.person_id,
                              full_name: person.full_name || person.email,
                              title: person.title,
                              role_category: person.role_category,
                            }))}
                            initial={{
                              tier: detail.target.tier,
                              why: detail.target.why,
                              next_step: detail.target.next_step,
                              next_step_due: detail.target.next_step_due ?? "",
                              reach: detail.target.reach.map((person) => person.person_id),
                            }}
                            submitLabel="Save the plan"
                          />
                        </Popover>
                        <RowAction
                          action={removeTargetAction}
                          fields={{ company_id: company.company_id }}
                          buttons={[
                            {
                              label: "No longer a target",
                              pendingLabel: "Removing…",
                              className: "btn btn--small btn--ghost",
                            },
                          ]}
                        />
                      </div>
                    )}
                  </div>
                ) : (
                  <>
                    <p className="page-note">
                      A target account gets a tier, a line on why it matters, who there to reach and
                      a next step — and its owner hears on Monday whenever nobody has touched it for
                      two weeks.
                    </p>
                    <Popover align="start" label="Make it a target account" width="wide">
                      <TargetPlanForm
                        action={setTargetAction}
                        companyId={company.company_id}
                        people={people.map((person) => ({
                          person_id: person.person_id,
                          full_name: person.full_name || person.email,
                          title: person.title,
                          role_category: person.role_category,
                        }))}
                        initial={{ tier: 1, why: "", next_step: "", next_step_due: "", reach: [] }}
                        submitLabel="Make it a target"
                      />
                    </Popover>
                  </>
                )}
              </RecordSection>
            )}
            {detail.signals.length > 0 && (
              <RecordSection id="company-signals" title="Signs of interest">
                <SignalList
                  signals={detail.signals}
                  now={now}
                  action={decideSignalAction}
                  canWrite={canWrite}
                  returnPath={`/companies/${company.company_id}`}
                  showSubject={false}
                />
              </RecordSection>
            )}
            <RecordSection id="company-deals" title="Open deals">
              {openDealsTable}
            </RecordSection>
            {activity}
            <RecordSection id="company-comments" title="Threads">
              <RecordComments
                token={context.token}
                subjectType="company"
                subjectId={company.company_id}
                returnPath={`/companies/${company.company_id}`}
                canWrite={context.me.role !== "intern_readonly"}
              />
            </RecordSection>
          </>
        )}
        {tab === "activity" && activity}
        {tab === "deals" && (
          <RecordSection id="company-deals-all" title="Every deal">
            {dealsTable}
          </RecordSection>
        )}
        {tab === "people" && (
          <RecordSection id="company-people" title="People">
            {peopleTable}
          </RecordSection>
        )}
        {tab === "billing" && (
          <RecordSection id="company-billing" title="Billing">
            {hasCapability(context, "revenue:read") ? (
              <CompanyBilling
                token={context.token}
                companyId={company.company_id}
                canWrite={hasCapability(context, "revenue:write")}
              />
            ) : (
              <Callout tone="neutral">Billing is visible to Sales, Admins and Owners.</Callout>
            )}
          </RecordSection>
        )}
        {tab === "success" && (
          <>
            <RecordSection id="company-success" title="Customer success">
              <CompanySuccess token={context.token} companyId={company.company_id} />
            </RecordSection>
            <RecordSection id="company-reviews" title="Business reviews">
              <CompanyReviews token={context.token} companyId={company.company_id} />
            </RecordSection>
            <RecordSection id="company-references" title="References">
              <CompanyReferences
                token={context.token}
                companyId={company.company_id}
                people={people}
                canWrite={canWrite}
                today={today}
              />
            </RecordSection>
          </>
        )}
        {tab === "privacy" && (
          <RecordSection id="company-privacy" title="Privacy">
            {hasCapability(context, "privacy:read") ? (
              <CompanyPrivacy
                token={context.token}
                companyId={company.company_id}
                canWrite={hasCapability(context, "privacy:write")}
              />
            ) : (
              <Callout tone="neutral">
                The privacy desk is run by Support, Admins and Owners.
              </Callout>
            )}
          </RecordSection>
        )}
        {tab === "history" && (
          <RecordSection id="company-history" title="History">
            <RecordHistory
              token={context.token}
              entityType="company"
              entityId={company.company_id}
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
