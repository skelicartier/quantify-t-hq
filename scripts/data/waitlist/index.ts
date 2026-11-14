/**
 * The waitlist: firms that said yes, as a pipeline (Joined, Call booked, Call held, Pilot,
 * Customer, or Dropped), each with its proof, its next step and its people. It provides
 * the `waitlist` service the replies module records a yes through (addendum2), the
 * overview's stage counts, Due rows for next steps, and "Used for" lines for proof files.
 *
 * A firm's other unsent addresses are held back only when the founder presses, after a
 * preview: Mail merge's own stop list, plus a record of exactly what that call added.
 */

import { writeFileSync } from "node:fs";

import { Refused } from "../../mail-merge/engine";
import type { Answer, DataCore, DueItem } from "../core";
import { localDay } from "../days";
import { LIMITS, clean, cleanText, isDay, isUuid, normaliseEmail, wholeNumber } from "../guard";
import type { Staff } from "../protocol";
import { registerWaitlistAgenda } from "./agenda";
import { findTerms, matchesTerms } from "../../../src/lib/merge/find";
import {
  COLLEAGUE_ROLES,
  DEFAULT_FOLDERS,
  DROP_REASONS,
  NAMING,
  WAITLIST_STAGES,
  WAITLIST_STAGE_ORDER,
  type ColleagueRole,
  type WaitlistStage,
} from "../../../src/lib/data/labels";
import type {
  FileRow,
  FilesService,
  LeadsService,
  Reply,
  WaitlistLink,
  WaitlistService,
} from "../leads/contracts";
import type { LeadsInternal } from "../leads/index";
import { domainOf, type LeadRow } from "../leads/types";
import {
  Book,
  describe,
  isFreeMail,
  type Person,
  type Proof,
  type WaitlistEntry,
  type WaitlistEvent,
} from "./entries";
import { internalCsv, investorCsv, investorRow, type ExportContext } from "./exports";
import { HOLD_REASON, Holds, holdBack, preview, release, type HoldContext } from "./holds";
import { readOldFile } from "./import";
import { RAISE_SERVICES, type WaitlistFeed } from "../raise-contracts";
import { applyMove, everReached, nextStepWords, nowAt, readStageMove } from "./stages";

const PAGE = 100;
const ENTRY_ID = "([0-9a-f-]{36})";
const PROOF_FOLDER = [
  DEFAULT_FOLDERS.find((folder) => folder.key === "leads")?.name ?? "11 Leads, lists and outreach",
  "Waitlist proof",
];
/** A saved copy comes in one JSON request: base64 grows it by a third, under the service's 6 MB. */
const PROOF_MAX_BYTES = 3 * 1024 * 1024;
const FIRST_STEP = "Reply and offer call times";
const NOT_SET_UP = "All leads is not set up here, so the waitlist has no people to show.";

/** What the walk and the tests reach for besides the addendum's service. */
export type WaitlistInternal = WaitlistService & { book: Book; holds: Holds };

const ROLE_KEYS = Object.keys(COLLEAGUE_ROLES) as ColleagueRole[];
const isRole = (value: unknown): value is ColleagueRole =>
  typeof value === "string" && (ROLE_KEYS as string[]).includes(value);

export function register(core: DataCore): void {
  const book = new Book(core.store);
  const holds = new Holds(core.store);
  const leadsOrNull = () => core.need<LeadsService>("leads");
  const leads = (): LeadsService => {
    const found = leadsOrNull();
    if (!found) throw new Refused(409, "leads_missing", NOT_SET_UP);
    return found;
  };
  const files = () => core.need<FilesService>("files");
  /** Statuses are cached per index version; a hold changes what a stop reads as. */
  const refresh = () => (leadsOrNull() as Partial<LeadsInternal> | null)?.module?.index.bump();
  const holdContext = (): HoldContext => ({ core, book, holds, leads: leads(), refresh });

  // ---------------------------------------------------------------- reading

  const entryOr404 = (id: string | undefined): WaitlistEntry => {
    const entry = id ? book.byId.get(id) : undefined;
    if (!entry) throw new Refused(404, "not_found", "That firm is not on the waitlist.");
    return entry;
  };

  const linkOf = (entry: WaitlistEntry | undefined | null): WaitlistLink | null =>
    entry ? { entry_id: entry.entry_id, firm: entry.firm, stage: entry.stage } : null;

  const atFirm = (entry: WaitlistEntry): LeadRow[] => {
    const service = leadsOrNull();
    if (!service) return [];
    if (isFreeMail(entry))
      return entry.people
        .map((person) => service.byEmail(person.email))
        .filter((row): row is LeadRow => row !== null);
    return service.atFirm(entry.firm_key);
  };

  const exportContext = (): ExportContext => ({
    lead: (email) => leadsOrNull()?.byEmail(email) ?? null,
    atFirm,
  });

  /** One row of the list: the firm, its contact, where it stands, its colleagues in two counts. */
  const rowOf = (entry: WaitlistEntry) => {
    const contact = leadsOrNull()?.byEmail(entry.contact_email) ?? null;
    const people = atFirm(entry);
    return {
      entry_id: entry.entry_id,
      firm: entry.firm,
      domain: entry.domain,
      free_mail: isFreeMail(entry),
      stage: entry.stage,
      stage_since: entry.stage_since,
      next_step: entry.next_step,
      next_step_on: entry.next_step_on,
      joined_on: entry.joined_on,
      how_joined: entry.how_joined,
      naming: entry.naming,
      contact: {
        email: entry.contact_email,
        name: contact?.name ?? "",
        title: contact?.title ?? "",
        lead_id: contact?.lead_id ?? null,
      },
      colleagues: {
        on_file: people.length,
        not_written: people.filter((person) => person.times_written === 0).length,
      },
    };
  };

  const counts = (entries: readonly WaitlistEntry[]): Record<WaitlistStage | "all", number> => {
    const out = Object.fromEntries([
      ["all", entries.length],
      ...WAITLIST_STAGE_ORDER.map((stage) => [stage, 0]),
    ]) as Record<WaitlistStage | "all", number>;
    for (const entry of entries) out[entry.stage] += 1;
    return out;
  };

  const ordered = (): WaitlistEntry[] =>
    [...book.entries].sort(
      (a, b) => b.joined_on.localeCompare(a.joined_on) || a.firm.localeCompare(b.firm),
    );

  // ---------------------------------------------------------------- making a firm

  const createEntry = (input: {
    email: string;
    lead: LeadRow;
    firmKey: string;
    firm: string;
    joined_on: string;
    how_joined: string;
    proof: Proof;
    by: Staff;
    via: string;
  }): WaitlistEntry => {
    const at = core.now();
    const today = core.day();
    const free = input.firmKey.startsWith("mail:");
    const entry: WaitlistEntry = {
      entry_id: book.newId(),
      firm_key: input.firmKey,
      firm:
        input.firm ||
        input.lead.company ||
        (free ? input.lead.name || input.email : input.lead.domain || domainOf(input.email)),
      domain: free ? domainOf(input.email) : input.firmKey,
      firm_type: input.lead.firm_type,
      city: input.lead.city,
      country: input.lead.country,
      contact_email: input.email,
      joined_on: input.joined_on,
      how_joined: input.how_joined,
      proof: input.proof,
      stage: "joined",
      stage_since: input.joined_on,
      next_step: FIRST_STEP,
      next_step_on: today,
      call_at: null,
      dropped: null,
      pilot: null,
      owner: "",
      naming: "described",
      described_as: describe(input.lead.title, input.lead.firm_type, input.lead.city),
      people: [{ email: input.email, role: "not_set", added: "reply" }],
      created_at: at,
      updated_at: at,
    };
    book.add(entry);
    book.log({
      entry_id: entry.entry_id,
      kind: "stage",
      at,
      by: input.by,
      to: "joined",
      text: input.via,
    });
    book.log({
      entry_id: entry.entry_id,
      kind: "next_step",
      at,
      by: input.by,
      text: nextStepWords(entry.next_step, entry.next_step_on),
    });
    return entry;
  };

  const unsentCount = (entry: WaitlistEntry): number => {
    const service = leadsOrNull();
    return service ? preview(entry, service).candidates.length : 0;
  };

  const joinFromReply: WaitlistService["joinFromReply"] = ({ reply, lead, firmKey, by }) => {
    const existing = book.byFirm.get(firmKey);
    const name = lead.name || lead.email;
    if (existing) {
      const at = core.now();
      const person = book.person(existing, reply.email);
      if (person) person.added = "reply";
      else existing.people.push({ email: reply.email, role: "not_set", added: "reply" });
      existing.updated_at = at;
      book.save();
      book.log({
        entry_id: existing.entry_id,
        kind: "person",
        at,
        by,
        text: `${name} also said yes`,
      });
      return {
        entry_id: existing.entry_id,
        created: false,
        firm: existing.firm,
        unsent: unsentCount(existing),
        href: `/data/waitlist/${existing.entry_id}`,
      };
    }
    const entry = createEntry({
      email: reply.email,
      lead,
      firmKey,
      firm: "",
      joined_on: localDay(reply.received_at),
      how_joined: reply.mailing ? `Replied yes to “${reply.mailing}”` : "Replied yes by email",
      proof: proofOf(reply, by),
      by,
      via: "Said yes in a reply",
    });
    return {
      entry_id: entry.entry_id,
      created: true,
      firm: entry.firm,
      unsent: unsentCount(entry),
      href: `/data/waitlist/${entry.entry_id}`,
    };
  };

  function proofOf(reply: Reply, by: Staff): Proof {
    return {
      reply_id: reply.reply_id,
      quote: reply.words,
      from: reply.email,
      subject: reply.subject,
      received_at: reply.received_at,
      file_id: null,
      recorded_by: by.name,
    };
  }

  // ---------------------------------------------------------------- the service

  const service: WaitlistInternal = {
    book,
    holds,
    joinFromReply,
    forEmail: (email) => {
      const address = normaliseEmail(email) || email;
      const person = book.byPerson.get(address);
      if (person) return linkOf(person);
      const hold = holds.holding(address);
      return hold ? linkOf(book.byId.get(hold.entry_id)) : null;
    },
    forFirm: (firmKey) => linkOf(book.byFirm.get(firmKey)),
    stageCounts: () => {
      const all = counts(book.entries);
      return Object.fromEntries(WAITLIST_STAGE_ORDER.map((stage) => [stage, all[stage]])) as Record<
        WaitlistStage,
        number
      >;
    },
    usedFor: (fileId) =>
      book.entries
        .filter((entry) => entry.proof.file_id === fileId)
        .map((entry) => ({
          label: `Proof of ${entry.firm}'s yes, on the waitlist`,
          href: `/data/waitlist/${entry.entry_id}`,
        })),
  };
  core.provide("waitlist", service);

  // The numbers (raise spec §8): the firms and their stage moves, read-only.
  const feed: WaitlistFeed = {
    entries: () =>
      book.entries.map((entry) => ({
        entry_id: entry.entry_id,
        firm: entry.firm,
        domain: entry.domain,
        firm_type: entry.firm_type,
        free_mail: isFreeMail(entry),
        joined_on: entry.joined_on,
        stage: entry.stage,
      })),
    moves: () =>
      book.events
        .filter((event) => event.kind === "stage" && event.to !== undefined)
        .map((event) => ({ entry_id: event.entry_id, to: event.to ?? "", at: event.at })),
  };
  core.provide(RAISE_SERVICES.waitlistFeed, feed);

  // A firm hold reads "Held back: firm already joined" on the lead, though it is a stop.
  leadsOrNull()?.registerStanding({
    name: "waitlist",
    holdFor: (email) => {
      const hold = holds.holding(email);
      const entry = hold ? book.byId.get(hold.entry_id) : undefined;
      return entry ? { reason: HOLD_REASON, firm: entry.firm, on: entry.joined_on } : null;
    },
  });

  // ---------------------------------------------------------------- the overview and Due

  // The block is a list (unit1-api §8); the provider's type says an object, which a list is.
  core.provideOverview("waitlist", (): Answer => {
    const now = nowAt(book.events);
    return WAITLIST_STAGE_ORDER.map((stage) => ({ stage, count: now[stage] })) as unknown as Answer;
  });

  core.provideDue((): DueItem[] => {
    const today = core.day();
    const items: DueItem[] = [];
    for (const entry of book.entries) {
      if (entry.stage === "dropped") {
        const on = entry.dropped?.look_again_on;
        if (on && on <= today)
          items.push({
            key: `waitlist:${entry.entry_id}:look-again`,
            kind: "waitlist",
            title: `Look again at ${entry.firm}`,
            sub: `Dropped: ${DROP_REASONS[entry.dropped!.reason as keyof typeof DROP_REASONS] ?? "Other"}`,
            due_on: on,
            href: `/data/waitlist/${entry.entry_id}`,
          });
        continue;
      }
      if (entry.stage === "customer" && !entry.next_step) continue;
      if (!entry.next_step || !entry.next_step_on || entry.next_step_on > today) continue;
      items.push({
        key: `waitlist:${entry.entry_id}`,
        kind: "waitlist",
        title: entry.next_step,
        sub: `${entry.firm} · ${WAITLIST_STAGES[entry.stage].label}`,
        due_on: entry.next_step_on,
        href: `/data/waitlist/${entry.entry_id}`,
      });
    }
    return items;
  });
  registerWaitlistAgenda(core, book);

  // ---------------------------------------------------------------- the list (fixed paths first)

  core.route("GET", "/data/waitlist", (ctx) => {
    const stage = clean(ctx.query.get("stage"), 20);
    const terms = findTerms(clean(ctx.query.get("q"), LIMITS.search));
    const offset = Math.min(200_000, Math.max(0, wholeNumber(ctx.query.get("offset"), 0)));
    const all = ordered();
    const searched = terms.length
      ? all.filter((entry) => {
          const contact = leadsOrNull()?.byEmail(entry.contact_email);
          return matchesTerms(
            [
              entry.firm,
              entry.domain,
              entry.contact_email,
              contact?.name ?? "",
              entry.how_joined,
              entry.next_step,
              entry.city,
              entry.firm_type,
            ],
            terms,
          );
        })
      : all;
    const shown = (WAITLIST_STAGE_ORDER as readonly string[]).includes(stage)
      ? searched.filter((entry) => entry.stage === stage)
      : searched;
    return {
      entries: shown.slice(offset, offset + PAGE).map(rowOf),
      total: shown.length,
      offset,
      limit: PAGE,
      counts: counts(searched),
      now: nowAt(book.events),
      ever: everReached(book.events),
      firms: book.entries.length,
      today: core.day(),
    };
  });

  core.route("GET", "/data/waitlist/for-investors", () => {
    const context = exportContext();
    const rows = [...book.entries]
      .sort((a, b) => a.joined_on.localeCompare(b.joined_on) || a.firm.localeCompare(b.firm))
      .map((entry) => investorRow(entry, context));
    return {
      as_of: core.day(),
      rows,
      now: nowAt(book.events),
      ever: everReached(book.events),
    };
  });

  core.route("POST", "/data/waitlist", (ctx) => {
    const by = ctx.staff();
    const service = leads();
    const email = normaliseEmail(clean(ctx.body.email, LIMITS.email));
    if (!email) throw new Refused(400, "invalid", "That is not an email address.");
    const today = core.day();
    const typedFirm = cleanText(ctx.body.firm, LIMITS.title);
    const known = service.byEmail(email);
    const firmKey = service.firmKeyOf(email, known?.email_kind) || `mail:${email}`;
    const existing = book.byFirm.get(firmKey);
    // Every check before anything is written: a refusal leaves All leads as it was.
    if (existing)
      throw new Refused(409, "already_on_waitlist", `${existing.firm} is on the waitlist already.`);
    const joined = clean(ctx.body.joined_on, 10);
    if (joined && (!isDay(joined) || joined > today))
      throw new Refused(400, "invalid", "The day they joined is not a day up to today.");
    const quote = cleanText(ctx.body.quote, LIMITS.words);
    const howJoined = cleanText(ctx.body.how_joined, LIMITS.title);
    const lead =
      known ??
      service.addManual({
        email,
        values: typedFirm ? { company: typedFirm } : {},
        origin: "hand",
        referred_by: null,
        by,
      });
    const entry = createEntry({
      email,
      lead,
      firmKey,
      firm: typedFirm,
      joined_on: joined || today,
      how_joined: howJoined || "Said yes, added by hand",
      proof: {
        reply_id: null,
        quote,
        from: email,
        subject: "",
        received_at: null,
        file_id: null,
        recorded_by: by.name,
      },
      by,
      via: "Added by hand",
    });
    return { entry, href: `/data/waitlist/${entry.entry_id}` };
  });

  core.route("POST", "/data/waitlist/import", (ctx) => {
    const by = ctx.staff();
    const service = leads();
    const text = typeof ctx.body.text === "string" ? ctx.body.text : "";
    if (!text.trim()) throw new Refused(400, "empty", "That file is empty.");
    const read = readOldFile(text);
    const today = core.day();
    let added = 0;
    let already = 0;
    const refused = [...read.refused];
    for (const row of read.rows) {
      let lead = service.byEmail(row.email);
      try {
        if (!lead)
          lead = service.addManual({
            email: row.email,
            values: {
              full_name: row.full_name,
              title: row.title,
              company: row.company,
              firm_type: row.firm_type,
              city: row.city,
              country: row.country,
            },
            origin: "hand",
            referred_by: null,
            by,
          });
      } catch (error) {
        refused.push({
          line: row.line,
          reason: error instanceof Refused ? error.message : "It could not be read.",
        });
        continue;
      }
      const firmKey = service.firmKeyOf(row.email, lead.email_kind) || `mail:${row.email}`;
      const existing = book.byFirm.get(firmKey);
      if (existing) {
        already += 1;
        if (!book.person(existing, row.email)) {
          existing.people.push({ email: row.email, role: "not_set", added: "hand" });
          existing.updated_at = core.now();
          book.save();
        }
        continue;
      }
      const joinedOn = row.joined_on && row.joined_on <= today ? row.joined_on : today;
      const entry = createEntry({
        email: row.email,
        lead,
        firmKey,
        firm: row.company,
        joined_on: joinedOn,
        how_joined: row.how_joined || "In the old waitlist file",
        proof: {
          reply_id: null,
          quote: row.proof,
          from: row.email,
          subject: "",
          received_at: null,
          file_id: null,
          recorded_by: by.name,
        },
        by,
        via: "Brought in from the old waitlist file",
      });
      // The old file's own words, where it had them; the contact's lead may say otherwise.
      if (row.firm_type || row.city || row.country) {
        entry.firm_type = row.firm_type || entry.firm_type;
        entry.city = row.city || entry.city;
        entry.country = row.country || entry.country;
        entry.described_as = describe(row.title || lead.title, entry.firm_type, entry.city);
        book.save();
      }
      if (row.notes)
        book.log({
          entry_id: entry.entry_id,
          kind: "note",
          at: core.now(),
          by,
          text: `From the old waitlist file: ${row.notes}`,
        });
      added += 1;
    }
    core.log(`old waitlist file: ${added} added, ${already} already, ${refused.length} refused`);
    return { added, already, refused: refused.slice(0, 200) };
  });

  core.route("POST", new RegExp(`^/data/holds/${ENTRY_ID}/release$`), async (ctx) => {
    const by = ctx.staff();
    const hold = holds.get(ctx.params[0]!);
    if (!hold) throw new Refused(404, "not_found", "That hold is not here.");
    const answer = await release(hold, ctx.body.emails, by, holdContext());
    return { ...answer, hold: { ...hold, open: holds.open(hold) } };
  });

  // ---------------------------------------------------------------- one firm

  const colleaguesOf = (entry: WaitlistEntry) => {
    const service = leadsOrNull();
    const rows = new Map<string, LeadRow>();
    for (const row of atFirm(entry)) rows.set(row.email, row);
    for (const person of entry.people)
      if (!rows.has(person.email)) {
        const row = service?.byEmail(person.email);
        if (row) rows.set(row.email, row);
      }
    const rank = (row: LeadRow) =>
      row.email === entry.contact_email ? 0 : book.person(entry, row.email) ? 1 : 2;
    return [...rows.values()]
      .map((row) => {
        const person = book.person(entry, row.email);
        return {
          ...row,
          role: person?.role ?? "not_set",
          added: person?.added ?? null,
          on_page: person !== null,
        };
      })
      .sort(
        (a, b) =>
          rank(a) - rank(b) ||
          (a.name || a.email).localeCompare(b.name || b.email, "en", { numeric: true }),
      );
  };

  const holdView = (hold: ReturnType<Holds["forEntry"]>[number]) => ({
    ...hold,
    open: holds.open(hold),
  });

  core.route("GET", new RegExp(`^/data/waitlist/${ENTRY_ID}$`), (ctx) => {
    const entry = entryOr404(ctx.params[0]);
    core.sender.poll();
    const proofFile: FileRow | null = entry.proof.file_id
      ? (files()?.fileRow(entry.proof.file_id) ?? null)
      : null;
    return {
      entry,
      events: book.timeline(entry.entry_id),
      people: colleaguesOf(entry),
      holds: holds.forEntry(entry.entry_id).map(holdView),
      proof_file: proofFile,
      contact: leadsOrNull()?.byEmail(entry.contact_email) ?? null,
      free_mail: isFreeMail(entry),
      files: files() !== null,
      today: core.day(),
    };
  });

  core.route("GET", new RegExp(`^/data/waitlist/${ENTRY_ID}/hold-preview$`), (ctx) => {
    const entry = entryOr404(ctx.params[0]);
    core.sender.poll();
    return preview(entry, leads());
  });

  core.route("POST", new RegExp(`^/data/waitlist/${ENTRY_ID}/stage$`), (ctx) => {
    const by = ctx.staff();
    const entry = entryOr404(ctx.params[0]);
    const move = readStageMove(ctx.body, core.now(), core.day());
    return { entry: applyMove(book, entry, move, by, core.now(), core.day()) };
  });

  core.route("POST", new RegExp(`^/data/waitlist/${ENTRY_ID}/update$`), (ctx) => {
    const by = ctx.staff();
    const entry = entryOr404(ctx.params[0]);
    const field = clean(ctx.body.field, 40);
    const today = core.day();
    const at = core.now();
    const edit = (
      label: string,
      before: string,
      after: string,
      kind: WaitlistEvent["kind"] = "edit",
    ) => {
      if (before === after) return;
      entry.updated_at = at;
      book.save();
      book.log({
        entry_id: entry.entry_id,
        kind,
        at,
        by,
        text:
          kind === "next_step"
            ? nextStepWords(entry.next_step, entry.next_step_on)
            : `${label}: ${before || "Not given"} → ${after || "Not given"}`,
      });
    };
    const text = (limit: number = LIMITS.title) => cleanText(ctx.body.value, limit);
    switch (field) {
      case "firm": {
        const value = text();
        if (!value) throw new Refused(400, "invalid", "Give the firm a name.");
        const before = entry.firm;
        entry.firm = value;
        edit("Firm", before, value);
        break;
      }
      case "firm_type":
      case "city":
      case "country":
      case "how_joined":
      case "owner": {
        const labels = {
          firm_type: "Firm type",
          city: "City",
          country: "Country",
          how_joined: "How they joined",
          owner: "Owner",
        } as const;
        const value = text();
        const before = entry[field];
        entry[field] = value;
        edit(labels[field], before, value);
        break;
      }
      case "joined_on": {
        const value = clean(ctx.body.value, 10);
        if (!isDay(value) || value > today)
          throw new Refused(400, "invalid", "The day they joined is not a day up to today.");
        const before = entry.joined_on;
        entry.joined_on = value;
        if (entry.stage === "joined" && entry.stage_since === before) entry.stage_since = value;
        edit("Joined on", before, value);
        break;
      }
      case "contact_email": {
        const value = normaliseEmail(clean(ctx.body.value, LIMITS.email));
        if (!value) throw new Refused(400, "invalid", "That is not an email address.");
        const lead = leads().byEmail(value);
        if (!lead) throw new Refused(409, "not_a_lead", "No lead has that address.");
        if (!book.person(entry, value) && !atFirm(entry).some((row) => row.email === value))
          throw new Refused(
            400,
            "invalid",
            "The contact must be someone at this firm; add them as a colleague first.",
          );
        const before = entry.contact_email;
        entry.contact_email = value;
        if (!book.person(entry, value))
          entry.people.push({ email: value, role: "not_set", added: "hand" });
        edit("Contact", before, value);
        break;
      }
      case "next_step": {
        const before = entry.next_step;
        entry.next_step = text();
        edit("Next step", before, entry.next_step, "next_step");
        break;
      }
      case "next_step_on": {
        const value = clean(ctx.body.value, 10);
        if (value && !isDay(value)) throw new Refused(400, "invalid", "That is not a day.");
        const before = entry.next_step_on ?? "";
        entry.next_step_on = value || null;
        edit("By", before, value, "next_step");
        break;
      }
      case "naming": {
        const value = ctx.body.value === "named" ? "named" : "described";
        const before = entry.naming;
        entry.naming = value;
        edit("To investors", NAMING[before], NAMING[value]);
        break;
      }
      case "described_as": {
        const value = text();
        if (/@/.test(value) || /\d{8}/.test(value))
          throw new Refused(
            400,
            "invalid",
            "Describe the firm without an address or a long number: investors read this.",
          );
        const contact = leads().byEmail(entry.contact_email);
        const next = value || describe(contact?.title ?? "", entry.firm_type, entry.city);
        const before = entry.described_as;
        entry.described_as = next;
        edit("Described as", before, next);
        break;
      }
      case "pilot_starts_on":
      case "pilot_ends_on": {
        const value = clean(ctx.body.value, 10);
        if (value && !isDay(value)) throw new Refused(400, "invalid", "That is not a day.");
        const pilot = entry.pilot ?? { starts_on: null, ends_on: null, success: "" };
        const key = field === "pilot_starts_on" ? "starts_on" : "ends_on";
        const other = field === "pilot_starts_on" ? pilot.ends_on : pilot.starts_on;
        if (value && other && (key === "starts_on" ? value > other : value < other))
          throw new Refused(400, "invalid", "The pilot ends before it starts.");
        const before = pilot[key] ?? "";
        pilot[key] = value || null;
        entry.pilot = pilot;
        edit(key === "starts_on" ? "Pilot starts" : "Pilot ends", before, value);
        break;
      }
      case "pilot_success": {
        const pilot = entry.pilot ?? { starts_on: null, ends_on: null, success: "" };
        const before = pilot.success;
        pilot.success = text(LIMITS.notes);
        entry.pilot = pilot;
        edit("What success looks like", before, pilot.success);
        break;
      }
      case "drop_reason": {
        if (entry.stage !== "dropped" || !entry.dropped)
          throw new Refused(409, "not_dropped", "Only a dropped firm has a reason.");
        const value = clean(ctx.body.value, 40);
        if (!(value in DROP_REASONS))
          throw new Refused(400, "needs_reason", "Say why it was dropped.");
        const reasons = DROP_REASONS as Record<string, string>;
        const before = entry.dropped.reason;
        entry.dropped.reason = value;
        edit("Drop reason", reasons[before] ?? before, reasons[value] ?? value);
        break;
      }
      case "look_again_on": {
        if (entry.stage !== "dropped" || !entry.dropped)
          throw new Refused(409, "not_dropped", "Only a dropped firm is looked at again.");
        const value = clean(ctx.body.value, 10);
        if (value && !isDay(value)) throw new Refused(400, "invalid", "That is not a day.");
        const before = entry.dropped.look_again_on ?? "";
        entry.dropped.look_again_on = value || null;
        edit("Look again on", before, value);
        break;
      }
      default:
        throw new Refused(400, "invalid", "That is not a detail of a waitlist firm.");
    }
    return { entry };
  });

  core.route("POST", new RegExp(`^/data/waitlist/${ENTRY_ID}/notes$`), (ctx) => {
    const by = ctx.staff();
    const entry = entryOr404(ctx.params[0]);
    const kind = ctx.body.kind === "call" ? "call" : "note";
    const text = cleanText(ctx.body.text, LIMITS.notes);
    if (!text)
      throw new Refused(
        400,
        "invalid",
        kind === "call" ? "Write what was said first." : "Write the note first.",
      );
    let when: string | undefined;
    if (kind === "call") {
      const typed = clean(ctx.body.at, 40);
      const parsed = typed ? Date.parse(typed) : Date.parse(core.now());
      if (!Number.isFinite(parsed)) throw new Refused(400, "invalid", "Say when the call was.");
      when = new Date(parsed).toISOString();
    }
    const event = book.log({
      entry_id: entry.entry_id,
      kind,
      at: core.now(),
      by,
      text,
      ...(when ? { when } : {}),
    });
    return { event };
  });

  core.route("POST", new RegExp(`^/data/waitlist/${ENTRY_ID}/people$`), (ctx) => {
    const by = ctx.staff();
    const entry = entryOr404(ctx.params[0]);
    const service = leads();
    const email = normaliseEmail(clean(ctx.body.email, LIMITS.email));
    if (!email) throw new Refused(400, "invalid", "That is not an email address.");
    if (book.person(entry, email))
      throw new Refused(409, "already_there", "They are on this firm's page already.");
    const role = isRole(ctx.body.role) ? ctx.body.role : "not_set";
    let lead = service.byEmail(email);
    let added: Person["added"] = "hand";
    if (!lead) {
      lead = service.addManual({
        email,
        values: {
          full_name: cleanText(ctx.body.name, LIMITS.name),
          title: cleanText(ctx.body.title, LIMITS.title),
          company: entry.firm,
          firm_type: entry.firm_type,
          city: entry.city,
          country: entry.country,
        },
        origin: "copied",
        referred_by: entry.contact_email,
        by,
      });
      service.tag(lead.lead_id, ["Copied on a yes"], [], by);
      added = "copied";
    }
    entry.people.push({ email, role, added });
    entry.updated_at = core.now();
    book.save();
    book.log({
      entry_id: entry.entry_id,
      kind: "person",
      at: core.now(),
      by,
      text: `Added ${lead.name || email}${role === "not_set" ? "" : ` as ${COLLEAGUE_ROLES[role]}`}${added === "copied" ? ", a new lead" : ""}`,
    });
    return { entry, lead };
  });

  core.route("POST", new RegExp(`^/data/waitlist/${ENTRY_ID}/people/role$`), (ctx) => {
    const by = ctx.staff();
    const entry = entryOr404(ctx.params[0]);
    const email = normaliseEmail(clean(ctx.body.email, LIMITS.email));
    if (!email) throw new Refused(400, "invalid", "That is not an email address.");
    if (!isRole(ctx.body.role)) throw new Refused(400, "invalid", "Choose a role.");
    const role = ctx.body.role;
    const person = book.person(entry, email);
    if (!person && !atFirm(entry).some((row) => row.email === email))
      throw new Refused(404, "not_found", "They are not at this firm.");
    const before = person?.role ?? "not_set";
    if (before === role) return { entry };
    if (person) person.role = role;
    else entry.people.push({ email, role, added: "hand" });
    entry.updated_at = core.now();
    book.save();
    const name = leadsOrNull()?.byEmail(email)?.name || email;
    book.log({
      entry_id: entry.entry_id,
      kind: "person",
      at: core.now(),
      by,
      text: `${name}: ${COLLEAGUE_ROLES[before]} → ${COLLEAGUE_ROLES[role]}`,
    });
    return { entry };
  });

  core.route("POST", new RegExp(`^/data/waitlist/${ENTRY_ID}/proof-file$`), async (ctx) => {
    const by = ctx.staff();
    const entry = entryOr404(ctx.params[0]);
    const vault = files();
    if (!vault)
      throw new Refused(
        409,
        "files_missing",
        "Files is not set up here yet, so a copy cannot be kept.",
      );
    let file: FileRow | null = null;
    const fileId = clean(ctx.body.file_id, 64);
    if (fileId) {
      file = vault.fileRow(fileId);
      if (!file || file.trashed_at)
        throw new Refused(404, "not_found", "That file is not in Files.");
    } else {
      const content = typeof ctx.body.content === "string" ? ctx.body.content : "";
      const original =
        clean(ctx.body.name, LIMITS.file_name).replace(/[\\/]/g, "_") || "Saved copy";
      if (!content) throw new Refused(400, "empty", "Choose the saved copy first.");
      const bytes = Buffer.from(content, "base64");
      if (bytes.length === 0) throw new Refused(400, "empty", "That file is empty.");
      if (bytes.length > PROOF_MAX_BYTES)
        throw new Refused(
          400,
          "too_large",
          "That copy is over 3 MB. Put it in Files, then attach it from there.",
        );
      file = await vault.putFile({
        folderPath: PROOF_FOLDER,
        title: `${entry.firm} – ${original}`.slice(0, LIMITS.title),
        originalName: original,
        bytes: new Uint8Array(bytes),
        by,
        note: `Proof of ${entry.firm}'s yes`,
      });
    }
    entry.proof.file_id = file.file_id;
    entry.updated_at = core.now();
    book.save();
    book.log({
      entry_id: entry.entry_id,
      kind: "proof",
      at: core.now(),
      by,
      text: `Attached a saved copy: ${file.title}`,
    });
    return { entry, file };
  });

  core.route("POST", new RegExp(`^/data/waitlist/${ENTRY_ID}/hold$`), async (ctx) => {
    const by = ctx.staff();
    const entry = entryOr404(ctx.params[0]);
    const answer = await holdBack(entry, ctx.body.emails, by, holdContext());
    return {
      hold: answer.hold ? holdView(answer.hold) : null,
      added: answer.added,
      already: answer.already,
      skipped: answer.skipped,
    };
  });

  // ---------------------------------------------------------------- the downloads

  const writeFile = (path: string, text: string): void => {
    writeFileSync(path, text, { mode: 0o600 });
  };
  const ledger = (by: Staff, kind: string, rows: number) =>
    core.store.appendLine("waitlist/exports.jsonl", { at: core.now(), by, kind, rows });

  core.builds.provide("waitlist_csv", async (handle, input) => {
    const entries = [...book.entries].sort(
      (a, b) => a.joined_on.localeCompare(b.joined_on) || a.firm.localeCompare(b.firm),
    );
    handle.setProgress(0, entries.length);
    await core.yield();
    writeFile(handle.path, internalCsv(entries, book.eventsOf, exportContext()));
    handle.setProgress(entries.length, entries.length);
    ledger(input.by, "every_field", entries.length);
    return { name: `Waitlist ${core.day()}.csv`, type: "text/csv; charset=utf-8" };
  });

  core.builds.provide("investor_csv", async (handle, input) => {
    const context = exportContext();
    const rows = [...book.entries]
      .sort((a, b) => a.joined_on.localeCompare(b.joined_on) || a.firm.localeCompare(b.firm))
      .map((entry) => investorRow(entry, context));
    handle.setProgress(0, rows.length);
    await core.yield();
    writeFile(handle.path, investorCsv(rows, core.day()));
    handle.setProgress(rows.length, rows.length);
    ledger(input.by, "for_investors", rows.length);
    return { name: `Waitlist for investors ${core.day()}.csv`, type: "text/csv; charset=utf-8" };
  });

  // ---------------------------------------------------------------- test routes

  if (core.testRoutes) {
    // The next firm made takes this id, so the walk's screens have fixed paths.
    core.route("POST", "/data/_test/waitlist/pin", (ctx) => {
      ctx.staff();
      const id = clean(ctx.body.entry_id, 64).toLowerCase();
      if (!isUuid(id)) throw new Refused(400, "invalid", "Give an id.");
      book.pinned = book.byId.has(id) ? null : id;
      return { pinned: book.pinned };
    });
    // Move a next step's day without the form's rules (to make one overdue for the walk).
    core.route("POST", "/data/_test/waitlist/set", (ctx) => {
      const by = ctx.staff();
      const entry = entryOr404(clean(ctx.body.entry_id, 64));
      const day = clean(ctx.body.next_step_on, 10);
      if (!isDay(day)) throw new Refused(400, "invalid", "That is not a day.");
      entry.next_step_on = day;
      entry.updated_at = core.now();
      book.save();
      book.log({
        entry_id: entry.entry_id,
        kind: "next_step",
        at: core.now(),
        by,
        text: nextStepWords(entry.next_step, entry.next_step_on),
      });
      return { entry };
    });
  }
}
