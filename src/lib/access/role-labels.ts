/**
 * How HQ roles read on screen. The UI never decides what a role MAY do — that is the
 * capability list the service returns — it only names them for people.
 */

export type RoleTone = "owner" | "admin" | "support" | "user";

const LABELS: Record<string, string> = {
  owner: "Owner",
  admin: "Admin",
  sales: "Sales",
  support: "Support",
  intern_readonly: "Intern",
};

const DESCRIPTIONS: Record<string, string> = {
  owner: "Everything, including granting Owner and Admin.",
  admin: "Runs the portal: staff, settings, integrations, exports.",
  sales: "Works the pipeline and reads revenue.",
  support: "Runs the desk and reads the customer picture.",
  intern_readonly:
    "Reads the CRM, the pipeline and the desk. No writes, no revenue, no team records.",
};

export function roleLabel(role: string | null | undefined): string {
  return LABELS[role ?? ""] ?? "Staff";
}

export function roleDescription(role: string | null | undefined): string {
  return DESCRIPTIONS[role ?? ""] ?? "";
}

/** Maps HQ roles onto the badge palette the stylesheet already has. */
export function roleTone(role: string | null | undefined): RoleTone {
  switch (role) {
    case "owner":
      return "owner";
    case "admin":
      return "admin";
    case "sales":
    case "support":
      return "support";
    default:
      return "user";
  }
}

const KIND_LABELS: Record<string, string> = {
  founder: "Founder",
  employee: "Employee",
  intern: "Intern",
  contractor: "Contractor",
};

export const STAFF_KINDS = ["founder", "employee", "intern", "contractor"] as const;

export function kindLabel(kind: string | null | undefined): string {
  return KIND_LABELS[kind ?? ""] ?? "Staff";
}

/** Every role, most powerful first; which of them a caller may grant is the service's call. */
export const ROLE_ORDER = ["owner", "admin", "sales", "support", "intern_readonly"] as const;
