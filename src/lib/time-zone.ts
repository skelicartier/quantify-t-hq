/**
 * Times in a person's own zone.
 *
 * Every instant is stored and sent as UTC. Showing one in a zone takes only its numeric
 * parts from Intl (which every ICU build agrees on) and names the zone from a table of
 * its own, so the server and the browser print the same string and a hydration never
 * disagrees over "Sept" or "GMT+5:30". A zone not in the table is named by its offset.
 */

export const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/** The zones offered to choose from; a device's zone outside this list is kept as it is. */
export const OFFERED_ZONES = [
  "UTC",
  "Europe/London",
  "Europe/Zurich",
  "Europe/Paris",
  "Europe/Berlin",
  "Asia/Kolkata",
  "Asia/Singapore",
  "Asia/Dubai",
  "Asia/Hong_Kong",
  "Asia/Tokyo",
  "Australia/Sydney",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
] as const;

/** [standard time, daylight time] names for the zones we print by name. */
const ZONE_NAMES: Record<string, [string, string]> = {
  UTC: ["UTC", "UTC"],
  "Europe/London": ["GMT", "BST"],
  "Europe/Dublin": ["GMT", "IST"],
  "Europe/Zurich": ["CET", "CEST"],
  "Europe/Paris": ["CET", "CEST"],
  "Europe/Berlin": ["CET", "CEST"],
  "Europe/Amsterdam": ["CET", "CEST"],
  "Europe/Madrid": ["CET", "CEST"],
  "Asia/Kolkata": ["IST", "IST"],
  "Asia/Calcutta": ["IST", "IST"],
  "Asia/Singapore": ["SGT", "SGT"],
  "Asia/Dubai": ["GST", "GST"],
  "Asia/Hong_Kong": ["HKT", "HKT"],
  "Asia/Tokyo": ["JST", "JST"],
  "Australia/Sydney": ["AEST", "AEDT"],
  "America/New_York": ["EST", "EDT"],
  "America/Chicago": ["CST", "CDT"],
  "America/Denver": ["MST", "MDT"],
  "America/Los_Angeles": ["PST", "PDT"],
};

const formatters = new Map<string, Intl.DateTimeFormat | null>();

function formatterFor(zone: string): Intl.DateTimeFormat | null {
  if (formatters.has(zone)) return formatters.get(zone) ?? null;
  let formatter: Intl.DateTimeFormat | null = null;
  try {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: zone,
      hourCycle: "h23",
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    formatter = null;
  }
  formatters.set(zone, formatter);
  return formatter;
}

/** Older names a browser may still report for a zone, read as the current one. */
const ZONE_ALIASES: Record<string, string> = {
  "Asia/Calcutta": "Asia/Kolkata",
  "Asia/Katmandu": "Asia/Kathmandu",
  "Asia/Saigon": "Asia/Ho_Chi_Minh",
  "Asia/Rangoon": "Asia/Yangon",
  "Asia/Macao": "Asia/Macau",
  "Asia/Ulan_Bator": "Asia/Ulaanbaatar",
  "Europe/Kiev": "Europe/Kyiv",
  "America/Buenos_Aires": "America/Argentina/Buenos_Aires",
  "Atlantic/Faeroe": "Atlantic/Faroe",
  "Pacific/Enderbury": "Pacific/Kanton",
  Etc_UTC: "UTC",
  "Etc/UTC": "UTC",
  "Etc/GMT": "UTC",
  GMT: "UTC",
};

/** A zone by its current name: Chromium says "Asia/Calcutta" for a device in Kolkata. */
export function canonicalZone(zone: string): string {
  const clean = zone.trim();
  return ZONE_ALIASES[clean] ?? clean;
}

/** Whether Intl knows the zone; "" and "UTC" are always fine. */
export function isValidZone(zone: string): boolean {
  return zone === "" || zone === "UTC" || formatterFor(zone) !== null;
}

export type ZoneParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  /** Minutes east of UTC at this instant. */
  offset: number;
};

/** The wall clock of an instant in a zone; UTC when the zone is unknown or empty. */
export function partsInZone(date: Date, zone: string): ZoneParts {
  const formatter = zone && zone !== "UTC" ? formatterFor(zone) : null;
  if (!formatter) {
    return {
      year: date.getUTCFullYear(),
      month: date.getUTCMonth() + 1,
      day: date.getUTCDate(),
      hour: date.getUTCHours(),
      minute: date.getUTCMinutes(),
      offset: 0,
    };
  }
  const read: Record<string, number> = {};
  for (const part of formatter.formatToParts(date)) {
    if (part.type !== "literal") read[part.type] = Number(part.value);
  }
  const year = read.year ?? date.getUTCFullYear();
  const month = read.month ?? date.getUTCMonth() + 1;
  const day = read.day ?? date.getUTCDate();
  const hour = read.hour ?? date.getUTCHours();
  const minute = read.minute ?? date.getUTCMinutes();
  const second = read.second ?? date.getUTCSeconds();
  const wall = Date.UTC(year, month - 1, day, hour, minute, second);
  const offset = Math.round((wall - date.getTime()) / 60_000);
  return { year, month, day, hour, minute, offset };
}

function offsetWords(offset: number): string {
  if (offset === 0) return "UTC";
  const sign = offset > 0 ? "+" : "-";
  const whole = Math.abs(offset);
  const hours = Math.floor(whole / 60);
  const minutes = whole % 60;
  return `UTC${sign}${hours}${minutes ? `:${String(minutes).padStart(2, "0")}` : ""}`;
}

/**
 * What the zone is called at this instant: its standard or daylight name from the table
 * (daylight when the offset is above the year's lowest, which holds in both hemispheres),
 * else its offset, "UTC+5:30".
 */
const standardOffsets = new Map<string, number>();

/** The zone's standard-time offset in a year: the lower of its January and July offsets. */
function standardOffset(zone: string, year: number): number {
  const key = `${zone}:${year}`;
  const known = standardOffsets.get(key);
  if (known !== undefined) return known;
  const standard = Math.min(
    partsInZone(new Date(Date.UTC(year, 0, 1, 12)), zone).offset,
    partsInZone(new Date(Date.UTC(year, 6, 1, 12)), zone).offset,
  );
  standardOffsets.set(key, standard);
  return standard;
}

export function zoneName(zone: string, date: Date, offset: number): string {
  const names = ZONE_NAMES[zone];
  if (!names) return offsetWords(offset);
  if (names[0] === names[1]) return names[0];
  return offset > standardOffset(zone, date.getUTCFullYear()) ? names[1] : names[0];
}

/** "5 Sep 2026" in the zone. */
export function dateInZone(date: Date, zone: string): string {
  const parts = partsInZone(date, zone);
  return `${parts.day} ${MONTHS[parts.month - 1]} ${parts.year}`;
}

/** "5 Sep 2026, 09:35 IST" in the zone ("… 04:05 UTC" when the zone is UTC or empty). */
export function dateTimeInZone(date: Date, zone: string): string {
  const parts = partsInZone(date, zone);
  const clock = `${String(parts.hour).padStart(2, "0")}:${String(parts.minute).padStart(2, "0")}`;
  const name =
    zone && zone !== "UTC" && formatterFor(zone) ? zoneName(zone, date, parts.offset) : "UTC";
  return `${parts.day} ${MONTHS[parts.month - 1]} ${parts.year}, ${clock} ${name}`;
}

/** A zone as a person reads it: "Asia/Kolkata" → "Asia / Kolkata". */
export function zoneLabel(zone: string): string {
  return zone.replace(/_/g, " ").replace("/", " / ");
}

// --- typed times -----------------------------------------------------------------------------
//
// A `datetime-local` field holds a wall clock, "2026-10-07T09:00", with no zone of its
// own. It means that time in the zone the person reads their times in — the same zone
// every timestamp on the page is printed in — never the device's and never UTC by
// accident. These two turn the field's value into the instant it means and back.

const WALL_CLOCK = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/;

/** Whether the text is a wall clock with no zone of its own, the value a datetime-local field gives. */
export function isWallClock(text: string): boolean {
  return WALL_CLOCK.test(text.trim());
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

/** The wall clock "YYYY-MM-DDTHH:mm" of an instant in a zone, the value a datetime-local field takes. */
export function wallClockInZone(date: Date, zone: string): string {
  if (!Number.isFinite(date.getTime())) return "";
  const parts = partsInZone(date, zone);
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}T${pad(parts.hour)}:${pad(parts.minute)}`;
}

/**
 * The instant a wall clock typed in a zone means; null when the text is not a time or
 * not a date that exists. The zone's offset is read at a first guess and again at the
 * answer, so a clock change between the two is caught: a time in the hour a zone skips
 * reads as the hour after it, and a time in the hour it repeats reads as its first pass.
 */
export function instantFromWallClock(wall: string, zone: string): Date | null {
  const match = WALL_CLOCK.exec(wall.trim());
  if (!match) return null;
  const [year, month, day, hour, minute, second] = match.slice(1).map(Number) as [
    number,
    number,
    number,
    number,
    number,
    number,
  ];
  const guess = Date.UTC(year, month - 1, day, hour, minute, second || 0);
  const asTyped = new Date(guess);
  if (
    asTyped.getUTCFullYear() !== year ||
    asTyped.getUTCMonth() !== month - 1 ||
    asTyped.getUTCDate() !== day ||
    hour > 23 ||
    minute > 59 ||
    (second || 0) > 59
  )
    return null;
  const first = partsInZone(asTyped, zone).offset;
  let instant = guess - first * 60_000;
  const second_pass = partsInZone(new Date(instant), zone).offset;
  if (second_pass !== first) instant = guess - second_pass * 60_000;
  return new Date(instant);
}

/**
 * A time typed into a form, as the ISO instant to send: a wall clock is read in the
 * zone; an instant that names its own zone ("…Z", "…+05:30") is kept as it is; what is
 * neither goes through unchanged for the service to refuse with its own words; empty
 * stays empty.
 */
export function typedInstant(text: string, zone: string): string {
  const clean = text.trim();
  if (!clean || !isWallClock(clean)) return clean;
  const instant = instantFromWallClock(clean, zone);
  return instant ? instant.toISOString() : clean;
}

/** Tomorrow at a given hour in the zone, as a wall clock for a datetime-local field. */
export function tomorrowAt(hour: number, zone: string, now: Date = new Date()): string {
  const today = partsInZone(now, zone);
  const tomorrow = new Date(Date.UTC(today.year, today.month - 1, today.day + 1));
  return `${tomorrow.getUTCFullYear()}-${pad(tomorrow.getUTCMonth() + 1)}-${pad(tomorrow.getUTCDate())}T${pad(hour)}:00`;
}
