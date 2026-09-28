/**
 * The development sign-in bypass: on only when the app is not a production build AND
 * `HQ_DEV_AUTOLOGIN` names a persona in `.env.local`. In a production build the flag is
 * ignored, the route answers not-found and the proxy never points at it, so this file
 * can exist in the tree without existing in the product.
 */

export const DEV_PERSONAS = [
  { email: "owner@hq.test", label: "Owner" },
  { email: "admin@hq.test", label: "Admin" },
  { email: "sales@hq.test", label: "Sales" },
  { email: "support@hq.test", label: "Support" },
  { email: "intern@hq.test", label: "Intern (read-only)" },
] as const;

export function devAutologinPersona(): string | null {
  if (process.env.NODE_ENV === "production") return null;
  const value = (process.env.HQ_DEV_AUTOLOGIN ?? "").trim();
  return value ? value : null;
}

export function isDevPersona(email: string): boolean {
  return DEV_PERSONAS.some((persona) => persona.email === email);
}
