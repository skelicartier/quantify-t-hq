import Link from "next/link";
import { notFound } from "next/navigation";

import {
  enrolAction,
  enrolPreviewAction,
  feedCreateAction,
  feedPreviewAction,
  feedUpdateAction,
  outcomeAction,
  resumeEnrolmentAction,
  saveSequenceAction,
  sequenceBranchAction,
  sequenceStateAction,
} from "@/app/(portal)/mail/actions";
import { EnrolPanel } from "@/components/mail/enrol-panel";
import { FeedPanel } from "@/components/mail/feed-panel";
import { MailForm } from "@/components/mail/mail-form";
import { EnrolmentStatePill } from "@/components/mail/pills";
import { SequenceEditor } from "@/components/mail/sequence-editor";
import { Callout } from "@/components/ui/callout";
import { DataTable } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input, Select } from "@/components/ui/field";
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
import { RowAction } from "@/components/ui/row-action";
import { StatusPill } from "@/components/ui/status-pill";
import { Timestamp } from "@/components/ui/timestamp";
import { hasCapability, requireStaff } from "@/lib/access/core";
import { HqApiRequestError, HqApiUnavailableError } from "@/lib/api/core";
import {
  EXIT_REASON_LABELS,
  FEED_STATE_LABELS,
  SKIP_REASON_LABELS,
  readSenders,
  readSequence,
  readTemplates,
  type SequenceDetail,
} from "@/lib/api/mail";
import { audienceOptions } from "@/lib/mail/options";
import { formatDate, formatNumber } from "@/lib/format";
import { requestNow } from "@/lib/request-time";
import { firstSearchValue } from "@/lib/search-params";

export const metadata = { title: "Sequence" };
export const dynamic = "force-dynamic";

const TABS = [
  { key: "people", label: "People" },
  { key: "enrol", label: "Enrol" },
  { key: "feeds", label: "Daily feed" },
  { key: "steps", label: "Steps" },
  { key: "results", label: "Results" },
];

const FEED_COLUMNS = [
  { key: "segment", label: "Takes from" },
  { key: "cap", label: "A day", align: "end" as const },
  { key: "state", label: "State" },
  { key: "last", label: "Last take" },
  { key: "total", label: "Enrolled so far", align: "end" as const },
  { key: "by", label: "Set by" },
  { key: "actions", label: "" },
];

const FEED_TONES: Record<string, "live" | "attention" | "neutral"> = {
  active: "live",
  paused: "attention",
  ended: "neutral",
};

const ENROLMENT_COLUMNS = [
  { key: "who", label: "Person" },
  { key: "state", label: "State" },
  { key: "step", label: "Step" },
  { key: "last", label: "Last email" },
  { key: "owner", label: "Owner" },
  { key: "actions", label: "Record what happened" },
];

const STEP_COLUMNS = [
  { key: "step", label: "Step" },
  { key: "queued", label: "Queued", align: "end" as const },
  { key: "sent", label: "Sent", align: "end" as const },
  { key: "delivered", label: "Delivered", align: "end" as const },
  { key: "bounced", label: "Bounced", align: "end" as const },
  { key: "clicked", label: "Clicked", align: "end" as const },
  { key: "skipped", label: "Skipped", align: "end" as const },
];

const STATE_TONES = {
  draft: "neutral",
  active: "live",
  paused: "attention",
  archived: "neutral",
} as const;
const STATE_LABELS = {
  draft: "Draft",
  active: "Live",
  paused: "Paused",
  archived: "Archived",
} as const;

type SequencePageProps = {
  params: Promise<{ sequenceId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function SequencePage({ params, searchParams }: SequencePageProps) {
  const { sequenceId } = await params;
  const context = await requireStaff(`/mail/sequences/${sequenceId}`);
  const parameters = await searchParams;
  const now = requestNow();
  let detail: SequenceDetail | null = null;
  try {
    detail = await readSequence(context.token, sequenceId);
  } catch (error) {
    if (error instanceof HqApiRequestError && error.status === 404) notFound();
    if (!(error instanceof HqApiUnavailableError || error instanceof HqApiRequestError))
      throw error;
  }
  if (detail === null) {
    return (
      <Callout tone="danger" role="alert">
        This sequence could not be read just now.
      </Callout>
    );
  }
  const { sequence } = detail;
  const tab = currentTab(firstSearchValue(parameters.tab), TABS);
  const base = `/mail/sequences/${sequence.sequence_id}`;
  const canWrite = hasCapability(context, "crm:write");
  const [senders, templates, options] =
    tab === "steps"
      ? await Promise.all([
          readSenders(context.token),
          readTemplates(context.token),
          Promise.resolve(null),
        ])
      : tab === "enrol"
        ? await Promise.all([
            Promise.resolve(null),
            Promise.resolve(null),
            audienceOptions(context.token),
          ])
        : [null, null, null];
  const live = detail.enrolments.filter((row) => row.state === "active" || row.state === "paused");
  const ended = detail.enrolments.filter((row) => row.state !== "active" && row.state !== "paused");

  return (
    <>
      <RecordHeader
        crumbs={[
          { href: "/mail", label: "Mail" },
          { href: "/mail/sequences", label: "Sequences" },
        ]}
        title={sequence.name}
        status={
          <StatusPill
            value={sequence.state}
            label={STATE_LABELS[sequence.state]}
            tone={STATE_TONES[sequence.state]}
          />
        }
        readouts={[
          { label: "In it now", value: String(sequence.counts.active) },
          { label: "Enrolled", value: String(sequence.counts.enrolled) },
          { label: "Replied", value: String(sequence.counts.replied) },
          { label: "Meetings", value: String(sequence.counts.meetings) },
        ]}
        actions={
          detail.may_send ? (
            <>
              {sequence.state !== "active" && sequence.state !== "archived" && (
                <MailForm
                  action={sequenceStateAction}
                  fields={{ sequence_id: sequence.sequence_id, state: "active" }}
                  submitLabel="Make live"
                  variant="primary"
                  className="inline-form"
                />
              )}
              {sequence.state === "active" && (
                <MailForm
                  action={sequenceStateAction}
                  fields={{ sequence_id: sequence.sequence_id, state: "paused" }}
                  submitLabel="Pause"
                  className="inline-form"
                />
              )}
              {sequence.state !== "archived" && (
                <MailForm
                  action={sequenceStateAction}
                  fields={{ sequence_id: sequence.sequence_id, state: "archived" }}
                  submitLabel="Archive"
                  variant="ghost"
                  className="inline-form"
                />
              )}
            </>
          ) : undefined
        }
      />
      {sequence.state === "draft" && (
        <Callout tone="attention" title="Not live yet">
          An owner or admin makes a sequence live; until then nobody can be enrolled.
        </Callout>
      )}
      <RecordTabs
        base={base}
        tabs={[
          { ...TABS[0]!, count: live.length },
          TABS[1]!,
          { ...TABS[2]!, count: sequence.feeds.active || undefined },
          TABS[3]!,
          TABS[4]!,
        ]}
        current={tab}
        label="Sequence sections"
      />
      <RecordGrid
        side={
          <Properties title="Rules">
            <Property label="For">
              {sequence.kind === "customer"
                ? "Customers"
                : "Prospects (refuses anyone whose firm pays)"}
            </Property>
            <Property label="Sent as">
              {sequence.sender ? sequence.sender.from_email : "Whoever enrols them"}
            </Property>
            <Property label="Recent contact">
              Skips anyone emailed in the last {sequence.recent_contact_days} days
            </Property>
            <Property label="Cooling-off">
              {sequence.cooling_days} days before anyone is enrolled again
            </Property>
            <Property label="Per firm">
              {sequence.company_limit === 1
                ? "One person at a firm at once"
                : `${sequence.company_limit} people at a firm at once`}
            </Property>
            <Property label="Ends on">
              A reply you record, a meeting, a deal, a lead moving on, a bounce, a stop
            </Property>
            <Property label="Leads on to">
              {detail.branches.some((branch) => branch.target) ? (
                <ul className="step-lines">
                  {detail.branches
                    .filter((branch) => branch.target)
                    .map((branch) => (
                      <li key={branch.outcome}>
                        {branch.label} → {branch.target!.name}
                      </li>
                    ))}
                </ul>
              ) : (
                <Link href={`${base}?tab=steps#sequence-branches`}>Nothing yet · set it</Link>
              )}
            </Property>
            <Property label="Fed from">
              {sequence.feeds.active > 0 ? (
                <Link href={`${base}?tab=feeds`}>
                  {sequence.feeds.active === 1
                    ? "One segment"
                    : `${sequence.feeds.active} segments`}
                  , up to {formatNumber(sequence.feeds.daily_cap)} a day
                </Link>
              ) : sequence.feeds.total > 0 ? (
                <Link href={`${base}?tab=feeds`}>
                  {sequence.feeds.total === 1 ? "One feed" : `${sequence.feeds.total} feeds`}, none
                  taking today
                </Link>
              ) : (
                <Link href={`${base}?tab=feeds`}>Nothing yet · set a daily feed</Link>
              )}
            </Property>
            <Property label="Steps">
              <ol className="step-lines">
                {sequence.steps.map((step) => (
                  <li key={step.step_no}>
                    {step.step_no === 1
                      ? "At once"
                      : `${step.delay_days} business ${step.delay_days === 1 ? "day" : "days"} later`}
                    {" · "}
                    {step.kind === "task"
                      ? `Task: ${step.task_title || "follow up"}`
                      : `${step.thread === "reply" ? "Reply: " : ""}${step.template_name}`}
                  </li>
                ))}
              </ol>
            </Property>
          </Properties>
        }
      >
        {tab === "people" && (
          <>
            <DataTable
              caption="In the sequence"
              columns={ENROLMENT_COLUMNS}
              isEmpty={live.length === 0}
              empty={
                <EmptyState
                  compact
                  title="Nobody in it now"
                  description="Enrol people or leads from the Enrol tab, or from their own page."
                />
              }
            >
              {live.map((row) => (
                <tr key={row.enrolment_id}>
                  <td>
                    <Link
                      className="table-title"
                      href={
                        row.contact_kind === "lead"
                          ? `/leads/${row.contact_id}`
                          : `/people/${row.contact_id}`
                      }
                    >
                      {row.contact_name || row.email}
                    </Link>
                    <span className="table-sub">
                      {[row.company_name, row.email].filter(Boolean).join(" · ")}
                    </span>
                    {row.from_outcome && (
                      <span className="table-sub">
                        From {row.from_sequence_name || "another sequence"} after &ldquo;
                        {row.from_outcome_label || row.from_outcome}&rdquo;
                      </span>
                    )}
                  </td>
                  <td>
                    <EnrolmentStatePill state={row.state} />
                    {row.pause_reason && (
                      <span className="table-sub">
                        {row.pause_reason === "COMPANY_ENGAGED"
                          ? "A colleague at the firm engaged"
                          : row.pause_reason === "OUT_OF_OFFICE"
                            ? `Back ${row.paused_until ? formatDate(row.paused_until) : "soon"}`
                            : row.pause_reason}
                      </span>
                    )}
                  </td>
                  <td>
                    {row.current_step} of {row.steps_total}
                    {row.waiting_task_id && <span className="table-sub">Waiting on a task</span>}
                  </td>
                  <td>
                    <Timestamp
                      value={row.last_sent_at}
                      now={now}
                      mode="relative"
                      fallback="Not yet"
                    />
                    {row.awaiting_reply && <span className="due due--today">Reply owed</span>}
                  </td>
                  <td>{row.owner_name || "—"}</td>
                  <td className="nowrap">
                    {canWrite &&
                      (row.state === "paused" ? (
                        <RowAction
                          action={resumeEnrolmentAction}
                          fields={{ enrolment_id: row.enrolment_id }}
                          buttons={[{ label: "Carry on", className: "btn btn--small" }]}
                        />
                      ) : (
                        <RowAction
                          action={outcomeAction}
                          fields={{ enrolment_id: row.enrolment_id }}
                          className="outcome-row"
                          buttons={[
                            {
                              label: "Replied",
                              className: "btn btn--small",
                              name: "outcome",
                              value: "replied_positive",
                              ariaLabel: `${row.contact_name}: replied, interested`,
                            },
                            {
                              label: "Meeting",
                              className: "btn btn--small",
                              name: "outcome",
                              value: "meeting_booked",
                              ariaLabel: `${row.contact_name}: meeting booked`,
                            },
                            {
                              label: "Stop",
                              className: "btn btn--small btn--ghost",
                              name: "outcome",
                              value: "stop",
                              ariaLabel: `${row.contact_name}: stop the sequence`,
                            },
                          ]}
                        />
                      ))}
                  </td>
                </tr>
              ))}
            </DataTable>
            {ended.length > 0 && (
              <RecordSection id="sequence-ended" title={`Finished or ended · ${ended.length}`}>
                <ul className="ended-list">
                  {ended.slice(0, 50).map((row) => (
                    <li key={row.enrolment_id}>
                      <span>{row.contact_name || row.email}</span>
                      <span className="table-sub">{row.company_name}</span>
                      <span>
                        {row.outcome_label ||
                          EXIT_REASON_LABELS[row.exit_reason] ||
                          row.exit_reason ||
                          "Finished"}
                        {row.went_on_to && (
                          <>
                            {" · went on to "}
                            <Link href={`/mail/sequences/${row.went_on_to.sequence_id}`}>
                              {row.went_on_to.name}
                            </Link>
                          </>
                        )}
                      </span>
                      <Timestamp
                        value={row.exited_at ?? row.last_sent_at}
                        now={now}
                        mode="relative"
                        fallback=""
                      />
                    </li>
                  ))}
                </ul>
              </RecordSection>
            )}
          </>
        )}
        {tab === "enrol" && options && (
          <RecordSection id="sequence-enrol" title="Enrol people or leads">
            {sequence.state !== "active" && (
              <Callout tone="attention" compact>
                The sequence is not live: you can check who it would take, not enrol.
              </Callout>
            )}
            <EnrolPanel
              sequenceId={sequence.sequence_id}
              previewAction={enrolPreviewAction}
              enrolAction={enrolAction}
              people={options.people}
              leads={options.leads}
              disabled={sequence.state !== "active" || !canWrite}
            />
          </RecordSection>
        )}
        {tab === "feeds" && (
          <>
            <RecordSection id="sequence-feeds" title="Fed from a segment, a little every day">
              <p className="page-note">
                A feed takes up to its cap from a segment each day — best fit first, under the
                sending rules and this sequence&rsquo;s own — and enrols them. It never takes anyone
                twice, waits while sending is off or the sequence is paused, and each day&rsquo;s
                take is one line in the audit log.
              </p>
              <DataTable
                caption="Feeds"
                columns={FEED_COLUMNS}
                isEmpty={detail.feeds.length === 0}
                empty={
                  <EmptyState
                    compact
                    title="No feed yet"
                    description="Start one below: choose a segment and how many a day."
                  />
                }
              >
                {detail.feeds.map((feed) => (
                  <tr
                    key={feed.feed_id}
                    className={feed.state === "ended" ? "row--muted" : undefined}
                  >
                    <td>
                      <Link className="table-title" href="/mail/segments">
                        {feed.segment.name || "A segment since removed"}
                      </Link>
                      {feed.note && <span className="table-sub">{feed.note}</span>}
                    </td>
                    <td className="data-table__num">{formatNumber(feed.daily_cap)}</td>
                    <td className="nowrap">
                      <StatusPill
                        value={feed.state}
                        label={FEED_STATE_LABELS[feed.state] ?? feed.state}
                        tone={FEED_TONES[feed.state] ?? "neutral"}
                      />
                      {feed.state === "ended" && feed.end_reason_label && (
                        <span className="table-sub">{feed.end_reason_label}</span>
                      )}
                    </td>
                    <td>
                      {feed.last_run_on ? (
                        <>
                          {formatDate(feed.last_run_on)} · {formatNumber(feed.last_enrolled)}{" "}
                          enrolled
                          {feed.last_considered > feed.last_enrolled &&
                            ` of ${formatNumber(feed.last_considered)} judged`}
                          {Object.keys(feed.last_reasons).length > 0 && (
                            <span className="table-sub">
                              Held:{" "}
                              {Object.entries(feed.last_reasons)
                                .map(
                                  ([reason, count]) =>
                                    `${SKIP_REASON_LABELS[reason] ?? reason} (${count})`,
                                )
                                .join(" · ")}
                            </span>
                          )}
                        </>
                      ) : (
                        <span className="table-sub">Not yet: with the next sending pass</span>
                      )}
                      {feed.state === "active" && feed.last_run_on && (
                        <span className="table-sub">
                          {feed.drain_days === null
                            ? "No mailbox could send that day, so prospects waited."
                            : `About ${feed.drain_days === 1 ? "a working day" : `${formatNumber(feed.drain_days)} working days`} to drain the segment at that pace.`}
                        </span>
                      )}
                    </td>
                    <td className="data-table__num">
                      {formatNumber(feed.enrolled_total)}
                      <span className="table-sub">
                        {feed.days_run === 1 ? "1 day" : `${formatNumber(feed.days_run)} days`}
                      </span>
                    </td>
                    <td className="nowrap">{feed.created_by?.name ?? "—"}</td>
                    <td>
                      {detail.may_send && feed.state !== "ended" && (
                        <div className="row-actions">
                          <MailForm
                            action={feedUpdateAction}
                            fields={{
                              feed_id: feed.feed_id,
                              sequence_id: sequence.sequence_id,
                              state: feed.state === "active" ? "paused" : "active",
                            }}
                            submitLabel={feed.state === "active" ? "Pause" : "Resume"}
                            className="inline-form"
                          />
                          <Popover label="Change the cap" align="end">
                            <MailForm
                              action={feedUpdateAction}
                              fields={{ feed_id: feed.feed_id, sequence_id: sequence.sequence_id }}
                              submitLabel="Save the cap"
                            >
                              <Field id={`cap-${feed.feed_id}`} label="Up to, each day">
                                <Input
                                  id={`cap-${feed.feed_id}`}
                                  name="daily_cap"
                                  type="number"
                                  inputMode="numeric"
                                  min={1}
                                  max={detail.max_daily_cap}
                                  defaultValue={feed.daily_cap}
                                  required
                                />
                              </Field>
                            </MailForm>
                          </Popover>
                          <MailForm
                            action={feedUpdateAction}
                            fields={{
                              feed_id: feed.feed_id,
                              sequence_id: sequence.sequence_id,
                              state: "ended",
                            }}
                            submitLabel="End"
                            variant="ghost"
                            className="inline-form"
                          />
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </DataTable>
            </RecordSection>
            <RecordSection id="sequence-feed-new" title="Start a feed">
              {sequence.state !== "active" && (
                <Callout tone="attention" compact>
                  The sequence is not live: you can check what a feed would take, not start one.
                </Callout>
              )}
              <FeedPanel
                sequenceId={sequence.sequence_id}
                segments={detail.segments}
                maxDailyCap={detail.max_daily_cap}
                previewAction={feedPreviewAction}
                createAction={feedCreateAction}
                disabled={sequence.state !== "active" || !detail.may_send}
              />
            </RecordSection>
          </>
        )}
        {tab === "steps" && (
          <RecordSection id="sequence-branches" title="When they answer, lead on to">
            <p className="page-note">
              When a reply is recorded as one of these answers, the person is enrolled in the
              sequence chosen for it — judged by every rule an enrolment is, except &ldquo;emailed
              in the last two weeks&rdquo;, which the conversation itself would trip. A
              &ldquo;no&rdquo;, a stop or a bounce never enrols anyone.
            </p>
            <ul className="branch-list">
              {detail.branches.map((branch) => {
                const targets =
                  branch.target &&
                  !detail.branch_targets.some(
                    (target) => target.sequence_id === branch.target!.sequence_id,
                  )
                    ? [...detail.branch_targets, branch.target]
                    : detail.branch_targets;
                return (
                  <li key={branch.outcome} className="branch-list__row">
                    <MailForm
                      action={sequenceBranchAction}
                      fields={{ sequence_id: sequence.sequence_id, outcome: branch.outcome }}
                      submitLabel="Save"
                      pendingLabel="Saving…"
                      className="branch-form"
                      disabled={!canWrite}
                    >
                      <Field id={`branch-${branch.outcome}`} label={branch.label}>
                        {/* Keyed by what is saved: the form resets after a save, and a
                            select resets to the value it was first drawn with. */}
                        <Select
                          key={branch.target?.sequence_id ?? "none"}
                          id={`branch-${branch.outcome}`}
                          name="target_sequence_id"
                          defaultValue={branch.target?.sequence_id ?? ""}
                          disabled={!canWrite}
                        >
                          <option value="">Nothing more</option>
                          {targets.map((target) => (
                            <option key={target.sequence_id} value={target.sequence_id}>
                              {target.name}
                              {target.state === "active" ? "" : ` (${target.state})`}
                            </option>
                          ))}
                        </Select>
                      </Field>
                    </MailForm>
                    {branch.target && branch.target.state !== "active" && (
                      <span className="table-sub">
                        &ldquo;{branch.target.name}&rdquo; is not live: nobody is enrolled there
                        until it is.
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          </RecordSection>
        )}
        {tab === "steps" && senders && templates && (
          <SequenceEditor
            action={saveSequenceAction}
            disabled={!canWrite || sequence.state === "archived"}
            templates={templates.templates
              .filter((template) => template.kind === "sequence" && !template.archived_at)
              .map((template) => ({ id: template.template_id, label: template.name }))}
            senders={senders.senders
              .filter((sender) => sender.kind === "sales" && sender.active)
              .map((sender) => ({
                id: sender.sender_id,
                label: `${sender.from_name || sender.staff_name} <${sender.from_email}>`,
              }))}
            initial={{
              sequence_id: sequence.sequence_id,
              name: sequence.name,
              kind: sequence.kind,
              sender_id: sequence.sender?.sender_id ?? "",
              cooling_days: sequence.cooling_days,
              recent_contact_days: sequence.recent_contact_days,
              company_limit: sequence.company_limit,
              steps: sequence.steps.map((step) => ({
                kind: step.kind,
                delay_days: step.delay_days,
                template_id: step.template_id ?? "",
                thread: step.thread,
                task_title: step.task_title,
              })),
            }}
          />
        )}
        {tab === "results" && (
          <>
            <DataTable caption="Per step" columns={STEP_COLUMNS}>
              {detail.per_step.map((row) => (
                <tr key={row.step_no}>
                  <td>
                    Step {row.step_no}
                    <span className="table-sub">
                      {sequence.steps.find((step) => step.step_no === row.step_no)?.kind === "task"
                        ? "Call or task"
                        : "Email"}
                    </span>
                  </td>
                  <td className="data-table__num">{row.scheduled}</td>
                  <td className="data-table__num">{row.sent}</td>
                  <td className="data-table__num">{row.delivered}</td>
                  <td className="data-table__num">{row.bounced}</td>
                  <td className="data-table__num">{row.clicked}</td>
                  <td className="data-table__num">{row.skipped}</td>
                </tr>
              ))}
            </DataTable>
            <p className="page-note">
              Replies are what people record, never inferred from a click; opens are not counted at
              all. With two or three people sending, there is no leaderboard.
            </p>
          </>
        )}
      </RecordGrid>
    </>
  );
}
