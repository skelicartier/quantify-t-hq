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
import {
  DealCloseForm,
  DealEditForm,
  DealStageForm,
  NextStepForm,
} from "@/components/crm/deal-forms";
import { LogActivityForm } from "@/components/crm/log-activity-form";
import { DealFlags, DealStatusPill, DueChip } from "@/components/crm/pills";
import { StageRail } from "@/components/crm/stage-rail";
import { TaskList } from "@/components/crm/task-list";
import { TaskQuickAdd } from "@/components/crm/task-quick-add";
import { PageHeader } from "@/components/shell/page-header";
import { Callout } from "@/components/ui/callout";
import { Card } from "@/components/ui/card";
import { KeyValue, KeyValueRow } from "@/components/ui/key-value";
import { Popover } from "@/components/ui/popover";
import { Timestamp } from "@/components/ui/timestamp";
import { hasCapability, requireStaff } from "@/lib/access/core";
import { HqApiRequestError, HqApiUnavailableError } from "@/lib/api/core";
import { readDeal, type DealDetail } from "@/lib/api/deals";
import { readContracts } from "@/lib/api/revenue";
import { directoryOrEmpty } from "@/lib/api/staff";
import { isoDay, isoDayPlus } from "@/lib/crm/dates";
import { LOSS_REASON_LABELS, sourceLabel, stageLabel } from "@/lib/crm/vocabulary";
import { formatDate, formatMoney, formatMrr } from "@/lib/format";
import { requestNow } from "@/lib/request-time";

export const metadata = { title: "Deal" };
export const dynamic = "force-dynamic";

type DealPageProps = { params: Promise<{ dealId: string }> };

export default async function DealPage({ params }: DealPageProps) {
  const { dealId } = await params;
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
  const names = await directoryOrEmpty(context.token);
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
  const returnPath = `/deals/${deal.deal_id}`;
  const stepState =
    !deal.next_step || !deal.next_step_due
      ? "missing"
      : deal.next_step_due < today
        ? "overdue"
        : "live";
  const assignees = [...names.values()]
    .filter((entry) => entry.is_active)
    .map((entry) => ({ staff_id: entry.staff_id, display_name: entry.display_name }));

  return (
    <>
      <PageHeader
        eyebrow="Deal"
        title={deal.name}
        breadcrumbs={[
          { label: "Deals", href: "/deals" },
          ...(company ? [{ label: company.name, href: `/companies/${company.company_id}` }] : []),
        ]}
        description={
          <>
            {deal.mrr_amount !== null && `${formatMrr(deal.mrr_amount, deal.currency)} · `}
            {deal.seats} {deal.seats === 1 ? "seat" : "seats"}
            {open && (
              <>
                {" "}
                · {deal.win_probability}%
                {deal.weighted_mrr !== null &&
                  ` · ${formatMoney(deal.weighted_mrr, deal.currency)} weighted`}
              </>
            )}
          </>
        }
        meta={
          <>
            {open ? (
              <span className="meta-note">{deal.stage_label}</span>
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
        actions={
          canDeal ? (
            <Popover label="Edit deal" width="wide">
              <DealEditForm action={updateDealAction} deal={deal} />
            </Popover>
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

      <div className="record-layout">
        <div className="record-layout__main">
          <section className="record-section" aria-labelledby="deal-activity">
            <h2 className="record-section__title" id="deal-activity">
              Activity
            </h2>
            {canWrite && (
              <LogActivityForm
                action={logActivityAction}
                links={{
                  deal_id: deal.deal_id,
                  ...(deal.company_id ? { company_id: deal.company_id } : {}),
                }}
                returnPath={returnPath}
              />
            )}
            <ActivityTimeline activities={activities} now={now} stageLabels={stageNames} />
          </section>
          {deal.notes && (
            <Card title="Notes" titleAs="h2">
              <p className="prose-block">{deal.notes}</p>
            </Card>
          )}
        </div>
        <aside className="record-layout__side">
          {open && canDeal && (
            <Card title="Move stage" titleAs="h3">
              <DealStageForm
                action={moveDealStageAction}
                deal={deal}
                stages={openStages}
                defaultDue={isoDayPlus(now, 3)}
              />
            </Card>
          )}
          <Card title="Deal" titleAs="h3">
            <KeyValue>
              <KeyValueRow label="Company">
                {company ? (
                  <Link href={`/companies/${company.company_id}`}>{company.name}</Link>
                ) : (
                  "—"
                )}
              </KeyValueRow>
              <KeyValueRow label="Main contact">
                {person ? (
                  <Link href={`/people/${person.person_id}`}>
                    {person.full_name || person.email}
                  </Link>
                ) : (
                  "Nobody yet"
                )}
              </KeyValueRow>
              <KeyValueRow label="Owner">
                {deal.owner_staff_id
                  ? (names.get(deal.owner_staff_id)?.display_name ?? "—")
                  : "Unowned"}
              </KeyValueRow>
              <KeyValueRow label="Expected close">
                {deal.expected_close_date ? formatDate(deal.expected_close_date) : "—"}
              </KeyValueRow>
              <KeyValueRow label="Source">{sourceLabel(deal.source_key)}</KeyValueRow>
              {open && (
                <KeyValueRow label="In this stage">
                  {deal.days_in_stage}d · quiet {deal.idle_days}d
                </KeyValueRow>
              )}
              <KeyValueRow label="Opened">
                <Timestamp value={deal.created_at} mode="date" />
              </KeyValueRow>
            </KeyValue>
          </Card>
          <Card title="Stage history" titleAs="h3">
            <ol className="stage-history">
              {history.map((event, index) => (
                <li key={`${event.at}-${index}`}>
                  <span className="stage-history__to">
                    {stageLabel(event.to_stage_key, stageNames)}
                  </span>
                  <span className="side-quiet">
                    <Timestamp value={event.at} now={now} mode="relative" />
                    {event.staff_id && ` · ${names.get(event.staff_id)?.display_name ?? "—"}`}
                  </span>
                </li>
              ))}
            </ol>
          </Card>
          <Card title="Open tasks" titleAs="h3">
            <TaskList
              tasks={openTasks}
              today={today}
              setStatus={canWrite ? setTaskStatusAction : undefined}
              returnPath={returnPath}
              names={names}
              emptyLabel="Nothing promised on this deal."
            />
            {canWrite && (
              <TaskQuickAdd
                action={createTaskAction}
                links={{ deal_id: deal.deal_id }}
                returnPath={returnPath}
                assignees={assignees}
                selfId={context.me.staff.staff_id}
              />
            )}
          </Card>
          {open && canDeal && (
            <Card
              title="Close the deal"
              titleAs="h3"
              description="Final. A loss records its reason."
            >
              <DealCloseForm action={closeDealAction} deal={deal} />
            </Card>
          )}
        </aside>
      </div>
    </>
  );
}
