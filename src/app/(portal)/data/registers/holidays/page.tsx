import { DataUnavailable } from "@/components/data/data-down";
import { RuleLineNote } from "@/components/data/duties/rule-line";
import { RegistersTabs } from "@/components/data/registers/registers-tabs";
import { MailForm } from "@/components/mail/mail-form";
import { PageHeader } from "@/components/shell/page-header";
import { buttonClass } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { DataTable } from "@/components/ui/data-table";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Popover } from "@/components/ui/popover";
import { RecordSection } from "@/components/ui/record-shell";
import { RowAction } from "@/components/ui/row-action";
import { SegmentedLinks } from "@/components/ui/toolbar";
import { DATA_ROLE_LINE, requireData } from "@/lib/data/access";
import {
  countWorkingDays,
  readHolidays,
  type Holiday,
  type HolidaysPage,
  type WorkingDays,
} from "@/lib/data/api/holidays";
import {
  HOLIDAYS_MOON,
  HOLIDAY_KINDS,
  HOLIDAY_KIND_SHORT,
  NOT_ADVICE_DUTIES,
  WEEKDAYS,
} from "@/lib/data/labels-calendar";
import { STATES, dayWords } from "@/lib/data/labels-company";
import { dataRead, type DataRead } from "@/lib/data/read";
import { formatNumber } from "@/lib/format";
import { firstSearchValue } from "@/lib/search-params";

import {
  addHolidayAction,
  addNationalAction,
  pasteHolidaysAction,
  removeHolidayAction,
  saveSetupAction,
  updateHolidayAction,
} from "./actions";
import "./holidays.css";

export const metadata = { title: "Holidays" };
export const dynamic = "force-dynamic";

const BASE = "/data/registers/holidays";
const ABOUT = `${NOT_ADVICE_DUTIES} ${HOLIDAYS_MOON}`;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

const COLUMNS = [
  { key: "day", label: "Day" },
  { key: "weekday", label: "Weekday" },
  { key: "holiday", label: "Holiday", width: "36%" },
  { key: "kind", label: "Kind" },
  { key: "actions", label: "Change", align: "end" as const },
];

type Params = Record<string, string | string[] | undefined>;

export default async function HolidaysRegisterPage({
  searchParams,
}: {
  searchParams: Promise<Params>;
}) {
  const { allowed } = await requireData(BASE);
  const parameters = await searchParams;
  const asked = Number(firstSearchValue(parameters.year) ?? "");
  const year = Number.isInteger(asked) && asked >= 2020 && asked <= 2040 ? asked : undefined;
  const read = allowed ? await dataRead(() => readHolidays(year)) : null;
  const data = read?.ok ? read.data : null;
  const fromAsked = firstSearchValue(parameters.from) ?? "";
  const countAsked = Number(firstSearchValue(parameters.count) ?? "5");
  const from = DAY.test(fromAsked) ? fromAsked : (data?.today ?? "");
  const count =
    Number.isInteger(countAsked) && countAsked >= 0 && countAsked <= 260 ? countAsked : 5;
  const counted = data && from ? await dataRead(() => countWorkingDays(from, count)) : null;
  return (
    <>
      <PageHeader
        title="Holidays"
        description={ABOUT}
        meta={
          data ? (
            <span className="quiet">
              {formatNumber(data.holidays.length)} in {data.year}
            </span>
          ) : undefined
        }
        actions={data ? <HeaderActions page={data} /> : undefined}
      />
      <div className="page-content">
        {!allowed || !read ? (
          <Callout tone="neutral">{DATA_ROLE_LINE}</Callout>
        ) : !read.ok ? (
          <DataUnavailable failure={read} />
        ) : (
          <Holidays page={read.data} counted={counted} from={from} count={count} />
        )}
      </div>
    </>
  );
}

function HeaderActions({ page }: { page: HolidaysPage }) {
  return (
    <>
      <Popover label="Add a holiday" variant="primary" align="end" width="wide">
        <MailForm action={addHolidayAction} submitLabel="Add it" pendingLabel="Adding…">
          <HolidayFields prefix="holiday-new" holiday={null} year={page.year} />
        </MailForm>
      </Popover>
      <RowAction
        action={addNationalAction}
        fields={{ year: String(page.year) }}
        buttons={[
          {
            label: "Add the three national holidays",
            className: buttonClass({ size: "small" }),
            pendingLabel: "Adding…",
          },
        ]}
      />
      <Popover label="Paste a list" align="end" width="wide">
        <MailForm action={pasteHolidaysAction} submitLabel="Add them" pendingLabel="Adding…">
          <Field
            id="holiday-paste"
            label="One holiday a line"
            hint="The day, the name and, if you like, the kind: 2027-03-08, Holi, state. The kind is state unless you say national, company or optional. Nothing is added if a line is wrong."
          >
            <Textarea id="holiday-paste" name="text" rows={8} required maxLength={12_000} />
          </Field>
        </MailForm>
      </Popover>
      <a className={buttonClass({ size: "small" })} href={`${BASE}/export?year=${page.year}`}>
        Download (CSV)
      </a>
    </>
  );
}

function HolidayFields({
  prefix,
  holiday,
  year,
}: {
  prefix: string;
  holiday: Holiday | null;
  year: number;
}) {
  return (
    <>
      <Field id={`${prefix}-on`} label="Day">
        <Input
          id={`${prefix}-on`}
          name="on"
          type="date"
          min="2020-01-01"
          max="2040-12-31"
          required
          defaultValue={holiday?.on ?? `${year}-01-01`}
        />
      </Field>
      <Field id={`${prefix}-name`} label="Name">
        <Input
          id={`${prefix}-name`}
          name="name"
          required
          minLength={2}
          maxLength={120}
          defaultValue={holiday?.name ?? ""}
        />
      </Field>
      <Field
        id={`${prefix}-kind`}
        label="Kind"
        hint="Optional days are listed; they are not days off."
      >
        <Select id={`${prefix}-kind`} name="kind" defaultValue={holiday?.kind ?? "state"}>
          {Object.entries(HOLIDAY_KINDS).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </Select>
      </Field>
      <Field id={`${prefix}-note`} label="Note">
        <Input
          id={`${prefix}-note`}
          name="note"
          maxLength={500}
          defaultValue={holiday?.note ?? ""}
        />
      </Field>
    </>
  );
}

function Holidays({
  page,
  counted,
  from,
  count,
}: {
  page: HolidaysPage;
  counted: DataRead<WorkingDays> | null;
  from: string;
  count: number;
}) {
  return (
    <div className="hqdata-holidays">
      <RegistersTabs current="holidays" />
      <SegmentedLinks
        label="Year"
        items={page.years.map((year) => ({
          href: `${BASE}?year=${year}`,
          label: String(year),
          current: year === page.year,
        }))}
      />
      {page.checks.length > 0 && (
        <Callout tone="attention" compact>
          <ul className="hqdata-holidays__checks">
            {page.checks.map((check) => (
              <li key={check}>{check}</li>
            ))}
          </ul>
        </Callout>
      )}
      <DataTable
        caption={`Holidays in ${page.year}`}
        columns={COLUMNS}
        columnMenu={false}
        scroll={false}
        isEmpty={page.holidays.length === 0}
        empty={
          <p className="page-note hqdata-holidays__empty">
            No holidays recorded for {page.year}. Add the three national holidays, then your
            state&apos;s list as your CA confirms it. Until then working days are counted Monday to
            Friday.
          </p>
        }
      >
        {page.holidays.map((holiday) => (
          <HolidayRow key={holiday.holiday_id} holiday={holiday} year={page.year} />
        ))}
      </DataTable>
      <WorkingWeek page={page} />
      <CountDays page={page} counted={counted} from={from} count={count} />
    </div>
  );
}

function HolidayRow({ holiday, year }: { holiday: Holiday; year: number }) {
  return (
    <tr id={`holiday-${holiday.holiday_id}`}>
      <td className="nowrap">{dayWords(holiday.on)}</td>
      <td>
        {holiday.weekday}
        {holiday.on_week_off && <span className="table-sub">A weekly off day</span>}
      </td>
      <td>
        <span className="table-title">{holiday.name}</span>
        {holiday.note && <span className="table-sub table-sub--prose">{holiday.note}</span>}
      </td>
      <td>{HOLIDAY_KIND_SHORT[holiday.kind]}</td>
      <td>
        <div className="hqdata-holidays__acts">
          <Popover label="Change" align="end" width="wide">
            <MailForm
              action={updateHolidayAction}
              fields={{ holiday_id: holiday.holiday_id }}
              submitLabel="Save"
              pendingLabel="Saving…"
            >
              <HolidayFields
                prefix={`holiday-${holiday.holiday_id}`}
                holiday={holiday}
                year={year}
              />
            </MailForm>
          </Popover>
          <RowAction
            action={removeHolidayAction}
            fields={{ holiday_id: holiday.holiday_id }}
            buttons={[
              {
                label: "Remove",
                className: "btn btn--small btn--ghost",
                ariaLabel: `Remove ${holiday.name}`,
                pendingLabel: "Removing…",
              },
            ]}
          />
        </div>
      </td>
    </tr>
  );
}

function WorkingWeek({ page }: { page: HolidaysPage }) {
  const { setup } = page;
  return (
    <RecordSection id="holidays-week" title="The working week">
      <MailForm
        action={saveSetupAction}
        submitLabel="Save the working week"
        pendingLabel="Saving…"
        className="stack-form stack-form--tight hqdata-holidays__week"
      >
        <fieldset className="checkbox-group">
          <legend className="field__label">Weekly off days</legend>
          <div className="hqdata-holidays__days">
            {WEEKDAYS.map((name, index) => (
              <label key={name} className="checkbox">
                <input
                  type="checkbox"
                  name="week_off"
                  value={String(index)}
                  defaultChecked={setup.week_off.includes(index)}
                />
                <span className="checkbox__label">{name}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <Field
          id="holidays-state"
          label="State"
          hint="The state whose list you follow, as your CA confirms it."
        >
          <Select id="holidays-state" name="state" defaultValue={setup.state}>
            <option value="">Not chosen</option>
            {Object.entries(STATES).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </Select>
        </Field>
        <Field id="holidays-minimum" label="The state's minimum paid holidays">
          <Input
            id="holidays-minimum"
            name="state_minimum"
            type="number"
            min={0}
            max={30}
            step={1}
            defaultValue={setup.state_minimum ?? ""}
          />
        </Field>
        <Field id="holidays-allowance" label="Optional holidays each person may take">
          <Input
            id="holidays-allowance"
            name="optional_allowance"
            type="number"
            min={0}
            max={10}
            step={1}
            defaultValue={setup.optional_allowance ?? ""}
          />
        </Field>
      </MailForm>
      <ul className="hqdata-holidays__rules">
        <li>
          National holidays:{" "}
          {page.rules.national ? (
            <RuleLineNote line={page.rules.national} />
          ) : (
            <span className="quiet">The rule book is not loaded here.</span>
          )}
        </li>
        <li>
          The state&apos;s minimum:{" "}
          {page.rules.state ? (
            <RuleLineNote line={page.rules.state} />
          ) : (
            <span className="quiet">The rule book is not loaded here.</span>
          )}
        </li>
      </ul>
    </RecordSection>
  );
}

function CountDays({
  page,
  counted,
  from,
  count,
}: {
  page: HolidaysPage;
  counted: DataRead<WorkingDays> | null;
  from: string;
  count: number;
}) {
  return (
    <RecordSection id="holidays-count" title="Count working days">
      <form className="hqdata-holidays__count" method="get" action={BASE}>
        <input type="hidden" name="year" value={String(page.year)} />
        <Field id="holidays-from" label="From">
          <Input id="holidays-from" name="from" type="date" defaultValue={from} required />
        </Field>
        <Field id="holidays-days" label="Working days">
          <Input
            id="holidays-days"
            name="count"
            type="number"
            min={0}
            max={260}
            step={1}
            defaultValue={count}
            required
          />
        </Field>
        <button className={buttonClass({ size: "small" })} type="submit">
          Count
        </button>
      </form>
      {counted && !counted.ok ? (
        <DataUnavailable failure={counted} />
      ) : counted?.ok ? (
        <div className="hqdata-holidays__answer">
          <p data-answer="working-days">
            {formatNumber(counted.data.count)} working {counted.data.count === 1 ? "day" : "days"}{" "}
            after {dayWords(counted.data.from)} is {dayWords(counted.data.on)}.
          </p>
          {counted.data.off_between.length > 0 && (
            <p className="quiet">
              Skipped:{" "}
              {counted.data.off_between.map((day) => `${day.name}, ${dayWords(day.on)}`).join("; ")}
              .
            </p>
          )}
          {counted.data.fallback && (
            <p className="quiet">
              A year it touches has no holidays recorded, so only the weekly off days are skipped
              there.
            </p>
          )}
        </div>
      ) : null}
    </RecordSection>
  );
}
