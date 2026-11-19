/**
 * The kinds of incident (ws-notes/duties/spec.md §6.3): CERT-In's list as recalled, keys
 * stable, labels in one table (`INCIDENT_KINDS` in labels-security.ts) so the lead corrects
 * them there after reading Annexure I. "other" is not on the list: no 6-hour clock.
 */

import {
  INCIDENT_KINDS,
  INCIDENT_KIND_KEYS,
  isListedKind,
} from "../../../src/lib/data/labels-security";
import type { IncidentKind } from "./types";

export const KINDS: readonly IncidentKind[] = INCIDENT_KIND_KEYS;

export function isKind(value: unknown): value is IncidentKind {
  return typeof value === "string" && (KINDS as readonly string[]).includes(value);
}

export const kindLabel = (kind: IncidentKind): string => INCIDENT_KINDS[kind];

/** On CERT-In's list: the report is due within the rule's hours of noticing it. */
export const isListed = (kind: IncidentKind): boolean => isListedKind(kind);
