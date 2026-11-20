/**
 * The sub-processor list (ws-notes/security/spec.md §6.5): every tool not retired with a
 * sub-processor block, by name, as a CSV with a byte-order mark. It names no person and
 * carries no day of its own making, so an unchanged list is the same bytes, and keeping it
 * again in Files finds the existing copy.
 */

import { toCsv } from "../text";
import { DATA_CLASSES } from "../../../src/lib/data/labels-systems";
import type { Tool } from "./types";

const BOM = "﻿";

export const SUBPROCESSOR_HEADER = [
  "Service",
  "Legal name",
  "Purpose",
  "Data held",
  "Where the data is processed",
  "Data processing agreement signed",
  "Since",
] as const;

/** The tools on the list, by name. */
export function subprocessorsOf(tools: readonly Tool[]): Tool[] {
  return tools
    .filter((tool) => !tool.retired && tool.subprocessor !== null)
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function subprocessorRows(tools: readonly Tool[]): string[][] {
  return subprocessorsOf(tools).map((tool) => [
    tool.name,
    tool.legal_name,
    tool.subprocessor?.purpose ?? "",
    tool.holds.map((key) => DATA_CLASSES[key]).join("; "),
    tool.subprocessor?.locations ?? "",
    tool.subprocessor?.dpa_signed_on ?? "",
    tool.subprocessor?.since ?? "",
  ]);
}

/** The list as a CSV's text, cells defused by `csvCell`. */
export function subprocessorCsv(tools: readonly Tool[]): string {
  return BOM + toCsv([...SUBPROCESSOR_HEADER], subprocessorRows(tools));
}
