import Link from "next/link";

import { DealFlags, DueChip, FirstReplyClock } from "@/components/crm/pills";
import { LiveRefresh } from "@/components/shell/live-refresh";
import { PageHeader } from "@/components/shell/page-header";
import { SlaChip } from "@/components/support/sla-chip";
import { Callout } from "@/components/ui/callout";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { LocalTime } from "@/components/ui/local-time";
import { Stat, StatGrid } from "@/components/ui/stat";
import { requireStaff } from "@/lib/access/core";
import { HqApiRequestError, HqApiUnavailableError } from "@/lib/api/core";
import { readHome, type HomeAggregate } from "@/lib/api/home";
import { isoDay } from "@/lib/crm/dates";
import { formatMrr, formatMrrBy } from "@/lib/format";
import { requestNow } from "@/lib/request-time";

export const metadata = { title: "Today" };
export const dynamic = "force-dynamic";

/**
 * The attention surface: one read, sections by role. A section the role cannot see is
 * absent, not zero, and a failed read says so rather than showing a calm, empty day.
 */
export default async function HomePage() {
  const context = await requireStaff("/home");
  const now = requestNow();
  const today = isoDay(now);

  let home: HomeAggregate | null = null;
  try {
    home = await readHome(context.token);
  } catch (error) {
    if (!(error instanceof HqApiUnavailableError || error instanceof HqApiRequestError))
      throw error;
  }

  return (
    <>
      <PageHeader
        eyebrow="Command"
        title="Today"
        description="What needs a person, most urgent first."
      />
      <LiveRefresh intervalSeconds={60} label="Today" />
      {home === null ? (
        <Callout tone="danger" role="alert" title="Today could not be read">
          This is a read failure, not a quiet day. It retries on the next refresh.
        </Callout>
      ) : (
        <>
          <StatGrid columns={4} label="At a glance">
            {home.deals && (
              <Stat
                label="Open pipeline"
                value={formatMrrBy(home.deals.open_mrr)}
                text
                hint={
                  home.deals.weighted_mrr === null
                    ? `${home.deals.open_count} deals`
                    : `${formatMrrBy(home.deals.weighted_mrr)} weighted · ${home.deals.open_count} deals`
                }
              />
            )}
            {home.leads && (
              <Stat
                label="First replies owed"
                value={home.leads.awaiting_first_reply}
                tone={home.leads.first_reply_overdue > 0 ? "danger" : "default"}
                hint={`${home.leads.first_reply_overdue} past the target`}
              />
            )}
            {home.tasks && (
              <Stat
                label="Your tasks due"
                value={home.tasks.overdue + home.tasks.due_today}
                tone={home.tasks.overdue > 0 ? "danger" : "default"}
                hint={`${home.tasks.overdue} overdue · ${home.tasks.due_today} today`}
              />
            )}
            {home.desk && (
              <Stat
                label="Desk"
                value={home.desk.open}
                tone={home.desk.breached > 0 ? "danger" : "default"}
                hint={`${home.desk.breached} breaching · ${home.desk.unassigned} unassigned`}
              />
            )}
          </StatGrid>

          <div className="home-grid">
            {home.leads && (
              <Card
                title="First replies owed"
                important={home.leads.first_reply_overdue > 0}
                actions={
                  <Link className="btn btn--small" href="/leads">
                    All leads
                  </Link>
                }
              >
                {home.leads.leads.length === 0 ? (
                  <EmptyState
                    title="Nobody is waiting"
                    description="No new or attempting lead is waiting for a first reply."
                    compact
                  />
                ) : (
                  <ul className="attention-list">
                    {home.leads.leads.map((lead) => (
                      <li key={lead.lead_id}>
                        <span className="attention-list__main">
                          <Link href={`/leads/${lead.lead_id}`}>
                            {lead.full_name || lead.email}
                          </Link>
                          <span className="attention-list__sub">
                            {lead.company_name || lead.email}
                          </span>
                        </span>
                        <FirstReplyClock
                          firstRepliedAt={lead.first_replied_at}
                          waitingMinutes={lead.waiting_minutes}
                          overdue={lead.first_reply_overdue}
                          targetMinutes={home.leads?.first_reply_target_minutes ?? 60}
                        />
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            )}

            {home.deals && (
              <Card
                title="Deals needing attention"
                important={home.deals.deals.length > 0}
                actions={
                  <Link className="btn btn--small" href="/deals">
                    Pipeline
                  </Link>
                }
              >
                {home.deals.deals.length === 0 ? (
                  <EmptyState
                    title="Every deal is moving"
                    description="Each open deal has a dated next step and recent work."
                    compact
                  />
                ) : (
                  <ul className="attention-list attention-list--stacked">
                    {home.deals.deals.map((deal) => (
                      <li key={deal.deal_id}>
                        <span className="attention-list__main">
                          <Link href={`/deals/${deal.deal_id}`}>
                            {deal.company_name || deal.name}
                          </Link>
                          <span className="attention-list__sub">
                            {deal.stage_label}
                            {deal.mrr_amount !== null &&
                              ` · ${formatMrr(deal.mrr_amount, deal.currency)}`}
                          </span>
                        </span>
                        <DealFlags
                          flags={deal.flags}
                          idleDays={deal.idle_days}
                          daysInStage={deal.days_in_stage}
                        />
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            )}

            {home.tasks && (
              <Card
                title="Your tasks"
                important={home.tasks.overdue > 0}
                actions={
                  <Link className="btn btn--small" href="/tasks">
                    All tasks
                  </Link>
                }
              >
                {home.tasks.tasks.length === 0 ? (
                  <EmptyState
                    title="Nothing due"
                    description={
                      home.tasks.open > 0
                        ? `${home.tasks.open} open, none due today or late.`
                        : "No open tasks."
                    }
                    compact
                  />
                ) : (
                  <ul className="attention-list">
                    {home.tasks.tasks.map((task) => (
                      <li key={task.task_id}>
                        <span className="attention-list__main">
                          <Link href="/tasks">{task.title}</Link>
                        </span>
                        <DueChip due={task.due_on} today={today} />
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            )}

            {home.desk && (
              <Card
                title="Tickets near breach"
                important={home.desk.breached > 0}
                actions={
                  <Link className="btn btn--small" href="/support">
                    The desk
                  </Link>
                }
              >
                {home.desk.tickets.length === 0 ? (
                  <EmptyState
                    title="No reply timer is close"
                    description={`${home.desk.open} waiting on the desk, ${home.desk.pending} waiting on customers.`}
                    compact
                  />
                ) : (
                  <ul className="attention-list">
                    {home.desk.tickets.map((ticket) => (
                      <li key={ticket.id}>
                        <span className="attention-list__main">
                          <Link href={`/support/${ticket.id}`}>{ticket.subject}</Link>
                          <span className="attention-list__sub">{ticket.contact_email}</span>
                        </span>
                        <SlaChip sla={ticket.sla} />
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            )}

            {home.meetings && (
              <Card
                title="Meetings today (UTC)"
                important={home.meetings.needs_outcome_count > 0}
                actions={
                  <Link className="btn btn--small" href="/meetings">
                    All meetings
                  </Link>
                }
              >
                {home.meetings.today.length === 0 && home.meetings.needs_outcome.length === 0 ? (
                  <EmptyState
                    title="Nothing booked today"
                    description="Every recent meeting has its outcome recorded."
                    compact
                  />
                ) : (
                  <ul className="attention-list">
                    {home.meetings.today.map((meeting) => (
                      <li key={meeting.meeting_id}>
                        <span className="attention-list__main">
                          <Link href={`/meetings/${meeting.meeting_id}`}>{meeting.title}</Link>
                          <span className="attention-list__sub">
                            <LocalTime value={meeting.starts_at} />
                          </span>
                        </span>
                        {meeting.needs_outcome && (
                          <span className="clock clock--running">Outcome owed</span>
                        )}
                      </li>
                    ))}
                    {home.meetings.needs_outcome
                      .filter(
                        (meeting) =>
                          !home.meetings?.today.some(
                            (todays) => todays.meeting_id === meeting.meeting_id,
                          ),
                      )
                      .map((meeting) => (
                        <li key={meeting.meeting_id}>
                          <span className="attention-list__main">
                            <Link href={`/meetings/${meeting.meeting_id}`}>{meeting.title}</Link>
                            <span className="attention-list__sub">
                              <LocalTime value={meeting.starts_at} />
                            </span>
                          </span>
                          <span className="clock clock--running">Outcome owed</span>
                        </li>
                      ))}
                  </ul>
                )}
              </Card>
            )}
          </div>
        </>
      )}
    </>
  );
}
