import { RecordAutomations } from "@/components/platform/record-automations";
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
  closeDealAction,
  moveDealStageAction,
  updateDealAction,
  updateNextStepAction,
} from "@/app/(portal)/deals/actions";
import { ActivityTimeline } from "@/components/crm/activity-timeline";
import { RecordHistory } from "@/components/crm/record-history";
import { DealCloseForm, DealStageForm, NextStepForm } from "@/components/crm/deal-forms";
import { LogActivityForm } from "@/components/crm/log-activity-form";
import { DealFlags, DealStatusPill, DueChip } from "@/components/crm/pills";
import { StageRail } from "@/components/crm/stage-rail";
import { DealCompetition } from "@/components/deals/deal-competition";
import { TaskList } from "@/components/crm/task-list";
import { TaskQuickAdd } from "@/components/crm/task-quick-add";
import { Callout } from "@/components/ui/callout";
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
import { Timestamp } from "@/components/ui/timestamp";
import { hasCapability, requireStaff } from "@/lib/access/core";
import { RecordFollow } from "@/components/inbox/record-follow";
import { ViewedBy } from "@/components/security/viewed-by";
import { HqApiRequestError, HqApiUnavailableError } from "@/lib/api/core";
import { readDeal, type DealDetail } from "@/lib/api/deals";
import { readContracts } from "@/lib/api/revenue";
import { readCrmSettings, type Plan } from "@/lib/api/crm";
import { directoryOrNull, nameFor } from "@/lib/api/staff";
import { isoDay, isoDayPlus } from "@/lib/crm/dates";
import { LOSS_REASON_LABELS, sourceLabel, stageLabel } from "@/lib/crm/vocabulary";
import { formatDate as formatDay, formatMoney, formatMrr } from "@/lib/format";
import { requestNow } from "@/lib/request-time";
import { firstSearchValue } from "@/lib/search-params";

export const metadata = { title: "Deal" };

/** A forecast category's label, from the list the service sends. */
function categoryLabel(
  value: string,
  categories: ReadonlyArray<{ value: string; label: string }>,
): string {
  return categories.find((item) => item.value === value)?.label ?? value.replace("_", " ");
}
export const dynamic = "force-dynamic";

const TABS = [
  { key: "activity", label: "Activity" },
  { key: "history", label: "Stage history" },
  { key: "changes", label: "Changes" },
  { key: "tasks", label: "Tasks" },
  { key: "competition", label: "Competition" },
];

type DealPageProps = {
  params: Promise<{ dealId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function DealPage({ params, searchParams }: DealPageProps) {
  const { dealId } = await params;
  const tab = currentTab(firstSearchValue((await searchParams).tab), TABS);
  const context = await requireStaff(`/deals/${dealId}`);
  const now = requestNow();
  const today = isoDay(now);

  let detail: DealDetail;
  try {
    detail = await readDeal(context.token, dealId);
  } catch (error) {
    if (error instanceof HqApiRequestError && error.status === 404) notFound();
    throw error;
  }
  const names = await directoryOrNull(context.token);
  let plans: Plan[] = [];
  try {
    plans = (await readCrmSettings(context.token)).plans;
  } catch (error) {
    if (!(error instanceof HqApiUnavailableError || error instanceof HqApiRequestError))
      throw error;
  }
  // A won deal points at its contract; offer to record one until it exists.
  let contractId: string | null = null;
  let contractChecked = false;
  if (detail.deal.status === "won" && hasCapability(context, "revenue:write")) {
    try {
      const existing = (
        await readContracts(context.token, { company_id: detail.deal.company_id })
      ).contracts.find((contract) => contract.deal_id === detail.deal.deal_id);
      contractId = existing?.contract_id ?? null;
      contractChecked = true;
    } catch (error) {
      if (!(error instanceof HqApiUnavailableError || error instanceof HqApiRequestError))
        throw error;
    }
  }

  const {
    deal,
    company,
    primary_person: person,
    stage_history: history,
    activities,
    open_tasks: openTasks,
    stages,
  } = detail;
  const open = deal.status === "open";
  const canDeal = hasCapability(context, "deals:write");
  const canWrite = hasCapability(context, "crm:write");
  const stageNames = new Map(stages.map((stage) => [stage.key, stage.label]));
  const openStages = stages
    .filter((stage) => !stage.outcome)
    .map((stage) => ({ key: stage.key, label: stage.label }));
  const base = `/deals/${deal.deal_id}`;
  const stepState =
    !deal.next_step || !deal.next_step_due
      ? "missing"
      : deal.next_step_due < today
        ? "overdue"
        : "live";
  const staff = [...(names ?? new Map()).values()].filter((entry) => entry.is_active);
  const assignees = staff.map((entry) => ({
    staff_id: entry.staff_id,
    display_name: entry.display_name,
  }));
  const inline = {
    action: updateDealAction,
    idName: "deal_id",
    id: deal.deal_id,
    readOnly: !canDeal,
  };

  const tasks = (
    <RecordSection id="deal-tasks" title="Open tasks">
      <TaskList
        tasks={openTasks}
        today={today}
        setStatus={canWrite ? setTaskStatusAction : undefined}
        returnPath={base}
        names={names}
        emptyLabel="Nothing promised on this deal."
      />
      {canWrite && (
        <TaskQuickAdd
          action={createTaskAction}
          links={{ deal_id: deal.deal_id }}
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
          { href: "/deals", label: "Deals" },
          ...(company ? [{ href: `/companies/${company.company_id}`, label: company.name }] : []),
        ]}
        title={deal.name}
        favourite={{ href: base, label: deal.name, kind: "Deal" }}
        status={
          <>
            {open ? (
              <span className="pill pill--neutral">{deal.stage_label}</span>
            ) : (
              <DealStatusPill status={deal.status} />
            )}
            <DealFlags
              flags={deal.flags}
              idleDays={deal.idle_days}
              daysInStage={deal.days_in_stage}
            />
          </>
        }
        readouts={[
          {
            label: "Monthly",
            value: deal.mrr_amount === null ? "—" : formatMrr(deal.mrr_amount, deal.currency),
          },
          {
            label: "Weighted",
            value:
              deal.weighted_mrr === null
                ? "—"
                : `${formatMoney(deal.weighted_mrr, deal.currency)} · ${deal.win_probability}%`,
          },
          { label: "Seats", value: deal.seats },
          ...(open
            ? [{ label: "In stage", value: `${deal.days_in_stage}d · quiet ${deal.idle_days}d` }]
            : []),
        ]}
        actions={
          <>
            <RecordFollow
              token={context.token}
              subjectType="deal"
              subjectId={deal.deal_id}
              label={deal.name}
              path={`/deals/${deal.deal_id}`}
            />
            {open && canDeal && (
              <>
                <Popover align="start" label="Move stage" variant="primary" width="wide">
                  <DealStageForm
                    action={moveDealStageAction}
                    deal={deal}
                    stages={openStages}
                    defaultDue={isoDayPlus(now, 3)}
                  />
                </Popover>
                <Popover align="start" label="Close" width="wide">
                  <p className="muted" style={{ marginBottom: 10 }}>
                    Final. A loss records its reason.
                  </p>
                  <DealCloseForm action={closeDealAction} deal={deal} />
                </Popover>
              </>
            )}
          </>
        }
      />
      <StageRail stages={stages} currentKey={deal.stage_key} status={deal.status} />

      {open && (
        <section className={`next-step next-step--${stepState}`} aria-labelledby="deal-next-step">
          <div className="next-step__body">
            <h2 className="next-step__label" id="deal-next-step">
              Next step
            </h2>
            <p className="next-step__text">
              {deal.next_step || "None set. Every open deal needs one."}
            </p>
            {deal.next_step && <DueChip due={deal.next_step_due} today={today} />}
            {deal.next_step_stale && (
              <p className="next-step__stale">
                Unchanged for over a week. Still right? Edit it to say so, or change it.
              </p>
            )}
          </div>
          {canDeal && <NextStepForm action={updateNextStepAction} deal={deal} />}
        </section>
      )}
      {deal.status === "won" && contractChecked && (
        <Callout tone="success" title="Won">
          {contractId ? (
            <>
              Its contract is recorded.{" "}
              <Link href={`/revenue/contracts/${contractId}`}>Open the contract</Link>.
            </>
          ) : (
            <>
              Record the contract so revenue counts it.{" "}
              <Link
                href={`/revenue/contracts?company_id=${deal.company_id}&deal_id=${deal.deal_id}&mrr_amount=${deal.mrr_amount ?? ""}&seats=${deal.seats}`}
              >
                Record the contract
              </Link>
              .
            </>
          )}
        </Callout>
      )}
      {!open && deal.status === "lost" && (
        <Callout
          tone="danger"
          title={`Lost: ${LOSS_REASON_LABELS[deal.loss_reason] ?? deal.loss_reason}`}
        >
          {[deal.loss_competitor && `To ${deal.loss_competitor}.`, deal.loss_detail]
            .filter(Boolean)
            .join(" ") || "No detail recorded."}
        </Callout>
      )}

      <RecordTabs
        base={base}
        tabs={[
          { ...TABS[0]!, count: activities.length },
          { ...TABS[1]!, count: history.length },
          TABS[2]!,
          { ...TABS[3]!, count: openTasks.length },
          { ...TABS[4]!, count: detail.competitors.length + detail.interviews.length },
        ]}
        current={tab}
        label="Deal sections"
      />
      <RecordGrid
        side={
          <>
            {context.me.ai?.features.includes("brief") && (
              <RecordSection id="deal-brief" title="Before you call">
                <AiBrief
                  subjectType="deal"
                  subjectId={deal.deal_id}
                  action={briefAction}
                  feedback={aiFeedbackAction}
                />
              </RecordSection>
            )}
            {canWrite && (
              <RecordSection id="deal-templates" title="Tasks from a template">
                <RecordTemplates
                  token={context.token}
                  appliesTo="deal"
                  subjectId={deal.deal_id}
                  returnPath={`/deals/${deal.deal_id}`}
                />
              </RecordSection>
            )}
            <Properties title="Deal">
              <InlineField {...inline} name="name" label="Name" value={deal.name} />
              <Property label="Company">
                {company ? (
                  <Link href={`/companies/${company.company_id}`}>{company.name}</Link>
                ) : (
                  "—"
                )}
              </Property>
              <Property label="Main contact">
                {person ? (
                  <Link href={`/people/${person.person_id}`}>
                    {person.full_name || person.email}
                  </Link>
                ) : (
                  "Nobody yet"
                )}
              </Property>
              <InlineField
                {...inline}
                name="owner_staff_id"
                label="Owner"
                type="select"
                value={deal.owner_staff_id}
                options={[
                  { value: "", label: "Unowned" },
                  ...staff.map((entry) => ({ value: entry.staff_id, label: entry.display_name })),
                ]}
                display={deal.owner_staff_id ? nameFor(names, deal.owner_staff_id) : "Unowned"}
                readOnly={!canDeal || names === null}
              />
              <InlineField
                {...inline}
                name="plan_key"
                label="Plan"
                type="select"
                value={deal.plan_key}
                options={[
                  { value: "", label: "No plan — typed value" },
                  ...plans.map((plan) => ({
                    value: plan.key,
                    label: `${plan.name} · ${formatMoney(plan.unit_amount, plan.currency)} a seat`,
                  })),
                ]}
                display={
                  deal.plan_key
                    ? (plans.find((plan) => plan.key === deal.plan_key)?.name ?? deal.plan_key)
                    : "No plan"
                }
                readOnly={!canDeal || plans.length === 0}
              />
              <InlineField
                {...inline}
                name="mrr_amount"
                label="Monthly value"
                type="number"
                value={deal.mrr_amount === null ? "" : String(deal.mrr_amount)}
                display={deal.mrr_amount === null ? "—" : formatMrr(deal.mrr_amount, deal.currency)}
                readOnly={!canDeal || deal.mrr_amount === null}
              />
              <InlineField
                {...inline}
                name="currency"
                label="Currency"
                value={deal.currency}
                placeholder="USD"
              />
              <InlineField
                {...inline}
                name="seats"
                label="Seats"
                type="number"
                value={String(deal.seats)}
              />
              <InlineField
                {...inline}
                name="expected_close_date"
                label="Expected close"
                type="date"
                value={deal.expected_close_date}
                display={
                  deal.expected_close_date ? (
                    <DueChip due={deal.expected_close_date} today={today} />
                  ) : (
                    "—"
                  )
                }
              />
              {open && (
                <InlineField
                  {...inline}
                  name="forecast_category"
                  label="Forecast"
                  type="select"
                  value={deal.forecast_override}
                  options={[{ value: "", label: "From the stage" }, ...detail.forecast_categories]}
                  display={
                    deal.forecast_override
                      ? `${categoryLabel(deal.forecast_override, detail.forecast_categories)} (set)`
                      : `${categoryLabel(deal.forecast_category, detail.forecast_categories)} (from the stage)`
                  }
                />
              )}
              {deal.push_count > 0 && (
                <Property label="Pushed">
                  {deal.push_count} {deal.push_count === 1 ? "time" : "times"}
                  {deal.first_close_date && (
                    <span className="quiet"> · first said {formatDay(deal.first_close_date)}</span>
                  )}
                </Property>
              )}
              <Property label="Source">{sourceLabel(deal.source_key)}</Property>
              <Property label="Opened">
                <Timestamp value={deal.created_at} mode="date" />
              </Property>
              <InlineField
                {...inline}
                name="notes"
                label="Notes"
                type="textarea"
                value={deal.notes}
                placeholder="What the next person to open this should know"
              />
            </Properties>
            <CustomFieldsSection
              recordType="deal"
              recordId={detail.deal.deal_id}
              fields={detail.custom_fields}
              canWrite={canDeal}
            />
            <RecordAutomations
              token={context.token}
              recordType="deal"
              recordId={detail.deal.deal_id}
              returnPath={`/deals/${detail.deal.deal_id}`}
            />
            {hasCapability(context, "audit:read") && (
              <ViewedBy token={context.token} entityType="deal" record={deal.deal_id} now={now} />
            )}
            {tab !== "tasks" && tasks}
          </>
        }
      >
        {tab === "activity" && (
          <RecordSection id="deal-comments" title="Threads">
            <RecordComments
              token={context.token}
              subjectType="deal"
              subjectId={deal.deal_id}
              returnPath={`/deals/${deal.deal_id}?tab=activity`}
              canWrite={context.me.role !== "intern_readonly"}
            />
          </RecordSection>
        )}
        {tab === "activity" && (
          <RecordSection id="deal-activity" title="Activity">
            {canWrite && (
              <LogActivityForm
                action={logActivityAction}
                links={{
                  deal_id: deal.deal_id,
                  ...(deal.company_id ? { company_id: deal.company_id } : {}),
                }}
                returnPath={base}
              />
            )}
            <ActivityTimeline activities={activities} now={now} stageLabels={stageNames} />
          </RecordSection>
        )}
        {tab === "history" && (
          <RecordSection id="deal-history" title="Stage history">
            <ol className="stage-history">
              {history.map((event, index) => (
                <li key={`${event.at}-${index}`}>
                  <span className="stage-history__to">
                    {stageLabel(event.to_stage_key, stageNames)}
                  </span>
                  <span className="side-quiet">
                    <Timestamp value={event.at} now={now} mode="relative" />
                    {event.staff_id && ` · ${nameFor(names, event.staff_id)}`}
                  </span>
                </li>
              ))}
            </ol>
          </RecordSection>
        )}
        {tab === "changes" && (
          <RecordSection id="deal-changes" title="Changes">
            <RecordHistory
              token={context.token}
              entityType="deal"
              entityId={deal.deal_id}
              names={names}
              canRead={hasCapability(context, "audit:read")}
              now={now}
            />
          </RecordSection>
        )}
        {tab === "tasks" && tasks}
        {tab === "competition" && <DealCompetition detail={detail} canDeal={canDeal} open={open} />}
      </RecordGrid>
    </>
  );
}
