/**
 * Key dates in the calendar (raise spec §7.4, item 1): every date still coming up, overdue
 * ones included, on its due day, reminded as many days before as the date asks. Key dates
 * hold no names, so the full title and the kinds-only title are the same.
 */

import type { DataCore } from "../core";
import { DATE_KINDS } from "../../../src/lib/data/labels";
import { agendaService, type AgendaItem, type AgendaSource } from "../raise-contracts";
import type { DatesBook } from "./book";

export function datesAgenda(book: DatesBook): AgendaSource {
  return {
    agenda: (): AgendaItem[] =>
      book.dates
        .filter((date) => date.state === "coming_up")
        .map((date) => ({
          key: `key_date:${date.date_id}`,
          kind: "key_date",
          title: date.title,
          plain: date.title,
          sub: [DATE_KINDS[date.kind], date.entity].filter(Boolean).join(" · "),
          on: date.due_on,
          remind_days: [date.remind_days],
          href: `/data/dates#date-${date.date_id}`,
        })),
  };
}

export function registerDatesAgenda(core: DataCore, book: DatesBook): void {
  core.provide(agendaService("dates"), datesAgenda(book));
}
