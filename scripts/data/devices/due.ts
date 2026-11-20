/**
 * The arithmetic of Devices (ws-notes/security/spec.md §5.3), pure: the next self-check and
 * when it enters Due, whether a personal device's acknowledgement is on the policy's current
 * version, and what is owed on a leaver's device. Days are `YYYY-MM-DD`; months move with
 * `addMonths` (the same date, or that month's last day).
 */

import { addMonths } from "../company-contracts";
import { addDays } from "../days";
import { deviceByOf, inDue } from "../security-contracts";
import { PRACTICES } from "../../../src/lib/data/labels-controls";
import {
  DEVICE_LINES,
  OWED_WORDS,
  ackMovedLine,
  ackOtherLine,
  type Ownership,
} from "../../../src/lib/data/labels-devices";
import { CHECK_AHEAD_DAYS } from "./limits";
import type { Acknowledgement, Device, DevicesSetup } from "./types";

/** His months between self-checks, or HQ's default (every month). */
export const checkMonthsOf = (setup: DevicesSetup): number =>
  setup.check_months ?? PRACTICES.device_check.amount;

/**
 * The next self-check: his months after the last one (31 Jan 2027 → 28 Feb 2027); a device
 * never checked is due on the day it was added.
 */
export function nextCheckOf(lastOn: string | null, addedOn: string, months: number): string {
  return lastOn ? addMonths(lastOn, months) : addedOn;
}

/** In Due from 7 days before: 28 Feb 2027 → 21 Feb 2027. */
export const checkDueFrom = (next: string): string => addDays(next, -CHECK_AHEAD_DAYS);

export const checkInDue = (next: string, today: string): boolean =>
  inDue(next, today, CHECK_AHEAD_DAYS);

/** "Checked in the last month": checked at least once, and the next one not yet past. */
export const checkedInTime = (lastOn: string | null, next: string, today: string): boolean =>
  lastOn !== null && next >= today;

/** The linked personal devices policy as Files holds it now. */
export type PolicyNow = {
  file_id: string;
  title: string;
  /** The current version's number in Files. */
  version: number;
  /** The day that version was added (`localDay` of its `added_at`), when known. */
  version_on: string | null;
};

export type AckState = {
  /**
   * `not_needed`: a company device, or one no longer in use; `none`: none given; `current`: on
   * the policy's current version; `moved`: an older version or another document; `unchecked`:
   * one is given and there is no linked policy to check its version against.
   */
  state: "not_needed" | "none" | "current" | "moved" | "unchecked";
  latest: Acknowledgement | null;
  /** The day a Due row asks for one: the day the device was added, or the day the version moved. */
  due_on: string | null;
  /** The device's line, or null. */
  words: string | null;
};

/** The newest acknowledgement: by its day, then by when it was recorded. */
export function latestAck(acks: readonly Acknowledgement[]): Acknowledgement | null {
  let latest: Acknowledgement | null = null;
  for (const ack of acks)
    if (!latest || ack.on > latest.on || (ack.on === latest.on && ack.at > latest.at)) latest = ack;
  return latest;
}

export function ackStateOf(input: {
  ownership: Ownership;
  in_use: boolean;
  added_on: string;
  acks: readonly Acknowledgement[];
  /** Undefined when the policies are not loaded here, null when none is linked. */
  policy: PolicyNow | null | undefined;
}): AckState {
  const latest = latestAck(input.acks);
  if (input.ownership !== "personal" || !input.in_use)
    return { state: "not_needed", latest, due_on: null, words: null };
  if (!latest) return { state: "none", latest, due_on: input.added_on, words: DEVICE_LINES.noAck };
  const policy = input.policy;
  if (!policy) return { state: "unchecked", latest, due_on: null, words: null };
  const movedOn = policy.version_on ?? input.added_on;
  if (latest.policy_file_id !== policy.file_id)
    return { state: "moved", latest, due_on: movedOn, words: ackOtherLine(policy.version) };
  if (latest.policy_version < policy.version)
    return {
      state: "moved",
      latest,
      due_on: movedOn,
      words: ackMovedLine(latest.policy_version, policy.version),
    };
  return { state: "current", latest, due_on: null, words: null };
}

/** What is owed on a leaver's device (Owner only), once the offboarding has a last day. */
export type Owed = { by: string; words: string; done: boolean };

/**
 * A company device back by the last day (27 Nov 2026 → 27 Nov 2026); work data off a
 * personal one within 5 days (→ 2 Dec 2026). Done once it is returned (company) or no longer
 * used for work with work data removed (personal).
 */
export function owedOf(
  lastDay: string | null,
  device: Pick<Device, "ownership" | "returned_on" | "retired">,
): Owed | null {
  if (!lastDay) return null;
  return {
    by: deviceByOf(lastDay, device.ownership),
    words: OWED_WORDS[device.ownership],
    done:
      device.ownership === "company"
        ? device.returned_on !== null
        : device.retired?.work_removed === "yes",
  };
}
