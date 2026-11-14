/**
 * `GET /data/overview`: what happened today and what is owed, in honest counts. The
 * sending figures come straight from Mail merge's written log (live sends only: tests and
 * practice are never in it); every other block is given by the module that owns it, and is
 * simply absent until that module exists.
 */

import type { DataCore, DueItem } from "./core";
import { lastDays, localDay } from "./days";
import type { Written } from "./sender-files";

export type Overview = {
  /** This Mac's day, YYYY-MM-DD. */
  today: string;
  sent_today: number;
  /** The last 7 local days, oldest first. */
  week: { day: string; sent: number }[];
  sending: { mailing_id: string; name: string } | null;
  due: DueItem[];
  [block: string]: unknown;
};

/** The overview from its parts; pure, so the arithmetic can be checked by hand. */
export function overviewOf(input: {
  today: string;
  written: readonly Written[];
  sending: { mailing_id: string; name: string } | null;
  due: DueItem[];
  parts: Record<string, unknown>;
}): Overview {
  const days = lastDays(input.today, 7);
  const counts = new Map<string, number>(days.map((day) => [day, 0]));
  for (const line of input.written) {
    const day = localDay(line.at);
    const count = counts.get(day);
    if (count !== undefined) counts.set(day, count + 1);
  }
  const blocks: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input.parts)) {
    // The figures of the core are the core's; a block may not overwrite them.
    if (["today", "sent_today", "week", "sending", "due"].includes(key)) continue;
    blocks[key] = value;
  }
  return {
    ...blocks,
    today: input.today,
    sent_today: counts.get(input.today) ?? 0,
    week: days.map((day) => ({ day, sent: counts.get(day) ?? 0 })),
    sending: input.sending,
    due: input.due,
  };
}

export function registerOverview(core: DataCore): void {
  core.route("GET", "/data/overview", async (ctx) => {
    core.sender.poll();
    return overviewOf({
      today: core.day(),
      written: core.sender.written(),
      sending: core.sender.sending(),
      due: await core.dueItems({ owner: ctx.query.get("owner") === "1" }),
      parts: await core.overviewParts(),
    });
  });
}
