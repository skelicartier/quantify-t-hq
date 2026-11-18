/**
 * Delivery, for the rest of Data (ws-notes/delivery/spec.md §6.11): what the provider said
 * happened to each live message, as Mail merge's sender read it back and wrote it under
 * `delivery/` in its own folder. This module only reads those files and provides the typed
 * service `delivery`; it asks the sender nothing (its four calls stay four), writes nothing
 * into Mail merge's folder, and is provided even when the folder does not exist yet.
 */

import {
  DELIVERY_SERVICE,
  countsSince,
  mailingDeliveryOf,
  waitingStopsOf,
  type DeliveryFeed,
  type MailingDelivery,
} from "../../../src/lib/merge/delivery-contracts";
import type { DataCore } from "../core";
import { normaliseEmail } from "../guard";
import { DeliveryFiles } from "./reader";

export function register(core: DataCore): void {
  const files = new DeliveryFiles(core.dir, (line) => core.log(line));

  const feed: DeliveryFeed = {
    state() {
      const state = files.state();
      if (!state)
        return { last_read_at: null, outcome: null, detail: "", auto_stop_from: null, waiting: 0 };
      const waiting = waitingStopsOf(files.files(), files.applied(), state).filter(
        (item) => !core.sender.isStopped(item.email),
      ).length;
      return {
        last_read_at: state.last_read?.at ?? null,
        outcome: state.last_read?.outcome ?? null,
        detail: state.last_read?.detail ?? "",
        auto_stop_from: state.auto_stop_from,
        waiting,
      };
    },
    mailings() {
      const out: MailingDelivery[] = [];
      for (const file of files.files()) {
        const summary = mailingDeliveryOf(file);
        if (summary) out.push(summary);
      }
      return out.sort(
        (a, b) =>
          b.first_sent_at.localeCompare(a.first_sent_at) ||
          a.mailing_id.localeCompare(b.mailing_id),
      );
    },
    mailing(mailingId) {
      const file = files.file(mailingId);
      return file ? mailingDeliveryOf(file) : null;
    },
    forEmail(email) {
      const address = normaliseEmail(email);
      return address ? files.forEmail(address) : [];
    },
    since(at) {
      return countsSince(files.files(), at);
    },
  };
  core.provide(DELIVERY_SERVICE, feed);

  if (core.testRoutes)
    core.route("GET", "/data/_test/delivery", (ctx) => ({
      state: feed.state(),
      mailings: feed.mailings(),
      for: feed.forEmail(ctx.query.get("email") ?? ""),
    }));
}
