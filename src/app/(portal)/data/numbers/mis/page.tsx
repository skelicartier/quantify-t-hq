import Link from "next/link";

import { DataUnavailable } from "@/components/data/data-down";
import { NumbersTabs } from "@/components/data/numbers/numbers-tabs";
import { PageHeader } from "@/components/shell/page-header";
import { Callout } from "@/components/ui/callout";
import { DataTable } from "@/components/ui/data-table";
import { DATA_ROLE_LINE, requireData } from "@/lib/data/access";
import { readMisMonths, type MisMonths } from "@/lib/data/api/close";
import { dayWords } from "@/lib/data/labels-company";
import { minorWords } from "@/lib/data/labels-duties";
import { MIS_ABOUT, NOT_ADVICE, NO_MIS } from "@/lib/data/labels-statements";
import { dataRead } from "@/lib/data/read";

import "./mis.css";

export const metadata = { title: "MIS" };
export const dynamic = "force-dynamic";

const COLUMNS = [
  { key: "month", label: "Month" },
  { key: "state", label: "State" },
  { key: "frozen", label: "Frozen" },
  { key: "net", label: "Net burn", align: "end" as const },
  { key: "runway", label: "Runway" },
];

const runwayWords = (months: number) => (Math.round(months * 10) / 10).toFixed(1);

/**
 * Numbers › MIS (ws-notes/duties/spec.md §9.8): one row a month with figures, frozen at the
 * month's lock or live until then. Net burn and runway per currency, never added across.
 */
export default async function MisRoute() {
  const { allowed } = await requireData("/data/numbers/mis");
  const read = allowed ? await dataRead(() => readMisMonths()) : null;
  return (
    <>
      <PageHeader title="MIS" description={allowed ? `${MIS_ABOUT} ${NOT_ADVICE}` : undefined} />
      <div className="page-content">
        <div className="hqdata-mis">
          {allowed && <NumbersTabs current="mis" />}
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

function Months({ page }: { page: MisMonths }) {
  return (
    <DataTable
      caption="MIS by month"
      columns={COLUMNS}
      columnMenu={false}
      isEmpty={page.months.length === 0}
      empty={<p className="page-note">{NO_MIS}</p>}
    >
      {page.months.map((month) => (
        <tr key={month.period}>
          <td>
            <Link className="table-title" href={`/data/numbers/mis/${month.period}`}>
              {month.label}
            </Link>
          </td>
          <td>{month.state === "frozen" ? "Frozen" : month.current ? "Live" : "Not frozen"}</td>
          <td className="nowrap">
            {month.frozen_at ? dayWords(month.frozen_at.slice(0, 10)) : ""}
            {month.frozen_by && <span className="table-sub">{month.frozen_by.name}</span>}
          </td>
          <td className="data-table__num">
            {month.burn.length === 0
              ? "None"
              : month.burn.map((row) => minorWords(row.net_minor, row.currency)).join(" · ")}
          </td>
          <td>
            {month.burn.length === 0
              ? ""
              : month.burn
                  .map((row) =>
                    row.runway_months === null
                      ? `${row.currency}: not counted`
                      : `${month.burn.length > 1 ? `${row.currency}: ` : ""}${runwayWords(row.runway_months)} months`,
                  )
                  .join(" · ")}
          </td>
        </tr>
      ))}
    </DataTable>
  );
}
