/**
 * The local sender behind Mail → Mail merge.
 *
 *     npm run mail-merge      (one terminal; the portal reaches it by its socket file)
 *
 * It keeps lists of people read from CSV files, makes one message out to each person and
 * sends them through the mail provider at a pace and a day's limit a person chose. The
 * provider key lives here, in a file only this account can read, never in the portal.
 * Until a key is set every send is practice: each step runs and nothing leaves.
 *
 * What it keeps is in `~/Library/Application Support/hq-mail-merge` (HQ_MAIL_MERGE_DIR
 * to change it): not in the repository, and not in a cache folder the system may clear.
 * It listens on `engine.sock` in that folder (HQ_MAIL_MERGE_SOCKET), not on a port.
 *
 * The Data section (`scripts/data`) runs in this process too, on the same socket, in a
 * worker thread of its own. It starts last and cannot stop the sender from starting:
 * `HQ_DATA=off npm run mail-merge` leaves it out altogether.
 */

import { chmodSync, existsSync, rmSync } from "node:fs";
import { connect } from "node:net";
import { homedir } from "node:os";
import { join } from "node:path";

import type { DataHandle } from "./data/host";
import { MergeEngine } from "./mail-merge/engine";
import { createMergeServer } from "./mail-merge/server";

const dir =
  process.env.HQ_MAIL_MERGE_DIR ??
  join(homedir(), "Library", "Application Support", "hq-mail-merge");
const socket = process.env.HQ_MAIL_MERGE_SOCKET ?? join(dir, "engine.sock");

function answers(path: string): Promise<boolean> {
  return new Promise((resolve) => {
    const probe = connect(path);
    probe.once("connect", () => {
      probe.destroy();
      resolve(true);
    });
    probe.once("error", () => resolve(false));
  });
}

const engine = new MergeEngine({ dir });

if (existsSync(socket)) {
  // Two senders over one folder would each think nobody had been written to.
  if (await answers(socket)) {
    console.error(`[mail-merge] a sender is already running on ${socket}`);
    process.exit(1);
  }
  rmSync(socket, { force: true });
}

// Data starts last, through a dynamic import inside a catch: a syntax error or a missing
// file in its code leaves Mail merge running without it, and says so once.
const data: DataHandle | null =
  process.env.HQ_DATA === "off"
    ? null
    : await import("./data/host")
        .then((host) => host.startData({ dir, engine }))
        .catch((error: unknown) => {
          console.error(`[data] not started: ${error instanceof Error ? error.name : "error"}`);
          return null;
        });
if (!data) console.log("[data] off: Mail merge runs without the Data section");

const server = createMergeServer(engine, true, data?.routes ?? []);
server.listen(socket, () => {
  chmodSync(socket, 0o600);
  const status = engine.status();
  console.log(`[mail-merge] listening on ${socket}`);
  console.log(
    `[mail-merge] ${status.counts.lists} lists, ${status.counts.people} people, ${status.counts.mailings} mailings; ` +
      (status.provider.key_set
        ? "a provider key is set"
        : "no provider key: every send is practice"),
  );
});

void engine.loop((ms) => new Promise((resolve) => setTimeout(resolve, ms)));

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    // A message in flight finishes and is written down; nothing new starts.
    engine.stop();
    void data?.stop();
    server.close(() => {
      rmSync(socket, { force: true });
      process.exit(0);
    });
    setTimeout(() => process.exit(0), 20_000).unref();
  });
}
