import "server-only";

import { z } from "zod";

import { approvalSchema } from "@/lib/api/approval-schema";
import { fetchHqJson, postHqJson } from "@/lib/api/core";
import { apiKeySchema } from "@/lib/api/keys";

export { approvalSchema, type Approval } from "@/lib/api/approval-schema";

const okEnvelope = z.object({ ok: z.literal(true) });

const approvalsSchema = okEnvelope.extend({
  approvals: z.array(approvalSchema),
  pending: z.number(),
  awaiting_me: z.number(),
  to_collect: z.number(),
  ttl_hours: z.number(),
  approver_roles: z.record(z.string(), z.array(z.string())),
});
export type ApprovalsPage = z.infer<typeof approvalsSchema>;

export function readApprovals(token: string) {
  return fetchHqJson("hq/approvals", approvalsSchema, { token });
}

const decidedSchema = okEnvelope.extend({
  approval: approvalSchema,
  /** What approving carried out; empty for a key, which the requester collects. */
  executed: z.record(z.string(), z.unknown()).optional(),
});

export function approveRequest(token: string, approvalId: string, note: string) {
  return postHqJson(`hq/approvals/${approvalId}/approve`, decidedSchema, {
    token,
    body: { note },
  });
}

export function declineRequest(token: string, approvalId: string, note: string) {
  return postHqJson(`hq/approvals/${approvalId}/decline`, decidedSchema, {
    token,
    body: { note },
  });
}

export function withdrawRequest(token: string, approvalId: string) {
  return postHqJson(`hq/approvals/${approvalId}/withdraw`, decidedSchema, { token, body: {} });
}

const collectedSchema = okEnvelope.extend({
  approval: approvalSchema,
  key: apiKeySchema,
  /** The full key, in the only response that ever carries it. */
  secret: z.string(),
});

export function collectRequest(token: string, approvalId: string) {
  return postHqJson(`hq/approvals/${approvalId}/collect`, collectedSchema, { token, body: {} });
}
