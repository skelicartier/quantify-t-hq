/**
 * The policy register (ws-notes/security/spec.md §8.2): which Files document is each policy
 * a buyer asks for, and who owns and approved it. HQ writes no policy: the version and the
 * next review are read from Files. On disk under `data/policies/`. The HQ service's policy
 * state (`src/lib/api/team.ts`: `key`, `title`, `version`, `url`) keeps those names.
 */

import type { Staff } from "../protocol";

export type PolicyEntry = {
  /** A `PolicyKey`, or "own-<uuid>" for one of his own. */
  key: string;
  /** "" for a `PolicyKey`: `POLICY_SET`'s title is used. */
  title: string;
  file_id: string | null;
  owner: string;
  approved_by: string;
  approved_on: string | null;
  not_needed: { why: string; on: string } | null;
  note: string;
  created_at: string;
  created_by: Staff;
  updated_at: string;
  updated_by: Staff;
};

export type PoliciesEvent = {
  event_id: string;
  key: string;
  verb: string;
  /** Field names, never values. */
  detail: string;
  by: Staff;
  at: string;
};
