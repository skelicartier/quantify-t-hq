import Link from "next/link";
import { notFound } from "next/navigation";

import { DataUnavailable } from "@/components/data/data-down";
import { NumbersTabs } from "@/components/data/numbers/numbers-tabs";
import { PageHeader } from "@/components/shell/page-header";
import { Callout } from "@/components/ui/callout";
import { DataTable } from "@/components/ui/data-table";
import { RecordSection } from "@/components/ui/record-shell";
import { DATA_ROLE_LINE, requireData } from "@/lib/data/access";
import { readMis, type MisPage } from "@/lib/data/api/close";
import { DUE_KINDS } from "@/lib/data/labels";
import { dayWords } from "@/lib/data/labels-company";
import { minorWords, minorWordsBy, periodWords } from "@/lib/data/labels-duties";
import {
  MIS_ABOUT,
  MIS_PARTS,
  NOT_ADVICE,
  NOT_FROZEN,
  NO_RUNWAY,
  NO_WHOLE_MONTH,
  RULES_MISSING,
  countOf,
  frozenWords,
  headcountWords,
} from "@/lib/data/labels-statements";
import { dataRead } from "@/lib/data/read";

import "../mis.css";

export const metadata = { title: "MIS" };
export const dynamic = "force-dynamic";

const PERIOD = /^\d{4}-(0[1-9]|1[0-2])$/;
const runwayWords = (months: number) => (Math.round(months * 10) / 10).toFixed(1);
const kindWords = (kind: string) => (DUE_KINDS as Record<string, string>)[kind] ?? kind;

/**
 * One month's MIS in eight parts (ws-notes/duties/spec.md §9.8): frozen at the month's lock,
 * live until then and marked so. Figures per currency, one after another, never added
 * across. People figures are shown to the Owner only; an Admin reads the counts and where
 * the figures are kept.
 */
export default async function MisMonthRoute({ params }: { params: Promise<{ period: string }> }) {
  const { period } = await params;
  if (!PERIOD.test(period)) notFound();
  const { allowed, context } = await requireData(`/data/numbers/mis/${period}`);
  const owner = context.me.role === "owner";
  const read = allowed ? await dataRead(() => readMis(period, owner)) : null;
  return (
    <>
      <PageHeader
        title={`MIS · ${periodWords(period)}`}
        description={allowed ? `${MIS_ABOUT} ${NOT_ADVICE}` : undefined}
      />
      <div className="page-content">
        <div className="hqdata-mis">
          {allowed && <NumbersTabs current="mis" />}
          {!allowed || !read ? (
            <Callout tone="neutral">{DATA_ROLE_LINE}</Callout>
          ) : !read.ok ? (
            <DataUnavailable failure={read} />
          ) : (
            <Parts page={read.data} owner={owner} period={period} />
          )}
        </div>
      </div>
    </>
  );
}

function Parts({ page, owner, period }: { page: MisPage; owner: boolean; period: string }) {
  const { mis } = page;
  const ownerPart = page.owner_part ?? null;
  const [revenue, expenses, burn, flow, numbers, against, people, compliance] = MIS_PARTS;
  return (
    <>
      <p className="hqdata-mis__state">
        {page.frozen && mis.frozen_at && mis.frozen_by
          ? `${frozenWords(mis.frozen_at.slice(0, 10), mis.frozen_by.name)}.`
          : NOT_FROZEN}{" "}
        <Link className="text-link" href={`/data/money/close/${period}`}>
          Month close
        </Link>
      </p>

      <RecordSection id="mis-revenue" title={revenue}>
        <p className="hqdata-mis__line">
          Collected from customers:{" "}
          {Object.keys(mis.revenue.collected).length
            ? minorWordsBy(mis.revenue.collected)
            : "nothing counted"}
          . Export invoices raised: {mis.revenue.export_invoices.count}
          {mis.revenue.export_invoices.count > 0
            ? ` (${minorWordsBy(mis.revenue.export_invoices.by_currency)})`
            : ""}
          .
        </p>
      </RecordSection>

      <RecordSection id="mis-expenses" title={expenses}>
        {mis.expenses.length === 0 && <p className="page-note">No statement covers this month.</p>}
        {mis.expenses.map((spent) => (
          <DataTable
            key={spent.currency}
            caption={`Expenses by head, ${spent.currency}`}
            columns={[
              { key: "head", label: "Head" },
              { key: "ledger", label: "Ledger" },
              { key: "amount", label: "Amount", align: "end" as const },
            ]}
            columnMenu={false}
          >
            {spent.heads
              .filter((head) => !(head.people && owner && ownerPart))
              .map((head) => (
                <tr key={head.name}>
                  <th scope="row" className="hqdata-mis__head">
                    {head.name}
                  </th>
                  <td>{head.ledger || <span className="quiet">Not mapped</span>}</td>
                  <td className="data-table__num">
                    {head.minor === null
                      ? "Shown to the Owner"
                      : minorWords(head.minor, spent.currency)}
                  </td>
                </tr>
              ))}
            {owner &&
              ownerPart?.people_heads
                .filter((head) => head.currency === spent.currency)
                .map((head) => (
                  <tr key={`people-${head.name}`}>
                    <th scope="row" className="hqdata-mis__head">
                      {head.name}
                    </th>
                    <td>People cost</td>
                    <td className="data-table__num">{minorWords(head.minor, spent.currency)}</td>
                  </tr>
                ))}
            {spent.unsorted_minor > 0 && (
              <tr>
                <th scope="row" className="hqdata-mis__head">
                  No category yet
                </th>
                <td />
                <td className="data-table__num">
                  {minorWords(spent.unsorted_minor, spent.currency)}
                </td>
              </tr>
            )}
            <tr className="hqdata-mis__total">
              <th scope="row" className="hqdata-mis__head">
                Money out in all
              </th>
              <td />
              <td className="data-table__num">{minorWords(spent.total_minor, spent.currency)}</td>
            </tr>
          </DataTable>
        ))}
      </RecordSection>

      <RecordSection id="mis-burn" title={burn}>
        {mis.burn.length === 0 && <p className="page-note">No statement covers this month.</p>}
        {mis.burn.map((row) => (
          <p key={row.currency} className="hqdata-mis__line">
            {mis.burn.length > 1 ? `${row.currency}: ` : ""}Cash{" "}
            {minorWords(row.cash_minor, row.currency)} on {dayWords(row.as_of)} · gross burn{" "}
            {minorWords(row.gross_minor, row.currency)} · collected{" "}
            {minorWords(row.collected_minor, row.currency)} · net burn{" "}
            {minorWords(row.net_minor, row.currency)} ·{" "}
            {row.avg_net_minor === null
              ? NO_WHOLE_MONTH
              : `average ${minorWords(row.avg_net_minor, row.currency)} a month over ${countOf(row.months, "month")}`}
            {row.runway_months !== null
              ? ` · runway ${runwayWords(row.runway_months)} months${row.zero_on ? `; at this rate the cash runs out about ${dayWords(row.zero_on)}` : ""}.`
              : row.avg_net_minor !== null
                ? `. ${NO_RUNWAY}`
                : ""}
          </p>
        ))}
      </RecordSection>

      <RecordSection id="mis-flow" title={flow}>
        {mis.cash_flow.map((row) => (
          <DataTable
            key={row.currency}
            caption={`Cash flow, ${row.currency}`}
            columns={[
              { key: "what", label: "What" },
              { key: "amount", label: "Amount", align: "end" as const },
            ]}
            columnMenu={false}
          >
            {(
              [
                ["Opening", row.opening_minor],
                ["In from customers", row.in.customers],
                ["In from funding", row.in.funding],
                ["Other money in", row.in.other],
                ["Out", row.out_minor],
                ["Between your own accounts", row.between_minor],
                ["Closing", row.closing_minor],
              ] as const
            ).map(([label, value]) => (
              <tr key={label}>
                <th scope="row" className="hqdata-mis__head">
                  {label}
                </th>
                <td className="data-table__num">{minorWords(value, row.currency)}</td>
              </tr>
            ))}
          </DataTable>
        ))}
        {mis.cash_flow.length === 0 && <p className="page-note">No statement covers this month.</p>}
      </RecordSection>

      <RecordSection id="mis-numbers" title={numbers}>
        <p className="hqdata-mis__line">
          {mis.numbers
            ? `People who said yes ${mis.numbers.yeses} · Firms joined the waitlist ${mis.numbers.firms_joined} · Named buyer firms ${mis.numbers.named_buyers} · Calls booked ${mis.numbers.calls_booked} · Calls held ${mis.numbers.calls_held} · Pilots signed ${mis.numbers.pilots_signed}`
            : "Not counted here yet."}
        </p>
      </RecordSection>

      <RecordSection id="mis-against" title={against}>
        {mis.against_last.every((row) => row.heads.length === 0) ? (
          <p className="page-note">Nothing to compare yet.</p>
        ) : (
          mis.against_last.map((row) => (
            <ul key={row.currency} className="hqdata-mis__list">
              {row.heads.map((head) => (
                <li key={head.name}>
                  {head.name}: {head.words}
                </li>
              ))}
            </ul>
          ))
        )}
      </RecordSection>

      <RecordSection id="mis-people" title={people}>
        <p className="hqdata-mis__line">
          {mis.people.headcount
            ? headcountWords(mis.people.headcount)
            : "The people ledger is not loaded here."}{" "}
          {owner && ownerPart
            ? ownerPart.payments > 0
              ? `${countOf(ownerPart.payments, "payment")}, ${minorWordsBy(ownerPart.stipends)}.`
              : "No stipend was paid this month."
            : "The figures are for the Owner only."}
        </p>
      </RecordSection>

      <RecordSection id="mis-compliance" title={compliance}>
        <p className="hqdata-mis__line">
          Overdue:{" "}
          {mis.compliance.overdue.length
            ? mis.compliance.overdue
                .map((item) => `${kindWords(item.kind)} ${item.count}`)
                .join(" · ")
            : "nothing"}
          . Due in the next 30 days:{" "}
          {mis.compliance.due_in_30.length
            ? mis.compliance.due_in_30
                .map((item) => `${kindWords(item.kind)} ${item.count}`)
                .join(" · ")
            : "nothing"}
          .{" "}
          {mis.compliance.rules_unconfirmed === null
            ? RULES_MISSING
            : `${countOf(mis.compliance.rules_unconfirmed, "rule")} not confirmed yet.`}
        </p>
      </RecordSection>

      <RecordSection id="mis-commentary" title="Commentary">
        <p className="hqdata-mis__line">{mis.commentary || "None written."}</p>
      </RecordSection>
    </>
  );
}
