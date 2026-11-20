// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { addDays, localDay } from "../../scripts/data/days";
import { logLines, lookDueFrom, lookInDue, nextLookOf } from "../../scripts/data/logs/checks";
import { LOG_PLACE_READINGS } from "@/lib/data/labels-controls";
import { WALKER, startStack, type Stack } from "./helpers";

/**
 * Logs and time (ws-notes/security/spec.md §5.3, §7): retention read against direction (iv)'s
 * 180 days; both readings and "Confirm with your lawyer" for logs kept outside India, never a
 * pass or a fail; the `cert-in-logs` and `cert-in-time` rule lines from the real rule book; the
 * quarterly look and its Due rows; the cloud's own time service said, not warned about. With
 * the stand-in `tools` ("Walk Cloud"). Everything is invented; nothing asks a time server.
 */

type Body = Record<string, unknown>;
const today = () => localDay(new Date());
const attempt = () => crypto.randomUUID();
const keysOf = (lines: { key: string }[]) => lines.map((line) => line.key);

describe("the lines of §5.3, the day pinned", () => {
  const look = { last_on: null, added_on: "2026-11-20", next: "2027-02-20", today: "2026-11-20" };
  const system = {
    retention_days: 180 as number | null,
    place: "india" as const,
    time_source: "nic" as const,
    zone_recorded: "yes" as const,
    retired: null,
  };

  it("kept 30 days: the direction's 180; 180 or more: nothing; not given: not recorded", () => {
    expect(logLines({ ...system, retention_days: 30 }, look)).toEqual([
      {
        key: "retention_short",
        words: "Kept 30 days; direction (iv) says a rolling 180 days.",
        attention: true,
      },
    ]);
    expect(logLines(system, look)).toEqual([]);
    expect(logLines({ ...system, retention_days: 400 }, look)).toEqual([]);
    expect(logLines({ ...system, retention_days: null }, look)).toEqual([
      {
        key: "retention_unknown",
        words: "How long its logs are kept is not recorded.",
        attention: true,
      },
    ]);
  });

  it("outside India: the sources disagree, confirm with the lawyer; no judgement either way", () => {
    expect(logLines({ ...system, place: "outside" }, look)).toEqual([
      {
        key: "place_outside",
        words: "The sources disagree. Confirm with your lawyer.",
        attention: false,
      },
    ]);
    expect(LOG_PLACE_READINGS.map((reading) => reading.label)).toEqual([
      "Within India",
      "Outside India, if produced in time",
    ]);
  });

  it("the clock: not known, the cloud's own (FAQ 42, not a warning), another source, the zone", () => {
    expect(logLines({ ...system, time_source: "not_known" }, look)[0]).toEqual({
      key: "time_unknown",
      words: "Which clock it keeps time by is not known.",
      attention: true,
    });
    expect(logLines({ ...system, time_source: "cloud" }, look)[0]).toEqual({
      key: "time_cloud",
      words: "Uses its cloud's own time service, which CERT-In's FAQ 42 allows.",
      attention: false,
    });
    expect(logLines({ ...system, time_source: "other" }, look)[0]!.words).toBe(
      "Another time source is allowed if it does not deviate from NIC and NPL.",
    );
    expect(logLines({ ...system, zone_recorded: "no" }, look)[0]!.words).toBe(
      "The time zone is not kept with each time.",
    );
  });

  it("the quarterly look: 20 Nov 2026 → 20 Feb 2027 from 6 Feb; 31 Aug 2026 → 30 Nov 2026, in Due on 20 Nov", () => {
    expect(nextLookOf("2026-11-20", "2026-01-01", 3)).toBe("2027-02-20");
    expect(lookDueFrom("2027-02-20")).toBe("2027-02-06");
    expect(lookInDue("2027-02-20", "2026-11-20")).toBe(false);
    expect(nextLookOf("2026-08-31", "2026-01-01", 3)).toBe("2026-11-30");
    expect(lookDueFrom("2026-11-30")).toBe("2026-11-16");
    expect(lookInDue("2026-11-30", "2026-11-20")).toBe(true);
    // A new system counts as looked at the day it is added.
    expect(nextLookOf(null, "2026-11-20", 3)).toBe("2027-02-20");
    expect(
      keysOf(
        logLines(system, {
          last_on: "2026-08-01",
          added_on: "2026-01-01",
          next: "2026-11-01",
          today: "2026-11-20",
        }),
      ),
    ).toEqual(["look_overdue"]);
    expect(
      logLines(system, {
        last_on: "2026-08-01",
        added_on: "2026-01-01",
        next: "2026-11-01",
        today: "2026-11-20",
      })[0]!.words,
    ).toBe("Not looked at since 1 Aug 2026.");
  });
});

// ------------------------------------------------------------------ on the real stack

let stack: Stack;

beforeAll(async () => {
  stack = await startStack({ modules: ["files", "company", "dates", "logs"] });
}, 60_000);
afterAll(async () => {
  await stack.stop();
});

describe("what CERT-In asks, from the real rule book", () => {
  it("gives the rule lines, NIC's and NPL's servers and both readings, and says Tools is not loaded", async () => {
    const page = (await stack.ask("GET", "/data/logs")).json!;
    expect(page.systems).toEqual([]);
    expect(page.rules).toMatchObject({
      logs: { key: "cert-in-logs", title: "Keep the logs of every system", confirm_with: "lawyer" },
      time: {
        key: "cert-in-time",
        title: "Set clocks from the NIC or NPL time servers",
        confirm_with: "lawyer",
      },
    });
    expect(page.servers).toEqual({
      nic: ["samay1.nic.in", "samay2.nic.in"],
      npl: ["time.nplindia.org"],
    });
    expect((page.readings as Body[]).map((reading) => reading.label)).toEqual([
      "Within India",
      "Outside India, if produced in time",
    ]);
    expect(page.tools_loaded).toBe(false);
    expect(page.counts).toEqual({ systems: 0, short: 0, outside: 0, time_unknown: 0 });
  });

  it("refuses a tool while Tools is not loaded, and takes a typed name", async () => {
    const refused = await stack.ask("POST", "/data/logs", {
      tool_id: "walk-cloud",
      by: WALKER,
      attempt: attempt(),
    });
    expect((refused.json!.error as Body).message).toBe(
      "Tools is not loaded here, so a tool cannot be chosen. Type a name instead.",
    );
    const typed = await stack.ask("POST", "/data/logs", {
      name: "Walk product servers",
      kinds: ["application", "web"],
      where: "The servers' own disks",
      retention_days: "400",
      place: "india",
      time_source: "nic",
      time_detail: "samay1.nic.in",
      zone_recorded: "yes",
      by: WALKER,
      attempt: attempt(),
    });
    expect(typed.status).toBe(200);
    expect(typed.json!.system).toMatchObject({
      name: "Walk product servers",
      tool_id: null,
      lines: [],
      next_look: nextLookOf(null, today(), 3),
    });
  });
});

describe("Walk Cloud, kept 30 days outside India", () => {
  let logId = "";

  it("is picked from the stand-in tools and reads both lines, the readings and the cloud's clock", async () => {
    const installed = await stack.ask("POST", "/data/_test/logs/seed", { by: WALKER });
    expect(installed.json!.tools).toMatchObject({ installed: true, real: false });
    const page = (await stack.ask("GET", "/data/logs")).json!;
    expect(page.tools_loaded).toBe(true);
    expect((page.tools as Body[]).map((tool) => tool.name)).toEqual(["Walk Cloud", "Walk Code"]);
    const added = await stack.ask("POST", "/data/logs", {
      tool_id: "walk-cloud",
      name: "ignored when a tool is chosen",
      kinds: ["cloud", "sign_in"],
      where: "The cloud's log store",
      retention_days: "30",
      place: "outside",
      region: "Walk Region 1",
      time_source: "cloud",
      zone_recorded: "no",
      by: WALKER,
      attempt: attempt(),
    });
    expect(added.status).toBe(200);
    const system = added.json!.system as Body;
    logId = String(system.log_id);
    expect(system.name).toBe("Walk Cloud");
    expect(system.tool).toMatchObject({ tool_id: "walk-cloud", name: "Walk Cloud" });
    expect(keysOf(system.lines as { key: string }[])).toEqual([
      "retention_short",
      "place_outside",
      "time_cloud",
      "zone",
    ]);
    const counts = (await stack.ask("GET", "/data/logs")).json!.counts;
    expect(counts).toEqual({ systems: 2, short: 1, outside: 1, time_unknown: 0 });
    const csv = String((await stack.ask("GET", "/data/logs/export")).json!.csv);
    expect(csv).toContain("Within India: Direction (iv)");
    expect(csv).toContain("Outside India, if produced in time: FAQ 35");
    expect(csv).toContain("The sources disagree. Confirm with your lawyer.");
  });

  it("refuses a second system of the same name", async () => {
    const again = await stack.ask("POST", "/data/logs", {
      name: "walk cloud",
      by: WALKER,
      attempt: attempt(),
    });
    expect((again.json!.error as Body).message).toBe("A system with that name is already here.");
  });

  it("a look moves the next day on; his months change it; an overdue look enters Due", async () => {
    const looked = await stack.ask("POST", `/data/logs/${logId}/checks`, {
      on: today(),
      by_name: "Walk Owner",
      note: "Read the sign-in log for the month.",
      name: "sign-in-log.txt",
      content: Buffer.from("An invented extract of a sign-in log.\n").toString("base64"),
      by: WALKER,
      attempt: attempt(),
    });
    const fileId = String(((looked.json!.system as Body).last_look as Body | null)?.file_id ?? "");
    const file = (await stack.ask("GET", `/data/files/${fileId}`)).json!.file as Body;
    expect(file.folder_path).toBe("Security › Logs");
    expect(file.used_for).toEqual([
      {
        label: `A look at the logs of Walk Cloud, ${dayOf(today())}`,
        href: `/data/systems/logs/${logId}`,
      },
    ]);
    expect(looked.status).toBe(200);
    expect(looked.json!.system).toMatchObject({
      looks: 1,
      next_look: nextLookOf(today(), today(), 3),
    });
    await stack.ask("POST", "/data/logs/setup", { check_months: "1", by: WALKER });
    let row = (await stack.ask("GET", `/data/logs/${logId}`)).json!.system as Body;
    expect(row.next_look).toBe(nextLookOf(today(), today(), 1));
    const early = await stack.ask("POST", `/data/logs/${logId}/checks`, {
      on: addDays(today(), -40),
      by_name: "Walk Owner",
      by: WALKER,
      attempt: attempt(),
    });
    expect(early.status).toBe(200);
    // The newest look still counts: the early one changes nothing.
    row = (await stack.ask("GET", `/data/logs/${logId}`)).json!.system as Body;
    expect(row.next_look).toBe(nextLookOf(today(), today(), 1));
    expect((row.checks as Body[]).map((look) => look.on)).toEqual([today(), addDays(today(), -40)]);
    await stack.ask("POST", "/data/logs/setup", { check_months: "", by: WALKER });
    const due = ((await stack.ask("GET", "/data/overview?due=all")).json!.due as Body[]).filter(
      (item) => item.kind === "log",
    );
    expect(due).toEqual([]);
  });

  it("gives the Summary's lines and evidence, and an overview block of counts", async () => {
    const service = (await stack.ask("GET", "/data/_test/logs/service")).json!;
    expect(service.summary).toEqual([
      {
        key: "logs",
        area: "systems",
        title: "Logs",
        words: "2 systems: 1 keeps logs 180 days or more; 1 keeps them outside India.",
        attention: true,
        href: "/data/systems/logs",
      },
      {
        key: "time",
        area: "systems",
        title: "Time",
        words: "2 of 2 systems keep time from NIC, NPL or their cloud's own service.",
        attention: false,
        href: "/data/systems/logs",
      },
    ]);
    expect(service.evidence).toEqual([
      {
        ref: "logs:register",
        label: "Log and time register: 2 systems, looked at each quarter",
        href: "/data/systems/logs",
        current: true,
        why: "",
      },
    ]);
    const overview = (await stack.ask("GET", "/data/overview")).json!.logs as Body;
    expect(Object.keys(overview).sort()).toEqual([
      "next",
      "outside",
      "short",
      "systems",
      "time_unknown",
    ]);
  });

  it("retires a system, which stays listed and leaves the counts", async () => {
    const retired = await stack.ask("POST", `/data/logs/${logId}/retire`, {
      why: "Moved to another cloud",
      by: WALKER,
    });
    expect(retired.json!.system).toMatchObject({
      next_look: null,
      retired: { why: "Moved to another cloud" },
    });
    const page = (await stack.ask("GET", "/data/logs")).json!;
    expect((page.systems as Body[]).length).toBe(2);
    expect(page.counts).toMatchObject({ systems: 1, short: 0, outside: 0 });
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
