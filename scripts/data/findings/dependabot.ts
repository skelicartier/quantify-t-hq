/**
 * The code host's dependency alerts, from the file he saves with the printed command
 * (ws-notes/security/spec.md §8.3). HQ never connects to the code host: this reads bytes
 * he chose. At most 3 MiB and 5,000 alerts; one array, or an array of arrays (what
 * `--slurp` gives with `--paginate`), flattened one level. Each alert is checked alone: one
 * that fails is listed with its position and why, and the rest still import. Only the
 * fields §8.3 lists are read; the advisory's long description, its references and its
 * scores are never kept. Pure: no file, no clock.
 */

import { Refused } from "../../mail-merge/engine";
import { clean } from "../guard";
import { istDayOf } from "../security-contracts";
import { decode } from "../text";
import {
  CODE_HOST,
  DISMISS_REASONS,
  HOST_STATE_KEYS,
  type HostState,
} from "../../../src/lib/data/labels-assurance";
import type { Severity } from "../../../src/lib/data/labels-controls";
import { LIMIT, SAY } from "./limits";
import type { DependabotBlock, Finding } from "./types";

export const HTML_URL =
  /^https:\/\/github\.com\/([A-Za-z0-9-]+)\/([A-Za-z0-9._-]+)\/security\/dependabot\/(\d+)$/;
export const GHSA_ID = /^GHSA(-[23456789cfghjmpqrvwx]{4}){3}$/;
const CVE_ID = /^CVE-\d{4}-\d{4,}$/;

/** One alert as read: what a finding is made from. */
export type ParsedAlert = {
  /** "walk-org/walk-app#7" */
  key: string;
  /** 1-based, in the file as flattened. */
  index: number;
  repo: string;
  number: number;
  state: HostState;
  html_url: string;
  package: string;
  ecosystem: string;
  manifest_path: string;
  ghsa_id: string;
  cve_id: string | null;
  summary: string;
  severity: Severity;
  vulnerable_range: string;
  patched: string | null;
  found_on: string;
  fixed_on: string | null;
  dismissed_on: string | null;
  dismissed_reason: string | null;
  dismissed_comment: string;
};

export type Parsed = { alerts: ParsedAlert[]; refused: { index: number; why: string }[] };

type Obj = Record<string, unknown>;
const objectOf = (value: unknown): Obj | null =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Obj) : null;
const textOf = (value: unknown): string => (typeof value === "string" ? value : "");

function severityOf(value: unknown): Severity | null {
  const text = textOf(value).toLowerCase();
  if (text === "moderate") return "medium";
  return text === "critical" || text === "high" || text === "medium" || text === "low"
    ? text
    : null;
}

/** Reads one alert, or says in a sentence why it cannot be. */
function readAlert(raw: unknown, index: number): ParsedAlert | string {
  const at = `Alert ${index}`;
  const alert = objectOf(raw);
  if (!alert) return `${at}: not an alert.`;
  const number = alert.number;
  if (typeof number !== "number" || !Number.isSafeInteger(number) || number < 1)
    return `${at}: no alert number.`;
  const state = textOf(alert.state);
  if (!(HOST_STATE_KEYS as readonly string[]).includes(state))
    return `${at}: its state is not one HQ knows.`;
  const htmlUrl = textOf(alert.html_url);
  const link = HTML_URL.exec(htmlUrl);
  if (!link || Number(link[3]) !== number) return `${at}: its link is not this alert's address.`;
  const dependency = objectOf(alert.dependency);
  const pack = objectOf(dependency?.package);
  const packageName = clean(pack?.name, 200);
  if (!packageName) return `${at}: no package name.`;
  const ecosystem = clean(pack?.ecosystem, 60);
  if (!ecosystem) return `${at}: no package ecosystem.`;
  const advisory = objectOf(alert.security_advisory);
  const ghsa = textOf(advisory?.ghsa_id);
  if (!GHSA_ID.test(ghsa)) return `${at}: no advisory id.`;
  const vulnerability = objectOf(alert.security_vulnerability);
  const severity = severityOf(vulnerability?.severity) ?? severityOf(advisory?.severity);
  if (!severity) return `${at}: no severity.`;
  const foundOn = istDayOf(textOf(alert.created_at));
  if (!foundOn) return `${at}: no day it was found.`;
  const cve = clean(advisory?.cve_id, 40);
  const patched = clean(objectOf(vulnerability?.first_patched_version)?.identifier, 120);
  const dismissedAt = textOf(alert.dismissed_at) || textOf(alert.auto_dismissed_at);
  const reason = clean(alert.dismissed_reason, 40);
  return {
    key: `${link[1]}/${link[2]}#${number}`,
    index,
    repo: `${link[1]}/${link[2]}`,
    number,
    state: state as HostState,
    html_url: htmlUrl,
    package: packageName,
    ecosystem,
    manifest_path: clean(dependency?.manifest_path, 300),
    ghsa_id: ghsa,
    cve_id: CVE_ID.test(cve) ? cve : null,
    summary: clean(advisory?.summary, LIMIT.summary),
    severity,
    vulnerable_range: clean(vulnerability?.vulnerable_version_range, 200),
    patched: patched || null,
    found_on: foundOn,
    fixed_on: istDayOf(textOf(alert.fixed_at)),
    dismissed_on: istDayOf(dismissedAt),
    dismissed_reason: reason || null,
    dismissed_comment: clean(alert.dismissed_comment, LIMIT.comment),
  };
}

/** The file, checked whole and then alert by alert. Throws the page's sentence when it cannot be read at all. */
export function parseAlerts(bytes: Uint8Array): Parsed {
  if (bytes.length === 0) throw new Refused(400, "empty", SAY.empty);
  if (bytes.length > LIMIT.file_bytes) throw new Refused(400, "too_large", SAY.tooLarge);
  let parsed: unknown;
  try {
    parsed = JSON.parse(decode(bytes).replace(/^﻿/, ""));
  } catch {
    throw new Refused(400, "unreadable", SAY.notJson);
  }
  if (!Array.isArray(parsed)) throw new Refused(400, "unreadable", SAY.notList);
  const list: unknown[] =
    parsed.length > 0 && parsed.every((item) => Array.isArray(item))
      ? (parsed as unknown[][]).flat(1)
      : parsed;
  if (list.length > LIMIT.alerts) throw new Refused(400, "too_many", SAY.tooManyAlerts);
  const alerts: ParsedAlert[] = [];
  const refused: Parsed["refused"] = [];
  const seen = new Set<string>();
  for (const [position, raw] of list.entries()) {
    const index = position + 1;
    const read = readAlert(raw, index);
    if (typeof read === "string") refused.push({ index, why: read });
    else if (seen.has(read.key))
      refused.push({ index, why: `Alert ${index}: the same alert is in the file twice.` });
    else {
      seen.add(read.key);
      alerts.push(read);
    }
  }
  return { alerts, refused };
}

// ------------------------------------------------------------------ alert → finding

/** "{package}: {summary}", or the advisory id when there is no summary. */
export const titleOf = (alert: ParsedAlert): string =>
  `${alert.package}: ${alert.summary || alert.ghsa_id}`.slice(0, LIMIT.title);

/** "{GHSA}{ · CVE} · {ecosystem} · {manifest} · affected {range} · fixed in {patched}". */
export function descriptionOf(alert: ParsedAlert): string {
  return [
    alert.cve_id ? `${alert.ghsa_id} · ${alert.cve_id}` : alert.ghsa_id,
    alert.ecosystem,
    alert.manifest_path,
    alert.vulnerable_range ? `affected ${alert.vulnerable_range}` : "",
    `fixed in ${alert.patched ?? "no fixed version yet"}`,
  ]
    .filter(Boolean)
    .join(" · ");
}

export const blockOf = (alert: ParsedAlert, importedAt: string): DependabotBlock => ({
  repo: alert.repo,
  number: alert.number,
  ghsa_id: alert.ghsa_id,
  cve_id: alert.cve_id,
  package: alert.package,
  ecosystem: alert.ecosystem,
  manifest_path: alert.manifest_path,
  vulnerable_range: alert.vulnerable_range,
  patched: alert.patched,
  html_url: alert.html_url,
  state: alert.state,
  dismissed_reason: alert.dismissed_reason,
  imported_at: importedAt,
});

/** A dismissal's decision: "{reason in words}{: comment}", by the code host. */
export function dismissalOf(alert: ParsedAlert, today: string): Finding["decision"] {
  const reason = alert.dismissed_reason
    ? (DISMISS_REASONS[alert.dismissed_reason] ?? alert.dismissed_reason)
    : "Dismissed";
  return {
    why: alert.dismissed_comment ? `${reason}: ${alert.dismissed_comment}` : reason,
    decided_by: CODE_HOST,
    on: alert.dismissed_on ?? today,
  };
}

/** What the alert says the finding's status is, its fixed day and its decision. */
export function statusOf(
  alert: ParsedAlert,
  today: string,
): Pick<Finding, "status" | "fixed_on" | "decision"> {
  if (alert.state === "fixed")
    return { status: "fixed", fixed_on: alert.fixed_on ?? today, decision: null };
  if (alert.state === "dismissed" || alert.state === "auto_dismissed")
    return { status: "dismissed", fixed_on: null, decision: dismissalOf(alert, today) };
  return { status: "open", fixed_on: null, decision: null };
}

export type Plan = "new" | "changed" | "unchanged";

/**
 * Whether importing the alert would make a new finding, change one already here, or leave
 * it as it is. Its status follows the code host's state unless he accepted the risk in HQ;
 * a changed severity changes the finding's; its found day stays.
 */
export function planOf(alert: ParsedAlert, existing: Finding | undefined, today: string): Plan {
  if (!existing) return "new";
  if (existing.severity !== alert.severity) return "changed";
  const block = existing.dependabot;
  if (!block || block.state !== alert.state || block.patched !== alert.patched) return "changed";
  if (existing.status === "accepted") return "unchanged";
  const next = statusOf(alert, today);
  if (existing.status !== next.status || existing.fixed_on !== next.fixed_on) return "changed";
  if (JSON.stringify(existing.decision) !== JSON.stringify(next.decision)) return "changed";
  return "unchanged";
}
