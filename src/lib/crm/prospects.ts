import type { FilterField } from "@/lib/lists/filters";

/**
 * Prospects: the words and the filter fields the list, the segments page and the import
 * share. The service owns the keys (`account_api/hq/prospects.py`); this module owns how
 * they read on screen. A leaf with no server-only import, so client components use it too.
 */

export const EMAIL_KINDS = ["named", "role", "personal-domain"] as const;

export const EMAIL_KIND_LABELS: Record<string, string> = {
  named: "A person's own address",
  role: "A shared mailbox",
  "personal-domain": "A free-mail address",
  "": "Not judged",
};

/** One word for a table cell. */
export const EMAIL_KIND_SHORT: Record<string, string> = {
  named: "Named",
  role: "Shared",
  "personal-domain": "Free mail",
};

export const VERIFIED_STATES = ["", "valid", "risky", "invalid"] as const;

export const VERIFIED_LABELS: Record<string, string> = {
  "": "Unchecked",
  unchecked: "Unchecked",
  valid: "Valid",
  risky: "Risky (accepts anything)",
  invalid: "Invalid",
};

export const FIT_LABELS: Record<string, string> = {
  A: "Best fit",
  B: "Worth a look",
  C: "Weak fit",
};

export const ORIGIN_LABELS: Record<string, string> = {
  inbound: "Inbound (they wrote to us)",
  prospect: "Prospect (we found them)",
};

export const REGIONS = [
  "India",
  "Americas",
  "Europe",
  "Asia-Pacific",
  "Middle East",
  "Africa",
  "Unknown",
] as const;

/** Why an import left a row out, as a sentence. */
export const LEAD_IMPORT_SKIP_LABELS: Record<string, string> = {
  NO_EMAIL: "No address in the row",
  INVALID_EMAIL: "Not a well-formed address",
  DUPLICATE_IN_FILE: "The same address earlier in the file",
  ALREADY_A_PERSON: "Already a person in the CRM",
  STOPPED: "On the stop list",
  FULL: "The lead table is full",
};

/** The breakdown shown above the list, in this order. */
export const FACETS: readonly { field: string; title: string }[] = [
  { field: "firm_type", title: "Firm type" },
  { field: "region", title: "Region" },
  { field: "country", title: "Country" },
  { field: "email_kind", title: "Kind of address" },
  { field: "fit_band", title: "Fit" },
  { field: "stage", title: "Stage" },
  { field: "verified", title: "Verified" },
  { field: "tags", title: "Tags" },
];

/** How a facet's value reads: "named" → "Named", "" → "Not set". */
export function facetLabel(field: string, value: string, stageLabels: Record<string, string>) {
  if (value === "") return "Not set";
  if (field === "email_kind") return EMAIL_KIND_SHORT[value] ?? value;
  if (field === "fit_band") return `${value} · ${FIT_LABELS[value] ?? ""}`.trim();
  if (field === "stage") return stageLabels[value] ?? value;
  if (field === "verified") return VERIFIED_LABELS[value] ?? value;
  return value;
}

/**
 * The fields the prospect list filters on — the service's `LEAD_FIELDS`, with the kind
 * of input each takes. A test holds these keys to the service's own list.
 */
export function prospectFilterFields(
  stageLabels: Record<string, string>,
  sources: readonly { key: string; label: string }[],
): FilterField[] {
  const choice = (values: readonly string[], labels: Record<string, string>) =>
    values.map((value) => ({ value, label: labels[value] ?? value }));
  return [
    { key: "firm_type", label: "Firm type", kind: "text" },
    { key: "country", label: "Country", kind: "text" },
    {
      key: "region",
      label: "Region",
      kind: "choice",
      choices: REGIONS.map((value) => ({ value, label: value })),
    },
    { key: "city", label: "City", kind: "text" },
    { key: "title", label: "Title", kind: "text" },
    {
      key: "email_kind",
      label: "Kind of address",
      kind: "choice",
      choices: choice(EMAIL_KINDS, EMAIL_KIND_SHORT),
    },
    {
      key: "fit_band",
      label: "Fit",
      kind: "choice",
      choices: ["A", "B", "C"].map((value) => ({
        value,
        label: `${value} · ${FIT_LABELS[value] ?? ""}`,
      })),
    },
    { key: "fit_score", label: "Fit score", kind: "number" },
    { key: "tags", label: "Tags", kind: "text" },
    {
      key: "verified",
      label: "Verified",
      kind: "choice",
      choices: choice(["valid", "risky", "invalid", "unchecked"], VERIFIED_LABELS),
    },
    {
      key: "named",
      label: "Has a name",
      kind: "choice",
      choices: [
        { value: "yes", label: "Yes" },
        { value: "no", label: "No" },
      ],
    },
    {
      key: "stage",
      label: "Stage",
      kind: "choice",
      choices: Object.entries(stageLabels).map(([value, label]) => ({ value, label })),
    },
    {
      key: "source",
      label: "Source",
      kind: "choice",
      choices: sources.map((source) => ({ value: source.key, label: source.label })),
    },
    { key: "owner", label: "Owner", kind: "text" },
    { key: "company", label: "Company", kind: "text" },
    { key: "email", label: "Email", kind: "text" },
    { key: "import", label: "Came in with", kind: "text" },
    { key: "created_days", label: "Days since received", kind: "number" },
    { key: "last_emailed_days", label: "Days since last email", kind: "number" },
    {
      key: "origin",
      label: "Origin",
      kind: "choice",
      choices: [
        { value: "prospect", label: "Prospect" },
        { value: "inbound", label: "Inbound" },
      ],
    },
  ];
}

/** Every key `prospectFilterFields` offers; what the service must also know. */
export const PROSPECT_FIELD_KEYS = [
  "origin",
  "stage",
  "source",
  "owner",
  "company",
  "email",
  "firm_type",
  "country",
  "region",
  "city",
  "title",
  "email_kind",
  "fit_band",
  "fit_score",
  "tags",
  "verified",
  "named",
  "import",
  "created_days",
  "last_emailed_days",
] as const;

/** The list's column → the service's sort name. */
export const PROSPECT_SORTS: Record<string, string> = {
  lead: "name",
  firm: "company",
  type: "firm_type",
  country: "country",
  fit: "fit",
  stage: "stage",
  owner: "owner",
};

/** "tags, comma separated" → clean tags, as the service will store them. */
export function parseTags(raw: string): string[] {
  const out: string[] = [];
  for (const part of raw.split(",")) {
    const tag = part.trim().toLowerCase().replace(/\s+/g, " ").slice(0, 40).trim();
    if (tag && !out.includes(tag)) out.push(tag);
    if (out.length >= 20) break;
  }
  return out;
}
