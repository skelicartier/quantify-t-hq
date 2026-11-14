/**
 * The calendar file (RFC 5545) of what HQ owes him (raise spec §7.3.3): one all-day event
 * per open item, overdue ones on today, with reminders as each item asks. Pure: no clock,
 * no file, no `server-only`, so the feed route, the download and the tests share it.
 *
 * Lines end CRLF and are folded at 75 octets without splitting a character; text values
 * are escaped. "Kinds only" leaves every name out: the summary is the kind's plain words,
 * the description only says to open HQ, and there is no link.
 */

export type IcsDetail = "full" | "plain";

export type IcsKind =
  | "key_date"
  | "investor"
  | "offer_deadline"
  | "waitlist"
  | "follow_up"
  | "file_review"
  | "action"
  | "meeting"
  | "agreement"
  | "pilot"
  | "diligence";

/** An agenda item, as the service gives it (`AgendaItem` in the service's contract). */
export type IcsItem = {
  key: string;
  kind: IcsKind;
  title: string;
  plain: string;
  sub: string;
  /** YYYY-MM-DD, a calendar date. */
  on: string;
  remind_days: readonly number[];
  href: string;
};

/** The calendar's own name, as Calendar shows it in its list. */
export const ICS_NAME = "HQ: what is due";
/** Items further out than this are left out (the service keeps the same window). */
export const ICS_WINDOW_DAYS = 400;

const KIND_WORDS: Record<IcsKind, string> = {
  key_date: "Key date",
  investor: "Investor",
  offer_deadline: "Offer deadline",
  waitlist: "Waitlist",
  follow_up: "Follow-up",
  file_review: "File review",
  action: "Action",
  meeting: "Meeting",
  agreement: "Agreement",
  pilot: "Pilot",
  diligence: "Diligence",
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** A calendar date plus whole days, with no zone involved. */
export function addDaysTo(day: string, count: number): string {
  const [year = 0, month = 1, date = 1] = day.split("-").map(Number);
  const moved = new Date(Date.UTC(year, month - 1, date + count));
  return moved.toISOString().slice(0, 10);
}

const compactDay = (day: string): string => day.replace(/-/g, "");

/** "10 Nov", or "10 Nov 2025" when the year is not today's. */
function shortDay(day: string, today: string): string {
  const [year = "", month = "", date = ""] = day.split("-");
  const label = `${Number(date)} ${MONTHS[Number(month) - 1] ?? ""}`;
  return year === today.slice(0, 4) ? label : `${label} ${year}`;
}

/** `2026-11-13T05:00:00.000Z` → `20261113T050000Z`. */
function utcStamp(stamp: string): string {
  const at = new Date(stamp);
  const iso = (Number.isNaN(at.getTime()) ? new Date(0) : at).toISOString();
  return `${iso.slice(0, 19).replace(/[-:]/g, "")}Z`;
}

/** A TEXT value: backslash, semicolon, comma and line breaks escaped. */
export function escapeText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r\n|\r|\n/g, "\\n");
}

const encoder = new TextEncoder();

/**
 * One content line folded so no physical line passes 75 octets: each continuation starts
 * with one space (which counts), and a character is never cut in two.
 */
export function foldLine(line: string): string {
  if (encoder.encode(line).length <= 75) return line;
  const parts: string[] = [];
  let current = "";
  let size = 0;
  let limit = 75;
  for (const character of line) {
    const bytes = encoder.encode(character).length;
    if (size + bytes > limit) {
      parts.push(current);
      current = "";
      size = 0;
      limit = 74;
    }
    current += character;
    size += bytes;
  }
  parts.push(current);
  return parts.join("\r\n ");
}

/**
 * The UID's own part: the key with everything outside A–Z, a–z, 0–9, "-" and "_" made "-"
 * (the spec's hand check keeps the underscore: `key_date:d1` → `key_date-d1@hq.data`).
 */
const uidOf = (key: string): string => `${key.replace(/[^A-Za-z0-9_-]/g, "-")}@hq.data`;

export function toIcs(input: {
  items: readonly IcsItem[];
  /** This Mac's day: overdue items are placed on it. */
  today: string;
  detail: IcsDetail;
  /** Where HQ is, for the links in full events: `http://127.0.0.1:3000`. */
  origin: string;
  /** When the file was made (an ISO instant), for DTSTAMP. */
  stamp: string;
  name?: string;
}): string {
  const { today, detail } = input;
  const origin = input.origin.replace(/\/+$/, "");
  const until = addDaysTo(today, ICS_WINDOW_DAYS);
  const stamp = utcStamp(input.stamp);
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Quantify Terminal//HQ Data//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeText(input.name ?? ICS_NAME)}`,
    "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
    "X-PUBLISHED-TTL:PT1H",
  ];
  const seen = new Set<string>();
  for (const item of input.items) {
    if (!DAY.test(item.on) || item.on > until) continue;
    const uid = uidOf(item.key);
    if (seen.has(uid)) continue;
    seen.add(uid);
    const overdue = item.on < today;
    const day = overdue ? today : item.on;
    const words = detail === "full" ? item.title : item.plain;
    const summary = overdue ? `Overdue since ${shortDay(item.on, today)}: ${words}` : words;
    const link = `${origin}${item.href}`;
    const description =
      detail === "full"
        ? [item.sub, `Open in HQ: ${link}`].filter(Boolean).join("\n")
        : "Open HQ to see it.";
    lines.push(
      "BEGIN:VEVENT",
      `UID:${uid}`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${compactDay(day)}`,
      `DTEND;VALUE=DATE:${compactDay(addDaysTo(day, 1))}`,
      `SUMMARY:${escapeText(summary)}`,
      `DESCRIPTION:${escapeText(description)}`,
      ...(detail === "full" ? [`URL:${link}`] : []),
      `CATEGORIES:${escapeText(KIND_WORDS[item.kind] ?? "HQ")}`,
      "TRANSP:TRANSPARENT",
    );
    const triggers = overdue
      ? ["PT9H"]
      : [...new Set(item.remind_days)]
          .filter((days) => Number.isInteger(days) && days >= 0 && addDaysTo(day, -days) >= today)
          .sort((a, b) => b - a)
          .map((days) => (days === 0 ? "PT9H" : `-P${days}D`));
    for (const trigger of triggers)
      lines.push(
        "BEGIN:VALARM",
        "ACTION:DISPLAY",
        "DESCRIPTION:Reminder",
        `TRIGGER:${trigger}`,
        "END:VALARM",
      );
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return `${lines.map(foldLine).join("\r\n")}\r\n`;
}
