/**
 * The seam of the delivery batch (ws-notes/delivery/spec.md §3): what the provider's own
 * delivery events mean once they are read back; the files the sender keeps them in, under
 * `delivery/` in Mail merge's folder; what the Data worker's `delivery` service answers; the
 * arithmetic and the words both units print; and the stand-in provider's event mix, which
 * every test and walk uses so both units count the same people the same way.
 *
 * Pure: nothing here touches a file, a socket or the clock, and it imports nothing, so the
 * sender (`scripts/mail-merge`), the Data worker (`scripts/data`) and the portal (`src/`) all
 * import this one file. Both copies hold it byte for byte. Opens and clicks are never kept:
 * privacy features open mail by themselves, so they say nothing about interest.
 */

// ------------------------------------------------------------------ names and files

/** The Data worker's read of the sender's delivery files, by the name it is provided under. */
export const DELIVERY_SERVICE = "delivery";

/** Inside Mail merge's folder. The sender writes them; Data only reads them. */
export const DELIVERY_STATE_FILE = "delivery/state.json";
export const DELIVERY_APPLIED_FILE = "delivery/applied.jsonl";
export const DELIVERY_MAILINGS_DIR = "delivery/mailings";
export const deliveryMailingFile = (mailingId: string): string =>
  `${DELIVERY_MAILINGS_DIR}/${mailingId}.json`;

/** Every live message carries this tag and its mailing's; a test of the wording carries "test". */
export const MERGE_TAG = "hq-mail-merge";
export const TEST_TAG = "test";
/** A mailing's own tag: the first eight characters of its id (engine.ts, `step`). */
export const mailingTagOf = (mailingId: string): string => mailingId.slice(0, 8);

// ------------------------------------------------------------------ what an event means

/** The provider events HQ keeps, in its own words. Everything else is dropped unread. */
export const DELIVERY_KINDS = [
  "delivered",
  "deferred",
  "soft_bounce",
  "hard_bounce",
  "blocked",
  "invalid",
  "error",
  "complaint",
  "unsubscribed",
] as const;
export type DeliveryKind = (typeof DELIVERY_KINDS)[number];
/** What a person did with a message that reached them. */
export type Reaction = "complaint" | "unsubscribed";
/** What happened to a message on its way to the mailbox. */
export type DeliveryStep = Exclude<DeliveryKind, Reaction>;
export const isDeliveryStep = (kind: DeliveryKind): kind is DeliveryStep =>
  kind !== "complaint" && kind !== "unsubscribed";

/** The kinds that put an address on Mail merge's stop list, with the stop list's own reason. */
export type StopKind = "hard_bounce" | "invalid" | "complaint" | "unsubscribed";
export const STOP_REASON_OF: Readonly<Record<StopKind, "bounced" | "asked">> = {
  hard_bounce: "bounced",
  invalid: "bounced",
  complaint: "asked",
  unsubscribed: "asked",
};
export const isStopKind = (kind: DeliveryKind): kind is StopKind =>
  kind === "hard_bounce" || kind === "invalid" || kind === "complaint" || kind === "unsubscribed";

const KIND_BY_NAME: ReadonlyMap<string, DeliveryKind> = new Map<string, DeliveryKind>([
  ["delivered", "delivered"],
  ["deferred", "deferred"],
  ["softbounce", "soft_bounce"],
  ["softbounces", "soft_bounce"],
  ["bounce", "soft_bounce"],
  ["bounces", "soft_bounce"],
  ["hardbounce", "hard_bounce"],
  ["hardbounces", "hard_bounce"],
  ["blocked", "blocked"],
  ["invalid", "invalid"],
  ["invalidemail", "invalid"],
  ["error", "error"],
  ["spam", "complaint"],
  ["complaint", "complaint"],
  ["complaints", "complaint"],
  ["unsubscribed", "unsubscribed"],
  ["unsubscribe", "unsubscribed"],
]);

/**
 * The provider's event name as HQ's kind, ignoring case and anything not a letter; null for
 * an event HQ does not keep ("requests", "opened", "clicks", "loadedByProxy", any new one). A
 * bounce that does not say which kind is read as a soft bounce: listed, never stopped.
 */
export function deliveryKindOf(providerEvent: unknown): DeliveryKind | null {
  if (typeof providerEvent !== "string") return null;
  return KIND_BY_NAME.get(providerEvent.toLowerCase().replace(/[^a-z]/g, "")) ?? null;
}

/** An instant the provider wrote, as an ISO string in UTC; null when it is not one. */
export function isoOf(value: unknown): string | null {
  if (typeof value !== "string" || value.trim() === "") return null;
  const at = new Date(value.trim());
  return Number.isNaN(at.getTime()) ? null : at.toISOString();
}

/** A message id as both sides write it: no angle brackets, no spaces, lower case. */
export function messageIdKey(value: unknown): string {
  if (typeof value !== "string") return "";
  return value
    .trim()
    .replace(/^<+|>+$/g, "")
    .trim()
    .toLowerCase();
}

/** The provider's words for a failure, with any address taken out, at most 200 characters. */
export function redactReason(value: unknown): string {
  if (typeof value !== "string") return "";
  return value
    .replace(/[^\s<>()[\]"',;:]+@[^\s<>()[\]"',;:]+/g, "[address]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200);
}

// ------------------------------------------------------------------ the files

/** One event kept for one recipient; `at` is the provider's own time, in UTC. */
export type DeliveryEvent = { kind: DeliveryKind; at: string; reason: string };

export type DeliveryRecipient = {
  /** The address as Mail merge sent to it (already normalised). */
  email: string;
  /** The provider's id for the message (`messageIdKey`); "" when the send's answer was lost. */
  message_id: string;
  /** When Mail merge handed it over: the run log's outcome time. */
  sent_at: string;
  /** Oldest first; at most one of each kind at each time. */
  events: DeliveryEvent[];
};

/** `delivery/mailings/<mailing id>.json`, rewritten whole when anything in it changes. */
export type MailingDeliveryFile = {
  format: 1;
  mailing_id: string;
  /** The mailing's name when last written: kept after the mailing itself is deleted. */
  name: string;
  /** Every live send the provider accepted, or may have (no answer), in send order. */
  recipients: DeliveryRecipient[];
  /** The last read whose events reached this mailing; null before the first. */
  read_at: string | null;
};

export type ReadScope = "first" | "recent" | "older" | "now";
export type ReadOutcome = "ok" | "partial" | "no_key" | "refused" | "unreachable" | "slowed";

/** `delivery/state.json`. */
export type DeliveryStateFile = {
  format: 1;
  /** Fixed once: events at or after it put addresses on the stop list by themselves. */
  auto_stop_from: string;
  /** When he pressed "Apply to the stop list" for the earlier ones; null until he does. */
  backlog_applied_at: string | null;
  last_read: {
    at: string;
    scope: ReadScope;
    days: number;
    pages: number;
    /** Events kept: about HQ's own live mail, of a kind HQ keeps. */
    kept: number;
    outcome: ReadOutcome;
    /** A sentence for the page; "" when the read went well. */
    detail: string;
  } | null;
  last_recent_at: string | null;
  last_older_at: string | null;
  /** A read cut short (a restart, the hour's budget): it carries on from `offset`. */
  in_progress: { scope: ReadScope; days: number; offset: number; started_at: string } | null;
  /** No read before this instant: the provider asked HQ to slow down. */
  wait_until: string | null;
  /** Each request made to the provider in the last hour, for the hour's budget. */
  requests: string[];
  /** False once the provider refused the tag filter: reads then filter on this side alone. */
  tags_filter: boolean;
};

/** One line of `delivery/applied.jsonl`: what the read-back did to the stop list, once per event. */
export type AppliedStop = {
  email: string;
  kind: StopKind;
  mailing_id: string;
  /** The event's own time, which is the stop's "since". */
  at: string;
  applied_at: string;
  result: "added" | "already";
  how: "auto" | "press";
};
export const appliedKeyOf = (line: Pick<AppliedStop, "email" | "kind" | "at">): string =>
  `${line.email}|${line.kind}|${line.at}`;

// ------------------------------------------------------------------ one recipient's standing

export type DeliveryStanding = DeliveryStep | "not_yet";

export type RecipientStanding = {
  delivery: DeliveryStanding;
  delivery_at: string | null;
  /** The provider's reason for a failure; "" for none, and for anything that arrived. */
  reason: string;
  reaction: Reaction | null;
  reaction_at: string | null;
  /** In one word on a page: the reaction when there is one, else the delivery. */
  shown: DeliveryStanding | Reaction;
};

/** How far a message got: a higher rank wins; between equals, the later event wins. */
export const STEP_RANK: Readonly<Record<DeliveryStep, number>> = {
  deferred: 1,
  error: 2,
  soft_bounce: 3,
  blocked: 4,
  invalid: 5,
  delivered: 6,
  hard_bounce: 7,
};

/** A reaction proves the message arrived, whatever else was (or was not yet) said. */
const UPGRADED_BY_A_REACTION: ReadonlySet<DeliveryStanding> = new Set<DeliveryStanding>([
  "not_yet",
  "deferred",
  "error",
  "soft_bounce",
]);
const FAILED: ReadonlySet<DeliveryStanding> = new Set<DeliveryStanding>([
  "soft_bounce",
  "hard_bounce",
  "blocked",
  "invalid",
  "error",
]);

export function standingOf(events: readonly DeliveryEvent[]): RecipientStanding {
  let best: { kind: DeliveryStep; at: string; reason: string } | null = null;
  let complaintAt: string | null = null;
  let unsubscribedAt: string | null = null;
  for (const event of events) {
    const kind = event.kind;
    if (kind === "complaint") {
      if (complaintAt === null || event.at < complaintAt) complaintAt = event.at;
    } else if (kind === "unsubscribed") {
      if (unsubscribedAt === null || event.at < unsubscribedAt) unsubscribedAt = event.at;
    } else if (
      best === null ||
      STEP_RANK[kind] > STEP_RANK[best.kind] ||
      (STEP_RANK[kind] === STEP_RANK[best.kind] && event.at > best.at)
    ) {
      best = { kind, at: event.at, reason: event.reason };
    }
  }
  const reaction: Reaction | null =
    complaintAt !== null ? "complaint" : unsubscribedAt !== null ? "unsubscribed" : null;
  const reactionAt = complaintAt ?? unsubscribedAt;
  let delivery: DeliveryStanding = best ? best.kind : "not_yet";
  let deliveryAt = best ? best.at : null;
  if (reaction !== null && UPGRADED_BY_A_REACTION.has(delivery)) {
    delivery = "delivered";
    deliveryAt = reactionAt;
  }
  return {
    delivery,
    delivery_at: deliveryAt,
    reason: best !== null && FAILED.has(delivery) ? best.reason : "",
    reaction,
    reaction_at: reactionAt,
    shown: reaction ?? delivery,
  };
}

/** Soft bounces, blocked and "not sent by the provider": a retry may reach them; nobody is stopped. */
export const isRetry = (delivery: DeliveryStanding): boolean =>
  delivery === "soft_bounce" || delivery === "blocked" || delivery === "error";

// ------------------------------------------------------------------ counting

export type DeliveryCounts = {
  /** Every send the provider accepted, or may have: the denominator of "delivered". */
  accepted: number;
  delivered: number;
  /** No word yet, or delayed: still on its way. */
  not_yet: number;
  soft_bounce: number;
  hard_bounce: number;
  blocked: number;
  invalid: number;
  error: number;
  /** soft_bounce + hard_bounce + blocked + invalid + error. */
  didnt_arrive: number;
  /** Of the delivered, reported as spam (someone who also unsubscribed is counted here only). */
  complaint: number;
  /** Of the delivered, unsubscribed through the provider. */
  unsubscribed: number;
  /** soft_bounce + blocked + error: whom a retry would go to, before the stop list. */
  retry: number;
};

const COUNT_KEYS = [
  "accepted",
  "delivered",
  "not_yet",
  "soft_bounce",
  "hard_bounce",
  "blocked",
  "invalid",
  "error",
  "didnt_arrive",
  "complaint",
  "unsubscribed",
  "retry",
] as const satisfies readonly (keyof DeliveryCounts)[];

export const NO_COUNTS: DeliveryCounts = {
  accepted: 0,
  delivered: 0,
  not_yet: 0,
  soft_bounce: 0,
  hard_bounce: 0,
  blocked: 0,
  invalid: 0,
  error: 0,
  didnt_arrive: 0,
  complaint: 0,
  unsubscribed: 0,
  retry: 0,
};

export function countsOf(standings: readonly RecipientStanding[]): DeliveryCounts {
  const counts: DeliveryCounts = { ...NO_COUNTS };
  for (const standing of standings) {
    counts.accepted += 1;
    switch (standing.delivery) {
      case "delivered":
        counts.delivered += 1;
        break;
      case "not_yet":
      case "deferred":
        counts.not_yet += 1;
        break;
      default:
        counts[standing.delivery] += 1;
    }
    if (standing.reaction === "complaint") counts.complaint += 1;
    else if (standing.reaction === "unsubscribed") counts.unsubscribed += 1;
  }
  counts.didnt_arrive =
    counts.soft_bounce + counts.hard_bounce + counts.blocked + counts.invalid + counts.error;
  counts.retry = counts.soft_bounce + counts.blocked + counts.error;
  return counts;
}

export function addCounts(a: DeliveryCounts, b: DeliveryCounts): DeliveryCounts {
  const sum: DeliveryCounts = { ...NO_COUNTS };
  for (const key of COUNT_KEYS) sum[key] = a[key] + b[key];
  return sum;
}

/** One mailing's file as a summary; null when it holds no accepted send. */
export type MailingDelivery = {
  mailing_id: string;
  name: string;
  first_sent_at: string;
  last_sent_at: string;
  read_at: string | null;
  counts: DeliveryCounts;
};

export function mailingDeliveryOf(file: MailingDeliveryFile): MailingDelivery | null {
  if (file.recipients.length === 0) return null;
  const times = file.recipients.map((recipient) => recipient.sent_at).sort();
  return {
    mailing_id: file.mailing_id,
    name: file.name,
    first_sent_at: times[0] ?? "",
    last_sent_at: times[times.length - 1] ?? "",
    read_at: file.read_at,
    counts: countsOf(file.recipients.map((recipient) => standingOf(recipient.events))),
  };
}

/** Every recipient handed over at or after `at` (an instant), across the files. */
export function countsSince(files: readonly MailingDeliveryFile[], at: string): DeliveryCounts {
  const standings: RecipientStanding[] = [];
  for (const file of files)
    for (const recipient of file.recipients)
      if (recipient.sent_at >= at) standings.push(standingOf(recipient.events));
  return countsOf(standings);
}

// ------------------------------------------------------------------ words

export const countWords = (value: number): string => value.toLocaleString("en-GB");
export const ofWords = (part: number, whole: number): string =>
  `${countWords(part)} of ${countWords(whole)}`;

/** "2.7 per cent" at or above one, "0.34 per cent" below; "" when there is nothing to divide by. */
export function perCentWords(part: number, whole: number): string {
  if (whole <= 0) return "";
  const value = (part * 100) / whole;
  const text =
    value >= 1
      ? (Math.round(value * 10) / 10).toFixed(1)
      : (Math.round(value * 100) / 100).toFixed(2);
  return `${text} per cent`;
}

export type DeliveryTone = "live" | "attention" | "danger" | "neutral";

export const DELIVERY_WORDS: Readonly<
  Record<DeliveryStanding | Reaction, { label: string; tone: DeliveryTone; hint: string }>
> = {
  delivered: { label: "Delivered", tone: "live", hint: "The receiving server took it." },
  not_yet: { label: "Not delivered yet", tone: "neutral", hint: "No word from the provider yet." },
  deferred: {
    label: "Delayed",
    tone: "attention",
    hint: "The receiving server asked the provider to try again later.",
  },
  soft_bounce: {
    label: "Soft bounce",
    tone: "attention",
    hint: "A passing failure, such as a full mailbox. Worth one retry.",
  },
  hard_bounce: {
    label: "Hard bounce",
    tone: "danger",
    hint: "The address does not take mail. It goes on the stop list.",
  },
  blocked: {
    label: "Blocked by the provider",
    tone: "attention",
    hint: "The provider would not send to it, usually after an earlier bounce or complaint.",
  },
  invalid: {
    label: "Not a working address",
    tone: "danger",
    hint: "The provider found the address cannot take mail. It goes on the stop list.",
  },
  error: {
    label: "Not sent by the provider",
    tone: "attention",
    hint: "Accepted, then not sent, as happened when the plan ran out of sends.",
  },
  complaint: {
    label: "Marked as spam",
    tone: "danger",
    hint: "They reported it as spam. They go on the stop list.",
  },
  unsubscribed: {
    label: "Unsubscribed",
    tone: "neutral",
    hint: "They unsubscribed through the provider. They go on the stop list.",
  },
};

/** The stop list's detail line for an address the read-back stopped. */
export const stopDetailOf = (kind: StopKind, mailing: string): string =>
  `${DELIVERY_WORDS[kind].label} · ${mailing}`.slice(0, 120);

// ------------------------------------------------------------------ warnings, never a pause

/** Gmail asks bulk senders to stay under 1 complaint in 1,000 and never to reach 3; Yahoo: 3. */
export const COMPLAINTS_TARGET_PER_1000 = 1;
export const COMPLAINTS_LIMIT_PER_1000 = 3;
/** Under 2 hard bounces in 100 is healthy; over 5 is poor. */
export const HARD_BOUNCES_HEALTHY_PER_100 = 2;
export const HARD_BOUNCES_POOR_PER_100 = 5;
/** "The last 7 days": sends handed over in the 7 × 24 hours before now. */
export const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export type WarningScope = "mailing" | "week";
export type DeliveryWarning = {
  key: "complaints" | "hard_bounces";
  level: "attention" | "danger";
  title: string;
  body: string;
};

export function warningsOf(counts: DeliveryCounts, scope: WarningScope): DeliveryWarning[] {
  const where = scope === "mailing" ? "in this mailing" : "in the last 7 days";
  const warnings: DeliveryWarning[] = [];
  const { complaint, delivered, hard_bounce: hard, accepted } = counts;
  if (complaint > 0 && delivered > 0 && complaint * 1000 > delivered * COMPLAINTS_TARGET_PER_1000) {
    const limit = complaint * 1000 >= delivered * COMPLAINTS_LIMIT_PER_1000;
    warnings.push({
      key: "complaints",
      level: limit ? "danger" : "attention",
      title: limit
        ? "Spam complaints are at or over Gmail's and Yahoo's limit"
        : "Spam complaints are over the line mailbox providers ask for",
      body:
        `${countWords(complaint)} spam ${complaint === 1 ? "complaint" : "complaints"} from ` +
        `${countWords(delivered)} delivered ${where}: ${perCentWords(complaint, delivered)}. ` +
        "Gmail asks senders to keep complaints under 0.1 per cent and never to reach 0.3 per cent; " +
        "Yahoo's limit is also 0.3 per cent. At about 290 a day, a single complaint is 0.34 per cent. " +
        "Nothing has been paused: you decide.",
    });
  }
  if (hard > 0 && accepted > 0 && hard * 100 > accepted * HARD_BOUNCES_HEALTHY_PER_100) {
    const poor = hard * 100 > accepted * HARD_BOUNCES_POOR_PER_100;
    warnings.push({
      key: "hard_bounces",
      level: poor ? "danger" : "attention",
      title: poor
        ? "Hard bounces are over 5 per cent"
        : "More addresses bounced hard than is healthy",
      body:
        `${ofWords(hard, accepted)} accepted bounced hard ${where}: ${perCentWords(hard, accepted)}. ` +
        "Under 2 per cent is healthy and over 5 per cent is poor: a high rate tells mailbox " +
        "providers a list is old or bought. Nothing has been paused: you decide.",
    });
  }
  return warnings;
}

/** Said once wherever complaints are counted: the count can only be lower than the truth. */
export const COMPLAINTS_HINT =
  "Gmail does not tell senders who complained, so complaints from Gmail addresses are not in this count.";

// ------------------------------------------------------------------ waiting for his press

export type WaitingStop = {
  email: string;
  kind: StopKind;
  at: string;
  mailing_id: string;
  mailing: string;
};

/**
 * The stopping events from before `auto_stop_from` that nothing has applied, one per address
 * (its earliest), oldest first. Empty once he has pressed "Apply to the stop list". Callers
 * leave out addresses already on the stop list when they count what would be added.
 */
export function waitingStopsOf(
  files: readonly MailingDeliveryFile[],
  applied: readonly AppliedStop[],
  state: Pick<DeliveryStateFile, "auto_stop_from" | "backlog_applied_at">,
): WaitingStop[] {
  if (state.backlog_applied_at !== null) return [];
  const done = new Set(applied.map(appliedKeyOf));
  const found = new Map<string, WaitingStop>();
  for (const file of files)
    for (const recipient of file.recipients)
      for (const event of recipient.events) {
        const kind = event.kind;
        if (!isStopKind(kind) || event.at >= state.auto_stop_from) continue;
        if (done.has(appliedKeyOf({ email: recipient.email, kind, at: event.at }))) continue;
        const earlier = found.get(recipient.email);
        if (earlier && earlier.at <= event.at) continue;
        found.set(recipient.email, {
          email: recipient.email,
          kind,
          at: event.at,
          mailing_id: file.mailing_id,
          mailing: file.name,
        });
      }
  return [...found.values()].sort(
    (a, b) => a.at.localeCompare(b.at) || a.email.localeCompare(b.email),
  );
}

// ------------------------------------------------------------------ the Data service

export type AddressDelivery = {
  mailing_id: string;
  mailing: string;
  sent_at: string;
  standing: RecipientStanding;
};

export type DeliveryFeedState = {
  /** When the sender last read the provider; null before the first read. */
  last_read_at: string | null;
  outcome: ReadOutcome | null;
  detail: string;
  auto_stop_from: string | null;
  /** Addresses waiting for his press that are not on the stop list now. */
  waiting: number;
};

/** What `core.need(DELIVERY_SERVICE)` gives: D1's module reads the sender's files; D2 reads it. */
export type DeliveryFeed = {
  state(): DeliveryFeedState;
  /** Every mailing with an accepted send, newest first send first. */
  mailings(): MailingDelivery[];
  mailing(mailingId: string): MailingDelivery | null;
  /** Each live send to this (normalised) address, newest first; [] when none was read. */
  forEmail(email: string): AddressDelivery[];
  /** Counts over every send handed over at or after `at` (an instant). */
  since(at: string): DeliveryCounts;
};

// ------------------------------------------------------------------ the stand-in's mix

export type WalkEvent = { event: string; offset_ms: number; reason: string };

/** The firm numbers in `…@fund<n>.example` that get one special outcome each. */
export const WALK_MIX_SPECIALS = {
  complaint: 41,
  unsubscribed: 43,
  deferred: 47,
  blocked: 53,
  invalid: 59,
  error: 61,
} as const;

/**
 * What the stand-in provider says happened to one accepted message (spec §5.6): by the
 * address's local part first, then by the firm number n in `…@fund<n>.example` (n % 36 = 0 a
 * hard bounce, n % 29 = 0 a soft bounce, then the specials), else delivered. It includes
 * events HQ must drop (requests, opened, loadedByProxy, clicks), so tests prove they are.
 */
export function walkMixOf(email: string): WalkEvent[] {
  const address = email.trim().toLowerCase();
  const local = address.split("@")[0] ?? "";
  const firm = /@fund(\d+)\.example$/.exec(address);
  const n = firm ? Number(firm[1]) : 0;
  const is = (word: string, special: number) => local.startsWith(word) || (n > 0 && n === special);
  const step = (event: string, offset_ms: number, reason = ""): WalkEvent => ({
    event,
    offset_ms,
    reason,
  });
  if (local.startsWith("silent")) return [];
  const asked = step("requests", 0);
  const delivered = step("delivered", 1_000);
  const looked = [step("opened", 7_000), step("loadedByProxy", 8_000), step("clicks", 9_000)];
  if (local.startsWith("hardbounce") || (n > 0 && n % 36 === 0))
    return [asked, step("hardBounces", 3_000, `550 5.1.1 <${address}>: user unknown`)];
  if (local.startsWith("softbounce") || (n > 0 && n % 29 === 0))
    return [
      asked,
      step("deferred", 2_000),
      step("softBounces", 3_000, "452 4.2.2 The mailbox is full"),
    ];
  if (is("complaint", WALK_MIX_SPECIALS.complaint))
    return [asked, delivered, ...looked, step("spam", 5_000)];
  if (is("unsubscribe", WALK_MIX_SPECIALS.unsubscribed))
    return [asked, delivered, step("unsubscribed", 6_000)];
  if (is("deferred", WALK_MIX_SPECIALS.deferred)) return [asked, step("deferred", 2_000)];
  if (is("blocked", WALK_MIX_SPECIALS.blocked)) return [asked, step("blocked", 1_000)];
  if (is("invalid", WALK_MIX_SPECIALS.invalid)) return [asked, step("invalid", 1_000)];
  if (is("error", WALK_MIX_SPECIALS.error)) return [asked, step("error", 1_000)];
  return [asked, delivered, ...looked];
}

/** The kept events of the mix for a message handed over at `sentAt`, as the files hold them. */
export function walkDeliveryEventsOf(email: string, sentAt: string): DeliveryEvent[] {
  const start = new Date(sentAt).getTime();
  const events: DeliveryEvent[] = [];
  for (const item of walkMixOf(email)) {
    const kind = deliveryKindOf(item.event);
    if (kind === null) continue;
    events.push({
      kind,
      at: new Date(start + item.offset_ms).toISOString(),
      reason: redactReason(item.reason),
    });
  }
  return events;
}
