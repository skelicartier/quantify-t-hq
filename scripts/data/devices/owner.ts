/**
 * The Owner-only link of a device to a person in the people ledger (ws-notes/security/spec.md
 * §2 rules 1–2, §3.5, §13.1 choice 2). It lives apart from the records, in
 * `devices/owner/links.json` (`{ format: 1, devices: Record<device_id, person_id> }`) and
 * `devices/owner/events.jsonl` (the verb only), so the device records hold nothing from the
 * ledger and a backup an Admin makes leaves the folder out (`OWNER_FOLDERS`). Only a caller
 * asked as the Owner reads it; nothing here is logged anywhere else.
 */

import { randomUUID } from "node:crypto";

import type { DataCore } from "../core";
import type { Staff } from "../protocol";
import type { OwnerEvent } from "./types";

const LINKS = "devices/owner/links.json";
const EVENTS = "devices/owner/events.jsonl";

export class OwnerLinks {
  readonly #core: DataCore;
  #links: Map<string, string>;

  constructor(core: DataCore) {
    this.#core = core;
    core.store.ensureDir("devices/owner");
    const stored = core.store.readJson<{ devices?: unknown }>(LINKS, {});
    const raw = stored.devices && typeof stored.devices === "object" ? stored.devices : {};
    this.#links = new Map(
      Object.entries(raw as Record<string, unknown>).filter(
        (entry): entry is [string, string] => typeof entry[1] === "string" && entry[1] !== "",
      ),
    );
  }

  personOf(deviceId: string): string | null {
    return this.#links.get(deviceId) ?? null;
  }

  devicesOf(personId: string): string[] {
    return [...this.#links].filter(([, person]) => person === personId).map(([device]) => device);
  }

  /** Link (or, with null, unlink) a device; answers whether it is linked now. */
  set(deviceId: string, personId: string | null, by: Staff): boolean {
    const before = this.#links.get(deviceId) ?? null;
    if (before === personId) return personId !== null;
    if (personId === null) this.#links.delete(deviceId);
    else this.#links.set(deviceId, personId);
    this.#core.store.writeJson(LINKS, {
      format: 1,
      devices: Object.fromEntries(this.#links),
    });
    const line: OwnerEvent = {
      event_id: randomUUID(),
      device_id: deviceId,
      verb: personId === null ? "unlinked" : "linked",
      by,
      at: this.#core.now(),
    };
    this.#core.store.appendLine(EVENTS, line);
    return personId !== null;
  }

  eventsOf(deviceId: string): OwnerEvent[] {
    return this.#core.store
      .readLines<OwnerEvent>(EVENTS)
      .filter((event) => event?.device_id === deviceId)
      .reverse();
  }
}
