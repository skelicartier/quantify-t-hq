/**
 * Batches: each mailing sent for real, followed from Mail merge's record of it to the
 * waitlist (ws-notes/delivery/spec.md §7.2). `GET /data/batches` is the funnel, counted at
 * request time from the written log, the delivery read-back, the recorded replies and the
 * waitlist's stages; the overview's "Delivery, last 7 days" block is the week's counts with
 * the contract's warnings. This module stores nothing of its own and changes nothing: no
 * send, pause or stop comes from here.
 *
 * Under test routes only, `POST /data/_test/batches/delivery` installs a stand-in for the
 * `delivery` service while the real one is absent, and never over it.
 */

import { RAISE_SERVICES, type RepliesFeed, type WaitlistFeed } from "../raise-contracts";
import type { Answer, DataCore } from "../core";
import type { WaitlistService } from "../leads/contracts";
import {
  DELIVERY_SERVICE,
  NO_COUNTS,
  WEEK_MS,
  warningsOf,
  type DeliveryFeed,
  type MailingDelivery,
} from "../../../src/lib/merge/delivery-contracts";
import { funnelOf, type FunnelInput } from "./funnel";
import { standInDelivery } from "./stand-in";

const LIST_GONE = "A list no longer there";

export function register(core: DataCore): void {
  const feed = () => core.need<DeliveryFeed>(DELIVERY_SERVICE);

  /** Every mailing with a live send: the ones Mail merge still holds, then the deleted ones. */
  const liveMailings = (): FunnelInput["mailings"] => {
    const named = new Map<string, string>();
    for (const line of core.sender.written())
      if (!named.has(line.mailing_id)) named.set(line.mailing_id, line.mailing);
    const mailings: FunnelInput["mailings"] = [];
    for (const [mailingId, writtenName] of named) {
      const mailing = core.sender.mailing(mailingId);
      mailings.push(
        mailing
          ? {
              mailing_id: mailingId,
              name: mailing.name,
              list_ids: [...mailing.list_ids],
              lists: mailing.list_ids.map((id) => core.sender.list(id)?.name ?? LIST_GONE),
            }
          : // Deleted in Mail merge: the row stays, named as the send was.
            { mailing_id: mailingId, name: writtenName || "A mailing", list_ids: [], lists: [] },
      );
    }
    return mailings;
  };

  core.route("GET", "/data/batches", (): Answer => {
    core.sender.poll();
    const delivery = feed();
    const replies = core.need<RepliesFeed>(RAISE_SERVICES.repliesFeed);
    const waitlistFeed = core.need<WaitlistFeed>(RAISE_SERVICES.waitlistFeed);
    const waitlist = core.need<WaitlistService>("waitlist");
    const mailings = liveMailings();
    const gone = mailings
      .filter((mailing) => core.sender.mailing(mailing.mailing_id) === null)
      .map((mailing) => mailing.mailing_id);

    let read: Map<string, MailingDelivery> | null = null;
    if (delivery) {
      read = new Map();
      for (const mailing of mailings) {
        const found = delivery.mailing(mailing.mailing_id);
        if (found) read.set(mailing.mailing_id, found);
      }
    }
    const stages = new Map<string, { stage: string; reached: Set<string> }>();
    if (waitlistFeed) {
      for (const entry of waitlistFeed.entries())
        stages.set(entry.entry_id, { stage: entry.stage, reached: new Set() });
      for (const move of waitlistFeed.moves()) stages.get(move.entry_id)?.reached.add(move.to);
    }
    const entries = new Map<string, { entry_id: string; firm: string } | null>();
    const entryOf = (email: string) => {
      if (!waitlist) return null;
      if (!entries.has(email)) {
        const entry = waitlist.forEmail(email);
        entries.set(email, entry ? { entry_id: entry.entry_id, firm: entry.firm } : null);
      }
      return entries.get(email) ?? null;
    };

    return {
      today: core.day(),
      read: delivery ? delivery.state() : null,
      loaded: {
        delivery: delivery !== null,
        replies: replies !== null,
        waitlist: waitlist !== null && waitlistFeed !== null,
      },
      // Deleted in Mail merge since they went out: their rows stay, without a link.
      gone,
      funnel: funnelOf({
        mailings,
        written: core.sender.written(),
        delivery: read,
        replies: replies ? replies.all() : [],
        entryOf,
        stages,
      }),
    };
  });

  // An overview provider must answer an object: without the feed it says so, and never throws.
  core.provideOverview("delivery", (): Answer => {
    const since = new Date(Date.parse(core.now()) - WEEK_MS).toISOString();
    const delivery = feed();
    if (!delivery)
      return {
        loaded: false,
        since,
        counts: { ...NO_COUNTS },
        warnings: [],
        read_at: null,
        waiting: 0,
      };
    const counts = delivery.since(since);
    const state = delivery.state();
    return {
      loaded: true,
      since,
      counts,
      warnings: warningsOf(counts, "week"),
      read_at: state.last_read_at,
      waiting: state.waiting,
    };
  });

  if (core.testRoutes) {
    let fake: DeliveryFeed | null = null;
    core.route("POST", "/data/_test/batches/delivery", (ctx) => {
      ctx.staff();
      const current = feed();
      if (ctx.body.on === false) {
        if (current !== null && current === fake) core.provide(DELIVERY_SERVICE, null);
        fake = null;
        return { installed: false };
      }
      if (current !== null && current !== fake) return { installed: false, real: true };
      if (current === null || fake === null) {
        fake = standInDelivery(core);
        core.provide(DELIVERY_SERVICE, fake);
      }
      return { installed: true };
    });
  }
}
