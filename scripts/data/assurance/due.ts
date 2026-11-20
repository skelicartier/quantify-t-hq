/**
 * The days certification, insurance and management reviews work out (ws-notes/security/spec.md
 * §5.4), and the sentences each reads. Pure: the records and the day are given.
 *
 * Certification: the expiry typed from the certificate, else `addMonths(issued_on, 36)`;
 * surveillance audits `addMonths(issued_on, 12)` and `(…, 24)` unless the body's days are
 * typed; stage audits on their typed days. In Due from 14 days before a stage audit, 60
 * before a surveillance audit, 90 before the expiry. Insurance: from 30 days before the
 * cover ends, until a renewal is recorded. Management review: `addMonths(last held, his
 * months ?? 12)`, from 30 days before; each action from 7 days before its day until done.
 */

import { addMonths } from "../company-contracts";
import { inDue } from "../security-contracts";
import { dayWords } from "../../../src/lib/data/labels-company";
import { PRACTICES } from "../../../src/lib/data/labels-controls";
import { CERT_STANDARDS, INSURANCE_KINDS } from "../../../src/lib/data/labels-assurance";
import { AHEAD } from "./limits";
import type { Certification, InsurancePolicy, ManagementReview, ReviewAction } from "./types";

// ------------------------------------------------------------------ certification

/** "ISO 27001", "SOC 2", or the name he typed. */
export const standardWords = (cert: Pick<Certification, "standard" | "name">): string =>
  cert.standard === "other" ? cert.name || CERT_STANDARDS.other : CERT_STANDARDS[cert.standard];

export type CertDayKey = "stage1" | "stage2" | "s1" | "s2" | "expiry";

export type CertDay = {
  key: CertDayKey;
  title: string;
  on: string;
  ahead: number;
  /** An audit (the calendar takes it), not the expiry. */
  audit: boolean;
};

const SURVEILLED = (cert: Certification) => cert.standard !== "soc2";

/** The expiry: typed, else 36 months after issue (a SOC 2 report has none unless typed). */
export function expiryOf(cert: Certification): string | null {
  if (cert.expires_on) return cert.expires_on;
  if (!cert.issued_on || !SURVEILLED(cert)) return null;
  return addMonths(cert.issued_on, PRACTICES.certificate_life.amount);
}

/** Surveillance audit n's day: the body's, else 12 or 24 months after issue. */
export function surveillanceDay(cert: Certification, n: 1 | 2): string | null {
  const typed = cert.surveillance.find((item) => item.n === n)?.due_on ?? null;
  if (typed) return typed;
  if (!cert.issued_on || !SURVEILLED(cert)) return null;
  return addMonths(cert.issued_on, PRACTICES.surveillance.amount * n);
}

/** Every day still to come or owed on a certification: the stage audits, the surveillance audits, the expiry. */
export function certDays(cert: Certification): CertDay[] {
  const standard = standardWords(cert);
  const days: CertDay[] = [];
  const before = (statuses: Certification["status"][]) => statuses.includes(cert.status);
  if (cert.stage1_on && before(["planning", "stage1"]))
    days.push({
      key: "stage1",
      title: `Stage 1 audit for ${standard}`,
      on: cert.stage1_on,
      ahead: AHEAD.stage,
      audit: true,
    });
  if (cert.stage2_on && before(["planning", "stage1", "stage2"]))
    days.push({
      key: "stage2",
      title: `Stage 2 audit for ${standard}`,
      on: cert.stage2_on,
      ahead: AHEAD.stage,
      audit: true,
    });
  if (cert.status === "certified") {
    for (const n of [1, 2] as const) {
      const held = cert.surveillance.find((item) => item.n === n)?.held_on ?? null;
      const on = surveillanceDay(cert, n);
      if (on && !held)
        days.push({
          key: n === 1 ? "s1" : "s2",
          title: `Surveillance audit ${n} for ${standard}`,
          on,
          ahead: AHEAD.surveillance,
          audit: true,
        });
    }
    const expiry = expiryOf(cert);
    if (expiry)
      days.push({
        key: "expiry",
        title: `${standard} certificate expires ${dayWords(expiry)}`,
        on: expiry,
        ahead: AHEAD.expiry,
        audit: false,
      });
  }
  return days.sort((a, b) => a.on.localeCompare(b.on));
}

/** The next audit's day, for the table: the earliest open audit. */
export const nextAuditOf = (cert: Certification): CertDay | null =>
  certDays(cert).find((day) => day.audit) ?? null;

export const certDayInDue = (day: CertDay, today: string): boolean =>
  inDue(day.on, today, day.ahead);

/** "ISO 27001: Stage 1 on 10 Feb 2027 with Walk Certification Body." */
export function certificationWords(cert: Certification): string {
  const standard = standardWords(cert);
  const body = cert.body ? ` with ${cert.body}` : "";
  switch (cert.status) {
    case "planning":
      return cert.stage1_on
        ? `${standard}: Stage 1 on ${dayWords(cert.stage1_on)}${body}.`
        : `${standard}: planning${body}.`;
    case "stage1":
      return cert.stage1_on
        ? `${standard}: Stage 1 on ${dayWords(cert.stage1_on)}${body}.`
        : `${standard}: at Stage 1${body}.`;
    case "stage2":
      return cert.stage2_on
        ? `${standard}: Stage 2 on ${dayWords(cert.stage2_on)}${body}.`
        : `${standard}: at Stage 2${body}.`;
    case "certified": {
      const expiry = expiryOf(cert);
      const by = cert.body ? ` by ${cert.body}` : "";
      return expiry
        ? `${standard}: certified${by} until ${dayWords(expiry)}.`
        : `${standard}: certified${by}.`;
    }
    case "lapsed":
      return `${standard}: lapsed.`;
    case "withdrawn":
      return `${standard}: withdrawn.`;
  }
}

// ------------------------------------------------------------------ insurance

/** "cyber insurance", "professional indemnity insurance", or the name he typed. */
export function coverInWords(policy: Pick<InsurancePolicy, "kind" | "name">): string {
  if (policy.kind === "other") return policy.name || "insurance";
  const label = INSURANCE_KINDS[policy.kind];
  return `${label.charAt(0).toLowerCase()}${label.slice(1)} insurance`;
}

/** The label of the cover for a table: "Cyber", or the name he typed. */
export const coverLabel = (policy: Pick<InsurancePolicy, "kind" | "name">): string =>
  policy.kind === "other" ? policy.name || INSURANCE_KINDS.other : INSURANCE_KINDS[policy.kind];

/** A policy not renewed whose cover ends, in Due from 30 days before. */
export const insuranceInDue = (policy: InsurancePolicy, today: string): boolean =>
  policy.ends_on !== null &&
  policy.renewed_by === null &&
  inDue(policy.ends_on, today, AHEAD.insurance);

/** Whether a policy's cover has ended with no renewal recorded. */
export const endedUnrenewed = (policy: InsurancePolicy, today: string): boolean =>
  policy.ends_on !== null && policy.ends_on < today && policy.renewed_by === null;

/** "Cyber cover to 31 Mar 2027 with Walk Insurance; no professional indemnity recorded." */
export function insuranceWords(policies: readonly InsurancePolicy[], today: string): string {
  if (policies.length === 0)
    return "No insurance recorded. Buyers ask for cyber and professional indemnity cover first.";
  const live = (kind: InsurancePolicy["kind"]) =>
    policies
      .filter((policy) => policy.kind === kind && policy.renewed_by === null)
      .sort((a, b) => (b.ends_on ?? "9999").localeCompare(a.ends_on ?? "9999"))[0] ?? null;
  const part = (kind: "cyber" | "professional_indemnity", lead: boolean) => {
    const label = kind === "cyber" ? "cyber" : "professional indemnity";
    const policy = live(kind);
    const head = lead ? `${label.charAt(0).toUpperCase()}${label.slice(1)}` : label;
    if (!policy) return `${lead ? "No" : "no"} ${label} recorded`;
    const insurer = policy.insurer ? ` with ${policy.insurer}` : "";
    if (!policy.ends_on) return `${head} cover${insurer}`;
    return policy.ends_on < today
      ? `${head} cover ended ${dayWords(policy.ends_on)}${insurer}`
      : `${head} cover to ${dayWords(policy.ends_on)}${insurer}`;
  };
  const others = policies.filter(
    (policy) =>
      policy.kind !== "cyber" &&
      policy.kind !== "professional_indemnity" &&
      policy.renewed_by === null,
  ).length;
  const tail = others > 0 ? `; ${others} other ${others === 1 ? "policy" : "policies"}` : "";
  return `${part("cyber", true)}; ${part("professional_indemnity", false)}${tail}.`;
}

// ------------------------------------------------------------------ management review

export const reviewMonths = (setup: { review_months: number | null }): number =>
  setup.review_months ?? PRACTICES.management_review.amount;

/** The latest review, and the next one's day. */
export function reviewNextOf(
  reviews: readonly ManagementReview[],
  months: number,
): { last: ManagementReview | null; next_on: string | null } {
  const last =
    [...reviews].sort(
      (a, b) => b.held_on.localeCompare(a.held_on) || b.created_at.localeCompare(a.created_at),
    )[0] ?? null;
  return { last, next_on: last ? addMonths(last.held_on, months) : null };
}

export const reviewInDue = (nextOn: string | null, today: string): boolean =>
  nextOn !== null && inDue(nextOn, today, AHEAD.review);

export const actionInDue = (action: ReviewAction, today: string): boolean =>
  action.due_on !== null && action.done_on === null && inDue(action.due_on, today, AHEAD.action);

/** "Last management review 20 Nov 2026; next due 20 Nov 2027." */
export function reviewWords(last: ManagementReview | null, nextOn: string | null): string {
  if (!last || !nextOn) return "No management review recorded.";
  return `Last management review ${dayWords(last.held_on)}; next due ${dayWords(nextOn)}.`;
}
