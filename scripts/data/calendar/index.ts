/**
 * The calendar feed (raise spec §7.3): what HQ owes him, as events in the calendar on this
 * Mac. Every module with dated work offers an agenda (`agenda:<name>`); this one gathers
 * them at request time, keeps the open items within 400 days, and answers a private link.
 *
 * Calendar cannot send the portal's session, so the link's token is the key: 32 random
 * bytes, shown once to the person who made it, kept here only as its SHA-256. Making a new
 * link ends the old one; turning the feed off ends both. The token never reaches the
 * replay file: the routes that carry it take no `attempt`.
 */

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

import { Refused } from "../../mail-merge/engine";
import type { DataCore } from "../core";
import { addDays } from "../days";
import { clean, isDay } from "../guard";
import type { Staff } from "../protocol";
import {
  AGENDA_SOURCES,
  agendaService,
  type AgendaItem,
  type AgendaKind,
  type AgendaSource,
  type AgendaSourceName,
} from "../raise-contracts";

const FILE = "calendar/feed.json";
/** Items further out than this are left out; overdue ones are kept. */
export const WINDOW_DAYS = 400;
export const MAX_ITEMS = 2_000;
const TOKEN = /^[A-Za-z0-9_-]{43}$/;
const KINDS: ReadonlySet<AgendaKind> = new Set([
  "key_date",
  "investor",
  "offer_deadline",
  "waitlist",
  "follow_up",
  "file_review",
  "action",
]);

export type Detail = "full" | "plain";

export type Feed = {
  /** The SHA-256 (hex) of the link's token; null when there is no link. The token itself is never stored. */
  token_sha256: string | null;
  made_at: string | null;
  made_by: Staff | null;
  detail: Detail;
  last_read_at: string | null;
  reads: number;
};

const NO_FEED: Feed = {
  token_sha256: null,
  made_at: null,
  made_by: null,
  detail: "full",
  last_read_at: null,
  reads: 0,
};

const sha256 = (text: string): string => createHash("sha256").update(text).digest("hex");

/** What the pages see of the feed: never the token, never its hash. */
export function feedView(feed: Feed) {
  return {
    on: feed.token_sha256 !== null,
    made_at: feed.made_at,
    made_by: feed.made_by,
    detail: feed.detail,
    last_read_at: feed.last_read_at,
    reads: feed.reads,
  };
}

const detailOf = (value: unknown): Detail | null =>
  value === "full" || value === "plain" ? value : null;

/** One item as a source gave it, checked: anything malformed is left out, never sent on. */
function itemOf(value: unknown): AgendaItem | null {
  const item = value as Partial<AgendaItem> | null;
  if (!item || typeof item !== "object") return null;
  if (typeof item.key !== "string" || !item.key) return null;
  if (typeof item.kind !== "string" || !KINDS.has(item.kind)) return null;
  if (typeof item.title !== "string" || typeof item.plain !== "string") return null;
  if (!isDay(item.on)) return null;
  if (typeof item.href !== "string" || !/^\/data(?:[/#?]|$)/.test(item.href)) return null;
  const remind = Array.isArray(item.remind_days)
    ? [
        ...new Set(
          item.remind_days.filter(
            (day): day is number => Number.isInteger(day) && day >= 0 && day <= 60,
          ),
        ),
      ]
    : [];
  return {
    key: item.key.slice(0, 200),
    kind: item.kind,
    title: item.title.slice(0, 300),
    plain: item.plain.slice(0, 120),
    sub: typeof item.sub === "string" ? item.sub.slice(0, 300) : "",
    on: item.on,
    remind_days: remind,
    href: item.href.slice(0, 400),
  };
}

export async function register(core: DataCore): Promise<void> {
  core.store.ensureDir("calendar");
  const stored = core.store.readJson<{ feed?: Partial<Feed> } | null>(FILE, null);
  let feed: Feed = {
    ...NO_FEED,
    ...(stored?.feed ?? {}),
    detail: detailOf(stored?.feed?.detail) ?? "full",
  };
  const save = (next: Feed): Feed => {
    feed = next;
    core.store.writeJson(FILE, { format: 1, feed });
    return feed;
  };

  /** Every source's open items, gathered now: the 400-day window, one per key, by day. */
  const gather = (today: string) => {
    const until = addDays(today, WINDOW_DAYS);
    const sources: { name: AgendaSourceName; here: boolean; items: number }[] = [];
    const seen = new Set<string>();
    const items: AgendaItem[] = [];
    for (const name of AGENDA_SOURCES) {
      const source = core.need<AgendaSource>(agendaService(name));
      if (!source) {
        sources.push({ name, here: false, items: 0 });
        continue;
      }
      let given: unknown[] = [];
      try {
        const answer = source.agenda(today);
        given = Array.isArray(answer) ? answer : [];
      } catch (error) {
        core.log(
          `a calendar source failed: ${name}, ${error instanceof Error ? error.name : "error"}`,
        );
      }
      let count = 0;
      for (const raw of given) {
        const item = itemOf(raw);
        if (!item || item.on > until || seen.has(item.key)) continue;
        seen.add(item.key);
        items.push(item);
        count += 1;
      }
      sources.push({ name, here: true, items: count });
    }
    items.sort((a, b) => a.on.localeCompare(b.on) || a.title.localeCompare(b.title));
    return { sources, items: items.slice(0, MAX_ITEMS) };
  };

  core.route("GET", "/data/calendar", () => {
    const today = core.day();
    const { sources, items } = gather(today);
    return { feed: feedView(feed), sources, items: items.length, today };
  });

  core.route("POST", "/data/calendar/link", (ctx) => {
    const by = ctx.staff();
    // The answer carries the token, so it must never be remembered for a replay.
    if (ctx.attempt)
      throw new Refused(400, "invalid", "A calendar link is made without a replay key.");
    const token = randomBytes(32).toString("base64url");
    const next = save({
      token_sha256: sha256(token),
      made_at: core.now(),
      made_by: by,
      detail: detailOf(ctx.body.detail) ?? feed.detail,
      last_read_at: null,
      reads: 0,
    });
    core.log("a calendar link was made");
    return { token, feed: feedView(next) };
  });

  core.route("POST", "/data/calendar/detail", (ctx) => {
    ctx.staff();
    const detail = detailOf(ctx.body.detail);
    if (!detail) throw new Refused(400, "invalid", "Choose full titles or kinds only.");
    return { feed: feedView(save({ ...feed, detail })) };
  });

  core.route("POST", "/data/calendar/off", (ctx) => {
    ctx.staff();
    return { feed: feedView(save({ ...NO_FEED, detail: feed.detail })) };
  });

  core.route("GET", "/data/calendar/items", () => {
    const today = core.day();
    return { items: gather(today).items, today, detail: feed.detail };
  });

  // The calendar's own read: no person, only the token. Wrong or none: the same 404.
  core.route("POST", "/data/calendar/feed", (ctx) => {
    if (ctx.attempt) throw new Refused(404, "not_found", "Not found.");
    const token = clean(ctx.body.token, 64);
    const known = feed.token_sha256;
    if (!known || !TOKEN.test(token)) throw new Refused(404, "not_found", "Not found.");
    const given = Buffer.from(sha256(token), "hex");
    const expected = Buffer.from(known, "hex");
    if (given.length !== expected.length || !timingSafeEqual(given, expected))
      throw new Refused(404, "not_found", "Not found.");
    save({ ...feed, last_read_at: core.now(), reads: feed.reads + 1 });
    const today = core.day();
    return { items: gather(today).items, today, detail: feed.detail };
  });

  // ---------------------------------------------------------------- test routes

  if (core.testRoutes) {
    // Stand-ins for the sources other units add (raise spec §7.7); never over a real one.
    const fakes = new Map<string, AgendaSource>();
    core.route("POST", "/data/_test/calendar/source", (ctx) => {
      ctx.staff();
      const name = clean(ctx.body.name, 40) as AgendaSourceName;
      if (!AGENDA_SOURCES.includes(name))
        throw new Refused(400, "invalid", "That is not a calendar source.");
      const service = agendaService(name);
      const current = core.need<AgendaSource>(service);
      const mine = fakes.get(name);
      if (ctx.body.on === false) {
        if (mine && current === mine) core.provide(service, null);
        fakes.delete(name);
        return { installed: false };
      }
      if (current && current !== mine) return { installed: false, real: true };
      const throws = ctx.body.throws === true;
      const given = (Array.isArray(ctx.body.items) ? ctx.body.items : [])
        .map(itemOf)
        .filter((item): item is AgendaItem => item !== null);
      const fake: AgendaSource = {
        agenda: () => {
          if (throws) throw new Error("a stand-in that fails");
          return given;
        },
      };
      fakes.set(name, fake);
      core.provide(service, fake);
      return { installed: true, items: given.length };
    });
  }
}
