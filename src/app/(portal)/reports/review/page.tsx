import Link from "next/link";

import { setTaskStatusAction } from "@/app/(portal)/_actions/work";
import {
  addReviewActionAction,
  closePriorityAction,
  createPriorityAction,
  noteMetricAction,
  removeMetricAction,
  saveMetricAction,
  saveReviewSettingsAction,
  saveWeekWordsAction,
  sendWeeklyNoteAction,
  updatePriorityAction,
} from "@/app/(portal)/reports/review/actions";
import { Sparkline } from "@/components/review/sparkline";
import { PageHeader } from "@/components/shell/page-header";
import { ActForm } from "@/components/ui/act-form";
import { Callout } from "@/components/ui/callout";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { RecordSection } from "@/components/ui/record-shell";
import { RowAction } from "@/components/ui/row-action";
import { Stat, StatGrid } from "@/components/ui/stat";
import { StatusPill, type PillTone } from "@/components/ui/status-pill";
import { hasCapability, requireStaff } from "@/lib/access/core";
import { HqApiRequestError, HqApiUnavailableError } from "@/lib/api/core";
import { readReview, type Priority, type ScorecardRow, type WeeklyReview } from "@/lib/api/review";
import { directoryOrNull, nameFor, type DirectoryEntry } from "@/lib/api/staff";
import { formatAbsolute, formatDate, formatNumber } from "@/lib/format";
import { firstSearchValue } from "@/lib/search-params";

export const metadata = { title: "Weekly review" };
export const dynamic = "force-dynamic";

const BASE = "/reports/review";

const VERDICT: Record<string, { label: string; tone: PillTone }> = {
  met: { label: "Met", tone: "live" },
  missed: { label: "Missed", tone: "danger" },
  so_far: { label: "So far", tone: "neutral" },
};
const HEALTH: Record<string, { label: string; tone: PillTone }> = {
  on_track: { label: "On track", tone: "live" },
  at_risk: { label: "At risk", tone: "attention" },
  off_track: { label: "Off track", tone: "danger" },
};

type ReviewPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/** A figure as the scorecard writes it: money in whole dollars, waits in minutes or hours. */
function figure(value: number | null, unit: string): string {
  if (value === null) return "Not counted";
  if (unit === "usd") {
    const whole = Math.round(Math.abs(value)).toLocaleString("en-US");
    return value < 0 ? `−$${whole}` : `$${whole}`;
  }
  if (unit === "minutes") {
    const minutes = Math.round(value);
    return minutes < 120
      ? `${minutes} min`
      : `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, "0")} min`;
  }
  return formatNumber(Math.round(value));
}

function goalText(row: ScorecardRow): string {
  if (row.goal === null) return "No goal yet";
  return `${row.direction === "at_most" ? "At most" : "At least"} ${figure(row.goal, row.unit)}`;
}

function span(startsOn: string, endsOn: string): string {
  const start = new Date(`${startsOn}T00:00:00Z`);
  const end = new Date(`${endsOn}T00:00:00Z`);
  const day = (value: Date) => value.getUTCDate();
  const month = (value: Date) => value.toLocaleString("en-GB", { month: "short", timeZone: "UTC" });
  return `${day(start)} ${month(start)} – ${day(end)} ${month(end)}`;
}

function StaffOptions({ staff, blank }: { staff: readonly DirectoryEntry[]; blank: string }) {
  return (
    <>
      <option value="">{blank}</option>
      {staff.map((entry) => (
        <option key={entry.staff_id} value={entry.staff_id}>
          {entry.display_name}
        </option>
      ))}
    </>
  );
}

function ScoreRow({
  row,
  week,
  staff,
  canManage,
}: {
  row: ScorecardRow;
  week: string;
  staff: readonly DirectoryEntry[];
  canManage: boolean;
}) {
  const verdict = VERDICT[row.verdict];
  const weeks = row.weeks.map((point) => ({
    label: point.week,
    value: point.value,
    complete: point.complete,
  }));
  const months = row.months.map((point) => ({
    label: point.month,
    value: point.value,
    complete: point.complete,
  }));
  return (
    <li className="score-row" id={`figure-${row.key}`}>
      <div className="score-row__head">
        <span className="table-title">{row.label}</span>
        <span className="table-sub">
          {row.owner?.name ? `Owner: ${row.owner.name}` : "No owner"} · {goalText(row)}
        </span>
        {row.note && (
          <p className="score-row__note">
            {row.note.text}
            <span className="table-sub"> — {row.note.by?.name || "someone"}</span>
          </p>
        )}
      </div>
      <dl className="score-row__figures">
        <div>
          <dt>This week</dt>
          <dd>
            <span className="score-row__actual">{figure(row.actual, row.unit)}</span>
            {verdict && (
              <StatusPill value={row.verdict} label={verdict.label} tone={verdict.tone} />
            )}
          </dd>
        </div>
        <div>
          <dt>Six weeks before</dt>
          <dd>
            <Sparkline
              points={weeks}
              format={(value) => figure(value, row.unit)}
              label={`${row.label}, week by week`}
            />
            <span className="table-sub score-row__series">
              {row.weeks
                .slice(0, -1)
                .map((point) => figure(point.value, row.unit))
                .join(" · ")}
            </span>
          </dd>
        </div>
        <div>
          <dt>Twelve months</dt>
          <dd>
            <Sparkline
              points={months}
              format={(value) => figure(value, row.unit)}
              label={`${row.label}, month by month`}
            />
            <span className="table-sub score-row__series">
              {months.length ? `${months[0]!.label} to ${months[months.length - 1]!.label}` : ""}
            </span>
          </dd>
        </div>
      </dl>
      <div className="score-row__tools">
        <details className="score-row__tool">
          <summary>{row.note ? "Change the comment" : "Comment on it"}</summary>
          <ActForm
            action={noteMetricAction}
            hidden={{ metric_key: row.key, week }}
            act="note"
            label="Save the comment"
          >
            <Field id={`note-${row.key}`} label="Why it moved this week">
              <Textarea
                id={`note-${row.key}`}
                name="note"
                rows={2}
                maxLength={400}
                defaultValue={row.note?.text ?? ""}
              />
            </Field>
          </ActForm>
        </details>
        <details className="score-row__tool">
          <summary>Add an action</summary>
          <ActForm
            action={addReviewActionAction}
            hidden={{ ref: `metric:${row.key}` }}
            act="action"
            label="Add the action"
          >
            <Field id={`action-${row.key}`} label="What is to be done">
              <Input id={`action-${row.key}`} name="title" maxLength={200} required />
            </Field>
            <Field id={`action-owner-${row.key}`} label="Whose it is">
              <Select
                id={`action-owner-${row.key}`}
                name="assignee_staff_id"
                defaultValue={row.owner?.staff_id ?? ""}
              >
                <StaffOptions staff={staff} blank="Mine" />
              </Select>
            </Field>
            <Field id={`action-due-${row.key}`} label="By">
              <Input id={`action-due-${row.key}`} name="due_on" type="date" />
            </Field>
          </ActForm>
        </details>
        {canManage && (
          <details className="score-row__tool">
            <summary>Change the goal or owner</summary>
            <ActForm
              action={saveMetricAction}
              hidden={{ metric_key: row.key }}
              act="save"
              label="Save"
            >
              <Field
                id={`goal-${row.key}`}
                label="Goal"
                hint={
                  row.unit === "usd"
                    ? "In dollars."
                    : row.unit === "minutes"
                      ? "In minutes."
                      : undefined
                }
              >
                <Input
                  id={`goal-${row.key}`}
                  name="goal"
                  inputMode="decimal"
                  defaultValue={row.goal === null ? "" : String(row.goal)}
                />
              </Field>
              <Field id={`direction-${row.key}`} label="Met when it is">
                <Select id={`direction-${row.key}`} name="direction" defaultValue={row.direction}>
                  <option value="at_least">At least the goal</option>
                  <option value="at_most">At most the goal</option>
                </Select>
              </Field>
              <Field id={`owner-${row.key}`} label="Owner">
                <Select
                  id={`owner-${row.key}`}
                  name="owner_staff_id"
                  defaultValue={row.owner?.staff_id ?? ""}
                >
                  <StaffOptions staff={staff} blank="Nobody yet" />
                </Select>
              </Field>
            </ActForm>
            <RowAction
              action={removeMetricAction}
              fields={{ metric_key: row.key }}
              buttons={[
                {
                  label: "Take it off the scorecard",
                  className: "btn btn--small btn--ghost",
                  pendingLabel: "Taking it off…",
                },
              ]}
            />
          </details>
        )}
      </div>
    </li>
  );
}

function PriorityItem({
  item,
  week,
  meId,
  canManage,
}: {
  item: Priority;
  /** The week under review: the health a person gives here is that week's. */
  week: string;
  meId: string;
  canManage: boolean;
}) {
  const health = item.this_week ? HEALTH[item.this_week.health] : undefined;
  const mine = canManage || item.owner?.staff_id === meId;
  return (
    <li className="priority" id={`priority-${item.priority_id}`}>
      <div className="priority__head">
        <span className="table-title">{item.title}</span>
        {item.state !== "open" ? (
          <StatusPill
            value={item.state}
            label={item.state === "done" ? "Done" : "Dropped"}
            tone="neutral"
          />
        ) : health ? (
          <StatusPill value={item.this_week!.health} label={health.label} tone={health.tone} />
        ) : (
          <StatusPill value="none" label={`No word for ${week}`} tone="neutral" />
        )}
      </div>
      <span className="table-sub">
        {item.owner?.name ? `Owner: ${item.owner.name}` : "No owner"}
        {item.detail ? ` · ${item.detail}` : ""}
      </span>
      {item.this_week?.note && <p className="priority__note">{item.this_week.note}</p>}
      {item.state !== "open" && item.closing_note && (
        <p className="priority__note">{item.closing_note}</p>
      )}
      {item.history.length > 0 && (
        <ol className="priority__history" aria-label={`${item.title}, week by week`}>
          {item.history.map((entry) => (
            <li
              key={entry.week}
              title={`${entry.week}: ${HEALTH[entry.health]?.label ?? entry.health}${entry.note ? ` — ${entry.note}` : ""}`}
            >
              <span className="table-sub">{entry.week.slice(-3)}</span>{" "}
              {HEALTH[entry.health]?.label ?? entry.health}
            </li>
          ))}
        </ol>
      )}
      {item.state === "open" && mine && (
        <div className="score-row__tools">
          <details className="score-row__tool" open={!item.this_week}>
            <summary>
              {item.this_week ? `Change ${week}'s health` : `Give ${week}'s health`}
            </summary>
            <ActForm
              action={updatePriorityAction}
              hidden={{ priority_id: item.priority_id, week }}
              act="health"
              label="Save the health"
            >
              <fieldset className="merge-choice">
                <legend>How it stands</legend>
                {Object.entries(HEALTH).map(([value, word]) => (
                  <label key={value} className="merge-choice__option">
                    <input
                      type="radio"
                      name="health"
                      value={value}
                      defaultChecked={(item.this_week?.health ?? "on_track") === value}
                    />
                    <span>{word.label}</span>
                  </label>
                ))}
              </fieldset>
              <Field
                id={`health-note-${item.priority_id}`}
                label="In a line"
                hint="Needed unless it is on track: what is in the way."
              >
                <Input
                  id={`health-note-${item.priority_id}`}
                  name="note"
                  maxLength={400}
                  defaultValue={item.this_week?.note ?? ""}
                />
              </Field>
            </ActForm>
          </details>
          <details className="score-row__tool">
            <summary>Close it</summary>
            <ActForm
              action={closePriorityAction}
              hidden={{ priority_id: item.priority_id }}
              act="close"
              label="Close the priority"
            >
              <Field id={`close-state-${item.priority_id}`} label="How it ended">
                <Select id={`close-state-${item.priority_id}`} name="state" defaultValue="done">
                  <option value="done">Done</option>
                  <option value="dropped">Dropped</option>
                </Select>
              </Field>
              <Field
                id={`close-note-${item.priority_id}`}
                label="In a line"
                hint="Needed when it is dropped."
              >
                <Input id={`close-note-${item.priority_id}`} name="note" maxLength={400} />
              </Field>
            </ActForm>
          </details>
          <details className="score-row__tool">
            <summary>Add an action</summary>
            <ActForm
              action={addReviewActionAction}
              hidden={{ ref: `priority:${item.priority_id}` }}
              act="action"
              label="Add the action"
            >
              <Field id={`paction-${item.priority_id}`} label="What is to be done">
                <Input id={`paction-${item.priority_id}`} name="title" maxLength={200} required />
              </Field>
              <Field id={`paction-due-${item.priority_id}`} label="By">
                <Input id={`paction-due-${item.priority_id}`} name="due_on" type="date" />
              </Field>
            </ActForm>
          </details>
        </div>
      )}
    </li>
  );
}

export default async function WeeklyReviewPage({ searchParams }: ReviewPageProps) {
  const context = await requireStaff(BASE);
  if (!hasCapability(context, "revenue:read")) {
    return (
      <>
        <PageHeader eyebrow="Business" title="Weekly review" />
        <Callout tone="neutral">
          The weekly review is read by the roles that read the weekly report.
        </Callout>
      </>
    );
  }
  const parameters = await searchParams;
  const asked = (firstSearchValue(parameters.week) ?? "").slice(0, 8);
  const quarterAsked = (firstSearchValue(parameters.quarter) ?? "").slice(0, 7);
  let review: WeeklyReview | null = null;
  try {
    review = await readReview(context.token, { week: asked, quarter: quarterAsked });
  } catch (error) {
    if (!(error instanceof HqApiUnavailableError || error instanceof HqApiRequestError))
      throw error;
  }
  const directory = await directoryOrNull(context.token);
  const staff = directory ? [...directory.values()].filter((entry) => entry.is_active) : [];
  const meId = context.me.staff.staff_id;
  const weekHref = (week: string) =>
    `${BASE}?week=${week}${quarterAsked ? `&quarter=${quarterAsked}` : ""}`;

  return (
    <>
      <PageHeader
        eyebrow="Business"
        title="Weekly review"
        description="The figures the week is judged by, each with an owner and a goal; the quarter's three priorities and how each stands this week; the actions from the last review; and the note that goes to the team. Every figure is counted from the records, never typed in."
        actions={
          review ? (
            <nav className="week-nav" aria-label="Weeks">
              <Link className="btn btn--small" href={weekHref(review.week.previous)}>
                ← {review.week.previous}
              </Link>
              <span className="week-nav__current">{review.week.label}</span>
              {review.week.next ? (
                <Link className="btn btn--small" href={weekHref(review.week.next)}>
                  {review.week.next} →
                </Link>
              ) : (
                <span className="week-nav__current week-nav__current--quiet">This week</span>
              )}
              <Link
                className="btn btn--small btn--ghost"
                href={`/reports?week=${review.week.label}`}
              >
                The week&rsquo;s report
              </Link>
            </nav>
          ) : undefined
        }
      />
      <div className="page-content">
        {review === null ? (
          <Callout tone="danger" role="alert">
            The review could not be read just now. This is a read failure, not an empty week.
          </Callout>
        ) : (
          <ReviewBody review={review} staff={staff} meId={meId} directory={directory} />
        )}
      </div>
    </>
  );
}

function ReviewBody({
  review,
  staff,
  meId,
  directory,
}: {
  review: WeeklyReview;
  staff: readonly DirectoryEntry[];
  meId: string;
  directory: ReadonlyMap<string, DirectoryEntry> | null;
}) {
  const judged = review.scorecard.filter(
    (row) => row.verdict === "met" || row.verdict === "missed",
  );
  const met = judged.filter((row) => row.verdict === "met").length;
  const open = review.priorities.filter((item) => item.state === "open");
  const onTrack = open.filter((item) => item.this_week?.health === "on_track").length;
  const openActions = review.actions.filter((task) => task.status === "open");
  const week = review.week.label;
  return (
    <>
      <StatGrid columns={4} label="The week">
        <Stat
          label="Week"
          value={week}
          text
          hint={`${span(review.week.starts_on, review.week.ends_on)}${review.week.complete ? "" : ", still running"}`}
        />
        <Stat
          label="Goals met"
          value={judged.length ? `${met} of ${judged.length}` : "—"}
          hint={review.week.complete ? undefined : "judged once the week is over"}
        />
        <Stat
          label="Priorities on track"
          value={open.length ? `${onTrack} of ${open.length}` : "—"}
          hint={review.quarter.label}
        />
        <Stat label="Open actions" value={formatNumber(openActions.length)} />
      </StatGrid>

      {review.actions.length > 0 && (
        <RecordSection id="review-actions" title="Actions from the reviews">
          <ul className="dup-records">
            {review.actions.map((task) => (
              <li key={task.task_id} className="dup-record">
                <div className="dup-record__main">
                  <span className="table-title">{task.title}</span>
                  <span className="table-sub">
                    {nameFor(directory, task.assignee_staff_id, "Nobody")}
                    {task.due_on ? ` · by ${formatDate(task.due_on)}` : ""}
                    {task.review_ref.startsWith("metric:")
                      ? ` · ${review.catalogue.find((item) => `metric:${item.key}` === task.review_ref)?.label ?? "a figure"}`
                      : task.review_ref.startsWith("priority:")
                        ? ` · ${review.priorities.find((item) => `priority:${item.priority_id}` === task.review_ref)?.title ?? "a priority"}`
                        : ""}
                  </span>
                </div>
                {task.status === "open" ? (
                  <RowAction
                    action={setTaskStatusAction}
                    fields={{ task_id: task.task_id, status: "done", return_path: BASE }}
                    buttons={[
                      {
                        label: "Done",
                        className: "btn btn--small",
                        ariaLabel: `Mark "${task.title}" done`,
                        pendingLabel: "Saving…",
                      },
                    ]}
                  />
                ) : (
                  <StatusPill value="done" label="Done" tone="live" />
                )}
              </li>
            ))}
          </ul>
        </RecordSection>
      )}

      <RecordSection id="review-scorecard" title="Scorecard">
        {review.scorecard.length === 0 ? (
          <p className="page-note">
            The scorecard is empty. {review.can_manage ? "Choose" : "An admin chooses"} the figures
            the review opens with: five to fifteen, each with an owner who can explain a change and
            a goal it is judged against.
          </p>
        ) : (
          <ul className="score-list">
            {review.scorecard.map((row) => (
              <ScoreRow
                key={row.key}
                row={row}
                week={week}
                staff={staff}
                canManage={review.can_manage}
              />
            ))}
          </ul>
        )}
        {review.can_manage && review.available.length > 0 && (
          <details className="score-row__tool score-add">
            <summary>Add a figure to the scorecard</summary>
            <ActForm action={saveMetricAction} hidden={{}} act="add" label="Add the figure">
              <Field id="add-metric" label="Figure">
                <Select id="add-metric" name="metric_key" required defaultValue="">
                  <option value="" disabled>
                    Choose one
                  </option>
                  {review.available.map((item) => (
                    <option key={item.key} value={item.key}>
                      {item.area}: {item.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field
                id="add-goal"
                label="Goal"
                hint="Money in dollars, waits in minutes; empty for no goal yet."
              >
                <Input id="add-goal" name="goal" inputMode="decimal" />
              </Field>
              <Field id="add-direction" label="Met when it is">
                <Select id="add-direction" name="direction" defaultValue="">
                  <option value="">The way the figure should move</option>
                  <option value="at_least">At least the goal</option>
                  <option value="at_most">At most the goal</option>
                </Select>
              </Field>
              <Field id="add-owner" label="Owner">
                <Select id="add-owner" name="owner_staff_id" defaultValue="">
                  <StaffOptions staff={staff} blank="Nobody yet" />
                </Select>
              </Field>
            </ActForm>
          </details>
        )}
      </RecordSection>

      <RecordSection id="review-priorities" title={`Priorities · ${review.quarter.label}`}>
        {review.quarter.label !== review.quarter.current && (
          <p className="table-sub">
            The week under review falls in {review.quarter.label}.{" "}
            <Link href={`${BASE}?week=${week}&quarter=${review.quarter.current}`}>
              This quarter&rsquo;s priorities ({review.quarter.current})
            </Link>
          </p>
        )}
        {review.priorities.length === 0 ? (
          <p className="page-note">
            No priorities for {review.quarter.label}. Three a quarter, each with an owner who gives
            its health every week.
          </p>
        ) : (
          <ul className="priority-list">
            {review.priorities.map((item) => (
              <PriorityItem
                key={item.priority_id}
                item={item}
                week={week}
                meId={meId}
                canManage={review.can_manage}
              />
            ))}
          </ul>
        )}
        {review.can_manage &&
          open.length < review.quarter.max_priorities &&
          review.quarter.label >= review.quarter.current && (
            <details className="score-row__tool score-add">
              <summary>Add a priority for {review.quarter.label}</summary>
              <ActForm
                action={createPriorityAction}
                hidden={{ quarter: review.quarter.label }}
                act="add"
                label="Add the priority"
              >
                <Field id="priority-title" label="The priority">
                  <Input id="priority-title" name="title" maxLength={200} required />
                </Field>
                <Field id="priority-owner" label="Owner">
                  <Select id="priority-owner" name="owner_staff_id" defaultValue="">
                    <StaffOptions staff={staff} blank="Nobody yet" />
                  </Select>
                </Field>
                <Field id="priority-detail" label="What done looks like">
                  <Textarea id="priority-detail" name="detail" rows={2} maxLength={1000} />
                </Field>
              </ActForm>
            </details>
          )}
      </RecordSection>

      <RecordSection id="review-note" title="The week in words">
        {review.note.sent_at ? (
          <p className="page-note">
            Sent to {formatNumber(review.note.sent_to)}{" "}
            {review.note.sent_to === 1 ? "person" : "people"} on{" "}
            {formatAbsolute(review.note.sent_at)}.
          </p>
        ) : (
          <ActForm
            action={saveWeekWordsAction}
            hidden={{ week }}
            act="words"
            label="Save"
            tight={false}
          >
            <Field id="went-well" label="What went well">
              <Textarea
                id="went-well"
                name="went_well"
                rows={2}
                maxLength={1000}
                defaultValue={review.note.went_well}
              />
            </Field>
            <Field id="went-badly" label="What went badly">
              <Textarea
                id="went-badly"
                name="went_badly"
                rows={2}
                maxLength={1000}
                defaultValue={review.note.went_badly}
              />
            </Field>
          </ActForm>
        )}
        <div className="note-preview">
          <p className="table-sub">{review.note.sent_at ? "As it was sent" : "As it would go"}</p>
          <p className="note-preview__subject">{review.note.subject}</p>
          <p className="note-preview__body">{review.note.body}</p>
        </div>
        {review.can_manage && (
          <div className="score-row__tools">
            <ActForm
              action={sendWeeklyNoteAction}
              hidden={{ week, again: review.note.sent_at ? "1" : "" }}
              act="send"
              label={review.note.sent_at ? "Send it again" : "Send it now"}
              primary={!review.note.sent_at}
            />
            <details className="score-row__tool">
              <summary>When it goes out on its own</summary>
              <ActForm action={saveReviewSettingsAction} hidden={{}} act="settings" label="Save">
                <label className="merge-choice__option">
                  <input type="checkbox" name="note_on" defaultChecked={review.settings.note_on} />{" "}
                  Send last week&rsquo;s note every week
                </label>
                <Field id="note-weekday" label="On">
                  <Select
                    id="note-weekday"
                    name="note_weekday"
                    defaultValue={String(review.settings.note_weekday)}
                  >
                    {review.settings.weekdays.map((day, index) => (
                      <option key={day} value={index}>
                        {day}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field id="note-hour" label="At (UTC)">
                  <Select
                    id="note-hour"
                    name="note_hour_utc"
                    defaultValue={String(review.settings.note_hour_utc)}
                  >
                    {Array.from({ length: 24 }, (_, hour) => (
                      <option key={hour} value={hour}>
                        {String(hour).padStart(2, "0")}:00 UTC
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field id="note-primary" label="The number it opens with">
                  <Select
                    id="note-primary"
                    name="primary_metric"
                    defaultValue={review.settings.primary_metric}
                  >
                    {review.catalogue.map((item) => (
                      <option key={item.key} value={item.key}>
                        {item.label}
                      </option>
                    ))}
                  </Select>
                </Field>
              </ActForm>
            </details>
          </div>
        )}
        {!review.note.sent_at && !review.can_manage && (
          <p className="table-sub">
            An admin sends it, or it goes out on its own on the morning they chose.
          </p>
        )}
        <p className="table-sub">
          <Link href="/tasks">Every task</Link> · actions from the review are tasks, on their
          owners&rsquo; lists.
        </p>
      </RecordSection>
    </>
  );
}
