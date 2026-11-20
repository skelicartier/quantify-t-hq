/**
 * A tool's check lines (ws-notes/security/spec.md §6.5): each a sentence under the row and on
 * the tool's page, in a fixed order. Pure. A shared account's line is informational and only
 * on the tool's page. A retired tool has none.
 */

import { dayWords } from "../../../src/lib/data/labels-company";
import { CHECKS } from "../../../src/lib/data/labels-systems";
import type { Account, Tool } from "./types";

const ADMIN_ROLES = new Set<string>(["owner", "admin"]);

/** Holds customer or personal data. */
export const holdsPeopleData = (tool: Pick<Tool, "holds">): boolean =>
  tool.holds.includes("customer") || tool.holds.includes("personal");

export function checksOf(input: {
  tool: Tool;
  /** The tool's open accounts. */
  open: readonly Account[];
  /** The day it was last looked at, and whether the next look is owed. */
  looked_on: string;
  review_owed: boolean;
  /** On the tool's page: one line per shared account too. */
  page?: boolean;
}): string[] {
  const { tool, open } = input;
  if (tool.retired || tool.status === "retired") return [];
  const lines: string[] = [];
  if (tool.mfa === "none" || tool.mfa === "optional") lines.push(CHECKS.twoStep);
  if (tool.sign_in === "password") lines.push(CHECKS.ownPassword(tool.sso_with));
  if (holdsPeopleData(tool) && !tool.subprocessor) lines.push(CHECKS.notMarked);
  if (tool.subprocessor && !tool.subprocessor.dpa_signed_on) lines.push(CHECKS.noDpa);
  if (input.review_owed) lines.push(CHECKS.notLooked(dayWords(input.looked_on)));
  if ((tool.billing === "monthly" || tool.billing === "yearly") && !tool.renews_on)
    lines.push(CHECKS.noRenewal);
  if (tool.seats !== null && open.length > tool.seats) lines.push(CHECKS.overSeats);
  const adminsWithout = open.filter(
    (account) => ADMIN_ROLES.has(account.role) && account.mfa !== "yes",
  ).length;
  if (adminsWithout > 0) lines.push(CHECKS.adminsWithout(adminsWithout));
  if (input.page)
    for (const account of open) if (account.kind === "shared") lines.push(CHECKS.shared);
  return lines;
}
