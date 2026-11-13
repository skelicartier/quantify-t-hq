/**
 * Follow-ups: what is owed after a reply ("Answer Asha's question", "Write to Ravi again",
 * "Find an address for Meera") or added by hand. Kept whole in `replies/followups.json`.
 * A "write again" closes itself when the written log shows a newer live send to that
 * address: Mail merge wrote to them, so it is done, and it says by which mailing.
 */

import { randomUUID } from "node:crypto";

import type { DataStore } from "../store";
import type { Staff } from "../protocol";
import type { Written } from "../sender-files";
import { localDay } from "../days";
import type { FollowUp } from "../leads/contracts";
import { shortDay } from "../leads/types";

const FILE = "replies/followups.json";

/** The kinds a send closes: both mean "write to this person". */
const CLOSED_BY_SEND = new Set<FollowUp["kind"]>(["write_again", "write_to_named"]);

export class FollowUps {
  readonly #store: DataStore;
  items: FollowUp[];

  constructor(store: DataStore) {
    this.#store = store;
    store.ensureDir("replies");
    const stored = store.readJson<FollowUp[]>(FILE, []);
    this.items = Array.isArray(stored)
      ? stored.filter((item) => typeof item?.follow_up_id === "string")
      : [];
  }

  save(): void {
    this.#store.writeJson(FILE, this.items);
  }

  get(id: string): FollowUp | null {
    return this.items.find((item) => item.follow_up_id === id) ?? null;
  }

  add(input: {
    lead_id: string;
    email: string;
    name: string;
    kind: FollowUp["kind"];
    title: string;
    due_on: string;
    from_reply_id: string | null;
    note?: string;
    at: string;
  }): FollowUp {
    const item: FollowUp = {
      follow_up_id: randomUUID(),
      lead_id: input.lead_id,
      email: input.email,
      name: input.name,
      kind: input.kind,
      title: input.title,
      due_on: input.due_on,
      from_reply_id: input.from_reply_id,
      state: "open",
      created_at: input.at,
      done_at: null,
      done_by: null,
      note: input.note ?? "",
    };
    this.items.push(item);
    this.save();
    return item;
  }

  open(): FollowUp[] {
    return this.items
      .filter((item) => item.state === "open")
      .sort((a, b) => a.due_on.localeCompare(b.due_on) || a.created_at.localeCompare(b.created_at));
  }

  forEmail(email: string): FollowUp[] {
    return this.items
      .filter((item) => item.email === email)
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
  }

  done(item: FollowUp, note: string, by: Staff, at: string): FollowUp {
    item.state = "done";
    item.done_at = at;
    item.done_by = by;
    if (note) item.note = note;
    this.save();
    return item;
  }

  move(item: FollowUp, dueOn: string): FollowUp {
    item.due_on = dueOn;
    this.save();
    return item;
  }

  takeBack(item: FollowUp, by: Staff, at: string): void {
    item.state = "taken_back";
    item.done_at = at;
    item.done_by = by;
    this.save();
  }

  /**
   * Close every open "write again" whose address the written log shows a newer live send
   * to; returns the ones closed.
   */
  closeBySends(writtenFor: (email: string) => readonly Written[], today: string): FollowUp[] {
    const closed: FollowUp[] = [];
    for (const item of this.items) {
      if (item.state !== "open" || !CLOSED_BY_SEND.has(item.kind)) continue;
      const later = writtenFor(item.email)
        .filter((line) => line.at > item.created_at)
        .sort((a, b) => a.at.localeCompare(b.at))[0];
      if (!later) continue;
      item.state = "closed_by_send";
      item.done_at = later.at;
      item.done_by = null;
      item.note = `Done: written to again by “${later.mailing}” on ${shortDay(localDay(later.at), today)}`;
      closed.push(item);
    }
    if (closed.length) this.save();
    return closed;
  }
}
