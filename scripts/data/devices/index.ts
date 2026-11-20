/**
 * Devices (ws-notes/security/spec.md §7): every laptop, desktop, phone and tablet used for
 * work, company or personal; its monthly self-checks with their answers and screenshots (kept
 * in Files, "Security › Devices"); a personal device's acknowledgement of the personal devices
 * policy on the Files version it was given; the screen-lock limit he types once; and, for the
 * Owner only, the link of a device to a person in the people ledger with what is owed on it
 * when they leave.
 *
 * The Owner rule (§2 rules 1–2, §3.5): the link lives in `devices/owner/`, which a backup an
 * Admin makes leaves out; the person and the owed day are in an answer only when it is asked
 * with `?owner=1`, and absent otherwise; the link POST refuses without `owner: true`, keeps no
 * replay and answers `{ device_id, linked }` only; a leaver's Due row is `owner_only`; no
 * device is in the calendar or the search; `summary(today, false)` counts nothing from a last
 * day; `evidence` names nobody. Provides `devices` (`DevicesLookup`). Nothing here sends,
 * fetches or reads a device: the holder reads each answer on the device and he types it.
 */

import { Refused } from "../../mail-merge/engine";
import type { Answer, Ctx, DataCore, DueItem } from "../core";
import type { FileRow, FilesService } from "../files/index";
import { sniff } from "../files/sniff";
import { LIMITS, clean, isRouteId } from "../guard";
import { checkCopy, copyGiven, fileChoices, keepCopy } from "../meetings/copy";
import type { Staff } from "../protocol";
import {
  SECURITY_SERVICES,
  standInPolicies,
  standInTools,
  type DevicesLookup,
  type EvidenceOption,
  type PeopleRoster,
  type PersonDeviceLine,
  type PoliciesLookup,
  type PolicyFile,
  type RosterPerson,
  type SummaryLine,
  type ToolView,
} from "../security-contracts";
import { toCsv } from "../text";
import { dayWords } from "../../../src/lib/data/labels-company";
import { countWords, everyWords, notLoaded, ofWords } from "../../../src/lib/data/labels-controls";
import {
  CHECK_FLAGS,
  DEVICE_KINDS,
  DEVICE_LINES,
  DEVICE_PLATFORMS,
  OWNERSHIPS,
  deviceLabel,
  kindWord,
  owedTitle,
} from "../../../src/lib/data/labels-devices";
import { DevicesBook } from "./book";
import { checkLines, deviceCheckLine, latestCheck } from "./checks";
import {
  ackStateOf,
  checkInDue,
  checkMonthsOf,
  checkedInTime,
  nextCheckOf,
  owedOf,
  type Owed,
  type PolicyNow,
} from "./due";
import { FILES_FOLDER, LIMIT, SAY } from "./limits";
import { OwnerLinks } from "./owner";
import type { Device } from "./types";
import { WALK_DEVICE_ID, WALK_POLICY } from "./walk-seed";

const BOM = "﻿";
const PAGE = "/data/systems/devices";
const VIEWS = ["active", "returned", "all"] as const;
type View = (typeof VIEWS)[number];

/** A stand-in this batch's test routes installed: any of them may replace or remove it. */
const STAND_IN = Symbol.for("hq.security.stand-in");
type Marked = { [STAND_IN]?: true };

type PolicyView = PolicyFile & { version_on: string | null };
/** The policies as asked now: loaded or not, and the linked personal devices policy. */
type Policy = { loaded: boolean; file: PolicyView | null };

/** The Owner's part of a row: absent from every answer asked without the flag. */
type OwnerPart = {
  person: Pick<RosterPerson, "person_id" | "name" | "state" | "last_day" | "href"> | null;
  owed: Owed | null;
};

export async function register(core: DataCore): Promise<void> {
  const book = new DevicesBook(core);
  const links = new OwnerLinks(core);

  function safely<T>(ask: () => T): T | null {
    try {
      return ask();
    } catch (error) {
      core.log(`devices: a lookup failed: ${error instanceof Error ? error.name : "error"}`);
      return null;
    }
  }

  const today = () => core.day();
  const files = () => core.need<FilesService>("files");
  const roster = () => core.need<PeopleRoster>(SECURITY_SERVICES.peopleRoster);
  const addedOn = (device: Device) => core.day(device.created_at);
  const href = (device: Device) => `${PAGE}/${device.device_id}`;

  /** The personal devices policy linked in Assurance, with its current version from Files. */
  const policyNow = (): Policy => {
    const lookup = core.need<PoliciesLookup>(SECURITY_SERVICES.policies);
    if (!lookup) return { loaded: false, file: null };
    const linked = safely(() => lookup.fileFor("personal_devices"));
    if (!linked) return { loaded: true, file: null };
    const service = files();
    const row = service ? (safely(() => service.fileRow(linked.file_id)) as FileRow | null) : null;
    const versions = row && service ? (safely(() => service.versions(linked.file_id)) ?? []) : [];
    const current = row ? versions.find((version) => version.n === row.current_n) : undefined;
    return {
      loaded: true,
      file: {
        ...linked,
        title: row?.title ?? linked.title,
        version: current?.n ?? linked.version,
        version_on: current ? core.day(current.added_at) : null,
      },
    };
  };

  const policyLine = (policy: Policy): string | null =>
    !policy.loaded ? notLoaded("Policies") : policy.file ? null : DEVICE_LINES.policyNotLinked;

  const toPolicyNow = (policy: Policy): PolicyNow | null | undefined =>
    !policy.loaded
      ? undefined
      : policy.file
        ? {
            file_id: policy.file.file_id,
            title: policy.file.title,
            version: policy.file.version,
            version_on: policy.file.version_on,
          }
        : null;

  // ---------------------------------------------------------------- rows

  /** The record without its checks and acknowledgements, which only a device's page lists. */
  const recordOf = (device: Device): Omit<Device, "checks" | "acknowledgements"> => ({
    device_id: device.device_id,
    holder: device.holder,
    kind: device.kind,
    ownership: device.ownership,
    model: device.model,
    serial: device.serial,
    platform: device.platform,
    issued_on: device.issued_on,
    returned_on: device.returned_on,
    retired: device.retired,
    notes: device.notes,
    created_at: device.created_at,
    created_by: device.created_by,
    updated_at: device.updated_at,
    updated_by: device.updated_by,
  });

  /** Everything worked out for one device on a day: never anything from the ledger. */
  const rowOf = (device: Device, on: string, policy: Policy) => {
    const inUse = book.inUse(device);
    const last = latestCheck(device.checks);
    const next = nextCheckOf(last?.on ?? null, addedOn(device), checkMonthsOf(book.setup));
    const ack = ackStateOf({
      ownership: device.ownership,
      in_use: inUse,
      added_on: addedOn(device),
      acks: device.acknowledgements,
      policy: toPolicyNow(policy),
    });
    const deviceLines = [
      deviceCheckLine({ in_use: inUse, last_on: last?.on ?? null, next, today: on }),
      ack.words,
    ].filter((line): line is string => line !== null);
    return {
      ...recordOf(device),
      label: deviceLabel(device),
      state: device.retired
        ? ("retired" as const)
        : device.returned_on
          ? ("returned" as const)
          : ("active" as const),
      added_on: addedOn(device),
      last_check: last,
      checks_count: device.checks.length,
      next_check: inUse ? next : null,
      checked: inUse && checkedInTime(last?.on ?? null, next, on),
      overdue: inUse && last !== null && next < on,
      due: inUse && checkInDue(next, on),
      acknowledgement: ack.latest,
      ack_state: ack.state,
      ack_due_on: ack.due_on,
      ack_line: ack.words,
      check_lines: checkLines(last, book.setup.screen_lock_max),
      device_lines: deviceLines,
      href: href(device),
    };
  };
  type Row = ReturnType<typeof rowOf>;

  /** The Owner's part: the person the device is linked to, and what is owed once they leave. */
  const ownerPartOf = (device: Device, on: string): OwnerPart => {
    const personId = links.personOf(device.device_id);
    const found = personId ? safely(() => roster()?.person(personId, on) ?? null) : null;
    if (!found) return { person: null, owed: null };
    return {
      person: {
        person_id: found.person_id,
        name: found.name,
        state: found.state,
        last_day: found.last_day,
        href: found.href,
      },
      owed: owedOf(found.last_day, device),
    };
  };

  const fileLinkOf = (fileId: string | null): { file_id: string; title: string } | null => {
    if (!fileId) return null;
    const row = safely(() => files()?.fileRow(fileId) ?? null);
    return row && !row.trashed_at ? { file_id: row.file_id, title: row.title } : null;
  };

  const newestFirst = <T extends { on: string; at: string }>(items: readonly T[]): T[] =>
    [...items].sort((a, b) => b.on.localeCompare(a.on) || b.at.localeCompare(a.at));

  const detailOf = (device: Device, on: string, policy: Policy) => ({
    ...rowOf(device, on, policy),
    checks: newestFirst(device.checks).map((check) => ({
      ...check,
      files: check.evidence_file_ids
        .map((fileId) => fileLinkOf(fileId))
        .filter((item): item is { file_id: string; title: string } => item !== null),
    })),
    acknowledgements: newestFirst(device.acknowledgements).map((ack) => ({
      ...ack,
      copy: fileLinkOf(ack.copy_file_id),
    })),
  });

  const countsOf = (rows: readonly Row[]) => {
    const active = rows.filter((row) => row.state === "active");
    const personal = active.filter((row) => row.ownership === "personal");
    return {
      active: active.length,
      company: active.length - personal.length,
      personal: personal.length,
      checked: active.filter((row) => row.checked).length,
      acknowledged_current: personal.filter((row) => row.ack_state === "current").length,
      personal_active: personal.length,
    };
  };

  const sortRows = (a: Row, b: Row) =>
    Number(a.state !== "active") - Number(b.state !== "active") ||
    a.holder.localeCompare(b.holder, "en-GB") ||
    a.label.localeCompare(b.label, "en-GB");

  // ---------------------------------------------------------------- Due

  core.provideDue(() => {
    const on = today();
    const policy = policyNow();
    const items: DueItem[] = [];
    for (const device of book.devices) {
      const row = rowOf(device, on, policy);
      if (row.state === "active" && row.due)
        items.push({
          key: `device:${device.device_id}:check`,
          kind: "device",
          title: `Self-check of ${device.holder}'s ${row.label}`,
          sub: row.last_check ? `Last checked ${dayWords(row.last_check.on)}` : "Not checked yet",
          due_on: row.next_check ?? on,
          href: row.href,
        });
      if (row.ack_due_on)
        items.push({
          key: `device:${device.device_id}:ack`,
          kind: "device",
          title: `Personal-device acknowledgement from ${device.holder}`,
          sub: row.label,
          due_on: row.ack_due_on,
          href: row.href,
        });
      // The leaver's row: Owner only, from the day offboarding starts.
      const owner = links.personOf(device.device_id) ? ownerPartOf(device, on) : null;
      if (owner?.person && owner.owed && !owner.owed.done)
        items.push({
          key: `device:${device.device_id}:leaver`,
          kind: "device",
          title: owedTitle(device.ownership, row.label, owner.person.name),
          sub: owner.owed.words,
          due_on: owner.owed.by,
          href: row.href,
          owner_only: true,
        });
    }
    return items;
  });

  // ---------------------------------------------------------------- what other modules get

  /** "Used for", from an index rebuilt only when the book changes: Files asks on every file page. */
  let usedIndex: { version: number; map: Map<string, { label: string; href: string }[]> } | null =
    null;
  const usedFor = (fileId: string) => {
    if (!usedIndex || usedIndex.version !== book.version) {
      const map = new Map<string, { label: string; href: string }[]>();
      const put = (id: string | null, line: { label: string; href: string }) => {
        if (!id) return;
        map.set(id, [...(map.get(id) ?? []), line]);
      };
      for (const device of book.devices) {
        for (const check of device.checks)
          for (const id of check.evidence_file_ids)
            put(id, {
              label: `Self-check of ${device.holder}'s ${kindWord(device.kind)}, ${dayWords(check.on)}`,
              href: href(device),
            });
        for (const ack of device.acknowledgements)
          put(ack.copy_file_id, {
            label: `Personal-device acknowledgement from ${device.holder}, ${dayWords(ack.on)}`,
            href: href(device),
          });
      }
      usedIndex = { version: book.version, map };
    }
    return (usedIndex.map.get(fileId) ?? []).map((line) => ({ ...line }));
  };

  const monthsWords = () => {
    const months = checkMonthsOf(book.setup);
    return months === 1 ? "self-checked monthly" : `self-checked ${everyWords(months, "months")}`;
  };

  /** "2 of 2 personal devices have"; "1 of 1 personal device has". */
  const personalWords = (total: number) =>
    total === 1 ? "personal device has" : "personal devices have";

  const summary = (on: string, owner: boolean): SummaryLine[] => {
    const policy = policyNow();
    const rows = book.devices.map((device) => rowOf(device, on, policy));
    const counts = countsOf(rows);
    const active = rows.filter((row) => row.state === "active");
    const lines: SummaryLine[] = [];
    const line = (key: string, title: string, words: string, attention: boolean) =>
      lines.push({ key, area: "systems", title, words, attention, href: PAGE });
    if (active.length === 0)
      line(
        "devices",
        "Devices",
        "No devices recorded. Add every laptop and phone used for work.",
        true,
      );
    else {
      line(
        "devices",
        "Devices",
        `${countWords(counts.active, "device")}: ${counts.company} company, ${counts.personal} personal; ${counts.checked} checked in the last month.`,
        active.some((row) => !row.checked),
      );
      const checked = active.filter((row) => row.last_check);
      if (checked.length > 0) {
        const off = checked.filter((row) => row.last_check!.encryption === "no").length;
        const unknown = checked.filter((row) => row.last_check!.encryption === "").length;
        const whose = (count: number) =>
          count === 1 ? "1 device's last check" : `${count} devices' last checks`;
        if (off > 0)
          line("encryption", "Disk encryption", `${whose(off)} found disk encryption off.`, true);
        else if (unknown > 0)
          line(
            "encryption",
            "Disk encryption",
            `${whose(unknown)} did not say whether disk encryption is on.`,
            true,
          );
        else
          line(
            "encryption",
            "Disk encryption",
            "Every device's last check found disk encryption on.",
            false,
          );
      }
      if (counts.personal > 0) {
        if (policy.file)
          line(
            "acknowledgements",
            "Acknowledgements",
            `${ofWords(counts.acknowledged_current, counts.personal, personalWords(counts.personal))} an acknowledgement on the current version.`,
            counts.acknowledged_current < counts.personal,
          );
        else {
          const given = active.filter(
            (row) => row.ownership === "personal" && row.acknowledgement,
          ).length;
          line(
            "acknowledgements",
            "Acknowledgements",
            `${ofWords(given, counts.personal, personalWords(counts.personal))} an acknowledgement; its version is not checked here.`,
            given < counts.personal,
          );
        }
      }
    }
    if (owner) {
      const owed = book.devices.filter((device) => {
        if (!links.personOf(device.device_id)) return false;
        const part = ownerPartOf(device, on);
        return part.owed !== null && !part.owed.done;
      }).length;
      line(
        "device-leavers",
        "Leavers' devices",
        owed === 0
          ? "No leaver's device is owed."
          : owed === 1
            ? "1 leaver's device is owed."
            : `${owed} devices are owed by leavers.`,
        owed > 0,
      );
    }
    return lines;
  };

  const evidence = (on: string): EvidenceOption[] => {
    const policy = policyNow();
    const rows = book.devices.map((device) => rowOf(device, on, policy));
    const counts = countsOf(rows);
    const late = rows.filter((row) => row.state === "active" && !row.checked).length;
    const options: EvidenceOption[] = [
      {
        ref: "devices:register",
        label: `Device register: ${countWords(counts.active, "device")}, ${monthsWords()}`,
        href: PAGE,
        current: counts.active > 0 && late === 0,
        why:
          counts.active === 0
            ? "No devices recorded."
            : late === 0
              ? ""
              : `${countWords(late, "device")} not checked in time.`,
      },
    ];
    if (counts.personal > 0)
      options.push({
        ref: "devices:acknowledgements",
        label: `Personal-device acknowledgements: ${ofWords(counts.acknowledged_current, counts.personal, "on the current version")}`,
        href: PAGE,
        current: policy.file !== null && counts.acknowledged_current === counts.personal,
        why: !policy.file
          ? "The personal devices policy is not linked, so its version is not checked."
          : counts.acknowledged_current === counts.personal
            ? ""
            : `${countWords(counts.personal - counts.acknowledged_current, "personal device")} without one on the current version.`,
      });
    return options;
  };

  const service: DevicesLookup = {
    usedFor,
    summary: (on, owner) => summary(on, owner),
    evidence: (on) => evidence(on),
    // OWNER-ONLY: the devices linked to that person, and what is owed on each.
    forPerson: (personId, on) => {
      const person = safely(() => roster()?.person(personId, on) ?? null);
      return links
        .devicesOf(personId)
        .map((id) => book.devices.find((device) => device.device_id === id))
        .filter((device): device is Device => device !== undefined)
        .map((device): PersonDeviceLine => {
          const owed = person ? owedOf(person.last_day, device) : null;
          return {
            device_id: device.device_id,
            label: deviceLabel(device),
            ownership: device.ownership,
            by: owed?.by ?? null,
            done: owed?.done ?? false,
            href: href(device),
          };
        });
    },
  };
  core.provide(SECURITY_SERVICES.devices, service);

  core.provideOverview("devices", () => {
    const policy = policyNow();
    const counts = countsOf(book.devices.map((device) => rowOf(device, today(), policy)));
    return {
      active: counts.active,
      checked: counts.checked,
      personal_active: counts.personal_active,
      acknowledged_current: counts.acknowledged_current,
    };
  });

  // ---------------------------------------------------------------- the Owner, at the service

  const asOwner = (ctx: Ctx) => ctx.query.get("owner") === "1";
  const refuseOwner = () => new Refused(403, "owner_only", SAY.ownerOnly);

  // ---------------------------------------------------------------- screenshots and copies

  type Shot = { file_id: string } | { bytes: Uint8Array; name: string };

  /** Every screenshot checked (in Files and not trashed, or bytes small enough), none kept yet. */
  const readShots = (body: Record<string, unknown>): Shot[] => {
    const given = Array.isArray(body.screenshots) ? (body.screenshots as unknown[]) : [];
    if (given.length === 0) return [];
    if (given.length > LIMIT.screenshots) throw new Refused(400, "invalid", SAY.screenshots);
    const service = files();
    if (!service) throw new Refused(409, "files_missing", SAY.filesMissing);
    return given.map((item): Shot => {
      const record = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
      const fileId = clean(record.file_id, 64);
      if (fileId) {
        const row = service.fileRow(fileId);
        if (!row || row.trashed_at) throw new Refused(404, "not_found", SAY.notInFiles);
        if (row.kind !== "image" && row.kind !== "pdf")
          throw new Refused(400, "invalid", SAY.screenshotKind);
        return { file_id: row.file_id };
      }
      const content = typeof record.content === "string" ? record.content : "";
      const bytes = Buffer.from(content, "base64");
      if (bytes.length === 0) throw new Refused(400, "empty", SAY.empty);
      if (bytes.length > LIMIT.copy_bytes) throw new Refused(400, "too_large", SAY.tooLarge);
      const name = clean(record.name, LIMITS.file_name).replace(/[\\/]/g, "_") || "Screenshot.png";
      const kind = sniff(bytes.subarray(0, 8_192), name).kind;
      if (kind !== "image" && kind !== "pdf") throw new Refused(400, "invalid", SAY.screenshotKind);
      return { bytes: new Uint8Array(bytes), name };
    });
  };

  const keepShots = async (device: Device, on: string, shots: Shot[], by: Staff) => {
    const ids: string[] = [];
    const number = device.checks.length + 1;
    for (const [index, shot] of shots.entries()) {
      if ("file_id" in shot) {
        ids.push(shot.file_id);
        continue;
      }
      const row = await files()!.putFile({
        folderPath: FILES_FOLDER,
        title: `Self-check ${number} of ${device.holder}'s ${deviceLabel(device)}, ${dayWords(on)}, screenshot ${index + 1}`,
        originalName: shot.name,
        bytes: shot.bytes,
        by,
        note: `A self-check's screenshot, ${dayWords(on)}`,
      });
      ids.push(row.file_id);
    }
    return [...new Set(ids)];
  };

  // ---------------------------------------------------------------- the register as a CSV

  const csvOf = (owner: boolean) => {
    const on = today();
    const policy = policyNow();
    const rows = book.devices.map((device) => ({ device, row: rowOf(device, on, policy) }));
    rows.sort((a, b) => sortRows(a.row, b.row));
    const header = [
      "device",
      "kind",
      "company_or_personal",
      "holder",
      "serial",
      "system",
      "issued_on",
      "returned_on",
      "no_longer_used_on",
      "work_data_removed",
      "last_check",
      "encryption",
      "screen_lock_minutes",
      "next_check",
      "acknowledged_version",
      "checks",
      ...(owner ? ["in_the_people_ledger", "owed_by"] : []),
    ];
    const body = rows.map(({ device, row }) => {
      const part = owner ? ownerPartOf(device, on) : null;
      return [
        row.label,
        DEVICE_KINDS[device.kind],
        OWNERSHIPS[device.ownership],
        device.holder,
        device.serial,
        DEVICE_PLATFORMS[device.platform],
        device.issued_on ?? "",
        device.returned_on ?? "",
        device.retired?.on ?? "",
        device.retired ? CHECK_FLAGS[device.retired.work_removed] : "",
        row.last_check?.on ?? "",
        row.last_check ? CHECK_FLAGS[row.last_check.encryption] : "",
        row.last_check?.screen_lock_minutes ?? "",
        row.next_check ?? "",
        row.acknowledgement ? String(row.acknowledgement.policy_version) : "",
        [...row.check_lines, ...row.device_lines].join(" "),
        ...(part
          ? [part.person?.name ?? "", part.owed && !part.owed.done ? part.owed.by : ""]
          : []),
      ];
    });
    return { name: `Devices ${on}.csv`, csv: BOM + toCsv(header, body) };
  };

  // ---------------------------------------------------------------- routes (fixed paths first)

  core.route("GET", "/data/devices", (ctx) => {
    const on = today();
    const owner = asOwner(ctx);
    const asked = clean(ctx.query.get("view"), 12);
    const view: View = (VIEWS as readonly string[]).includes(asked) ? (asked as View) : "active";
    const policy = policyNow();
    const all = book.devices.map((device) => ({ device, row: rowOf(device, on, policy) }));
    const shown = all
      .filter(({ row }) =>
        view === "all" ? true : view === "active" ? row.state === "active" : row.state !== "active",
      )
      .sort((a, b) => sortRows(a.row, b.row))
      .map(({ device, row }) => (owner ? { ...row, ...ownerPartOf(device, on) } : row));
    return {
      view,
      devices: shown,
      counts: countsOf(all.map(({ row }) => row)),
      setup: book.setup,
      policy: policy.file,
      policies_loaded: policy.loaded,
      policy_line: policyLine(policy),
      files_here: files() !== null,
      today: on,
    };
  });

  core.route("GET", "/data/devices/export", (ctx) => csvOf(asOwner(ctx)));

  core.route("POST", "/data/devices", (ctx) => {
    const by = ctx.staff();
    return { device: rowOf(book.add(ctx.body, by), today(), policyNow()) };
  });

  core.route("POST", "/data/devices/setup", (ctx) => {
    ctx.staff();
    return { setup: book.saveSetup(ctx.body) };
  });

  core.route("GET", "/data/devices/:id", (ctx) => {
    const on = today();
    const device = book.device(ctx.params[0]);
    const policy = policyNow();
    const answer: Answer = {
      device: detailOf(device, on, policy),
      events: book.eventsOf(device.device_id),
      files_here: files() !== null,
      files: fileChoices(core),
      setup: book.setup,
      policy: policy.file,
      policies_loaded: policy.loaded,
      policy_line: policyLine(policy),
      today: on,
    };
    if (asOwner(ctx)) {
      const people = safely(() => roster()?.people(on) ?? null);
      answer.owner = {
        ...ownerPartOf(device, on),
        people_loaded: roster() !== null,
        people: (people ?? []).map((person) => ({
          person_id: person.person_id,
          name: person.name,
          state: person.state,
        })),
        events: links.eventsOf(device.device_id),
      };
    }
    return answer;
  });

  core.route("POST", "/data/devices/:id/update", (ctx) => {
    const by = ctx.staff();
    const device = book.update(book.device(ctx.params[0]), ctx.body, by);
    return { device: rowOf(device, today(), policyNow()) };
  });

  core.route("POST", "/data/devices/:id/return", (ctx) => {
    const by = ctx.staff();
    const device = book.markReturned(book.device(ctx.params[0]), ctx.body, by);
    return { device: rowOf(device, today(), policyNow()) };
  });

  core.route("POST", "/data/devices/:id/retire", (ctx) => {
    const by = ctx.staff();
    const device = book.retire(book.device(ctx.params[0]), ctx.body, by);
    return { device: rowOf(device, today(), policyNow()) };
  });

  core.route("POST", "/data/devices/:id/checks", async (ctx) => {
    const by = ctx.staff();
    const device = book.device(ctx.params[0]);
    const fields = book.checkFields(device, ctx.body);
    const shots = readShots(ctx.body);
    const ids = await keepShots(device, fields.on, shots, by);
    book.addCheck(device, fields, ids, by);
    return { device: rowOf(device, today(), policyNow()) };
  });

  core.route("POST", "/data/devices/:id/acknowledgements", async (ctx) => {
    const by = ctx.staff();
    const device = book.device(ctx.params[0]);
    const fields = book.ackFields(device, ctx.body);
    const service = files();
    if (!service) throw new Refused(409, "files_missing", SAY.filesMissing);
    const policy = policyNow();
    const chosen = clean(ctx.body.policy_file_id, 64) || policy.file?.file_id || "";
    const row = chosen ? service.fileRow(chosen) : null;
    if (!row || row.trashed_at) throw new Refused(400, "invalid", SAY.ackPolicy);
    if (copyGiven(ctx.body)) checkCopy(core, ctx.body);
    const copy = copyGiven(ctx.body)
      ? await keepCopy(
          core,
          ctx.body,
          {
            folder: FILES_FOLDER,
            title: `Personal-device acknowledgement from ${device.holder}, ${deviceLabel(device)}, ${dayWords(fields.on)}`,
            note: `${row.title}, version ${row.current_n}`,
          },
          by,
        )
      : null;
    book.addAck(
      device,
      fields,
      { file_id: row.file_id, title: row.title, version: row.current_n },
      copy?.file_id ?? null,
      by,
    );
    return { device: rowOf(device, today(), policyNow()) };
  });

  /**
   * OWNER ONLY (§2 rule 2): the attempt is taken off first, so core never writes this answer
   * to its replay log, which every backup takes; the answer names nobody.
   */
  core.route("POST", "/data/devices/:id/link", (ctx) => {
    ctx.attempt = null;
    if (ctx.body.owner !== true) throw refuseOwner();
    const by = ctx.staff();
    const device = book.device(ctx.params[0]);
    const personId = clean(ctx.body.person_id, 64);
    if (!personId)
      return { device_id: device.device_id, linked: links.set(device.device_id, null, by) };
    const people = roster();
    if (!people) throw new Refused(409, "roster_missing", SAY.rosterMissing);
    if (!isRouteId(personId) || !safely(() => people.person(personId, today())))
      throw new Refused(404, "not_found", SAY.person);
    return { device_id: device.device_id, linked: links.set(device.device_id, personId, by) };
  });

  // ---------------------------------------------------------------- test routes

  if (core.testRoutes) {
    /** Install a stand-in only while no real provider is loaded; `{ on: false }` removes only a stand-in. */
    const install = (
      name: string,
      make: (body: Record<string, unknown>) => object,
      body: Record<string, unknown>,
    ) => {
      const current = core.need<object & Marked>(name);
      const real = current !== null && current[STAND_IN] !== true;
      if (body.on === false) {
        if (current && !real) core.provide(name, null);
        return { installed: false, real };
      }
      if (real) return { installed: false, real: true };
      core.provide(name, Object.assign(make(body), { [STAND_IN]: true as const }));
      return { installed: true, real: false };
    };
    const standIn =
      (name: string, make: (body: Record<string, unknown>) => object) => (ctx: Ctx) => {
        ctx.staff();
        return install(name, make, ctx.body);
      };

    const toolsOf = (raw: unknown): ToolView[] =>
      (Array.isArray(raw) ? (raw as Record<string, unknown>[]) : [])
        .filter((item) => item && typeof item.tool_id === "string")
        .map((item) => ({
          tool_id: clean(item.tool_id, 64),
          name: clean(item.name, 120) || "Walk tool",
          critical: item.critical === true,
          holds: [],
          subprocessor: item.subprocessor === true,
          retired: item.retired === true,
          href: `/data/systems/tools/${clean(item.tool_id, 64)}`,
        }));

    const policiesOf = (raw: unknown): PolicyFile[] =>
      (Array.isArray(raw) ? (raw as Record<string, unknown>[]) : [])
        .filter((item) => item && typeof item.file_id === "string")
        .map((item) => ({
          key: "personal_devices" as const,
          file_id: clean(item.file_id, 64),
          title: clean(item.title, 200) || "Personal devices policy",
          version: typeof item.version === "number" ? item.version : 1,
          href: `/data/files/${clean(item.file_id, 64)}`,
        }));

    /** The service as another module sees it: the Summary's lines, the evidence, a person's devices. */
    core.route("GET", "/data/_test/devices/service", (ctx) => ({
      summary: service.summary(today(), asOwner(ctx)),
      evidence: service.evidence(today()),
      for_person: service.forPerson(clean(ctx.query.get("person"), 64), today()),
      used_for: service.usedFor(clean(ctx.query.get("file"), 64)),
    }));

    core.route(
      "POST",
      "/data/_test/devices/tools",
      standIn(SECURITY_SERVICES.tools, (body) => standInTools(toolsOf(body.tools))),
    );
    core.route(
      "POST",
      "/data/_test/devices/policies",
      standIn(SECURITY_SERVICES.policies, (body) => standInPolicies(policiesOf(body.files))),
    );

    /**
     * The walk's stand-in: its personal devices policy put in Files (the same bytes give the
     * same file, so this is safe to run twice) and offered through `policies` while Assurance
     * is absent. Records are added through the pages, not here.
     */
    core.route("POST", "/data/_test/devices/seed", async (ctx) => {
      const by = ctx.staff();
      if (!book.devices.some((device) => device.device_id === WALK_DEVICE_ID))
        book.pinned = WALK_DEVICE_ID;
      const service = files();
      if (!service) return { policies: false, file_id: null };
      const row = await service.putFile({
        folderPath: [...WALK_POLICY.folder],
        title: WALK_POLICY.title,
        originalName: WALK_POLICY.name,
        bytes: new TextEncoder().encode(WALK_POLICY.text),
        by,
      });
      const installed = install(
        SECURITY_SERVICES.policies,
        () =>
          standInPolicies([
            {
              key: "personal_devices",
              file_id: row.file_id,
              title: row.title,
              version: row.current_n,
              href: `/data/files/${row.file_id}`,
            },
          ]),
        {},
      );
      return { policies: installed, file_id: row.file_id };
    });
  }
}
