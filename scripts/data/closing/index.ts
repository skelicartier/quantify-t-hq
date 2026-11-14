/**
 * The close (ws-notes/company/spec.md §9): one closing checklist per investor firm, from a
 * yes to shares in the register (documents, the PAS-4 offer, the money from the investor's
 * own account, bank KYC, valuation, board approval, the allotment, the register entry, the
 * certificate, or a refund), and the round's own steps. Steps that start a statutory clock
 * add their Key dates through C1's `key-dates`; the allotment goes into the register
 * through C2's `members`. Both are optional: without them the page works the days out
 * itself and the register step is ticked by hand.
 *
 * Every warning is a warning; the one refusal is an allotment dated before the money
 * arrived. Nothing here is legal advice, and HQ never files anything.
 */

import { randomUUID } from "node:crypto";

import { Refused } from "../../mail-merge/engine";
import {
  COMPANY_SERVICES,
  standInKeyDates,
  type CompanyLookup,
  type HolderKind,
  type KeyDateLink,
  type KeyDatesService,
  type MeetingsLookup,
  type MembersRegister,
  type ResolutionView,
  type UsedFor,
} from "../company-contracts";
import type { Answer, Ctx, DataCore } from "../core";
import { clean, cleanText, isRouteId, normaliseEmail } from "../guard";
import type { Staff } from "../protocol";
import { INSTRUMENTS } from "../../../src/lib/data/labels";
import { CLOSING_STEPS, KEY_DATES_MISSING, dayWords } from "../../../src/lib/data/labels-close";
import {
  BEFORE_MONEY,
  ROUND_ORIGIN,
  allItems,
  allotmentItems,
  amountOf,
  closingKey,
  datesMissing,
  deadlinesOf,
  dueOf,
  guardrailsOf,
  linksOf,
  moneyItems,
  nextOf,
  offersOf,
  originOf,
  originsOf,
  refundBase,
  refundItem,
  roundItems,
  type Residency,
} from "./chain";
import {
  CLOSE_TOTALS,
  CLOSING_LIMITS,
  FOLDERS,
  currencyOf,
  full,
  invalid,
  keepCopy,
  keyOf,
  pastDay,
  ticked,
  wholeAmount,
} from "./limits";
import { INVESTORS_CLOSE, type CloseFirm, type InvestorsClose } from "./seams";
import { standInMeetings, standInMembers } from "./stand-ins";
import {
  NO_ROUND,
  ROUND_STEP_KEYS,
  STEP_KEYS,
  type Closing,
  type ClosingEvent,
  type RoundClose,
  type RoundStepKey,
  type StepKey,
} from "./types";

const FILE = "closing/closings.json";
const EVENTS = "closing/events.jsonl";
const INVESTOR_ID = /^[0-9a-f]{32}$/;
const HOLDER_KIND_KEYS: readonly HolderKind[] = [
  "person",
  "company",
  "llp",
  "trust",
  "fund",
  "other",
];
const POOLED_KEYS = ["syndicate", "fund", "other"] as const;
const VALUATION_KEYS = ["registered_valuer", "fema", "both"] as const;
const COMMITTED = new Set(["soft", "signed", "money_in"]);
/** Each step's later steps: a step is cleared only once nothing rests on it. */
const LATER: Partial<Record<StepKey, StepKey[]>> = {
  money_received: ["allotment", "refund"],
  allotment: ["register", "certificate"],
};

type Stored = { format: 1; closings: Closing[]; round: RoundClose };

const lower = (text: string): string => text.charAt(0).toLowerCase() + text.slice(1);
const errorName = (error: unknown): string => (error instanceof Error ? error.name : "error");

export function register(core: DataCore): void {
  const stored = core.store.readJson<Partial<Stored>>(FILE, {});
  const closings: Closing[] = Array.isArray(stored.closings) ? stored.closings : [];
  const round: RoundClose = { ...NO_ROUND, ...(stored.round ?? {}) };
  const save = (): void => core.store.writeJson(FILE, { format: 1, closings, round });
  const log = (closingId: string, verb: string, detail: string, by: Staff): void => {
    const event: ClosingEvent = {
      event_id: randomUUID(),
      closing_id: closingId,
      verb,
      detail,
      by,
      at: core.now(),
    };
    core.store.appendLine(EVENTS, event);
  };

  // The services this batch's other units provide, asked at request time (§3.2).
  const keyDates = () => core.need<KeyDatesService>(COMPANY_SERVICES.keyDates);
  const company = () => core.need<CompanyLookup>(COMPANY_SERVICES.company);
  const members = () => core.need<MembersRegister>(COMPANY_SERVICES.members);
  const meetings = () => core.need<MeetingsLookup>(COMPANY_SERVICES.meetings);
  const investors = () => core.need<InvestorsClose>(INVESTORS_CLOSE);

  const firmOf = (investorId: string): CloseFirm | null => {
    try {
      return investors()?.firm(investorId) ?? null;
    } catch (error) {
      core.log(`closing: the firm could not be read: ${errorName(error)}`);
      return null;
    }
  };
  const residencyOf = (closing: Closing): Residency => firmOf(closing.investor_id)?.residency ?? "";
  const factsOf = () => {
    try {
      return company()?.facts() ?? null;
    } catch {
      return null;
    }
  };
  const firmsRegisteredOn = (): string | null =>
    factsOf()?.firms_registered_on ?? round.firms_registered?.on ?? null;
  const classesOf = (): { class_id: string; name: string }[] | null => {
    const register = members();
    if (!register) return null;
    try {
      return register.classes().map(({ class_id, name }) => ({ class_id, name }));
    } catch {
      return [];
    }
  };
  const className = (classId: string | null): string =>
    (classId && classesOf()?.find((item) => item.class_id === classId)?.name) || "Class not chosen";

  const find = (investorId: string): Closing | null =>
    closings.find((closing) => closing.investor_id === investorId) ?? null;
  const mustFirm = (investorId: string | undefined): CloseFirm => {
    const firm = investorId && INVESTOR_ID.test(investorId) ? firmOf(investorId) : null;
    if (!firm) throw new Refused(404, "not_found", "That firm is not here.");
    return firm;
  };
  const mustClosing = (investorId: string | undefined): Closing => {
    mustFirm(investorId);
    const closing = find(investorId ?? "");
    if (!closing) throw new Refused(409, "no_closing", "Start the closing checklist first.");
    return closing;
  };
  const touch = (closing: Closing, by: Staff): void => {
    closing.updated_at = core.now();
    closing.updated_by = by;
  };

  /** Ask Key dates; a failure is logged and the page says the dates are not in it. */
  const withKeyDates = <T>(work: (service: KeyDatesService) => T): T | null => {
    const service = keyDates();
    if (!service) return null;
    try {
      return work(service);
    } catch (error) {
      core.log(`closing: Key dates could not be changed: ${errorName(error)}`);
      return null;
    }
  };
  const linksFor = (closing: Closing): KeyDateLink[] | null =>
    linksOf(keyDates(), originsOf(closing, residencyOf(closing)));

  // ---------------------------------------------------------------- what other modules ask

  const usedFor: UsedFor = {
    usedFor: (fileId) => {
      const found: { label: string; href: string }[] = [];
      for (const closing of closings) {
        const href = `/data/investors/${closing.investor_id}#investor-closing`;
        if (closing.offer_letter?.file_id === fileId)
          found.push({ label: `Offer letter to ${closing.firm}`, href });
        if (closing.documents_signed?.file_id === fileId)
          found.push({ label: `Signed documents with ${closing.firm}`, href });
        if (closing.money_received?.firc_file_id === fileId)
          found.push({ label: `FIRC for ${closing.firm}'s money`, href });
        if (closing.bank_kyc?.file_id === fileId)
          found.push({ label: `Bank KYC for ${closing.firm}`, href });
        if (closing.valuation?.file_id === fileId && !closing.valuation.from_round)
          found.push({ label: `Valuation report for ${closing.firm}`, href });
      }
      if (round.valuation?.file_id === fileId)
        found.push({ label: "Valuation report for the round", href: "/data/investors/closing" });
      return found;
    },
  };
  core.provide(COMPANY_SERVICES.closing, usedFor);

  // ---------------------------------------------------------------- reading

  const offers = () =>
    offersOf(closings, core.day(), amountOf(keyDates(), "offer-limit"), className);

  const detailOf = (closing: Closing, firm: CloseFirm) => {
    const service = keyDates();
    const links = linksFor(closing);
    const today = core.day();
    const items = allItems(closing, firm.residency, firmsRegisteredOn());
    const allotBy = closing.money_received
      ? dueOf(service, "allotment", closing.money_received.on)
      : null;
    return {
      deadlines: deadlinesOf(closing, firm.residency, service, links),
      key_dates: links,
      missing_dates: datesMissing(service, items, links),
      refund_date_due: Boolean(
        closing.money_received &&
        !closing.allotment &&
        !closing.refund &&
        allotBy &&
        today > allotBy,
      ),
      guardrails: guardrailsOf({
        closing,
        firm,
        round,
        company: company(),
        keyDates: service,
        today,
      }),
    };
  };

  const registerOf = (closing: Closing) => {
    const register = members();
    if (!register) return null;
    try {
      return register.forClosing(closingKey(closing.investor_id));
    } catch {
      return null;
    }
  };

  const resolutions = (): ResolutionView[] | null => {
    const service = meetings();
    if (!service) return null;
    try {
      return service.passed();
    } catch {
      return [];
    }
  };

  const companyAnswer = () => {
    const facts = factsOf();
    return facts
      ? {
          dpiit_number: facts.dpiit_number,
          firms_registered_on: facts.firms_registered_on,
          foreign_investment: facts.foreign_investment,
        }
      : null;
  };

  const roundAnswer = () => {
    const service = keyDates();
    const links = linksOf(service, [ROUND_ORIGIN]);
    const special = round.special_resolution;
    return {
      round,
      round_dates: {
        mgt_14:
          special && !special.resolution_id
            ? (links?.find((link) => link.rule_key === "mgt-14")?.due_on ??
              dueOf(service, "mgt-14", special.on))
            : null,
        valuation_valid_until: round.valuation
          ? dueOf(service, "valuation-age", round.valuation.on)
          : null,
      },
      round_key_dates: links,
    };
  };

  core.route("GET", "/data/closing", () => {
    const service = keyDates();
    const rows = closings
      .map((closing) => {
        const firm = firmOf(closing.investor_id);
        const residency = firm?.residency ?? "";
        const links = linksFor(closing);
        const deadlines = deadlinesOf(closing, residency, service, links);
        const warnings = firm
          ? guardrailsOf({
              closing,
              firm,
              round,
              company: company(),
              keyDates: service,
              today: core.day(),
            }).length
          : 0;
        return {
          ...closing,
          residency,
          stage: firm?.stage ?? null,
          deadlines,
          warnings,
          next: nextOf(deadlines),
        };
      })
      .sort((a, b) => a.firm.localeCompare(b.firm, "en", { sensitivity: "base", numeric: true }));
    return {
      closings: rows,
      ...roundAnswer(),
      offers: offers(),
      firms_registered_on: firmsRegisteredOn(),
      company: companyAnswer(),
      key_dates_here: service !== null,
      members_here: members() !== null,
      meetings_here: meetings() !== null,
      resolutions: resolutions(),
      today: core.day(),
    };
  });

  /** The round's own steps (registered before the `:investorId` routes, §9.5). */
  core.route("POST", "/data/closing/round/:step", async (ctx) => {
    const by = ctx.staff();
    const step = clean(ctx.params[0], 40).replace(/-/g, "_") as RoundStepKey;
    if (!ROUND_STEP_KEYS.includes(step)) throw new Refused(404, "not_found", "No such step.");
    const today = core.day();
    const at = core.now();
    const body = ctx.body;
    let detail = "";
    switch (step) {
      case "special_resolution": {
        const picked = clean(body.resolution_id, 64);
        const before = round.special_resolution;
        if (picked) {
          const found = meetings()?.resolution(picked) ?? null;
          if (!found) throw new Refused(404, "not_found", "That resolution is not in Meetings.");
          round.special_resolution = {
            on: found.passed_on,
            resolution_id: found.resolution_id,
            words: found.title,
            at,
            by,
          };
          if (before && !before.resolution_id)
            withKeyDates((service) =>
              service.takeBack(
                ROUND_ORIGIN,
                `The special resolution was picked from Meetings on ${dayWords(today)}.`,
                by,
              ),
            );
          detail = `${found.title}, from Meetings`;
        } else {
          const on = pastDay(body.on, today) ?? today;
          const words = cleanText(body.words, CLOSING_LIMITS.words);
          if (!words) throw invalid("Say what the special resolution approved.");
          round.special_resolution = { on, resolution_id: null, words, at, by };
          if (before && !before.resolution_id && before.on !== on)
            withKeyDates((service) => service.rebase(ROUND_ORIGIN, on, by));
          if (ticked(body.add_dates)) withKeyDates((service) => service.add(roundItems(round), by));
          detail = `${words}, passed ${dayWords(on)}`;
        }
        break;
      }
      case "separate_account": {
        const opened = pastDay(body.opened_on ?? body.on, today) ?? today;
        const bank = cleanText(body.bank, CLOSING_LIMITS.bank);
        if (!bank) throw invalid("Give the bank's name.");
        round.separate_account = { opened_on: opened, bank, at, by };
        detail = `${bank}, opened ${dayWords(opened)}`;
        break;
      }
      case "valuation": {
        const on = pastDay(body.on, today) ?? today;
        const byName = cleanText(body.by_name, CLOSING_LIMITS.by_name);
        if (!byName) throw invalid("Give the valuer's name.");
        const kind = keyOf(body.kind, VALUATION_KEYS, "Choose the kind of valuation.");
        const file = await keepCopy(core, body, "", {
          folder: FOLDERS.capTable,
          title: "Valuation report for the round",
          note: "Valuation report for the round",
          by,
        });
        round.valuation = {
          on,
          by_name: byName,
          kind,
          file_id: file?.file_id ?? round.valuation?.file_id ?? null,
          at,
          by,
        };
        detail = `By ${byName}, ${dayWords(on)}`;
        break;
      }
      case "firms_registered": {
        const on = pastDay(body.on, today) ?? today;
        round.firms_registered = { on, at, by };
        detail = dayWords(on);
        break;
      }
    }
    save();
    log("round", step, detail, by);
    return { ...roundAnswer(), key_dates: linksOf(keyDates(), [ROUND_ORIGIN]) };
  });

  core.route("GET", "/data/closing/:investorId", (ctx) => {
    const firm = mustFirm(ctx.params[0]);
    const closing = find(firm.investor_id);
    const service = keyDates();
    const detail = closing
      ? detailOf(closing, firm)
      : {
          deadlines: [],
          key_dates: service ? [] : null,
          missing_dates: false,
          refund_date_due: false,
          guardrails: guardrailsOf({
            closing: null,
            firm,
            round,
            company: company(),
            keyDates: service,
            today: core.day(),
          }),
        };
    return {
      closing,
      firm,
      ...detail,
      register: closing ? registerOf(closing) : null,
      resolutions: resolutions(),
      classes: classesOf(),
      can_start: !closing && COMMITTED.has(firm.stage),
      key_dates_here: service !== null,
      members_here: members() !== null,
      company: companyAnswer(),
      round,
      events: closing ? eventsOf(closing.closing_id) : [],
      today: core.day(),
    };
  });

  const eventsOf = (closingId: string): ClosingEvent[] =>
    core.store
      .readLines<ClosingEvent>(EVENTS)
      .filter((event) => event?.closing_id === closingId)
      .reverse()
      .slice(0, 100);

  // ---------------------------------------------------------------- starting and the terms

  core.route("POST", "/data/closing/:investorId/start", (ctx) => {
    const by = ctx.staff();
    const firm = mustFirm(ctx.params[0]);
    if (find(firm.investor_id))
      throw new Refused(409, "closing_open", "This firm's closing is open already.");
    if (!COMMITTED.has(firm.stage))
      throw new Refused(409, "too_early", "The closing checklist opens at Soft commit.");
    full(closings.length, CLOSE_TOTALS.closings, "closings");
    let roundInstrument: string | null = null;
    try {
      roundInstrument = investors()?.roundInstrument() ?? null;
    } catch {
      roundInstrument = null;
    }
    const fromFirm = firm.latest?.instrument ?? null;
    const instrument =
      (roundInstrument && roundInstrument !== "Not decided" ? roundInstrument : null) ??
      fromFirm ??
      "Not decided";
    const at = core.now();
    const closing: Closing = {
      closing_id: firm.investor_id,
      investor_id: firm.investor_id,
      firm: firm.firm,
      instrument,
      class_id: null,
      shares: null,
      price_per_share: null,
      holder: { name: firm.firm, kind: "company", email: firm.contact?.email ?? "", address: "" },
      pooled: null,
      documents_sent: null,
      documents_signed: null,
      offer_letter: null,
      money_received: null,
      bank_kyc: null,
      valuation: null,
      board_approval: null,
      allotment: null,
      register: null,
      certificate: null,
      refund: null,
      notes: "",
      created_at: at,
      created_by: by,
      updated_at: at,
      updated_by: by,
    };
    closings.push(closing);
    save();
    log(closing.closing_id, "started", `Instrument ${instrument}`, by);
    return { closing };
  });

  core.route("POST", "/data/closing/:investorId/terms", (ctx) => {
    const by = ctx.staff();
    const closing = mustClosing(ctx.params[0]);
    const body = ctx.body;
    const instrument = clean(body.instrument, 40) || closing.instrument;
    if (!(INSTRUMENTS as readonly string[]).includes(instrument))
      throw invalid("Choose the instrument.");
    const classId = clean(body.class_id, 64) || null;
    const classes = classesOf();
    if (classId && classes && !classes.some((item) => item.class_id === classId))
      throw invalid("That class of shares is not in the register.");
    const shares = wholeAmount(body.shares, "Give the number of shares as a whole number.");
    const price = wholeAmount(
      body.price_per_share,
      "Give the price a share as a whole number of rupees.",
    );
    const holderBody =
      body.holder && typeof body.holder === "object" && !Array.isArray(body.holder)
        ? (body.holder as Record<string, unknown>)
        : {};
    const name = cleanText(holderBody.name, CLOSING_LIMITS.holder_name);
    if (!name) throw invalid("Give the holder's name, as it goes in the register.");
    const kind = keyOf(holderBody.kind, HOLDER_KIND_KEYS, "Choose the kind of holder.", "company");
    const emailText = clean(holderBody.email, CLOSING_LIMITS.email);
    const email = emailText ? normaliseEmail(emailText) : "";
    if (emailText && !email) throw invalid("That is not an email address.");
    const address = cleanText(holderBody.address, CLOSING_LIMITS.address);
    let pooled: Closing["pooled"] = null;
    if (body.pooled && typeof body.pooled === "object" && !Array.isArray(body.pooled)) {
      const given = body.pooled as Record<string, unknown>;
      const backersGiven = Array.isArray(given.backers) ? given.backers : [];
      if (backersGiven.length > CLOSING_LIMITS.backers)
        throw invalid(`List ${CLOSING_LIMITS.backers} backers at most.`);
      const backers = backersGiven.map((item) => {
        const row =
          item && typeof item === "object"
            ? (item as Record<string, unknown>)
            : ({} as Record<string, unknown>);
        const backer = cleanText(row.name, CLOSING_LIMITS.backer_name);
        if (!backer) throw invalid("Give each backer's name.");
        const amount = wholeAmount(
          row.amount,
          "Type each backer's amount as a number, such as 250000.",
        );
        if (amount === null)
          throw invalid("Type each backer's amount as a number, such as 250000.");
        return { name: backer, amount, currency: currencyOf(row.currency) };
      });
      pooled = {
        kind: keyOf(
          given.kind,
          POOLED_KEYS,
          "Choose a syndicate, a fund or another pooled holder.",
        ),
        backers,
        fee_note: cleanText(given.fee_note, CLOSING_LIMITS.fee_note),
      };
    }
    closing.instrument = instrument;
    closing.class_id = classId;
    closing.shares = shares;
    closing.price_per_share = price;
    closing.holder = { name, kind, email, address };
    closing.pooled = pooled;
    if (body.notes !== undefined) closing.notes = cleanText(body.notes, CLOSING_LIMITS.notes);
    touch(closing, by);
    save();
    log(closing.closing_id, "terms", `${instrument} · ${name}`, by);
    return { closing };
  });

  // ---------------------------------------------------------------- the steps

  const stepOf = (slug: string | undefined): StepKey => {
    const key = clean(slug, 40).replace(/-/g, "_") as StepKey;
    if (!STEP_KEYS.includes(key)) throw new Refused(404, "not_found", "No such step.");
    return key;
  };

  const stepAnswer = (closing: Closing): Answer => {
    const firm = firmOf(closing.investor_id);
    return {
      closing,
      key_dates: linksFor(closing),
      warnings: firm
        ? guardrailsOf({
            closing,
            firm,
            round,
            company: company(),
            keyDates: keyDates(),
            today: core.day(),
          }).map((guardrail) => guardrail.words)
        : [],
    };
  };

  const recordStep = async (ctx: Ctx, closing: Closing, step: StepKey, by: Staff) => {
    const body = ctx.body;
    const today = core.day();
    const at = core.now();
    const firm = closing.firm;
    const residency = residencyOf(closing);
    const addDates = ticked(body.add_dates);
    const moneyOrigin = originOf(closing.investor_id, "money");
    const allotmentOrigin = originOf(closing.investor_id, "allotment");
    const refundOrigin = originOf(closing.investor_id, "refund");
    const copy = (folder: readonly string[], title: string) =>
      keepCopy(core, body, "", { folder, title, note: title, by });
    switch (step) {
      case "documents_sent": {
        const on = pastDay(body.on, today) ?? today;
        closing.documents_sent = { on, what: cleanText(body.what, CLOSING_LIMITS.what), at, by };
        return dayWords(on);
      }
      case "documents_signed": {
        const on = pastDay(body.on, today) ?? today;
        const file = await copy(FOLDERS.fundraising, `Signed documents with ${firm}`);
        closing.documents_signed = {
          on,
          file_id: file?.file_id ?? closing.documents_signed?.file_id ?? null,
          at,
          by,
        };
        return dayWords(on);
      }
      case "offer_letter": {
        const on = pastDay(body.on, today) ?? today;
        const serial = cleanText(body.serial, CLOSING_LIMITS.serial);
        if (!serial) throw invalid("Give the offer letter's serial number.");
        const file = await copy(FOLDERS.fundraising, `Offer letter to ${firm}`);
        closing.offer_letter = {
          on,
          serial,
          file_id: file?.file_id ?? closing.offer_letter?.file_id ?? null,
          at,
          by,
        };
        return `Serial ${serial}, ${dayWords(on)}`;
      }
      case "money_received": {
        if (closing.refund)
          throw new Refused(409, "refunded", "The money was refunded; clear the refund first.");
        const on = pastDay(body.on, today) ?? today;
        if (closing.allotment && closing.allotment.on < on)
          throw invalid(
            `The allotment on ${dayWords(closing.allotment.on)} is before that day; shares are allotted after the money arrives.`,
          );
        const amount = wholeAmount(body.amount, "Type the amount as a number, such as 2500000.");
        if (amount === null) throw invalid("Type the amount as a number, such as 2500000.");
        const currency = currencyOf(body.currency);
        const file = await copy(FOLDERS.capTable, `FIRC for ${firm}'s money`);
        const before = closing.money_received;
        closing.money_received = {
          on,
          amount,
          currency,
          own_account: ticked(body.own_account),
          reference: cleanText(body.reference, CLOSING_LIMITS.reference),
          firc_file_id: file?.file_id ?? before?.firc_file_id ?? null,
          at,
          by,
        };
        if (before && before.on !== on)
          withKeyDates((service) => {
            service.rebase(moneyOrigin, on, by);
            service.rebase(refundOrigin, refundBase(service, on), by);
          });
        if (addDates)
          withKeyDates((service) =>
            service.add(moneyItems(closing, residency, firmsRegisteredOn()), by),
          );
        return `${amount.toLocaleString("en-GB")} ${currency}, ${dayWords(on)}`;
      }
      case "bank_kyc": {
        const on = pastDay(body.on, today) ?? today;
        const file = await copy(FOLDERS.capTable, `Bank KYC for ${firm}`);
        closing.bank_kyc = {
          on,
          from_receiving_bank: ticked(body.from_receiving_bank),
          file_id: file?.file_id ?? closing.bank_kyc?.file_id ?? null,
          at,
          by,
        };
        return dayWords(on);
      }
      case "valuation": {
        if (ticked(body.from_round)) {
          const from = round.valuation;
          if (!from) throw invalid("Record the round's valuation first.");
          closing.valuation = {
            on: from.on,
            by_name: from.by_name,
            kind: from.kind,
            file_id: from.file_id,
            from_round: true,
            at,
            by,
          };
          return `The round's, ${dayWords(from.on)}`;
        }
        const on = pastDay(body.on, today) ?? today;
        const byName = cleanText(body.by_name, CLOSING_LIMITS.by_name);
        if (!byName) throw invalid("Give the valuer's name.");
        const kind = keyOf(body.kind, VALUATION_KEYS, "Choose the kind of valuation.");
        const file = await copy(FOLDERS.capTable, `Valuation report for ${firm}`);
        closing.valuation = {
          on,
          by_name: byName,
          kind,
          file_id:
            file?.file_id ??
            (closing.valuation?.from_round ? null : closing.valuation?.file_id) ??
            null,
          from_round: false,
          at,
          by,
        };
        return `By ${byName}, ${dayWords(on)}`;
      }
      case "board_approval": {
        const picked = clean(body.resolution_id, 64);
        if (picked) {
          const found = meetings()?.resolution(picked) ?? null;
          if (!found) throw new Refused(404, "not_found", "That resolution is not in Meetings.");
          closing.board_approval = {
            on: found.passed_on,
            resolution_id: found.resolution_id,
            words: found.title,
            at,
            by,
          };
          return found.title;
        }
        const on = pastDay(body.on, today) ?? today;
        closing.board_approval = {
          on,
          resolution_id: null,
          words: cleanText(body.words, CLOSING_LIMITS.words),
          at,
          by,
        };
        return dayWords(on);
      }
      case "allotment": {
        const money = closing.money_received;
        if (!money)
          throw new Refused(
            409,
            "no_money",
            "Record the money received first: shares are allotted after it arrives.",
          );
        if (closing.refund)
          throw new Refused(409, "refunded", "The money was refunded, so nothing is allotted.");
        const on = pastDay(body.on, today) ?? today;
        if (on < money.on) throw invalid(BEFORE_MONEY(money.on));
        const shares = wholeAmount(body.shares, "Give the number of shares as a whole number.");
        if (shares === null) throw invalid("Give the number of shares as a whole number.");
        const price = wholeAmount(
          body.price_per_share,
          "Give the price a share as a whole number of rupees.",
        );
        if (price === null) throw invalid("Give the price a share as a whole number of rupees.");
        const classId = clean(body.class_id, 64) || closing.class_id;
        const classes = classesOf();
        if (classId && classes && !classes.some((item) => item.class_id === classId))
          throw invalid("That class of shares is not in the register.");
        const before = closing.allotment;
        closing.allotment = { on, shares, price_per_share: price, class_id: classId, at, by };
        withKeyDates((service) => {
          if (before && before.on !== on) service.rebase(allotmentOrigin, on, by);
          service.done(
            moneyOrigin,
            "allotment",
            {
              srn: "",
              challan: "",
              filed_on: on,
              fee_paid: null,
              filed_file_id: null,
              note: `Allotted on ${dayWords(on)}`,
            },
            by,
          );
          if (service.linksFor(refundOrigin).length)
            service.takeBack(refundOrigin, `Allotted on ${dayWords(on)}.`, by);
          if (addDates) service.add(allotmentItems(closing, residency), by);
        });
        return `${shares.toLocaleString("en-GB")} shares, ${dayWords(on)}`;
      }
      case "register": {
        const allotment = closing.allotment;
        if (!allotment) throw new Refused(409, "not_allotted", "Record the allotment first.");
        const register = members();
        let entered: { on: string; entry_id: string | null; folio: string; by_hand: boolean };
        if (register) {
          const classId = allotment.class_id ?? closing.class_id;
          if (!classId) throw invalid("Choose the class of shares under Terms first.");
          const link = register.allot({
            closing_key: closingKey(closing.investor_id),
            holder: {
              name: closing.holder.name,
              kind: closing.holder.kind,
              residency,
              email: closing.holder.email,
              address: closing.holder.address,
              investor_id: closing.investor_id,
            },
            class_id: classId,
            shares: allotment.shares,
            price_per_share: allotment.price_per_share,
            allotted_on: allotment.on,
            entered_on: today,
            by,
          });
          entered = {
            on: link.entered_on,
            entry_id: link.entry_id,
            folio: link.folio,
            by_hand: false,
          };
        } else {
          const on = pastDay(body.on, today) ?? today;
          const folio = cleanText(body.folio, CLOSING_LIMITS.folio);
          if (!folio) throw invalid("Give the folio.");
          entered = { on, entry_id: null, folio, by_hand: true };
        }
        closing.register = { ...entered, at, by };
        withKeyDates((service) =>
          service.done(
            allotmentOrigin,
            "register-entry",
            {
              srn: "",
              challan: "",
              filed_on: entered.on,
              fee_paid: null,
              filed_file_id: null,
              note: `Folio ${entered.folio}`,
            },
            by,
          ),
        );
        return `Folio ${entered.folio}`;
      }
      case "certificate": {
        if (!closing.allotment)
          throw new Refused(409, "not_allotted", "Record the allotment first.");
        const fromRegister = registerOf(closing)?.certificate ?? null;
        let issued: { on: string; number: string; by_hand: boolean };
        const typed = cleanText(body.number, CLOSING_LIMITS.certificate);
        if (fromRegister && !typed)
          issued = { on: fromRegister.issued_on, number: fromRegister.number, by_hand: false };
        else {
          const on = pastDay(body.on, today) ?? today;
          if (!typed) throw invalid("Give the certificate number.");
          issued = { on, number: typed, by_hand: true };
        }
        closing.certificate = { ...issued, at, by };
        withKeyDates((service) =>
          service.done(
            allotmentOrigin,
            "share-certificates",
            {
              srn: "",
              challan: "",
              filed_on: issued.on,
              fee_paid: null,
              filed_file_id: null,
              note: `Certificate ${issued.number}`,
            },
            by,
          ),
        );
        return `Certificate ${issued.number}`;
      }
      case "refund": {
        if (closing.allotment)
          throw new Refused(
            409,
            "allotted",
            "Shares were allotted, so there is nothing to refund.",
          );
        const on = pastDay(body.on, today) ?? today;
        const amount = wholeAmount(body.amount, "Type the amount as a number, such as 2500000.");
        if (amount === null) throw invalid("Type the amount as a number, such as 2500000.");
        const currency = currencyOf(body.currency);
        const interest = wholeAmount(
          body.interest,
          "Type the interest as a whole number, or leave it blank.",
          0,
        );
        closing.refund = {
          on,
          amount,
          currency,
          interest,
          note: cleanText(body.note, CLOSING_LIMITS.note),
          at,
          by,
        };
        const why = `Refunded on ${dayWords(on)}.`;
        withKeyDates((service) => {
          service.takeBack(moneyOrigin, why, by);
          service.done(
            refundOrigin,
            "refund",
            {
              srn: "",
              challan: "",
              filed_on: on,
              fee_paid: null,
              filed_file_id: null,
              note: why,
            },
            by,
          );
        });
        try {
          if (members()?.forClosing(closingKey(closing.investor_id)))
            members()?.reverse(closingKey(closing.investor_id), why, by);
        } catch (error) {
          core.log(`closing: the register entry could not be reversed: ${errorName(error)}`);
        }
        return why;
      }
    }
  };

  core.route("POST", "/data/closing/:investorId/steps/:step", async (ctx) => {
    const by = ctx.staff();
    const closing = mustClosing(ctx.params[0]);
    const step = stepOf(ctx.params[1]);
    const detail = await recordStep(ctx, closing, step, by);
    touch(closing, by);
    save();
    log(closing.closing_id, step, detail, by);
    return stepAnswer(closing);
  });

  core.route("POST", "/data/closing/:investorId/steps/:step/clear", (ctx) => {
    const by = ctx.staff();
    const closing = mustClosing(ctx.params[0]);
    const step = stepOf(ctx.params[1]);
    const later = (LATER[step] ?? []).filter((key) => closing[key] !== null);
    if (later.length)
      throw new Refused(
        409,
        "later_steps",
        `Clear the later steps first: ${later.map((key) => lower(CLOSING_STEPS[key])).join(", ")}.`,
      );
    if (closing[step] === null) return stepAnswer(closing);
    const today = core.day();
    const why = `The ${lower(CLOSING_STEPS[step])} was cleared on ${dayWords(today)}.`;
    if (step === "money_received")
      withKeyDates((service) => {
        service.takeBack(originOf(closing.investor_id, "money"), why, by);
        service.takeBack(originOf(closing.investor_id, "refund"), why, by);
      });
    if (step === "allotment")
      withKeyDates((service) =>
        service.takeBack(originOf(closing.investor_id, "allotment"), why, by),
      );
    if (step === "register" && closing.register && !closing.register.by_hand)
      try {
        members()?.reverse(closingKey(closing.investor_id), why, by);
      } catch (error) {
        core.log(`closing: the register entry could not be reversed: ${errorName(error)}`);
      }
    (closing as Record<StepKey, unknown>)[step] = null;
    touch(closing, by);
    save();
    log(closing.closing_id, `${step}_cleared`, why, by);
    return { closing, key_dates: linksFor(closing) };
  });

  core.route("POST", "/data/closing/:investorId/key-dates", (ctx) => {
    const by = ctx.staff();
    const closing = mustClosing(ctx.params[0]);
    const service = keyDates();
    if (!service) throw new Refused(409, "key_dates_missing", KEY_DATES_MISSING);
    service.add(allItems(closing, residencyOf(closing), firmsRegisteredOn()), by);
    log(closing.closing_id, "dates_added", "Added the deadlines to Key dates", by);
    return { key_dates: linksFor(closing) };
  });

  core.route("POST", "/data/closing/:investorId/refund-date", (ctx) => {
    const by = ctx.staff();
    const closing = mustClosing(ctx.params[0]);
    const service = keyDates();
    if (!service) throw new Refused(409, "key_dates_missing", KEY_DATES_MISSING);
    const money = closing.money_received;
    if (!money) throw new Refused(409, "no_money", "Record the money received first.");
    if (closing.allotment || closing.refund)
      throw new Refused(409, "allotted", "Shares were allotted, so there is nothing to refund.");
    const allotBy = dueOf(service, "allotment", money.on);
    if (!allotBy || core.day() <= allotBy)
      throw new Refused(
        409,
        "not_yet",
        "The refund date is added once the day to allot by has passed.",
      );
    const item = refundItem(closing, service);
    if (item) service.add([item], by);
    log(closing.closing_id, "refund_date", "Added the refund date to Key dates", by);
    return { key_dates: linksFor(closing) };
  });

  // ---------------------------------------------------------------- test routes (§3.3)

  if (core.testRoutes) {
    let fakeKeyDates: ReturnType<typeof standInKeyDates> | null = null;
    let fakeMembers: ReturnType<typeof standInMembers> | null = null;
    let fakeMeetings: MeetingsLookup | null = null;

    core.route("POST", "/data/_test/closing/key-dates", (ctx) => {
      ctx.staff();
      const on = ctx.body.on !== false;
      const current = core.need<KeyDatesService>(COMPANY_SERVICES.keyDates);
      if (!on) {
        if (fakeKeyDates && current === fakeKeyDates) core.provide(COMPANY_SERVICES.keyDates, null);
        fakeKeyDates = null;
        return { installed: false, real: current !== null && current !== fakeKeyDates };
      }
      if (current && current !== fakeKeyDates) return { installed: false, real: true };
      if (!fakeKeyDates) fakeKeyDates = standInKeyDates();
      core.provide(COMPANY_SERVICES.keyDates, fakeKeyDates);
      return { installed: true, real: false };
    });
    core.route("GET", "/data/_test/closing/key-dates", () => {
      const current = core.need<KeyDatesService>(COMPANY_SERVICES.keyDates);
      if (current && current === fakeKeyDates) return { dates: fakeKeyDates.dates, real: false };
      return { dates: [], real: current !== null };
    });

    core.route("POST", "/data/_test/closing/members", (ctx) => {
      ctx.staff();
      const on = ctx.body.on !== false;
      const current = core.need<MembersRegister>(COMPANY_SERVICES.members);
      if (!on) {
        if (fakeMembers && current === fakeMembers) core.provide(COMPANY_SERVICES.members, null);
        fakeMembers = null;
        return { installed: false, real: current !== null && current !== fakeMembers };
      }
      if (current && current !== fakeMembers) return { installed: false, real: true };
      if (!fakeMembers) fakeMembers = standInMembers();
      core.provide(COMPANY_SERVICES.members, fakeMembers);
      return { installed: true, real: false };
    });
    core.route("GET", "/data/_test/closing/members", () => ({
      entries: fakeMembers?.entries ?? [],
      calls: fakeMembers?.calls ?? [],
    }));

    core.route("POST", "/data/_test/closing/meetings", (ctx) => {
      ctx.staff();
      const on = ctx.body.on !== false;
      const current = core.need<MeetingsLookup>(COMPANY_SERVICES.meetings);
      if (!on) {
        if (fakeMeetings && current === fakeMeetings) core.provide(COMPANY_SERVICES.meetings, null);
        fakeMeetings = null;
        return { installed: false, real: current !== null && current !== fakeMeetings };
      }
      if (current && current !== fakeMeetings) return { installed: false, real: true };
      const given = Array.isArray(ctx.body.resolutions) ? ctx.body.resolutions : [];
      const resolutions: ResolutionView[] = given
        .filter(
          (item): item is Record<string, unknown> => Boolean(item) && typeof item === "object",
        )
        .map((item, index) => ({
          resolution_id: isRouteId(item.resolution_id)
            ? item.resolution_id
            : `stand-in-resolution-${index + 1}`,
          meeting_id: clean(item.meeting_id, 64) || "stand-in-meeting",
          meeting_kind: (["board", "agm", "egm", "circular"] as const).includes(
            item.meeting_kind as "board",
          )
            ? (item.meeting_kind as "board")
            : "board",
          passed_on: clean(item.passed_on, 10) || core.day(),
          meeting_title: clean(item.meeting_title, 120) || "Walk board meeting",
          title: clean(item.title, 200) || "Walk resolution",
          kind: (["ordinary", "special", "board"] as const).includes(item.kind as "board")
            ? (item.kind as "board")
            : "board",
          href: "/data/company/meetings",
        }));
      fakeMeetings = standInMeetings(resolutions);
      core.provide(COMPANY_SERVICES.meetings, fakeMeetings);
      return { installed: true, real: false };
    });

    // Back to none, for a test that wants the chain from zero.
    core.route("POST", "/data/_test/closing/reset", (ctx) => {
      ctx.staff();
      closings.splice(0, closings.length);
      Object.assign(round, NO_ROUND);
      save();
      return { reset: true };
    });
  }
}
