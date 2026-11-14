/**
 * The register of members, kept whole in `members/register.json` (rewritten on every
 * change) with one line per change in `members/events.jsonl`. An entry is reversed, never
 * deleted; a certificate is cancelled, never deleted; a folio is never reused. Holdings are
 * added up from the live entries, so the view can never drift from the register.
 */

import { randomUUID } from "node:crypto";

import { Refused } from "../../mail-merge/engine";
import { addMonths, type RegisterLink, type RuleKey } from "../company-contracts";
import type { DataCore } from "../core";
import { daysBetween } from "../days";
import { cleanText, isDay, normaliseEmail } from "../guard";
import type { Staff } from "../protocol";
import {
  ENTRY_KINDS,
  HOLDER_KINDS,
  RESIDENCIES,
  SHARE_KINDS,
  countWords,
  dayWords,
} from "../../../src/lib/data/labels-registers";
import { ISSUING, MEMBER_LIMITS, MEMBER_TOTALS, OUTGOING } from "./limits";
import type {
  Certificate,
  EntryKind,
  HolderKind,
  Member,
  MembersEvent,
  Register,
  RegisterEntry,
  ShareClass,
} from "./types";

const REGISTER = "members/register.json";
const EVENTS = "members/events.jsonl";

type Input = Record<string, unknown>;

export const CHOOSE = "Choose from the list.";
export const FUTURE = "That day is in the future.";
export const NOT_A_DAY = "That is not a day.";
const MONEY = "Type the amount as a number, such as 250000.";
const atMost = (total: number) => `Data holds ${countWords(total)} at most.`;

const has = (input: Input, name: string) => Object.prototype.hasOwnProperty.call(input, name);
const isKey = <T extends object>(table: T, value: unknown): value is keyof T =>
  typeof value === "string" && Object.prototype.hasOwnProperty.call(table, value);
const blank = (value: unknown) => value === undefined || value === null || value === "";

/** A whole number typed or sent; null when blank; refused otherwise. */
function whole(value: unknown, min: number, max: number, sentence: string): number | null {
  if (blank(value)) return null;
  const parsed = typeof value === "number" ? value : Number(String(value).replace(/,/g, "").trim());
  if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max)
    throw new Refused(400, "invalid", sentence);
  return parsed;
}

const money = (value: unknown): number | null => whole(value, 0, MEMBER_LIMITS.money_max, MONEY);

/** What a write needs besides its input. */
export type Env = {
  today: string;
  amount(key: RuleKey): number | null;
  /** Whether a resolution is in Meetings; null when Meetings is not here. */
  resolution(id: string): { title: string; meeting_title: string } | null | undefined;
};

/** The word for an entry's event, as the late-entry warning says it. */
const EVENT_WORD: Record<EntryKind, string> = {
  subscription: "subscription",
  allotment: "allotment",
  transfer_in: "transfer",
  transfer_out: "transfer",
  conversion_in: "conversion",
  conversion_out: "conversion",
};

export const isLive = (entry: RegisterEntry): boolean => entry.reversed === null;

/** What an entry does to its folio's holding in its class. */
export const signedShares = (entry: RegisterEntry): number =>
  OUTGOING.has(entry.kind) ? -entry.shares : entry.shares;

export class MembersBook {
  readonly #core: DataCore;
  register: Register;
  events: MembersEvent[];

  constructor(core: DataCore) {
    this.#core = core;
    core.store.ensureDir("members");
    const stored = core.store.readJson<Partial<Register>>(REGISTER, {});
    const list = <T>(value: T[] | undefined, ok: (item: T) => boolean): T[] =>
      Array.isArray(value) ? value.filter(ok) : [];
    this.register = {
      format: 1,
      classes: list(stored.classes, (item) => typeof item?.class_id === "string"),
      members: list(stored.members, (item) => typeof item?.member_id === "string"),
      entries: list(stored.entries, (item) => typeof item?.entry_id === "string"),
      certificates: list(stored.certificates, (item) => typeof item?.certificate_id === "string"),
      next_folio: typeof stored.next_folio === "number" ? stored.next_folio : 1,
      next_certificate: typeof stored.next_certificate === "number" ? stored.next_certificate : 1,
    };
    this.events = core.store
      .readLines<MembersEvent>(EVENTS)
      .filter((event) => typeof event?.event_id === "string");
  }

  // ---------------------------------------------------------------- files

  save(): void {
    this.#core.store.writeJson(REGISTER, this.register);
  }

  event(target: MembersEvent["target"], id: string, verb: string, detail: string, by: Staff): void {
    const event: MembersEvent = {
      event_id: randomUUID(),
      target,
      id,
      verb,
      detail,
      by,
      at: this.#core.now(),
    };
    this.events.push(event);
    this.#core.store.appendLine(EVENTS, event);
  }

  // ---------------------------------------------------------------- lookups

  shareClass(id: unknown): ShareClass {
    const found = this.register.classes.find((item) => item.class_id === id);
    if (!found) throw new Refused(404, "not_found", "That class of shares is not in the register.");
    return found;
  }

  member(id: unknown): Member {
    const found = this.register.members.find((item) => item.member_id === id);
    if (!found) throw new Refused(404, "not_found", "That member is not in the register.");
    return found;
  }

  entry(id: unknown): RegisterEntry {
    const found = this.register.entries.find((item) => item.entry_id === id);
    if (!found) throw new Refused(404, "not_found", "That entry is not in the register.");
    return found;
  }

  certificate(id: unknown): Certificate {
    const found = this.register.certificates.find((item) => item.certificate_id === id);
    if (!found) throw new Refused(404, "not_found", "That certificate is not in the register.");
    return found;
  }

  /** What a folio holds in a class: every live entry, or those on or before a day. */
  held(memberId: string, classId: string, onDay?: string): number {
    let total = 0;
    for (const entry of this.register.entries)
      if (
        entry.member_id === memberId &&
        entry.class_id === classId &&
        isLive(entry) &&
        (!onDay || entry.on <= onDay)
      )
        total += signedShares(entry);
    return total;
  }

  /** Each class's issued total: what every folio holds, added up. */
  issued(classId: string): number {
    let total = 0;
    for (const entry of this.register.entries)
      if (entry.class_id === classId && isLive(entry)) total += signedShares(entry);
    return total;
  }

  /** Every holding above zero, by folio then class. */
  holdings(): {
    member_id: string;
    folio: string;
    name: string;
    class_id: string;
    class_name: string;
    class_kind: ShareClass["kind"];
    shares: number;
    of: number;
  }[] {
    const rows = [];
    for (const member of [...this.register.members].sort((a, b) => a.folio.localeCompare(b.folio)))
      for (const shareClass of this.register.classes) {
        const shares = this.held(member.member_id, shareClass.class_id);
        if (shares <= 0) continue;
        rows.push({
          member_id: member.member_id,
          folio: member.folio,
          name: member.name,
          class_id: shareClass.class_id,
          class_name: shareClass.name,
          class_kind: shareClass.kind,
          shares,
          of: this.issued(shareClass.class_id),
        });
      }
    return rows;
  }

  /** The live certificate that covers an entry, if any. */
  certificateFor(entryId: string): Certificate | null {
    return (
      this.register.certificates.find(
        (item) => item.cancelled === null && item.entry_ids.includes(entryId),
      ) ?? null
    );
  }

  link(entry: RegisterEntry): RegisterLink {
    const member = this.member(entry.member_id);
    const certificate = this.certificateFor(entry.entry_id);
    return {
      entry_id: entry.entry_id,
      member_id: member.member_id,
      folio: member.folio,
      shares: entry.shares,
      class_name: this.shareClass(entry.class_id).name,
      allotted_on: entry.on,
      entered_on: entry.entered_on,
      certificate: certificate
        ? { number: certificate.number, issued_on: certificate.issued_on }
        : null,
      reversed: entry.reversed !== null,
      href: `/data/company/members#member-${member.member_id}`,
    };
  }

  // ---------------------------------------------------------------- the checks

  #day(value: unknown, today: string): string {
    if (!isDay(value)) throw new Refused(400, "invalid", NOT_A_DAY);
    if (value > today) throw new Refused(400, "invalid", FUTURE);
    return value;
  }

  #range(input: Input, shares: number): { from: number; to: number } | null {
    const from = whole(
      input.distinctive_from,
      1,
      MEMBER_LIMITS.shares_max,
      "Type the distinctive numbers as whole numbers.",
    );
    const to = whole(
      input.distinctive_to,
      1,
      MEMBER_LIMITS.shares_max,
      "Type the distinctive numbers as whole numbers.",
    );
    if (from === null && to === null) return null;
    if (from === null || to === null || to - from + 1 !== shares)
      throw new Refused(
        400,
        "invalid",
        `The distinctive numbers do not add up to ${countWords(shares)} shares.`,
      );
    return { from, to };
  }

  #shares(value: unknown): number {
    const shares = whole(
      value,
      1,
      MEMBER_LIMITS.shares_max,
      "Type the number of shares, such as 1250.",
    );
    if (shares === null)
      throw new Refused(400, "invalid", "Type the number of shares, such as 1250.");
    return shares;
  }

  // ---------------------------------------------------------------- classes and members

  addClass(input: Input, by: Staff): ShareClass {
    const name = cleanText(input.name, MEMBER_LIMITS.class_name);
    if (!name)
      throw new Refused(
        400,
        "invalid",
        "Give the class a name, such as “Equity shares of ₹10 each”.",
      );
    if (this.register.classes.some((item) => item.name.toLowerCase() === name.toLowerCase()))
      throw new Refused(409, "class_taken", `There is already a class called ${name}.`);
    const kind = blank(input.kind) ? "equity" : input.kind;
    if (!isKey(SHARE_KINDS, kind)) throw new Refused(400, "invalid", CHOOSE);
    const nominal = whole(
      input.nominal,
      1,
      MEMBER_LIMITS.nominal_max,
      "Type the nominal value a share in whole rupees, such as 10.",
    );
    if (nominal === null)
      throw new Refused(
        400,
        "invalid",
        "Type the nominal value a share in whole rupees, such as 10.",
      );
    const shareClass: ShareClass = {
      class_id: randomUUID(),
      name,
      kind: kind as ShareClass["kind"],
      nominal,
      created_at: this.#core.now(),
      created_by: by,
    };
    this.register.classes.push(shareClass);
    this.save();
    this.event("class", shareClass.class_id, "added", name, by);
    return shareClass;
  }

  #memberFields(input: Input, base: Member | null, today: string) {
    const pick = (name: string) => has(input, name) || !base;
    const name = pick("name") ? cleanText(input.name, MEMBER_LIMITS.name) : base!.name;
    if (!name) throw new Refused(400, "invalid", "Give the member's name.");
    const kind = pick("kind") ? (blank(input.kind) ? "person" : input.kind) : base!.kind;
    if (!isKey(HOLDER_KINDS, kind)) throw new Refused(400, "invalid", CHOOSE);
    let email = base?.email ?? "";
    if (pick("email")) {
      const typed = typeof input.email === "string" ? input.email.trim() : "";
      email = typed ? normaliseEmail(typed) : "";
      if (typed && !email)
        throw new Refused(400, "invalid", "That email address does not look right.");
    }
    const residency = pick("residency") ? (input.residency ?? "") : base!.residency;
    if (!isKey(RESIDENCIES, residency)) throw new Refused(400, "invalid", CHOOSE);
    const became = pick("became_member_on") ? input.became_member_on : base!.became_member_on;
    const ceased = has(input, "ceased_on") ? input.ceased_on : (base?.ceased_on ?? null);
    if (!blank(ceased) && !isDay(ceased)) throw new Refused(400, "invalid", NOT_A_DAY);
    return {
      name,
      kind: kind as HolderKind,
      email,
      address: pick("address") ? cleanText(input.address, MEMBER_LIMITS.address) : base!.address,
      id_number: pick("id_number")
        ? cleanText(input.id_number, MEMBER_LIMITS.id_number)
        : base!.id_number,
      residency: residency as Member["residency"],
      nationality: pick("nationality")
        ? cleanText(input.nationality, MEMBER_LIMITS.nationality)
        : base!.nationality,
      backers_note: pick("backers_note")
        ? cleanText(input.backers_note, MEMBER_LIMITS.backers_note)
        : base!.backers_note,
      became_member_on: this.#day(became, today),
      ceased_on: blank(ceased) ? null : (ceased as string),
    };
  }

  addMember(input: Input, by: Staff, today: string, investorId: string | null = null): Member {
    if (this.register.members.length >= MEMBER_TOTALS.members)
      throw new Refused(409, "too_many", atMost(MEMBER_TOTALS.members));
    const fields = this.#memberFields(input, null, today);
    const at = this.#core.now();
    const member: Member = {
      member_id: randomUUID(),
      folio: `F${String(this.register.next_folio).padStart(3, "0")}`,
      ...fields,
      investor_id: investorId,
      created_at: at,
      created_by: by,
      updated_at: at,
      updated_by: by,
    };
    this.register.next_folio += 1;
    this.register.members.push(member);
    this.save();
    this.event("member", member.member_id, "added", `${member.folio} ${member.name}`, by);
    return member;
  }

  updateMember(member: Member, input: Input, by: Staff, today: string): Member {
    Object.assign(member, this.#memberFields(input, member, today));
    member.updated_at = this.#core.now();
    member.updated_by = by;
    this.save();
    this.event("member", member.member_id, "changed", member.folio, by);
    return member;
  }

  // ---------------------------------------------------------------- entries

  recordEntry(
    input: Input,
    by: Staff,
    env: Env,
    closingKey: string | null = null,
  ): { entry: RegisterEntry; warnings: string[] } {
    if (this.register.entries.length >= MEMBER_TOTALS.entries)
      throw new Refused(409, "too_many", atMost(MEMBER_TOTALS.entries));
    const member = this.member(input.member_id);
    const shareClass = this.shareClass(input.class_id);
    const kind = blank(input.kind) ? "allotment" : input.kind;
    if (!isKey(ENTRY_KINDS, kind)) throw new Refused(400, "invalid", CHOOSE);
    const shares = this.#shares(input.shares);
    const distinctive = this.#range(input, shares);
    const on = this.#day(input.on, env.today);
    const enteredOn = blank(input.entered_on) ? env.today : this.#day(input.entered_on, env.today);
    if (enteredOn < on)
      throw new Refused(400, "invalid", "It cannot be entered before it happened.");
    if (distinctive && ISSUING.has(kind)) {
      const clash = this.register.entries.find(
        (other) =>
          other.class_id === shareClass.class_id &&
          isLive(other) &&
          ISSUING.has(other.kind) &&
          other.distinctive &&
          other.distinctive.from <= distinctive.to &&
          distinctive.from <= other.distinctive.to,
      );
      if (clash)
        throw new Refused(
          409,
          "overlap",
          `Shares ${countWords(distinctive.from)}–${countWords(distinctive.to)} of this class are already in folio ${this.member(clash.member_id).folio}.`,
        );
    }
    if (OUTGOING.has(kind)) {
      const held = this.held(member.member_id, shareClass.class_id, on);
      if (shares > held)
        throw new Refused(
          409,
          "not_held",
          `Folio ${member.folio} holds ${countWords(held)} of these shares; it cannot give up more.`,
        );
    }
    let counterpart: string | null = null;
    if (!blank(input.counterpart_member_id))
      counterpart = this.member(input.counterpart_member_id).member_id;
    let resolutionId: string | null = null;
    if (!blank(input.resolution_id)) {
      const found = env.resolution(String(input.resolution_id));
      if (found === null)
        throw new Refused(404, "not_found", "That resolution is not in Meetings.");
      if (found !== undefined) resolutionId = String(input.resolution_id);
    }
    const entry: RegisterEntry = {
      entry_id: randomUUID(),
      member_id: member.member_id,
      class_id: shareClass.class_id,
      kind: kind as EntryKind,
      shares,
      distinctive,
      price_per_share: money(input.price_per_share),
      paid_up_per_share: money(input.paid_up_per_share),
      on,
      entered_on: enteredOn,
      resolution: {
        resolution_id: resolutionId,
        words: cleanText(input.resolution_words, MEMBER_LIMITS.resolution_words),
      },
      closing_key: closingKey,
      counterpart_member_id: counterpart,
      note: cleanText(input.note, MEMBER_LIMITS.note),
      reversed: null,
      created_at: this.#core.now(),
      created_by: by,
    };
    this.register.entries.push(entry);
    this.save();
    this.event(
      "entry",
      entry.entry_id,
      "added",
      `${ENTRY_KINDS[entry.kind]} · ${member.folio} · ${countWords(shares)}`,
      by,
    );
    return { entry, warnings: this.entryWarnings(entry, env) };
  }

  entryWarnings(entry: RegisterEntry, env: Env): string[] {
    const rule = env.amount("register-entry") ?? 7;
    const late = daysBetween(entry.on, entry.entered_on);
    return late > rule
      ? [
          `Entered ${countWords(late)} days after the ${EVENT_WORD[entry.kind]}; the rule is ${countWords(rule)}. Confirm with your CS.`,
        ]
      : [];
  }

  reverseEntry(entry: RegisterEntry, input: Input, by: Staff, today: string): RegisterEntry {
    if (entry.reversed)
      throw new Refused(409, "already_reversed", "That entry is already reversed.");
    const why = cleanText(input.why, MEMBER_LIMITS.why);
    if (!why) throw new Refused(400, "invalid", "Say why it is reversed.");
    const on = blank(input.on) ? today : this.#day(input.on, today);
    entry.reversed = { on, why, at: this.#core.now(), by };
    this.save();
    this.event("entry", entry.entry_id, "reversed", why, by);
    return entry;
  }

  // ---------------------------------------------------------------- certificates

  /** The certificate's fields, checked before any copy is kept. */
  checkCertificate(
    input: Input,
    env: Env,
  ): Omit<Certificate, "certificate_id" | "file_id" | "cancelled" | "created_at" | "created_by"> {
    if (this.register.certificates.length >= MEMBER_TOTALS.certificates)
      throw new Refused(409, "too_many", atMost(MEMBER_TOTALS.certificates));
    const member = this.member(input.member_id);
    const shareClass = this.shareClass(input.class_id);
    const shares = this.#shares(input.shares);
    const held = this.held(member.member_id, shareClass.class_id);
    if (shares > held)
      throw new Refused(
        409,
        "not_held",
        `Folio ${member.folio} holds ${countWords(held)} of these shares, fewer than the certificate's ${countWords(shares)}.`,
      );
    const distinctive = this.#range(input, shares);
    const typed = cleanText(input.number, MEMBER_LIMITS.number);
    const taken = (number: string) =>
      this.register.certificates.some((item) => item.number.toLowerCase() === number.toLowerCase());
    if (typed && taken(typed))
      throw new Refused(409, "number_taken", `Certificate ${typed} is already issued.`);
    let number = typed;
    if (!number) {
      let next = this.register.next_certificate;
      while (taken(`SC-${String(next).padStart(3, "0")}`)) next += 1;
      number = `SC-${String(next).padStart(3, "0")}`;
    }
    const issuedOn = this.#day(input.issued_on, env.today);
    const asked = Array.isArray(input.entry_ids) ? input.entry_ids : [];
    const entryIds = asked.filter(
      (id): id is string =>
        typeof id === "string" &&
        this.register.entries.some(
          (entry) =>
            entry.entry_id === id &&
            entry.member_id === member.member_id &&
            entry.class_id === shareClass.class_id,
        ),
    );
    return {
      number,
      member_id: member.member_id,
      class_id: shareClass.class_id,
      shares,
      distinctive,
      issued_on: issuedOn,
      stamp: {
        amount: money(input.stamp_amount),
        reference: cleanText(input.stamp_reference, MEMBER_LIMITS.stamp_reference),
      },
      entry_ids: entryIds,
    };
  }

  issueCertificate(
    fields: ReturnType<MembersBook["checkCertificate"]>,
    fileId: string | null,
    by: Staff,
  ): Certificate {
    const certificate: Certificate = {
      certificate_id: randomUUID(),
      ...fields,
      file_id: fileId,
      cancelled: null,
      created_at: this.#core.now(),
      created_by: by,
    };
    if (/^SC-\d+$/.test(certificate.number)) {
      const used = Number(certificate.number.slice(3));
      if (used >= this.register.next_certificate) this.register.next_certificate = used + 1;
    }
    this.register.certificates.push(certificate);
    this.save();
    this.event("certificate", certificate.certificate_id, "issued", certificate.number, by);
    return certificate;
  }

  certificateWarnings(certificate: Certificate, env: Env): string[] {
    const months = env.amount("share-certificates") ?? 2;
    const covered = certificate.entry_ids
      .map((id) => this.register.entries.find((entry) => entry.entry_id === id))
      .filter((entry): entry is RegisterEntry => Boolean(entry));
    const from =
      covered.length > 0
        ? covered
        : this.register.entries.filter(
            (entry) =>
              entry.member_id === certificate.member_id &&
              entry.class_id === certificate.class_id &&
              isLive(entry) &&
              ISSUING.has(entry.kind) &&
              entry.on <= certificate.issued_on,
          );
    const latest = from
      .map((entry) => entry.on)
      .sort()
      .at(-1);
    if (!latest || certificate.issued_on <= addMonths(latest, months)) return [];
    return [
      `Issued more than ${countWords(months)} months after the allotment on ${dayWords(latest)}; the rule is within ${countWords(months)} months. Confirm with your CS.`,
    ];
  }

  cancelCertificate(certificate: Certificate, input: Input, by: Staff, today: string): Certificate {
    if (certificate.cancelled)
      throw new Refused(409, "already_cancelled", "That certificate is already cancelled.");
    const why = cleanText(input.why, MEMBER_LIMITS.why);
    if (!why) throw new Refused(400, "invalid", "Say why it is cancelled.");
    const on = blank(input.on) ? today : this.#day(input.on, today);
    certificate.cancelled = { on, why, at: this.#core.now(), by };
    this.save();
    this.event("certificate", certificate.certificate_id, "cancelled", why, by);
    return certificate;
  }
}
