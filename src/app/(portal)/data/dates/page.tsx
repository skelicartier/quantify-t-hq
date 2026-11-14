import Link from "next/link";

import { DueChip } from "@/components/crm/pills";
import { DataUnavailable } from "@/components/data/data-down";
import { DateFields, NEW_DATE } from "@/components/data/dates/date-fields";
import { MailForm } from "@/components/mail/mail-form";
import { PageHeader } from "@/components/shell/page-header";
import { ButtonLink, buttonClass } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { DataTable } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input, Textarea } from "@/components/ui/field";
import { Popover } from "@/components/ui/popover";
import { RecordSection } from "@/components/ui/record-shell";
import { RowAction } from "@/components/ui/row-action";
import { StatusPill } from "@/components/ui/status-pill";
import { SegmentedLinks } from "@/components/ui/toolbar";
import { DATA_ROLE_LINE, requireData } from "@/lib/data/access";
import { readDates, type DateSuggestion, type DatesPage, type KeyDate } from "@/lib/data/api/dates";
import { DATE_KINDS, DATE_STATES, REPEATS } from "@/lib/data/labels";
import { dataRead } from "@/lib/data/read";
import { formatDate, formatNumber } from "@/lib/format";
import { firstSearchValue } from "@/lib/search-params";

import {
  addDateAction,
  addSuggestedAction,
  deleteDateAction,
  doneDateAction,
  notForUsAction,
  setFactsAction,
  updateDateAction,
} from "./actions";
import "./dates.css";

export const metadata = { title: "Key dates" };
export const dynamic = "force-dynamic";

const BASE = "/data/dates";
const ABOUT =
  "Dates you keep, and dates suggested for an Indian private company. Rules change: check every suggested date with your CA before relying on it.";

const COLUMNS = [
  { key: "due", label: "Due" },
  { key: "what", label: "What", width: "34%" },
  { key: "who", label: "Who handles it" },
  { key: "state", label: "State" },
  { key: "actions", label: "Change", align: "end" as const },
];

const SUGGESTION_COLUMNS = [
  { key: "what", label: "What", width: "26%" },
  { key: "rule", label: "Rule" },
  { key: "applies", label: "Applies when", width: "30%" },
  { key: "next", label: "Next due" },
  { key: "add", label: "Add", align: "end" as const },
];

const GROUPS = [
  { key: "monthly", label: "Every month" },
  { key: "quarterly", label: "Every quarter" },
  { key: "yearly", label: "Every year" },
  { key: "renewal", label: "Renewals: dates you type" },
] as const;

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const monthLabel = (month: string) =>
  `${MONTHS[Number(month.slice(5, 7)) - 1] ?? ""} ${month.slice(0, 4)}`;

const VIEWS = new Set(["upcoming", "all", "done"]);
const STATE_TONES = {
  coming_up: "neutral",
  due_this_week: "attention",
  done: "live",
  not_for_us: "neutral",
} as const;

type Params = Record<string, string | string[] | undefined>;

export default async function DatesPage({ searchParams }: { searchParams: Promise<Params> }) {
  const { allowed } = await requireData(BASE);
  const parameters = await searchParams;
  const asked = firstSearchValue(parameters.view) ?? "upcoming";
  const view = (VIEWS.has(asked) ? asked : "upcoming") as "upcoming" | "all" | "done";
  const edit = firstSearchValue(parameters.edit) ?? "";
  const read = allowed ? await dataRead(() => readDates(view)) : null;
  const data = read?.ok ? read.data : null;
  return (
    <>
      <PageHeader
        title="Key dates"
        description={ABOUT}
        meta={
          data ? (
            <span className="quiet">{formatNumber(data.counts.upcoming)} coming up</span>
          ) : undefined
        }
        actions={
          data ? (
            <>
              <Popover label="Add a date" variant="primary" align="end" width="wide">
                <MailForm action={addDateAction} submitLabel="Add the date" pendingLabel="Adding…">
                  <DateFields
                    prefix="date-new"
                    values={{ ...NEW_DATE, due_on: data.today }}
                    files={data.files}
                    filesHere={data.files_here}
                  />
                </MailForm>
              </Popover>
              <ButtonLink href="/data/calendar" size="small">
                Add to your calendar
              </ButtonLink>
              <a className={buttonClass({ size: "small" })} href={`${BASE}/export`}>
                Download (CSV)
              </a>
            </>
          ) : undefined
        }
      />
      <div className="page-content">
        {!allowed || !read ? (
          <Callout tone="neutral">{DATA_ROLE_LINE}</Callout>
        ) : !read.ok ? (
          <DataUnavailable failure={read} />
        ) : (
          <Dates page={read.data} edit={edit} />
        )}
      </div>
    </>
  );
}

function Dates({ page, edit }: { page: DatesPage; edit: string }) {
  const editing = page.dates.find((date) => date.date_id === edit) ?? null;
  const overdue = page.dates.filter((date) => date.overdue);
  const months = new Map<string, KeyDate[]>();
  for (const date of page.dates) {
    if (date.overdue) continue;
    const month = date.due_on.slice(0, 7);
    months.set(month, [...(months.get(month) ?? []), date]);
  }
  const groups = [
    ...(overdue.length ? [{ key: "overdue", label: "Overdue", dates: overdue }] : []),
    ...[...months.entries()].map(([month, dates]) => ({
      key: month,
      label: monthLabel(month),
      dates,
    })),
  ];
  return (
    <div className="hqdata-dates">
      {editing && <EditDate date={editing} page={page} />}
      <SegmentedLinks
        label="Which dates"
        items={[
          {
            href: BASE,
            label: `Coming up ${formatNumber(page.counts.upcoming)}`,
            current: page.view === "upcoming",
          },
          {
            href: `${BASE}?view=done`,
            label: `Done or not for us ${formatNumber(page.counts.done)}`,
            current: page.view === "done",
          },
          {
            href: `${BASE}?view=all`,
            label: `All ${formatNumber(page.counts.all)}`,
            current: page.view === "all",
          },
        ]}
      />
      {groups.length === 0 ? (
        page.counts.all === 0 ? (
          <EmptyState
            title="No dates yet"
            description="Add the filings and renewals you keep, or pick from the suggestions below."
          />
        ) : (
          <p className="page-note">
            {page.view === "done" ? "Nothing done or set aside yet." : "Nothing is coming up."}
          </p>
        )
      ) : (
        groups.map((group) => (
          <section
            key={group.key}
            className="hqdata-dates__month"
            aria-labelledby={`dates-${group.key}`}
          >
            <h3 className="hqdata-dates__heading" id={`dates-${group.key}`}>
              {group.label}
            </h3>
            <DataTable
              caption={`Key dates, ${group.label}`}
              columns={COLUMNS}
              columnMenu={false}
              scroll={false}
            >
              {group.dates.map((date) => (
                <DateRow key={date.date_id} date={date} today={page.today} />
              ))}
            </DataTable>
          </section>
        ))
      )}
      <Suggestions page={page} />
    </div>
  );
}

function DateRow({ date, today }: { date: KeyDate; today: string }) {
  const fields = { date_id: date.date_id };
  const last = date.history[date.history.length - 1];
  return (
    <tr id={`date-${date.date_id}`}>
      <td className="nowrap">
        {date.state === "coming_up" ? (
          <DueChip due={date.due_on} today={today} />
        ) : (
          formatDate(date.due_on)
        )}
        {date.repeats !== "never" && <span className="table-sub">{REPEATS[date.repeats]}</span>}
      </td>
      <td>
        <span className="table-title">{date.title}</span>
        <span className="table-sub">
          {DATE_KINDS[date.kind]} · {date.entity}
        </span>
        {date.file && (
          <span className="table-sub">
            <Link className="text-link" href={`/data/files/${date.file.file_id}`}>
              {date.file.title}
            </Link>
          </span>
        )}
        {date.notes && (
          <span className="table-sub table-sub--prose" title={date.notes}>
            {date.notes}
          </span>
        )}
      </td>
      <td>{date.handled_by || <span className="table-sub">Not given</span>}</td>
      <td className="nowrap">
        <StatusPill
          value={date.shown_state}
          label={DATE_STATES[date.shown_state]}
          tone={STATE_TONES[date.shown_state]}
        />
        {last && <span className="table-sub">Last done {formatDate(last.done_at)}</span>}
        {date.state_note && <span className="table-sub">{date.state_note}</span>}
      </td>
      <td>
        <div className="hqdata-dates__acts">
          {date.state === "coming_up" ? (
            <>
              <Popover label="Done" align="end">
                <MailForm
                  action={doneDateAction}
                  fields={fields}
                  submitLabel="Mark it done"
                  pendingLabel="Saving…"
                >
                  <Field id={`done-${date.date_id}`} label="Note">
                    <Textarea
                      id={`done-${date.date_id}`}
                      name="note"
                      rows={2}
                      maxLength={4_000}
                      placeholder="SRN, challan, who filed it"
                    />
                  </Field>
                  {date.repeats !== "never" && (
                    <p className="field__hint">It then moves to its next due date.</p>
                  )}
                </MailForm>
              </Popover>
              <Popover label="Not for us" align="end">
                <MailForm
                  action={notForUsAction}
                  fields={fields}
                  submitLabel="Mark it not for us"
                  pendingLabel="Saving…"
                >
                  <Field id={`nope-${date.date_id}`} label="Why">
                    <Input id={`nope-${date.date_id}`} name="note" maxLength={200} />
                  </Field>
                </MailForm>
              </Popover>
            </>
          ) : (
            <RowAction
              action={updateDateAction}
              fields={{ ...fields, state: "coming_up" }}
              buttons={[
                {
                  label: "Put it back",
                  className: "btn btn--small",
                  ariaLabel: `Put it back: ${date.title}`,
                  pendingLabel: "Saving…",
                },
              ]}
            />
          )}
          <ButtonLink
            href={`${BASE}?edit=${date.date_id}#date-edit`}
            size="small"
            variant="ghost"
            aria-label={`Edit: ${date.title}`}
          >
            Edit
          </ButtonLink>
        </div>
      </td>
    </tr>
  );
}

function EditDate({ date, page }: { date: KeyDate; page: DatesPage }) {
  return (
    <RecordSection
      id="date-edit"
      title={`Edit “${date.title}”`}
      actions={
        <ButtonLink href={BASE} size="small" variant="ghost">
          Close
        </ButtonLink>
      }
    >
      <div className="hqdata-dates__edit">
        <MailForm
          action={updateDateAction}
          fields={{ date_id: date.date_id }}
          submitLabel="Save"
          pendingLabel="Saving…"
        >
          <DateFields
            prefix={`date-edit-${date.date_id.slice(0, 8)}`}
            values={date}
            files={page.files}
            filesHere={page.files_here}
          />
        </MailForm>
        <RowAction
          action={deleteDateAction}
          fields={{ date_id: date.date_id }}
          buttons={[
            {
              label: "Delete this date",
              className: "btn btn--small btn--danger",
              pendingLabel: "Deleting…",
            },
          ]}
        />
      </div>
    </RecordSection>
  );
}

function NextDue({ item }: { item: DateSuggestion }) {
  if (item.next) return <>{formatDate(item.next)}</>;
  if (item.needs_agm) return <span className="table-sub">Give the AGM date above</span>;
  return <span className="table-sub">The date you type</span>;
}

function AddSuggestion({ item, today }: { item: DateSuggestion; today: string }) {
  if (item.next)
    return (
      <RowAction
        action={addSuggestedAction}
        fields={{ key: item.key }}
        buttons={[
          {
            label: "Add it",
            className: "btn btn--small",
            ariaLabel: `Add it: ${item.title}`,
            pendingLabel: "Adding…",
          },
        ]}
      />
    );
  if (item.needs_agm) return null;
  return (
    <Popover label="Add it" align="end">
      <MailForm
        action={addSuggestedAction}
        fields={{ key: item.key }}
        submitLabel="Add the date"
        pendingLabel="Adding…"
      >
        <Field id={`suggest-${item.key}`} label="Due on">
          <Input id={`suggest-${item.key}`} name="due_on" type="date" required min={today} />
        </Field>
      </MailForm>
    </Popover>
  );
}

/**
 * The suggested catalogue: rows only, until he presses "Add it". Nothing here is added or
 * alarms on its own, and every row says when its rule was checked.
 */
function Suggestions({ page }: { page: DatesPage }) {
  const checked = formatDate(page.checked_on);
  return (
    <div className="hqdata-print-hide">
      <RecordSection id="dates-suggested" title="Suggested for an Indian private company">
        <p className="page-note">
          Worked out from today
          {page.facts.agm_on ? ` and the AGM held on ${formatDate(page.facts.agm_on)}` : ""}.
          Nothing here is added, and nothing reminds you, until you press &ldquo;Add it&rdquo;. Each
          rule was checked on {checked}; rules change, so check each date with your CA. If the
          company is not incorporated yet, these apply once it is.
        </p>
        <div className="hqdata-dates__facts">
          <MailForm
            action={setFactsAction}
            submitLabel="Work the dates out"
            pendingLabel="Working…"
          >
            <Field id="dates-agm" label="AGM held on">
              <Input
                id="dates-agm"
                name="agm_on"
                type="date"
                max={page.today}
                defaultValue={page.facts.agm_on ?? ""}
              />
            </Field>
          </MailForm>
        </div>
        {page.suggestions.length === 0 ? (
          <p className="page-note">Every suggestion is in your list.</p>
        ) : (
          GROUPS.map((group) => {
            const items = page.suggestions.filter((item) => item.group === group.key);
            if (items.length === 0) return null;
            return (
              <section
                key={group.key}
                className="hqdata-dates__month"
                aria-labelledby={`suggested-${group.key}`}
              >
                <h3 className="hqdata-dates__heading" id={`suggested-${group.key}`}>
                  {group.label}
                </h3>
                <DataTable
                  caption={`Suggested dates, ${group.label}`}
                  columns={SUGGESTION_COLUMNS}
                  columnMenu={false}
                  scroll={false}
                >
                  {items.map((item) => (
                    <tr key={item.key}>
                      <td>
                        <span className="table-title">{item.title}</span>
                        <span className="table-sub">
                          {DATE_KINDS[item.kind]} · {REPEATS[item.repeats]}
                        </span>
                      </td>
                      <td>{item.rule}</td>
                      <td>
                        <span className="table-sub">Applies when: {item.applies}</span>
                      </td>
                      <td>
                        <NextDue item={item} />
                        <span className="table-sub">
                          Checked on {formatDate(item.checked_on)} · check with your CA
                        </span>
                      </td>
                      <td>
                        <div className="hqdata-dates__acts">
                          <AddSuggestion item={item} today={page.today} />
                        </div>
                      </td>
                    </tr>
                  ))}
                </DataTable>
              </section>
            );
          })
        )}
      </RecordSection>
    </div>
  );
}
