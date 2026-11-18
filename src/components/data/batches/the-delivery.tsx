import Link from "next/link";

import { Callout } from "@/components/ui/callout";
import { RecordSection } from "@/components/ui/record-shell";
import { Timestamp } from "@/components/ui/timestamp";
import type { DataOverview } from "@/lib/data/api/overview";
import {
  DELIVERY_NEVER_READ_LONG,
  DELIVERY_NOT_LOADED,
  NOTHING_SENT_THIS_WEEK,
  waitingWords,
} from "@/lib/data/labels-outreach";
import { formatNumber } from "@/lib/format";
import { COMPLAINTS_HINT } from "@/lib/merge/delivery-contracts";

import "@/app/(portal)/data/waitlist/batches/batches.css";

/**
 * "Delivery, last 7 days" on the Data overview (delivery spec §7.3): what Mail merge read
 * back from the provider about the week's real sends, as counts and "x of y", with the
 * contract's warnings in words. A warning never pauses anything: the words say so. Printed,
 * unlike the Backup block.
 */
export function TheDelivery({
  delivery,
  now,
}: {
  delivery: NonNullable<DataOverview["delivery"]>;
  now: number;
}) {
  const { counts } = delivery;
  return (
    <RecordSection id="data-delivery" title="Delivery, last 7 days">
      <div className="hqdata-delivery">
        {!delivery.loaded ? (
          <p className="hqdata-sending">{DELIVERY_NOT_LOADED}</p>
        ) : delivery.read_at === null ? (
          <p className="hqdata-sending">{DELIVERY_NEVER_READ_LONG}</p>
        ) : counts.accepted === 0 ? (
          <p className="hqdata-sending">{NOTHING_SENT_THIS_WEEK}</p>
        ) : (
          <p className="hqdata-sending">
            {formatNumber(counts.delivered)} of {formatNumber(counts.accepted)} delivered ·{" "}
            {formatNumber(counts.didnt_arrive)} didn&rsquo;t arrive · {formatNumber(counts.not_yet)}{" "}
            not delivered yet · {formatNumber(counts.complaint)}{" "}
            {counts.complaint === 1 ? "spam complaint" : "spam complaints"} ·{" "}
            {formatNumber(counts.unsubscribed)} unsubscribed. Read{" "}
            <Timestamp value={delivery.read_at} now={now} mode="relative" />.
          </p>
        )}
        {delivery.warnings.map((warning) => (
          <Callout key={warning.key} tone={warning.level} title={warning.title} compact>
            {warning.body}
            {warning.key === "complaints" && (
              <span className="hqdata-delivery__hint">{COMPLAINTS_HINT}</span>
            )}
          </Callout>
        ))}
        {delivery.waiting > 0 && (
          <p className="hqdata-sending">
            {waitingWords(delivery.waiting, formatNumber(delivery.waiting))}
            <Link className="text-link" href="/mail/merge">
              Mail merge
            </Link>
            .
          </p>
        )}
        <p className="hqdata-readouts hqdata-delivery__links">
          <Link href="/data/waitlist/batches">Batches</Link>
          {" · "}
          <Link href="/mail/merge">Mail merge</Link>
        </p>
      </div>
    </RecordSection>
  );
}
