/**
 * Key dates in the calendar (raise spec §7.4, item 1; company spec §6.6): every date still
 * owed (coming up or in progress, overdue ones included), on its due day, reminded as many
 * days before as the date asks. A date he typed holds no names, so its full title and its
 * kinds-only title are the same; a date a record added may name a firm or a director in its
 * title, so its kinds-only title is the rule's own ("PAS-3 (return of allotment)").
 */

import { ruleOf } from "../company-contracts";
import type { DataCore } from "../core";
import { DATE_KINDS } from "../../../src/lib/data/labels";
import { agendaService, type AgendaItem, type AgendaSource } from "../raise-contracts";
import { openDate, type DatesBook, type KeyDate } from "./book";

/** The title with no name in it: the rule's title for a date from a record. */
export function plainOf(date: Pick<KeyDate, "title" | "origin" | "rule_key">): string {
  if (!date.origin) return date.title;
  if (date.rule_key) return ruleOf(date.rule_key).title;
  return date.title.split(":")[0]?.trim() || "Key date";
}

export function datesAgenda(book: DatesBook): AgendaSource {
  return {
    agenda: (): AgendaItem[] =>
      book.dates.filter(openDate).map((date) => ({
        key: `key_date:${date.date_id}`,
        kind: "key_date",
        title: date.title,
        plain: plainOf(date),
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
