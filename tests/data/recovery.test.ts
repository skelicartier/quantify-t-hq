// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { addDays, localDay } from "../../scripts/data/days";
import {
  backupLines,
  dataBackupWords,
  minutesWords,
  nextTestOf,
  restoreWords,
  testDueFrom,
  testInDue,
} from "../../scripts/data/recovery/due";
import type { RestoreTest } from "../../scripts/data/recovery/types";
import { WALK_BACKUP } from "../../scripts/data/recovery/walk-seed";
import { WALKER, codeOf, startStack, until, type Stack } from "./helpers";

/**
 * Backups (ws-notes/security/spec.md §5.3, §7): the restore-test rows of §5.3; how long it
 * took in words; Data's own row reading `backup-last` once a backup is made and downloaded
 * through the backup routes; one such row only; the calendar's restore tests; the partial and
 * failed lines. No target anywhere: a restore records what happened. Everything is invented.
 */

type Body = Record<string, unknown>;
const today = () => localDay(new Date());
const attempt = () => crypto.randomUUID();

const test = (over: Partial<RestoreTest>): RestoreTest => ({
  test_id: "t1",
  on: "2026-11-20",
  by_name: "Walk Engineer",
  minutes: 25,
  outcome: "complete",
  what_restored: "Every table",
  file_id: null,
  note: "",
  at: "2026-11-20T06:00:00.000Z",
  by: WALKER,
  ...over,
});

describe("the restore-test rows of §5.3, the day pinned to 20 Nov 2026", () => {
  const on = "2026-11-20";

  it("last 20 Nov 2026, every 3 months: next by 20 Feb 2027", () => {
    const next = nextTestOf("2026-11-20", "2026-01-01", 3);
    expect(next).toBe("2027-02-20");
    expect(restoreWords("2026-11-20", next, on)).toBe("Next restore test by 20 Feb 2027");
    expect(testDueFrom(next)).toBe("2027-02-06");
    expect(testInDue(next, on)).toBe(false);
  });

  it("last 31 May 2026: due since 31 Aug 2026", () => {
    const next = nextTestOf("2026-05-31", "2026-01-01", 3);
    expect(next).toBe("2026-08-31");
    expect(restoreWords("2026-05-31", next, on)).toBe("Restore test due since 31 Aug 2026");
    expect(testInDue(next, on)).toBe(true);
    expect(
      backupLines({ off_system: "yes", retired: null }, test({ on: "2026-05-31" }), next, on),
    ).toEqual(["Restore test due since 31 Aug 2026."]);
  });

  it("never tested, added 20 Nov 2026: due that day and never restore-tested", () => {
    const next = nextTestOf(null, "2026-11-20", 3);
    expect(next).toBe("2026-11-20");
    expect(restoreWords(null, next, on)).toBe("Never restore-tested");
    expect(testInDue(next, on)).toBe(true);
    expect(backupLines({ off_system: "no", retired: null }, null, next, on)).toEqual([
      "There is no copy away from the system itself.",
      "Never restore-tested.",
    ]);
  });

  it("how long it took: 75 → 1 hour 15 minutes, 25 → 25 minutes, none → nothing", () => {
    expect(minutesWords(75)).toBe("1 hour 15 minutes");
    expect(minutesWords(25)).toBe("25 minutes");
    expect(minutesWords(null)).toBeNull();
  });

  it("a partial restore asks for a finding, with what was missing; a failed one says so", () => {
    const next = "2027-02-20";
    expect(
      backupLines(
        { off_system: "yes", retired: null },
        test({ outcome: "partial", note: "the uploads folder was missing." }),
        next,
        on,
      ),
    ).toEqual([
      "The last restore was partial: the uploads folder was missing. Record it as a finding.",
    ]);
    expect(
      backupLines({ off_system: "yes", retired: null }, test({ outcome: "partial" }), next, on),
    ).toEqual(["The last restore was partial. Record it as a finding."]);
    expect(
      backupLines({ off_system: "yes", retired: null }, test({ outcome: "failed" }), next, on),
    ).toEqual(["The last restore failed."]);
  });

  it("Data's own row: 14 Nov 2026 from backup-last, or none downloaded yet", () => {
    expect(dataBackupWords("2026-11-14T10:00:00.000Z")).toBe("Last downloaded 14 Nov 2026");
    expect(dataBackupWords(null)).toBe("No backup of Data has been downloaded yet.");
  });
});

// ------------------------------------------------------------------ on the real stack

let stack: Stack;

beforeAll(async () => {
  stack = await startStack({ modules: ["files", "backup", "recovery"] });
}, 60_000);
afterAll(async () => {
  await stack.stop();
});

const due = async (): Promise<Body[]> =>
  ((await stack.ask("GET", "/data/overview?due=all")).json!.due as Body[]).filter(
    (item) => item.kind === "backup",
  );

describe("the inventory", () => {
  let backupId = "";

  it("is empty, with Data's own backup not yet downloaded", async () => {
    const page = (await stack.ask("GET", "/data/recovery")).json!;
    expect(page.backups).toEqual([]);
    expect(page.data_backup).toEqual({
      last_at: null,
      words: "No backup of Data has been downloaded yet.",
    });
    expect(page.counts).toEqual({ backups: 0, tested_in_time: 0, never_tested: 0 });
    expect(page.tools_loaded).toBe(false);
  });

  it("a new backup is never restore-tested and in Due the day it was added", async () => {
    const added = await stack.ask("POST", "/data/recovery", {
      name: WALK_BACKUP.name,
      what: WALK_BACKUP.what,
      how_often: "daily",
      where: WALK_BACKUP.where,
      off_system: "yes",
      cannot_be_changed: "no",
      owner: "Walk Engineer",
      by: WALKER,
      attempt: attempt(),
    });
    expect(added.status).toBe(200);
    const backup = added.json!.backup as Body;
    backupId = String(backup.backup_id);
    expect(backup).toMatchObject({
      every_months: 3,
      next_test: today(),
      never_tested: true,
      words: "Never restore-tested",
      lines: ["Never restore-tested."],
    });
    expect(Object.keys(backup).some((key) => /target|rto|rpo|met/i.test(key))).toBe(false);
    expect((await due()).map((row) => [row.key, row.title, row.sub, row.due_on])).toEqual([
      [`backup:${backupId}`, "Restore test: Walk product database", "Never tested", today()],
    ]);
  });

  it("a restore of 75 minutes reads 1 hour 15 minutes and moves the next test 3 months on", async () => {
    const tested = await stack.ask("POST", `/data/recovery/${backupId}/tests`, {
      on: today(),
      by_name: "Walk Engineer",
      minutes: String(WALK_BACKUP.minutes),
      outcome: "complete",
      what_restored: "Every table, into a spare database",
      name: "restore-notes.txt",
      content: Buffer.from("Invented notes from a restore.\n").toString("base64"),
      by: WALKER,
      attempt: attempt(),
    });
    expect(tested.status).toBe(200);
    const fileId = String(((tested.json!.backup as Body).last_test as Body | null)?.file_id ?? "");
    const file = (await stack.ask("GET", `/data/files/${fileId}`)).json!.file as Body;
    expect(file.folder_path).toBe("Security › Backups");
    expect(file.used_for).toEqual([
      {
        label: `Restore test of Walk product database, ${dayOf(today())}`,
        href: `/data/systems/backups/${backupId}`,
      },
    ]);
    expect(tested.json!.backup).toMatchObject({
      last_minutes: "1 hour 15 minutes",
      tested_in_time: true,
      next_test: nextTestOf(today(), today(), 3),
      lines: [],
    });
    expect(await due()).toEqual([]);
    const detail = (await stack.ask("GET", `/data/recovery/${backupId}`)).json!.backup as Body;
    expect((detail.tests as Body[])[0]).toMatchObject({
      how_long: "1 hour 15 minutes",
      outcome: "complete",
    });
  });

  it("a partial restore later the same day asks for a finding; a failed one says so", async () => {
    await stack.ask("POST", `/data/recovery/${backupId}/tests`, {
      on: today(),
      by_name: "Walk Engineer",
      minutes: "40",
      outcome: "partial",
      what_restored: "Most tables",
      note: "The audit table did not come back",
      by: WALKER,
      attempt: attempt(),
    });
    let row = (await stack.ask("GET", `/data/recovery/${backupId}`)).json!.backup as Body;
    expect(row.lines).toEqual([
      "The last restore was partial: The audit table did not come back. Record it as a finding.",
    ]);
    await stack.ask("POST", `/data/recovery/${backupId}/tests`, {
      on: today(),
      by_name: "Walk Engineer",
      outcome: "failed",
      by: WALKER,
      attempt: attempt(),
    });
    row = (await stack.ask("GET", `/data/recovery/${backupId}`)).json!.backup as Body;
    expect(row.lines).toEqual(["The last restore failed."]);
    expect(row.last_minutes).toBeNull();
  });

  it("the calendar takes the restore test, a reminder 7 days before, with a plain title", async () => {
    const agenda = (await stack.ask("GET", "/data/_test/recovery/agenda")).json!.items as Body[];
    expect(agenda).toEqual([
      {
        key: `backup:${backupId}`,
        kind: "backup",
        title: "Restore test: Walk product database",
        plain: "Restore test",
        sub: `Last restored ${dayOf(today())}`,
        on: nextTestOf(today(), today(), 3),
        remind_days: [7],
        href: `/data/systems/backups/${backupId}`,
      },
    ]);
  });

  it("refuses what §7.3 refuses", async () => {
    const cases: [string, Body, string][] = [
      ["/data/recovery", { name: "" }, "Give the backup a name."],
      [
        "/data/recovery",
        { name: "x", every_months: "13" },
        "Type the months between restore tests as a whole number from 1 to 12.",
      ],
      ["/data/recovery", { name: "x", how_often: "sometimes" }, "Choose how often from the list."],
      [
        "/data/recovery",
        { name: "x", tool_id: "walk-cloud" },
        "Tools is not loaded here, so a tool cannot be chosen. Type a name instead.",
      ],
      [
        `/data/recovery/${backupId}/tests`,
        { by_name: "x", outcome: "fine" },
        "Choose Complete, Partial or Failed.",
      ],
      [
        `/data/recovery/${backupId}/tests`,
        { by_name: "x", outcome: "complete", minutes: "100001" },
        "Type how long it took in whole minutes, from 0 to 100,000, or leave it empty.",
      ],
      [
        `/data/recovery/${backupId}/tests`,
        { by_name: "x", outcome: "complete", on: addDays(today(), 1) },
        "That day is in the future.",
      ],
    ];
    for (const [path, body, sentence] of cases) {
      const answer = await stack.ask("POST", path, { ...body, by: WALKER, attempt: attempt() });
      expect([path, (answer.json!.error as Body | undefined)?.message]).toEqual([path, sentence]);
    }
  });
});

describe("Data's own row", () => {
  let dataId = "";

  it("is one row only, and reads backup-last once a backup is made and downloaded", async () => {
    const added = await stack.ask("POST", "/data/recovery", {
      kind: "hq_data",
      what: "the backup zip",
      how_often: "by_hand",
      where: "This Mac's Downloads, then a disk",
      by: WALKER,
      attempt: attempt(),
    });
    expect(added.status).toBe(200);
    const row = added.json!.backup as Body;
    dataId = String(row.backup_id);
    expect(row).toMatchObject({
      kind: "hq_data",
      name: "Data on this Mac",
      downloaded: "No backup of Data has been downloaded yet.",
    });
    const second = await stack.ask("POST", "/data/recovery", {
      kind: "hq_data",
      by: WALKER,
      attempt: attempt(),
    });
    expect([second.status, codeOf(second), (second.json!.error as Body).message]).toEqual([
      409,
      "hq_data_taken",
      "Data's own backup is already listed.",
    ]);
    // A backup made through the backup build, and marked downloaded as the portal does.
    await stack.ask("POST", "/data/_test/backup/free-bytes", { bytes: 10 ** 13, by: WALKER });
    const made = await stack.ask("POST", "/data/builds", { kind: "backup", by: WALKER });
    const buildId = String((made.json!.build as Body).build_id);
    await until(
      async () =>
        ((await stack.ask("GET", `/data/builds/${buildId}`)).json!.build as Body).state === "ready",
      "the backup",
      30_000,
    );
    await stack.raw(stack.socket, "GET", `/data/builds/${buildId}/bytes`);
    const marked = await stack.ask("POST", "/data/backup/downloaded", {
      build_id: buildId,
      by: WALKER,
    });
    expect(marked.status).toBe(200);
    await stack.ask("POST", "/data/_test/backup/free-bytes", { bytes: null, by: WALKER });
    const page = (await stack.ask("GET", "/data/recovery")).json!;
    expect(typeof (page.data_backup as Body).last_at).toBe("string");
    const [first] = page.backups as Body[];
    expect(first).toMatchObject({
      backup_id: dataId,
      downloaded: `Last downloaded ${dayOf(today())}`,
    });
    const service = (await stack.ask("GET", "/data/_test/recovery/service")).json!;
    expect((service.summary as Body[]).find((line) => line.key === "data-backup")).toMatchObject({
      words: `Data's own backup was last downloaded ${dayOf(today())}.`,
      attention: false,
      href: "/data#data-backup",
    });
  }, 60_000);

  it("gives the Summary's backups line and one evidence option per backup", async () => {
    const service = (await stack.ask("GET", "/data/_test/recovery/service")).json!;
    expect((service.summary as Body[])[0]).toMatchObject({
      key: "backups",
      words: "2 backups; 1 restore-tested on time.",
      attention: true,
    });
    const refs = (service.evidence as Body[]).map((option) => [option.ref, option.current]);
    expect(refs).toEqual([
      ["recovery:register", false],
      [expect.stringMatching(/^recovery:backup:/), false],
      [expect.stringMatching(/^recovery:backup:/), false],
    ]);
    expect(JSON.stringify(service)).not.toMatch(/%|target/i);
    const overview = (await stack.ask("GET", "/data/overview")).json!.recovery as Body;
    expect(Object.keys(overview).sort()).toEqual([
      "backups",
      "never_tested",
      "next",
      "tested_in_time",
    ]);
  });
});

function dayOf(day: string): string {
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  const [year, month, date] = day.split("-");
  return `${Number(date)} ${months[Number(month) - 1]} ${year}`;
}
