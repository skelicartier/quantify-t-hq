/**
 * "Check every file": every stored version is read again and its SHA-256 compared with
 * the one taken when it came in. Each file gets one activity line, "Checked: unchanged" or
 * "Checked: changed on disk", and the result is kept in `files/check.json` for the page.
 * It runs as a job with progress, yielding between files, so nothing else waits on it.
 */

import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";

import type { DataCore, Job, JobView } from "../core";
import type { Staff } from "../protocol";
import { blobName, type Vault } from "./vault";

export type CheckResult = {
  at: string;
  by_name: string;
  files: number;
  changed: number;
  /** The files whose bytes no longer match, by id: at most 100 kept. */
  changed_ids: string[];
};

async function hashOf(path: string): Promise<string | null> {
  const hash = createHash("sha256");
  try {
    for await (const chunk of createReadStream(path)) hash.update(chunk as Uint8Array);
  } catch {
    return null;
  }
  return hash.digest("hex");
}

export class Checker {
  readonly #core: DataCore;
  readonly #vault: Vault;
  #job: Job | null = null;

  constructor(core: DataCore, vault: Vault) {
    this.#core = core;
    this.#vault = vault;
  }

  last(): CheckResult | null {
    return this.#core.store.readJson<CheckResult | null>("files/check.json", null);
  }

  running(): boolean {
    return this.#job !== null;
  }

  /** Start the check, or say the one already running. */
  start(by: Staff): JobView {
    if (!this.#job) {
      const files = [...this.#vault.files()];
      const job = this.#core.startJob("checking", files.length, "Checking every file");
      this.#job = job;
      void this.#run(
        job,
        files.map((file) => file.file_id),
        by,
      ).finally(() => {
        this.#job = null;
      });
    }
    const job = this.#job;
    return {
      job_id: job.job_id,
      kind: job.kind,
      detail: job.detail,
      done: job.done,
      total: job.total,
      state: job.state,
    };
  }

  async #run(job: Job, ids: string[], by: Staff): Promise<void> {
    const seen = new Map<string, boolean>();
    const changed: string[] = [];
    let files = 0;
    try {
      for (const file_id of ids) {
        const file = this.#vault.file(file_id);
        if (!file) {
          job.advance();
          continue;
        }
        const bad: number[] = [];
        for (const version of file.versions) {
          let fine = seen.get(version.sha256);
          if (fine === undefined) {
            fine =
              (await hashOf(this.#core.store.path(blobName(version.sha256)))) === version.sha256;
            seen.set(version.sha256, fine);
          }
          if (!fine) bad.push(version.n);
        }
        if (bad.length === 0) this.#vault.log(file_id, "Checked: unchanged", "", by);
        else {
          this.#vault.log(
            file_id,
            "Checked: changed on disk",
            `Version ${bad.join(", ")} no longer matches what came in.`,
            by,
          );
          changed.push(file_id);
        }
        files += 1;
        job.advance();
        await this.#core.yield();
      }
      const result: CheckResult = {
        at: this.#core.now(),
        by_name: by.name,
        files,
        changed: changed.length,
        changed_ids: changed.slice(0, 100),
      };
      this.#core.store.writeJson("files/check.json", result);
      job.finish();
    } catch (error) {
      job.fail("The check stopped part way.");
      this.#core.log(`the file check failed: ${error instanceof Error ? error.name : "error"}`);
    }
  }
}
