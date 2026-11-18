/**
 * A stand-in for the `delivery` service, for a copy where Mail merge's read-back is not
 * loaded (ws-notes/delivery/spec.md §3.2, §7.2): it says what the stand-in provider's own
 * event mix says happened to each live send (`walkDeliveryEventsOf`), so it counts the same
 * people the same way as the real reader does over the same sends. Installed only by a
 * test route, never over a real feed. It reads Mail merge's written log and nothing else:
 * it never touches the stop list.
 */

import {
  countsOf,
  standingOf,
  walkDeliveryEventsOf,
  type AddressDelivery,
  type DeliveryFeed,
  type MailingDelivery,
  type RecipientStanding,
} from "../../../src/lib/merge/delivery-contracts";
import type { DataCore } from "../core";

type Sent = { email: string; sent_at: string; standing: RecipientStanding };
type Read = { byMailing: Map<string, { name: string; sent: Sent[] }>; lines: number };

export function standInDelivery(core: DataCore): DeliveryFeed {
  const installedAt = core.now();
  let read: Read | null = null;

  /** Every live send with its standing, by mailing; read again when the log has grown. */
  const sends = (): Read => {
    const written = core.sender.written();
    if (read && read.lines === written.length) return read;
    const byMailing: Read["byMailing"] = new Map();
    for (const line of written) {
      let mailing = byMailing.get(line.mailing_id);
      if (!mailing) {
        mailing = { name: core.sender.mailing(line.mailing_id)?.name ?? line.mailing, sent: [] };
        byMailing.set(line.mailing_id, mailing);
      }
      mailing.sent.push({
        email: line.email,
        sent_at: line.at,
        standing: standingOf(walkDeliveryEventsOf(line.email, line.at)),
      });
    }
    read = { byMailing, lines: written.length };
    return read;
  };

  const summaryOf = (mailingId: string, name: string, sent: readonly Sent[]): MailingDelivery => {
    const times = sent.map((item) => item.sent_at).sort();
    return {
      mailing_id: mailingId,
      // A mailing renamed since the log was read keeps its newest name.
      name: core.sender.mailing(mailingId)?.name ?? name,
      first_sent_at: times[0] ?? "",
      last_sent_at: times[times.length - 1] ?? "",
      read_at: installedAt,
      counts: countsOf(sent.map((item) => item.standing)),
    };
  };

  return {
    state: () => ({
      last_read_at: installedAt,
      outcome: "ok",
      detail: "",
      auto_stop_from: installedAt,
      waiting: 0,
    }),
    mailings: () =>
      [...sends().byMailing.entries()]
        .filter(([, mailing]) => mailing.sent.length > 0)
        .map(([id, mailing]) => summaryOf(id, mailing.name, mailing.sent))
        .sort((a, b) => b.first_sent_at.localeCompare(a.first_sent_at)),
    mailing: (mailingId) => {
      const mailing = sends().byMailing.get(mailingId);
      return mailing && mailing.sent.length > 0
        ? summaryOf(mailingId, mailing.name, mailing.sent)
        : null;
    },
    forEmail: (email): AddressDelivery[] =>
      core.sender
        .writtenFor(email)
        .map((line) => ({
          mailing_id: line.mailing_id,
          mailing: core.sender.mailing(line.mailing_id)?.name ?? line.mailing,
          sent_at: line.at,
          standing: standingOf(walkDeliveryEventsOf(line.email, line.at)),
        }))
        .sort((a, b) => b.sent_at.localeCompare(a.sent_at)),
    since: (at) => {
      const standings: RecipientStanding[] = [];
      for (const mailing of sends().byMailing.values())
        for (const item of mailing.sent) if (item.sent_at >= at) standings.push(item.standing);
      return countsOf(standings);
    },
  };
}
