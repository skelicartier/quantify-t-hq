import "server-only";

import { notFound } from "next/navigation";

import { hasCapability, requireStaff, type StaffContext } from "@/lib/access/core";
import { mergeConfigured } from "@/lib/merge/api";

/**
 * Mail merge is there only where a sender is set up beside the portal, and it is for the
 * people who may make mail leave. Anyone else signed in is told so rather than shown a
 * list of investors.
 */
export async function requireMerge(
  path: string,
): Promise<{ context: StaffContext; allowed: boolean }> {
  if (!mergeConfigured()) notFound();
  const context = await requireStaff(path);
  return { context, allowed: hasCapability(context, "mail:send") };
}

export const MERGE_ROLE_LINE = "Mail merge is for Owners and Admins.";
