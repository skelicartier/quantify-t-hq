import Link from "next/link";
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
import { DealCloseForm, DealStageForm, NextStepForm } from "@/components/crm/deal-forms";
import { LogActivityForm } from "@/components/crm/log-activity-form";
import { DealFlags, DealStatusPill, DueChip } from "@/components/crm/pills";
import { StageRail } from "@/components/crm/stage-rail";
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
import { HqApiRequestError, HqApiUnavailableError } from "@/lib/api/core";
import { readDeal, type DealDetail } from "@/lib/api/deals";
import { readContracts } from "@/lib/api/revenue";
import { directoryOrNull, nameFor } from "@/lib/api/staff";
import { isoDay, isoDayPlus } from "@/lib/crm/dates";
import { LOSS_REASON_LABELS, sourceLabel, stageLabel } from "@/lib/crm/vocabulary";
import { formatMoney, formatMrr } from "@/lib/format";
import { requestNow } from "@/lib/request-time";
import { firstSearchValue } from "@/lib/search-params";

export const metadata = { title: "Deal" };
export const dynamic = "force-dynamic";

const TABS = [
  { key: "activity", label: "Activity" },
  { key: "history", label: "Stage history" },
  { key: "tasks", label: "Tasks" },
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
          open && canDeal ? (
            <>
              <Popover label="Move stage" variant="primary" width="wide">
                <DealStageForm
                  action={moveDealStageAction}
                  deal={deal}
                  stages={openStages}
                  defaultDue={isoDayPlus(now, 3)}
                />
              </Popover>
              <Popover label="Close" width="wide">
                <p className="muted" style={{ marginBottom: 10 }}>
                  Final. A loss records its reason.
                </p>
                <DealCloseForm action={closeDealAction} deal={deal} />
              </Popover>
            </>
          ) : undefined
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
          { ...TABS[2]!, count: openTasks.length },
        ]}
        current={tab}
        label="Deal sections"
      />
      <RecordGrid
        side={
          <>
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
            {tab !== "tasks" && tasks}
          </>
        }
      >
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
        {tab === "tasks" && tasks}
      </RecordGrid>
    </>
  );
}
