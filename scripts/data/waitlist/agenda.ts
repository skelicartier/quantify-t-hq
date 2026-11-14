/**
 * The waitlist in the calendar (raise spec §7.4, item 3): each firm's next step on its
 * day, and each dropped firm's "look again" day, overdue ones included. The title names
 * the firm; "Kinds only" reads "Waitlist next step" or "Waitlist: look again".
 */

import type { DataCore } from "../core";
import { WAITLIST_STAGES } from "../../../src/lib/data/labels";
import { agendaService, type AgendaItem, type AgendaSource } from "../raise-contracts";
import type { Book } from "./entries";

export function waitlistAgenda(book: Book): AgendaSource {
  return {
    agenda: (): AgendaItem[] => {
      const items: AgendaItem[] = [];
      for (const entry of book.entries) {
        const href = `/data/waitlist/${entry.entry_id}`;
        if (entry.stage === "dropped") {
          const on = entry.dropped?.look_again_on;
          if (on)
            items.push({
              key: `waitlist:${entry.entry_id}:look-again`,
              kind: "waitlist",
              title: `Look again at ${entry.firm}`,
              plain: "Waitlist: look again",
              sub: WAITLIST_STAGES.dropped.label,
              on,
              remind_days: [0],
              href,
            });
          continue;
        }
        if (!entry.next_step || !entry.next_step_on) continue;
        items.push({
          key: `waitlist:${entry.entry_id}`,
          kind: "waitlist",
          title: `${entry.next_step} · ${entry.firm}`,
          plain: "Waitlist next step",
          sub: WAITLIST_STAGES[entry.stage].label,
          on: entry.next_step_on,
          remind_days: [0],
          href,
        });
      }
      return items;
    },
  };
}

export function registerWaitlistAgenda(core: DataCore, book: Book): void {
  core.provide(agendaService("waitlist"), waitlistAgenda(book));
}
