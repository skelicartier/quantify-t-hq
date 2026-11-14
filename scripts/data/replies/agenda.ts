/**
 * Follow-ups in the calendar (raise spec §7.4, item 2): every open follow-up, overdue ones
 * included, on its due day, reminded on the day. The title names the person; "Kinds only"
 * reads "Follow-up".
 */

import type { DataCore } from "../core";
import type { LeadsService } from "../leads/contracts";
import { agendaService, type AgendaItem, type AgendaSource } from "../raise-contracts";
import type { FollowUps } from "./follow-ups";

export function repliesAgenda(followUps: FollowUps, leads: LeadsService): AgendaSource {
  return {
    agenda: (): AgendaItem[] =>
      followUps.open().map((item) => ({
        key: `follow_up:${item.follow_up_id}`,
        kind: "follow_up",
        title: item.title,
        plain: "Follow-up",
        sub: [item.name, leads.byEmail(item.email)?.company].filter(Boolean).join(" · "),
        on: item.due_on,
        remind_days: [0],
        href: `/data/leads/${item.lead_id}`,
      })),
  };
}

export function registerRepliesAgenda(
  core: DataCore,
  followUps: FollowUps,
  leads: LeadsService,
): void {
  core.provide(agendaService("replies"), repliesAgenda(followUps, leads));
}
