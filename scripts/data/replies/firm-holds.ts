/**
 * The firm hold (raise spec §7.2.2): when someone at a firm replies and "Hold the rest of
 * their firm" is ticked, every other lead at their domain who is not on the stop list yet,
 * written to or not, goes onto Mail merge's own stop list as "Added by hand", so nobody
 * else there is written to while he answers. Never the replier, never the person a "Wrong
 * person" named, never for an out-of-office reply, a reply that needs review (it does
 * nothing but leave a follow-up, spec §0) or a free-mail address, and never more than 200
 * at once.
 *
 * A hold is that one `addStops` call plus a record here naming exactly the addresses it
 * put on the list, with the list's own stamp for each. Releasing it (from Replies, or by
 * taking the reply back) takes off only those entries, by the rules of the waitlist's
 * holds: an entry put back since for another reason, or a person who said no, stays on
 * the stop list, with the reason. There is no other stop list.
 */

import { randomUUID } from "node:crypto";

import { Refused } from "../../mail-merge/engine";
import type { DataCore } from "../core";
import { normaliseEmail } from "../guard";
import type { Staff } from "../protocol";
import type { LeadsService } from "../leads/contracts";

export const FIRM_HOLDS = "replies/firm-holds.json";
/** Above this many addresses at once nothing is held: the sentence says how many there are. */
export const FIRM_HOLD_CAP = 200;

export type FirmHold = {
  hold_id: string;
  reply_id: string;
  /** The domain the hold covers. */
  firm_key: string;
  /** Exactly the addresses this hold put on the stop list. */
  emails: string[];
  /** The stop list's own stamp for each, so a release takes off only the hold's own entry. */
  stopped_at: Record<string, string>;
  made_at: string;
  made_by: Staff;
  released: { email: string; at: string; by: Staff }[];
};

type Stored = { format: 1; holds: FirmHold[] };

const isHold = (value: unknown): value is FirmHold => {
  const hold = value as Partial<FirmHold> | null;
  return (
    typeof hold?.hold_id === "string" &&
    typeof hold.reply_id === "string" &&
    typeof hold.firm_key === "string" &&
    Array.isArray(hold.emails) &&
    Array.isArray(hold.released)
  );
};

/** Every firm hold, kept whole in `replies/firm-holds.json`. */
export class FirmHolds {
  readonly #store: DataCore["store"];
  holds: FirmHold[];
  /** Address → the hold that still holds it: asked for every stopped lead's status. */
  readonly #holding = new Map<string, FirmHold>();

  constructor(store: DataCore["store"]) {
    this.#store = store;
    const stored = store.readJson<Partial<Stored> | null>(FIRM_HOLDS, null);
    this.holds = Array.isArray(stored?.holds)
      ? stored.holds.filter(isHold).map((hold) => ({ ...hold, stopped_at: hold.stopped_at ?? {} }))
      : [];
    this.#reindex();
  }

  #reindex(): void {
    this.#holding.clear();
    for (const hold of this.holds)
      for (const email of this.open(hold)) this.#holding.set(email, hold);
  }

  save(): void {
    const stored: Stored = { format: 1, holds: this.holds };
    this.#store.writeJson(FIRM_HOLDS, stored);
    this.#reindex();
  }

  get(holdId: string): FirmHold | null {
    return this.holds.find((hold) => hold.hold_id === holdId) ?? null;
  }

  forReply(replyId: string): FirmHold | null {
    return this.holds.find((hold) => hold.reply_id === replyId) ?? null;
  }

  /** The addresses of a hold not yet released. */
  open(hold: FirmHold): string[] {
    const released = new Set(hold.released.map((item) => item.email));
    return hold.emails.filter((email) => !released.has(email));
  }

  /** The hold that still holds an address, if one does. */
  holding(email: string): FirmHold | null {
    return this.#holding.get(email) ?? null;
  }

  add(hold: FirmHold): void {
    this.holds.push(hold);
    this.save();
  }
}

export type FirmHoldContext = {
  core: DataCore;
  leads: LeadsService;
  holds: FirmHolds;
  /** Whether a reply from this address that said no still stands. */
  saidNo: (email: string) => boolean;
  /** The leads index works statuses out again: a hold changes what a stop reads as. */
  refresh: () => void;
};

const plural = (count: number, one: string, many: string) =>
  `${count.toLocaleString("en-GB")} ${count === 1 ? one : many}`;

export type HoldOutcome =
  | { kind: "skipped" }
  | { kind: "nobody"; already: number }
  | { kind: "too_many"; domain: string; count: number; sentence: string }
  | { kind: "failed"; domain: string; sentence: string }
  | { kind: "held"; hold: FirmHold; already: number; sentence: string };

/**
 * Hold the rest of the replier's firm: one engine call, and a record of exactly what it
 * put on the stop list. `named` is the address a "Wrong person" named (left out too).
 */
export async function holdTheFirm(
  input: {
    reply_id: string;
    email: string;
    email_kind: string;
    outcome: string;
    named: string;
    by: Staff;
  },
  context: FirmHoldContext,
): Promise<HoldOutcome> {
  const { core, leads, holds } = context;
  if (input.outcome === "out_of_office" || input.outcome === "needs_review")
    return { kind: "skipped" };
  const domain = leads.firmKeyOf(input.email, input.email_kind);
  if (!domain) return { kind: "skipped" };
  core.sender.poll();
  const others = [
    ...new Set(
      leads
        .atFirm(domain)
        .map((lead) => lead.email)
        .filter((email) => email !== input.email && email !== input.named),
    ),
  ].sort();
  const already = others.filter((email) => core.sender.isStopped(email));
  const asking = others.filter((email) => !core.sender.isStopped(email));
  if (asking.length === 0) return { kind: "nobody", already: already.length };
  if (asking.length > FIRM_HOLD_CAP)
    return {
      kind: "too_many",
      domain,
      count: asking.length,
      sentence: `There are ${plural(asking.length, "other address", "other addresses")} at ${domain}, too many to hold at once: none were held.`,
    };
  try {
    await core.engine("addStops", { emails: asking.join(" "), reason: "manual" });
  } catch {
    core.log("a firm hold could not reach the stop list");
    return {
      kind: "failed",
      domain,
      sentence: `The rest of ${domain} could not be held just now: a follow-up for today asks you to.`,
    };
  }
  core.sender.poll();
  // What this call put there: stopped now, and not before it.
  const added = asking.filter((email) => core.sender.isStopped(email));
  if (added.length === 0) return { kind: "nobody", already: already.length };
  const hold: FirmHold = {
    hold_id: randomUUID(),
    reply_id: input.reply_id,
    firm_key: domain,
    emails: added,
    stopped_at: Object.fromEntries(
      added.map((email) => [email, core.sender.stop(email)?.at ?? ""]),
    ),
    made_at: core.now(),
    made_by: input.by,
    released: [],
  };
  holds.add(hold);
  context.refresh();
  core.log(`firm hold made: ${added.length} held`);
  return {
    kind: "held",
    hold,
    already: already.length,
    sentence: `${plural(added.length, "other address", "other addresses")} at ${domain} ${added.length === 1 ? "is" : "are"} held: nobody else there is written to.`,
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
  return out.slice(0, FIRM_HOLD_CAP);
}

/**
 * Why a held address must stay on the stop list after its hold is released, or null when
 * the entry there is still the hold's own and nothing else needs it.
 */
function stillNeeded(hold: FirmHold, email: string, context: FirmHoldContext): string | null {
  const stop = context.core.sender.stop(email);
  if (!stop) return null;
  if (context.saidNo(email) || context.leads.byEmail(email)?.status === "no") return "they said no";
  const madeAt = hold.stopped_at[email];
  if (stop.reason !== "manual" || (madeAt !== undefined && madeAt !== "" && stop.at !== madeAt))
    return "it was put on the stop list again since, for another reason";
  return null;
}

export type Release = {
  /** Off the stop list now: taken off, or already off it. */
  released: string[];
  /** Of those, the ones that were not on the stop list any more. */
  not_stopped: string[];
  /** Let go by the hold, but staying on the stop list, each with the reason. */
  kept: { email: string; why: string }[];
};

/**
 * Release a hold, whole or address by address: off the stop list only what it put there,
 * and only while it is still the hold's entry and nobody's "no" needs it.
 */
export async function releaseFirmHold(
  hold: FirmHold,
  given: unknown,
  by: Staff,
  context: FirmHoldContext,
): Promise<Release> {
  const { core, holds } = context;
  const open = holds.open(hold);
  const asked = given === undefined || given === null ? open : emailList(given);
  const releasing = asked.filter((email) => open.includes(email));
  if (releasing.length === 0)
    throw new Refused(409, "nothing_held", "Nothing in that hold is still held back.");
  core.sender.poll();
  const result: Release = { released: [], not_stopped: [], kept: [] };
  try {
    for (const email of releasing) {
      const why = stillNeeded(hold, email, context);
      if (why) result.kept.push({ email, why });
      else if (core.sender.isStopped(email)) {
        try {
          await core.engine("removeStop", { email });
        } catch (error) {
          // Already gone from the stop list: nothing to take off, the release still stands.
          if (!(error instanceof Refused && error.code === "not_found")) throw error;
          result.not_stopped.push(email);
        }
        result.released.push(email);
      } else {
        result.not_stopped.push(email);
        result.released.push(email);
      }
      hold.released.push({ email, at: core.now(), by });
    }
  } finally {
    // Whatever came off before a failure is recorded as released, so the record stays true.
    holds.save();
    core.sender.poll();
    context.refresh();
  }
  core.log(`firm hold released: ${result.released.length} off, ${result.kept.length} kept`);
  return result;
}

/** "Released 2." or "Released 1; 1 stays on the stop list: c@x.example (they said no)." */
export function releaseSentence(result: Release): string {
  const done = `Released ${result.released.length.toLocaleString("en-GB")}`;
  if (result.kept.length === 0) return `${done}.`;
  const reasons = result.kept.map((item) => `${item.email} (${item.why})`).join("; ");
  return `${done}; ${plural(result.kept.length, "stays", "stay")} on the stop list: ${reasons}.`;
}
