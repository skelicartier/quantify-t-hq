import Link from "next/link";

import { markMentionSeenAction } from "@/app/(portal)/_actions/mentions";
import { DealFlags, DueChip, FirstReplyClock } from "@/components/crm/pills";
import { RowAction } from "@/components/ui/row-action";
import { LiveRefresh } from "@/components/shell/live-refresh";
import { PageHeader } from "@/components/shell/page-header";
import { SlaChip } from "@/components/support/sla-chip";
import { Callout } from "@/components/ui/callout";
import { LocalTime } from "@/components/ui/local-time";
import { Stat, StatGrid } from "@/components/ui/stat";
import { Timestamp } from "@/components/ui/timestamp";
import { requireStaff } from "@/lib/access/core";
import { HqApiRequestError, HqApiUnavailableError } from "@/lib/api/core";
import { readHome, type HomeAggregate } from "@/lib/api/home";
import { isoDay } from "@/lib/crm/dates";
import { formatMrr, formatMrrBy } from "@/lib/format";
import { requestNow } from "@/lib/request-time";

const MENTION_PAGES: Record<string, string> = {
  company: "companies",
  person: "people",
  deal: "deals",
  lead: "leads",
  meeting: "meetings",
};

const RULE_TEXT: Record<string, string> = {
  failures_first: "after failed sign-ins",
  address_change: "second address in minutes",
};

/** The short form of a request for the side card: the key's name, or the grant itself. */
function approvalLine(approval: {
  kind: string;
  summary: string;
  payload: { name?: string | undefined };
}) {
  return approval.kind === "api_key" && approval.payload.name
    ? `Key: ${approval.payload.name}`
    : sentence(approval.summary);
}

function sentence(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export const metadata = { title: "Today" };
export const dynamic = "force-dynamic";

type OwedRow = {
  key: string;
  kind: "Lead" | "Ticket" | "Task" | "Meeting" | "Deal" | "Renewal" | "Mail";
  href: string;
  title: string;
  sub: string;
  status: React.ReactNode;
  /** Lower sorts first: breached before due before at-risk. */
  urgency: number;
};

/**
 * The briefing: everything owed, in one prioritised queue, beside the day's figures
 * and meetings. One read, sections by role; a section the role cannot see is absent,
 * not zero, and a failed read says so rather than showing a calm, empty day.
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

  const owed: OwedRow[] = [];
  if (home) {
    const target = home.leads?.first_reply_target_minutes ?? 60;
    for (const lead of home.leads?.leads ?? []) {
      owed.push({
        key: `lead:${lead.lead_id}`,
        kind: "Lead",
        href: `/leads/${lead.lead_id}`,
        title: lead.full_name || lead.email,
        sub: lead.company_name || lead.email,
        status: (
          <FirstReplyClock
            firstRepliedAt={lead.first_replied_at}
            waitingMinutes={lead.waiting_minutes}
            overdue={lead.first_reply_overdue}
            targetMinutes={target}
          />
        ),
        urgency: lead.first_reply_overdue ? 0 : 3,
      });
    }
    for (const ticket of home.desk?.tickets ?? []) {
      owed.push({
        key: `ticket:${ticket.id}`,
        kind: "Ticket",
        href: `/support/${ticket.id}`,
        title: ticket.subject,
        sub: ticket.contact_email,
        status: <SlaChip sla={ticket.sla} />,
        urgency: ticket.sla.status === "breached" ? 0 : 2,
      });
    }
    for (const task of home.tasks?.tasks ?? []) {
      const overdue = Boolean(task.due_on && task.due_on.slice(0, 10) < today);
      owed.push({
        key: `task:${task.task_id}`,
        kind: "Task",
        href: "/tasks",
        title: task.title,
        sub: task.record_label || "Unattached",
        status: <DueChip due={task.due_on} today={today} />,
        urgency: overdue ? 1 : 3,
      });
    }
    for (const meeting of home.meetings?.needs_outcome ?? []) {
      owed.push({
        key: `meeting:${meeting.meeting_id}`,
        kind: "Meeting",
        href: `/meetings/${meeting.meeting_id}`,
        title: meeting.title,
        sub: "Outcome not recorded",
        status: <span className="clock clock--running">Outcome owed</span>,
        urgency: 2,
      });
    }
    for (const deal of home.deals?.deals ?? []) {
      owed.push({
        key: `deal:${deal.deal_id}`,
        kind: "Deal",
        href: `/deals/${deal.deal_id}`,
        title: deal.company_name || deal.name,
        sub: `${deal.stage_label}${deal.mrr_amount !== null ? ` · ${formatMrr(deal.mrr_amount, deal.currency)}` : ""}`,
        status: (
          <DealFlags
            flags={deal.flags}
            idleDays={deal.idle_days}
            daysInStage={deal.days_in_stage}
          />
        ),
        urgency: deal.flags.includes("no_next_step") ? 2 : 3,
      });
    }
    for (const renewal of home.renewals?.renewals ?? []) {
      const overdue = renewal.renews_in_days !== null && renewal.renews_in_days < 0;
      owed.push({
        key: `renewal:${renewal.contract_id}`,
        kind: "Renewal",
        href: `/revenue/contracts/${renewal.contract_id}`,
        title: renewal.company_name || "Contract",
        sub: `${formatMrr(renewal.mrr_amount, renewal.currency)} · ${renewal.plan_name || "plan"}`,
        status: (
          <span className={overdue ? "due due--overdue" : "due due--today"}>
            {overdue
              ? "Renewal date passed"
              : renewal.renewal.status === "at_risk"
                ? `At risk · ${renewal.renews_in_days}d`
                : `Undecided · ${renewal.renews_in_days}d`}
          </span>
        ),
        urgency: overdue ? 1 : renewal.renewal.status === "at_risk" ? 2 : 3,
      });
    }
    if (home.mail && home.mail.awaiting_reply > 0) {
      owed.push({
        key: "mail:replies",
        kind: "Mail",
        href: "/mail/replies",
        title: `${home.mail.awaiting_reply} ${home.mail.awaiting_reply === 1 ? "sequence reply" : "sequence replies"} to record`,
        sub: "Check your inbox and say what happened; the sequence stops.",
        status: <span className="due due--today">Today</span>,
        urgency: 2,
      });
    }
    if (home.mail && home.mail.awaiting_approval > 0) {
      owed.push({
        key: "mail:approval",
        kind: "Mail",
        href: "/mail/campaigns?view=waiting",
        title: `${home.mail.awaiting_approval} ${home.mail.awaiting_approval === 1 ? "campaign waits" : "campaigns wait"} for approval`,
        sub: "A second owner or admin approves a send to fifty or more, or to customers.",
        status: <span className="due due--today">Approve</span>,
        urgency: 2,
      });
    }
    owed.sort((a, b) => a.urgency - b.urgency);
  }

  return (
    <>
      <PageHeader
        title="Today"
        meta={<LiveRefresh intervalSeconds={60} label="Today" />}
        description="Everything owed to somebody outside the team, most urgent first, beside the day's figures and meetings. Each row is one keystroke from its record."
      />
      {home === null ? (
        <Callout tone="danger" role="alert" title="Today could not be read">
          This is a read failure, not a quiet day. It retries on the next refresh.
        </Callout>
      ) : (
        <>
          <StatGrid label="At a glance">
            {home.leads && (
              <Stat
                label="First replies owed"
                value={home.leads.awaiting_first_reply}
                tone={home.leads.first_reply_overdue > 0 ? "danger" : "default"}
                hint={`${home.leads.first_reply_overdue} past the target`}
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
            {home.tasks && (
              <Stat
                label="Tasks due"
                value={home.tasks.overdue + home.tasks.due_today}
                tone={home.tasks.overdue > 0 ? "danger" : "default"}
                hint={`${home.tasks.overdue} overdue · ${home.tasks.due_today} today`}
              />
            )}
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
            {home.meetings && (
              <Stat
                label="Meetings today"
                value={home.meetings.today_count}
                hint={`${home.meetings.needs_outcome_count} outcomes owed`}
              />
            )}
            {home.approvals && (
              <Stat
                label="Approvals waiting"
                value={home.approvals.pending}
                hint={`${home.approvals.awaiting_me} for you · ${home.approvals.to_collect} to collect`}
              />
            )}
          </StatGrid>

          <div className="briefing">
            <section className="briefing__queue" aria-labelledby="owed-title">
              <div className="briefing__head">
                <h2 id="owed-title">Owed now</h2>
                <span className="briefing__count">{owed.length}</span>
              </div>
              {owed.length === 0 ? (
                <p className="briefing__clear">
                  Nothing is owed. Every lead has been answered, every timer is inside its target,
                  and no task is due.
                </p>
              ) : (
                <ol className="owed">
                  {owed.map((row) => (
                    <li key={row.key} className="owed__row">
                      <span className="owed__kind">{row.kind}</span>
                      <span className="owed__main">
                        <Link className="owed__title" href={row.href}>
                          {row.title}
                        </Link>
                        <span className="owed__sub">{row.sub}</span>
                      </span>
                      <span className="owed__status">{row.status}</span>
                    </li>
                  ))}
                </ol>
              )}
            </section>

            <aside className="briefing__side">
              {home.mentions && home.mentions.unseen > 0 && (
                <section className="briefing__block" aria-labelledby="mentions-title">
                  <div className="briefing__head">
                    <h2 id="mentions-title">You were mentioned</h2>
                    <span className="briefing__count">{home.mentions.unseen}</span>
                  </div>
                  <ol className="mentions">
                    {home.mentions.mentions.map((mention) => (
                      <li key={mention.mention_id} className="mention">
                        <p className="mention__excerpt">{mention.excerpt}</p>
                        <p className="mention__meta">
                          {mention.by_name || "A colleague"}
                          {mention.entity_id && (
                            <>
                              {" · "}
                              <Link
                                href={`/${MENTION_PAGES[mention.entity_type] ?? "home"}/${mention.entity_id}`}
                              >
                                open the {mention.entity_type || "record"}
                              </Link>
                            </>
                          )}
                        </p>
                        <RowAction
                          action={markMentionSeenAction}
                          fields={{ mention_id: mention.mention_id }}
                          buttons={[{ label: "Seen", className: "btn btn--small btn--ghost" }]}
                        />
                      </li>
                    ))}
                  </ol>
                </section>
              )}
              {home.approvals && (home.approvals.pending > 0 || home.approvals.to_collect > 0) && (
                <section className="briefing__block" aria-labelledby="approvals-title">
                  <div className="briefing__head">
                    <h2 id="approvals-title">Waiting for approval</h2>
                    <Link className="briefing__more" href="/admin/approvals">
                      All requests
                    </Link>
                  </div>
                  {home.approvals.approvals.length === 0 ? (
                    <p className="briefing__clear">
                      Nothing waits on anyone. {home.approvals.to_collect} approved{" "}
                      {home.approvals.to_collect === 1 ? "key" : "keys"} of yours to collect.
                    </p>
                  ) : (
                    <ol className="agenda">
                      {home.approvals.approvals.map((approval) => (
                        <li key={approval.approval_id} className="agenda__row">
                          <span className="agenda__time">
                            {approval.can_decide ? "You" : "Others"}
                          </span>
                          <Link className="agenda__title" href="/admin/approvals">
                            {approvalLine(approval)} ·{" "}
                            {approval.requested_by?.name || "a colleague"}
                          </Link>
                        </li>
                      ))}
                    </ol>
                  )}
                </section>
              )}
              {home.mail && (
                <section className="briefing__block" aria-labelledby="mail-title">
                  <div className="briefing__head">
                    <h2 id="mail-title">Mail</h2>
                    <Link className="briefing__more" href="/mail">
                      Open mail
                    </Link>
                  </div>
                  <p className="briefing__clear">
                    {home.mail.sending_enabled
                      ? `${home.mail.sent_today} of ${home.mail.daily_cap} sent today; ${home.mail.running} ${home.mail.running === 1 ? "campaign" : "campaigns"} sending.`
                      : "Sending is switched off."}
                    {home.mail.paused > 0 && ` ${home.mail.paused} paused.`}
                  </p>
                </section>
              )}
              {home.security && (
                <section className="briefing__block" aria-labelledby="security-title">
                  <div className="briefing__head">
                    <h2 id="security-title">Sign-in watch</h2>
                    <Link className="briefing__more" href="/admin/audit?action=auth.anomalous">
                      Audit log
                    </Link>
                  </div>
                  <p className="briefing__clear">
                    {home.security.anomalies_7d} unusual and {home.security.new_devices_7d}{" "}
                    new-device sign-ins this week; {home.security.failed_logins_24h} failed in the
                    last day.
                  </p>
                  {home.security.latest.length > 0 && (
                    <ol className="agenda">
                      {home.security.latest.map((item, index) => (
                        <li key={`${item.occurred_at}-${index}`} className="agenda__row">
                          <span className="agenda__time">
                            <Timestamp value={item.occurred_at} now={now} mode="relative" />
                          </span>
                          <span className="agenda__title">
                            {item.name || "Someone"} ·{" "}
                            {item.rules.map((rule) => RULE_TEXT[rule] ?? rule).join("; ")}
                          </span>
                        </li>
                      ))}
                    </ol>
                  )}
                </section>
              )}
              {home.meetings && (
                <section className="briefing__block" aria-labelledby="today-meetings">
                  <div className="briefing__head">
                    <h2 id="today-meetings">Meetings today</h2>
                    <Link className="briefing__more" href="/meetings">
                      All meetings
                    </Link>
                  </div>
                  {home.meetings.today.length === 0 ? (
                    <p className="briefing__clear">Nothing booked today.</p>
                  ) : (
                    <ol className="agenda">
                      {home.meetings.today.map((meeting) => (
                        <li key={meeting.meeting_id} className="agenda__row">
                          <span className="agenda__time">
                            <LocalTime value={meeting.starts_at} mode="time" />
                          </span>
                          <Link className="agenda__title" href={`/meetings/${meeting.meeting_id}`}>
                            {meeting.title}
                          </Link>
                        </li>
                      ))}
                    </ol>
                  )}
                </section>
              )}
              <section className="briefing__block" aria-labelledby="keys-title">
                <div className="briefing__head">
                  <h2 id="keys-title">Move fast</h2>
                </div>
                <dl className="keys">
                  <div>
                    <dt>
                      <kbd className="keycap">⌘</kbd>
                      <kbd className="keycap">K</kbd>
                    </dt>
                    <dd>Search any record or jump anywhere</dd>
                  </div>
                  <div>
                    <dt>
                      <kbd className="keycap">g</kbd>
                      <kbd className="keycap">s</kbd>
                    </dt>
                    <dd>The desk</dd>
                  </div>
                  <div>
                    <dt>
                      <kbd className="keycap">g</kbd>
                      <kbd className="keycap">d</kbd>
                    </dt>
                    <dd>The pipeline</dd>
                  </div>
                  <div>
                    <dt>
                      <kbd className="keycap">?</kbd>
                    </dt>
                    <dd>Every shortcut</dd>
                  </div>
                </dl>
              </section>
            </aside>
          </div>
        </>
      )}
    </>
  );
}
