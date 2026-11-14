// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { openBuild, startBuild, waitForBuild } from "@/lib/data/api/builds";
import * as packs from "@/lib/data/api/packs";
import { WALKER, startStack, type Stack } from "./helpers";

/**
 * The portal's packs client held to the real service: every call the pack pages and
 * actions make, and the zip through the builds client, each answer through the portal's
 * own schema. Every file and firm is invented.
 */
let stack: Stack;

beforeAll(async () => {
  stack = await startStack({ env: true, modules: ["files"] });
}, 60_000);
afterAll(async () => {
  await stack.stop();
});

async function readAll(body: AsyncIterable<Buffer>): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of body) chunks.push(chunk);
  return Buffer.concat(chunks);
}

describe("the portal and packs agree", () => {
  it("on every pack call, the zip and the index", async () => {
    const seeded = await stack.ask("POST", "/data/_test/packs/seed", { by: WALKER });
    expect(seeded.status).toBe(200);
    const list = await packs.readPacks();
    expect(list.packs.map((pack) => pack.pack_id)).toEqual(["walk-pack"]);
    expect(list.packs[0]).toMatchObject({ files: 3, version: 2 });
    const page = await packs.readPack("walk-pack");
    expect(page.missing).toEqual(["Roadmap to the next round", "Cap table"]);
    expect(page.firms).toBeNull();

    const made = await packs.makePack("Contract room", WALKER, crypto.randomUUID());
    const packId = made.pack.pack_id;
    const candidates = await packs.readPackCandidates(packId, "walk");
    expect(candidates.fundraising.map((row) => row.title).sort()).toEqual([
      "Walk one-pager",
      "Walk pitch deck",
      "Walk team",
    ]);
    const added = await packs.addPackItems(
      packId,
      { file_ids: candidates.fundraising.map((row) => row.file_id), covers: "other" },
      WALKER,
    );
    expect(added).toMatchObject({ added: 3, skipped: 0 });
    const [first, second] = added.pack.items;
    await packs.coverPackItem(packId, first!.item_id, "deck", WALKER);
    await packs.movePackItem(packId, second!.item_id, 1, WALKER);
    await packs.removePackItem(packId, second!.item_id, WALKER);
    const renamed = await packs.renamePack(packId, "Contract room 2", WALKER);
    expect(renamed.pack).toMatchObject({ name: "Contract room 2", version: 5 });
    const archived = await packs.archivePack(packId, WALKER);
    expect(archived.pack.archived).not.toBeNull();
    expect((await packs.readPacks(true)).packs.map((pack) => pack.pack_id)).toEqual([packId]);
    await packs.restorePack(packId, WALKER);

    const shared = await packs.recordPackShare(
      packId,
      {
        firm: "Walk Fund 960",
        how: "meeting",
        to: "",
        shared_on: (await packs.readPack(packId)).today,
        note: "",
      },
      WALKER,
      crypto.randomUUID(),
    );
    expect(shared.share).toMatchObject({ firm: "Walk Fund 960", version: 5 });
    const index = await packs.savePackIndex(packId, WALKER);
    expect(index.file).toMatchObject({
      title: "Contract room 2 index",
      folder_path: "10 Fundraising and investors",
    });

    const started = await startBuild({ kind: "pack_zip", pack_id: "walk-pack", by: WALKER });
    const build = await waitForBuild(started.build.build_id, { everyMs: 50 });
    expect(build.state).toBe("ready");
    expect(build.name).toMatch(/^Walk data room \d{4}-\d{2}-\d{2}\.zip$/);
    const file = await openBuild(build.build_id);
    const bytes = await readAll(file.body);
    expect(bytes.subarray(0, 2).toString()).toBe("PK");
    expect(bytes.includes(Buffer.from("00 Index.txt"))).toBe(true);
    expect(bytes.includes(Buffer.from("manifest-sha256.txt"))).toBe(true);
  });
});
