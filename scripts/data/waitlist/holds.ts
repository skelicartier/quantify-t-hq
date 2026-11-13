/**
 * Holding back a firm's unsent addresses once it has joined (spec §3.8.2): only when the
 * founder presses, after a preview. A hold is Mail merge's own stop list (one `addStops`
 * with reason "manual" through the engine bridge) plus a record here naming exactly the
 * addresses that call added. Release takes off only those, and only while they are still
 * stopped. There is no other stop list, and nothing is held because a yes arrived.
 */

import { randomUUID } from "node:crypto";

import { Refused } from "../../mail-merge/engine";
import type { DataCore } from "../core";
import { normaliseEmail } from "../guard";
import type { Staff } from "../protocol";
import type { LeadsService } from "../leads/contracts";
import { isFreeMail, type Book, type WaitlistEntry } from "./entries";

export const HOLDS = "waitlist/holds.json";
/** At this many addresses on file a firm may have teams who decide for themselves. */
export const LARGE_FIRM = 10;
export const HOLD_CAP = 200;
export const HOLD_REASON = "Firm already joined";

export type Hold = {
  hold_id: string;
  entry_id: string;
  domain: string;
  /** Exactly the addresses this hold put on the stop list. */
  emails: string[];
  /**
   * The stop list's own time for each entry this hold made: a release takes off only an
   * entry that is still that one (not one put back later by hand, by a bounce or by a no).
   */
  stopped_at?: Record<string, string>;
  made_at: string;
  made_by: Staff;
  released: { email: string; at: string; by: Staff }[];
};

export type Candidate = { email: string; name: string; title: string; lists: string[] };

export class Holds {
  readonly #store: DataCore["store"];
  holds: Hold[];
  /** Address → the hold that still holds it: asked for every stopped lead's status. */
  readonly #holding = new Map<string, Hold>();

  constructor(store: DataCore["store"]) {
    this.#store = store;
    const stored = store.readJson<Hold[]>(HOLDS, []);
    this.holds = Array.isArray(stored)
      ? stored.filter(
          (hold) =>
            typeof hold?.hold_id === "string" &&
            Array.isArray(hold.emails) &&
            Array.isArray(hold.released),
        )
      : [];
    this.#reindex();
  }

  #reindex(): void {
    this.#holding.clear();
    for (const hold of this.holds)
      for (const email of this.open(hold)) this.#holding.set(email, hold);
  }

  save(): void {
    this.#store.writeJson(HOLDS, this.holds);
    this.#reindex();
  }

  get(holdId: string): Hold | null {
    return this.holds.find((hold) => hold.hold_id === holdId) ?? null;
  }

  forEntry(entryId: string): Hold[] {
    return this.holds.filter((hold) => hold.entry_id === entryId);
  }

  /** The addresses of a hold not yet released. */
  open(hold: Hold): string[] {
    const released = new Set(hold.released.map((item) => item.email));
    return hold.emails.filter((email) => !released.has(email));
  }

  /** The hold that still holds an address, if one does. */
  holding(email: string): Hold | null {
    return this.#holding.get(email) ?? null;
  }
}

/** The people who said yes at a firm: never offered for a hold. */
function saidYes(entry: WaitlistEntry): Set<string> {
  const yes = new Set([entry.contact_email]);
  for (const person of entry.people) if (person.added === "reply") yes.add(person.email);
  return yes;
}

/**
 * Who a hold would cover: every lead at the firm key never written to, not on the stop
 * list (so not already held), and not someone who said yes. Free mail is never grouped.
 */
export function candidates(entry: WaitlistEntry, leads: LeadsService): Candidate[] {
  if (isFreeMail(entry)) return [];
  const yes = saidYes(entry);
  return leads
    .unsentAt(entry.firm_key)
    .filter((item) => !yes.has(item.email))
    .map((item) => ({ ...item, lists: item.lists.filter(Boolean) }))
    .sort((a, b) => a.email.localeCompare(b.email));
}

export function preview(
  entry: WaitlistEntry,
  leads: LeadsService,
): {
  candidates: Candidate[];
  people_at_domain: number;
  large: boolean;
  free_mail: boolean;
  domain: string;
} {
  const free = isFreeMail(entry);
  const atDomain = free ? 0 : leads.atFirm(entry.firm_key).length;
  return {
    candidates: candidates(entry, leads),
    people_at_domain: atDomain,
    large: atDomain >= LARGE_FIRM,
    free_mail: free,
    domain: entry.domain,
  };
}

function emailList(value: unknown): string[] {
  const items = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(/[\s,;]+/)
      : [];
  const out: string[] = [];
  for (const item of items) {
    const email = typeof item === "string" ? normaliseEmail(item.trim()) : "";
    if (email && !out.includes(email)) out.push(email);
  }
  return out;
}

export type HoldContext = {
  core: DataCore;
  book: Book;
  holds: Holds;
  leads: LeadsService;
  /** The leads index recomputes statuses; a hold changes what a stop reads as. */
  refresh: () => void;
};

/** Hold back the ticked addresses: one engine call, and a record of exactly what it added. */
export async function holdBack(
  entry: WaitlistEntry,
  given: unknown,
  by: Staff,
  context: HoldContext,
): Promise<{ hold: Hold | null; added: string[]; already: string[]; skipped: string[] }> {
  const { core, book, holds, leads } = context;
  const asked = emailList(given);
  if (asked.length === 0) throw new Refused(400, "invalid", "Tick the addresses to hold back.");
  if (asked.length > HOLD_CAP)
    throw new Refused(400, "invalid", `Hold back ${HOLD_CAP} at most at a time.`);
  if (isFreeMail(entry))
    throw new Refused(409, "free_mail", "Free-mail addresses are not grouped by firm.");
  const offered = new Set(candidates(entry, leads).map((item) => item.email));
  core.sender.poll();
  const already = asked.filter((email) => core.sender.isStopped(email));
  // Only addresses the preview offers: a lead at the firm, never written to, not stopped.
  const skipped = asked.filter((email) => !offered.has(email) && !already.includes(email));
  const asking = asked.filter((email) => offered.has(email) && !already.includes(email));
  if (asking.length === 0) return { hold: null, added: [], already, skipped };
  await core.engine("addStops", { emails: asking.join(" "), reason: "manual" });
  core.sender.poll();
  // What this call added: stopped now, and not before it.
  const added = asking.filter((email) => core.sender.isStopped(email));
  const at = core.now();
  let hold: Hold | null = null;
  if (added.length > 0) {
    hold = {
      hold_id: randomUUID(),
      entry_id: entry.entry_id,
      domain: entry.domain,
      emails: added,
      stopped_at: Object.fromEntries(
        added.map((email) => [email, core.sender.stop(email)?.at ?? ""]),
      ),
      made_at: at,
      made_by: by,
      released: [],
    };
    holds.holds.push(hold);
    holds.save();
    book.log({
      entry_id: entry.entry_id,
      kind: "hold",
      at,
      by,
      text: `Held back ${added.length.toLocaleString("en-GB")} unsent ${added.length === 1 ? "address" : "addresses"}`,
    });
  }
  context.refresh();
  return { hold, added, already, skipped };
}

/**
 * Why a held address must stay on the stop list after its hold is released, or null when
 * the entry there is still the hold's own and nothing else needs it.
 */
function stillNeeded(hold: Hold, email: string, context: HoldContext): string | null {
  const stop = context.core.sender.stop(email);
  if (!stop) return null;
  const madeAt = hold.stopped_at?.[email];
  if (stop.reason !== "manual" || (madeAt !== undefined && madeAt !== "" && stop.at !== madeAt))
    return "it was put on the stop list again since, for another reason";
  if (context.leads.byEmail(email)?.status === "no") return "they said no";
  return null;
}

/**
 * Release a hold, whole or address by address: off the stop list only what it put there,
 * and only while it is still the hold's entry and nobody's "no" needs it (spec §3.8.2).
 */
export async function release(
  hold: Hold,
  given: unknown,
  by: Staff,
  context: HoldContext,
): Promise<{
  released: string[];
  not_stopped: string[];
  kept: { email: string; why: string }[];
}> {
  const { core, book, holds } = context;
  const open = holds.open(hold);
  const asked = given === undefined || given === null ? open : emailList(given);
  const releasing = asked.filter((email) => open.includes(email));
  if (releasing.length === 0)
    throw new Refused(409, "nothing_held", "Nothing in that hold is still held back.");
  core.sender.poll();
  const released: string[] = [];
  const notStopped: string[] = [];
  const kept: { email: string; why: string }[] = [];
  try {
    for (const email of releasing) {
      const why = stillNeeded(hold, email, context);
      if (why) kept.push({ email, why });
      else if (core.sender.isStopped(email)) {
        try {
          await core.engine("removeStop", { email });
        } catch (error) {
          // Already gone from the stop list: nothing to take off, the release still stands.
          if (!(error instanceof Refused && error.code === "not_found")) throw error;
          notStopped.push(email);
        }
      } else notStopped.push(email);
      hold.released.push({ email, at: core.now(), by });
      released.push(email);
    }
  } finally {
    // Whatever came off before a failure is recorded as released, so the record stays true.
    holds.save();
    core.sender.poll();
    if (released.length > 0)
      book.log({
        entry_id: hold.entry_id,
        kind: "release",
        at: core.now(),
        by,
        text: `Released ${released.length.toLocaleString("en-GB")} ${released.length === 1 ? "address" : "addresses"}`,
      });
    context.refresh();
  }
  return { released, not_stopped: notStopped, kept };
}
