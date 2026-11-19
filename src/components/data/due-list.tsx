import Link from "next/link";

import { DueChip } from "@/components/crm/pills";
import type { DueItem } from "@/lib/data/api/overview";
import { DUE_KINDS } from "@/lib/data/labels";
import { formatNumber } from "@/lib/format";

export const NOTHING_DUE =
  "Nothing is due. Follow-ups, next steps, actions from notes, key dates, meetings, agreements, pilots, incidents, trademarks, domains, bills, export invoices, the month's close and file reviews land here on their day.";

/** The line under a Due list that left later rows out; every row owed now is always shown. */
export function dueMoreLine(more: number): string {
  return more === 1
    ? "1 more row is due later than these."
    : `${formatNumber(more)} more rows are due later than these.`;
}

/**
 * What is owed, one list across every module: a kind word, the record, who or which firm,
 * and when. Overdue rows come first because the service sorts them so; the chip says it.
 * Every row due today or earlier is in `items`; `more` counts later rows the service left
 * out, and `moreHref` opens the list with all of them.
 */
export function DueList({
  items,
  today,
  empty = NOTHING_DUE,
  more = 0,
  moreHref,
}: {
  items: readonly DueItem[];
  today: string;
  empty?: string;
  more?: number;
  moreHref?: string;
}) {
  if (items.length === 0)
    return (
      <p className="page-note hqdata-due hqdata-due--empty" role="status">
        {empty}
      </p>
    );
  return (
    <>
      <ul className="hqdata-due">
        {items.map((item) => (
          <li key={item.key} className="hqdata-due__row">
            <span className="hqdata-due__kind">{DUE_KINDS[item.kind]}</span>
            <span className="hqdata-due__what">
              <Link className="table-title" href={item.href}>
                {item.title}
              </Link>
              {item.sub && <span className="table-sub">{item.sub}</span>}
            </span>
            <span className="hqdata-due__when">
              <DueChip due={item.due_on} today={today} />
            </span>
          </li>
        ))}
      </ul>
      {more > 0 && (
        <p className="page-note hqdata-due__more">
          {dueMoreLine(more)}{" "}
          {moreHref && (
            <Link className="text-link" href={moreHref}>
              Show every row
            </Link>
          )}
        </p>
      )}
    </>
  );
}
