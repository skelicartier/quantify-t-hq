import Link from "next/link";

import { DueChip } from "@/components/crm/pills";
import { DataTable } from "@/components/ui/data-table";
import { RecordSection } from "@/components/ui/record-shell";
import { Stat, StatGrid } from "@/components/ui/stat";
import type { Funnel, FunnelSplit } from "@/lib/data/api/investors";
import { AMOUNT_STATES, INVESTOR_STAGES, STALE_DAYS, labelOf } from "@/lib/data/labels";
import { formatMoney, formatNumber } from "@/lib/format";

import { dayMonth, firmsWord, ratio } from "./words";

/**
 * The Funnel view (raise spec §5.6.2): plain counts of firms per stage, each "of" the
 * stage before; money per state in each currency's own column, never added across; why
 * firms passed; time in stage with the 14-day stale rule; and the same counts by wave and
 * by introduction. Nothing here is a chart, a bar, a meter or a percentage.
 */

const BASE = "/data/investors";

const FUNNEL_COLUMNS = [
  { key: "stage", label: "Stage" },
  { key: "now", label: "Now", align: "end" as const },
  { key: "reached", label: "Reached it or later", align: "end" as const },
  { key: "of", label: "Of the stage before", align: "end" as const },
];

const REASON_COLUMNS = [
  { key: "reason", label: "Reason" },
  { key: "firms", label: "Firms", align: "end" as const },
];

const TIME_COLUMNS = [
  { key: "stage", label: "Stage" },
  { key: "firms", label: "Firms", align: "end" as const },
  { key: "stale", label: `${STALE_DAYS} days or more`, align: "end" as const },
  { key: "longest", label: "Longest wait (days)", align: "end" as const },
];

const STALE_COLUMNS = [
  { key: "firm", label: "Firm" },
  { key: "stage", label: "Stage" },
  { key: "days", label: "Days", align: "end" as const },
  { key: "next", label: "Next step" },
];

const SPLIT_COLUMNS = (first: string) => [
  { key: "group", label: first },
  { key: "firms", label: "Firms", align: "end" as const },
  { key: "written", label: "Written to", align: "end" as const },
  { key: "replied", label: "Replied", align: "end" as const },
  { key: "meeting", label: "Meeting booked", align: "end" as const },
  { key: "met", label: "Met", align: "end" as const },
  { key: "soft", label: "Soft commit or later", align: "end" as const },
];

const AMOUNT_ORDER = ["asked", "soft", "signed", "money_in"] as const;
const EXIT_ORDER = ["not_written", "set_aside", "passed", "do_not_pitch"] as const;

export function FunnelView({ funnel }: { funnel: Funnel }) {
  const stale = funnel.time_in_stage.reduce((sum, row) => sum + row.stale, 0);
  const exits: Record<string, number> = { not_written: funnel.not_written };
  for (const exit of funnel.exits) exits[exit.stage] = exit.now;
  const currencies = Object.keys(funnel.money).sort();
  const waved = funnel.by_wave.some((split) => split.key !== "");
  return (
    <div className="hqdata-funnel">
      <StatGrid label="The raise" columns={4}>
        <Stat
          label="Days since the first send"
          value={
            funnel.days_since_first_send === null
              ? "Not sent yet"
              : formatNumber(funnel.days_since_first_send)
          }
          text={funnel.days_since_first_send === null}
          hint={funnel.first_send_on ? `since ${dayMonth(funnel.first_send_on)}` : undefined}
        />
        <Stat
          label="First meetings this week"
          value={formatNumber(funnel.first_meetings_this_week)}
          hint={`since Mon ${dayMonth(funnel.week_from)}`}
        />
        <Stat label="Firms" value={formatNumber(funnel.firms)} hint="on the investor list" />
        <Stat
          label="Stale"
          value={formatNumber(stale)}
          hint={`${STALE_DAYS} days or more in a stage`}
          tone={stale > 0 ? "danger" : "default"}
        />
      </StatGrid>

      <RecordSection id="investors-funnel" title="Funnel">
        <DataTable
          caption="Funnel"
          columns={FUNNEL_COLUMNS}
          columnMenu={false}
          scroll={false}
          minWidth={360}
        >
          {funnel.stages.map((row) => (
            <tr key={row.stage}>
              <td>
                <Link className="table-title" href={`${BASE}?stage=${row.stage}`}>
                  {labelOf(INVESTOR_STAGES, row.stage)}
                </Link>
              </td>
              <td className="data-table__num">{formatNumber(row.now)}</td>
              <td className="data-table__num">{formatNumber(row.reached)}</td>
              <td className="data-table__num">{ratio(row.reached, row.of)}</td>
            </tr>
          ))}
        </DataTable>
        <p className="hqdata-readouts">
          {EXIT_ORDER.map((stage, index) => (
            <span key={stage}>
              {index > 0 && " · "}
              <Link href={`${BASE}?stage=${stage}`}>
                {labelOf(INVESTOR_STAGES, stage)} {formatNumber(exits[stage] ?? 0)}
              </Link>
            </span>
          ))}
        </p>
        <p className="page-note">
          A firm that went past a stage without stopping at it counts as having reached it.
        </p>
      </RecordSection>

      <RecordSection id="investors-money" title="Amounts">
        {currencies.length === 0 ? (
          <p className="page-note">No amounts recorded yet.</p>
        ) : (
          <>
            <DataTable
              caption="Amounts by state"
              minWidth={320}
              columns={[
                { key: "state", label: "State" },
                ...currencies.map((code) => ({ key: code, label: code, align: "end" as const })),
              ]}
              columnMenu={false}
              scroll={false}
            >
              {AMOUNT_ORDER.map((state) => (
                <tr key={state}>
                  <td>{AMOUNT_STATES[state]}</td>
                  {currencies.map((code) => {
                    const sum = funnel.money[code]?.[state];
                    return (
                      <td key={code} className="data-table__num hqdata-money">
                        {sum
                          ? `${formatMoney(sum.amount, code)} · ${firmsWord(sum.firms)}`
                          : "None"}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </DataTable>
            <p className="page-note">
              Each firm&rsquo;s newest amount, in its own currency. Currencies are never added
              together.
            </p>
          </>
        )}
      </RecordSection>

      <RecordSection id="investors-passed" title="Why firms passed">
        {funnel.pass_reasons.length === 0 ? (
          <p className="page-note">No firm has passed.</p>
        ) : (
          <>
            <DataTable
              caption="Pass reasons"
              minWidth={280}
              columns={REASON_COLUMNS}
              columnMenu={false}
              scroll={false}
            >
              {funnel.pass_reasons.map((row) => (
                <tr key={row.reason}>
                  <td>{row.reason}</td>
                  <td className="data-table__num">{formatNumber(row.firms)}</td>
                </tr>
              ))}
            </DataTable>
            <p className="page-note">{firmsWord(funnel.passed)} passed.</p>
          </>
        )}
      </RecordSection>

      <RecordSection id="investors-time" title="Time in stage">
        <DataTable
          caption="Time in stage"
          columns={TIME_COLUMNS}
          columnMenu={false}
          scroll={false}
          minWidth={360}
        >
          {funnel.time_in_stage.map((row) => (
            <tr key={row.stage}>
              <td>{labelOf(INVESTOR_STAGES, row.stage)}</td>
              <td className="data-table__num">{formatNumber(row.firms)}</td>
              <td className="data-table__num">{formatNumber(row.stale)}</td>
              <td className="data-table__num">{formatNumber(row.longest_days)}</td>
            </tr>
          ))}
        </DataTable>
        {funnel.stale.length === 0 ? (
          <p className="page-note">No firm has waited {STALE_DAYS} days or more.</p>
        ) : (
          <DataTable
            caption="Stale firms"
            columns={STALE_COLUMNS}
            columnMenu={false}
            minWidth={480}
          >
            {funnel.stale.map((row) => (
              <tr key={row.investor_id}>
                <td>
                  <Link className="table-title" href={`${BASE}/${row.investor_id}`}>
                    {row.firm}
                  </Link>
                </td>
                <td>{labelOf(INVESTOR_STAGES, row.stage)}</td>
                <td className="data-table__num">{formatNumber(row.days)}</td>
                <td>
                  {row.next_step || <span className="table-sub">None set</span>}
                  {row.next_step && (
                    <span className="table-sub">
                      <DueChip due={row.next_step_on} today={funnel.today} />
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </DataTable>
        )}
      </RecordSection>

      <RecordSection id="investors-waves" title="By wave">
        {!waved ? (
          <p className="page-note">No firm has a wave yet. Set one under More on the Firms view.</p>
        ) : (
          <SplitTable caption="By wave" first="Wave" splits={funnel.by_wave} />
        )}
      </RecordSection>

      <RecordSection id="investors-intro" title="Introduced or not">
        <SplitTable caption="By introduction" first="Introduction" splits={funnel.by_intro} />
      </RecordSection>
    </div>
  );
}

/** Firms per group, and from Replied on, each "of" the column before it. */
function SplitTable({
  caption,
  first,
  splits,
}: {
  caption: string;
  first: string;
  splits: readonly FunnelSplit[];
}) {
  return (
    <DataTable
      caption={caption}
      columns={SPLIT_COLUMNS(first)}
      columnMenu={false}
      scroll={false}
      minWidth={560}
    >
      {splits.map((split) => (
        <tr key={split.key || "none"}>
          <td>{split.label}</td>
          <td className="data-table__num">{formatNumber(split.firms)}</td>
          <td className="data-table__num">{formatNumber(split.written)}</td>
          <td className="data-table__num">{ratio(split.replied, split.written)}</td>
          <td className="data-table__num">{ratio(split.meeting, split.replied)}</td>
          <td className="data-table__num">{ratio(split.met, split.meeting)}</td>
          <td className="data-table__num">{ratio(split.soft_or_later, split.met)}</td>
        </tr>
      ))}
    </DataTable>
  );
}
