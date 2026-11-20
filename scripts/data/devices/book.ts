/**
 * The devices book (ws-notes/security/spec.md §7.2, §7.3): `devices/devices.json` (every
 * device with its checks and acknowledgements), `devices/setup.json` (his screen-lock limit and
 * months between self-checks) and `devices/events.jsonl` (one line per change: field names,
 * never their values). Nothing is deleted: a company device is returned, any device can be
 * marked as no longer used for work, and both stay listed. Nothing here touches the people
 * ledger: the Owner-only link is `owner.ts`'s.
 */

import { randomUUID } from "node:crypto";

import { Refused } from "../../mail-merge/engine";
import type { Flag } from "../company-contracts";
import type { DataCore } from "../core";
import { clean, cleanText, isDay } from "../guard";
import type { Staff } from "../protocol";
import {
  ACK_HOW,
  DEVICE_KINDS,
  DEVICE_PLATFORMS,
  OWNERSHIPS,
  type AckHow,
  type DeviceKind,
  type DevicePlatform,
  type Ownership,
} from "../../../src/lib/data/labels-devices";
import { LIMIT, PIN, SAY, tooMany } from "./limits";
import type {
  Acknowledgement,
  Device,
  DevicesEvent,
  DevicesSetup,
  SelfCheck,
  Stamp,
} from "./types";

const DEVICES = "devices/devices.json";
const SETUP = "devices/setup.json";
const EVENTS = "devices/events.jsonl";

type Input = Record<string, unknown>;

const has = (input: Input, name: string) => Object.prototype.hasOwnProperty.call(input, name);
const FLAGS = new Set<string>(["yes", "no", ""]);

const WORDS: Record<string, string> = {
  holder: "Holder",
  kind: "Kind",
  ownership: "Company or personal",
  model: "Model",
  serial: "Serial",
  platform: "System",
  issued_on: "Issued",
  notes: "Notes",
};

/** Names the fields that differ, in words; never their values. */
function changed(before: object, after: object): string {
  const a = before as Record<string, unknown>;
  const b = after as Record<string, unknown>;
  const keys = Object.keys(WORDS).filter(
    (key) => key in b && JSON.stringify(a[key]) !== JSON.stringify(b[key]),
  );
  return keys.length ? keys.map((key) => WORDS[key] ?? key).join(", ") : "Nothing";
}

/** A self-check's answers, read and checked before any screenshot is kept. */
export type CheckFields = Omit<SelfCheck, "check_id" | "evidence_file_ids" | "at" | "by">;

/** An acknowledgement's fields before its policy and copy are resolved through Files. */
export type AckFields = { on: string; how: AckHow; by_name: string };

export class DevicesBook {
  readonly #core: DataCore;
  devices: Device[];
  setup: DevicesSetup;
  /** Bumped on every save, so an index kept in memory knows to rebuild. */
  version = 0;
  /** Test routes only: the id the next device added takes (`walk-device`), so the harness can open it. */
  pinned: string | null = null;

  constructor(core: DataCore) {
    this.#core = core;
    core.store.ensureDir("devices");
    const stored = core.store.readJson<Record<string, unknown>>(DEVICES, {});
    this.devices = Array.isArray(stored.devices)
      ? (stored.devices as Device[]).filter(
          (item) => item && typeof item.device_id === "string" && Array.isArray(item.checks),
        )
      : [];
    for (const device of this.devices)
      if (!Array.isArray(device.acknowledgements)) device.acknowledgements = [];
    const setup = core.store.readJson<Record<string, unknown>>(SETUP, {});
    this.setup = {
      screen_lock_max: wholeIn(setup.screen_lock_max, LIMIT.limit_min, LIMIT.limit_max),
      check_months: wholeIn(setup.check_months, LIMIT.months_min, LIMIT.months_max),
    };
  }

  // ---------------------------------------------------------------- storing

  #save(): void {
    this.version += 1;
    this.#core.store.writeJson(DEVICES, { format: 1, devices: this.devices });
  }

  log(deviceId: string, verb: string, detail: string, by: Staff): void {
    const line: DevicesEvent = {
      event_id: randomUUID(),
      device_id: deviceId,
      verb,
      detail,
      by,
      at: this.#core.now(),
    };
    this.#core.store.appendLine(EVENTS, line);
  }

  eventsOf(deviceId: string, limit = 100): DevicesEvent[] {
    return this.#core.store
      .readLines<DevicesEvent>(EVENTS)
      .filter((event) => event?.device_id === deviceId)
      .reverse()
      .slice(0, limit);
  }

  #stamp(by: Staff): Stamp {
    const now = this.#core.now();
    return { created_at: now, created_by: by, updated_at: now, updated_by: by };
  }

  #touch(device: Device, by: Staff): void {
    device.updated_at = this.#core.now();
    device.updated_by = by;
    this.#save();
  }

  // ---------------------------------------------------------------- reading inputs

  /** A field that might attract a password: refused when it holds one. */
  #guarded(value: unknown, limit: number): string {
    const text = cleanText(value, limit);
    if (PIN.test(text)) throw new Refused(400, "invalid", SAY.pin);
    return text;
  }

  flag(value: unknown, extra: readonly string[] = []): Flag {
    const flag = clean(value, 20);
    if (!FLAGS.has(flag) && !extra.includes(flag))
      throw new Refused(400, "invalid", extra.length ? SAY.malware : SAY.flag);
    return flag as Flag;
  }

  /** A day not in the future; `fallback` when none is given (null: refused). */
  day(value: unknown, fallback: string | null): string {
    const day = clean(value, 10);
    if (!day) {
      if (fallback !== null) return fallback;
      throw new Refused(400, "invalid", SAY.notADay);
    }
    if (!isDay(day)) throw new Refused(400, "invalid", SAY.notADay);
    if (day > this.#core.day()) throw new Refused(400, "invalid", SAY.future);
    return day;
  }

  #optionalDay(value: unknown): string | null {
    return clean(value, 10) ? this.day(value, null) : null;
  }

  // ---------------------------------------------------------------- devices

  device(id: string | undefined): Device {
    const found = id ? this.devices.find((item) => item.device_id === id) : undefined;
    if (!found) throw new Refused(404, "not_found", SAY.device);
    return found;
  }

  #fields(input: Input, base: Device | null) {
    const pick = <K extends keyof Device>(key: K, read: (value: unknown) => Device[K]) =>
      has(input, key) ? read(input[key]) : base ? base[key] : read(undefined);
    const holder = pick("holder", (value) => this.#guarded(value, LIMIT.holder));
    if (!holder) throw new Refused(400, "invalid", SAY.holder);
    const kind = pick("kind", (value) => {
      const text = clean(value, 12) || "laptop";
      if (!(text in DEVICE_KINDS)) throw new Refused(400, "invalid", SAY.kind);
      return text as DeviceKind;
    });
    const ownership = pick("ownership", (value) => {
      const text = clean(value, 12);
      if (!(text in OWNERSHIPS)) throw new Refused(400, "invalid", SAY.ownership);
      return text as Ownership;
    });
    if (base?.returned_on && ownership !== "company")
      throw new Refused(400, "invalid", SAY.ownershipReturned);
    const platform = pick("platform", (value) => {
      const text = clean(value, 12) || "other";
      if (!(text in DEVICE_PLATFORMS)) throw new Refused(400, "invalid", SAY.platform);
      return text as DevicePlatform;
    });
    const issued = pick("issued_on", (value) => this.#optionalDay(value));
    if (issued && base?.returned_on && base.returned_on < issued)
      throw new Refused(400, "invalid", SAY.returnedBefore);
    return {
      holder,
      kind,
      ownership,
      model: pick("model", (value) => cleanText(value, LIMIT.model)),
      // Stored with `clean`: a serial can look like a key to the secret guard.
      serial: pick("serial", (value) => clean(value, LIMIT.serial)),
      platform,
      issued_on: ownership === "company" ? issued : null,
      notes: pick("notes", (value) => this.#guarded(value, LIMIT.notes)),
    };
  }

  add(input: Input, by: Staff): Device {
    if (this.devices.length >= LIMIT.devices)
      throw new Refused(409, "too_many", tooMany(LIMIT.devices));
    const fields = this.#fields(input, null);
    const device: Device = {
      device_id: this.pinned ?? randomUUID(),
      ...fields,
      returned_on: null,
      retired: null,
      checks: [],
      acknowledgements: [],
      ...this.#stamp(by),
    };
    this.pinned = null;
    this.devices.push(device);
    this.#save();
    this.log(device.device_id, "added", "", by);
    return device;
  }

  update(device: Device, input: Input, by: Staff): Device {
    const fields = this.#fields(input, device);
    const detail = changed(device, fields);
    Object.assign(device, fields);
    this.#touch(device, by);
    this.log(device.device_id, "changed", detail, by);
    return device;
  }

  markReturned(device: Device, input: Input, by: Staff): Device {
    if (device.ownership !== "company") throw new Refused(409, "invalid", SAY.returnedCompany);
    if (device.returned_on) throw new Refused(409, "invalid", SAY.returned);
    const on = this.day(input.on, this.#core.day());
    if (device.issued_on && on < device.issued_on)
      throw new Refused(400, "invalid", SAY.returnedBefore);
    device.returned_on = on;
    this.#touch(device, by);
    this.log(device.device_id, "returned", "", by);
    return device;
  }

  retire(device: Device, input: Input, by: Staff): Device {
    if (input.undo === true) {
      if (!device.retired) throw new Refused(409, "invalid", SAY.notRetired);
      device.retired = null;
      this.#touch(device, by);
      this.log(device.device_id, "back in use", "", by);
      return device;
    }
    if (device.retired) throw new Refused(409, "invalid", SAY.retired);
    const on = this.day(input.on, this.#core.day());
    const why = cleanText(input.why, LIMIT.why);
    if (why.length < 2) throw new Refused(400, "invalid", SAY.why);
    const removed = clean(input.work_removed, 4);
    if (removed !== "yes" && removed !== "no") throw new Refused(400, "invalid", SAY.workRemoved);
    device.retired = { on, why, work_removed: removed };
    this.#touch(device, by);
    this.log(device.device_id, "retired", removed === "yes" ? "Work data removed" : "", by);
    return device;
  }

  // ---------------------------------------------------------------- self-checks

  inUse(device: Device): boolean {
    return device.returned_on === null && device.retired === null;
  }

  /** Every answer, checked before any screenshot is kept. */
  checkFields(device: Device, input: Input): CheckFields {
    if (!this.inUse(device)) throw new Refused(409, "invalid", SAY.notInUse);
    if (device.checks.length >= LIMIT.checks)
      throw new Refused(409, "too_many", tooMany(LIMIT.checks));
    const byName = cleanText(input.by_name, LIMIT.by_name);
    if (!byName) throw new Refused(400, "invalid", SAY.byName);
    let minutes: number | null = null;
    const typed = clean(input.screen_lock_minutes, 8);
    if (typed) {
      minutes = /^\d+$/.test(typed) ? Number(typed) : NaN;
      if (
        !Number.isInteger(minutes) ||
        minutes < LIMIT.screen_lock_min ||
        minutes > LIMIT.screen_lock_max
      )
        throw new Refused(400, "invalid", SAY.screenLock);
    }
    return {
      on: this.day(input.on, this.#core.day()),
      by_name: byName,
      encryption: this.flag(input.encryption),
      screen_lock_minutes: minutes,
      os_version: cleanText(input.os_version, LIMIT.os_version),
      updates_automatic: this.flag(input.updates_automatic),
      password_manager: this.flag(input.password_manager),
      malware_protection: this.flag(input.malware_protection, ["not_applicable"]) as
        Flag | "not_applicable",
      firewall: this.flag(input.firewall),
      work_data_local: this.flag(input.work_data_local),
      note: cleanText(input.note, LIMIT.note),
    };
  }

  addCheck(device: Device, fields: CheckFields, fileIds: string[], by: Staff): SelfCheck {
    const check: SelfCheck = {
      check_id: randomUUID(),
      ...fields,
      evidence_file_ids: fileIds,
      at: this.#core.now(),
      by,
    };
    device.checks.push(check);
    this.#touch(device, by);
    this.log(
      device.device_id,
      "self-check recorded",
      fileIds.length ? `${fileIds.length} screenshot${fileIds.length === 1 ? "" : "s"}` : "",
      by,
    );
    return check;
  }

  // ---------------------------------------------------------------- acknowledgements

  ackFields(device: Device, input: Input): AckFields {
    if (device.ownership !== "personal") throw new Refused(409, "invalid", SAY.ackPersonal);
    if (!this.inUse(device)) throw new Refused(409, "invalid", SAY.notInUse);
    if (device.acknowledgements.length >= LIMIT.acknowledgements)
      throw new Refused(409, "too_many", tooMany(LIMIT.acknowledgements));
    const how = clean(input.how, 12);
    if (!(how in ACK_HOW)) throw new Refused(400, "invalid", SAY.ackHow);
    const byName = cleanText(input.by_name, LIMIT.by_name);
    if (!byName) throw new Refused(400, "invalid", SAY.ackBy);
    return { on: this.day(input.on, this.#core.day()), how: how as AckHow, by_name: byName };
  }

  addAck(
    device: Device,
    fields: AckFields,
    policy: { file_id: string; title: string; version: number },
    copyFileId: string | null,
    by: Staff,
  ): Acknowledgement {
    const ack: Acknowledgement = {
      ack_id: randomUUID(),
      policy_file_id: policy.file_id,
      policy_title: policy.title,
      policy_version: policy.version,
      ...fields,
      copy_file_id: copyFileId,
      at: this.#core.now(),
      by,
    };
    device.acknowledgements.push(ack);
    this.#touch(device, by);
    this.log(device.device_id, "acknowledgement recorded", `Version ${policy.version}`, by);
    return ack;
  }

  // ---------------------------------------------------------------- settings

  saveSetup(input: Input): DevicesSetup {
    const read = (value: unknown, min: number, max: number, say: string): number | null => {
      const text = clean(value, 8);
      if (!text) return null;
      const number = /^\d+$/.test(text) ? Number(text) : NaN;
      if (!Number.isInteger(number) || number < min || number > max)
        throw new Refused(400, "invalid", say);
      return number;
    };
    const next: DevicesSetup = {
      screen_lock_max: has(input, "screen_lock_max")
        ? read(input.screen_lock_max, LIMIT.limit_min, LIMIT.limit_max, SAY.limit)
        : this.setup.screen_lock_max,
      check_months: has(input, "check_months")
        ? read(input.check_months, LIMIT.months_min, LIMIT.months_max, SAY.months)
        : this.setup.check_months,
    };
    this.setup = next;
    this.version += 1;
    this.#core.store.writeJson(SETUP, { format: 1, ...next });
    return next;
  }
}

function wholeIn(value: unknown, min: number, max: number): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= min && value <= max
    ? value
    : null;
}
