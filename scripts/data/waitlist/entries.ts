/**
 * The waitlist's records: one entry per firm (keyed by the firm key: the domain, or
 * "mail:" and the address for free mail), with its contact, the proof of the yes, its
 * people and their roles, how it is described to investors, and every event that ever
 * happened to it. Entries are rewritten whole; events are appended and never changed.
 */

import { randomUUID } from "node:crypto";

import type { DataStore } from "../store";
import type { Staff } from "../protocol";
import type { ColleagueRole, WaitlistStage } from "../../../src/lib/data/labels";

export const ENTRIES = "waitlist/entries.json";
export const EVENTS = "waitlist/events.jsonl";

export type Person = {
  email: string;
  role: ColleagueRole;
  /** How they came onto the firm's page: they said yes, copied on it, or added by hand. */
  added: "reply" | "copied" | "hand";
};

export type Proof = {
  reply_id: string | null;
  quote: string;
  from: string;
  subject: string;
  received_at: string | null;
  file_id: string | null;
  /** Who recorded the yes (a name), for "Recorded by {name}". */
  recorded_by: string;
};

export type WaitlistEntry = {
  entry_id: string;
  /** The domain, or "mail:" + the address for free mail (spec §3.4.6). */
  firm_key: string;
  firm: string;
  domain: string;
  firm_type: string;
  city: string;
  country: string;
  contact_email: string;
  joined_on: string;
  how_joined: string;
  proof: Proof;
  stage: WaitlistStage;
  /** The calendar day it reached its stage. */
  stage_since: string;
  next_step: string;
  next_step_on: string | null;
  call_at: string | null;
  dropped: { reason: string; look_again_on: string | null } | null;
  pilot: { starts_on: string | null; ends_on: string | null; success: string } | null;
  owner: string;
  naming: "named" | "described";
  described_as: string;
  people: Person[];
  created_at: string;
  updated_at: string;
};

export type EventKind =
  "stage" | "note" | "call" | "next_step" | "person" | "hold" | "release" | "edit" | "proof";

export type WaitlistEvent = {
  event_id: string;
  entry_id: string;
  kind: EventKind;
  at: string;
  by: Staff;
  from?: WaitlistStage;
  to?: WaitlistStage;
  text?: string;
  /** For a call: when it was held, as typed. */
  when?: string;
};

export const isFreeMail = (entry: { firm_key: string }): boolean =>
  entry.firm_key.startsWith("mail:");

/** "Fund manager" → "fund manager", "VC fund" → "VC fund": capitals kept only for acronyms. */
function quietWords(text: string): string {
  return text
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => (/^[A-Z][a-z'’-]*$/.test(word) ? word.toLowerCase() : word))
    .join(" ");
}

function upperFirst(text: string): string {
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : text;
}

/**
 * How a firm is described to investors until he edits it: the contact's title, the firm
 * type and the city, for example "General partner, fund manager in GIFT City". Never a
 * name, an address or a phone.
 */
export function describe(title: string, firmType: string, city: string): string {
  const role = upperFirst(quietWords(title.trim()));
  const kind = quietWords(firmType.trim());
  const where = city.trim();
  const who = role && kind ? `${role}, ${kind}` : role || upperFirst(kind);
  if (!who) return where ? `A firm in ${where}` : "A firm on the waitlist";
  return where ? `${who} in ${where}` : who;
}

/** Every entry and every event, as kept on disk, with the lookups the pages need. */
export class Book {
  readonly #store: DataStore;
  entries: WaitlistEntry[] = [];
  events: WaitlistEvent[] = [];
  readonly byId = new Map<string, WaitlistEntry>();
  readonly byFirm = new Map<string, WaitlistEntry>();
  /** Address → entry, for everyone on a firm's page. */
  readonly byPerson = new Map<string, WaitlistEntry>();
  readonly eventsOf = new Map<string, WaitlistEvent[]>();
  /** Test routes only: the id the next new entry takes (so the walk's screens have fixed paths). */
  pinned: string | null = null;

  constructor(store: DataStore) {
    this.#store = store;
    store.ensureDir("waitlist");
    const stored = store.readJson<WaitlistEntry[]>(ENTRIES, []);
    this.entries = Array.isArray(stored)
      ? stored.filter((entry) => typeof entry?.entry_id === "string")
      : [];
    for (const event of store.readLines<WaitlistEvent>(EVENTS))
      if (typeof event?.entry_id === "string" && typeof event.kind === "string")
        this.#keepEvent(event);
    this.reindex();
  }

  reindex(): void {
    this.byId.clear();
    this.byFirm.clear();
    this.byPerson.clear();
    for (const entry of this.entries) {
      this.byId.set(entry.entry_id, entry);
      this.byFirm.set(entry.firm_key, entry);
      for (const person of entry.people) this.byPerson.set(person.email, entry);
    }
  }

  #keepEvent(event: WaitlistEvent): void {
    this.events.push(event);
    const list = this.eventsOf.get(event.entry_id);
    if (list) list.push(event);
    else this.eventsOf.set(event.entry_id, [event]);
  }

  newId(): string {
    const pinned = this.pinned;
    this.pinned = null;
    return pinned && !this.byId.has(pinned) ? pinned : randomUUID();
  }

  add(entry: WaitlistEntry): void {
    this.entries.push(entry);
    this.save();
  }

  /** Write every entry back, and the lookups with them. */
  save(): void {
    this.#store.writeJson(ENTRIES, this.entries);
    this.reindex();
  }

  log(event: Omit<WaitlistEvent, "event_id">): WaitlistEvent {
    const kept: WaitlistEvent = { event_id: randomUUID(), ...event };
    this.#store.appendLine(EVENTS, kept);
    this.#keepEvent(kept);
    return kept;
  }

  /** One firm's events, newest first (they are kept in the order they happened). */
  timeline(entryId: string): WaitlistEvent[] {
    return [...(this.eventsOf.get(entryId) ?? [])].reverse();
  }

  /** The person on a firm's page, or null. */
  person(entry: WaitlistEntry, email: string): Person | null {
    return entry.people.find((person) => person.email === email) ?? null;
  }
}
