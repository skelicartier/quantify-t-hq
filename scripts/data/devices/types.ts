/**
 * Devices (ws-notes/security/spec.md §7.2): every laptop, desktop, phone and tablet used for
 * work, company or personal, with its monthly self-checks and, for a personal one, the
 * acknowledgement of the personal devices policy on the version it was given. On disk under
 * `data/devices/`; the Owner-only link to a person in the people ledger lives apart, under
 * `data/devices/owner/`, which a backup an Admin makes leaves out. The fields follow the
 * service's asset (`src/lib/api/team.ts`: `asset_id` ↔ `device_id`, `staff_id` ↔ the link,
 * `kind`, `label` ↔ `model`, `serial`, `issued_on`, `returned_on`, `notes`).
 */

import type { Flag } from "../company-contracts";
import type { Staff } from "../protocol";
import type {
  AckHow,
  DeviceKind,
  DevicePlatform,
  Ownership,
} from "../../../src/lib/data/labels-devices";

export type Stamp = {
  created_at: string;
  created_by: Staff;
  updated_at: string;
  updated_by: Staff;
};

export type SelfCheck = {
  check_id: string;
  on: string;
  /** Who checked it on the device. */
  by_name: string;
  /** The computer's own disk encryption is on. */
  encryption: Flag;
  screen_lock_minutes: number | null;
  /** "26.1", as read on the device. */
  os_version: string;
  updates_automatic: Flag;
  password_manager: Flag;
  malware_protection: Flag | "not_applicable";
  firewall: Flag;
  /** Customer data or product secrets kept on it. */
  work_data_local: Flag;
  /** Files, "Security › Devices". */
  evidence_file_ids: string[];
  note: string;
  at: string;
  by: Staff;
};

export type Acknowledgement = {
  ack_id: string;
  policy_file_id: string;
  policy_title: string;
  /** The Files version it was given on. */
  policy_version: number;
  on: string;
  how: AckHow;
  /** Files, "Security › Devices". */
  copy_file_id: string | null;
  by_name: string;
  at: string;
  by: Staff;
};

export type Device = Stamp & {
  device_id: string;
  /** As typed: the holder as the company knows them, never a link to the ledger. */
  holder: string;
  kind: DeviceKind;
  ownership: Ownership;
  model: string;
  serial: string;
  platform: DevicePlatform;
  /** Company devices. */
  issued_on: string | null;
  returned_on: string | null;
  /** No longer used for work. */
  retired: { on: string; why: string; work_removed: Flag } | null;
  checks: SelfCheck[];
  acknowledgements: Acknowledgement[];
  notes: string;
};

export type DevicesSetup = {
  /** His personal devices policy's screen-lock limit, in minutes. */
  screen_lock_max: number | null;
  /** Self-check every … months; null for HQ's default. */
  check_months: number | null;
};

/** One line of `devices/events.jsonl`: field names in words, never their values. */
export type DevicesEvent = {
  event_id: string;
  device_id: string;
  verb: string;
  detail: string;
  by: Staff;
  at: string;
};

/** One line of `devices/owner/events.jsonl`: the verb only. */
export type OwnerEvent = {
  event_id: string;
  device_id: string;
  verb: "linked" | "unlinked";
  by: Staff;
  at: string;
};
