import "server-only";

import { z } from "zod";

import { staffSchema } from "@/lib/data/api/replies";
import type { Staff } from "@/lib/data/gate";
import { dataAsk, ok } from "@/lib/data/socket";

/**
 * The backup: one zip of every file and version, Data's records and Mail merge's lists and
 * logs (never the provider key), made as a build of kind `backup`. When the portal starts
 * sending one to the browser it says so, and that is "Last backup downloaded".
 */

export const lastBackupSchema = z.object({
  at: z.string(),
  bytes: z.number(),
  by: staffSchema,
  build_id: z.string(),
});
export type LastBackup = z.infer<typeof lastBackupSchema>;

export const backupStateSchema = ok.extend({
  last: lastBackupSchema.nullable(),
  no_backup_disk: z.boolean().nullable(),
});
export type BackupState = z.infer<typeof backupStateSchema>;

export const readBackup = () => dataAsk(backupStateSchema, "GET", "/data/backup");

export const noteBackupDownloaded = (buildId: string, by: Staff) =>
  dataAsk(ok.extend({ last: lastBackupSchema }), "POST", "/data/backup/downloaded", {
    build_id: buildId,
    by,
  });
