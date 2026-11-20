import "server-only";

import { z } from "zod";

import { flagSchema } from "@/lib/data/api/company";
import type { CopyInput } from "@/lib/data/api/meetings";
import { staffSchema } from "@/lib/data/api/replies";
import type { Staff } from "@/lib/data/gate";
import { dataAsk, id, ok } from "@/lib/data/socket";

/**
 * Systems › Backups (ws-notes/security/spec.md §7.4): the inventory with each backup's last
 * restore test, how long it took and the next one; Data's own row, from when the backup zip was
 * last downloaded; one backup with its tests; the writes; the CSV. No target anywhere.
 */

const testSchema = z.object({
  test_id: z.string(),
  on: z.string(),
  by_name: z.string(),
  minutes: z.number().nullable(),
  outcome: z.enum(["complete", "partial", "failed"]),
  what_restored: z.string(),
  file_id: z.string().nullable(),
  note: z.string(),
  at: z.string(),
  by: staffSchema,
});

export const backupRowSchema = z.object({
  backup_id: z.string(),
  kind: z.enum(["system", "hq_data"]),
  tool_id: z.string().nullable(),
  name: z.string(),
  what: z.string(),
  how_often: z.enum(["", "continuous", "hourly", "daily", "weekly", "monthly", "by_hand"]),
  where: z.string(),
  off_system: flagSchema,
  cannot_be_changed: flagSchema,
  owner: z.string(),
  every_months: z.number(),
  retired: z.object({ on: z.string(), why: z.string() }).nullable(),
  notes: z.string(),
  created_at: z.string(),
  created_by: staffSchema,
  updated_at: z.string(),
  updated_by: staffSchema,
  tool: z.object({ tool_id: z.string(), name: z.string(), href: z.string() }).nullable(),
  added_on: z.string(),
  last_test: testSchema.nullable(),
  last_minutes: z.string().nullable(),
  tests_count: z.number(),
  next_test: z.string().nullable(),
  tested_in_time: z.boolean(),
  never_tested: z.boolean(),
  due: z.boolean(),
  words: z.string(),
  lines: z.array(z.string()),
  downloaded: z.string().nullable(),
  href: z.string(),
});
export type BackupRow = z.infer<typeof backupRowSchema>;

const toolSchema = z.object({
  tool_id: z.string(),
  name: z.string(),
  critical: z.boolean(),
  holds: z.array(z.string()),
  subprocessor: z.boolean(),
  retired: z.boolean(),
  href: z.string(),
});

export const backupsPageSchema = ok.extend({
  backups: z.array(backupRowSchema),
  counts: z.object({ backups: z.number(), tested_in_time: z.number(), never_tested: z.number() }),
  data_backup: z.object({ last_at: z.string().nullable(), words: z.string() }).nullable(),
  data_listed: z.boolean(),
  tools_loaded: z.boolean(),
  tools: z.array(toolSchema),
  files_here: z.boolean(),
  today: z.string(),
});
export type BackupsPage = z.infer<typeof backupsPageSchema>;

export const backupPageSchema = ok.extend({
  backup: backupRowSchema.extend({
    tests: z.array(
      testSchema.extend({
        how_long: z.string().nullable(),
        file: z.object({ file_id: z.string(), title: z.string() }).nullable(),
      }),
    ),
  }),
  events: z.array(
    z.object({
      event_id: z.string(),
      verb: z.string(),
      detail: z.string(),
      by: staffSchema,
      at: z.string(),
    }),
  ),
  data_backup: z.object({ last_at: z.string().nullable(), words: z.string() }).nullable(),
  tools_loaded: z.boolean(),
  tools: z.array(toolSchema),
  files_here: z.boolean(),
  files: z.array(z.object({ file_id: z.string(), title: z.string(), folder: z.string() })),
  today: z.string(),
});
export type BackupPage = z.infer<typeof backupPageSchema>;

const backupAnswer = ok.extend({ backup: backupRowSchema });
type Fields = Record<string, string>;

export const readBackups = () => dataAsk(backupsPageSchema, "GET", "/data/recovery");

export const readBackup = (backupId: string) =>
  dataAsk(backupPageSchema, "GET", `/data/recovery/${id(backupId)}`);

export const exportBackups = () =>
  dataAsk(ok.extend({ name: z.string(), csv: z.string() }), "GET", "/data/recovery/export");

export const addBackup = (input: Fields, by: Staff, attempt: string) =>
  dataAsk(backupAnswer, "POST", "/data/recovery", { ...input, by, attempt });

export const updateBackup = (backupId: string, input: Fields, by: Staff) =>
  dataAsk(backupAnswer, "POST", `/data/recovery/${id(backupId)}/update`, { ...input, by });

export const recordRestore = (
  backupId: string,
  input: Fields,
  copy: CopyInput,
  by: Staff,
  attempt: string,
) =>
  dataAsk(backupAnswer, "POST", `/data/recovery/${id(backupId)}/tests`, {
    ...input,
    ...copy,
    by,
    attempt,
  });

export const retireBackup = (backupId: string, input: { on: string; why: string }, by: Staff) =>
  dataAsk(backupAnswer, "POST", `/data/recovery/${id(backupId)}/retire`, { ...input, by });
