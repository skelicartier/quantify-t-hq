import Link from "next/link";

import { DueChip } from "@/components/crm/pills";
import type { DueItem } from "@/lib/data/api/overview";
import { DUE_KINDS } from "@/lib/data/labels";

export const NOTHING_DUE =
  "Nothing is due. Follow-ups, next steps, actions from notes, key dates and file reviews land here on their day.";

/**
 * What is owed, one list across every module: a kind word, the record, who or which firm,
 * and when. Overdue rows come first because the service sorts them so; the chip says it.
 */
export function DueList({
  items,
  today,
  empty = NOTHING_DUE,
}: {
  items: readonly DueItem[];
  today: string;
  empty?: string;
}) {
  if (items.length === 0)
    return (
      <p className="page-note hqdata-due hqdata-due--empty" role="status">
        {empty}
      </p>
    );
  return (
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
  );
}
