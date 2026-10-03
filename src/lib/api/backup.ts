import "server-only";

import { z } from "zod";

import { approvalSchema } from "@/lib/api/approval-schema";
import { fetchHqJson, postHqJson } from "@/lib/api/core";
import { EXPORT_COLUMN_TYPES } from "@/lib/exports";

const okEnvelope = z.object({ ok: z.literal(true) });

const backupStateSchema = okEnvelope.extend({
  /** Only an Owner asks for a backup. */
  can_make: z.boolean(),
  /** True when another Owner exists: the backup waits for them to approve. */
  needs_approval: z.boolean(),
  /** The caller's own request, waiting or approved and not yet downloaded. */
  request: approvalSchema.nullable(),
  recent: z.array(
    z.object({
      made_by: z.string(),
      made_at: z.string().nullable(),
      rows: z.number(),
      reason: z.string(),
    }),
  ),
  /** What every backup holds, in the order its files are written. */
  files: z.array(z.object({ name: z.string(), title: z.string() })),
  /** What it leaves out, said in the file too. */
  excluded: z.array(z.string()),
});
export type BackupState = z.infer<typeof backupStateSchema>;

export function readBackup(token: string) {
  return fetchHqJson("hq/backup", backupStateSchema, { token });
}

const requestedSchema = z.union([
  okEnvelope.extend({ pending_approval: z.literal(true), approval: approvalSchema }),
  okEnvelope.extend({ pending_approval: z.literal(false) }),
]);

/** Ask for a backup: it waits for a second Owner when one exists. */
export function requestBackup(token: string, reason: string) {
  return postHqJson("hq/backup/request", requestedSchema, { token, body: { reason } });
}

const cellSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);

const madeSchema = okEnvelope.extend({
  generated_at: z.string(),
  made_by: z.string(),
  /** The second Owner who approved it; empty when no second Owner existed. */
  approved_by: z.string(),
  reason: z.string(),
  rows: z.number(),
  files: z.array(
    z.object({
      name: z.string(),
      title: z.string(),
      columns: z.array(
        z.object({ key: z.string(), label: z.string(), type: z.enum(EXPORT_COLUMN_TYPES) }),
      ),
      table: z.array(z.array(cellSchema)),
    }),
  ),
  excluded: z.array(z.string()),
});
export type Backup = z.infer<typeof madeSchema>;

/** The backup itself, made as it is downloaded and recorded before it leaves. */
export function makeBackup(token: string, choice: { approvalId?: string; reason?: string }) {
  return postHqJson("hq/backup/make", madeSchema, {
    token,
    body: {
      ...(choice.approvalId ? { approval_id: choice.approvalId } : {}),
      ...(choice.reason ? { reason: choice.reason } : {}),
    },
  });
}
