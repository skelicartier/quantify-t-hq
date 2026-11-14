import Link from "next/link";

import { DueChip } from "@/components/crm/pills";
import { DataUnavailable } from "@/components/data/data-down";
import { DateFields, NEW_DATE } from "@/components/data/dates/date-fields";
import {
  EvidenceCell,
  EvidenceFields,
  LateLine,
  NotForUsFields,
  SignOffFields,
  type ContactChoice,
} from "@/components/data/dates/evidence";
import { ConfirmPill, RulesView, SourceLinks } from "@/components/data/dates/rules-view";
import { MailForm } from "@/components/mail/mail-form";
import { PageHeader } from "@/components/shell/page-header";
import { ButtonLink, buttonClass } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { DataTable } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input, Select } from "@/components/ui/field";
import { Popover } from "@/components/ui/popover";
import { RecordSection } from "@/components/ui/record-shell";
import { RowAction } from "@/components/ui/row-action";
import { StatusPill } from "@/components/ui/status-pill";
import { SegmentedLinks } from "@/components/ui/toolbar";
import { DATA_ROLE_LINE, requireData } from "@/lib/data/access";
import { readContacts } from "@/lib/data/api/contacts";
import {
  readDates,
  readRules,
  type DateSuggestion,
  type DatesPage,
  type KeyDate,
  type RulesPage,
} from "@/lib/data/api/dates";
import { CONTACT_ROLES, DATE_KINDS, DATE_STATES, REPEATS } from "@/lib/data/labels";
import { CONFIRM_ROLES, NOT_ADVICE, OWNER_ROLES } from "@/lib/data/labels-company";
import { dataRead, type DataRead } from "@/lib/data/read";
import { formatDate, formatNumber } from "@/lib/format";
import { firstSearchValue } from "@/lib/search-params";

import {
  addDateAction,
  addSuggestedAction,
  confirmRuleAction,
  dateOwnerAction,
  deleteDateAction,
  doneDateAction,
  inProgressAction,
  moveRuleDatesAction,
  notForUsAction,
  ruleAmountAction,
  setFactsAction,
  signOffAction,
  unconfirmRuleAction,
  updateDateAction,
} from "./actions";
import "./dates.css";

export const metadata = { title: "Key dates" };
export const dynamic = "force-dynamic";

const BASE = "/data/dates";
const ABOUT =
  "Dates you keep, and dates suggested for an Indian private company, worked out from the company record where it can. Each rule says where it comes from and when it was checked. Rules change: check every suggested date with your CA or CS before relying on it. This is a record to keep, not legal advice.";

const COLUMNS = [
  { key: "due", label: "Due" },
  { key: "what", label: "What", width: "30%" },
  { key: "who", label: "Who handles it" },
  { key: "state", label: "State" },
  { key: "evidence", label: "Evidence" },
  { key: "actions", label: "Change", align: "end" as const },
];

const SUGGESTION_COLUMNS = [
  { key: "what", label: "What", width: "26%" },
  { key: "rule", label: "Rule" },
  { key: "applies", label: "Applies when", width: "30%" },
  { key: "next", label: "Next due" },
  { key: "add", label: "Add", align: "end" as const },
];

const COMPANY_COLUMNS = [
  { key: "what", label: "What", width: "30%" },
  { key: "due", label: "Due" },
  { key: "source", label: "Source" },
  { key: "confirm", label: "Confirm" },
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

type View = "upcoming" | "all" | "done" | "rules";
const VIEWS = new Set(["upcoming", "all", "done", "rules"]);
const STATE_TONES = {
  coming_up: "neutral",
  due_this_week: "attention",
  in_progress: "attention",
  done: "live",
  not_for_us: "neutral",
  taken_back: "neutral",
} as const;

type Params = Record<string, string | string[] | undefined>;

export default async function DatesPage({ searchParams }: { searchParams: Promise<Params> }) {
  const { allowed } = await requireData(BASE);
  const parameters = await searchParams;
  const asked = firstSearchValue(parameters.view) ?? "upcoming";
  const view = (VIEWS.has(asked) ? asked : "upcoming") as View;
  const edit = firstSearchValue(parameters.edit) ?? "";
  const read = allowed ? await dataRead(() => readDates(view)) : null;
  const data = read?.ok ? read.data : null;
  const rules = data && view === "rules" ? await dataRead(readRules) : null;
  const contacts = data && view !== "rules" ? await dataRead(() => readContacts({})) : null;
  const choices: ContactChoice[] | null =
    contacts?.ok === true
      ? contacts.data.contacts
          .filter(
            (contact) =>
              !contact.archived &&
              (contact.role === "ca" || contact.role === "cs" || contact.role === "lawyer"),
          )
          .map((contact) => ({
            contact_id: contact.contact_id,
            label: `${contact.name} · ${CONTACT_ROLES[contact.role]}`,
          }))
      : null;
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
          <Dates page={read.data} edit={edit} rules={rules} contacts={choices} />
        )}
      </div>
    </>
  );
}

function ViewTabs({ page }: { page: DatesPage }) {
  return (
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
        { href: `${BASE}?view=rules`, label: "Rules", current: page.view === "rules" },
      ]}
    />
  );
}

function Dates({
  page,
  edit,
  rules,
  contacts,
}: {
  page: DatesPage;
  edit: string;
  rules: DataRead<RulesPage> | null;
  contacts: readonly ContactChoice[] | null;
}) {
  if (page.view === "rules")
    return (
      <div className="hqdata-dates">
        <ViewTabs page={page} />
        {!rules ? null : !rules.ok ? (
          <DataUnavailable failure={rules} />
        ) : (
          <RulesView
            rules={rules.data.rules}
            today={page.today}
            actions={{
              amount: ruleAmountAction,
              confirm: confirmRuleAction,
              unconfirm: unconfirmRuleAction,
              move: moveRuleDatesAction,
            }}
          />
        )}
        <p className="page-note">{NOT_ADVICE}</p>
      </div>
    );
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
      <ViewTabs page={page} />
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
                <DateRow key={date.date_id} date={date} page={page} contacts={contacts} />
              ))}
            </DataTable>
          </section>
        ))
      )}
      <Suggestions page={page} />
      <p className="page-note">{NOT_ADVICE}</p>
    </div>
  );
}

function WhatCell({ date }: { date: KeyDate }) {
  const sources = date.statutory && date.rule ? date.rule.sources : [];
  return (
    <td>
      <span className="table-title">{date.title}</span>
      <span className="table-sub">
        {DATE_KINDS[date.kind]} · {date.entity}
      </span>
      {date.origin && (
        <span className="table-sub">
          From:{" "}
          <Link className="text-link" href={date.origin.href}>
            {date.origin.label}
          </Link>
        </span>
      )}
      {sources.length > 0 && (
        <span className="table-sub">
          <SourceLinks sources={sources} checked={null} />
        </span>
      )}
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
  );
}

function StateCell({ date }: { date: KeyDate }) {
  const last = date.history[date.history.length - 1];
  return (
    <td className="hqdata-dates__state">
      <span className="hqdata-dates__pills">
        <StatusPill
          value={date.shown_state}
          label={DATE_STATES[date.shown_state]}
          tone={STATE_TONES[date.shown_state]}
        />
        {date.overdue && <StatusPill value="overdue" label="Overdue" tone="danger" />}
      </span>
      <LateLine late={date.late} done={date.state === "done"} />
      {last && <span className="table-sub">Last done {formatDate(last.done_at)}</span>}
      {date.sign_off && (
        <span className="table-sub">
          Signed off by {date.sign_off.name} ({CONFIRM_ROLES[date.sign_off.role]}),{" "}
          {formatDate(date.sign_off.on)}
        </span>
      )}
      {date.state_note && (
        <span className="table-sub table-sub--prose" title={date.state_note}>
          {date.state_note}
        </span>
      )}
    </td>
  );
}

function DateRow({
  date,
  page,
  contacts,
}: {
  date: KeyDate;
  page: DatesPage;
  contacts: readonly ContactChoice[] | null;
}) {
  const fields = { date_id: date.date_id };
  const open = date.state === "coming_up" || date.state === "in_progress";
  const id = date.date_id.slice(0, 12);
  return (
    <tr id={`date-${date.date_id}`}>
      <td className="nowrap">
        {open ? <DueChip due={date.due_on} today={page.today} /> : formatDate(date.due_on)}
        {date.repeats !== "never" && <span className="table-sub">{REPEATS[date.repeats]}</span>}
      </td>
      <WhatCell date={date} />
      <td>
        {date.handled_by || <span className="table-sub">Not given</span>}
        {date.owner_role && <span className="table-sub">{OWNER_ROLES[date.owner_role]}</span>}
      </td>
      <StateCell date={date} />
      <td>
        <EvidenceCell date={date} />
      </td>
      <td>
        <div className="hqdata-dates__acts">
          {open && (
            <>
              <Popover label="Done" align="end" width="wide">
                <MailForm
                  action={doneDateAction}
                  fields={fields}
                  submitLabel="Mark it done"
                  pendingLabel="Saving…"
                >
                  <EvidenceFields
                    prefix={`done-${id}`}
                    today={page.today}
                    files={page.files}
                    filesHere={page.files_here}
                  />
                  {date.repeats !== "never" && (
                    <p className="field__hint">It then moves to its next due date.</p>
                  )}
                </MailForm>
              </Popover>
              {date.state === "coming_up" ? (
                <RowAction
                  action={inProgressAction}
                  fields={fields}
                  buttons={[
                    {
                      label: "In progress",
                      className: "btn btn--small",
                      ariaLabel: `In progress: ${date.title}`,
                      pendingLabel: "Saving…",
                    },
                  ]}
                />
              ) : (
                <RowAction
                  action={updateDateAction}
                  fields={{ ...fields, state: "coming_up" }}
                  buttons={[
                    {
                      label: "Back to coming up",
                      className: "btn btn--small",
                      ariaLabel: `Back to coming up: ${date.title}`,
                      pendingLabel: "Saving…",
                    },
                  ]}
                />
              )}
              <Popover label="Who files it" align="end">
                <MailForm
                  action={dateOwnerAction}
                  fields={fields}
                  submitLabel="Save"
                  pendingLabel="Saving…"
                >
                  <Field id={`owner-who-${id}`} label="Who handles it">
                    <Input
                      id={`owner-who-${id}`}
                      name="handled_by"
                      maxLength={120}
                      defaultValue={date.handled_by}
                    />
                  </Field>
                  <Field id={`owner-role-${id}`} label="Their role">
                    <Select
                      id={`owner-role-${id}`}
                      name="owner_role"
                      defaultValue={date.owner_role}
                    >
                      {Object.entries(OWNER_ROLES).map(([key, label]) => (
                        <option key={key || "unset"} value={key}>
                          {label}
                        </option>
                      ))}
                    </Select>
                  </Field>
                </MailForm>
              </Popover>
              <Popover label="Not for us" align="end" width="wide">
                <MailForm
                  action={notForUsAction}
                  fields={fields}
                  submitLabel="Mark it not for us"
                  pendingLabel="Saving…"
                >
                  <NotForUsFields
                    prefix={`nope-${id}`}
                    statutory={date.statutory}
                    today={page.today}
                    contacts={contacts}
                  />
                </MailForm>
              </Popover>
            </>
          )}
          {(date.state === "done" || date.state === "not_for_us") && (
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
          {date.state === "not_for_us" && date.statutory && !date.sign_off && (
            <Popover label="Record the sign-off" align="end" width="wide">
              <MailForm
                action={signOffAction}
                fields={fields}
                submitLabel="Record it"
                pendingLabel="Recording…"
              >
                <SignOffFields prefix={`signoff-${id}`} today={page.today} contacts={contacts} />
              </MailForm>
            </Popover>
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
  if (item.needs) return <span className="table-sub">{item.needs}</span>;
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
  if (item.needs_agm || item.group === "company") return null;
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

/** "Checked on 10 Nov 2026 · check with your CA", or who confirmed it. */
function CheckedLine({ item }: { item: DateSuggestion }) {
  if (!item.confirm_with)
    return <span className="table-sub">Checked on {formatDate(item.verified_on)}</span>;
  if (item.confirmed)
    return (
      <span className="table-sub">
        Checked on {formatDate(item.verified_on)} · confirmed by {item.confirmed.name}
      </span>
    );
  return (
    <span className="table-sub">
      Checked on {formatDate(item.verified_on)} · check with your{" "}
      {item.confirm_with === "lawyer" ? "lawyer" : item.confirm_with}
    </span>
  );
}

/** Part 1: the rows worked out from the company record's facts, each with its source. */
function FromTheRecord({ items, today }: { items: DateSuggestion[]; today: string }) {
  return (
    <section className="hqdata-dates__month" aria-labelledby="suggested-company">
      <h3 className="hqdata-dates__heading" id="suggested-company">
        Worked out from the company record
      </h3>
      <DataTable
        caption="Suggested dates, worked out from the company record"
        columns={COMPANY_COLUMNS}
        columnMenu={false}
        scroll={false}
      >
        {items.map((item) => (
          <tr key={item.key} id={`suggested-${item.key}`}>
            <td>
              <span className="table-title">{item.title}</span>
              <span className="table-sub">{item.rule}</span>
              {item.from_fact && <span className="table-sub">{item.from_fact}</span>}
              {item.earliest && (
                <span className="table-sub">Not before {formatDate(item.earliest)}</span>
              )}
            </td>
            <td className="nowrap">
              {item.next ? `Due ${formatDate(item.next)}` : <NextDue item={item} />}
            </td>
            <td>
              {item.sources.length > 0 ? (
                <SourceLinks sources={item.sources} checked={item.verified_on} />
              ) : (
                <span className="table-sub">The day you recorded</span>
              )}
            </td>
            <td>
              <ConfirmPill confirmed={item.confirmed} confirmWith={item.confirm_with} />
            </td>
            <td>
              <div className="hqdata-dates__acts">
                <AddSuggestion item={item} today={today} />
              </div>
            </td>
          </tr>
        ))}
      </DataTable>
    </section>
  );
}

/**
 * The suggestions: rows only, until he presses "Add it". Nothing here is added or alarms on
 * its own, and every row says where its rule comes from and when it was checked.
 */
function Suggestions({ page }: { page: DatesPage }) {
  const fromRecord = page.suggestions.filter((item) => item.group === "company");
  const rest = page.suggestions.filter((item) => item.group !== "company");
  return (
    <div className="hqdata-print-hide">
      <RecordSection id="dates-suggested" title="Suggested for an Indian private company">
        {!page.facts_known && (
          <p className="page-note">
            <Link className="text-link" href="/data/company">
              Fill in the company&rsquo;s facts to work out the first AGM and the dates after it.
            </Link>
          </p>
        )}
        <p className="page-note">
          Worked out from today
          {page.facts.agm_on ? ` and the AGM held on ${formatDate(page.facts.agm_on)}` : ""}
          {page.facts_known ? " and the company record" : ""}. Nothing here is added, and nothing
          reminds you, until you press &ldquo;Add it&rdquo;. Each rule says where it comes from and
          when it was checked; rules change, so check each date with your CA or CS. If the company
          is not incorporated yet, these apply once it is.
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
        {fromRecord.length > 0 && <FromTheRecord items={fromRecord} today={page.today} />}
        {rest.length === 0 && fromRecord.length === 0 ? (
          <p className="page-note">Every suggestion is in your list.</p>
        ) : (
          GROUPS.map((group) => {
            const items = rest.filter((item) => item.group === group.key);
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
                    <tr key={item.key} id={`suggested-${item.key}`}>
                      <td>
                        <span className="table-title">{item.title}</span>
                        <span className="table-sub">
                          {DATE_KINDS[item.kind]} · {REPEATS[item.repeats]}
                        </span>
                      </td>
                      <td>
                        {item.rule}
                        {item.sources.length > 0 && (
                          <span className="table-sub">
                            <SourceLinks sources={item.sources} checked={null} />
                          </span>
                        )}
                      </td>
                      <td>
                        <span className="table-sub">Applies when: {item.applies}</span>
                      </td>
                      <td>
                        <NextDue item={item} />
                        <CheckedLine item={item} />
                        {item.confirmed && (
                          <ConfirmPill confirmed={item.confirmed} confirmWith={item.confirm_with} />
                        )}
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
        {page.hidden.length > 0 && (
          <details className="hqdata-dates__hidden">
            <summary>
              Not shown, from the company record ({formatNumber(page.hidden.length)})
            </summary>
            <ul>
              {page.hidden.map((item) => (
                <li key={item.key}>
                  {item.title}: {item.why}
                </li>
              ))}
            </ul>
          </details>
        )}
      </RecordSection>
    </div>
  );
}
