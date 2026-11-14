import "server-only";

import { notFound } from "next/navigation";

import { hasCapability, requireStaff, type StaffContext } from "@/lib/access/core";
import { dataConfigured } from "@/lib/data/socket";

/**
 * Data exists only where the local service is set up beside the portal (the founder's
 * Mac), and it is for the people who may make mail leave: it holds real people, the
 * investor list and the company's papers. Anyone else signed in is told so.
 */
export async function requireData(
  path: string,
): Promise<{ context: StaffContext; allowed: boolean }> {
  if (!dataConfigured()) notFound();
  const context = await requireStaff(path);
  return { context, allowed: hasCapability(context, "mail:send") };
}

export const DATA_ROLE_LINE = "Data is for Owners and Admins.";

/**
 * A made-up capability that only decides what the rail shows. The rail, the palette and
 * the `g` keys filter the navigation table by capability inside client components, where
 * the environment is not known, so the layout adds this one on the server when the
 * service is set up and the person may use it. Every page still checks for itself.
 */
export const DATA_CAPABILITY = "local:data";

/**
 * Made up like `local:data`, for the Owner only (the effective role, as Admin › Backup checks
 * it): it shows the rail's People link (the people ledger). The pages check the role themselves.
 */
export const DATA_OWNER_CAPABILITY = "local:data:owner";

export function withDataNav(capabilities: readonly string[], role = ""): string[] {
  const held = [...capabilities];
  if (dataConfigured() && capabilities.includes("mail:send") && !held.includes(DATA_CAPABILITY))
    held.push(DATA_CAPABILITY);
  if (held.includes(DATA_CAPABILITY) && role === "owner" && !held.includes(DATA_OWNER_CAPABILITY))
    held.push(DATA_OWNER_CAPABILITY);
  return held;
}
