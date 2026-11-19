import Link from "next/link";

import { DataUnavailable } from "@/components/data/data-down";
import { RuleLineNote } from "@/components/data/duties/rule-line";
import { NumbersTabs } from "@/components/data/numbers/numbers-tabs";
import { MailForm } from "@/components/mail/mail-form";
import { PageHeader } from "@/components/shell/page-header";
import { buttonClass } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { DataTable } from "@/components/ui/data-table";
import { Checkbox, Field, Input, Select } from "@/components/ui/field";
import { Popover } from "@/components/ui/popover";
import { RecordSection } from "@/components/ui/record-shell";
import { RowAction } from "@/components/ui/row-action";
import { DATA_ROLE_LINE, requireData } from "@/lib/data/access";
import { readCash, type CashPage, type CashTable } from "@/lib/data/api/cash";
import {
  CASH_ABOUT,
  CASH_LEFT_OUT,
  CASH_NEEDS_RUPEES,
  CASH_NO_OPENING,
  CASH_ROWS,
  NOT_ADVICE_DUTIES,
} from "@/lib/data/labels-calendar";
import { dayWords } from "@/lib/data/labels-company";
import { DUTY_CURRENCIES, minorInput, minorWords, periodWords } from "@/lib/data/labels-duties";
import { dataRead } from "@/lib/data/read";

import {
  addCashEventAction,
  addCashLineAction,
  removeCashEventAction,
  saveCashSetupAction,
  withdrawCashLineAction,
} from "./actions";
import "./cash.css";

export const metadata = { title: "Cash view" };
export const dynamic = "force-dynamic";

const BASE = "/data/numbers/cash";
const ABOUT = `${CASH_ABOUT} ${NOT_ADVICE_DUTIES}`;

export default async function CashViewPage() {
  const { allowed, context } = await requireData(BASE);
  // The people ledger's figures come in only for the Owner: the flag is the role, nothing else.
  const owner = context.me.role === "owner";
  const read = allowed ? await dataRead(() => readCash(owner)) : null;
  const data = read?.ok ? read.data : null;
  return (
    <>
      <PageHeader
        title="Cash view"
        description={ABOUT}
        actions={
          data ? (
            <>
              <Popover label="Add expected money" variant="primary" align="end" width="wide">
                <LineForm kind="expected_in" today={data.today} />
              </Popover>
              <Popover label="Add other money out" align="end" width="wide">
                <LineForm kind="other_out" today={data.today} />
              </Popover>
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
          <CashView page={read.data} />
        )}
      </div>
    </>
  );
}

function LineForm({ kind, today }: { kind: "expected_in" | "other_out"; today: string }) {
  const prefix = `cash-${kind}`;
  return (
    <MailForm
      action={addCashLineAction}
      fields={{ kind }}
      submitLabel="Add it"
      pendingLabel="Adding…"
    >
      <Field id={`${prefix}-name`} label={kind === "expected_in" ? "From whom" : "What for"}>
        <Input id={`${prefix}-name`} name="name" required minLength={2} maxLength={120} />
      </Field>
      <Field id={`${prefix}-on`} label="Day">
        <Input id={`${prefix}-on`} name="on" type="date" required defaultValue={today} />
      </Field>
      <Field id={`${prefix}-amount`} label="Amount" hint="Such as 1180.50.">
        <Input id={`${prefix}-amount`} name="amount" inputMode="decimal" required maxLength={24} />
      </Field>
      <Field id={`${prefix}-currency`} label="Currency">
        <Select id={`${prefix}-currency`} name="currency" defaultValue="INR">
          {DUTY_CURRENCIES.map((currency) => (
            <option key={currency} value={currency}>
              {currency}
            </option>
          ))}
        </Select>
      </Field>
      {kind === "expected_in" && (
        <>
          <Checkbox id={`${prefix}-unsure`} name="not_sure" label="Not sure yet" />
          <Field
            id={`${prefix}-counted`}
            label="Count a not-sure line at, per cent"
            hint="A whole number from 0 to 100; 20 unless you say."
          >
            <Input
              id={`${prefix}-counted`}
              name="counted_at"
              type="number"
              min={0}
              max={100}
              step={1}
              placeholder="20"
            />
          </Field>
        </>
      )}
    </MailForm>
  );
}

function openingWords(table: CashTable): string {
  const opening = table.opening;
  if (!opening) return CASH_NO_OPENING;
  const figure = minorWords(opening.minor, table.currency);
  return opening.source === "statements"
    ? `Opening cash is the statements' ${figure} as of ${dayWords(opening.as_of)}.`
    : `Opening cash is the ${figure} you typed for ${dayWords(opening.as_of)}.`;
}

function CashView({ page }: { page: CashPage }) {
  return (
    <div className="hqdata-cash">
      <NumbersTabs current="cash" />
      <Weeks page={page} />
      <Items page={page} />
      <Scenarios page={page} />
      <Tiles page={page} />
    </div>
  );
}

function Weeks({ page }: { page: CashPage }) {
  return (
    <RecordSection id="cash-weeks" title="The next 13 weeks">
      {page.stipends_left_out && <p className="page-note">{CASH_LEFT_OUT}</p>}
      {!page.stipends_left_out && !page.here.people && (
        <p className="page-note">The people ledger is not loaded here.</p>
      )}
      {!page.here.money && (
        <p className="page-note">Money is not loaded here, so no bills are counted.</p>
      )}
      {page.tables.map((table) => (
        <WeekTable key={table.currency} page={page} table={table} />
      ))}
      <Popover label="Type an opening figure" align="start" width="wide">
        <MailForm action={saveCashSetupAction} submitLabel="Save" pendingLabel="Saving…">
          <p className="field__hint">
            Used only while no statement gives a figure for the currency. Leave the amount empty to
            remove it.
          </p>
          <Field id="cash-opening-currency" label="Currency">
            <Select id="cash-opening-currency" name="opening_currency" defaultValue="INR">
              {DUTY_CURRENCIES.map((currency) => (
                <option key={currency} value={currency}>
                  {currency}
                </option>
              ))}
            </Select>
          </Field>
          <Field id="cash-opening-amount" label="Cash in the bank">
            <Input
              id="cash-opening-amount"
              name="opening_amount"
              inputMode="decimal"
              maxLength={24}
              defaultValue={
                page.typed.opening.INR ? minorInput(page.typed.opening.INR.amount_minor) : ""
              }
            />
          </Field>
          <Field id="cash-opening-on" label="True on">
            <Input
              id="cash-opening-on"
              name="opening_as_of"
              type="date"
              max={page.today}
              defaultValue={page.typed.opening.INR?.as_of ?? page.today}
            />
          </Field>
        </MailForm>
      </Popover>
    </RecordSection>
  );
}

function WeekTable({ page, table }: { page: CashPage; table: CashTable }) {
  const has = (key: string) => table.rows.some((row) => row.key === key);
  const of = (key: string, week: number) =>
    table.rows.find((row) => row.key === key)?.by_week[week] ?? 0;
  const money = (minor: number) => (minor === 0 ? "—" : minorWords(minor, table.currency));
  const columns = [
    { key: "week", label: "Week" },
    { key: "bills", label: CASH_ROWS.bills, align: "end" as const },
    ...(has("stipends")
      ? [{ key: "stipends", label: CASH_ROWS.stipends, align: "end" as const }]
      : []),
    { key: "other_out", label: CASH_ROWS.other_out, align: "end" as const },
    { key: "expected_in", label: CASH_ROWS.expected_in, align: "end" as const },
    { key: "closing", label: "Closing cash", align: "end" as const },
  ];
  return (
    <div className="hqdata-cash__table" data-currency={table.currency}>
      <p className="hqdata-cash__opening">{openingWords(table)}</p>
      <DataTable
        caption={`The next 13 weeks, ${table.currency}`}
        columns={columns}
        columnMenu={false}
      >
        {page.weeks.map((week) => (
          <tr key={week.n} data-week={week.n}>
            <td className="nowrap">{week.label}</td>
            <td className="data-table__num">{money(of("bills", week.n))}</td>
            {has("stipends") && (
              <td className="data-table__num">{money(of("stipends", week.n))}</td>
            )}
            <td className="data-table__num">{money(of("other_out", week.n))}</td>
            <td className="data-table__num">{money(of("expected_in", week.n))}</td>
            <td className="data-table__num hqdata-cash__closing">
              {table.closing[week.n] === undefined
                ? "—"
                : minorWords(table.closing[week.n]!, table.currency)}
            </td>
          </tr>
        ))}
      </DataTable>
    </div>
  );
}

function Items({ page }: { page: CashPage }) {
  const items = page.tables.flatMap((table) =>
    table.items.map((item) => ({ ...item, currency: table.currency })),
  );
  const lines = new Map(page.lines.map((line) => [line.line_id, line]));
  const weekLabel = (n: number) => page.weeks.find((week) => week.n === n)?.label ?? "";
  return (
    <RecordSection id="cash-items" title="What is in it">
      {items.length === 0 ? (
        <p className="page-note">
          Nothing dated yet. Bills come from Money; stipends from the people ledger; the rest is
          what you add here.
        </p>
      ) : (
        <ul className="hqdata-cash__items">
          {items.map((item) => {
            const lineId = item.key.split(":")[1] ?? "";
            const line =
              item.key.startsWith("in:") || item.key.startsWith("out:")
                ? lines.get(lineId)
                : undefined;
            const amount = minorWords(item.minor, item.currency);
            const words =
              line && line.kind === "expected_in" && !line.sure
                ? `${amount} expected, not sure: counted at ${line.counted_at} per cent, ${minorWords(item.counted_minor, item.currency)}.`
                : `${amount}.`;
            return (
              <li key={item.key} data-key={item.key}>
                <span className="hqdata-cash__item-week">{weekLabel(item.week)}</span>{" "}
                {item.href ? (
                  <Link className="text-link" href={item.href}>
                    {item.name}
                  </Link>
                ) : (
                  <span>{item.name}</span>
                )}
                , {dayWords(item.on)}: {words}
                {line && (
                  <RowAction
                    action={withdrawCashLineAction}
                    fields={{ line_id: line.line_id }}
                    className="hqdata-cash__act"
                    buttons={[
                      {
                        label: "Withdraw",
                        className: "btn btn--small btn--ghost",
                        ariaLabel: `Withdraw ${line.name}`,
                        pendingLabel: "Withdrawing…",
                      },
                    ]}
                  />
                )}
              </li>
            );
          })}
        </ul>
      )}
    </RecordSection>
  );
}

function Scenarios({ page }: { page: CashPage }) {
  const at = (months: { closing_minor: number }[], index: number) =>
    months[index] ? minorWords(months[index].closing_minor, "INR") : "—";
  const { assumptions } = page;
  return (
    <RecordSection
      id="cash-scenarios"
      title="Scenarios"
      actions={
        <>
          <Popover label="Change the assumptions" align="end" width="wide">
            <MailForm action={saveCashSetupAction} submitLabel="Save" pendingLabel="Saving…">
              <Field
                id="cash-burn"
                label="Monthly net burn"
                hint={
                  page.typed.burn_minor === null
                    ? "Empty: the statements' average, when there is one."
                    : "Leave it empty to use the statements' average."
                }
              >
                <Input
                  id="cash-burn"
                  name="burn"
                  inputMode="decimal"
                  maxLength={24}
                  defaultValue={
                    page.typed.burn_minor === null ? "" : minorInput(page.typed.burn_minor)
                  }
                />
              </Field>
              <Field id="cash-collections" label="Money collected a month now">
                <Input
                  id="cash-collections"
                  name="collections"
                  inputMode="decimal"
                  maxLength={24}
                  defaultValue={minorInput(assumptions.collections_minor)}
                />
              </Field>
              <Field
                id="cash-growth"
                label="Its growth a month, per cent"
                hint="0 to 100, at most one decimal."
              >
                <Input
                  id="cash-growth"
                  name="growth"
                  inputMode="decimal"
                  maxLength={5}
                  defaultValue={String(assumptions.growth)}
                />
              </Field>
              <Field id="cash-hire-delay" label="Hire delay, months">
                <Input
                  id="cash-hire-delay"
                  name="hire_delay_months"
                  type="number"
                  min={1}
                  max={12}
                  step={1}
                  defaultValue={assumptions.hire_delay_months}
                />
              </Field>
            </MailForm>
          </Popover>
          <Popover label="Add an event" align="end" width="wide">
            <MailForm action={addCashEventAction} submitLabel="Add it" pendingLabel="Adding…">
              <Field id="cash-event-kind" label="Kind">
                <Select id="cash-event-kind" name="kind" defaultValue="money_in">
                  <option value="money_in">Money in, once</option>
                  <option value="monthly_cost">A monthly cost from a month</option>
                </Select>
              </Field>
              <Field id="cash-event-name" label="Name">
                <Input id="cash-event-name" name="name" required minLength={2} maxLength={120} />
              </Field>
              <Field id="cash-event-period" label="Month">
                <Input id="cash-event-period" name="period" type="month" required />
              </Field>
              <Field id="cash-event-amount" label="Amount, rupees">
                <Input
                  id="cash-event-amount"
                  name="amount"
                  inputMode="decimal"
                  required
                  maxLength={24}
                />
              </Field>
              <Checkbox
                id="cash-event-flagged"
                name="flagged"
                label="This is the raise / This is a hire"
                description="Tick it for the raise (money in) or for a hire (a monthly cost): the scenarios move these."
              />
            </MailForm>
          </Popover>
        </>
      }
    >
      {!page.scenarios ? (
        <p className="page-note">{CASH_NEEDS_RUPEES}</p>
      ) : (
        <>
          <DataTable
            caption="Scenarios"
            columns={[
              { key: "scenario", label: "Scenario" },
              { key: "six", label: "In 6 months", align: "end" as const },
              { key: "twelve", label: "In 12 months", align: "end" as const },
              { key: "twentyfour", label: "In 24 months", align: "end" as const },
              { key: "out", label: "Cash runs out" },
              { key: "even", label: "Break-even" },
            ]}
            columnMenu={false}
          >
            {page.scenarios.map((scenario) => (
              <tr key={scenario.key} data-scenario={scenario.key}>
                <td>{scenario.label}</td>
                <td className="data-table__num">{at(scenario.months, 5)}</td>
                <td className="data-table__num">{at(scenario.months, 11)}</td>
                <td className="data-table__num">{at(scenario.months, 23)}</td>
                <td>{scenario.cash_out ? periodWords(scenario.cash_out) : "Not in 24 months"}</td>
                <td>{scenario.break_even ? periodWords(scenario.break_even) : "None"}</td>
              </tr>
            ))}
          </DataTable>
          <ul className="hqdata-cash__sentences">
            {page.scenarios.map((scenario) => (
              <li key={scenario.key}>
                {scenario.label}: {scenario.words}
              </li>
            ))}
          </ul>
          <p className="page-note">{page.scenarios[0]?.break_even_words}</p>
        </>
      )}
      <p className="hqdata-cash__assumptions">
        Monthly net burn:{" "}
        {assumptions.burn_minor === null
          ? "none yet"
          : `${minorWords(assumptions.burn_minor, "INR")} (${assumptions.burn_source === "typed" ? "typed" : "the statements' average"})`}
        . Collected a month: {minorWords(assumptions.collections_minor, "INR")}, growing{" "}
        {assumptions.growth} per cent a month. Hire delay: {assumptions.hire_delay_months}{" "}
        {assumptions.hire_delay_months === 1 ? "month" : "months"}.
      </p>
      {assumptions.events.length > 0 && (
        <ul className="hqdata-cash__events">
          {assumptions.events.map((event) => (
            <li key={event.event_id}>
              {event.name}: {minorWords(event.amount_minor, "INR")}{" "}
              {event.kind === "money_in" ? "once, in" : "a month from"} {periodWords(event.period)}
              {event.flagged ? (event.kind === "money_in" ? " (the raise)" : " (a hire)") : ""}
              <RowAction
                action={removeCashEventAction}
                fields={{ event_id: event.event_id }}
                className="hqdata-cash__act"
                buttons={[
                  {
                    label: "Remove",
                    className: "btn btn--small btn--ghost",
                    ariaLabel: `Remove ${event.name}`,
                    pendingLabel: "Removing…",
                  },
                ]}
              />
            </li>
          ))}
        </ul>
      )}
    </RecordSection>
  );
}

function Tiles({ page }: { page: CashPage }) {
  return (
    <RecordSection
      id="cash-tiles"
      title="Thresholds to watch"
      actions={
        <Popover label="Type the figures" align="end" width="wide">
          <MailForm action={saveCashSetupAction} submitLabel="Save" pendingLabel="Saving…">
            <Field id="cash-other-sales" label="Other sales this financial year, rupees">
              <Input
                id="cash-other-sales"
                name="other_sales"
                inputMode="decimal"
                maxLength={24}
                defaultValue={minorInput(page.typed.other_sales_minor)}
              />
            </Field>
            <Field id="cash-caro" label="Paid-up capital plus reserves, rupees">
              <Input
                id="cash-caro"
                name="caro_amount"
                inputMode="decimal"
                maxLength={24}
                defaultValue={page.typed.caro ? minorInput(page.typed.caro.amount_minor) : ""}
              />
            </Field>
            <Field id="cash-caro-on" label="True on">
              <Input
                id="cash-caro-on"
                name="caro_as_of"
                type="date"
                defaultValue={page.typed.caro?.as_of ?? ""}
              />
            </Field>
          </MailForm>
        </Popover>
      }
    >
      <ul className="hqdata-cash__tiles">
        {page.tiles.map((tile) => (
          <li key={tile.key} data-tile={tile.key}>
            <span className="hqdata-cash__tile-name">
              {
                {
                  gst: "GST registration",
                  pf: "Provident fund",
                  esi: "Employees' state insurance",
                  caro: "CARO",
                  books: "Books software's free plan",
                }[tile.key]
              }
              :
            </span>{" "}
            {tile.words} <RuleLineNote line={tile.rule} />
            {tile.beside && <span className="table-sub">{tile.beside}</span>}
          </li>
        ))}
      </ul>
    </RecordSection>
  );
}
