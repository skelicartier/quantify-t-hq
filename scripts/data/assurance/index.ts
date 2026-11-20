/**
 * Certification, insurance, management reviews, and Assurance › Summary
 * (ws-notes/security/spec.md §8): certifications (ISO 27001, SOC 2, something else) with their
 * stage audits, surveillance audits and expiry; insurance policies and their renewals;
 * management reviews with clause 9.3.2's inputs and their actions; and the Summary
 * (`GET /data/assurance`), which asks every module of this batch for its lines and passes the
 * Owner flag on as the portal set it.
 *
 * Due rows of kinds `certification`, `insurance` and `management_review` (none Owner-only);
 * the calendar's `agenda:assurance` (audits, insurance renewals, the next review); the
 * `assurance` service (`AssuranceLookup`: `usedFor`, Summary lines, evidence); the overview's
 * `assurance` block. Nothing here sends, files or pays anything. A record and a reminder, not
 * certification advice.
 */

import { writeFileSync } from "node:fs";

import { Refused } from "../../mail-merge/engine";
import type { DataCore, DueItem } from "../core";
import { clean, isDay } from "../guard";
import { checkCopy, copyGiven, fileChoices, fileLink, keepCopy } from "../meetings/copy";
import type { Staff } from "../protocol";
import { agendaService, type AgendaItem, type AgendaSource } from "../raise-contracts";
import {
  SECURITY_MODULES,
  SECURITY_SERVICES,
  standInSource,
  type AssuranceLookup,
  type EvidenceOption,
  type SecurityLookup,
  type SummaryLine,
} from "../security-contracts";
import { toCsv } from "../text";
import { dayWords } from "../../../src/lib/data/labels-company";
import {
  CERT_STATUSES,
  NO_CERTIFICATION,
  REVIEW_INPUTS,
  REVIEW_INPUT_KEYS,
  coverWords,
} from "../../../src/lib/data/labels-assurance";
import { spanOf } from "../../../src/lib/data/labels-controls";
import { minorWords } from "../../../src/lib/data/labels-duties";
import { AssuranceBook } from "./book";
import {
  actionInDue,
  certDayInDue,
  certDays,
  certificationWords,
  coverInWords,
  coverLabel,
  endedUnrenewed,
  expiryOf,
  insuranceInDue,
  insuranceWords,
  nextAuditOf,
  reviewInDue,
  reviewMonths,
  reviewNextOf,
  reviewWords,
  standardWords,
} from "./due";
import { REMIND, SAY } from "./limits";
import { summaryOf } from "./summary";
import type { Certification, InsurancePolicy, ManagementReview } from "./types";

const BOM = "﻿";
const BASE = "/data/assurance";
const CERT_PAGE = `${BASE}/certification`;
const INSURANCE_PAGE = `${BASE}/insurance`;
const REVIEWS_PAGE = `${BASE}/reviews`;
const FOLDER = {
  certification: ["Security", "Certification"],
  insurance: ["Security", "Insurance"],
  reviews: ["Security", "Management reviews"],
};

export const certHref = (id: string): string => `${CERT_PAGE}/${id}`;
export const insuranceHref = (id: string): string => `${INSURANCE_PAGE}#insurance-${id}`;
export const reviewHref = (id: string): string => `${REVIEWS_PAGE}/${id}`;

/** A stand-in carries this mark, so another unit's test route may replace it. */
const STAND_IN = Symbol.for("hq.security.stand-in");

/** The lines a test or a walk gives a stand-in, read as a module would answer them. */
function linesOf(raw: unknown): SummaryLine[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
    .map((item, index) => ({
      key: clean(item.key, 64) || `line-${index + 1}`,
      area:
        item.area === "systems" || item.area === "buyers" || item.area === "assurance"
          ? item.area
          : "systems",
      title: clean(item.title, 120) || "A line",
      words: clean(item.words, 400),
      attention: item.attention === true,
      href: typeof item.href === "string" && item.href.startsWith("/") ? item.href : "/data",
    }));
}

function optionsOf(raw: unknown): EvidenceOption[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
    .map((item, index) => ({
      ref: clean(item.ref, 120) || `stand-in:option:${index + 1}`,
      label: clean(item.label, 200) || "An option",
      href: typeof item.href === "string" && item.href.startsWith("/") ? item.href : "/data",
      current: item.current !== false,
      why: clean(item.why, 300),
    }));
}

export async function register(core: DataCore): Promise<void> {
  let pinnedDay: string | null = null;
  const today = (): string => pinnedDay ?? core.day();
  const book = new AssuranceBook(core, today);

  // ---------------------------------------------------------------- rows

  const certRow = (cert: Certification) => ({
    ...cert,
    standard_words: standardWords(cert),
    status_label: CERT_STATUSES[cert.status].label,
    expiry: expiryOf(cert),
    expiry_typed: cert.expires_on !== null,
    days: certDays(cert),
    next_audit: nextAuditOf(cert),
    words: certificationWords(cert),
    certificate_file: fileLink(core, cert.certificate_file_id),
    surveillance_files: cert.surveillance.map((item) => ({
      n: item.n,
      file: fileLink(core, item.file_id),
    })),
    href: certHref(cert.cert_id),
  });

  const insuranceRow = (policy: InsurancePolicy, on = today()) => {
    const from = book.insurance.find((item) => item.renewed_by === policy.insurance_id) ?? null;
    const next = policy.renewed_by
      ? (book.insurance.find((item) => item.insurance_id === policy.renewed_by) ?? null)
      : null;
    return {
      ...policy,
      cover_label: coverLabel(policy),
      cover_words: next
        ? `Renewed${next.starts_on ? ` from ${dayWords(next.starts_on)}` : ""}`
        : coverWords(policy.ends_on, on),
      amount_words:
        policy.cover_minor === null ? "" : minorWords(policy.cover_minor, policy.currency),
      premium_words:
        policy.premium_minor === null ? "" : minorWords(policy.premium_minor, policy.currency),
      ended_unrenewed: endedUnrenewed(policy, on),
      renewed_from: from?.insurance_id ?? null,
      certificate_file: fileLink(core, policy.certificate_file_id),
      href: insuranceHref(policy.insurance_id),
    };
  };

  const reviewRow = (review: ManagementReview, on = today()) => ({
    ...review,
    actions_open: review.actions.filter((action) => action.done_on === null).length,
    actions_late: review.actions.filter(
      (action) => action.done_on === null && action.due_on !== null && action.due_on < on,
    ).length,
    minutes_file: fileLink(core, review.minutes_file_id),
    href: reviewHref(review.review_id),
  });

  const months = () => reviewMonths(book.setup);
  const reviewNext = () => reviewNextOf(book.reviews, months());

  const certsSorted = () =>
    [...book.certifications].sort(
      (a, b) =>
        Number(a.status === "withdrawn" || a.status === "lapsed") -
          Number(b.status === "withdrawn" || b.status === "lapsed") ||
        b.created_at.localeCompare(a.created_at),
    );

  // ---------------------------------------------------------------- Due and the agenda

  type Mark = {
    key: string;
    kind: DueItem["kind"];
    title: string;
    sub: string;
    on: string;
    href: string;
  };

  const dueItems = (): DueItem[] => {
    const on = today();
    const items: Mark[] = [];
    for (const cert of book.certifications)
      for (const day of certDays(cert))
        if (certDayInDue(day, on))
          items.push({
            key: `certification:${cert.cert_id}:${day.key}`,
            kind: "certification",
            title: day.title,
            sub: cert.body || "Certification body not recorded",
            on: day.on,
            href: certHref(cert.cert_id),
          });
    for (const policy of book.insurance)
      if (insuranceInDue(policy, on))
        items.push({
          key: `insurance:${policy.insurance_id}`,
          kind: "insurance",
          title: `Renew the ${coverInWords(policy)} with ${policy.insurer}`,
          sub: `Cover to ${dayWords(policy.ends_on)}`,
          on: policy.ends_on!,
          href: insuranceHref(policy.insurance_id),
        });
    const next = reviewNext();
    if (next.last && reviewInDue(next.next_on, on))
      items.push({
        key: "management_review:next",
        kind: "management_review",
        title: "Hold the management review",
        sub: `Last review ${dayWords(next.last.held_on)}`,
        on: next.next_on!,
        href: REVIEWS_PAGE,
      });
    for (const review of book.reviews)
      for (const action of review.actions)
        if (actionInDue(action, on))
          items.push({
            key: `management_review:${action.action_id}`,
            kind: "management_review",
            title: action.what,
            sub: `From the review of ${dayWords(review.held_on)}${action.owner ? ` · ${action.owner}` : ""}`,
            on: action.due_on!,
            href: reviewHref(review.review_id),
          });
    return items.map((item) => ({
      key: item.key,
      kind: item.kind,
      title: item.title,
      sub: item.sub,
      due_on: item.on,
      href: item.href,
    }));
  };
  core.provideDue(dueItems);

  const agenda: AgendaSource = {
    agenda: () => {
      const items: AgendaItem[] = [];
      for (const cert of book.certifications)
        for (const day of certDays(cert))
          if (day.audit)
            items.push({
              key: `certification:${cert.cert_id}:${day.key}`,
              kind: "certification",
              title: day.title,
              plain: "Certification audit",
              sub: cert.body,
              on: day.on,
              remind_days: [...REMIND],
              href: certHref(cert.cert_id),
            });
      for (const policy of book.insurance)
        if (policy.ends_on && !policy.renewed_by)
          items.push({
            key: `insurance:${policy.insurance_id}`,
            kind: "insurance",
            title: `Renew the ${coverInWords(policy)} with ${policy.insurer}`,
            plain: "Insurance renewal",
            sub: `Cover to ${dayWords(policy.ends_on)}`,
            on: policy.ends_on,
            remind_days: [...REMIND],
            href: insuranceHref(policy.insurance_id),
          });
      const next = reviewNext();
      if (next.last && next.next_on)
        items.push({
          key: "management_review:next",
          kind: "management_review",
          title: "Hold the management review",
          plain: "Management review",
          sub: `Last review ${dayWords(next.last.held_on)}`,
          on: next.next_on,
          remind_days: [...REMIND],
          href: REVIEWS_PAGE,
        });
      return items.sort((a, b) => a.on.localeCompare(b.on) || a.title.localeCompare(b.title));
    },
  };
  core.provide(agendaService("assurance"), agenda);

  // ---------------------------------------------------------------- the service

  const ownLines = (on: string): SummaryLine[] => {
    const live = certsSorted().filter((cert) => cert.status !== "withdrawn");
    const certification: SummaryLine = {
      key: "certification",
      area: "assurance",
      title: "Certification",
      words: live.length
        ? live.map((cert) => certificationWords(cert)).join(" ")
        : NO_CERTIFICATION,
      attention: false,
      href: CERT_PAGE,
    };
    const insurance: SummaryLine = {
      key: "insurance",
      area: "assurance",
      title: "Insurance",
      words: insuranceWords(book.insurance, on),
      attention: book.insurance.some((policy) => endedUnrenewed(policy, on)),
      href: INSURANCE_PAGE,
    };
    const next = reviewNext();
    const review: SummaryLine = {
      key: "review",
      area: "assurance",
      title: "Management review",
      words: reviewWords(next.last, next.next_on),
      attention: next.next_on !== null && next.next_on < on,
      href: REVIEWS_PAGE,
    };
    return [certification, insurance, review];
  };

  const evidence = (on: string): EvidenceOption[] => {
    const options: EvidenceOption[] = [];
    for (const cert of book.certifications) {
      const expiry = expiryOf(cert);
      const current = cert.status === "certified" && (expiry === null || expiry >= on);
      const number = cert.certificate_number ? ` ${cert.certificate_number}` : "";
      options.push({
        ref: `assurance:certification:${cert.cert_id}`,
        label:
          cert.status === "certified"
            ? `${standardWords(cert)} certificate${number}${expiry ? `, to ${dayWords(expiry)}` : ""}`
            : `${standardWords(cert)}: ${CERT_STATUSES[cert.status].label.toLowerCase()}`,
        href: certHref(cert.cert_id),
        current,
        why: current
          ? ""
          : cert.status === "certified"
            ? `Expired on ${dayWords(expiry)}.`
            : "Not certified yet.",
      });
    }
    for (const policy of book.insurance) {
      if (policy.renewed_by) continue;
      const ended = endedUnrenewed(policy, on);
      options.push({
        ref: `assurance:insurance:${policy.insurance_id}`,
        label: `${coverLabel(policy)} insurance with ${policy.insurer}${policy.ends_on ? `, to ${dayWords(policy.ends_on)}` : ""}`,
        href: insuranceHref(policy.insurance_id),
        current: !ended,
        why: ended ? `Cover ended ${dayWords(policy.ends_on)}.` : "",
      });
    }
    const next = reviewNext();
    if (next.last) {
      const late = next.next_on !== null && next.next_on < on;
      options.push({
        ref: `assurance:review:${next.last.review_id}`,
        label: `Management review of ${dayWords(next.last.held_on)}`,
        href: reviewHref(next.last.review_id),
        current: !late,
        why: late ? `Older than ${spanOf(months(), "months")}.` : "",
      });
    }
    return options;
  };

  const service: AssuranceLookup = {
    usedFor: (fileId) => {
      const lines: { label: string; href: string }[] = [];
      for (const cert of book.certifications) {
        if (cert.certificate_file_id === fileId)
          lines.push({
            label: `The ${standardWords(cert)} certificate, in Certification`,
            href: certHref(cert.cert_id),
          });
        for (const audit of cert.surveillance)
          if (audit.file_id === fileId)
            lines.push({
              label: `Surveillance audit ${audit.n} for ${standardWords(cert)}, in Certification`,
              href: certHref(cert.cert_id),
            });
      }
      for (const policy of book.insurance)
        if (policy.certificate_file_id === fileId)
          lines.push({
            label: `The ${coverInWords(policy)} certificate from ${policy.insurer}, in Insurance`,
            href: insuranceHref(policy.insurance_id),
          });
      for (const review of book.reviews)
        if (review.minutes_file_id === fileId)
          lines.push({
            label: `Minutes of the management review of ${dayWords(review.held_on)}`,
            href: reviewHref(review.review_id),
          });
      return lines;
    },
    summary: (on) => ownLines(on),
    evidence: (on) => evidence(on),
  };
  core.provide(SECURITY_SERVICES.assurance, service);

  core.provideOverview("assurance", () => {
    const next = dueItems().sort(
      (a, b) => a.due_on.localeCompare(b.due_on) || a.title.localeCompare(b.title),
    )[0];
    return {
      certifications: book.certifications.length,
      insurance: book.insurance.filter((policy) => !policy.renewed_by).length,
      reviews: book.reviews.length,
      review_next: reviewNext().next_on,
      next: next ? { title: next.title, on: next.due_on } : null,
    };
  });

  // ---------------------------------------------------------------- copies in Files

  async function copyOf(
    body: Record<string, unknown>,
    place: { folder: string[]; title: string },
    by: Staff,
  ): Promise<string | null> {
    if (!copyGiven(body)) return null;
    checkCopy(core, body);
    const file = await keepCopy(core, body, { ...place, note: place.title }, by);
    return file.file_id;
  }

  const filesPart = () => ({ files: fileChoices(core), files_here: core.need("files") !== null });

  // ---------------------------------------------------------------- the Summary

  core.route("GET", BASE, (ctx) =>
    summaryOf(
      (name) => core.need(name),
      today(),
      ctx.query.get("owner") === "1",
      (line) => core.log(line),
    ),
  );

  core.route("POST", `${BASE}/setup`, (ctx) => {
    const by = ctx.staff();
    const setup = book.saveSetup(ctx.body, by);
    return { review_months: setup.review_months, months: months() };
  });

  // ---------------------------------------------------------------- certifications

  core.route("GET", `${BASE}/certifications`, () => ({
    certifications: certsSorted().map(certRow),
    ...filesPart(),
    today: today(),
  }));

  core.route("POST", `${BASE}/certifications`, async (ctx) => {
    const by = ctx.staff();
    book.checkCertification(ctx.body, null);
    const fileId = await copyOf(
      ctx.body,
      { folder: FOLDER.certification, title: "Certificate" },
      by,
    );
    return { certification: certRow(book.addCertification(ctx.body, fileId, by)) };
  });

  core.route("GET", `${BASE}/certifications/:id`, (ctx) => {
    const cert = book.certification(ctx.params[0]);
    return {
      certification: certRow(cert),
      events: book.eventsOf(cert.cert_id),
      ...filesPart(),
      today: today(),
    };
  });

  core.route("POST", `${BASE}/certifications/:id/update`, async (ctx) => {
    const by = ctx.staff();
    const cert = book.certification(ctx.params[0]);
    book.checkCertification(ctx.body, cert);
    const fileId = await copyOf(
      ctx.body,
      { folder: FOLDER.certification, title: `${standardWords(cert)} certificate` },
      by,
    );
    return {
      certification: certRow(book.updateCertification(cert, ctx.body, fileId ?? undefined, by)),
    };
  });

  core.route("POST", `${BASE}/certifications/:id/surveillance/:n`, async (ctx) => {
    const by = ctx.staff();
    const cert = book.certification(ctx.params[0]);
    const n = book.checkSurveillance(cert, ctx.params[1], ctx.body);
    const fileId = await copyOf(
      ctx.body,
      {
        folder: FOLDER.certification,
        title: `Surveillance audit ${n} report, ${standardWords(cert)}`,
      },
      by,
    );
    return { certification: certRow(book.surveillance(cert, n, ctx.body, fileId, by)) };
  });

  // ---------------------------------------------------------------- insurance

  core.route("GET", `${BASE}/insurance`, () => {
    const on = today();
    return {
      insurance: [...book.insurance]
        .sort(
          (a, b) =>
            Number(a.renewed_by !== null) - Number(b.renewed_by !== null) ||
            (a.ends_on ?? "9999").localeCompare(b.ends_on ?? "9999"),
        )
        .map((policy) => insuranceRow(policy, on)),
      ...filesPart(),
      today: on,
    };
  });

  core.route("POST", `${BASE}/insurance`, async (ctx) => {
    const by = ctx.staff();
    book.checkInsurance(ctx.body, null);
    const fileId = await copyOf(
      ctx.body,
      { folder: FOLDER.insurance, title: "Insurance certificate" },
      by,
    );
    return { insurance: insuranceRow(book.addInsurance(ctx.body, fileId, by)) };
  });

  core.route("POST", `${BASE}/insurance/:id/update`, async (ctx) => {
    const by = ctx.staff();
    const policy = book.policy(ctx.params[0]);
    book.checkInsurance(ctx.body, policy);
    const fileId = await copyOf(
      ctx.body,
      { folder: FOLDER.insurance, title: `${coverLabel(policy)} insurance certificate` },
      by,
    );
    return {
      insurance: insuranceRow(book.updateInsurance(policy, ctx.body, fileId ?? undefined, by)),
    };
  });

  core.route("POST", `${BASE}/insurance/:id/renew`, async (ctx) => {
    const by = ctx.staff();
    const policy = book.policy(ctx.params[0]);
    if (policy.renewed_by) throw new Refused(409, "invalid", SAY.renewed);
    book.checkInsurance(
      { kind: policy.kind, name: policy.name, insurer: policy.insurer, ...ctx.body },
      null,
    );
    const fileId = await copyOf(
      ctx.body,
      { folder: FOLDER.insurance, title: `${coverLabel(policy)} insurance certificate` },
      by,
    );
    return { insurance: insuranceRow(book.renew(policy, ctx.body, fileId, by)) };
  });

  // ---------------------------------------------------------------- management reviews

  core.route("GET", `${BASE}/reviews`, () => {
    const on = today();
    const next = reviewNext();
    return {
      reviews: [...book.reviews]
        .sort((a, b) => b.held_on.localeCompare(a.held_on))
        .map((review) => reviewRow(review, on)),
      next: {
        next_on: next.next_on,
        last_held: next.last?.held_on ?? null,
        months: months(),
        yours: book.setup.review_months !== null,
      },
      inputs: REVIEW_INPUT_KEYS.map((key) => ({ key, label: REVIEW_INPUTS[key] })),
      ...filesPart(),
      today: on,
    };
  });

  core.route("POST", `${BASE}/reviews`, async (ctx) => {
    const by = ctx.staff();
    book.checkReview(ctx.body, null);
    const held = clean(ctx.body.held_on, 10);
    const fileId = await copyOf(
      ctx.body,
      { folder: FOLDER.reviews, title: `Management review minutes, ${dayWords(held) || held}` },
      by,
    );
    return { review: reviewRow(book.addReview(ctx.body, fileId, by)) };
  });

  core.route("POST", `${BASE}/reviews/actions/:actionId/done`, (ctx) => {
    const by = ctx.staff();
    return { review: reviewRow(book.actionDone(ctx.params[0], ctx.body, by)) };
  });

  core.route("GET", `${BASE}/reviews/:id`, (ctx) => {
    const review = book.review(ctx.params[0]);
    return {
      review: reviewRow(review),
      events: book.eventsOf(review.review_id),
      inputs: REVIEW_INPUT_KEYS.map((key) => ({ key, label: REVIEW_INPUTS[key] })),
      ...filesPart(),
      today: today(),
    };
  });

  core.route("POST", `${BASE}/reviews/:id/update`, async (ctx) => {
    const by = ctx.staff();
    const review = book.review(ctx.params[0]);
    book.checkReview(ctx.body, review);
    const fileId = await copyOf(
      ctx.body,
      { folder: FOLDER.reviews, title: `Management review minutes, ${dayWords(review.held_on)}` },
      by,
    );
    return { review: reviewRow(book.updateReview(review, ctx.body, fileId ?? undefined, by)) };
  });

  core.route("POST", `${BASE}/reviews/:id/actions`, (ctx) => {
    const by = ctx.staff();
    return { review: reviewRow(book.addAction(book.review(ctx.params[0]), ctx.body, by)) };
  });

  // ---------------------------------------------------------------- the registers as CSVs

  const csv = async (
    handle: { path: string; setProgress(done: number, total: number): void },
    by: unknown,
    kind: string,
    header: string[],
    rows: (string | number)[][],
    name: string,
  ) => {
    handle.setProgress(0, rows.length);
    await core.yield();
    writeFileSync(handle.path, BOM + toCsv(header, rows), { mode: 0o600 });
    handle.setProgress(rows.length, rows.length);
    core.store.appendLine("assurance/exports.jsonl", {
      at: core.now(),
      by,
      kind,
      rows: rows.length,
    });
    return { name: `${name} ${today()}.csv`, type: "text/csv; charset=utf-8" };
  };

  core.builds.provide("certifications_csv", (handle, input) =>
    csv(
      handle,
      input.by,
      "certifications",
      [
        "Standard",
        "Status",
        "Body",
        "Accredited by",
        "Stage 1",
        "Stage 2",
        "Certificate",
        "Issued",
        "Expires",
        "Next audit",
      ],
      certsSorted().map((cert) => [
        standardWords(cert),
        CERT_STATUSES[cert.status].label,
        cert.body,
        cert.accredited_by,
        cert.stage1_on ?? "",
        cert.stage2_on ?? "",
        cert.certificate_number,
        cert.issued_on ?? "",
        expiryOf(cert) ?? "",
        nextAuditOf(cert)?.on ?? "",
      ]),
      "Certification",
    ),
  );

  core.builds.provide("insurance_csv", (handle, input) =>
    csv(
      handle,
      input.by,
      "insurance",
      [
        "Cover",
        "Insurer",
        "Policy number",
        "Amount",
        "Currency",
        "Premium",
        "From",
        "To",
        "Broker",
        "Renewed",
      ],
      book.insurance.map((policy) => [
        coverLabel(policy),
        policy.insurer,
        policy.policy_number,
        policy.cover_minor === null ? "" : (policy.cover_minor / 100).toFixed(2),
        policy.currency,
        policy.premium_minor === null ? "" : (policy.premium_minor / 100).toFixed(2),
        policy.starts_on ?? "",
        policy.ends_on ?? "",
        policy.broker,
        policy.renewed_by ? "yes" : "no",
      ]),
      "Insurance",
    ),
  );

  core.builds.provide("reviews_csv", (handle, input) =>
    csv(
      handle,
      input.by,
      "reviews",
      ["Held", "Attendees", "Decisions", "Action", "Owner", "Due", "Done"],
      [...book.reviews]
        .sort((a, b) => a.held_on.localeCompare(b.held_on))
        .flatMap((review) =>
          (review.actions.length ? review.actions : [null]).map((action) => [
            review.held_on,
            review.attendees,
            review.decisions,
            action?.what ?? "",
            action?.owner ?? "",
            action?.due_on ?? "",
            action?.done_on ?? "",
          ]),
        ),
      "Management reviews",
    ),
  );

  // ---------------------------------------------------------------- test routes

  if (core.testRoutes) {
    const fakes = new Map<string, SecurityLookup>();

    /**
     * Installs `standInSource(body.lines, body.options)` under `body.name`, one of the nine,
     * only while no real module answers there; `body.owner_lines` are added only when the
     * Summary is asked as the Owner, so a test can see the flag passed on.
     */
    core.route("POST", "/data/_test/assurance/source", (ctx) => {
      ctx.staff();
      const name = clean(ctx.body.name, 40);
      if (!(SECURITY_MODULES as readonly string[]).includes(name))
        throw new Refused(400, "invalid", "That is not one of the security batch's modules.");
      const current = core.need<SecurityLookup & { [STAND_IN]?: true }>(name);
      const mine = fakes.get(name);
      if (ctx.body.on === false) {
        if (mine && current === mine) core.provide(name, null);
        fakes.delete(name);
        return { installed: false };
      }
      if (current && current[STAND_IN] !== true) return { installed: false, real: true };
      const base = standInSource(linesOf(ctx.body.lines), optionsOf(ctx.body.options));
      const ownerLines = linesOf(ctx.body.owner_lines);
      const throws = ctx.body.throws === true;
      const fake = Object.assign(
        {
          ...base,
          summary: (on: string, owner: boolean) => {
            if (throws) throw new Error("a stand-in that fails");
            return [...base.summary(on, owner), ...(owner ? ownerLines : [])];
          },
        },
        { [STAND_IN]: true as const },
      );
      fakes.set(name, fake);
      core.provide(name, fake);
      return { installed: true };
    });

    core.route("POST", "/data/_test/assurance/today", (ctx) => {
      ctx.staff();
      const day = ctx.body.day;
      if (day === null || day === undefined || day === "") pinnedDay = null;
      else if (isDay(day)) pinnedDay = day;
      else throw new Refused(400, "invalid", SAY.notADay);
      return { today: today(), pinned: pinnedDay !== null };
    });

    /** The walk needs no stand-in here: the Summary reads what is loaded. Safe twice. */
    core.route("POST", "/data/_test/assurance/seed", (ctx) => {
      ctx.staff();
      return {
        absent: summaryOf(
          (name) => core.need(name),
          today(),
          false,
          () => undefined,
        ).absent,
      };
    });

    core.route("GET", "/data/_test/assurance/agenda", () => ({
      items: core.need<AgendaSource>(agendaService("assurance"))?.agenda(today()) ?? [],
      today: today(),
    }));

    core.route("GET", "/data/_test/assurance/lookup", (ctx) => {
      const on = today();
      const lookup = core.need<AssuranceLookup>(SECURITY_SERVICES.assurance);
      return {
        summary: lookup?.summary(on, ctx.query.get("owner") === "1") ?? [],
        evidence: lookup?.evidence(on) ?? [],
        used_for: lookup?.usedFor(clean(ctx.query.get("file_id"), 64)) ?? [],
        today: on,
      };
    });
  }
}
