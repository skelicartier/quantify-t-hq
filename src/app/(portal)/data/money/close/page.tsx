import Link from "next/link";

import { DataUnavailable } from "@/components/data/data-down";
import { RuleLineNote } from "@/components/data/duties/rule-line";
import { MoneyTabs } from "@/components/data/money/money-tabs";
import { PageHeader } from "@/components/shell/page-header";
import { Callout } from "@/components/ui/callout";
import { DataTable } from "@/components/ui/data-table";
import { StatusPill } from "@/components/ui/status-pill";
import { DATA_ROLE_LINE, requireData } from "@/lib/data/access";
import { readCloseMonths, type CloseMonths } from "@/lib/data/api/close";
import { dayWords } from "@/lib/data/labels-company";
import {
  CLOSE_ABOUT,
  CLOSE_STATES,
  NOTHING_TO_CLOSE,
  NOT_ADVICE,
  RULES_MISSING,
  readyWords,
} from "@/lib/data/labels-statements";
import { dataRead } from "@/lib/data/read";

import "./close.css";

export const metadata = { title: "Month close" };
export const dynamic = "force-dynamic";

const COLUMNS = [
  { key: "month", label: "Month" },
  { key: "by", label: "Close by" },
  { key: "ready", label: "Ready" },
  { key: "sent", label: "Sent" },
  { key: "state", label: "State" },
];

/**
 * Money › Month close (ws-notes/duties/spec.md §9.11): every month from the first statement
 * or bill, newest first, with the day its close is due, how many of the seven rows are
 * ready, when the pack was sent and whether it is locked. For Owners and Admins.
 */
export default async function CloseRoute() {
  const { allowed, context } = await requireData("/data/money/close");
  const read = allowed ? await dataRead(() => readCloseMonths()) : null;
  return (
    <>
      <PageHeader
        title="Month close"
        description={allowed ? `${CLOSE_ABOUT} ${NOT_ADVICE}` : undefined}
      />
      <div className="page-content">
        <div className="hqdata-close">
          {allowed && <MoneyTabs current="close" owner={context.me.role === "owner"} />}
          {!allowed || !read ? (
            <Callout tone="neutral">{DATA_ROLE_LINE}</Callout>
          ) : !read.ok ? (
            <DataUnavailable failure={read} />
          ) : (
            <Months page={read.data} />
          )}
        </div>
      </div>
    </>
  );
}

function Months({ page }: { page: CloseMonths }) {
  return (
    <>
      {!page.rules_here && <p className="page-note">{RULES_MISSING}</p>}
      {page.fallback_days && page.months.length > 0 && (
        <p className="page-note">{page.fallback_words}</p>
      )}
      <DataTable
        caption="Months"
        columns={COLUMNS}
        columnMenu={false}
        isEmpty={page.months.length === 0}
        empty={<p className="page-note">{NOTHING_TO_CLOSE}</p>}
      >
        {page.months.map((month) => (
          <tr key={month.period}>
            <td>
              <Link className="table-title" href={`/data/money/close/${month.period}`}>
                {month.label}
              </Link>
              {!month.over && <span className="table-sub">Not over yet</span>}
            </td>
            <td className="nowrap">
              {month.due_on ? `Close by ${dayWords(month.due_on)}` : "Not worked out"}
            </td>
            <td className="nowrap">{readyWords(month.ready)}</td>
            <td className="nowrap">{month.sent_on ? dayWords(month.sent_on) : "Not yet"}</td>
            <td>
              <StatusPill
                value={month.state}
                label={CLOSE_STATES[month.state].label}
                tone={CLOSE_STATES[month.state].tone}
              />
            </td>
          </tr>
        ))}
      </DataTable>
      {page.rule && (
        <p className="page-note">
          The close is due five working days after the month ends: practice, not law.{" "}
          <RuleLineNote line={page.rule} />
        </p>
      )}
    </>
  );
}
