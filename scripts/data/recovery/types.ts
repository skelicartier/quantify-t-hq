/**
 * Backups (ws-notes/security/spec.md §7.2): the backup inventory and each restore test with
 * how long it took and what came back. On disk under `data/recovery/` (not `data/backup/`,
 * which is Data's own zip and nobody's this batch). The fields follow the service's continuity
 * test (`src/lib/api/trust.ts`: `performed_on` ↔ `on`, `participants` ↔ `by_name`,
 * `actual_minutes` ↔ `minutes`, `outcome`, `notes`); its `target_minutes` and `met_target` have
 * no counterpart here, by his rule: a restore test records what happened, never a target.
 */

import type { Flag } from "../company-contracts";
import type { Staff } from "../protocol";
import type { BackupKind, HowOften, Outcome } from "../../../src/lib/data/labels-devices";

export type RestoreTest = {
  test_id: string;
  on: string;
  by_name: string;
  /** How long it took; never compared with anything. */
  minutes: number | null;
  outcome: Outcome;
  what_restored: string;
  /** Files, "Security › Backups". */
  file_id: string | null;
  note: string;
  at: string;
  by: Staff;
};

export type Backup = {
  backup_id: string;
  /** At most one `hq_data` row in use: Data's own zip. */
  kind: BackupKind;
  tool_id: string | null;
  /** "Product database". */
  name: string;
  what: string;
  how_often: HowOften;
  where: string;
  /** A copy kept away from the system itself. */
  off_system: Flag;
  /** A copy nobody can alter or delete for a while. */
  cannot_be_changed: Flag;
  owner: string;
  /** Restore tests, every 1 to 12 months; 3 by default. */
  every_months: number;
  tests: RestoreTest[];
  retired: { on: string; why: string } | null;
  notes: string;
  created_at: string;
  created_by: Staff;
  updated_at: string;
  updated_by: Staff;
};

/** One line of `recovery/events.jsonl`: field names in words, never their values. */
export type RecoveryEvent = {
  event_id: string;
  backup_id: string;
  verb: string;
  detail: string;
  by: Staff;
  at: string;
};
