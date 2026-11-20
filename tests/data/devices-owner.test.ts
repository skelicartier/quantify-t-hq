// @vitest-environment node
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { addDays, localDay } from "../../scripts/data/days";
import { owedOf } from "../../scripts/data/devices/due";
import { WALK_DEVICE } from "../../scripts/data/devices/walk-seed";
import { owedTitle } from "@/lib/data/labels-devices";
import { WALKER, codeOf, startStack, until, type Stack } from "./helpers";

/**
 * The Owner rule for devices, on every path (ws-notes/security/spec.md §2 rules 1–2, §3.5):
 * the link POST refuses without the Owner flag, keeps no replay and answers `{ device_id,
 * linked }` only; answers asked without `?owner=1` carry no person and no owed day (absent,
 * not null); a leaver's Due rows are `owner_only` with §5.3's days; the Admin's CSV has no
 * ledger columns; a backup an Admin makes holds no `data/devices/owner/`; no replay, event or
 * log line names the person, their id or their last day; the Summary counts leavers only for
 * the Owner and the evidence names nobody. The ledger's person is "Walk Intern One"; the
 * device's typed holder is "Research intern". Everything is invented.
 */

type Body = Record<string, unknown>;
const today = () => localDay(new Date());
const attempt = () => crypto.randomUUID();

const NAME = "Walk Intern One";
const EMAIL = "one@walkintern.example";
let stack: Stack;
let out = "";
let personId = "";
let laptopId = "";
let companyId = "";
let lastDay = "";

describe("§5.3's leaver rows, the day pinned", () => {
  it("last day Fri 27 Nov 2026: a company laptop back that day, work data off a personal one by 2 Dec", () => {
    const none = { returned_on: null, retired: null };
    expect(owedOf("2026-11-27", { ownership: "company", ...none })).toEqual({
      by: "2026-11-27",
      words: "By the last day",
      done: false,
    });
    expect(owedOf("2026-11-27", { ownership: "personal", ...none })).toEqual({
      by: "2026-12-02",
      words: "Within 5 days of the last day",
      done: false,
    });
    expect(owedTitle("company", "Walk Laptop 14", NAME)).toBe(
      "Get the Walk Laptop 14 back from Walk Intern One",
    );
    expect(owedTitle("personal", "Walk Laptop 14", NAME)).toBe(
      "Check work data is off Walk Intern One's Walk Laptop 14",
    );
  });

  it("done once returned (company) or no longer used with work data removed (personal)", () => {
    expect(
      owedOf("2026-11-27", { ownership: "company", returned_on: "2026-11-27", retired: null })!
        .done,
    ).toBe(true);
    const retired = (work_removed: "yes" | "no") => ({
      ownership: "personal" as const,
      returned_on: null,
      retired: { on: "2026-11-30", why: "Left", work_removed },
    });
    expect(owedOf("2026-11-27", retired("yes"))!.done).toBe(true);
    expect(owedOf("2026-11-27", retired("no"))!.done).toBe(false);
    expect(owedOf(null, retired("no"))).toBeNull();
  });
});

const devices = async (owner: boolean) =>
  (await stack.ask("GET", `/data/devices${owner ? "?owner=1" : ""}`)).json!;
const detail = async (id: string, owner: boolean) =>
  (await stack.ask("GET", `/data/devices/${id}${owner ? "?owner=1" : ""}`)).json!;
const dueOf = async (owner: boolean) =>
  (
    (await stack.ask("GET", `/data/overview?due=all${owner ? "&owner=1" : ""}`)).json!.due as Body[]
  ).filter((item) => item.kind === "device");

/** Every way the ledger could leak: the name, the address, the id, the last day and the owed day. */
const ledgerWords = () => [NAME, EMAIL, personId, lastDay, addDays(lastDay, 5)];
const leaks = (text: string) => ledgerWords().filter((word) => word && text.includes(word));

beforeAll(async () => {
  out = mkdtempSync(join(tmpdir(), "hqdo-"));
  stack = await startStack({ modules: ["files", "people", "devices", "backup"] });
  const person = await stack.ask("POST", "/data/people", {
    name: NAME,
    email: EMAIL,
    kind: "intern",
    role_title: "Research intern",
    starts_on: addDays(today(), -60),
    ends_on: addDays(today(), 30),
    mentor: "Walk Mentor",
    by: WALKER,
  });
  expect(person.status).toBe(200);
  personId = String((person.json!.person as Body).person_id);
  const add = async (over: Body) => {
    const answer = await stack.ask("POST", "/data/devices", {
      holder: WALK_DEVICE.holder,
      kind: "laptop",
      platform: "mac",
      ...over,
      by: WALKER,
      attempt: attempt(),
    });
    expect(answer.status).toBe(200);
    return String((answer.json!.device as Body).device_id);
  };
  laptopId = await add({
    ownership: "personal",
    model: WALK_DEVICE.model,
    serial: WALK_DEVICE.serial,
  });
  companyId = await add({
    ownership: "company",
    model: "Walk Laptop 16",
    serial: "WALK-SERIAL-0002",
    issued_on: addDays(today(), -50),
  });
  lastDay = addDays(today(), 7);
}, 60_000);
afterAll(async () => {
  await stack.stop();
  rmSync(out, { recursive: true, force: true });
});

describe("the link, for the Owner only", () => {
  it("refuses without the Owner flag, 403 owner_only, and links nothing", async () => {
    for (const flag of [{}, { owner: false }, { owner: "true" }, { owner: 1 }]) {
      const answer = await stack.ask("POST", `/data/devices/${laptopId}/link`, {
        person_id: personId,
        ...flag,
        by: WALKER,
        attempt: attempt(),
      });
      expect([answer.status, codeOf(answer)]).toEqual([403, "owner_only"]);
      expect((answer.json!.error as Body).message).toBe(
        "This is for the Owner only: it comes from the people ledger.",
      );
    }
    const owner = (await detail(laptopId, true)).owner as Body;
    expect(owner.person).toBeNull();
  });

  it("links with the flag, answering only the device and whether it is linked, and keeps no replay", async () => {
    const id = attempt();
    for (const deviceId of [laptopId, companyId]) {
      const answer = await stack.ask("POST", `/data/devices/${deviceId}/link`, {
        owner: true,
        person_id: personId,
        by: WALKER,
        attempt: deviceId === laptopId ? id : attempt(),
      });
      expect(answer.status).toBe(200);
      expect(answer.json).toEqual({ ok: true, device_id: deviceId, linked: true });
    }
    const attempts = readFileSync(join(stack.dir, "data", "attempts.jsonl"), "utf8");
    expect(attempts.includes(id)).toBe(false);
    expect(leaks(attempts)).toEqual([]);
    const unknown = await stack.ask("POST", `/data/devices/${laptopId}/link`, {
      owner: true,
      person_id: "not-in-the-ledger",
      by: WALKER,
    });
    expect([unknown.status, codeOf(unknown)]).toEqual([404, "not_found"]);
  });

  it("asked without the flag, no answer carries the person or an owed day: the keys are absent", async () => {
    const admin = await devices(false);
    const owner = await devices(true);
    const [adminRow] = admin.devices as Body[];
    const [ownerRow] = owner.devices as Body[];
    const extra = Object.keys(ownerRow!).filter((key) => !(key in adminRow!));
    expect(extra.sort()).toEqual(["owed", "person"]);
    expect("person" in adminRow! || "owed" in adminRow!).toBe(false);
    expect(leaks(JSON.stringify(admin))).toEqual([]);
    const linked = (owner.devices as Body[]).find((row) => row.device_id === laptopId)!;
    expect(linked.person).toMatchObject({ person_id: personId, name: NAME, last_day: null });
    expect(linked.owed).toBeNull();
    const adminDetail = await detail(laptopId, false);
    const ownerDetail = await detail(laptopId, true);
    expect(Object.keys(ownerDetail).filter((key) => !(key in adminDetail))).toEqual(["owner"]);
    expect("owner" in adminDetail).toBe(false);
    expect(leaks(JSON.stringify(adminDetail))).toEqual([]);
    expect(((ownerDetail.owner as Body).people as Body[]).map((person) => person.name)).toEqual([
      NAME,
    ]);
  });
});

describe("a leaver's devices", () => {
  it("before offboarding: nothing is owed and no leaver row", async () => {
    expect((await dueOf(true)).filter((row) => String(row.key).endsWith(":leaver"))).toEqual([]);
  });

  it("from the day offboarding starts: two Owner-only rows with §5.3's days, none for an Admin", async () => {
    const started = await stack.ask("POST", `/data/people/${personId}/offboard`, {
      last_day: lastDay,
      by: WALKER,
    });
    expect(started.status).toBe(200);
    const leaver = (await dueOf(true)).filter((row) => String(row.key).endsWith(":leaver"));
    expect(leaver.map((row) => [row.key, row.title, row.sub, row.due_on, row.owner_only])).toEqual(
      [
        [
          `device:${companyId}:leaver`,
          "Get the Walk Laptop 16 back from Walk Intern One",
          "By the last day",
          lastDay,
          true,
        ],
        [
          `device:${laptopId}:leaver`,
          "Check work data is off Walk Intern One's Walk Laptop 14",
          "Within 5 days of the last day",
          addDays(lastDay, 5),
          true,
        ],
      ].sort((a, b) => String(a[3]).localeCompare(String(b[3]))),
    );
    const adminDue = await dueOf(false);
    expect(adminDue.some((row) => String(row.key).endsWith(":leaver"))).toBe(false);
    const overview = (await stack.ask("GET", "/data/overview?due=all")).json!;
    expect(leaks(JSON.stringify(overview))).toEqual([]);
    const owned = (await devices(true)).devices as Body[];
    expect(owned.find((row) => row.device_id === laptopId)!.owed).toEqual({
      by: addDays(lastDay, 5),
      words: "Within 5 days of the last day",
      done: false,
    });
  });

  it("the Summary counts leavers' devices only for the Owner; the evidence names nobody", async () => {
    const admin = (await stack.ask("GET", "/data/_test/devices/service")).json!;
    const owner = (await stack.ask("GET", "/data/_test/devices/service?owner=1")).json!;
    expect((admin.summary as Body[]).some((line) => line.key === "device-leavers")).toBe(false);
    expect(leaks(JSON.stringify(admin.summary))).toEqual([]);
    expect(leaks(JSON.stringify(admin.evidence))).toEqual([]);
    expect((owner.summary as Body[]).find((line) => line.key === "device-leavers")).toMatchObject({
      words: "2 devices are owed by leavers.",
      attention: true,
    });
    const person = (
      await stack.ask("GET", `/data/_test/devices/service?owner=1&person=${personId}`)
    ).json!.for_person as Body[];
    expect(person.map((line) => [line.device_id, line.by, line.done]).sort()).toEqual(
      [
        [companyId, lastDay, false],
        [laptopId, addDays(lastDay, 5), false],
      ].sort(),
    );
  });

  it("the Admin's CSV has no ledger columns and no name; the Owner's has both", async () => {
    const admin = (await stack.ask("GET", "/data/devices/export")).json!;
    const owner = (await stack.ask("GET", "/data/devices/export?owner=1")).json!;
    const adminCsv = String(admin.csv);
    const ownerCsv = String(owner.csv);
    expect(adminCsv.startsWith("﻿")).toBe(true);
    const adminHead = adminCsv.split("\r\n")[0] ?? adminCsv.split("\n")[0]!;
    expect(adminHead).not.toContain("in_the_people_ledger");
    expect(adminHead).not.toContain("owed_by");
    expect(leaks(adminCsv)).toEqual([]);
    expect(ownerCsv).toContain("in_the_people_ledger,owed_by");
    expect(ownerCsv).toContain(NAME);
    expect(ownerCsv).toContain(addDays(lastDay, 5));
  });

  it("returning the company laptop and retiring the personal one with work removed take both rows away", async () => {
    await stack.ask("POST", `/data/devices/${companyId}/return`, { on: today(), by: WALKER });
    await stack.ask("POST", `/data/devices/${laptopId}/retire`, {
      on: today(),
      why: "The internship ended",
      work_removed: "no",
      by: WALKER,
    });
    let leaver = (await dueOf(true)).filter((row) => String(row.key).endsWith(":leaver"));
    expect(leaver.map((row) => row.key)).toEqual([`device:${laptopId}:leaver`]);
    await stack.ask("POST", `/data/devices/${laptopId}/retire`, { undo: true, by: WALKER });
    await stack.ask("POST", `/data/devices/${laptopId}/retire`, {
      on: today(),
      why: "The internship ended",
      work_removed: "yes",
      by: WALKER,
    });
    leaver = (await dueOf(true)).filter((row) => String(row.key).endsWith(":leaver"));
    expect(leaver).toEqual([]);
    const owner = (await stack.ask("GET", "/data/_test/devices/service?owner=1")).json!;
    expect((owner.summary as Body[]).find((line) => line.key === "device-leavers")).toMatchObject({
      words: "No leaver's device is owed.",
      attention: false,
    });
  });
});

describe("what is written down", () => {
  it("no replay, event or record outside the ledger and the Owner's links names the person", async () => {
    const root = join(stack.dir, "data");
    const files: string[] = [];
    const walk = (folder: string) => {
      for (const name of readdirSync(folder)) {
        const path = join(folder, name);
        if (statSync(path).isDirectory()) walk(path);
        else files.push(path);
      }
    };
    walk(root);
    const allowed = (path: string) =>
      path.startsWith(join(root, "people")) ||
      path === join(root, "devices", "owner", "links.json");
    const found: string[] = [];
    for (const path of files.filter((file) => !allowed(file)))
      for (const word of leaks(readFileSync(path, "latin1"))) found.push(`${path}: ${word}`);
    expect(found).toEqual([]);
    const owner = readFileSync(join(root, "devices", "owner", "events.jsonl"), "utf8")
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as Body);
    expect(owner.map((line) => Object.keys(line).sort())).toEqual(
      owner.map(() => ["at", "by", "device_id", "event_id", "verb"]),
    );
    expect(readFileSync(join(root, "devices", "owner", "links.json"), "utf8")).toContain(personId);
  });

  it("the module logs nothing but the name of an error", () => {
    for (const name of ["devices", "logs", "recovery"]) {
      const folder = join(process.cwd(), "scripts", "data", name);
      for (const file of readdirSync(folder)) {
        const text = readFileSync(join(folder, file), "utf8");
        for (const call of text.match(/core\.log\([^;]*\);/g) ?? [])
          expect([file, call]).toEqual([
            file,
            expect.stringMatching(/error instanceof Error \? error\.name : "error"/),
          ]);
      }
    }
  });

  it("a backup an Admin makes holds no data/devices/owner/; the Owner's does", async () => {
    await stack.ask("POST", "/data/_test/backup/free-bytes", { bytes: 10 ** 13, by: WALKER });
    const made = async (people: boolean): Promise<string> => {
      const started = await stack.ask("POST", "/data/builds", {
        kind: "backup",
        people,
        by: WALKER,
      });
      const buildId = String((started.json!.build as Body).build_id);
      let state = "building";
      await until(async () => {
        state = String(
          ((await stack.ask("GET", `/data/builds/${buildId}`)).json!.build as Body).state,
        );
        return state !== "building";
      }, "the backup");
      expect(state).toBe("ready");
      const file = await stack.raw(stack.socket, "GET", `/data/builds/${buildId}/bytes`);
      const path = join(out, `devices-${String(people)}-${buildId}.zip`);
      writeFileSync(path, file.bytes);
      return path;
    };
    const entries = (zip: string) =>
      execFileSync("unzip", ["-Z1", zip], { encoding: "utf8" }).split("\n").filter(Boolean);
    const owners = entries(await made(true));
    expect(owners).toContain("data/devices/owner/links.json");
    expect(owners).toContain("data/devices/devices.json");
    const othersPath = await made(false);
    const others = entries(othersPath);
    expect(others).toContain("data/devices/devices.json");
    expect(others.some((name) => name.startsWith("data/devices/owner/"))).toBe(false);
    const everything = execFileSync("unzip", ["-p", othersPath], { maxBuffer: 1024 ** 3 });
    expect(ledgerWords().filter((word) => word && everything.includes(word))).toEqual([]);
    await stack.ask("POST", "/data/_test/backup/free-bytes", { bytes: null, by: WALKER });
  }, 60_000);
});
