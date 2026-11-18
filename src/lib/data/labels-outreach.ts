/**
 * The words of the delivery batch's Data half (ws-notes/delivery/spec.md §5.7, §7.4, §7.5):
 * where a lead is and which law that points at, the delivery filter on All leads, and the
 * Batches page. Pure, with no `server-only`: the Data worker imports it relatively, as it
 * does `labels.ts`. Nothing here asks anyone for anything: it reads what HQ already holds.
 */

import type { DeliveryStanding, RecipientStanding } from "../merge/delivery-contracts";

// ------------------------------------------------------------------ where a lead is

export type WhereKey = "us" | "uk" | "eu" | "in" | "elsewhere" | "unknown";

/** After each law line, always. */
export const NOT_LEGAL_ADVICE = "Not legal advice.";

export const WHERE: Record<WhereKey, { label: string; law: string }> = {
  us: {
    label: "United States",
    law: "CAN-SPAM covers business email too: a postal address, a clear way out, opt-outs honoured within 10 business days.",
  },
  uk: {
    label: "United Kingdom",
    law: "PECR: companies need no consent for business email, but sole traders and some partnerships do.",
  },
  eu: {
    label: "European Union and EEA",
    law: "GDPR applies to named people at firms.",
  },
  in: {
    label: "India",
    law: "The DPDP Act's consent and notice duties apply from 13 May 2027.",
  },
  elsewhere: { label: "Elsewhere", law: "No rule is suggested for this country." },
  unknown: { label: "Not known", law: "No rule is suggested for this country." },
};

export const WHERE_ORDER: readonly WhereKey[] = ["us", "uk", "eu", "in", "elsewhere", "unknown"];

export const isWhereKey = (value: unknown): value is WhereKey =>
  typeof value === "string" && Object.hasOwn(WHERE, value);

/** The law line as a page prints it: one line, ending "Not legal advice." */
export const lawLineOf = (where: WhereKey): string => `${WHERE[where].law} ${NOT_LEGAL_ADVICE}`;

const US = ["usa", "us", "united states", "united states of america", "america"];
const UK = [
  "uk",
  "united kingdom",
  "great britain",
  "britain",
  "england",
  "scotland",
  "wales",
  "northern ireland",
];
/** The 27 members by their English names, then Iceland, Liechtenstein and Norway. */
const EU = [
  "austria",
  "belgium",
  "bulgaria",
  "croatia",
  "cyprus",
  "czech republic",
  "czechia",
  "denmark",
  "estonia",
  "finland",
  "france",
  "germany",
  "greece",
  "hungary",
  "ireland",
  "republic of ireland",
  "italy",
  "latvia",
  "lithuania",
  "luxembourg",
  "malta",
  "netherlands",
  "the netherlands",
  "poland",
  "portugal",
  "romania",
  "slovakia",
  "slovenia",
  "spain",
  "sweden",
  "iceland",
  "liechtenstein",
  "norway",
];
const IN = ["india", "bharat"];

const WHERE_BY_COUNTRY: ReadonlyMap<string, WhereKey> = new Map<string, WhereKey>([
  ...US.map((name): [string, WhereKey] => [name, "us"]),
  ...UK.map((name): [string, WhereKey] => [name, "uk"]),
  ...EU.map((name): [string, WhereKey] => [name, "eu"]),
  ...IN.map((name): [string, WhereKey] => [name, "in"]),
]);

/**
 * Where a lead is, from the country field alone: trimmed, lower-cased, dots removed. Never
 * guessed from the address's ending. Anything not recognised is "elsewhere"; empty is
 * "unknown".
 */
export function whereOf(country: unknown): WhereKey {
  if (typeof country !== "string") return "unknown";
  const name = country.trim().toLowerCase().replace(/\./g, "").replace(/\s+/g, " ");
  if (name === "") return "unknown";
  return WHERE_BY_COUNTRY.get(name) ?? "elsewhere";
}

// ------------------------------------------------------------------ delivery, as a filter

export type DeliveryFilter = "delivered" | "didnt_arrive" | "not_yet" | "not_read";

export const DELIVERY_FILTERS: Record<DeliveryFilter, string> = {
  delivered: "Delivered",
  didnt_arrive: "Didn't arrive",
  not_yet: "Not delivered yet",
  not_read: "Not read yet",
};

export const DELIVERY_FILTER_ORDER: readonly DeliveryFilter[] = [
  "delivered",
  "didnt_arrive",
  "not_yet",
  "not_read",
];

export const isDeliveryFilter = (value: unknown): value is DeliveryFilter =>
  typeof value === "string" && Object.hasOwn(DELIVERY_FILTERS, value);

const NOT_YET: ReadonlySet<DeliveryStanding> = new Set<DeliveryStanding>(["not_yet", "deferred"]);

/**
 * The filter value of a lead's newest send: delivered; the five failures; not yet (or
 * delayed); "not read" when they were written to but nothing was read about it; and no
 * value ("") for someone never written to.
 */
export function deliveryFilterOf(
  standing: Pick<RecipientStanding, "delivery"> | null,
  written: boolean,
): DeliveryFilter | "" {
  if (standing === null) return written ? "not_read" : "";
  if (standing.delivery === "delivered") return "delivered";
  return NOT_YET.has(standing.delivery) ? "not_yet" : "didnt_arrive";
}

/** A lead never written to, and one written to whose delivery nobody has read. */
export const NOT_WRITTEN_TO = "Not written to";
export const NOT_READ_YET = "Not read yet";
export const DELIVERY_NOT_READ_LINE = "Delivery not read yet";

// ------------------------------------------------------------------ consent and source

export const CONSENT_TITLE = "Consent and source";
export const CONSENT_NOTE = "Read from what HQ already holds: nothing here is asked of anyone.";
export const CAME_FROM_GONE = "Written to from a list that is no longer there";
export const NOT_ON_STOP_LIST = "Not on the stop list";

/** The stop list's entry in words, by its reason, with the day it went on. */
export function stopWordsOf(reason: string, dayWords: string): string {
  switch (reason) {
    case "asked":
      return `Asked to stop on ${dayWords}`;
    case "bounced":
      return `Bounced on ${dayWords} (not an opt-out)`;
    case "blocked":
      return `Refused by the provider on ${dayWords}`;
    default:
      return `Kept off by hand on ${dayWords}`;
  }
}

// ------------------------------------------------------------------ the Batches page

export const DELIVERY_NOT_LOADED = "Delivery is read by Mail merge; it is not loaded here.";
export const DELIVERY_NEVER_READ = "Delivery has not been read yet.";
export const DELIVERY_NEVER_READ_LONG =
  "Delivery has not been read yet. Mail merge reads it from the provider every 30 minutes.";
export const NOTHING_SENT_THIS_WEEK = "Nothing was sent for real in the last 7 days.";

/** "{n} addresses from before delivery was first read wait for your say in Mail merge." */
export const waitingWords = (waiting: number, count: string): string =>
  `${count} ${waiting === 1 ? "address" : "addresses"} from before delivery was first read ${
    waiting === 1 ? "waits" : "wait"
  } for your say in `;

export const BATCHES = {
  title: "Batches",
  about:
    "Each mailing sent for real, from Mail merge's record to the waitlist. Accepted means the provider took the message; delivered is what it said happened next. Replies count people who answered; a person who answered twice counts under each answer. Yeses from investor firms go to Investors, whose Funnel follows them.",
  emptyTitle: "No batch yet",
  emptyBody: "Each mailing sent for real from Mail merge appears here, with what happened to it.",
  notRead: "Not read",
  gone: "No longer in Mail merge",
  total: "All batches",
  notFromABatch: "Not from a batch",
  outcomesTitle: "Replies by outcome",
  outcomesNote:
    "A person who answered twice counts under each answer, so these do not add up to Replied.",
  repliesNotLoaded: "Replies are not loaded here, so nobody is counted as having replied.",
  waitlistNotLoaded: "The waitlist is not loaded here, so no firm is counted as having joined.",
} as const;
