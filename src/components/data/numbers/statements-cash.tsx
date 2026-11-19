import { DataTable } from "@/components/ui/data-table";
import type { NumbersPage } from "@/lib/data/api/numbers";
import { minorWords } from "@/lib/data/labels-duties";
import { dayWords } from "@/lib/data/labels-company";
import { NO_RUNWAY, NO_WHOLE_MONTH, monthOnly, unsortedWords } from "@/lib/data/labels-statements";
import { formatDate, formatMoney, formatNumber } from "@/lib/format";

/**
 * Numbers' "Cash and runway" once a statement is imported (ws-notes/duties/spec.md §9.6):
 * one row per currency with where its figure came from, the statements' figures in Indian
 * grouping, and under it the last whole month's gross burn, what customers paid and the day
 * the cash runs out at this rate. Typed rows read as they always have. Never a figure added
 * across currencies; no bar, target or per cent sign.
 */

export const CASH_COLUMNS = [
  { key: "currency", label: "Currency" },
  { key: "cash", label: "Cash", align: "end" as const },
  { key: "on", label: "True on" },
  { key: "burn", label: "Monthly burn", align: "end" as const },
  { key: "runway", label: "Runway" },
  { key: "state", label: "State" },
];

/** "8.0": a runway as it is written, rounded down by the service already. */
export const runwayWords = (months: number) => (Math.round(months * 10) / 10).toFixed(1);

type Money = NumbersPage["money"];

export function StatementsCash({ money }: { money: Money }) {
  const currencies = [
    ...new Set([
      ...money.computed.map((item) => item.currency),
      ...money.used.map((item) => item.currency),
      ...money.rows.map((item) => item.currency),
    ]),
  ].sort((a, b) => a.localeCompare(b));
  const several = money.computed.length > 1;
  return (
    <>
      <DataTable
        caption="Cash and runway"
        columns={[...CASH_COLUMNS, { key: "from", label: "From" }]}
        columnMenu={false}
      >
        {currencies.map((currency) => (
          <CashRow key={currency} currency={currency} money={money} />
        ))}
      </DataTable>
      {money.computed
        .filter((item) => !item.stale)
        .map((item) => (
          <div key={item.currency} className="hqdata-numbers__burn">
            <p className="hqdata-numbers__line">
              {several ? `${item.currency}: ` : ""}
              {item.months === 0 || item.last_whole === null
                ? NO_WHOLE_MONTH
                : `Gross burn in ${monthOnly(item.last_whole)}: ${minorWords(item.gross_burn_minor ?? 0, item.currency)}. Collected from customers: ${minorWords(item.collected_minor ?? 0, item.currency)}. ${
                    item.zero_on
                      ? `At this rate the cash runs out about ${dayWords(item.zero_on)}.`
                      : NO_RUNWAY
                  }`}
            </p>
            {item.uncategorised > 0 && (
              <p className="page-note">{unsortedWords(item.uncategorised)}</p>
            )}
          </div>
        ))}
    </>
  );
}

function CashRow({ currency, money }: { currency: string; money: Money }) {
  const used = money.used.find((item) => item.currency === currency) ?? null;
  const computed = money.computed.find((item) => item.currency === currency) ?? null;
  const typed = money.rows.find((item) => item.currency === currency) ?? null;
  if (computed && (used?.source === "statements" || (!used && computed.stale))) {
    const avg = computed.avg_net_burn_minor;
    return (
      <tr>
        <td>{currency}</td>
        <td className="data-table__num">{minorWords(computed.cash_minor, currency)}</td>
        <td>{formatDate(computed.as_of)}</td>
        <td className="data-table__num">
          {avg === null ? "Not counted yet" : `${minorWords(avg, currency)} a month`}
        </td>
        <td>
          {computed.stale
            ? "Not worked out: too old to use"
            : computed.runway_months === null || avg === null
              ? computed.months === 0
                ? NO_WHOLE_MONTH
                : "No runway to count"
              : `${minorWords(computed.cash_minor, currency)} ÷ ${minorWords(avg, currency)} = ${runwayWords(computed.runway_months)} months`}
        </td>
        <td>{computed.stale ? computed.stale_words : "Used"}</td>
        <td>{computed.words}</td>
      </tr>
    );
  }
  if (!typed) return null;
  return (
    <tr>
      <td>{currency}</td>
      <td className="data-table__num">{formatMoney(typed.entry.cash, currency)}</td>
      <td>{formatDate(typed.entry.as_of)}</td>
      <td className="data-table__num">{formatMoney(typed.entry.burn_per_month, currency)}</td>
      <td>
        {typed.runway_months === null
          ? "Not worked out: too old to use"
          : `${formatMoney(typed.entry.cash, currency)} ÷ ${formatMoney(typed.entry.burn_per_month, currency)} = ${runwayWords(typed.runway_months)} months`}
      </td>
      <td>
        {used
          ? "Used"
          : `Not used: ${formatNumber(typed.age_days)} ${typed.age_days === 1 ? "day" : "days"} old`}
      </td>
      <td>{typed.entry.override ? `Typed over the statements: ${typed.entry.note}` : "Typed"}</td>
    </tr>
  );
}
