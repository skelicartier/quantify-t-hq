// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { localDay } from "../../scripts/data/days";
import {
  addBackup,
  exportBackups,
  readBackup,
  readBackups,
  recordRestore,
  retireBackup,
  updateBackup,
} from "@/lib/data/api/recovery";
import { WALKER, startStack, type Stack } from "./helpers";

/**
 * The portal's Backups client against the real stack (ws-notes/security/spec.md §7.4, §7.7):
 * every answer passes its schema, with Data's own row and the stand-in tools.
 */

let stack: Stack;
const today = () => localDay(new Date());
const attempt = () => crypto.randomUUID();

beforeAll(async () => {
  stack = await startStack({ env: true, modules: ["files", "backup", "recovery"] });
}, 60_000);
afterAll(() => stack.stop());

describe("the portal and Backups agree", () => {
  it("every read and write answers what its schema reads", async () => {
    const empty = await readBackups();
    expect(empty.backups).toEqual([]);
    expect(empty.data_backup).toEqual({
      last_at: null,
      words: "No backup of Data has been downloaded yet.",
    });
    await stack.ask("POST", "/data/_test/recovery/seed", { by: WALKER });
    const added = await addBackup(
      {
        tool_id: "walk-cloud",
        name: "Walk product database",
        how_often: "daily",
        off_system: "yes",
      },
      WALKER,
      attempt(),
    );
    expect(added.backup.tool?.name).toBe("Walk Cloud");
    const id = added.backup.backup_id;
    await updateBackup(id, { every_months: "1" }, WALKER);
    const tested = await recordRestore(
      id,
      { on: today(), by_name: "Walk Engineer", minutes: "25", outcome: "complete" },
      {},
      WALKER,
      attempt(),
    );
    expect(tested.backup.last_minutes).toBe("25 minutes");
    const data = await addBackup({ kind: "hq_data" }, WALKER, attempt());
    expect(data.backup.downloaded).toBe("No backup of Data has been downloaded yet.");
    const one = await readBackup(id);
    expect(one.backup.tests[0]?.how_long).toBe("25 minutes");
    const page = await readBackups();
    expect(page.backups[0]?.kind).toBe("hq_data");
    expect(page.data_listed).toBe(true);
    expect((await exportBackups()).csv).toContain("Walk product database");
    await retireBackup(id, { on: today(), why: "Replaced" }, WALKER);
    expect((await readBackups()).counts.backups).toBe(1);
  });
});
