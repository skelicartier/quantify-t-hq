/**
 * The assurance book (ws-notes/security/spec.md §8.2): `assurance/certifications.json`,
 * `assurance/insurance.json`, `assurance/reviews.json` (each `{ format: 1, … }`),
 * `assurance/setup.json` (his months between management reviews) and
 * `assurance/events.jsonl` (one line per change: verb and field names, never values).
 * Nothing is deleted: a certificate lapses or is withdrawn, a policy is renewed by another,
 * an action is marked done.
 */

import { randomUUID } from "node:crypto";

import { Refused } from "../../mail-merge/engine";
import type { DataCore } from "../core";
import { clean, cleanText, isDay } from "../guard";
import type { Staff } from "../protocol";
import {
  CERT_STANDARDS,
  CERT_STATUS_KEYS,
  INSURANCE_KIND_KEYS,
  REVIEW_INPUT_KEYS,
  type ReviewInputKey,
} from "../../../src/lib/data/labels-assurance";
import { isDutyCurrency, minorOf } from "../../../src/lib/data/labels-duties";
import { LIMIT, SAY } from "./limits";
import type {
  AssuranceEvent,
  Certification,
  InsurancePolicy,
  ManagementReview,
  ReviewAction,
  Setup,
  Stamp,
  Surveillance,
} from "./types";

const CERTIFICATIONS = "assurance/certifications.json";
const INSURANCE = "assurance/insurance.json";
const REVIEWS = "assurance/reviews.json";
const SETUP = "assurance/setup.json";
const EVENTS = "assurance/events.jsonl";

type Input = Record<string, unknown>;

const has = (input: Input, name: string) => Object.prototype.hasOwnProperty.call(input, name);
const listOf = <T>(value: unknown, keep: (item: T) => boolean): T[] =>
  Array.isArray(value) ? (value as T[]).filter((item) => item && keep(item)) : [];

const WORDS: Record<string, string> = {
  standard: "Standard",
  name: "Name",
  status: "Status",
  body: "Certification body",
  accredited_by: "Accredited by",
  accreditation_checked_on: "Accreditation checked",
  consultant: "Consultant",
  scope: "Scope",
  stage1_on: "Stage 1",
  stage2_on: "Stage 2",
  certificate_number: "Certificate number",
  issued_on: "Issued",
  expires_on: "Expires",
  report: "Report",
  notes: "Notes",
  kind: "Cover",
  insurer: "Insurer",
  policy_number: "Policy number",
  cover_minor: "Amount",
  currency: "Currency",
  premium_minor: "Premium",
  starts_on: "From",
  ends_on: "To",
  broker: "Broker",
  held_on: "Held",
  attendees: "Attendees",
  inputs: "Inputs",
  decisions: "Decisions",
};

function changed(before: object, after: object): string {
  const a = before as Record<string, unknown>;
  const b = after as Record<string, unknown>;
  const keys = Object.keys(WORDS).filter(
    (key) => key in b && JSON.stringify(a[key]) !== JSON.stringify(b[key]),
  );
  return keys.length ? keys.map((key) => WORDS[key] ?? key).join(", ") : "Nothing";
}

export class AssuranceBook {
  readonly #core: DataCore;
  readonly #today: () => string;
  certifications: Certification[];
  insurance: InsurancePolicy[];
  reviews: ManagementReview[];
  setup: Setup;

  constructor(core: DataCore, today: () => string) {
    this.#core = core;
    this.#today = today;
    core.store.ensureDir("assurance");
    const certs = core.store.readJson<Record<string, unknown>>(CERTIFICATIONS, {});
    this.certifications = listOf<Certification>(
      certs.certifications,
      (item) => typeof item.cert_id === "string",
    ).map((item) => ({
      ...item,
      surveillance: Array.isArray(item.surveillance) ? item.surveillance : [],
    }));
    const cover = core.store.readJson<Record<string, unknown>>(INSURANCE, {});
    this.insurance = listOf<InsurancePolicy>(
      cover.insurance,
      (item) => typeof item.insurance_id === "string",
    );
    const held = core.store.readJson<Record<string, unknown>>(REVIEWS, {});
    this.reviews = listOf<ManagementReview>(
      held.reviews,
      (item) => typeof item.review_id === "string" && isDay(item.held_on),
    ).map((item) => ({ ...item, actions: Array.isArray(item.actions) ? item.actions : [] }));
    const setup = core.store.readJson<Partial<Setup>>(SETUP, {});
    this.setup = {
      format: 1,
      review_months: typeof setup.review_months === "number" ? setup.review_months : null,
    };
  }

  // ---------------------------------------------------------------- storing

  #saveCertifications(): void {
    this.#core.store.writeJson(CERTIFICATIONS, { format: 1, certifications: this.certifications });
  }

  #saveInsurance(): void {
    this.#core.store.writeJson(INSURANCE, { format: 1, insurance: this.insurance });
  }

  #saveReviews(): void {
    this.#core.store.writeJson(REVIEWS, { format: 1, reviews: this.reviews });
  }

  log(target: AssuranceEvent["target"], id: string, verb: string, detail: string, by: Staff): void {
    const line: AssuranceEvent = {
      event_id: randomUUID(),
      target,
      id,
      verb,
      detail,
      by,
      at: this.#core.now(),
    };
    this.#core.store.appendLine(EVENTS, line);
  }

  eventsOf(id: string, limit = 50): AssuranceEvent[] {
    return this.#core.store
      .readLines<AssuranceEvent>(EVENTS)
      .filter((event) => typeof event?.event_id === "string" && event.id === id)
      .reverse()
      .slice(0, limit);
  }

  #stamp(by: Staff): Stamp {
    const now = this.#core.now();
    return { created_at: now, created_by: by, updated_at: now, updated_by: by };
  }

  #touch(record: Stamp, by: Staff): void {
    record.updated_at = this.#core.now();
    record.updated_by = by;
  }

  // ---------------------------------------------------------------- reading inputs

  #day(value: unknown, { past = false, required = "" } = {}): string | null {
    const day = clean(value, 10);
    if (!day) {
      if (required) throw new Refused(400, "invalid", required);
      return null;
    }
    if (!isDay(day)) throw new Refused(400, "invalid", SAY.notADay);
    if (past && day > this.#today()) throw new Refused(400, "invalid", SAY.future);
    return day;
  }

  #text(value: unknown, limit: number, say: string): string {
    const text = cleanText(value, limit + 1);
    if (text.length > limit) throw new Refused(400, "invalid", say);
    return text;
  }

  /** A certificate or policy number: `clean`, never `cleanText` (a number can look like a key). */
  #number(value: unknown): string {
    const text = clean(value, LIMIT.number + 1);
    if (text.length > LIMIT.number) throw new Refused(400, "invalid", SAY.number);
    return text;
  }

  #money(value: unknown): number | null {
    const text = clean(String(value ?? ""), 40);
    if (!text) return null;
    const minor = minorOf(text);
    if (minor === null) throw new Refused(400, "invalid", SAY.amount);
    return minor;
  }

  // ---------------------------------------------------------------- certifications

  certification(id: string | undefined): Certification {
    const found = id ? this.certifications.find((item) => item.cert_id === id) : undefined;
    if (!found) throw new Refused(404, "not_found", SAY.certification);
    return found;
  }

  #certFields(input: Input, base: Certification | null) {
    const pick = <K extends keyof Certification>(
      key: K,
      read: (value: unknown) => Certification[K],
    ) => (has(input, key) ? read(input[key]) : base ? base[key] : read(undefined));
    const standard = pick("standard", (value) => {
      const text = clean(value, 12) || "iso27001";
      if (!Object.prototype.hasOwnProperty.call(CERT_STANDARDS, text))
        throw new Refused(400, "invalid", SAY.standard);
      return text as Certification["standard"];
    });
    const name = pick("name", (value) => this.#text(value, LIMIT.name, SAY.otherName));
    if (standard === "other" && !name) throw new Refused(400, "invalid", SAY.otherName);
    const status = pick("status", (value) => {
      const text = clean(value, 12) || "planning";
      if (!(CERT_STATUS_KEYS as readonly string[]).includes(text))
        throw new Refused(400, "invalid", SAY.status);
      return text as Certification["status"];
    });
    const issuedOn = pick("issued_on", (value) => this.#day(value, { past: true }));
    const expiresOn = pick("expires_on", (value) => this.#day(value));
    if (issuedOn && expiresOn && expiresOn <= issuedOn)
      throw new Refused(400, "invalid", SAY.expiresAfter);
    let report = base?.report ?? null;
    if (has(input, "report_kind") || has(input, "report_from") || has(input, "report_to")) {
      const kind = clean(input.report_kind, 6);
      if (!kind) report = null;
      else if (kind !== "type1" && kind !== "type2")
        throw new Refused(400, "invalid", SAY.reportKind);
      else
        report = {
          kind,
          from: this.#day(input.report_from),
          to: this.#day(input.report_to),
        };
    }
    return {
      standard,
      name,
      status,
      body: pick("body", (value) => this.#text(value, LIMIT.name, SAY.name)),
      accredited_by: pick("accredited_by", (value) => this.#text(value, LIMIT.name, SAY.name)),
      accreditation_checked_on: pick("accreditation_checked_on", (value) =>
        this.#day(value, { past: true }),
      ),
      consultant: pick("consultant", (value) => this.#text(value, LIMIT.name, SAY.name)),
      scope: pick("scope", (value) => this.#text(value, LIMIT.scope, SAY.scope)),
      stage1_on: pick("stage1_on", (value) => this.#day(value)),
      stage2_on: pick("stage2_on", (value) => this.#day(value)),
      certificate_number: pick("certificate_number", (value) => this.#number(value)),
      issued_on: issuedOn,
      expires_on: expiresOn,
      report,
      notes: pick("notes", (value) => this.#text(value, LIMIT.notes, SAY.input)),
    };
  }

  /** Checks the fields before a copy of the certificate is kept. */
  checkCertification(input: Input, base: Certification | null): void {
    if (!base && this.certifications.length >= LIMIT.certifications)
      throw new Refused(409, "too_many", SAY.tooMany);
    this.#certFields(input, base);
  }

  addCertification(input: Input, fileId: string | null, by: Staff): Certification {
    this.checkCertification(input, null);
    const cert: Certification = {
      cert_id: randomUUID(),
      ...this.#certFields(input, null),
      surveillance: [],
      certificate_file_id: fileId,
      ...this.#stamp(by),
    };
    this.certifications.push(cert);
    this.#saveCertifications();
    this.log("certification", cert.cert_id, "added", "", by);
    return cert;
  }

  updateCertification(
    cert: Certification,
    input: Input,
    fileId: string | null | undefined,
    by: Staff,
  ): Certification {
    const fields = this.#certFields(input, cert);
    const detail = changed(cert, fields);
    Object.assign(cert, fields);
    if (fileId !== undefined) cert.certificate_file_id = fileId;
    this.#touch(cert, by);
    this.#saveCertifications();
    this.log("certification", cert.cert_id, "changed", detail, by);
    return cert;
  }

  /** Checks a surveillance audit's fields before its report is kept; the audit's number. */
  checkSurveillance(cert: Certification, n: unknown, input: Input): 1 | 2 {
    const number = Number(n);
    if (number !== 1 && number !== 2) throw new Refused(400, "invalid", SAY.surveillance);
    this.#day(input.due_on);
    this.#day(input.held_on, { past: true });
    this.#text(input.outcome, LIMIT.outcome, SAY.input);
    return number;
  }

  surveillance(
    cert: Certification,
    n: unknown,
    input: Input,
    fileId: string | null,
    by: Staff,
  ): Certification {
    const number = this.checkSurveillance(cert, n, input);
    const found = cert.surveillance.find((item) => item.n === number);
    const base: Surveillance = found ?? {
      n: number,
      due_on: null,
      held_on: null,
      outcome: "",
      file_id: null,
    };
    const next: Surveillance = {
      n: number,
      due_on: has(input, "due_on") ? this.#day(input.due_on) : base.due_on,
      held_on: has(input, "held_on") ? this.#day(input.held_on, { past: true }) : base.held_on,
      outcome: has(input, "outcome")
        ? this.#text(input.outcome, LIMIT.outcome, SAY.input)
        : base.outcome,
      file_id: fileId ?? base.file_id,
    };
    cert.surveillance = [...cert.surveillance.filter((item) => item.n !== number), next].sort(
      (a, b) => a.n - b.n,
    );
    this.#touch(cert, by);
    this.#saveCertifications();
    this.log("certification", cert.cert_id, `surveillance audit ${number}`, "", by);
    return cert;
  }

  // ---------------------------------------------------------------- insurance

  policy(id: string | undefined): InsurancePolicy {
    const found = id ? this.insurance.find((item) => item.insurance_id === id) : undefined;
    if (!found) throw new Refused(404, "not_found", SAY.insurance);
    return found;
  }

  #insuranceFields(input: Input, base: InsurancePolicy | null) {
    const pick = <K extends keyof InsurancePolicy>(
      key: K,
      read: (value: unknown) => InsurancePolicy[K],
    ) => (has(input, key) ? read(input[key]) : base ? base[key] : read(undefined));
    const kind = pick("kind", (value) => {
      const text = clean(value, 24) || "cyber";
      if (!(INSURANCE_KIND_KEYS as readonly string[]).includes(text))
        throw new Refused(400, "invalid", SAY.kind);
      return text as InsurancePolicy["kind"];
    });
    const name = pick("name", (value) => this.#text(value, LIMIT.name, SAY.name));
    const insurer = pick("insurer", (value) => {
      const text = this.#text(value, LIMIT.name, SAY.insurer);
      if (!text) throw new Refused(400, "invalid", SAY.insurer);
      return text;
    });
    const currency = pick("currency", (value) => {
      const text = clean(value, 3) || "INR";
      if (!isDutyCurrency(text)) throw new Refused(400, "invalid", SAY.currency);
      return text;
    });
    const startsOn = pick("starts_on", (value) => this.#day(value));
    const endsOn = pick("ends_on", (value) => this.#day(value));
    if (startsOn && endsOn && endsOn <= startsOn) throw new Refused(400, "invalid", SAY.endsAfter);
    return {
      kind,
      name,
      insurer,
      policy_number: pick("policy_number", (value) => this.#number(value)),
      cover_minor: has(input, "cover")
        ? this.#money(input.cover)
        : (base?.cover_minor ?? this.#money(undefined)),
      currency,
      premium_minor: has(input, "premium")
        ? this.#money(input.premium)
        : (base?.premium_minor ?? null),
      starts_on: startsOn,
      ends_on: endsOn,
      broker: pick("broker", (value) => this.#text(value, LIMIT.name, SAY.name)),
      notes: pick("notes", (value) => this.#text(value, LIMIT.notes, SAY.input)),
    };
  }

  checkInsurance(input: Input, base: InsurancePolicy | null): void {
    if (!base && this.insurance.length >= LIMIT.insurance)
      throw new Refused(409, "too_many", SAY.tooMany);
    this.#insuranceFields(input, base);
  }

  addInsurance(input: Input, fileId: string | null, by: Staff): InsurancePolicy {
    this.checkInsurance(input, null);
    const policy: InsurancePolicy = {
      insurance_id: randomUUID(),
      ...this.#insuranceFields(input, null),
      certificate_file_id: fileId,
      renewed_by: null,
      ...this.#stamp(by),
    };
    this.insurance.push(policy);
    this.#saveInsurance();
    this.log("insurance", policy.insurance_id, "added", "", by);
    return policy;
  }

  updateInsurance(
    policy: InsurancePolicy,
    input: Input,
    fileId: string | null | undefined,
    by: Staff,
  ): InsurancePolicy {
    const fields = this.#insuranceFields(input, policy);
    const detail = changed(policy, fields);
    Object.assign(policy, fields);
    if (fileId !== undefined) policy.certificate_file_id = fileId;
    this.#touch(policy, by);
    this.#saveInsurance();
    this.log("insurance", policy.insurance_id, "changed", detail, by);
    return policy;
  }

  /** A new policy continuing this one: its kind, insurer and broker carried over unless given. */
  renew(policy: InsurancePolicy, input: Input, fileId: string | null, by: Staff): InsurancePolicy {
    if (policy.renewed_by) throw new Refused(409, "invalid", SAY.renewed);
    const carried: Input = {
      kind: policy.kind,
      name: policy.name,
      insurer: policy.insurer,
      broker: policy.broker,
      currency: policy.currency,
      ...input,
    };
    const next = this.addInsurance(carried, fileId, by);
    policy.renewed_by = next.insurance_id;
    this.#touch(policy, by);
    this.#saveInsurance();
    this.log("insurance", policy.insurance_id, "renewed", "", by);
    return next;
  }

  // ---------------------------------------------------------------- management reviews

  review(id: string | undefined): ManagementReview {
    const found = id ? this.reviews.find((item) => item.review_id === id) : undefined;
    if (!found) throw new Refused(404, "not_found", SAY.review);
    return found;
  }

  #inputs(input: Input, base: ManagementReview["inputs"]): ManagementReview["inputs"] {
    const given =
      input.inputs && typeof input.inputs === "object"
        ? (input.inputs as Record<string, unknown>)
        : {};
    const next: Partial<Record<ReviewInputKey, string>> = { ...base };
    for (const key of REVIEW_INPUT_KEYS) {
      if (!has(given, key)) continue;
      const text = this.#text(given[key], LIMIT.input, SAY.input);
      if (text) next[key] = text;
      else delete next[key];
    }
    return next;
  }

  #reviewFields(input: Input, base: ManagementReview | null) {
    const heldOn = has(input, "held_on")
      ? this.#day(input.held_on, { past: true, required: SAY.heldOn })!
      : (base?.held_on ?? this.#day("", { required: SAY.heldOn })!);
    return {
      held_on: heldOn,
      attendees: has(input, "attendees")
        ? this.#text(input.attendees, LIMIT.attendees, SAY.attendees)
        : (base?.attendees ?? ""),
      inputs: this.#inputs(input, base?.inputs ?? {}),
      decisions: has(input, "decisions")
        ? this.#text(input.decisions, LIMIT.decisions, SAY.input)
        : (base?.decisions ?? ""),
    };
  }

  checkReview(input: Input, base: ManagementReview | null): void {
    if (!base && this.reviews.length >= LIMIT.reviews)
      throw new Refused(409, "too_many", SAY.tooMany);
    this.#reviewFields(input, base);
    if (!base) this.#actionsOf(input.actions);
  }

  #action(input: Input): ReviewAction {
    const what = cleanText(input.what, LIMIT.what + 1);
    if (what.length < LIMIT.what_min || what.length > LIMIT.what)
      throw new Refused(400, "invalid", SAY.what);
    return {
      action_id: randomUUID(),
      what,
      owner: this.#text(input.owner, LIMIT.name, SAY.owner),
      due_on: this.#day(input.due_on),
      done_on: null,
    };
  }

  #actionsOf(value: unknown): ReviewAction[] {
    if (!Array.isArray(value)) return [];
    const given = value.filter(
      (item): item is Input =>
        Boolean(item) && typeof item === "object" && clean((item as Input).what, 400) !== "",
    );
    if (given.length > LIMIT.actions) throw new Refused(400, "invalid", SAY.tooManyActions);
    return given.map((item) => this.#action(item));
  }

  addReview(input: Input, fileId: string | null, by: Staff): ManagementReview {
    this.checkReview(input, null);
    const review: ManagementReview = {
      review_id: randomUUID(),
      ...this.#reviewFields(input, null),
      actions: this.#actionsOf(input.actions),
      minutes_file_id: fileId,
      ...this.#stamp(by),
    };
    this.reviews.push(review);
    this.#saveReviews();
    this.log("review", review.review_id, "added", "", by);
    return review;
  }

  updateReview(
    review: ManagementReview,
    input: Input,
    fileId: string | null | undefined,
    by: Staff,
  ): ManagementReview {
    const fields = this.#reviewFields(input, review);
    const detail = changed(review, fields);
    Object.assign(review, fields);
    if (fileId !== undefined) review.minutes_file_id = fileId;
    this.#touch(review, by);
    this.#saveReviews();
    this.log("review", review.review_id, "changed", detail, by);
    return review;
  }

  addAction(review: ManagementReview, input: Input, by: Staff): ManagementReview {
    if (review.actions.length >= LIMIT.actions)
      throw new Refused(409, "too_many", SAY.tooManyActions);
    review.actions.push(this.#action(input));
    this.#touch(review, by);
    this.#saveReviews();
    this.log("review", review.review_id, "action added", "", by);
    return review;
  }

  actionDone(actionId: string | undefined, input: Input, by: Staff): ManagementReview {
    const review = this.reviews.find((item) =>
      item.actions.some((action) => action.action_id === actionId),
    );
    const action = review?.actions.find((item) => item.action_id === actionId);
    if (!review || !action) throw new Refused(404, "not_found", SAY.action);
    if (input.undo === true) action.done_on = null;
    else {
      if (action.done_on) throw new Refused(409, "invalid", SAY.done);
      action.done_on = this.#day(input.on, { past: true }) ?? this.#today();
    }
    this.#touch(review, by);
    this.#saveReviews();
    this.log(
      "review",
      review.review_id,
      input.undo === true ? "action reopened" : "action done",
      "",
      by,
    );
    return review;
  }

  saveSetup(input: Input, by: Staff): Setup {
    let months = this.setup.review_months;
    if (has(input, "review_months")) {
      const text = clean(String(input.review_months ?? ""), 4);
      if (!text) months = null;
      else {
        const value = /^\d+$/.test(text) ? Number(text) : NaN;
        if (!Number.isInteger(value) || value < LIMIT.months_min || value > LIMIT.months_max)
          throw new Refused(400, "invalid", SAY.months);
        months = value;
      }
    }
    this.setup = { format: 1, review_months: months };
    this.#core.store.writeJson(SETUP, this.setup);
    this.log("setup", "setup", "changed", "Months between reviews", by);
    return this.setup;
  }
}
