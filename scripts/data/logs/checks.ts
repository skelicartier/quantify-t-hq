/**
 * The check lines and the quarterly look of Logs and time (ws-notes/security/spec.md §5.3,
 * §7.5), pure. Retention is read against direction (iv)'s rolling 180 days; logs kept outside
 * India get both readings (direction (iv) and FAQ 35) and nothing is judged; a cloud's own time
 * service is allowed by FAQ 42, so it is said, not warned about.
 */

import { addMonths } from "../company-contracts";
import { addDays } from "../days";
import { inDue } from "../security-contracts";
import { PRACTICES } from "../../../src/lib/data/labels-controls";
import { dayWords } from "../../../src/lib/data/labels-company";
import {
  LOG_LINES,
  lookOverdueLine,
  retentionShortLine,
} from "../../../src/lib/data/labels-devices";
import { DIRECTION_IV_DAYS, LOOK_AHEAD_DAYS } from "./limits";
import type { LogLine, LogLook, LogSystem } from "./types";

/** His months between looks, or HQ's default (every 3 months). */
export const lookMonthsOf = (months: number | null): number => months ?? PRACTICES.log_check.amount;

/**
 * The next look: his months after the last one, or after the day the system was added (adding
 * it is the first look). 20 Nov 2026 → 20 Feb 2027; 31 Aug 2026 → 30 Nov 2026.
 */
export function nextLookOf(lastOn: string | null, addedOn: string, months: number): string {
  return addMonths(lastOn ?? addedOn, months);
}

/** In Due from 14 days before: 20 Feb 2027 → 6 Feb 2027. */
export const lookDueFrom = (next: string): string => addDays(next, -LOOK_AHEAD_DAYS);

export const lookInDue = (next: string, today: string): boolean =>
  inDue(next, today, LOOK_AHEAD_DAYS);

/** The newest look: by its day, then by when it was recorded. */
export function latestLook(looks: readonly LogLook[]): LogLook | null {
  let latest: LogLook | null = null;
  for (const look of looks)
    if (!latest || look.on > latest.on || (look.on === latest.on && look.at > latest.at))
      latest = look;
  return latest;
}

/** Whether the time source is one CERT-In names or allows: NIC, NPL or the cloud's own. */
export const timeKnown = (system: Pick<LogSystem, "time_source">): boolean =>
  system.time_source === "nic" || system.time_source === "npl" || system.time_source === "cloud";

export const keepsLongEnough = (system: Pick<LogSystem, "retention_days">): boolean =>
  system.retention_days !== null && system.retention_days >= DIRECTION_IV_DAYS;

/** What a system's record says, in sentences, with the look's day when it is past. */
export function logLines(
  system: Pick<LogSystem, "retention_days" | "place" | "time_source" | "zone_recorded" | "retired">,
  look: { last_on: string | null; added_on: string; next: string; today: string },
): LogLine[] {
  const lines: LogLine[] = [];
  if (system.retention_days === null)
    lines.push({ key: "retention_unknown", words: LOG_LINES.retentionUnknown, attention: true });
  else if (system.retention_days < DIRECTION_IV_DAYS)
    lines.push({
      key: "retention_short",
      words: retentionShortLine(system.retention_days),
      attention: true,
    });
  if (system.place === "outside")
    lines.push({ key: "place_outside", words: LOG_LINES.disagree, attention: false });
  else if (system.place === "" || system.place === "not_known")
    lines.push({ key: "place_unknown", words: LOG_LINES.placeUnknown, attention: true });
  if (system.time_source === "" || system.time_source === "not_known")
    lines.push({ key: "time_unknown", words: LOG_LINES.timeUnknown, attention: true });
  else if (system.time_source === "cloud")
    lines.push({ key: "time_cloud", words: LOG_LINES.timeCloud, attention: false });
  else if (system.time_source === "other")
    lines.push({ key: "time_other", words: LOG_LINES.timeOther, attention: false });
  if (system.zone_recorded === "no")
    lines.push({ key: "zone", words: LOG_LINES.zone, attention: true });
  if (!system.retired && look.next < look.today)
    lines.push({
      key: "look_overdue",
      words: lookOverdueLine(dayWords(look.last_on ?? look.added_on)),
      attention: true,
    });
  return lines;
}
