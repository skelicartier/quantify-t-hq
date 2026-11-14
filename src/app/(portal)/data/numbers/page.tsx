import Link from "next/link";

import { DataUnavailable } from "@/components/data/data-down";
import { NumbersTable } from "@/components/data/numbers/numbers-table";
import { ReminderForm } from "@/components/data/numbers/reminder-form";
import { MailForm } from "@/components/mail/mail-form";
import { PageHeader } from "@/components/shell/page-header";
import { ButtonLink } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { DataTable } from "@/components/ui/data-table";
import { Checkbox, Field, Input, Select } from "@/components/ui/field";
import { Popover } from "@/components/ui/popover";
import { RecordSection } from "@/components/ui/record-shell";
import { Stat, StatGrid } from "@/components/ui/stat";
import { StatusPill } from "@/components/ui/status-pill";
import { Timestamp } from "@/components/ui/timestamp";
import { DATA_ROLE_LINE, requireData } from "@/lib/data/access";
import { readDates } from "@/lib/data/api/dates";
import { readNumbers, type NumbersPage } from "@/lib/data/api/numbers";
import { AMOUNT_STATES, UPDATE_STATUSES, labelOf, toneOf } from "@/lib/data/labels";
import { dataRead, isDataError } from "@/lib/data/read";
import { formatDate, formatMoney, formatNumber } from "@/lib/format";
import { requestNow } from "@/lib/request-time";

import { addUpdateDateAction, saveBuyerTypesAction, saveMoneyAction } from "./actions";
import "./numbers.css";

export const metadata = { title: "Numbers" };
export const dynamic = "force-dynamic";

const ABOUT =
  "Counted from Data's own records each time you open it: replies, the waitlist and the investors. Cash and burn are what you type, with the day they are true on; figures older than 35 days are not used. There are no targets here.";

const CASH_COLUMNS = [
  { key: "currency", label: "Currency" },
  { key: "cash", label: "Cash", align: "end" as const },
  { key: "on", label: "True on" },
  { key: "burn", label: "Monthly burn", align: "end" as const },
  { key: "runway", label: "Runway" },
  { key: "state", label: "State" },
];
const ENTRY_COLUMNS = [
  { key: "on", label: "True on" },
  { key: "currency", label: "Currency" },
  { key: "cash", label: "Cash", align: "end" as const },
  { key: "burn", label: "Burn", align: "end" as const },
  { key: "note", label: "Note", width: "30%" },
  { key: "by", label: "Typed by" },
];
const UPDATE_COLUMNS = [
  { key: "month", label: "Month" },
  { key: "state", label: "State" },
  { key: "people", label: "People", align: "end" as const },
  { key: "changed", label: "Changed" },
];

/** "8.0": a runway as it is written, rounded down by the service already. */
const runwayWords = (months: number) => (Math.round(months * 10) / 10).toFixed(1);

/** Whether the monthly reminder still needs adding: none set, or it is gone from Key dates. */
async function reminderWanted(updateDateId: string | null): Promise<boolean> {
  try {
    const dates = await readDates("all");
    return updateDateId === null || !dates.dates.some((date) => date.date_id === updateDateId);
  } catch (error) {
    if (isDataError(error)) return false;
    throw error;
  }
}

export default async function NumbersRoute() {
  const { allowed } = await requireData("/data/numbers");
  const now = requestNow();
  const read = allowed
    ? await dataRead(async () => {
        const page = await readNumbers();
        return { page, reminder: await reminderWanted(page.update_date_id) };
      })
    : null;
  const data = read?.ok ? read.data.page : null;
  return (
    <>
      <PageHeader
        title="Numbers"
        description={ABOUT}
        actions={
          data ? (
            <>
              <ButtonLink
                href={`/data/numbers/updates/${data.today.slice(0, 7)}`}
                variant="primary"
                size="small"
              >
                Write this month&rsquo;s update
              </ButtonLink>
              <Popover label="Type cash and burn" width="wide">
                <MoneyForm today={data.today} />
              </Popover>
              <Popover label="Buyer firm types" width="wide">
                <BuyerTypesForm page={data} />
              </Popover>
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
          <Numbers page={read.data.page} reminder={read.data.reminder} now={now} />
        )}
      </div>
    </>
  );
}

function MoneyForm({ today }: { today: string }) {
  return (
    <MailForm action={saveMoneyAction} submitLabel="Save" pendingLabel="Saving…">
      <Field id="money-currency" label="Currency">
        <Select id="money-currency" name="currency" defaultValue="INR">
          <option value="INR">INR</option>
          <option value="USD">USD</option>
        </Select>
      </Field>
      <Field id="money-cash" label="Cash in the bank">
        <Input
          id="money-cash"
          name="cash"
          inputMode="decimal"
          required
          maxLength={24}
          placeholder="1200000"
          autoComplete="off"
        />
      </Field>
      <Field id="money-burn" label="Monthly burn">
        <Input
          id="money-burn"
          name="burn_per_month"
          inputMode="decimal"
          required
          maxLength={24}
          placeholder="150000"
          autoComplete="off"
        />
      </Field>
      <Field id="money-on" label="True on">
        <Input id="money-on" name="as_of" type="date" defaultValue={today} max={today} required />
      </Field>
      <Field id="money-note" label="Note">
        <Input id="money-note" name="note" maxLength={500} autoComplete="off" />
      </Field>
    </MailForm>
  );
}

function BuyerTypesForm({ page }: { page: NumbersPage }) {
  const chosen = new Set(page.buyer_types.map((type) => type.toLowerCase()));
  return (
    <MailForm action={saveBuyerTypesAction} submitLabel="Save" pendingLabel="Saving…">
      <fieldset className="hqdata-numbers__types">
        <legend>Buyer firm types</legend>
        <p className="page-note">A named buyer firm has its own domain and one of these types.</p>
        {page.firm_types.length === 0 ? (
          <p className="page-note">No firm on the waitlist has a type yet.</p>
        ) : (
          page.firm_types.map((type, index) => (
            <Checkbox
              key={type}
              id={`buyer-type-${index}`}
              name="buyer_type"
              value={type}
              label={type}
              defaultChecked={chosen.has(type.toLowerCase())}
            />
          ))
        )}
      </fieldset>
      <Field id="buyer-type-another" label="Another type">
        <Input id="buyer-type-another" name="another" maxLength={80} autoComplete="off" />
      </Field>
    </MailForm>
  );
}

function Numbers({ page, reminder, now }: { page: NumbersPage; reminder: boolean; now: number }) {
  const last = (values: number[] | undefined) => values?.at(-1) ?? 0;
  const thisWeek = {
    yeses: last(page.weekly.yeses),
    joined: last(page.weekly.firms_joined),
    named: last(page.weekly.named_buyers),
    held: last(page.weekly.calls_held),
    booked: last(page.weekly.calls_booked),
    meetings: page.weekly.first_investor_meetings
      ? last(page.weekly.first_investor_meetings)
      : null,
  };
  return (
    <div className="hqdata-numbers">
      <StatGrid label="This week" columns={4}>
        <Stat label="People who said yes" value={formatNumber(thisWeek.yeses)} />
        <Stat
          label="Firms joined"
          value={formatNumber(thisWeek.joined)}
          hint={`${formatNumber(thisWeek.named)} named buyer ${thisWeek.named === 1 ? "firm" : "firms"}`}
        />
        <Stat
          label="Calls held"
          value={formatNumber(thisWeek.held)}
          hint={`${formatNumber(thisWeek.booked)} booked`}
        />
        {thisWeek.meetings !== null && (
          <Stat label="First investor meetings" value={formatNumber(thisWeek.meetings)} />
        )}
      </StatGrid>

      <RecordSection id="numbers-weeks" title="Six weeks">
        <NumbersTable
          caption="Six weeks"
          periods={page.weeks}
          counts={page.weekly}
          namedOf={page.named_of.weekly}
        />
      </RecordSection>

      <RecordSection id="numbers-months" title="Twelve months">
        <NumbersTable
          caption="Twelve months"
          periods={page.months}
          counts={page.monthly}
          namedOf={page.named_of.monthly}
          minWidth={1180}
        />
      </RecordSection>

      <RecordSection id="numbers-pilots" title="Pilots">
        <p className="hqdata-numbers__line">
          Pilots signed {formatNumber(page.pilots.signed)} · Calls held without a pilot{" "}
          {formatNumber(page.pilots.calls_held_no_pilot)}
        </p>
        <p className="page-note">
          Signed means a waitlist firm at Pilot or Customer; the rest have had a call and nothing is
          signed.
        </p>
      </RecordSection>

      <RecordSection id="numbers-raise" title="The raise">
        <Raise page={page} />
      </RecordSection>

      <RecordSection id="numbers-cash" title="Cash and runway">
        <Cash page={page} now={now} />
      </RecordSection>

      <RecordSection id="numbers-updates" title="Monthly updates">
        <DataTable
          caption="Monthly updates"
          columns={UPDATE_COLUMNS}
          columnMenu={false}
          isEmpty={page.updates.length === 0}
          empty={<p className="page-note">No update written yet.</p>}
        >
          {page.updates.map((update) => (
            <tr key={update.period}>
              <td>
                <Link className="table-title" href={`/data/numbers/updates/${update.period}`}>
                  {update.label}
                </Link>
              </td>
              <td>
                <StatusPill
                  value={update.status}
                  label={labelOf(UPDATE_STATUSES, update.status)}
                  tone={toneOf(UPDATE_STATUSES, update.status)}
                />
              </td>
              <td className="data-table__num">
                {update.people === null ? (
                  <span className="table-sub">Not handed over</span>
                ) : (
                  formatNumber(update.people)
                )}
              </td>
              <td>
                <Timestamp value={update.updated_at} now={now} mode="relative" />
              </td>
            </tr>
          ))}
        </DataTable>
        <ReminderForm action={addUpdateDateAction} wanted={reminder} />
      </RecordSection>
    </div>
  );
}

function Raise({ page }: { page: NumbersPage }) {
  const raise = page.raise;
  if (!raise) return <p className="page-note">The investor list is not set up here yet.</p>;
  const currencies = Object.keys(raise.money).sort((a, b) => a.localeCompare(b));
  const states = Object.keys(AMOUNT_STATES) as (keyof typeof AMOUNT_STATES)[];
  return (
    <>
      <p className="hqdata-numbers__line">
        Firms {formatNumber(raise.firms)} · Written to {formatNumber(raise.written)} · Replied{" "}
        {formatNumber(raise.replied)} · Meeting booked {formatNumber(raise.meeting)} · Met{" "}
        {formatNumber(raise.met)} · Soft commit {formatNumber(raise.soft)} · Signed{" "}
        {formatNumber(raise.signed)} · Money in {formatNumber(raise.money_in)} ·{" "}
        {raise.days_since_first_send === null
          ? "Nothing sent yet"
          : `${formatNumber(raise.days_since_first_send)} ${raise.days_since_first_send === 1 ? "day" : "days"} since the first send`}
      </p>
      <DataTable
        caption="Raise amounts by state"
        columns={[
          { key: "state", label: "State" },
          ...currencies.map((currency) => ({
            key: currency,
            label: currency,
            align: "end" as const,
          })),
        ]}
        columnMenu={false}
        isEmpty={currencies.length === 0}
        empty={<p className="page-note">No amounts recorded yet.</p>}
      >
        {states.map((state) => (
          <tr key={state}>
            <th scope="row" className="hqdata-numbers__row">
              {AMOUNT_STATES[state]}
            </th>
            {currencies.map((currency) => {
              const cell = raise.money[currency]?.[state];
              return (
                <td key={currency} className="data-table__num">
                  {cell
                    ? `${formatMoney(cell.amount, currency)} · ${formatNumber(cell.firms)} ${cell.firms === 1 ? "firm" : "firms"}`
                    : "None"}
                </td>
              );
            })}
          </tr>
        ))}
      </DataTable>
      <p className="page-note">
        Written to, Replied, Meeting booked and Met count the firms that reached them; Soft commit,
        Signed and Money in count the firms there now. Each firm&rsquo;s newest amount, in its own
        currency: currencies are never added together.{" "}
        <Link className="text-link" href="/data/investors?view=funnel">
          Open the funnel
        </Link>
      </p>
    </>
  );
}

function Cash({ page, now }: { page: NumbersPage; now: number }) {
  const { rows, entries } = page.money;
  if (rows.length === 0)
    return (
      <p className="page-note">
        No cash or burn typed yet. Type them with the day they are true on.
      </p>
    );
  return (
    <>
      <DataTable caption="Cash and runway" columns={CASH_COLUMNS} columnMenu={false}>
        {rows.map((row) => (
          <tr key={row.currency}>
            <td>{row.currency}</td>
            <td className="data-table__num">{formatMoney(row.entry.cash, row.currency)}</td>
            <td>{formatDate(row.entry.as_of)}</td>
            <td className="data-table__num">
              {formatMoney(row.entry.burn_per_month, row.currency)}
            </td>
            <td>
              {row.runway_months === null
                ? "Not worked out: too old to use"
                : `${formatMoney(row.entry.cash, row.currency)} ÷ ${formatMoney(row.entry.burn_per_month, row.currency)} = ${runwayWords(row.runway_months)} months`}
            </td>
            <td>
              {row.used
                ? "Used"
                : `Not used: ${formatNumber(row.age_days)} ${row.age_days === 1 ? "day" : "days"} old`}
            </td>
          </tr>
        ))}
      </DataTable>
      <p className="page-note">
        Runway is the cash divided by the monthly burn, rounded down to one decimal, in each
        currency on its own.
      </p>
      <DataTable caption="Cash entries" columns={ENTRY_COLUMNS} columnMenu={false}>
        {entries.map((entry) => (
          <tr key={entry.entry_id}>
            <td>{formatDate(entry.as_of)}</td>
            <td>{entry.currency}</td>
            <td className="data-table__num">{formatMoney(entry.cash, entry.currency)}</td>
            <td className="data-table__num">{formatMoney(entry.burn_per_month, entry.currency)}</td>
            <td>{entry.note || <span className="table-sub">None</span>}</td>
            <td>
              {entry.recorded_by.name}
              <span className="table-sub">
                <Timestamp value={entry.recorded_at} now={now} mode="relative" />
              </span>
            </td>
          </tr>
        ))}
      </DataTable>
    </>
  );
}
