// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { localDay } from "../../scripts/data/days";
import {
  addLog,
  exportLogs,
  readLog,
  readLogs,
  recordLook,
  retireLog,
  saveLogsSetup,
  updateLog,
} from "@/lib/data/api/logs";
import { WALKER, startStack, type Stack } from "./helpers";

/**
 * The portal's Logs and time client against the real stack (ws-notes/security/spec.md §7.4,
 * §7.7): every answer passes its schema, with the real rule book and the stand-in tools.
 */

let stack: Stack;
const today = () => localDay(new Date());
const attempt = () => crypto.randomUUID();

beforeAll(async () => {
  stack = await startStack({ env: true, modules: ["files", "company", "dates", "logs"] });
}, 60_000);
afterAll(() => stack.stop());

describe("the portal and Logs and time agree", () => {
  it("every read and write answers what its schema reads", async () => {
    const empty = await readLogs();
    expect(empty.systems).toEqual([]);
    expect(empty.rules.logs?.key).toBe("cert-in-logs");
    expect(empty.rules.time?.key).toBe("cert-in-time");
    await stack.ask("POST", "/data/_test/logs/seed", { by: WALKER });
    const added = await addLog(
      {
        tool_id: "walk-cloud",
        kinds: ["cloud", "sign_in"],
        where: "The cloud's log store",
        retention_days: "30",
        place: "outside",
        time_source: "cloud",
        zone_recorded: "yes",
      },
      WALKER,
      attempt(),
    );
    expect(added.system.name).toBe("Walk Cloud");
    expect(added.system.lines.map((line) => line.key)).toEqual([
      "retention_short",
      "place_outside",
      "time_cloud",
    ]);
    const id = added.system.log_id;
    await updateLog(id, { region: "Walk Region 1", kinds: ["cloud"] }, WALKER);
    const looked = await recordLook(
      id,
      { on: today(), by_name: "Walk Owner", note: "Read the month's sign-ins." },
      {},
      WALKER,
      attempt(),
    );
    expect(looked.system.looks).toBe(1);
    expect((await saveLogsSetup("2", WALKER)).setup.check_months).toBe(2);
    await saveLogsSetup("", WALKER);
    const one = await readLog(id);
    expect(one.system.checks[0]?.by_name).toBe("Walk Owner");
    expect(one.readings.length).toBe(2);
    const csv = await exportLogs();
    expect(csv.csv).toContain("Walk Cloud");
    await retireLog(id, { on: today(), why: "Moved" }, WALKER);
    expect((await readLogs()).counts.systems).toBe(0);
  });
});
