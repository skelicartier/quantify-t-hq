/**
 * Days as the person lives them. "Today" is this Mac's calendar day, the same day Mail
 * merge counts its daily limit on (`MergeEngine`'s `#day`). A calendar date is a
 * `YYYY-MM-DD` string and is never shifted into a zone: arithmetic on one is done in UTC
 * on purpose, so adding a day to "2026-11-10" gives "2026-11-11" wherever the code runs.
 */

const pad = (value: number): string => String(value).padStart(2, "0");

/** The local calendar day of an instant (now, by default), as the engine counts it. */
export function localDay(at: Date | string = new Date()): string {
  const moment = typeof at === "string" ? new Date(at) : at;
  return `${moment.getFullYear()}-${pad(moment.getMonth() + 1)}-${pad(moment.getDate())}`;
}

function parts(day: string): [number, number, number] {
  const [year = 0, month = 0, date = 0] = day.split("-").map(Number);
  return [year, month, date];
}

/** A calendar date plus (or minus) whole days, with no zone involved. */
export function addDays(day: string, count: number): string {
  const [year, month, date] = parts(day);
  const moved = new Date(Date.UTC(year, month - 1, date + count));
  return `${moved.getUTCFullYear()}-${pad(moved.getUTCMonth() + 1)}-${pad(moved.getUTCDate())}`;
}

/** Whole days from `from` to `to`; negative when `to` is earlier. */
export function daysBetween(from: string, to: string): number {
  const [y1, m1, d1] = parts(from);
  const [y2, m2, d2] = parts(to);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86_400_000);
}

/** Monday to Friday. Public holidays are the person's to know; nothing here guesses them. */
export function isWorkingDay(day: string): boolean {
  const [year, month, date] = parts(day);
  const weekday = new Date(Date.UTC(year, month - 1, date)).getUTCDay();
  return weekday !== 0 && weekday !== 6;
}

/** The `count`th working day after `day` (count 1 is the next working day). */
export function addWorkingDays(day: string, count: number): string {
  let current = day;
  let left = count;
  while (left > 0) {
    current = addDays(current, 1);
    if (isWorkingDay(current)) left -= 1;
  }
  return current;
}

/** The first working day strictly after `day`. */
export function workingDayAfter(day: string): string {
  return addWorkingDays(day, 1);
}

/** The last `count` local days ending today, oldest first. */
export function lastDays(today: string, count: number): string[] {
  return Array.from({ length: count }, (_, index) => addDays(today, index - (count - 1)));
}

/** "2026-11" of a calendar date, for grouping by month. */
export function monthOf(day: string): string {
  return day.slice(0, 7);
}
