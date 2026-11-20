/**
 * The walk's invented dependency alerts (ws-notes/security/spec.md §8.7 FI4, FI5): the
 * shape the printed command saves (`--paginate --slurp`: an array of pages, each an array
 * of alerts) for `walk-org/walk-app`, with advisory ids in the code host's own alphabet and
 * CVE ids from `CVE-2099-0001`. Days are worked from `today` so the walk reads the same on
 * any day: a high alert found today (a customer's duty makes it 7 days), a critical one found
 * ten days ago (overdue, so Home shows a "Finding" row), a fixed low one, and one with no
 * advisory id that the preview refuses. Nothing here is real.
 */

import { addDays } from "../days";

export const WALK_REPO = "walk-org/walk-app";
/** The next finding added by hand after the seed takes this id, so the harness can open it. */
export const WALK_FINDING_ID = "walk-finding";
export const WALK_ALERTS_FILE = "walk-dependabot-alerts.json";

type Alert = Record<string, unknown>;

function alert(
  number: number,
  input: {
    state: string;
    severity: string;
    ghsa: string | null;
    cve: string | null;
    package: string;
    summary: string;
    created_at: string;
    fixed_at?: string;
    patched?: string | null;
  },
): Alert {
  return {
    number,
    state: input.state,
    html_url: `https://github.com/${WALK_REPO}/security/dependabot/${number}`,
    created_at: input.created_at,
    fixed_at: input.fixed_at ?? null,
    dismissed_at: null,
    auto_dismissed_at: null,
    dismissed_reason: null,
    dependency: {
      package: { ecosystem: "npm", name: input.package },
      manifest_path: "package-lock.json",
      scope: "runtime",
    },
    security_advisory: {
      ghsa_id: input.ghsa,
      cve_id: input.cve,
      summary: input.summary,
      description: "An invented advisory's long text, which HQ never keeps.",
      severity: input.severity,
      references: [{ url: "https://walk.example/advisory" }],
      cvss: { score: 7.5 },
    },
    security_vulnerability: {
      severity: input.severity,
      vulnerable_version_range: "< 2.0.1",
      first_patched_version:
        input.patched === null ? null : { identifier: input.patched ?? "2.0.1" },
    },
  };
}

/** Four invented alerts in two pages, as `--slurp` saves them. */
export function walkAlerts(today: string): Alert[][] {
  return [
    [
      alert(1, {
        state: "open",
        severity: "high",
        ghsa: "GHSA-2c3f-4g5h-6j7m",
        cve: "CVE-2099-0001",
        package: "walk-parser",
        summary: "Walk parser reads past the end of a buffer",
        created_at: `${today}T03:00:00Z`,
      }),
      alert(2, {
        state: "open",
        severity: "critical",
        ghsa: "GHSA-4g5h-6j7m-8p9q",
        cve: "CVE-2099-0002",
        package: "walk-session",
        summary: "Walk session tokens can be guessed",
        created_at: `${addDays(today, -10)}T03:00:00Z`,
        patched: null,
      }),
    ],
    [
      alert(3, {
        state: "fixed",
        severity: "low",
        ghsa: "GHSA-8p9q-rvwx-2c3f",
        cve: null,
        package: "walk-colours",
        summary: "Walk colours accepts a long input",
        created_at: `${addDays(today, -40)}T03:00:00Z`,
        fixed_at: `${addDays(today, -30)}T03:00:00Z`,
      }),
      alert(4, {
        state: "open",
        severity: "medium",
        ghsa: null,
        cve: null,
        package: "walk-broken",
        summary: "An alert with no advisory id",
        created_at: `${today}T03:00:00Z`,
      }),
    ],
  ];
}

/** The walk's customer: Walk Capital, with SEBI CSCRF's patch duty in its contract. */
export const WALK_CAPITAL = { entry_id: "walk-capital", firm: "Walk Capital" } as const;
