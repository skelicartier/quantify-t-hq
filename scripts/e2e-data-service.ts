/**
 * A throwaway Mail merge sender with the Data section, for walking Data in a browser with
 * nothing able to leave: its provider is a stand-in that writes to an outbox file, its
 * folder is the one given (never the real one), and every person in it is invented.
 *
 *     npx tsx scripts/e2e-data-service.ts <folder> <socket> <outbox file>
 *
 * It refuses a folder under ~/Library/Application Support and a socket that already
 * answers. It seeds Mail merge (the settings, the walk key, 20 lists of 290, one live
 * mailing sent in full to "Walk 01", one practice mailing), starts Data with its test
 * routes, then calls `seed(socketPath)` from every `scripts/data-walk/*.ts` that has one.
 */

import { appendFileSync, existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import type { Server } from "node:http";
import { connect } from "node:net";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { startData } from "./data/host";
import type { WalkModule } from "./data-walk/kit";
import { WALK_KEY, WalkProvider } from "./mail-merge/e2e-provider";
import { MergeEngine } from "./mail-merge/engine";
import type { MailProvider } from "./mail-merge/provider";
import { createMergeServer, type JsonRoute } from "./mail-merge/server";

const [dirArg, socketArg, outboxArg] = process.argv.slice(2);
if (!dirArg || !socketArg || !outboxArg) {
  console.error("usage: e2e-data-service.ts <folder> <socket> <outbox file>");
  process.exit(1);
}
const dir = resolve(dirArg);
const socket = resolve(socketArg);
const outbox = resolve(outboxArg);

const appSupport = join(homedir(), "Library", "Application Support");
for (const path of [dir, socket, outbox]) {
  if (path === appSupport || path.startsWith(`${appSupport}/`)) {
    console.error(`[walk] refusing ${path}: that is where the real service keeps its data`);
    process.exit(1);
  }
}

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

if (existsSync(socket)) {
  if (await answers(socket)) {
    console.error(`[walk] refusing: something already answers on ${socket}`);
    process.exit(1);
  }
  rmSync(socket, { force: true });
}
mkdirSync(dir, { recursive: true, mode: 0o700 });

// ------------------------------------------------------------------ the sender, seeded

let walkProvider: WalkProvider | null = null;
const provider = (key: string): MailProvider => {
  walkProvider = new WalkProvider(key, (mail) =>
    appendFileSync(outbox, `${JSON.stringify(mail)}\n`),
  );
  return walkProvider;
};
const engine = new MergeEngine({ dir, liveProvider: provider });

const pad = (value: number) => String(value).padStart(2, "0");
const LISTS = 20;
const PEOPLE = 290;
const FIRM_TYPES = ["Family office", "VC fund", "Hedge fund", "Wealth manager", "AIF"];
const CITIES = ["Mumbai", "Bengaluru", "GIFT City", "Delhi", "Pune"];

function listCsv(list: number): string {
  const rows = ["Email,First Name,Last Name,Title,Company,Firm Type,City,Country"];
  for (let index = 1; index <= PEOPLE; index += 1) {
    const firm = (list - 1) * PEOPLE + index;
    rows.push(
      [
        `partner${index}@fund${firm}.example`,
        `Asha${index}`,
        `Rao${firm}`,
        index % 7 === 0 ? "Managing partner" : "Partner",
        `Walk Fund ${firm}`,
        FIRM_TYPES[firm % FIRM_TYPES.length],
        CITIES[firm % CITIES.length],
        "India",
      ].join(","),
    );
  }
  return `${rows.join("\n")}\n`;
}

const BODY = `Hi {{first_name}},

A short note about what we are building, in the words of a person.

Deck: https://deck.walk.example/latest

Open to a 20-minute call next week?

A Founder
Walk Fund House, Mumbai
If this isn't a fit, reply "no" and I won't follow up.
`;

if (engine.status().counts.lists === 0) {
  engine.saveSettings({
    from_email: "founder@walk.example",
    from_name: "Walk Founder",
    reply_to: "founder@walk.example",
    footer: "",
    per_minute: 60,
    daily_cap: 5_000,
  });
  await engine.setKey({ key: WALK_KEY });
  const listIds: string[] = [];
  for (let number = 1; number <= LISTS; number += 1) {
    const list = engine.importList({
      name: `Walk ${pad(number)} - India named ${number} of ${LISTS}`,
      file_name: `walk-${pad(number)}.csv`,
      text: listCsv(number),
    }).list;
    listIds.push(list.id);
  }
  const live = engine.createMailing({ name: "Walk live 01" }).mailing;
  engine.updateMailing(live.id, {
    subject: "A note for {{company}}",
    body: BODY,
    list_ids: [listIds[0]!],
  });
  // A live send needs a test of the wording first (one outbox line to the founder's own address).
  await engine.testMailing(live.id, { to: "founder@walk.example" });
  engine.startMailing(live.id, { practice: false, confirm: PEOPLE });
  while ((await engine.step()) !== "finished");
  const practice = engine.createMailing({ name: "Walk practice 02" }).mailing;
  engine.updateMailing(practice.id, {
    subject: "Practice for {{company}}",
    body: BODY,
    list_ids: [listIds[1]!],
  });
  engine.startMailing(practice.id, { practice: true });
  while ((await engine.step()) !== "finished");
  const status = engine.status();
  console.log(
    `[walk] seeded ${status.counts.lists} lists of ${PEOPLE}; ${status.sent_today} live sends to "Walk 01"; one practice run`,
  );
}

// ------------------------------------------------------------------ Data and the server

const data = startData({
  dir,
  engine,
  testRoutes: true,
  restartDelaysMs: [300, 300, 300],
  shareProvider: (key) => walkProvider ?? provider(key),
});

/** The stand-in's own test route: the server goes away for a few seconds, then listens again (G5). */
const offline: JsonRoute = {
  method: "POST",
  pattern: /^\/data\/_test\/offline$/,
  run: (_engine, _params, body) => {
    const seconds = Math.min(60, Math.max(1, Math.trunc(Number(body.seconds)) || 5));
    setTimeout(() => {
      server.closeIdleConnections();
      server.close(() => {
        rmSync(socket, { force: true });
        console.log(`[walk] offline for ${seconds} s`);
        setTimeout(() => {
          server.listen(socket, () => console.log(`[walk] listening again on ${socket}`));
        }, seconds * 1_000);
      });
      server.closeAllConnections();
    }, 50);
    return { offline_for: seconds };
  },
};

// The stand-in's own route goes first: the host's catch-all for /data would take it otherwise.
const server: Server = createMergeServer(engine, false, [offline, ...data.routes]);
await new Promise<void>((resolve) => server.listen(socket, resolve));
console.log(`[walk] listening on ${socket}`);
await data.ready(120_000);
void engine.loop((ms) => new Promise((resolve) => setTimeout(resolve, Math.min(ms, 100))));

// ------------------------------------------------------------------ each walk's own seed

const walkDir = join(dirname(fileURLToPath(import.meta.url)), "data-walk");
for (const name of readdirSync(walkDir)
  .filter((file) => file.endsWith(".ts"))
  .sort()) {
  const loaded = (await import(`./data-walk/${name.slice(0, -3)}`)) as WalkModule;
  if (typeof loaded.seed !== "function") continue;
  await loaded.seed(socket);
  console.log(`[walk] seeded ${name}`);
}
console.log("[walk] ready");

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    engine.stop();
    void data.stop();
    server.close(() => {
      rmSync(socket, { force: true });
      process.exit(0);
    });
    setTimeout(() => process.exit(0), 5_000).unref();
  });
}
