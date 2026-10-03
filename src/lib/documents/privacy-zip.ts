import "server-only";

import type { PrivacyPackage } from "@/lib/api/privacy";
import { zipStored } from "@/lib/documents/zip";

/**
 * One person's data as a file to send: `data.json` with every section whole (the
 * machine-readable copy portability asks for), a CSV per section that holds anything, and
 * a README that says what it is and what to check before it goes. A nested value (the
 * custom fields) becomes one column per key in the CSV and stays nested in the JSON.
 */

const FORMULA_LEADS = /^[=+\-@\t\r]/;

function cell(value: unknown): string {
  if (value === null || value === undefined) return "";
  let text = typeof value === "boolean" ? (value ? "yes" : "no") : String(value);
  if (FORMULA_LEADS.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function flatten(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      for (const [inner, innerValue] of Object.entries(value as Record<string, unknown>))
        out[`${key}: ${inner}`] = innerValue;
    } else {
      out[key] = Array.isArray(value) ? value.join("; ") : value;
    }
  }
  return out;
}

function csv(rows: readonly Record<string, unknown>[]): string {
  const flat = rows.map(flatten);
  const columns = [...new Set(flat.flatMap((row) => Object.keys(row)))];
  const lines = [
    columns.map(cell).join(","),
    ...flat.map((row) => columns.map((column) => cell(row[column])).join(",")),
  ];
  return `﻿${lines.join("\r\n")}\r\n`;
}

export function privacyFilename(reference: string): string {
  return `${reference.replace(/[^A-Za-z0-9-]/g, "_") || "privacy-request"}-data.zip`;
}

export function buildPrivacyZip(pack: PrivacyPackage, company: string): Uint8Array {
  const encoder = new TextEncoder();
  const held = pack.sections.filter((section) => section.rows.length > 0);
  const readme = [
    `${pack.name || pack.email}: the personal data ${company || "the company"} holds in HQ.`,
    "",
    `Request:      ${pack.reference} (${pack.kind})`,
    `Address:      ${pack.email || "none given"}`,
    `Made by:      ${pack.made_by}`,
    `Made at:      ${pack.generated_at} (UTC)`,
    `Items:        ${pack.items}`,
    "",
    "Files:",
    "  data.json   every section, whole (the machine-readable copy)",
    ...held.map((section) => `  ${section.key}.csv  ${section.title} (${section.rows.length})`),
    "",
    "Before it is sent:",
    "  - Read it through. Notes and comments our team wrote are marked internal: they are",
    "    personal data too, and any withheld under an exemption is a decision recorded on",
    "    the request, not a deletion from this file.",
    "  - Remove another person's details if any appear inside free text.",
    ...(pack.withheld.length
      ? [
          `  - Not in this file, because the person who made it cannot read them: ${pack.withheld.join(", ")}.`,
          "    An Owner or Admin makes the complete file.",
        ]
      : []),
    "  - Systems outside HQ (mailboxes, the product account, backups) are on the request's",
    "    checklist and answered separately.",
    "",
    "Dates and times are UTC. A value a spreadsheet would run as a formula starts with an",
    "apostrophe. This file is recorded on the request and in HQ's audit log.",
    "",
  ].join("\r\n");
  return zipStored(
    [
      { name: "README.txt", data: encoder.encode(readme) },
      { name: "data.json", data: encoder.encode(`${JSON.stringify(pack, null, 2)}\n`) },
      ...held.map((section) => ({
        name: `${section.key}.csv`,
        data: encoder.encode(csv(section.rows)),
      })),
    ],
    new Date(pack.generated_at),
  );
}
