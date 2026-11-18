import type { ReactNode } from "react";

import { LiveRefresh } from "@/components/shell/live-refresh";
import { Callout } from "@/components/ui/callout";
import { StatusPill } from "@/components/ui/status-pill";
import { Timestamp } from "@/components/ui/timestamp";
import { formatNumber } from "@/lib/format";
import type { MergeDeliveryWarning, MergeReadView } from "@/lib/merge/api";
import {
  COMPLAINTS_HINT,
  DELIVERY_WORDS,
  type DeliveryStanding,
  type Reaction,
} from "@/lib/merge/delivery-contracts";

/**
 * Delivery read back from the provider, as Mail merge's pages show it: what happened to a
 * message after the provider accepted it. Warnings are words; nothing here pauses a send.
 */

export type DeliveryShown = DeliveryStanding | Reaction;

/** A sender's word for a standing, when it is one this portal knows. */
export function isDeliveryShown(value: string | null | undefined): value is DeliveryShown {
  return typeof value === "string" && Object.hasOwn(DELIVERY_WORDS, value);
}

export function DeliveryPill({ shown }: { shown: DeliveryShown }) {
  const words = DELIVERY_WORDS[shown];
  return <StatusPill value={shown} label={words.label} tone={words.tone} />;
}

/**
 * One callout a warning. `after` adds a line under one warning's words (which mailings,
 * what happens to the addresses); `pause` is drawn in the first callout only, and only
 * when the page hands one in: a mailing is sending, and pausing it is a press.
 */
export function DeliveryWarnings({
  warnings,
  pause,
  after,
}: {
  warnings: readonly MergeDeliveryWarning[];
  pause?: ReactNode;
  after?: (warning: MergeDeliveryWarning) => ReactNode;
}) {
  if (warnings.length === 0) return null;
  return (
    <div className="merge-delivery__warnings">
      {warnings.map((warning, index) => (
        <Callout key={warning.key} tone={warning.level} title={warning.title}>
          <p className="merge-delivery__warning-body">{warning.body}</p>
          {after?.(warning)}
          {warning.key === "complaints" && <p className="side-quiet">{COMPLAINTS_HINT}</p>}
          {index === 0 && pause && <div className="merge-delivery__act">{pause}</div>}
        </Callout>
      ))}
    </div>
  );
}

const NOT_READ =
  "Delivery has not been read yet. It is read every 30 minutes for mailings sent in the last 7 days, then once a day up to 30 days.";
const OPENS =
  "Opens and clicks are not read: privacy features open mail by themselves, so they say nothing about interest.";

/** Mail merge's home: when delivery was last read, how it went, and when it is read next. */
export function DeliveryReadLine({
  read,
  now,
  live = true,
}: {
  read: MergeReadView;
  now: number;
  /** False when the page already refreshes itself (a mailing is sending). */
  live?: boolean;
}) {
  const failed =
    read.outcome === "refused" || read.outcome === "unreachable" || read.outcome === "slowed";
  const soon = read.next_at !== null && Date.parse(read.next_at) - now < 60_000;
  return (
    <div className="merge-delivery__read">
      {!read.key_set ? (
        <p>Delivery is read back from the provider once a key is set in Setup.</p>
      ) : read.reading ? (
        <p role="status">
          Reading delivery from the provider now…{" "}
          {live && <LiveRefresh intervalSeconds={5} label="Delivery" />}
        </p>
      ) : read.last_read_at === null ? (
        <p>{NOT_READ}</p>
      ) : failed ? (
        <Callout tone="attention" compact>
          The last read did not work. {read.detail}
        </Callout>
      ) : read.outcome === "partial" ? (
        <p>
          Delivery last read <Timestamp value={read.last_read_at} now={now} mode="relative" />.{" "}
          {read.detail}
        </p>
      ) : (
        <p>
          Delivery last read <Timestamp value={read.last_read_at} now={now} mode="relative" />:{" "}
          {formatNumber(read.kept)} {read.kept === 1 ? "event" : "events"} about mail from this
          computer.
          {read.next_at !== null &&
            (soon ? (
              " Next read within a minute."
            ) : (
              <>
                {" "}
                Next read <Timestamp value={read.next_at} now={now} mode="relative" />.
              </>
            ))}
        </p>
      )}
      <p className="side-quiet">{OPENS}</p>
    </div>
  );
}
