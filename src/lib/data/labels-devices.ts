/**
 * The words of Systems › Devices, Logs and time, and Backups (ws-notes/security/spec.md §7):
 * what each kind, place, source and outcome is called, the sentences the service writes beside
 * a check, and the empty states. Pure: no file, no clock. The service imports it relatively,
 * the pages through `@/`. A record and a reminder, not legal or certification advice.
 */

import { countWords } from "./labels-controls";

// ------------------------------------------------------------------ devices

export const DEVICE_KINDS = {
  laptop: "Laptop",
  desktop: "Desktop",
  phone: "Phone",
  tablet: "Tablet",
  other: "Other",
} as const;
export type DeviceKind = keyof typeof DEVICE_KINDS;

export const OWNERSHIPS = { company: "Company", personal: "Personal" } as const;
export type Ownership = keyof typeof OWNERSHIPS;

/** The system a device runs, as the holder reads it. */
export const DEVICE_PLATFORMS = {
  mac: "Mac",
  windows: "Windows",
  linux: "Linux",
  ios: "iOS",
  android: "Android",
  chromeos: "ChromeOS",
  other: "Other",
} as const;
export type DevicePlatform = keyof typeof DEVICE_PLATFORMS;

export const ACK_HOW = { signed: "Signed", email: "By email", in_person: "In person" } as const;
export type AckHow = keyof typeof ACK_HOW;

/** Yes, No, Not known, and for malware protection Not applicable. */
export const CHECK_FLAGS = {
  yes: "Yes",
  no: "No",
  not_applicable: "Not applicable",
  "": "Not known",
} as const;

/** A self-check's questions, in the order the form asks them, with the hint each carries. */
export const CHECK_QUESTIONS = {
  encryption: {
    label: "Disk encryption",
    hint: "The computer's own disk encryption is on.",
    missing: "disk encryption",
  },
  screen_lock_minutes: {
    label: "Screen locks after, in minutes",
    hint: "How long it waits before it locks itself.",
    missing: "screen lock",
  },
  os_version: {
    label: "System version",
    hint: "As the device shows it.",
    missing: "system version",
  },
  updates_automatic: {
    label: "Updates install by themselves",
    hint: "The system's own automatic updates are on.",
    missing: "automatic updates",
  },
  password_manager: {
    label: "A password manager is used",
    hint: "For every work sign-in.",
    missing: "password manager",
  },
  malware_protection: {
    label: "Malware protection is on",
    hint: "Not applicable where the system has it built in and nothing else is needed.",
    missing: "malware protection",
  },
  firewall: { label: "The firewall is on", hint: "", missing: "firewall" },
  work_data_local: {
    label: "Customer data or product secrets are kept on it",
    hint: "Copies kept on the device itself, not only in the cloud.",
    missing: "work data kept on it",
  },
} as const;
export type CheckQuestion = keyof typeof CHECK_QUESTIONS;

export const DEVICE_VIEWS = {
  active: "In use",
  returned: "Returned or retired",
  all: "All",
} as const;
export type DeviceView = keyof typeof DEVICE_VIEWS;

export const DEVICES_ABOUT =
  "Every laptop and phone used for work, company or personal, with its monthly self-check and, for a personal one, the signed acknowledgement of the personal devices policy.";

export const DEVICES_EMPTY =
  "No devices recorded. Add every laptop and phone used for work, interns' personal ones too: a buyer asks how each is protected, and a personal device needs a signed acknowledgement.";

export const DEVICE_CHECK_HINT =
  "Ask the holder to read each one on the device and send a screenshot.";

/** "Walk Laptop 14", or the kind when no model was typed. */
export function deviceLabel(device: { model: string; kind: DeviceKind }): string {
  return device.model || DEVICE_KINDS[device.kind];
}

/** "laptop": the kind as a word inside a sentence. */
export const kindWord = (kind: DeviceKind): string => DEVICE_KINDS[kind].toLowerCase();

/** "Locks after 30 minutes." with his limit, or without one. */
export function screenLockLine(minutes: number, limit: number | null): string | null {
  const after = `Locks after ${countWords(minutes, "minute")}`;
  if (limit === null) return `${after}.`;
  return minutes > limit ? `${after}; your personal devices policy says ${limit}.` : null;
}

export const DEVICE_LINES = {
  encryptionOff: "Disk encryption is off.",
  updatesOff: "Updates are not automatic.",
  noPasswordManager: "No password manager.",
  noMalware: "No malware protection.",
  firewallOff: "The firewall is off.",
  workDataLocal: "Customer data or product secrets are kept on it.",
  notChecked: "Not checked yet.",
  noAck: "No personal-device acknowledgement.",
  policyNotLinked:
    "The personal devices policy is not linked in Assurance, so its version is not checked.",
} as const;

export const notAnsweredLine = (missing: readonly string[]): string =>
  `Not answered: ${missing.join(", ")}.`;

export const checkDueLine = (day: string): string => `Self-check due since ${day}.`;

export const ackMovedLine = (given: number, now: number): string =>
  `Acknowledged version ${given}; the policy is now version ${now}.`;

export const ackOtherLine = (now: number): string =>
  `Acknowledged on another document; the personal devices policy is version ${now}.`;

/** What is owed on a leaver's device (Owner only), and by when. */
export const OWED_WORDS = {
  company: "By the last day",
  personal: "Within 5 days of the last day",
} as const;

export const owedTitle = (ownership: Ownership, label: string, name: string): string =>
  ownership === "company"
    ? `Get the ${label} back from ${name}`
    : `Check work data is off ${name}'s ${label}`;

// ------------------------------------------------------------------ logs and time

export const LOG_PLACES = {
  "": "Not recorded",
  india: "Yes",
  outside: "Outside India",
  not_known: "Not known",
} as const;
export type LogPlace = keyof typeof LOG_PLACES;

export const TIME_SOURCES = {
  "": "Not recorded",
  nic: "NIC",
  npl: "NPL",
  cloud: "The cloud's own time service",
  other: "Another source",
  not_known: "Not known",
} as const;
export type TimeSource = keyof typeof TIME_SOURCES;

export const LOG_LINES = {
  retentionUnknown: "How long its logs are kept is not recorded.",
  placeUnknown: "Whether its logs are kept in India is not recorded.",
  disagree: "The sources disagree. Confirm with your lawyer.",
  timeUnknown: "Which clock it keeps time by is not known.",
  timeCloud: "Uses its cloud's own time service, which CERT-In's FAQ 42 allows.",
  timeOther: "Another time source is allowed if it does not deviate from NIC and NPL.",
  zone: "The time zone is not kept with each time.",
} as const;

export const retentionShortLine = (days: number): string =>
  `Kept ${countWords(days, "day")}; direction (iv) says a rolling 180 days.`;

export const lookOverdueLine = (day: string): string => `Not looked at since ${day}.`;

export const LOGS_ABOUT =
  "Each system that keeps logs: what it logs, where they go, how long they stay, whether they are kept in India, and which clock it keeps time by.";

export const LOGS_EMPTY =
  "No systems recorded. Add each system that keeps logs: the product's servers, the cloud account, the mail suite, the code host. Where the logs go and how long they stay is asked for when an incident is reported.";

export const TIME_SERVERS_LINE =
  "NIC's time servers: samay1.nic.in, samay2.nic.in. NPL's: time.nplindia.org (CERT-In's FAQ 43, May 2022).";

// ------------------------------------------------------------------ backups

export const BACKUP_KINDS = {
  system: "A system's backup",
  hq_data: "Data's own backup, the zip from this Mac",
} as const;
export type BackupKind = keyof typeof BACKUP_KINDS;

export const HOW_OFTEN = {
  "": "Not recorded",
  continuous: "Continuously",
  hourly: "Every hour",
  daily: "Every day",
  weekly: "Every week",
  monthly: "Every month",
  by_hand: "By hand",
} as const;
export type HowOften = keyof typeof HOW_OFTEN;

export const OUTCOMES = { complete: "Complete", partial: "Partial", failed: "Failed" } as const;
export type Outcome = keyof typeof OUTCOMES;

export const BACKUP_LINES = {
  noCopyAway: "There is no copy away from the system itself.",
  neverTested: "Never restore-tested.",
  failed: "The last restore failed.",
} as const;

export const partialLine = (missing: string): string =>
  missing
    ? `The last restore was partial: ${missing.replace(/[.\s]+$/, "")}. Record it as a finding.`
    : "The last restore was partial. Record it as a finding.";

export const restoreDueLine = (day: string): string => `Restore test due since ${day}.`;

/** Data's own row: "Data on this Mac · the backup zip · by hand". */
export const DATA_BACKUP = {
  name: "Data on this Mac",
  what: "the backup zip",
  how: "by hand",
  never: "No backup of Data has been downloaded yet.",
} as const;
export const downloadedLine = (day: string): string => `Last downloaded ${day}`;

export const BACKUPS_ABOUT =
  "Each backup the company keeps: what it holds, how often, where, whether a copy is kept away from the system, and each restore test with how long it took and what came back.";

export const BACKUPS_EMPTY =
  "No backups recorded. Add each one: the product's database, the code, the mail suite's export, Data's own zip. Then record a restore: a backup is only proven by restoring it.";
