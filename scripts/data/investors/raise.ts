/**
 * The raise's rules for what he types (raise spec §5.3): qualification, the introduction,
 * the wave, the offer deadline, the deck link and the round. Each reads the body through
 * `guard.ts` and says no in a sentence; the limits new to this batch are the constants
 * below. Nothing here touches a file or the clock: "today" is passed in.
 */

import { Refused } from "../../mail-merge/engine";
import { clean, cleanText, isDay } from "../guard";
import { httpsLinkOf } from "../raise-contracts";
import {
  CAP_BASIS,
  CURRENCIES,
  GEOGRAPHIES,
  INDIA_OK,
  INSTRUMENTS,
  INTRO_STATUSES,
  LEAD_OR_FOLLOW,
  RESIDENCY,
  STAGE_FOCUS,
} from "../../../src/lib/data/labels";
import { amountValue } from "./amount";
import {
  DEFAULT_INTRO,
  DEFAULT_PROFILE,
  type CapBasis,
  type Currency,
  type Geography,
  type Intro,
  type IntroStatus,
  type Investor,
  type LeadOrFollow,
  type Profile,
  type Residency,
  type Round,
  type StageFocus,
} from "./types";

export const SECTOR_LIMIT = 40;
export const MAX_SECTORS = 10;
export const CONFLICT_LIMIT = 200;
export const INTRODUCER_LIMIT = 120;
export const WAVE_LIMIT = 40;
export const ROUND_NAME_LIMIT = 80;
export const ROUND_NOTES_LIMIT = 4_000;
export const MAX_WAVE_FIRMS = 2_000;
export const MAX_DISCOUNT = 50;
/** Days before an offer deadline that it joins Due. */
export const OFFER_DUE_DAYS = 3;
export const DEFAULT_ROUND_NAME = "Pre-seed";

export const SENTENCES = {
  cheque: "Type the cheque as a number, such as 50000.",
  chequeCurrency: "Choose the cheque's currency.",
  chequeOrder: "The smallest cheque is more than the largest.",
  fromList: "Choose from the list.",
  sectors: "Ten sectors at most.",
  introStatus: "Choose the introduction's status.",
  introducer: "Say who makes the introduction.",
  contact: "That contact is not here.",
  future: "That day is in the future.",
  past: "That day is in the past.",
  notADay: "That is not a day.",
  deckLink: "Paste the whole link, starting https://.",
  instrument: "Choose the instrument.",
  cap: "Type the cap as a number, such as 5000000.",
  capCurrency: "Choose the cap's currency.",
  capBasis: "Say whether the cap is post-money or pre-money.",
  discount: "Type the discount as a number from 1 to 50.",
  minimum: "Type the smallest cheque as a number, such as 25000.",
  minimumCurrency: "Choose the smallest cheque's currency.",
  leadFirm: "That firm is not here.",
} as const;

const invalid = (sentence: string): Refused => new Refused(400, "invalid", sentence);

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** A body value as a list of strings: a form sends one value or several. */
function listOf(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string");
  if (typeof value === "string" && value.trim()) return [value];
  return [];
}

/** Keys of one vocabulary, repeats dropped, in the vocabulary's own order. */
function keysOf<K extends string>(value: unknown, table: Readonly<Record<K, string>>): K[] {
  const given = new Set(listOf(value).map((item) => clean(item, 40)));
  for (const key of given) if (!(key in table)) throw invalid(SENTENCES.fromList);
  return (Object.keys(table) as K[]).filter((key) => given.has(key));
}

function oneOf<K extends string>(value: unknown, table: Readonly<Record<K, string>>): K | "" {
  const key = clean(value, 40);
  if (!key) return "";
  if (!(key in table)) throw invalid(SENTENCES.fromList);
  return key as K;
}

const currencyOf = (value: unknown): Currency | null => {
  const code = clean(value, 3).toUpperCase();
  return (CURRENCIES as readonly string[]).includes(code) ? (code as Currency) : null;
};

/** "fintech, data, AI": trimmed, cut to 40, empties and repeats (any case) dropped. */
export function sectorsOf(value: unknown): string[] {
  const text = typeof value === "string" ? value : listOf(value).join(",");
  const seen = new Set<string>();
  const sectors: string[] = [];
  for (const part of text.split(",")) {
    const sector = cleanText(part, SECTOR_LIMIT);
    if (!sector || seen.has(sector.toLowerCase())) continue;
    seen.add(sector.toLowerCase());
    sectors.push(sector);
  }
  if (sectors.length > MAX_SECTORS) throw invalid(SENTENCES.sectors);
  return sectors;
}

/** The "Qualify" form's body as a profile; blank means not known. */
export function profileOf(body: Record<string, unknown>): Profile {
  const blank = (value: unknown) => clean(typeof value === "number" ? String(value) : value, 40);
  const minText = blank(body.cheque_min);
  const maxText = blank(body.cheque_max);
  let cheque: Profile["cheque"] = null;
  if (minText || maxText) {
    const min = minText ? amountValue(minText) : null;
    const max = maxText ? amountValue(maxText) : null;
    if ((minText && min === null) || (maxText && max === null)) throw invalid(SENTENCES.cheque);
    const currency = currencyOf(body.cheque_currency);
    if (!currency) throw invalid(SENTENCES.chequeCurrency);
    if (min !== null && max !== null && min > max) throw invalid(SENTENCES.chequeOrder);
    cheque = { min, max, currency };
  }
  const india = oneOf(body.india_ok, INDIA_OK);
  return {
    cheque,
    stages: keysOf<StageFocus>(body.stages, STAGE_FOCUS),
    sectors: sectorsOf(body.sectors),
    geography: keysOf<Geography>(body.geography, GEOGRAPHIES),
    lead: oneOf<LeadOrFollow>(body.lead, LEAD_OR_FOLLOW),
    conflict: cleanText(body.conflict, CONFLICT_LIMIT),
    residency: oneOf<Residency>(body.residency, RESIDENCY),
    india_ok: india,
  };
}

/**
 * The "Introduction" form's body. `contact` answers a contact's name when one is chosen
 * and the contacts directory is here; `null` when it is not here (the id is then not kept).
 */
export function introOf(
  body: Record<string, unknown>,
  today: string,
  contact: ((contactId: string) => { name: string } | null) | null,
): Intro {
  const status = clean(body.status, 20);
  if (!(status in INTRO_STATUSES)) throw invalid(SENTENCES.introStatus);
  let introducer = cleanText(body.introducer, INTRODUCER_LIMIT);
  let contact_id: string | null = null;
  const chosen = clean(body.contact_id, 64);
  if (chosen && contact) {
    const found = contact(chosen);
    if (!found) throw new Refused(404, "not_found", SENTENCES.contact);
    contact_id = chosen;
    if (!introducer) introducer = clean(found.name, INTRODUCER_LIMIT);
  }
  if ((status === "to_ask" || status === "asked" || status === "made") && !introducer)
    throw invalid(SENTENCES.introducer);
  const onText = clean(body.on, 10);
  let on = today;
  if (onText) {
    if (!isDay(onText)) throw invalid(SENTENCES.notADay);
    if (onText > today) throw invalid(SENTENCES.future);
    on = onText;
  }
  return { status: status as IntroStatus, introducer, contact_id, on };
}

export const waveOf = (value: unknown): string => cleanText(value, WAVE_LIMIT);

/** Blank clears; otherwise a day that is not before today. */
export function offerDeadlineOf(value: unknown, today: string): string | null {
  const text = clean(value, 10);
  if (!text) return null;
  if (!isDay(text)) throw invalid(SENTENCES.notADay);
  if (text < today) throw invalid(SENTENCES.past);
  return text;
}

/** Blank clears; otherwise the whole https link. */
export function deckLinkOf(value: unknown): string {
  if (!clean(value, 600)) return "";
  const link = httpsLinkOf(value);
  if (!link) throw invalid(SENTENCES.deckLink);
  return link;
}

const truthy = (value: unknown): boolean =>
  value === true || value === "on" || value === "yes" || value === "true" || value === "1";

const amountText = (value: unknown): string =>
  clean(typeof value === "number" ? String(value) : value, 40);

/** The round's form, as a record; `firmHere` says whether a lead firm is on the list. */
export function roundOf(
  body: Record<string, unknown>,
  firmHere: (investorId: string) => boolean,
): Omit<Round, "round_id" | "updated_at" | "updated_by"> {
  const name = cleanText(body.name, ROUND_NAME_LIMIT) || DEFAULT_ROUND_NAME;
  const instrument = clean(body.instrument, 40);
  if (!(INSTRUMENTS as readonly string[]).includes(instrument)) throw invalid(SENTENCES.instrument);

  let cap: Round["cap"] = null;
  const capText = amountText(body.cap_amount);
  if (capText) {
    const amount = amountValue(capText);
    if (amount === null) throw invalid(SENTENCES.cap);
    const currency = currencyOf(body.cap_currency);
    if (!currency) throw invalid(SENTENCES.capCurrency);
    const basis = clean(body.cap_basis, 20);
    if (!(basis in CAP_BASIS)) throw invalid(SENTENCES.capBasis);
    cap = { amount, currency, basis: basis as CapBasis };
  }

  let discount_percent: number | null = null;
  const discountText = amountText(body.discount);
  if (discountText) {
    const value = Number(discountText);
    if (!/^\d{1,2}(\.\d)?$/.test(discountText) || !(value > 0 && value <= MAX_DISCOUNT))
      throw invalid(SENTENCES.discount);
    discount_percent = value;
  }

  let minimum_cheque: Round["minimum_cheque"] = null;
  const minimumText = amountText(body.minimum_amount);
  if (minimumText) {
    const amount = amountValue(minimumText);
    if (amount === null) throw invalid(SENTENCES.minimum);
    const currency = currencyOf(body.minimum_currency);
    if (!currency) throw invalid(SENTENCES.minimumCurrency);
    minimum_cheque = { amount, currency };
  }

  const openedText = clean(body.opened_on, 10);
  if (openedText && !isDay(openedText)) throw invalid(SENTENCES.notADay);

  const leadText = clean(body.lead, 3) || "no";
  if (leadText !== "yes" && leadText !== "no") throw invalid(SENTENCES.fromList);
  let lead_investor_id: string | null = null;
  const firm = clean(body.lead_investor_id, 64);
  if (leadText === "yes" && firm) {
    if (!firmHere(firm)) throw new Refused(404, "not_found", SENTENCES.leadFirm);
    lead_investor_id = firm;
  }

  return {
    name,
    instrument: instrument as Round["instrument"],
    cap,
    discount_percent,
    mfn: truthy(body.mfn),
    minimum_cheque,
    opened_on: openedText || null,
    lead: leadText,
    lead_investor_id,
    notes: cleanText(body.notes, ROUND_NOTES_LIMIT),
  };
}

/** The round's fields in words, as "What changed" names them. */
export const ROUND_FIELD_WORDS: Readonly<Record<string, string>> = {
  name: "Name",
  instrument: "Instrument",
  cap: "Valuation cap",
  discount_percent: "Discount",
  mfn: "Most favoured nation",
  minimum_cheque: "Smallest cheque",
  opened_on: "Open since",
  lead: "Lead",
  lead_investor_id: "Lead firm",
  notes: "Notes",
};

/** Which fields differ between two saves of the round, in words; the first save names what it set. */
export function roundChanges(before: Round | null, after: Round): string[] {
  const changed: string[] = [];
  for (const [key, words] of Object.entries(ROUND_FIELD_WORDS)) {
    const now = (after as Record<string, unknown>)[key];
    if (before === null) {
      const blank = now === null || now === "" || now === false || (key === "lead" && now === "no");
      if (!blank) changed.push(words);
      continue;
    }
    const then = (before as Record<string, unknown>)[key];
    if (JSON.stringify(then) !== JSON.stringify(now)) changed.push(words);
  }
  return changed;
}

// ------------------------------------------------------------------ the migration

const STAGE_FOCUS_KEYS = new Set(Object.keys(STAGE_FOCUS));
const GEOGRAPHY_KEYS = new Set(Object.keys(GEOGRAPHIES));

function storedProfile(value: unknown): Profile {
  if (!isObject(value)) return { ...DEFAULT_PROFILE, stages: [], sectors: [], geography: [] };
  const cheque = isObject(value.cheque) ? value.cheque : null;
  const bound = (item: unknown) =>
    typeof item === "number" && Number.isFinite(item) ? item : null;
  const strings = (item: unknown) =>
    Array.isArray(item) ? item.filter((entry): entry is string => typeof entry === "string") : [];
  const text = (item: unknown) => (typeof item === "string" ? item : "");
  return {
    cheque:
      cheque && (currencyOf(cheque.currency) ?? null)
        ? {
            min: bound(cheque.min),
            max: bound(cheque.max),
            currency: currencyOf(cheque.currency) as Currency,
          }
        : null,
    stages: strings(value.stages).filter((key): key is StageFocus => STAGE_FOCUS_KEYS.has(key)),
    sectors: strings(value.sectors),
    geography: strings(value.geography).filter((key): key is Geography => GEOGRAPHY_KEYS.has(key)),
    lead: (text(value.lead) in LEAD_OR_FOLLOW ? text(value.lead) : "") as Profile["lead"],
    conflict: text(value.conflict),
    residency: (text(value.residency) in RESIDENCY
      ? text(value.residency)
      : "") as Profile["residency"],
    india_ok: (text(value.india_ok) in INDIA_OK ? text(value.india_ok) : "") as Profile["india_ok"],
  };
}

function storedIntro(value: unknown): Intro {
  if (!isObject(value)) return { ...DEFAULT_INTRO };
  const status = typeof value.status === "string" ? value.status : "";
  return {
    status: (status in INTRO_STATUSES ? status : "none") as IntroStatus,
    introducer: typeof value.introducer === "string" ? value.introducer : "",
    contact_id: typeof value.contact_id === "string" ? value.contact_id : null,
    on: isDay(value.on) ? value.on : null,
  };
}

/**
 * A stored firm as this batch reads it (format 1 or 2): every field it has is kept as it
 * is, and each new field that is missing or the wrong type gets its default. Nothing is
 * written here; the next save writes format 2.
 */
export function withDefaults(raw: Investor | Record<string, unknown>): Investor {
  const stored = raw as Record<string, unknown>;
  return {
    ...(stored as Investor),
    profile: storedProfile(stored.profile),
    intro: storedIntro(stored.intro),
    wave: typeof stored.wave === "string" ? stored.wave : "",
    offer_deadline: isDay(stored.offer_deadline) ? stored.offer_deadline : null,
    deck_link: typeof stored.deck_link === "string" ? stored.deck_link : "",
  };
}
