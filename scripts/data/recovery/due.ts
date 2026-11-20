/**
 * The arithmetic of Backups (ws-notes/security/spec.md §5.3), pure: the next restore test and
 * when it enters Due, its words, the check lines, how long a restore took, and Data's own row.
 * A restore test records how long it took; nothing here compares it with anything.
 */

import { addMonths } from "../company-contracts";
import { addDays, localDay } from "../days";
import { inDue } from "../security-contracts";
import { dayWords } from "../../../src/lib/data/labels-company";
import {
  BACKUP_LINES,
  DATA_BACKUP,
  downloadedLine,
  partialLine,
  restoreDueLine,
} from "../../../src/lib/data/labels-devices";
import { spanWords } from "../../../src/lib/data/labels-duties";
import { TEST_AHEAD_DAYS } from "./limits";
import type { Backup, RestoreTest } from "./types";

/**
 * The next restore test: `every_months` after the last (20 Nov 2026, 3 → 20 Feb 2027; 31 May
 * 2026 → 31 Aug 2026); a backup never tested is due on the day it was added.
 */
export function nextTestOf(lastOn: string | null, addedOn: string, everyMonths: number): string {
  return lastOn ? addMonths(lastOn, everyMonths) : addedOn;
}

/** In Due from 14 days before. */
export const testDueFrom = (next: string): string => addDays(next, -TEST_AHEAD_DAYS);

export const testInDue = (next: string, today: string): boolean =>
  inDue(next, today, TEST_AHEAD_DAYS);

/** "Next restore test by 20 Feb 2027", "Restore test due since 31 Aug 2026", "Never restore-tested". */
export function restoreWords(lastOn: string | null, next: string, today: string): string {
  if (lastOn === null) return "Never restore-tested";
  return next < today
    ? `Restore test due since ${dayWords(next)}`
    : `Next restore test by ${dayWords(next)}`;
}

/** The newest restore test: by its day, then by when it was recorded. */
export function latestTest(tests: readonly RestoreTest[]): RestoreTest | null {
  let latest: RestoreTest | null = null;
  for (const test of tests)
    if (!latest || test.on > latest.on || (test.on === latest.on && test.at > latest.at))
      latest = test;
  return latest;
}

/** 75 → "1 hour 15 minutes"; 25 → "25 minutes"; none → null. */
export const minutesWords = (minutes: number | null): string | null =>
  minutes === null ? null : spanWords(minutes);

/** What a backup's record and its last restore say, in sentences. */
export function backupLines(
  backup: Pick<Backup, "off_system" | "retired">,
  last: RestoreTest | null,
  next: string,
  today: string,
): string[] {
  const lines: string[] = [];
  if (backup.off_system === "no") lines.push(BACKUP_LINES.noCopyAway);
  if (backup.retired) return lines;
  if (!last) {
    lines.push(BACKUP_LINES.neverTested);
    return lines;
  }
  if (last.outcome === "partial") lines.push(partialLine(last.note));
  if (last.outcome === "failed") lines.push(BACKUP_LINES.failed);
  if (next < today) lines.push(restoreDueLine(dayWords(next)));
  return lines;
}

/** Data's own row: "Last downloaded 14 Nov 2026" from `backup-last`, or that none was. */
export function dataBackupWords(lastAt: string | null): string {
  return lastAt ? downloadedLine(dayWords(localDay(lastAt))) : DATA_BACKUP.never;
}
