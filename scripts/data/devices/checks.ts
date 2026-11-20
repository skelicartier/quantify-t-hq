/**
 * The check lines of Devices (ws-notes/security/spec.md §7.5), pure: what the latest
 * self-check found, in sentences, and what the device itself wants (a first check, an overdue
 * one). The acknowledgement's line comes from `ackStateOf` in `due.ts`.
 */

import {
  CHECK_QUESTIONS,
  DEVICE_LINES,
  checkDueLine,
  notAnsweredLine,
  screenLockLine,
} from "../../../src/lib/data/labels-devices";
import { dayWords } from "../../../src/lib/data/labels-company";
import type { SelfCheck } from "./types";

/** The questions a check left unanswered, in the form's order, as words. */
export function missingOf(check: SelfCheck): string[] {
  const missing: string[] = [];
  if (check.encryption === "") missing.push(CHECK_QUESTIONS.encryption.missing);
  if (check.screen_lock_minutes === null) missing.push(CHECK_QUESTIONS.screen_lock_minutes.missing);
  if (!check.os_version) missing.push(CHECK_QUESTIONS.os_version.missing);
  if (check.updates_automatic === "") missing.push(CHECK_QUESTIONS.updates_automatic.missing);
  if (check.password_manager === "") missing.push(CHECK_QUESTIONS.password_manager.missing);
  if (check.malware_protection === "") missing.push(CHECK_QUESTIONS.malware_protection.missing);
  if (check.firewall === "") missing.push(CHECK_QUESTIONS.firewall.missing);
  if (check.work_data_local === "") missing.push(CHECK_QUESTIONS.work_data_local.missing);
  return missing;
}

/**
 * What a self-check found, in sentences: "Disk encryption is off.", the screen lock against his
 * limit ("Locks after 30 minutes; your personal devices policy says 15."), and so on. "Not
 * applicable" malware protection says nothing; an answer left out is listed once.
 */
export function checkLines(check: SelfCheck | null, limit: number | null): string[] {
  if (!check) return [];
  const lines: string[] = [];
  if (check.encryption === "no") lines.push(DEVICE_LINES.encryptionOff);
  if (check.screen_lock_minutes !== null) {
    const lock = screenLockLine(check.screen_lock_minutes, limit);
    if (lock) lines.push(lock);
  }
  if (check.updates_automatic === "no") lines.push(DEVICE_LINES.updatesOff);
  if (check.password_manager === "no") lines.push(DEVICE_LINES.noPasswordManager);
  if (check.malware_protection === "no") lines.push(DEVICE_LINES.noMalware);
  if (check.firewall === "no") lines.push(DEVICE_LINES.firewallOff);
  if (check.work_data_local === "yes") lines.push(DEVICE_LINES.workDataLocal);
  const missing = missingOf(check);
  if (missing.length > 0) lines.push(notAnsweredLine(missing));
  return lines;
}

/** The newest self-check: by its day, then by when it was recorded. */
export function latestCheck(checks: readonly SelfCheck[]): SelfCheck | null {
  let latest: SelfCheck | null = null;
  for (const check of checks)
    if (!latest || check.on > latest.on || (check.on === latest.on && check.at > latest.at))
      latest = check;
  return latest;
}

/** What a device in use wants: its first check, or an overdue one. */
export function deviceCheckLine(input: {
  in_use: boolean;
  last_on: string | null;
  next: string;
  today: string;
}): string | null {
  if (!input.in_use) return null;
  if (input.last_on === null) return DEVICE_LINES.notChecked;
  return input.next < input.today ? checkDueLine(dayWords(input.next)) : null;
}
