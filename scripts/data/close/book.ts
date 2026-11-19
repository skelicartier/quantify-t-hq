/**
 * The close book (ws-notes/duties/spec.md §9.7): one record a month under `close/months/`,
 * the MIS snapshots under `close/mis/` (the last one in force), the MIS's people part under
 * `close/owner/`, and the edit log. A close is never deleted: it is reopened with a reason,
 * and every change is a line in the edit log, written before the record.
 */

import { randomUUID } from "node:crypto";

import { Refused } from "../../mail-merge/engine";
import {
  ATTACHABLE,
  CLOSE_ITEMS,
  CLOSE_ITEM_KEYS,
  REOPEN_WHY,
  SENT_BEFORE_ACK,
  lockedWords,
} from "../../../src/lib/data/labels-statements";
import type { DataCore } from "../core";
import { clean, cleanText, isDay } from "../guard";
import type { Staff } from "../protocol";
import { EditLog } from "../statements/book";
import {
  COMMENTARY_MAX,
  EDITS,
  EVENTS,
  FILES_PER_ROW,
  HOW_MAX,
  MIS_FOLDER,
  MONTHS_FOLDER,
  NAME_MAX,
  NOTE_MAX,
  OWNER_FOLDER,
  REOPEN_MAX,
  REOPEN_MIN,
} from "./limits";
import type { Close, CloseItem, CloseItemKey, MisOwnerPart, MisSnapshot } from "./types";

export const PERIOD = /^\d{4}-(0[1-9]|1[0-2])$/;

const blankItem = (): CloseItem => ({
  state: "open",
  note: "",
  file_ids: [],
  set_at: null,
  set_by: null,
});

export function blankClose(period: string): Close {
  const items = {} as Record<CloseItemKey, CloseItem>;
  for (const key of CLOSE_ITEM_KEYS) items[key] = blankItem();
  return {
    period,
    items,
    commentary: "",
    sent: null,
    acknowledged: null,
    locked: null,
    history: [],
  };
}

const STATES = new Set(["open", "ready", "none_this_month", "not_registered"]);

export class CloseBook {
  readonly #core: DataCore;
  readonly edits: EditLog;
  readonly #months = new Map<string, Close>();

  constructor(core: DataCore) {
    this.#core = core;
    core.store.ensureDir(MONTHS_FOLDER);
    core.store.ensureDir(MIS_FOLDER);
    core.store.ensureDir(OWNER_FOLDER);
    for (const period of core.store.list(MONTHS_FOLDER, ".json")) {
      if (!PERIOD.test(period)) continue;
      const stored = core.store.readJson<Partial<Close> | null>(
        `${MONTHS_FOLDER}/${period}.json`,
        null,
      );
      if (!stored || stored.period !== period) continue;
      const close = blankClose(period);
      for (const key of CLOSE_ITEM_KEYS) {
        const item = stored.items?.[key];
        if (item && STATES.has(item.state))
          close.items[key] = {
            ...blankItem(),
            ...item,
            file_ids: Array.isArray(item.file_ids) ? item.file_ids : [],
          };
      }
      close.commentary = typeof stored.commentary === "string" ? stored.commentary : "";
      close.sent = stored.sent ?? null;
      close.acknowledged = stored.acknowledged ?? null;
      close.locked = stored.locked ?? null;
      close.history = Array.isArray(stored.history) ? stored.history : [];
      this.#months.set(period, close);
    }
    this.edits = new EditLog(core, EDITS);
  }

  /** The month's record, or a blank one that is saved once something is recorded on it. */
  get(period: string): Close {
    return this.#months.get(period) ?? blankClose(period);
  }

  periods(): string[] {
    return [...this.#months.keys()];
  }

  isLocked(period: string): boolean {
    return this.#months.get(period)?.locked != null;
  }

  #save(close: Close): void {
    this.#months.set(close.period, close);
    this.#core.store.writeJson(`${MONTHS_FOLDER}/${close.period}.json`, { format: 1, ...close });
  }

  event(verb: string, detail: string, by: Staff): void {
    this.#core.store.appendLine(EVENTS, {
      event_id: randomUUID(),
      verb,
      detail,
      by,
      at: this.#core.now(),
    });
  }

  #open(period: string): Close {
    const close = this.get(period);
    if (close.locked) throw new Refused(409, "month_locked", lockedWords(period));
    return close;
  }

  /** A row's state, note, or a file attached or taken off it. */
  setItem(
    period: string,
    key: CloseItemKey,
    body: Record<string, unknown>,
    by: Staff,
    attach: string | null,
  ): Close {
    const close = this.#open(period);
    const item = { ...close.items[key], file_ids: [...close.items[key].file_ids] };
    const changes: { field: string; before: string; after: string }[] = [];
    if (body.state !== undefined) {
      const state = clean(body.state, 20);
      if (!STATES.has(state) || (state === "not_registered" && key !== "gst_returns"))
        throw new Refused(400, "invalid", "Choose Open, Ready or None this month.");
      if (state !== item.state) changes.push({ field: "state", before: item.state, after: state });
      item.state = state as CloseItem["state"];
    }
    if (body.note !== undefined) {
      const note = cleanText(body.note, NOTE_MAX);
      if (note !== item.note) changes.push({ field: "note", before: item.note, after: note });
      item.note = note;
    }
    if (attach) {
      if (!ATTACHABLE.includes(key))
        throw new Refused(
          400,
          "invalid",
          `Files are attached on Money's own pages for ${CLOSE_ITEMS[key]}.`,
        );
      if (!item.file_ids.includes(attach)) {
        if (item.file_ids.length >= FILES_PER_ROW)
          throw new Refused(400, "too_many", "Fifty files a row at most.");
        item.file_ids.push(attach);
        changes.push({ field: "file", before: "", after: attach });
      }
    }
    const detach = clean(body.detach, 64);
    if (detach && item.file_ids.includes(detach)) {
      item.file_ids = item.file_ids.filter((id) => id !== detach);
      changes.push({ field: "file", before: detach, after: "" });
    }
    if (changes.length === 0) return close;
    this.edits.append({ record: "close", id: `${period}:${key}`, verb: "changed", changes, by });
    item.set_at = this.#core.now();
    item.set_by = by;
    this.#save({ ...close, items: { ...close.items, [key]: item } });
    return this.get(period);
  }

  commentary(period: string, body: Record<string, unknown>, by: Staff): Close {
    const close = this.#open(period);
    const commentary = cleanText(body.commentary, COMMENTARY_MAX);
    if (commentary === close.commentary) return close;
    this.edits.append({
      record: "close",
      id: period,
      verb: "changed",
      changes: [{ field: "commentary", before: close.commentary, after: commentary }],
      by,
    });
    this.#save({ ...close, commentary });
    return this.get(period);
  }

  sent(period: string, body: Record<string, unknown>, by: Staff, today: string): Close {
    const close = this.#open(period);
    const on = clean(body.on, 10);
    if (!isDay(on)) throw new Refused(400, "invalid", "Choose the day it was sent.");
    if (on > today) throw new Refused(400, "invalid", "That day is still to come.");
    const to_name = cleanText(body.to_name, NAME_MAX);
    if (!to_name) throw new Refused(400, "invalid", "Say who it was sent to.");
    const contact = clean(body.contact_id, 64);
    const sent = { on, to_name, contact_id: contact || null, how: cleanText(body.how, HOW_MAX) };
    this.edits.append({
      record: "close",
      id: period,
      verb: "sent",
      changes: [
        {
          field: "sent",
          before: close.sent ? JSON.stringify(close.sent) : "",
          after: JSON.stringify(sent),
        },
      ],
      by,
    });
    this.#save({
      ...close,
      sent,
      history: [...close.history, { verb: "sent", at: this.#core.now(), by, why: "" }],
    });
    this.event("Pack sent", period, by);
    return this.get(period);
  }

  acknowledged(period: string, body: Record<string, unknown>, by: Staff, today: string): Close {
    const close = this.#open(period);
    if (!close.sent) throw new Refused(409, "not_sent", SENT_BEFORE_ACK);
    const on = clean(body.on, 10);
    if (!isDay(on)) throw new Refused(400, "invalid", "Choose the day it was acknowledged.");
    if (on > today) throw new Refused(400, "invalid", "That day is still to come.");
    if (on < close.sent.on)
      throw new Refused(400, "invalid", "It cannot be acknowledged before it was sent.");
    const by_name = cleanText(body.by_name, NAME_MAX);
    if (!by_name) throw new Refused(400, "invalid", "Say who acknowledged it.");
    const acknowledged = { on, by_name, note: cleanText(body.note, NOTE_MAX) };
    this.edits.append({
      record: "close",
      id: period,
      verb: "acknowledged",
      changes: [{ field: "acknowledged", before: "", after: JSON.stringify(acknowledged) }],
      by,
    });
    this.#save({
      ...close,
      acknowledged,
      history: [...close.history, { verb: "acknowledged", at: this.#core.now(), by, why: "" }],
    });
    return this.get(period);
  }

  /** Locks the month and keeps the MIS frozen at this moment beside it. */
  lock(period: string, by: Staff, snapshot: MisSnapshot, owner: MisOwnerPart): Close {
    const close = this.#open(period);
    const kept = this.snapshots(period);
    const n = kept.length + 1;
    const frozen: MisSnapshot = { ...snapshot, n, frozen_at: this.#core.now(), frozen_by: by };
    this.edits.append({
      record: "close",
      id: period,
      verb: "locked",
      changes: [{ field: "locked", before: "", after: `MIS ${n}` }],
      by,
    });
    this.#core.store.writeJson(`${MIS_FOLDER}/${period}.json`, {
      format: 1,
      snapshots: [...kept, frozen],
    });
    const owners = this.ownerParts(period);
    this.#core.store.writeJson(`${OWNER_FOLDER}/${period}.json`, {
      format: 1,
      parts: [...owners, { n, ...owner }],
    });
    this.#save({
      ...close,
      locked: { at: this.#core.now(), by },
      history: [...close.history, { verb: "locked", at: this.#core.now(), by, why: "" }],
    });
    this.event("Month locked", period, by);
    return this.get(period);
  }

  reopen(period: string, body: Record<string, unknown>, by: Staff): Close {
    const close = this.get(period);
    if (!close.locked) return close;
    const why = cleanText(body.why, REOPEN_MAX);
    if (why.length < REOPEN_MIN) throw new Refused(400, "invalid", REOPEN_WHY);
    this.edits.append({
      record: "close",
      id: period,
      verb: "reopened",
      changes: [{ field: "why", before: "", after: why }],
      by,
    });
    this.#save({
      ...close,
      locked: null,
      history: [...close.history, { verb: "reopened", at: this.#core.now(), by, why }],
    });
    this.event("Month reopened", period, by);
    return this.get(period);
  }

  snapshots(period: string): MisSnapshot[] {
    const stored = this.#core.store.readJson<{ snapshots?: MisSnapshot[] }>(
      `${MIS_FOLDER}/${period}.json`,
      {},
    );
    return Array.isArray(stored.snapshots) ? stored.snapshots : [];
  }

  ownerParts(period: string): (MisOwnerPart & { n: number })[] {
    const stored = this.#core.store.readJson<{ parts?: (MisOwnerPart & { n: number })[] }>(
      `${OWNER_FOLDER}/${period}.json`,
      {},
    );
    return Array.isArray(stored.parts) ? stored.parts : [];
  }

  /** The snapshot in force: the last one, while the month is locked. */
  frozen(period: string): MisSnapshot | null {
    if (!this.isLocked(period)) return null;
    return this.snapshots(period).at(-1) ?? null;
  }
}
