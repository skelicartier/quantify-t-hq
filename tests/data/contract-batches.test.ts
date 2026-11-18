// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { readBatches } from "@/lib/data/api/batches";
import { readDataOverview } from "@/lib/data/api/overview";
import { register as registerBatches } from "../../scripts/data/batches/index";
import {
  COMPLAINTS_HINT,
  DELIVERY_SERVICE,
  NO_COUNTS,
  type DeliveryFeed,
} from "../../src/lib/merge/delivery-contracts";
import { MODULES } from "../../scripts/data/core";
import { WALKER, startStack, until, type Stack } from "./helpers";
import { Scripted, peopleCsv, readyToSend, sendLive, startKit, type Kit } from "./leads-kit";

/**
 * The portal's Batches client and the overview's delivery block held to the real service:
 * each answer has to pass the portal's own schema, with and without a feed of delivery.
 * Then the stand-in route against a feed that was there first: it declines, and never
 * takes that feed away. Everyone is invented, on `.example` domains.
 */
let stack: Stack;

const people = (count: number) =>
  Array.from({ length: count }, (_, index) => ({
    email: `partner${index + 1}@fund${index + 1}.example`,
    company: `Walk Fund ${index + 1}`,
  }));

beforeAll(async () => {
  const provider = new Scripted();
  // Written for D2 alone: the stand-in feed installs only where the real delivery module is not
  // loaded, so this stack leaves it out. tests/data/delivery-merged.test.ts proves the real feed.
  stack = await startStack({
    env: true,
    modules: MODULES.filter((name) => name !== "delivery"),
    liveProvider: () => provider,
  });
  await readyToSend(stack.engine);
  const list = stack.engine.importList({
    name: "Walk 01",
    file_name: "walk-01.csv",
    text: peopleCsv(people(40)),
  }).list.id;
  await sendLive(stack.engine, list, "Walk live 01");
  await until(
    async () => (await readBatches()).funnel.rows.length === 1,
    "the live mailing to be seen",
  );
}, 120_000);
afterAll(() => stack.stop());

describe("the portal and Batches agree", () => {
  it("without a feed: the row is there, delivery is not read, and the overview says not loaded", async () => {
    const batches = await readBatches();
    expect(batches.read).toBeNull();
    expect(batches.loaded).toEqual({ delivery: false, replies: true, waitlist: true });
    expect(batches.gone).toEqual([]);
    expect(batches.funnel.rows).toHaveLength(1);
    expect(batches.funnel.rows[0]).toMatchObject({
      name: "Walk live 01",
      lists: ["Walk 01"],
      accepted: 40,
      delivery: null,
      read_at: null,
      warning: null,
    });
    expect(batches.funnel.total).toMatchObject({ accepted: 40, delivery: null });

    const overview = await readDataOverview();
    expect(overview.delivery).toMatchObject({
      loaded: false,
      counts: NO_COUNTS,
      warnings: [],
      read_at: null,
      waiting: 0,
    });
    expect(Date.parse(overview.delivery!.since)).toBeLessThan(Date.now());
  });

  it("with the stand-in feed: the counts, the warning and the overview's week", async () => {
    const installed = await stack.ask("POST", "/data/_test/batches/delivery", { by: WALKER });
    expect(installed.json).toMatchObject({ installed: true });

    const batches = await readBatches();
    expect(batches.read).toMatchObject({ outcome: "ok", waiting: 0 });
    expect(batches.loaded.delivery).toBe(true);
    const row = batches.funnel.rows[0]!;
    // Fund 1 to 40: fund 29 a soft bounce, fund 36 a hard bounce, the rest delivered.
    expect(row.delivery).toMatchObject({
      accepted: 40,
      delivered: 38,
      soft_bounce: 1,
      hard_bounce: 1,
      didnt_arrive: 2,
      not_yet: 0,
      retry: 1,
    });
    expect(row.warning).toBe("attention");
    expect(row.read_at).toBe(batches.read!.last_read_at);

    const overview = await readDataOverview();
    expect(overview.delivery).toMatchObject({
      loaded: true,
      counts: { accepted: 40, delivered: 38, didnt_arrive: 2 },
      read_at: batches.read!.last_read_at,
      waiting: 0,
    });
    expect(overview.delivery!.warnings).toEqual([
      {
        key: "hard_bounces",
        level: "attention",
        title: "More addresses bounced hard than is healthy",
        body:
          "1 of 40 accepted bounced hard in the last 7 days: 2.5 per cent. Under 2 per cent is " +
          "healthy and over 5 per cent is poor: a high rate tells mailbox providers a list is old " +
          "or bought. Nothing has been paused: you decide.",
      },
    ]);
    // Nothing on either answer carries a per cent sign.
    expect(JSON.stringify([batches, overview.delivery])).not.toContain("%");
    expect(COMPLAINTS_HINT).toContain("Gmail");
  });

  it("without the stand-in again once it is taken off", async () => {
    await stack.ask("POST", "/data/_test/batches/delivery", { by: WALKER, on: false });
    expect((await readDataOverview()).delivery?.loaded).toBe(false);
    expect((await readBatches()).loaded.delivery).toBe(false);
  });
});

// ------------------------------------------------------------------ a real feed is never replaced

describe("the stand-in route, over a feed that was there first", () => {
  let kit: Kit;
  const READ_AT = "2026-11-14T06:00:00.000Z";
  const real: DeliveryFeed = {
    state: () => ({
      last_read_at: READ_AT,
      outcome: "ok",
      detail: "",
      auto_stop_from: "2026-11-13T00:00:00.000Z",
      waiting: 3,
    }),
    mailings: () => [],
    mailing: () => null,
    forEmail: () => [],
    since: () => ({ ...NO_COUNTS, accepted: 7, delivered: 7 }),
  };

  beforeAll(async () => {
    kit = await startKit();
    // The read-back's own module loads before `batches`: its feed is there first.
    kit.core.provide(DELIVERY_SERVICE, real);
    registerBatches(kit.core);
  }, 60_000);
  afterAll(() => kit.close());

  it("declines, and leaves the real feed where it was", async () => {
    const asked = await kit.ask("POST", "/data/_test/batches/delivery", { by: WALKER });
    expect(asked.status).toBe(200);
    expect(asked.body).toMatchObject({ installed: false, real: true });
    expect(kit.core.need(DELIVERY_SERVICE)).toBe(real);

    const off = await kit.ask("POST", "/data/_test/batches/delivery", { by: WALKER, on: false });
    expect(off.body).toMatchObject({ installed: false });
    expect(kit.core.need(DELIVERY_SERVICE)).toBe(real);

    const batches = await kit.ask("GET", "/data/batches");
    expect(batches.body.read).toMatchObject({ last_read_at: READ_AT, waiting: 3 });
    expect(batches.body.loaded).toMatchObject({ delivery: true });
  });
});
