import Link from "next/link";

import { DataUnavailable } from "@/components/data/data-down";
import { PageHeader } from "@/components/shell/page-header";
import { ButtonLink } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { DataTable } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { RecordSection } from "@/components/ui/record-shell";
import { StatusPill } from "@/components/ui/status-pill";
import { Timestamp } from "@/components/ui/timestamp";
import { DATA_ROLE_LINE, requireData } from "@/lib/data/access";
import { readBatches, type BatchRow, type DataBatches } from "@/lib/data/api/batches";
import { OUTCOMES, OUTCOME_ORDER } from "@/lib/data/labels";
import {
  BATCHES,
  DELIVERY_NEVER_READ,
  DELIVERY_NOT_LOADED,
  waitingWords,
} from "@/lib/data/labels-outreach";
import { dataRead } from "@/lib/data/read";
import { formatDate, formatNumber } from "@/lib/format";
import { requestNow } from "@/lib/request-time";

import "./batches.css";

export const metadata = { title: "Batches" };
export const dynamic = "force-dynamic";

const BASE = "/data/waitlist/batches";

const COLUMNS = [
  { key: "batch", label: "Batch", width: "16%" },
  { key: "first", label: "First sent" },
  { key: "accepted", label: "Accepted", align: "end" as const },
  { key: "delivered", label: "Delivered" },
  { key: "didnt", label: "Didn't arrive" },
  { key: "not_yet", label: "Not delivered yet", align: "end" as const },
  { key: "complaints", label: "Spam complaints", align: "end" as const },
  { key: "unsubscribed", label: "Unsubscribed", align: "end" as const },
  { key: "replied", label: "Replied" },
  { key: "ooo", label: "Out of office", align: "end" as const },
  { key: "yes", label: "Yes" },
  { key: "joined", label: "Joined", align: "end" as const },
  { key: "booked", label: "Calls booked" },
  { key: "held", label: "Calls held" },
  { key: "pilots", label: "Pilots" },
];

const OUTCOME_COLUMNS = [
  { key: "batch", label: "Batch", width: "24%" },
  ...OUTCOME_ORDER.map((outcome) => ({
    key: outcome,
    label: OUTCOMES[outcome].label,
    align: "end" as const,
  })),
];

/** "x of y"; the count alone when there is nothing to be out of. */
function ratio(part: number, whole: number): string {
  return whole > 0 ? `${formatNumber(part)} of ${formatNumber(whole)}` : formatNumber(part);
}

type Counts = DataBatches["funnel"]["total"];

/**
 * Waitlist › Batches (delivery spec §7.4): each mailing sent for real, from what the
 * provider said happened to it, through the replies recorded here, to the waitlist's
 * stages. Counts and "x of y" only: no target, no rate, no bar.
 */
export default async function BatchesPage() {
  const { allowed } = await requireData(BASE);
  const now = requestNow();
  const read = allowed ? await dataRead(readBatches) : null;
  const data = read?.ok ? read.data : null;
  return (
    <>
      <PageHeader
        title={BATCHES.title}
        description={BATCHES.about}
        meta={
          data ? (
            <span className="quiet">
              {formatNumber(data.funnel.rows.length)}{" "}
              {data.funnel.rows.length === 1 ? "batch" : "batches"}
            </span>
          ) : undefined
        }
        actions={
          allowed ? (
            <ButtonLink href="/data/waitlist" size="small">
              Waitlist
            </ButtonLink>
          ) : undefined
        }
      />
      <div className="page-content">
        {!allowed || !read ? (
          <Callout tone="neutral">{DATA_ROLE_LINE}</Callout>
        ) : !read.ok ? (
          <DataUnavailable failure={read} />
        ) : (
          <Batches data={read.data} now={now} />
        )}
      </div>
    </>
  );
}

function Batches({ data, now }: { data: DataBatches; now: number }) {
  const { funnel, read, loaded } = data;
  const gone = new Set(data.gone);
  const outside = funnel.not_from_a_batch;
  if (funnel.rows.length === 0)
    return (
      <div className="hqdata-batches">
        <EmptyState
          title={BATCHES.emptyTitle}
          description={BATCHES.emptyBody}
          action={
            <ButtonLink href="/mail/merge" size="small">
              Mail merge
            </ButtonLink>
          }
        />
      </div>
    );
  return (
    <div className="hqdata-batches">
      <div className="hqdata-batches__lines">
        <p>
          {!loaded.delivery || !read ? (
            DELIVERY_NOT_LOADED
          ) : read.last_read_at ? (
            <>
              Delivery last read <Timestamp value={read.last_read_at} now={now} mode="relative" />.
            </>
          ) : (
            DELIVERY_NEVER_READ
          )}
        </p>
        {read && read.waiting > 0 && (
          <p>
            {waitingWords(read.waiting, formatNumber(read.waiting))}
            <Link className="text-link" href="/mail/merge">
              Mail merge
            </Link>
            .
          </p>
        )}
        {!loaded.replies && <p>{BATCHES.repliesNotLoaded}</p>}
        {!loaded.waitlist && <p>{BATCHES.waitlistNotLoaded}</p>}
      </div>
      <p className="hqdata-print-only">Batches as of {formatDate(data.today)}</p>

      <DataTable caption="Batches" columns={COLUMNS} columnMenu={false} minWidth={1480}>
        {funnel.rows.map((row) => (
          <tr key={row.mailing_id} id={`batch-${row.mailing_id}`}>
            <td>
              {gone.has(row.mailing_id) ? (
                <span className="table-title">{row.name}</span>
              ) : (
                <Link className="table-title" href={`/mail/merge/mailings/${row.mailing_id}`}>
                  {row.name}
                </Link>
              )}
              <span className="table-sub">
                {gone.has(row.mailing_id) ? BATCHES.gone : row.lists.join(", ")}
              </span>
            </td>
            <td>
              <Timestamp value={row.first_sent_at} now={now} mode="absolute" />
            </td>
            <CountCells counts={row} warning={row.warning} />
          </tr>
        ))}
        <tr className="hqdata-batches__total" id="batches-total">
          <td>{BATCHES.total}</td>
          <td>—</td>
          <CountCells counts={funnel.total} warning={null} />
        </tr>
        <tr className="hqdata-batches__outside" id="batches-outside">
          <td>{BATCHES.notFromABatch}</td>
          <td>—</td>
          <td className="data-table__num">—</td>
          <td>—</td>
          <td>—</td>
          <td className="data-table__num">—</td>
          <td className="data-table__num">—</td>
          <td className="data-table__num">—</td>
          <td>{formatNumber(outside.replied)}</td>
          <td className="data-table__num">{formatNumber(outside.out_of_office)}</td>
          <td>{formatNumber(outside.yes)}</td>
          <td className="data-table__num">—</td>
          <td>—</td>
          <td>—</td>
          <td>—</td>
        </tr>
      </DataTable>

      <RecordSection id="batches-outcomes" title={BATCHES.outcomesTitle}>
        <DataTable
          caption="Replies by outcome"
          columns={OUTCOME_COLUMNS}
          columnMenu={false}
          minWidth={960}
        >
          {funnel.rows.map((row) => (
            <OutcomeRow key={row.mailing_id} name={row.name} counts={row.by_outcome} />
          ))}
          <OutcomeRow name={BATCHES.notFromABatch} counts={outside.by_outcome} />
        </DataTable>
        <p className="page-note">{BATCHES.outcomesNote}</p>
      </RecordSection>
    </div>
  );
}

/** Accepted to Pilots: the thirteen count columns of a batch, or of all of them. */
function CountCells({ counts, warning }: { counts: Counts; warning: BatchRow["warning"] }) {
  const delivery = counts.delivery;
  const notRead = <span className="table-sub">{BATCHES.notRead}</span>;
  const other = delivery ? delivery.blocked + delivery.invalid + delivery.error : 0;
  return (
    <>
      <td className="data-table__num">{formatNumber(counts.accepted)}</td>
      <td>
        {delivery ? (
          <span className="hqdata-batches__cell">
            {ratio(delivery.delivered, delivery.accepted)}
            {warning && <StatusPill value="warning" label="Warning" tone={warning} />}
          </span>
        ) : (
          notRead
        )}
      </td>
      <td>
        {delivery ? (
          <>
            {formatNumber(delivery.didnt_arrive)}
            {delivery.didnt_arrive > 0 && (
              <span className="table-sub">
                {formatNumber(delivery.hard_bounce)} hard · {formatNumber(delivery.soft_bounce)}{" "}
                soft · {formatNumber(other)} other
              </span>
            )}
          </>
        ) : (
          notRead
        )}
      </td>
      <td className="data-table__num">{delivery ? formatNumber(delivery.not_yet) : notRead}</td>
      <td className="data-table__num">{delivery ? formatNumber(delivery.complaint) : notRead}</td>
      <td className="data-table__num">
        {delivery ? formatNumber(delivery.unsubscribed) : notRead}
      </td>
      <td>{ratio(counts.replied, delivery ? delivery.delivered : 0)}</td>
      <td className="data-table__num">{formatNumber(counts.out_of_office)}</td>
      <td>
        {ratio(counts.yes, counts.replied)}
        {counts.yes_not_on_waitlist > 0 && (
          <span className="table-sub">
            {formatNumber(counts.yes_not_on_waitlist)} not on the waitlist
          </span>
        )}
      </td>
      <td className="data-table__num">{formatNumber(counts.joined)}</td>
      <td>{ratio(counts.calls_booked, counts.joined)}</td>
      <td>{ratio(counts.calls_held, counts.calls_booked)}</td>
      <td>{ratio(counts.pilots, counts.calls_held)}</td>
    </>
  );
}

function OutcomeRow({ name, counts }: { name: string; counts: Record<string, number> }) {
  return (
    <tr>
      <td>{name}</td>
      {OUTCOME_ORDER.map((outcome) => (
        <td key={outcome} className="data-table__num">
          {formatNumber(counts[outcome] ?? 0)}
        </td>
      ))}
    </tr>
  );
}
