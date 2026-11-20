// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { WALKER, startStack, type Stack } from "./helpers";

/**
 * Assurance › Summary (ws-notes/security/spec.md §8.4): the nine modules asked in order and
 * each line put in its area; every absent module one `absent` line ("Tools is not loaded
 * here."); with fakes installed through `POST /data/_test/assurance/source` every area full
 * and nothing absent; the real modules refuse a fake; the Owner flag passed on exactly as
 * asked (a fake answers an extra line only for the Owner); a module that throws reads
 * "Could not be read just now." and the others still answer. Every line is invented.
 */

type Body = Record<string, unknown>;
type Answer = {
  areas: { area: string; lines: Body[] }[];
  absent: Body[];
  owner: boolean;
  today: string;
};

const fake = (name: string, area: string) => ({
  key: `${name}-line`,
  area,
  title: `Walk ${name}`,
  words: `Walk ${name} words.`,
  attention: name === "devices",
  href: `/data/walk/${name}`,
});

describe("the Summary", () => {
  let stack: Stack;
  beforeAll(async () => {
    stack = await startStack({ modules: ["files", "policies", "findings", "assurance"] });
  }, 60_000);
  afterAll(() => stack.stop());

  const post = (path: string, body: Body = {}) => stack.ask("POST", path, { by: WALKER, ...body });
  const summary = async (owner = false) =>
    (await stack.ask("GET", `/data/assurance${owner ? "?owner=1" : ""}`)).json as unknown as Answer;
  const keys = (answer: Answer, area: string) =>
    answer.areas.find((item) => item.area === area)!.lines.map((line) => line.key);

  it("without the other units: three areas, U3's own lines, six modules absent", async () => {
    const answer = await summary();
    expect(answer.areas.map((item) => item.area)).toEqual(["systems", "assurance", "buyers"]);
    expect(keys(answer, "systems")).toEqual([]);
    expect(keys(answer, "assurance")).toEqual([
      "policies:policies",
      "findings:pen_test",
      "findings:findings",
      "findings:dependabot",
      "assurance:certification",
      "assurance:insurance",
      "assurance:review",
    ]);
    expect(keys(answer, "buyers")).toEqual([]);
    expect(answer.absent).toEqual([
      {
        name: "tools",
        area: "systems",
        title: "Tools",
        words: "Tools is not loaded here.",
        href: "/data/systems",
      },
      {
        name: "devices",
        area: "systems",
        title: "Devices",
        words: "Devices is not loaded here.",
        href: "/data/systems/devices",
      },
      {
        name: "logs",
        area: "systems",
        title: "Logs and time",
        words: "Logs and time is not loaded here.",
        href: "/data/systems/logs",
      },
      {
        name: "recovery",
        area: "systems",
        title: "Backups",
        words: "Backups is not loaded here.",
        href: "/data/systems/backups",
      },
      {
        name: "questionnaires",
        area: "buyers",
        title: "Questionnaires",
        words: "Questionnaires is not loaded here.",
        href: "/data/waitlist/diligence/questionnaires",
      },
      {
        name: "profiles",
        area: "buyers",
        title: "Customer duties",
        words: "Customer duties is not loaded here.",
        href: "/data/assurance/customers",
      },
    ]);
    expect(answer.owner).toBe(false);
    expect(JSON.stringify(answer)).not.toContain("%");
  });

  it("with every absent module's stand-in: every area full, nothing absent", async () => {
    for (const [name, area] of [
      ["tools", "systems"],
      ["devices", "systems"],
      ["logs", "systems"],
      ["recovery", "systems"],
      ["questionnaires", "buyers"],
      ["profiles", "buyers"],
    ] as const)
      expect(
        (await post("/data/_test/assurance/source", { name, lines: [fake(name, area)] })).json,
      ).toMatchObject({
        installed: true,
      });
    const answer = await summary();
    expect(answer.absent).toEqual([]);
    expect(keys(answer, "systems")).toEqual([
      "tools:tools-line",
      "devices:devices-line",
      "logs:logs-line",
      "recovery:recovery-line",
    ]);
    expect(keys(answer, "buyers")).toEqual([
      "questionnaires:questionnaires-line",
      "profiles:profiles-line",
    ]);
    expect(answer.areas[0]!.lines[1]).toEqual({
      key: "devices:devices-line",
      area: "systems",
      title: "Walk devices",
      words: "Walk devices words.",
      attention: true,
      href: "/data/walk/devices",
    });
  });

  it("a real module refuses a stand-in; a name outside the nine is refused", async () => {
    for (const name of ["policies", "findings", "assurance"])
      expect((await post("/data/_test/assurance/source", { name, lines: [] })).json).toMatchObject({
        installed: false,
        real: true,
      });
    expect((await post("/data/_test/assurance/source", { name: "leads" })).status).toBe(400);
  });

  it("passes the Owner flag on: a line counted from the ledger only when asked as the Owner", async () => {
    await post("/data/_test/assurance/source", {
      name: "tools",
      lines: [fake("tools", "systems")],
      owner_lines: [
        {
          key: "close-by",
          area: "systems",
          title: "Accounts to close",
          words: "1 account to close for a leaver.",
          attention: true,
          href: "/data/systems/accounts",
        },
      ],
    });
    const admin = await summary(false);
    expect(admin.owner).toBe(false);
    expect(keys(admin, "systems")).not.toContain("tools:close-by");
    expect(JSON.stringify(admin)).not.toContain("leaver");
    const owner = await summary(true);
    expect(owner.owner).toBe(true);
    expect(keys(owner, "systems")).toContain("tools:close-by");
  });

  it("a module that throws reads 'Could not be read just now.'; the rest still answer", async () => {
    await post("/data/_test/assurance/source", { name: "logs", throws: true });
    const answer = await summary();
    const lines = answer.areas[0]!.lines;
    expect(lines.find((line) => line.key === "logs:failed")).toEqual({
      key: "logs:failed",
      area: "systems",
      title: "Logs and time",
      words: "Could not be read just now.",
      attention: false,
      href: "/data/systems/logs",
    });
    expect(keys(answer, "assurance")).toHaveLength(7);
  });

  it("{ on: false } takes only its own stand-in away", async () => {
    expect(
      (await post("/data/_test/assurance/source", { name: "logs", on: false })).json,
    ).toMatchObject({
      installed: false,
    });
    const answer = await summary();
    expect(answer.absent.map((item) => item.name)).toEqual(["logs"]);
    expect(
      (await post("/data/_test/assurance/source", { name: "findings", on: false })).status,
    ).toBe(200);
    expect(keys(await summary(), "assurance")).toContain("findings:pen_test");
  });
});
