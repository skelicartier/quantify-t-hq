"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";

import {
  AccountApiRequestError,
  enqueueAccountApiAdminReport,
  fetchAccountApiAdminReports,
  fetchAccountApiMe,
  type AccountApiAdminAuditFilters,
} from "@/lib/product/account-api";
import {
  canReadAuditEvents,
  hasAdminPortalAccess,
  hasSatisfiedPrivilegedAssurance,
} from "@/lib/product/access";
import { getCurrentAssurance } from "@/lib/product/assurance-guard";
import { requireSameOriginServerAction } from "@/lib/security/action-origin";
import { createServerAzureClient } from "@/lib/product/session";

export type AdminReportActionState = {
  status: "idle" | "success" | "error";
  message: string;
};

const FILTER_FIELDS = [
  "actor_user_id",
  "event_type",
  "outcome",
  "request_id",
  "session_id",
  "source",
  "subject_user_id",
] as const satisfies readonly (keyof AccountApiAdminAuditFilters)[];

const failure = (message: string): AdminReportActionState => ({
  status: "error",
  message,
});

function singleText(formData: FormData, name: string, limit: number): string | null {
  const values = formData.getAll(name);
  if (values.length > 1) return null;
  const value = values[0];
  if (value === undefined) return "";
  if (typeof value !== "string" || Buffer.byteLength(value, "utf8") > limit) return null;
  return value.trim();
}

function reportFilters(formData: FormData): AccountApiAdminAuditFilters | null {
  const filters: AccountApiAdminAuditFilters = {};
  for (const name of FILTER_FIELDS) {
    const value = singleText(formData, name, 160);
    if (value === null) return null;
    if (value) filters[name] = value;
  }
  return filters;
}

export async function enqueueAdminReport(
  _previous: AdminReportActionState,
  formData: FormData,
): Promise<AdminReportActionState> {
  const revision = singleText(formData, "revision", 64);
  const filters = reportFilters(formData);
  if (revision === null || filters === null) {
    return failure("Check the report fields and try again.");
  }

  try {
    await requireSameOriginServerAction();
    const azure = await createServerAzureClient();
    const accessToken = azure.getAccessToken();
    if (!accessToken) return failure("Sign in again to queue a report.");
    const me = await fetchAccountApiMe(accessToken);
    if (!hasAdminPortalAccess(me) || !canReadAuditEvents(me)) {
      return failure("This account cannot queue reports.");
    }
    if (!hasSatisfiedPrivilegedAssurance(await getCurrentAssurance())) {
      return failure("Verify your authenticator code before queueing reports.");
    }
    const current = await fetchAccountApiAdminReports(accessToken);
    if (current.revision !== revision) {
      return failure("The report queue changed. Reload the page before queueing again.");
    }
    await enqueueAccountApiAdminReport(
      accessToken,
      {
        expected_revision: revision,
        report_type: "audit-events",
        format: "csv",
        filters,
      },
      { idempotencyKey: `portal-${randomUUID()}` },
    );
    revalidatePath("/product/reports");
    return { status: "success", message: "Report queued." };
  } catch (error) {
    if (error instanceof AccountApiRequestError) {
      if (error.status === 409) {
        return failure("The report queue changed. Reload before queueing again.");
      }
      if (error.code === "quota_exceeded") {
        return failure("The report queue is full. Retry later.");
      }
    }
    return failure("Report could not be queued. Reload to check the latest queue.");
  }
}
