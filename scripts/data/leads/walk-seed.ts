/**
 * Invented lead files for the walk and the tests: everyone on a reserved `.example`
 * domain, in about 4,000 invented firms, with one in twenty on `inbox.example` marked
 * `personal-domain` (free mail, not grouped). Nothing here is anyone real.
 */

import { toCsv } from "../text";

export const LEAD_HEADER = [
  "email",
  "first_name",
  "last_name",
  "full_name",
  "title",
  "company",
  "firm_type",
  "website",
  "country",
  "city",
  "phone",
  "registration_no",
  "source",
  "source_url",
  "email_kind",
  "notes",
] as const;

const FIRST = ["Asha", "Ravi", "Meera", "Kabir", "Nisha", "Arjun", "Tara", "Dev", "Isha", "Vikram"];
const LAST = ["Rao", "Shah", "Iyer", "Menon", "Gupta", "Nair", "Bose", "Kapoor", "Das", "Pillai"];
const TITLES = ["Partner", "Analyst", "Portfolio manager", "Principal", "Head of research"];
const TYPES = ["Family office", "Asset manager", "Hedge fund", "Wealth manager", "PMS", "AIF"];
const PLACES: readonly [string, string][] = [
  ["Mumbai", "India"],
  ["Bengaluru", "India"],
  ["Delhi", "India"],
  ["Singapore", "Singapore"],
  ["Dubai", "United Arab Emirates"],
  ["London", "United Kingdom"],
];

export const FIRMS = 4_000;

/** The `index`th invented lead (0-based), the same every time. */
export function inventedLead(index: number): string[] {
  const firm = index % FIRMS;
  const first = FIRST[index % FIRST.length]!;
  const last = LAST[Math.floor(index / FIRST.length) % LAST.length]!;
  const personal = index % 20 === 19;
  const [city, country] = PLACES[firm % PLACES.length]!;
  const email = personal
    ? `${first.toLowerCase()}.${last.toLowerCase()}${index}@inbox.example`
    : `${first.toLowerCase()}.${last.toLowerCase()}${index}@firm${firm}.example`;
  return [
    email,
    first,
    `${last}${index}`,
    `${first} ${last}${index}`,
    TITLES[index % TITLES.length]!,
    `Walk Capital ${firm}`,
    TYPES[firm % TYPES.length]!,
    `https://firm${firm}.example`,
    country,
    city,
    // No leading "+": the writer would defuse it as a formula, and this file is read back.
    `98${String(index).padStart(8, "0")}`,
    `REG${firm}`,
    "Invented register",
    `https://register.example/${firm}`,
    personal ? "personal-domain" : index % 9 === 0 ? "role" : "named",
    index % 50 === 0 ? "Met at an invented conference" : "",
  ];
}

/** Invented leads `from` (inclusive) to `to` (exclusive), as a lead file's text. */
export function leadFileText(from: number, to: number, skip?: (index: number) => boolean): string {
  const rows: string[][] = [];
  for (let index = from; index < to; index += 1) if (!skip?.(index)) rows.push(inventedLead(index));
  return toCsv(LEAD_HEADER, rows);
}

/** People held back: invented addresses that are also in the lead files. */
export function heldBackText(count: number, from = 500): string {
  const rows: string[][] = [];
  for (let index = from; index < from + count; index += 1) {
    const lead = inventedLead(index);
    rows.push([lead[0]!, lead[3]!, lead[5]!]);
  }
  return toCsv(["email", "full_name", "company"], rows);
}

/** The walk's two lead files: 66,000 invented leads between them. */
export const WALK_FILES = [
  { title: "all_leads.csv", from: 0, to: 40_000 },
  { title: "new_leads.csv", from: 40_000, to: 66_000 },
] as const;
export const WALK_HELD = { title: "held_back.csv", count: 120, reason: "Not a buyer" } as const;
