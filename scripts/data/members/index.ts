/**
 * The register of members (MGT-1; ws-notes/company/spec.md §7): classes of shares, members
 * with folios, entries for subscriptions, allotments, transfers and conversions (reversed,
 * never deleted), share certificates (cancelled, never deleted) with their copies in Files,
 * the holdings added up from the register (not a cap-table model) and the register as a CSV.
 *
 * The `members` service is how the close enters an allotment (`allot`, once per closing
 * key) and takes it back on a refund (`reverse`). Members are searchable by name and email,
 * never by their identity number. This module stands on its own: if the founder decides HQ
 * should not hold the register, its folder is left out and the close ticks the step by hand.
 */

import { writeFileSync } from "node:fs";

import { Refused } from "../../mail-merge/engine";
import {
  COMPANY_SERVICES,
  ruleOf,
  type KeyDatesService,
  type MeetingsLookup,
  type MembersRegister,
  type RuleKey,
} from "../company-contracts";
import type { DataCore } from "../core";
import { daysBetween } from "../days";
import { clean } from "../guard";
import { searchService, type DataSearchHit, type SearchSource } from "../raise-contracts";
import { toCsv } from "../text";
import { matchesTerms } from "../../../src/lib/merge/find";
import {
  ENTRY_KINDS,
  HOLDER_KINDS,
  RESIDENCIES,
  holdingWords,
  ofWords,
} from "../../../src/lib/data/labels-registers";
import {
  checkCopy,
  copyGiven,
  fileChoices,
  fileLink,
  folderNamed,
  keepCopy,
} from "../meetings/copy";
import { MembersBook, isLive, type Env } from "./book";
import type { Member, RegisterEntry } from "./types";

const BOM = "﻿";
const CERTIFICATES_FOLDER = [folderNamed("cap_table", "04 Cap table and share issues")];
const VIEWS = new Set(["register", "certificates", "holdings"]);

export const MEMBERS_HREF = "/data/company/members";

export async function register(core: DataCore): Promise<void> {
  const book = new MembersBook(core);

  const keyDates = () => core.need<KeyDatesService>(COMPANY_SERVICES.keyDates);
  const meetings = () => core.need<MeetingsLookup>(COMPANY_SERVICES.meetings);

  const env = (): Env => ({
    today: core.day(),
    amount: (key: RuleKey) => {
      try {
        const service = keyDates();
        if (service) return service.rule(key).amount;
      } catch {
        // the rule's own amount below
      }
      return ruleOf(key).amount;
    },
    resolution: (id) => {
      const lookup = meetings();
      if (!lookup) return undefined;
      const found = lookup.resolution(id);
      return found ? { title: found.title, meeting_title: found.meeting_title } : null;
    },
  });

  const className = (id: string) =>
    book.register.classes.find((item) => item.class_id === id)?.name ?? "";

  /** "9,000 of 10,000 equity shares · 90.0 per cent" for each class the member holds. */
  const holdsOf = (member: Member) =>
    book.register.classes
      .map((shareClass) => {
        const shares = book.held(member.member_id, shareClass.class_id);
        const of = book.issued(shareClass.class_id);
        return {
          class_id: shareClass.class_id,
          class_name: shareClass.name,
          shares,
          of,
          words: holdingWords(shares, of, shareClass.kind),
        };
      })
      .filter((item) => item.shares > 0);

  const entryRow = (entry: RegisterEntry) => {
    const member = book.member(entry.member_id);
    const resolution = entry.resolution.resolution_id
      ? (meetings()?.resolution(entry.resolution.resolution_id) ?? null)
      : null;
    return {
      ...entry,
      folio: member.folio,
      member_name: member.name,
      investor_id: member.investor_id,
      class_name: className(entry.class_id),
      certificate: book.certificateFor(entry.entry_id)?.number ?? null,
      resolution_title: resolution ? `${resolution.title}, ${resolution.meeting_title}` : "",
      resolution_href: resolution?.href ?? null,
      late_days: Math.max(0, daysBetween(entry.on, entry.entered_on)),
    };
  };

  // ---------------------------------------------------------------- search

  const search: SearchSource = {
    search: ({ terms, kind, limit }) => {
      if (terms.length === 0 || (kind !== null && kind !== "member")) return [];
      const found = book.register.members
        .filter((member) => matchesTerms([member.name, member.email], terms))
        .sort((a, b) => a.folio.localeCompare(b.folio));
      if (found.length === 0) return [];
      const hits: DataSearchHit[] = found.slice(0, Math.max(0, limit)).map((member) => {
        const first = holdsOf(member)[0];
        return {
          kind: "member",
          id: member.member_id,
          title: member.name,
          subtitle: `Folio ${member.folio} · ${first ? first.words : "No shares held"}`,
          snippet: "",
          href: `${MEMBERS_HREF}#member-${member.member_id}`,
        };
      });
      return [{ kind: "member", count: found.length, hits }];
    },
  };
  core.provide(searchService("members"), search);

  // ---------------------------------------------------------------- the service

  const service: MembersRegister = {
    classes: () =>
      book.register.classes.map(({ class_id, name, kind }) => ({ class_id, name, kind })),
    allot: (input) => {
      const existing = book.register.entries.find(
        (entry) => entry.closing_key === input.closing_key,
      );
      if (existing) return book.link(existing);
      const closingKey = clean(input.closing_key, 120);
      if (!closingKey) throw new Refused(400, "invalid", "The closing has no key.");
      const now = env();
      const holder = input.holder;
      const member =
        (holder.investor_id
          ? book.register.members.find((item) => item.investor_id === holder.investor_id)
          : undefined) ??
        book.register.members.find(
          (item) =>
            item.name.toLowerCase() === holder.name.trim().toLowerCase() &&
            item.kind === holder.kind,
        ) ??
        book.addMember(
          {
            name: holder.name,
            kind: holder.kind,
            email: holder.email,
            address: holder.address,
            residency: holder.residency,
            became_member_on: input.allotted_on,
          },
          input.by,
          now.today,
          holder.investor_id,
        );
      const { entry } = book.recordEntry(
        {
          member_id: member.member_id,
          class_id: input.class_id,
          kind: "allotment",
          shares: input.shares,
          price_per_share: input.price_per_share,
          on: input.allotted_on,
          entered_on: input.entered_on,
          resolution_words: "",
          note: "From the closing checklist",
        },
        input.by,
        now,
        closingKey,
      );
      return book.link(entry);
    },
    forClosing: (closingKey) => {
      const entry = book.register.entries.find((item) => item.closing_key === closingKey);
      return entry ? book.link(entry) : null;
    },
    reverse: (closingKey, why, by) => {
      const entry = book.register.entries.find((item) => item.closing_key === closingKey);
      if (!entry) return null;
      if (isLive(entry)) book.reverseEntry(entry, { why: why || "Refunded" }, by, core.day());
      return book.link(entry);
    },
    usedFor: (fileId) =>
      book.register.certificates
        .filter((certificate) => certificate.file_id === fileId)
        .map((certificate) => ({
          label: `Share certificate ${certificate.number}, in the register of members`,
          href: `${MEMBERS_HREF}?view=certificates#certificate-${certificate.certificate_id}`,
        })),
  };
  core.provide(COMPANY_SERVICES.members, service);

  // ---------------------------------------------------------------- routes

  core.route("GET", "/data/members", (ctx) => {
    const asked = clean(ctx.query.get("view"), 20);
    const lookup = meetings();
    return {
      view: VIEWS.has(asked) ? asked : "register",
      classes: book.register.classes,
      members: [...book.register.members]
        .sort((a, b) => a.folio.localeCompare(b.folio))
        .map((member) => ({ ...member, holds: holdsOf(member) })),
      entries: [...book.register.entries]
        .sort(
          (a, b) =>
            a.on.localeCompare(b.on) ||
            book.member(a.member_id).folio.localeCompare(book.member(b.member_id).folio) ||
            a.created_at.localeCompare(b.created_at),
        )
        .map(entryRow),
      certificates: [...book.register.certificates]
        .sort((a, b) => a.issued_on.localeCompare(b.issued_on) || a.number.localeCompare(b.number))
        .map((certificate) => {
          const member = book.member(certificate.member_id);
          return {
            ...certificate,
            folio: member.folio,
            member_name: member.name,
            class_name: className(certificate.class_id),
            file: fileLink(core, certificate.file_id),
          };
        }),
      holdings: book.holdings().map((row) => ({ ...row, words: ofWords(row.shares, row.of) })),
      totals: book.register.classes.map((shareClass) => ({
        class_id: shareClass.class_id,
        class_name: shareClass.name,
        issued: book.issued(shareClass.class_id),
      })),
      resolutions: lookup
        ? lookup.passed("board").map((view) => ({
            resolution_id: view.resolution_id,
            title: view.title,
            meeting_title: view.meeting_title,
          }))
        : null,
      files: fileChoices(core),
      files_here: core.need("files") !== null,
      today: core.day(),
    };
  });

  core.route("POST", "/data/members/classes", (ctx) => {
    const by = ctx.staff();
    return { class: book.addClass(ctx.body, by) };
  });

  core.route("POST", "/data/members/entries", (ctx) => {
    const by = ctx.staff();
    const { entry, warnings } = book.recordEntry(ctx.body, by, env());
    return { entry: entryRow(entry), warnings };
  });

  core.route("POST", "/data/members/entries/:id/reverse", (ctx) => {
    const by = ctx.staff();
    const entry = book.reverseEntry(book.entry(ctx.params[0]), ctx.body, by, core.day());
    return { entry: entryRow(entry), warnings: [] };
  });

  core.route("POST", "/data/members/certificates", async (ctx) => {
    const by = ctx.staff();
    const now = env();
    const fields = book.checkCertificate(ctx.body, now);
    let fileId: string | null = null;
    if (copyGiven(ctx.body)) {
      checkCopy(core, ctx.body);
      const member = book.member(fields.member_id);
      fileId = (
        await keepCopy(
          core,
          ctx.body,
          {
            folder: CERTIFICATES_FOLDER,
            title: `Share certificate ${fields.number} – ${member.name}`,
            note: "A share certificate, in the register of members",
          },
          by,
        )
      ).file_id;
    }
    const certificate = book.issueCertificate(fields, fileId, by);
    return { certificate, warnings: book.certificateWarnings(certificate, now) };
  });

  core.route("POST", "/data/members/certificates/:id/cancel", (ctx) => {
    const by = ctx.staff();
    const certificate = book.cancelCertificate(
      book.certificate(ctx.params[0]),
      ctx.body,
      by,
      core.day(),
    );
    return { certificate, warnings: [] };
  });

  core.route("POST", "/data/members", (ctx) => {
    const by = ctx.staff();
    return { member: book.addMember(ctx.body, by, core.day()) };
  });

  core.route("POST", "/data/members/:id/update", (ctx) => {
    const by = ctx.staff();
    return { member: book.updateMember(book.member(ctx.params[0]), ctx.body, by, core.day()) };
  });

  // ---------------------------------------------------------------- the register as a CSV

  core.builds.provide("members_csv", async (handle, input) => {
    const today = core.day();
    const members = [...book.register.members].sort((a, b) => a.folio.localeCompare(b.folio));
    handle.setProgress(0, members.length);
    await core.yield();
    const rows: (string | number)[][] = [];
    for (const member of members) {
      const lead = [
        member.folio,
        member.name,
        HOLDER_KINDS[member.kind],
        member.address,
        member.email,
        member.id_number,
        RESIDENCIES[member.residency],
        member.nationality,
        member.became_member_on,
        member.ceased_on ?? "",
      ];
      const entries = book.register.entries
        .filter((entry) => entry.member_id === member.member_id)
        .sort((a, b) => a.on.localeCompare(b.on) || a.created_at.localeCompare(b.created_at));
      if (entries.length === 0) rows.push([...lead, ...Array<string>(13).fill("")]);
      for (const entry of entries) {
        const resolution = entry.resolution.resolution_id
          ? (meetings()?.resolution(entry.resolution.resolution_id) ?? null)
          : null;
        rows.push([
          ...lead,
          className(entry.class_id),
          ENTRY_KINDS[entry.kind],
          entry.shares,
          entry.distinctive?.from ?? "",
          entry.distinctive?.to ?? "",
          entry.price_per_share ?? "",
          entry.paid_up_per_share ?? "",
          entry.on,
          entry.entered_on,
          [
            resolution ? `${resolution.title}, ${resolution.meeting_title}` : "",
            entry.resolution.words,
          ]
            .filter(Boolean)
            .join(" · "),
          book.certificateFor(entry.entry_id)?.number ?? "",
          entry.reversed?.on ?? "",
          entry.reversed?.why ?? "",
        ]);
      }
    }
    const text =
      BOM +
      toCsv(
        [
          "folio",
          "name",
          "kind",
          "address",
          "email",
          "id_number",
          "residency",
          "nationality",
          "became_member_on",
          "ceased_on",
          "class",
          "entry",
          "shares",
          "distinctive_from",
          "distinctive_to",
          "price_per_share",
          "paid_up_per_share",
          "on",
          "entered_on",
          "resolution",
          "certificate",
          "reversed_on",
          "reversed_why",
        ],
        rows,
      );
    writeFileSync(handle.path, text, { mode: 0o600 });
    handle.setProgress(members.length, members.length);
    core.store.appendLine("members/exports.jsonl", {
      at: core.now(),
      by: input.by,
      kind: "members",
      rows: rows.length,
    });
    return { name: `Register of members ${today}.csv`, type: "text/csv; charset=utf-8" };
  });

  // ---------------------------------------------------------------- test routes

  if (core.testRoutes) {
    // The service as the closing module calls it, reached through the socket by the tests.
    core.route("POST", "/data/_test/members/allot", (ctx) => {
      const by = ctx.staff();
      const body = ctx.body as Parameters<MembersRegister["allot"]>[0];
      return { link: service.allot({ ...body, by }) };
    });
    core.route("POST", "/data/_test/members/reverse", (ctx) => {
      const by = ctx.staff();
      return {
        link: service.reverse(clean(ctx.body.closing_key, 120), clean(ctx.body.why, 300), by),
      };
    });
  }
}
