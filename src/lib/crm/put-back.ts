/**
 * Which changes a record's History can put back, and how a value written there is read.
 *
 * Only plain fields each record's own update route takes on its own: a name, a choice, an
 * owner, a date, a count. A stage, a status or a next step has rules of its own and is
 * moved where it lives. The audit row keeps values as text (dates in ISO, booleans as
 * True/False, long text cut at two hundred characters), so a value that was cut cannot be
 * put back from it.
 */

export const PUT_BACK_KINDS = ["company", "person", "lead", "deal"] as const;
export type PutBackKind = (typeof PUT_BACK_KINDS)[number];
export type PutBackType = "text" | "bool" | "number" | "date";

export const PUT_BACK_FIELDS: Record<PutBackKind, Readonly<Record<string, PutBackType>>> = {
  company: {
    name: "text",
    domain: "text",
    firm_type: "text",
    team_size_band: "text",
    country: "text",
    lifecycle: "text",
    owner_staff_id: "text",
  },
  person: {
    full_name: "text",
    email: "text",
    title: "text",
    role_category: "text",
    phone: "text",
    company_id: "text",
    do_not_contact: "bool",
  },
  lead: { owner_staff_id: "text" },
  deal: {
    name: "text",
    expected_close_date: "date",
    owner_staff_id: "text",
    seats: "number",
    currency: "text",
  },
};

export function isPutBackKind(kind: string): kind is PutBackKind {
  return (PUT_BACK_KINDS as readonly string[]).includes(kind);
}

/** A value the audit row cut short: it cannot be written back from there. */
function wasCut(text: string): boolean {
  return text.length >= 200 && text.endsWith("…");
}

export function canPutBack(kind: string, field: string, from: string): boolean {
  if (!isPutBackKind(kind)) return false;
  const type = PUT_BACK_FIELDS[kind][field];
  if (!type || wasCut(from)) return false;
  // A count or a value that was never set has nothing to go back to.
  if (type === "number" && from.trim() === "") return false;
  return true;
}

/** The audit row's text as the update route takes it. */
export function putBackValue(type: PutBackType, from: string): string | number | boolean {
  if (type === "bool") return from === "True" || from === "true";
  if (type === "number") return Number(from);
  if (type === "date") return from.slice(0, 10);
  return from;
}

/** Whether a record's current value is still the one the change made. */
export function stillAsChanged(
  type: PutBackType,
  current: unknown,
  to: string,
  field = "",
): boolean {
  if (type === "bool") return Boolean(current) === (to === "True" || to === "true");
  if (type === "number") {
    if (current === null || current === undefined || current === "") return to.trim() === "";
    return Number(current) === Number(to);
  }
  const text = current === null || current === undefined ? "" : String(current);
  if (type === "date") return text.slice(0, 10) === to.slice(0, 10);
  // An id is the same id whatever case the store wrote it in.
  if (field.endsWith("_id")) return text.toLowerCase() === to.toLowerCase();
  return text === to;
}
