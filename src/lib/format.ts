/**
 * Presentation formatters shared by server and client components.
 *
 * One implementation each, so a status that reads "Login Success" in the activity table
 * reads the same in the admin audit table, and so a timestamp is never rendered as a raw
 * ISO string anywhere in the console. Nothing here touches the network or the clock
 * unless a `now` is passed in: relative time is computed from a caller-supplied instant
 * so server and client renders cannot disagree.
 */

const ACRONYMS = new Set([
  "api",
  "cors",
  "csv",
  "http",
  "https",
  "id",
  "ip",
  "json",
  "mfa",
  "otp",
  "qr",
  "sso",
  "totp",
  "ttl",
  "url",
  "uuid",
]);

/** `session.heartbeat` → "Session Heartbeat", `mfa_challenge` → "MFA Challenge". */
export function formatLabel(value: string | null | undefined): string {
  return String(value ?? "")
    .split(/[-_.:\s]+/u)
    .filter(Boolean)
    .map((part) => {
      const lower = part.toLowerCase();
      if (ACRONYMS.has(lower)) return lower.toUpperCase();
      return `${lower.charAt(0).toUpperCase()}${lower.slice(1)}`;
    })
    .join(" ");
}

/** Sentence-case variant for prose: `missing-in-database` → "Missing in database". */
export function formatSentence(value: string | null | undefined): string {
  const words = String(value ?? "")
    .split(/[-_.:\s]+/u)
    .filter(Boolean)
    .map((part) => {
      const lower = part.toLowerCase();
      return ACRONYMS.has(lower) ? lower.toUpperCase() : lower;
    });
  if (words.length === 0) return "";
  const [first, ...rest] = words;
  const head = ACRONYMS.has(first!.toLowerCase())
    ? first!
    : `${first!.charAt(0).toUpperCase()}${first!.slice(1)}`;
  return [head, ...rest].join(" ");
}

const NUMBER_FORMAT = new Intl.NumberFormat("en");

export function formatNumber(value: number | null | undefined): string {
  return typeof value === "number" && Number.isFinite(value)
    ? NUMBER_FORMAT.format(value)
    : "Not available";
}

export function pluralize(count: number, noun: string, plural = `${noun}s`): string {
  return `${formatNumber(count)} ${count === 1 ? noun : plural}`;
}

/**
 * A share of a whole, as a percentage. `0.5` → "50%", `0.004` → "<1%".
 *
 * Rounded to whole points because the console shows shares to be compared at a glance,
 * never to be reconciled; a value that rounds to zero but is not zero says "<1%" so a
 * live account never reads as none at all.
 */
export function formatPercent(ratio: number | null | undefined): string {
  if (typeof ratio !== "number" || !Number.isFinite(ratio) || ratio < 0) return "Not available";
  const percent = ratio * 100;
  if (percent > 0 && percent < 1) return "<1%";
  if (percent > 99 && percent < 100) return ">99%";
  return `${Math.round(percent)}%`;
}

/**
 * A change as a signed percentage with one decimal: `0.034` → "+3.4%", `-0.012` → "−1.2%",
 * `0` → "0.0%". One decimal because growth is compared month to month, where whole
 * points would hide the difference between a flat month and a good one.
 */
export function formatDeltaPercent(ratio: number | null | undefined): string {
  if (typeof ratio !== "number" || !Number.isFinite(ratio)) return "—";
  const percent = ratio * 100;
  const rounded = Math.round(percent * 10) / 10;
  if (rounded === 0) return "0.0%";
  return `${rounded > 0 ? "+" : "−"}${Math.abs(rounded).toFixed(1)}%`;
}

/** A rate with one decimal and no sign: `0.0071` → "0.7%", `0.974` → "97.4%". */
export function formatRatePercent(ratio: number | null | undefined): string {
  if (typeof ratio !== "number" || !Number.isFinite(ratio)) return "—";
  return `${(ratio * 100).toFixed(1)}%`;
}

/** "2026-01" → "Jan 26" at a year's turn, "2026-03" → "Mar": the label under a chart column. */
export function formatMonthShort(month: string | null | undefined): string {
  const match = /^(\d{4})-(\d{2})/.exec(month ?? "");
  if (!match) return month ?? "—";
  const name = MONTHS[Number(match[2]) - 1] ?? month ?? "—";
  return match[2] === "01" ? `${name} ${match[1]!.slice(2)}` : name;
}

/** A multiple: `3.24` → "3.2×", `12` → "12.0×". */
export function formatMultiple(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return "—";
  return `${value.toFixed(1)}×`;
}

/** "2026-03" → "Mar 2026"; anything else is returned as it came. */
export function formatMonth(month: string | null | undefined): string {
  const match = /^(\d{4})-(\d{2})/.exec(month ?? "");
  if (!match) return month ?? "—";
  const name = MONTHS[Number(match[2]) - 1];
  return name ? `${name} ${match[1]}` : (month ?? "—");
}

/** 16384 → "16 KB", 1_048_576 → "1 MB". Binary units, at most one decimal. */
export function formatBytes(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return "Not available";
  if (value < 1024) return `${value} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let scaled = value / 1024;
  let unit = 0;
  while (scaled >= 1024 && unit < units.length - 1) {
    scaled /= 1024;
    unit += 1;
  }
  const rounded = scaled >= 10 ? Math.round(scaled) : Math.round(scaled * 10) / 10;
  return `${rounded} ${units[unit]}`;
}

/** 8 → "8 s", 180 → "3 min", 3600 → "1 h", 86400 → "1 day", 1209600 → "14 days". */
export function formatDurationSeconds(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return "Not available";
  const seconds = Math.round(value);
  if (seconds >= 86_400 && seconds % 86_400 === 0) {
    const days = seconds / 86_400;
    return `${days} ${days === 1 ? "day" : "days"}`;
  }
  if (seconds >= 3_600) return `${Math.round((seconds / 3_600) * 10) / 10} h`;
  if (seconds >= 60) return `${Math.round(seconds / 60)} min`;
  return `${seconds} s`;
}

export type FormattedDateTime = {
  iso: string;
  absolute: string;
  relative: string;
  valid: boolean;
};

// Assembled by hand rather than through Intl so the output cannot drift between ICU
// builds ("Sep" vs "Sept") or between the server and the browser.
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function absoluteDate(date: Date): string {
  return `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

function absoluteDateTime(date: Date): string {
  const hours = String(date.getUTCHours()).padStart(2, "0");
  const minutes = String(date.getUTCMinutes()).padStart(2, "0");
  return `${absoluteDate(date)}, ${hours}:${minutes} UTC`;
}

const RELATIVE = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

const RELATIVE_UNITS: Array<[Intl.RelativeTimeFormatUnit, number]> = [
  ["year", 365 * 86_400_000],
  ["month", 30 * 86_400_000],
  ["day", 86_400_000],
  ["hour", 3_600_000],
  ["minute", 60_000],
];

function relativeTo(timestamp: number, now: number): string {
  const delta = timestamp - now;
  const magnitude = Math.abs(delta);
  if (magnitude < 45_000) return "just now";
  for (const [unit, size] of RELATIVE_UNITS) {
    if (magnitude >= size) return RELATIVE.format(Math.round(delta / size), unit);
  }
  return RELATIVE.format(Math.round(delta / 60_000), "minute");
}

/**
 * Parse an ISO-ish timestamp once and hand back every rendering the console uses.
 * `absolute` is always UTC and always the same string on the server and the client;
 * `relative` is only meaningful when `now` is supplied by the caller.
 */
export function formatDateTime(
  value: string | null | undefined,
  options: { now?: number | undefined; style?: "date" | "datetime" | undefined } = {},
): FormattedDateTime {
  const raw = String(value ?? "").trim();
  const timestamp = raw ? Date.parse(raw) : Number.NaN;
  if (!raw || Number.isNaN(timestamp)) {
    return { iso: "", absolute: "", relative: "", valid: false };
  }
  const date = new Date(timestamp);
  const absolute = options.style === "date" ? absoluteDate(date) : absoluteDateTime(date);
  return {
    iso: date.toISOString(),
    absolute,
    relative: typeof options.now === "number" ? relativeTo(timestamp, options.now) : "",
    valid: true,
  };
}

/** "3 Jan 2024" or the fallback. */
export function formatDate(value: string | null | undefined, fallback = "Not available"): string {
  const formatted = formatDateTime(value, { style: "date" });
  return formatted.valid ? formatted.absolute : fallback;
}

/** "5 Sep 2026, 04:05 UTC" or the fallback. */
export function formatAbsolute(
  value: string | null | undefined,
  fallback = "Not available",
): string {
  const formatted = formatDateTime(value);
  return formatted.valid ? formatted.absolute : fallback;
}

/**
 * The value a `datetime-local` input should show for a stored instant.
 *
 * A `datetime-local` input has no timezone: it shows and returns a wall clock, and the
 * browser means the viewer's own. So a stored UTC instant has to be shifted into local time
 * before it goes in, and shifted back out again on the way to storage — see
 * {@link localInputToIso}.
 *
 * Getting this wrong is not cosmetic. The two halves used to cancel out on screen, so an
 * operator saw back exactly what they typed while the instant recorded was out by their UTC
 * offset. A notice published "now" from India was stored five and a half hours ahead and sat
 * there reading SCHEDULED, because the status check compares the stored instant against the
 * real clock rather than against the field.
 */
export function isoToLocalInput(value: string | null | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

/**
 * The instant a `datetime-local` value means, as an ISO string in UTC.
 *
 * `new Date("2026-09-13T03:58")` parses as local time, which is exactly what the input
 * meant, so the conversion is the parse itself. Appending a "Z" instead — which is what this
 * replaces — relabels the operator's wall clock as UTC and moves the instant.
 */
export function localInputToIso(value: string | null | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : "";
}

/**
 * Money as the CRM shows it: whole units, the currency's own symbol. `1234.5, "USD"` →
 * "$1,235". Monthly recurring figures are small enough that cents are noise, and the
 * service rounds to cents anyway, so nothing is hidden by dropping them here.
 */
/**
 * Null is a figure the reader's role may not see — a dash, as the tables draw one. A
 * number that is not finite is a fault, and says so.
 */
export function formatMoney(value: number | null | undefined, currency = "USD"): string {
  if (value === null || value === undefined) return "—";
  if (typeof value !== "number" || !Number.isFinite(value)) return "Not available";
  const code = /^[A-Z]{3}$/.test(currency) ? currency : "USD";
  return new Intl.NumberFormat("en", {
    style: "currency",
    currency: code,
    maximumFractionDigits: 0,
    minimumFractionDigits: 0,
  }).format(value);
}

/**
 * Money to the cent when it has cents — a claim of £42.50 is not £43 — and whole when it
 * has none, so a column of round prices does not read ".00" down its length.
 */
export function formatMoneyExact(value: number | null | undefined, currency = "USD"): string {
  if (value === null || value === undefined) return "—";
  if (typeof value !== "number" || !Number.isFinite(value)) return "Not available";
  const code = /^[A-Z]{3}$/.test(currency) ? currency : "USD";
  const whole = Math.round(value * 100) % 100 === 0;
  return new Intl.NumberFormat("en", {
    style: "currency",
    currency: code,
    ...(whole ? { maximumFractionDigits: 0, minimumFractionDigits: 0 } : {}),
  }).format(value);
}

/** Monthly recurring revenue: "$1,235/mo". */
/**
 * Money per currency, as the service totals it. Drawn one figure per currency, joined —
 * never added, since $1,000 + €1,000 is a number true at no exchange rate. Null is a
 * figure the role may not see; an empty map is nothing to total. Both draw a dash.
 */
export function formatMoneyBy(
  values: Readonly<Record<string, number>> | null | undefined,
  mrr = false,
): string {
  if (!values) return "—";
  const parts = Object.entries(values)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([currency, amount]) =>
      mrr ? formatMrr(amount, currency) : formatMoney(amount, currency),
    );
  return parts.length ? parts.join(" · ") : "—";
}

export function formatMrrBy(values: Readonly<Record<string, number>> | null | undefined): string {
  return formatMoneyBy(values, true);
}

/**
 * Deal money grouped by its currency: what a page may total client-side, and the only
 * way it may. Null the moment any amount is null — a role that may not see one figure
 * may not see their sum either.
 */
export function sumMoneyByCurrency(
  items: ReadonlyArray<{ amount: number | null; currency: string }>,
): Record<string, number> | null {
  const totals: Record<string, number> = {};
  for (const item of items) {
    if (item.amount === null) return null;
    totals[item.currency] = (totals[item.currency] ?? 0) + item.amount;
  }
  return totals;
}

export function formatMrr(value: number | null | undefined, currency = "USD"): string {
  const money = formatMoney(value, currency);
  return money === "Not available" || money === "—" ? money : `${money}/mo`;
}

/** A wait in minutes as a clock reads: 45 → "45m", 125 → "2h 05m", 3000 → "2d 2h". */
export function formatWait(minutes: number | null | undefined): string {
  if (typeof minutes !== "number" || !Number.isFinite(minutes) || minutes < 0) return "—";
  const whole = Math.floor(minutes);
  if (whole < 60) return `${whole}m`;
  if (whole < 1_440) {
    const hours = Math.floor(whole / 60);
    return `${hours}h ${String(whole % 60).padStart(2, "0")}m`;
  }
  const days = Math.floor(whole / 1_440);
  const hours = Math.floor((whole % 1_440) / 60);
  return hours ? `${days}d ${hours}h` : `${days}d`;
}

/** A due date against today (both YYYY-MM-DD): "overdue" | "today" | "upcoming" | "none". */
export function dueState(
  dueOn: string | null | undefined,
  today: string,
): "overdue" | "today" | "upcoming" | "none" {
  const day = String(dueOn ?? "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return "none";
  if (day < today) return "overdue";
  if (day === today) return "today";
  return "upcoming";
}
