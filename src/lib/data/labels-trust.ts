import type { PackNeed } from "./labels";

export type PackKind = "data_room" | "trust";
export const PACK_KINDS: Record<PackKind, string> = {
  data_room: "Data-room pack",
  trust: "Trust pack",
};

/** A line that every trust pack has, or only one marked "For Labs too". */
export type TrustFor = "all" | "labs";

export const TRUST_CHECKLIST = {
  questionnaire: {
    label: "Security questionnaire answers",
    need: "required",
    for: "all",
    why: "Your standard answers, kept as one file in Files with its versions: buyers send spreadsheets of up to 200 questions.",
  },
  infosec_policy: {
    label: "Information security policy",
    need: "required",
    for: "all",
    why: "How the company protects its systems and data, kept current by the founders.",
  },
  access_policy: {
    label: "Access control policy",
    need: "required",
    for: "all",
    why: "Who gets access to what, how it is granted, and how it is taken away.",
  },
  incident_policy: {
    label: "Incident response plan",
    need: "required",
    for: "all",
    why: "What happens in the first hours and days after a breach, and who is told.",
  },
  data_policy: {
    label: "Data handling and privacy policy",
    need: "required",
    for: "all",
    why: "What personal and client data is held, where, for how long, and who can see it.",
  },
  continuity: {
    label: "Business continuity and disaster recovery",
    need: "expected",
    for: "all",
    why: "How the service carries on, and comes back, after an outage.",
  },
  certification: {
    label: "ISO 27001 or SOC 2: status and plan",
    need: "required",
    for: "all",
    why: "Where the company stands and when an audit is due. “Working towards” with an auditor named is the floor buyers accept from a new firm.",
  },
  pen_test: {
    label: "Penetration test report",
    need: "expected",
    for: "all",
    why: "A recent test by a third party; buyers expect one a year.",
  },
  insurance: {
    label: "Insurance certificate",
    need: "expected",
    for: "all",
    why: "Cyber and professional indemnity cover, and any other the company holds.",
  },
  accounts: {
    label: "Accounts or an accountant's letter",
    need: "expected",
    for: "all",
    why: "Two years of accounts; an accountant's letter while there are none.",
  },
  references: {
    label: "References, with their consent",
    need: "if_any",
    for: "all",
    why: "Only people who have agreed to be named. Waitlist › Diligence records each consent.",
  },
  regulated_buyers: {
    label: "Answers for regulated Indian buyers",
    need: "if_any",
    for: "all",
    why: "Where data and keys are held, which cloud, and a software bill of materials.",
  },
  provenance: {
    label: "Data provenance",
    need: "required",
    for: "labs",
    why: "Where each dataset comes from, and on what terms it was collected.",
  },
  dictionary: {
    label: "Data dictionary",
    need: "required",
    for: "labs",
    why: "Every field, what it means, and how it changes from version to version.",
  },
  mnpi_policy: {
    label: "Material non-public information policy",
    need: "required",
    for: "labs",
    why: "How inside information is kept out of the data, and who to tell if it gets in.",
  },
  alt_data_answers: {
    label: "Alternative-data diligence answers",
    need: "if_any",
    for: "labs",
    why: "The standard questionnaire funds send data vendors, answered once.",
  },
} as const satisfies Record<string, { label: string; need: PackNeed; for: TrustFor; why: string }>;
export type TrustCover = keyof typeof TRUST_CHECKLIST;

/** Where a trust pack's candidates come from first. */
export const TRUST_FIRST_FOLDERS = ["ip", "contracts", "finance", "team"] as const;
