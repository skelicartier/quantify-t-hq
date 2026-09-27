import Link from "next/link";

import { DealFlags, DueChip } from "@/components/crm/pills";
import type { BoardColumn } from "@/lib/api/deals";
import type { DirectoryEntry } from "@/lib/api/staff";
import { formatMoney, formatMrr } from "@/lib/format";

type DealBoardProps = {
  columns: readonly BoardColumn[];
  today: string;
  names: ReadonlyMap<string, DirectoryEntry>;
};

/**
 * The pipeline as columns. Cards are read-only on purpose: moving a deal asks for its
 * next step, so the move lives on the deal page rather than in a drag that would have
 * to interrupt itself with a form.
 */
export function DealBoard({ columns, today, names }: DealBoardProps) {
  return (
    <div className="board" role="region" aria-label="Pipeline board" tabIndex={0}>
      {columns.map((column) => (
        <section
          key={column.key}
          className={
            column.outcome ? `board__column board__column--${column.outcome}` : "board__column"
          }
          aria-labelledby={`board-col-${column.key}`}
        >
          <header className="board__head">
            <div className="board__title-row">
              <h2 className="board__title" id={`board-col-${column.key}`}>
                {column.label}
              </h2>
              <span className="board__count" aria-label={`${column.deals.length} deals`}>
                {column.deals.length}
              </span>
            </div>
            <p className="board__sums">
              <span className="board__mrr">{formatMrr(column.mrr_total)}</span>
              {!column.outcome && (
                <span className="board__weighted">
                  {column.win_probability}% · {formatMoney(column.weighted_total)} weighted
                </span>
              )}
            </p>
          </header>
          {column.deals.length === 0 ? (
            <p className="board__empty">No deals</p>
          ) : (
            <ol className="board__cards">
              {column.deals.map((deal) => {
                const owner = deal.owner_staff_id
                  ? (names.get(deal.owner_staff_id)?.display_name ?? "—")
                  : "Unowned";
                return (
                  <li key={deal.deal_id}>
                    <article
                      className={
                        deal.flags.length > 0 ? "deal-card deal-card--flagged" : "deal-card"
                      }
                    >
                      <Link className="deal-card__title" href={`/deals/${deal.deal_id}`}>
                        {deal.company_name || deal.name}
                      </Link>
                      <p className="deal-card__money">
                        {formatMrr(deal.mrr_amount, deal.currency)}
                        <span className="deal-card__seats">
                          {deal.seats} {deal.seats === 1 ? "seat" : "seats"}
                        </span>
                      </p>
                      {deal.status === "open" && deal.next_step && (
                        <div className="deal-card__step">
                          <span className="deal-card__label">Next</span>
                          <p>{deal.next_step}</p>
                          <DueChip due={deal.next_step_due} today={today} />
                        </div>
                      )}
                      <DealFlags
                        flags={deal.flags}
                        idleDays={deal.idle_days}
                        daysInStage={deal.days_in_stage}
                      />
                      <p className="deal-card__foot">
                        <span>{owner}</span>
                        <span>
                          {deal.status === "open"
                            ? `${deal.days_in_stage}d in stage`
                            : deal.loss_reason
                              ? "Lost"
                              : ""}
                        </span>
                      </p>
                    </article>
                  </li>
                );
              })}
            </ol>
          )}
        </section>
      ))}
    </div>
  );
}
