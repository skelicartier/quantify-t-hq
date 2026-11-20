/**
 * What the walk and the tests use for Backups (ws-notes/security/spec.md §7.7): the stand-in
 * tools offered while Systems › Tools is absent, and the walk's backup. Invented.
 */

import type { ToolView } from "../security-contracts";

/** The id the walk's first one takes (the seed pins it), so the harness can open its page. */
export const WALK_BACKUP_ID = "walk-backup";

export const WALK_TOOLS: ToolView[] = [
  {
    tool_id: "walk-cloud",
    name: "Walk Cloud",
    critical: true,
    holds: ["customer"],
    subprocessor: true,
    retired: false,
    href: "/data/systems/tools/walk-cloud",
  },
  {
    tool_id: "walk-code",
    name: "Walk Code",
    critical: true,
    holds: ["source_code"],
    subprocessor: false,
    retired: false,
    href: "/data/systems/tools/walk-code",
  },
];

export const WALK_BACKUP = {
  name: "Walk product database",
  what: "The product's database, every table",
  where: "Walk Cloud's backup store, another region",
  minutes: 75,
} as const;
