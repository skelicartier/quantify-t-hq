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
  intern_readonly: "Reads the working surfaces. No writes, no revenue, no records of people.",
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
