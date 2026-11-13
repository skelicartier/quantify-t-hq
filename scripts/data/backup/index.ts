/**
 * Backup: one zip of everything Data and Mail merge keep on this Mac (never the provider
 * key), made through Unit 1's builds and streamed through the portal. The overview's
 * Backup block says when one was last downloaded (`backup/last.json`, written when the
 * portal starts sending it) and, when Time Machine has no destination, that the files
 * exist only here. That is asked once, at start, with `tmutil destinationinfo`, which runs
 * without admin rights; when the question cannot be answered the sentence is left out.
 */

import { execFile } from "node:child_process";
import { statfsSync } from "node:fs";

import { Refused } from "../../mail-merge/engine";
import type { DataCore } from "../core";
import { clean, isRouteId } from "../guard";
import type { Staff } from "../protocol";
import { makeBackup } from "./make";

const LAST = "backup/last.json";

export type LastBackup = { at: string; bytes: number; by: Staff; build_id: string };

/** What `tmutil destinationinfo` said: true when no backup disk is set up, null when unknown. */
export function noBackupDisk(output: string): boolean | null {
  if (/no destinations configured/i.test(output)) return true;
  if (/^\s*(Name|Kind|ID)\s*:/m.test(output)) return false;
  return null;
}

function askTimeMachine(): Promise<boolean | null> {
  return new Promise((resolve) => {
    try {
      const child = execFile(
        "/usr/bin/tmutil",
        ["destinationinfo"],
        { timeout: 5_000, windowsHide: true },
        (error, stdout, stderr) => {
          const said = `${stdout ?? ""}\n${stderr ?? ""}`;
          const answer = noBackupDisk(said);
          resolve(error && answer === null ? null : answer);
        },
      );
      child.unref();
    } catch {
      resolve(null);
    }
  });
}

export async function register(core: DataCore): Promise<void> {
  core.store.ensureDir("backup");
  let noDisk: boolean | null = null;
  let diskSet = false;
  let freeOverride: number | null = null;
  // Once, at start, in the background: the answer is ready long before anyone looks.
  void askTimeMachine().then((answer) => {
    if (!diskSet) noDisk = answer;
  });

  const freeBytes = (): number => {
    if (freeOverride !== null) return freeOverride;
    try {
      const stats = statfsSync(core.store.root);
      return Number(stats.bavail) * Number(stats.bsize);
    } catch {
      return Number.MAX_SAFE_INTEGER;
    }
  };

  const last = (): LastBackup | null => {
    const stored = core.store.readJson<Partial<LastBackup> | null>(LAST, null);
    return stored && typeof stored.at === "string" ? (stored as LastBackup) : null;
  };

  core.builds.provide("backup", (handle, input) => makeBackup(core, handle, input, freeBytes));

  core.provideOverview("backup", () => ({
    last_at: last()?.at ?? null,
    no_backup_disk: noDisk,
  }));

  core.route("GET", "/data/backup", () => ({
    last: last(),
    no_backup_disk: noDisk,
  }));

  /** The portal says the bytes started on their way: that is a backup downloaded. */
  core.route("POST", "/data/backup/downloaded", (ctx) => {
    const by = ctx.staff();
    const buildId = clean(ctx.body.build_id, 64);
    const build = isRouteId(buildId) ? core.builds.get(buildId) : null;
    if (!build || build.kind !== "backup")
      throw new Refused(404, "not_found", "That backup is no longer here.");
    if (build.state !== "ready")
      throw new Refused(409, "not_ready", "That backup is still being made.");
    const record: LastBackup = { at: core.now(), bytes: build.bytes ?? 0, by, build_id: buildId };
    core.store.writeJson(LAST, record);
    return { last: record };
  });

  if (core.testRoutes) {
    // The 5 GB floor without filling a disk, and the Time Machine answer without a disk.
    core.route("POST", "/data/_test/backup/free-bytes", (ctx) => {
      const bytes = ctx.body.bytes;
      freeOverride =
        typeof bytes === "number" && Number.isSafeInteger(bytes) && bytes >= 0 ? bytes : null;
      return { free_bytes: freeBytes() };
    });
    core.route("POST", "/data/_test/backup/disk", (ctx) => {
      const state = ctx.body.no_backup_disk;
      diskSet = true;
      noDisk = state === true || state === false ? state : null;
      return { no_backup_disk: noDisk };
    });
  }
}
