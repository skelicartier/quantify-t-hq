/**
 * A throwaway sender for walking Mail merge in a browser with nothing able to leave:
 * its provider is a stand-in and its folder is the one given, never the real one.
 *
 *     npx tsx scripts/e2e-mail-merge-sender.ts <folder> <socket> <outbox file>
 */

import { appendFileSync, rmSync } from "node:fs";

import { MergeEngine } from "./mail-merge/engine";
import { WalkProvider } from "./mail-merge/e2e-provider";
import { createMergeServer } from "./mail-merge/server";

const [dir, socket, outbox] = process.argv.slice(2);
if (!dir || !socket || !outbox) {
  console.error("usage: e2e-mail-merge-sender.ts <folder> <socket> <outbox file>");
  process.exit(1);
}

const engine = new MergeEngine({
  dir,
  liveProvider: (key) =>
    new WalkProvider(key, (mail) => appendFileSync(outbox, `${JSON.stringify(mail)}\n`)),
});
rmSync(socket, { force: true });
createMergeServer(engine, false).listen(socket, () => console.log(`[walk] listening on ${socket}`));
void engine.loop((ms) => new Promise((resolve) => setTimeout(resolve, Math.min(ms, 100))));
