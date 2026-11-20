/**
 * What the walk and the tests use for Logs and time (ws-notes/security/spec.md §7.7): the
 * stand-in tool "Walk Cloud", offered while Systems › Tools is absent. Invented.
 */

import type { ToolView } from "../security-contracts";

/** The id the walk's first one takes (the seed pins it), so the harness can open its page. */
export const WALK_LOG_ID = "walk-log";

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
