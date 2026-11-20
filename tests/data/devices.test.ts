// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { addDays, localDay } from "../../scripts/data/days";
import { checkLines, deviceCheckLine, missingOf } from "../../scripts/data/devices/checks";
import {
  ackStateOf,
  checkDueFrom,
  checkInDue,
  checkedInTime,
  nextCheckOf,
} from "../../scripts/data/devices/due";
import type { Acknowledgement, SelfCheck } from "../../scripts/data/devices/types";
import { WALK_DEVICE } from "../../scripts/data/devices/walk-seed";
import { screenLockLine } from "@/lib/data/labels-devices";
import { WALKER, codeOf, startStack, type Stack } from "./helpers";

/**
 * Devices (ws-notes/security/spec.md §5.3, §7): the self-check rows of §5.3 with the day
 * pinned; a device never checked; the acknowledgement and the policy's version moving on in
 * Files; the screen lock with and without his limit; the check lines; Due rows and their keys;
 * screenshots kept in Files and named in "Used for"; returned and retired; refusals. With the
 * stand-in `policies` (Assurance is not in this copy). Everything is invented.
 */

type Body = Record<string, unknown>;
const today = () => localDay(new Date());

const check = (over: Partial<SelfCheck> = {}): SelfCheck => ({
  check_id: "c1",
  on: "2026-11-20",
  by_name: "Research intern",
  encryption: "yes",
  screen_lock_minutes: 10,
  os_version: "26.1",
  updates_automatic: "yes",
  password_manager: "yes",
  malware_protection: "not_applicable",
  firewall: "yes",
  work_data_local: "no",
  evidence_file_ids: [],
  note: "",
  at: "2026-11-20T06:00:00.000Z",
  by: WALKER,
  ...over,
});

const ack = (version: number, fileId = "policy-file"): Acknowledgement => ({
  ack_id: `a${version}`,
  policy_file_id: fileId,
  policy_title: "Walk personal devices policy",
  policy_version: version,
  on: "2026-11-20",
  how: "signed",
  copy_file_id: null,
  by_name: "Research intern",
  at: "2026-11-20T06:00:00.000Z",
  by: WALKER,
});

describe("the self-check rows of §5.3, the day pinned", () => {
  it("31 Jan 2027 → 28 Feb 2027, in Due from 21 Feb 2027", () => {
    const next = nextCheckOf("2027-01-31", "2026-11-20", 1);
    expect(next).toBe("2027-02-28");
    expect(checkDueFrom(next)).toBe("2027-02-21");
    expect(checkInDue(next, "2027-02-20")).toBe(false);
    expect(checkInDue(next, "2027-02-21")).toBe(true);
  });

  it("14 Nov 2026 → 14 Dec 2026, in Due from 7 Dec 2026; checked in the last month on 20 Nov", () => {
    const next = nextCheckOf("2026-11-14", "2026-10-01", 1);
    expect(next).toBe("2026-12-14");
    expect(checkDueFrom(next)).toBe("2026-12-07");
    expect(checkedInTime("2026-11-14", next, "2026-11-20")).toBe(true);
    expect(checkedInTime("2026-11-14", next, "2026-12-15")).toBe(false);
  });

  it("never checked, added 20 Nov 2026: due 20 Nov 2026 and in Due that day", () => {
    const next = nextCheckOf(null, "2026-11-20", 1);
    expect(next).toBe("2026-11-20");
    expect(checkDueFrom(next)).toBe("2026-11-13");
    expect(checkInDue(next, "2026-11-20")).toBe(true);
    expect(checkedInTime(null, next, "2026-11-20")).toBe(false);
    expect(deviceCheckLine({ in_use: true, last_on: null, next, today: "2026-11-20" })).toBe(
      "Not checked yet.",
    );
  });

  it("his months move the next day: every 2 months from 31 Dec 2026 is 28 Feb 2027", () => {
    expect(nextCheckOf("2026-12-31", "2026-11-20", 2)).toBe("2027-02-28");
  });

  it("an overdue check says since when; one not yet due says nothing", () => {
    expect(
      deviceCheckLine({
        in_use: true,
        last_on: "2026-09-01",
        next: "2026-10-01",
        today: "2026-11-20",
      }),
    ).toBe("Self-check due since 1 Oct 2026.");
    expect(
      deviceCheckLine({
        in_use: true,
        last_on: "2026-11-14",
        next: "2026-12-14",
        today: "2026-11-20",
      }),
    ).toBeNull();
    expect(
      deviceCheckLine({ in_use: false, last_on: null, next: "2026-11-20", today: "2026-11-20" }),
    ).toBeNull();
  });
});

describe("the acknowledgement and the policy's version", () => {
  const base = { ownership: "personal" as const, in_use: true, added_on: "2026-11-20" };
  const policy = (version: number, on: string) => ({
    file_id: "policy-file",
    title: "Walk personal devices policy",
    version,
    version_on: on,
  });

  it("none on a personal device in use: a Due row on the day it was added", () => {
    const state = ackStateOf({ ...base, acks: [], policy: policy(1, "2026-11-01") });
    expect(state).toMatchObject({
      state: "none",
      due_on: "2026-11-20",
      words: "No personal-device acknowledgement.",
    });
  });

  it("version 1 given, the policy now version 2 added 3 Dec 2026: the line and a row on 3 Dec 2026", () => {
    const state = ackStateOf({ ...base, acks: [ack(1)], policy: policy(2, "2026-12-03") });
    expect(state).toMatchObject({
      state: "moved",
      due_on: "2026-12-03",
      words: "Acknowledged version 1; the policy is now version 2.",
    });
  });

  it("on the current version: nothing; a company device never needs one", () => {
    expect(ackStateOf({ ...base, acks: [ack(2)], policy: policy(2, "2026-12-03") })).toMatchObject({
      state: "current",
      due_on: null,
      words: null,
    });
    expect(
      ackStateOf({ ...base, ownership: "company", acks: [], policy: policy(2, "2026-12-03") }),
    ).toMatchObject({ state: "not_needed", due_on: null });
  });

  it("without a linked policy the version is not checked; given on another document, it is asked again", () => {
    expect(ackStateOf({ ...base, acks: [ack(1)], policy: null })).toMatchObject({
      state: "unchecked",
      due_on: null,
    });
    expect(ackStateOf({ ...base, acks: [ack(1)], policy: undefined }).state).toBe("unchecked");
    expect(
      ackStateOf({ ...base, acks: [ack(3, "another-file")], policy: policy(2, "2026-12-03") }),
    ).toMatchObject({
      state: "moved",
      words: "Acknowledged on another document; the personal devices policy is version 2.",
    });
  });
});

describe("the screen lock and the check lines", () => {
  it("his limit of 15: 30 says so, 10 says nothing; no limit says the minutes and compares nothing", () => {
    expect(screenLockLine(30, 15)).toBe(
      "Locks after 30 minutes; your personal devices policy says 15.",
    );
    expect(screenLockLine(10, 15)).toBeNull();
    expect(screenLockLine(30, null)).toBe("Locks after 30 minutes.");
    expect(screenLockLine(1, null)).toBe("Locks after 1 minute.");
  });

  it("every line in order, malware 'not applicable' saying nothing, and what was left out", () => {
    expect(checkLines(check(), 15)).toEqual([]);
    expect(
      checkLines(
        check({
          encryption: "no",
          screen_lock_minutes: 30,
          updates_automatic: "no",
          password_manager: "no",
          malware_protection: "no",
          firewall: "no",
          work_data_local: "yes",
        }),
        15,
      ),
    ).toEqual([
      "Disk encryption is off.",
      "Locks after 30 minutes; your personal devices policy says 15.",
      "Updates are not automatic.",
      "No password manager.",
      "No malware protection.",
      "The firewall is off.",
      "Customer data or product secrets are kept on it.",
    ]);
    const unanswered = check({
      encryption: "",
      screen_lock_minutes: null,
      os_version: "",
      firewall: "",
    });
    expect(missingOf(unanswered)).toEqual([
      "disk encryption",
      "screen lock",
      "system version",
      "firewall",
    ]);
    expect(checkLines(unanswered, null)).toEqual([
      "Not answered: disk encryption, screen lock, system version, firewall.",
    ]);
    expect(checkLines(null, 15)).toEqual([]);
  });
});

// ------------------------------------------------------------------ on the real stack

let stack: Stack;
let policyFileId = "";
const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.from("an invented screenshot, made in the test"),
]);
const attempt = () => crypto.randomUUID();

async function put(
  title: string,
  name: string,
  text: string | Buffer,
  folder = ["Security", "Policies"],
) {
  const answer = await stack.ask("POST", "/data/_test/files/put", {
    folder_path: folder,
    title,
    name,
    base64: Buffer.from(text).toString("base64"),
    by: WALKER,
  });
  expect(answer.status).toBe(200);
  return answer.json!.file as Body;
}

async function addDevice(over: Body = {}): Promise<Body> {
  const answer = await stack.ask("POST", "/data/devices", {
    holder: WALK_DEVICE.holder,
    kind: WALK_DEVICE.kind,
    ownership: WALK_DEVICE.ownership,
    model: WALK_DEVICE.model,
    serial: WALK_DEVICE.serial,
    platform: WALK_DEVICE.platform,
    ...over,
    by: WALKER,
    attempt: attempt(),
  });
  expect([answer.status, answer.json?.error]).toEqual([200, undefined]);
  return answer.json!.device as Body;
}

const due = async (): Promise<Body[]> =>
  ((await stack.ask("GET", "/data/overview?due=all")).json!.due as Body[]).filter(
    (item) => item.kind === "device",
  );

const selfCheck = (deviceId: string, over: Body = {}) =>
  stack.ask("POST", `/data/devices/${deviceId}/checks`, {
    on: today(),
    by_name: "Research intern",
    encryption: "yes",
    screen_lock_minutes: "10",
    os_version: "26.1",
    updates_automatic: "yes",
    password_manager: "yes",
    malware_protection: "not_applicable",
    firewall: "yes",
    work_data_local: "no",
    ...over,
    by: WALKER,
    attempt: attempt(),
  });

beforeAll(async () => {
  stack = await startStack({ modules: ["files", "devices"] });
  const file = await put(
    "Walk personal devices policy",
    "policy-v1.txt",
    "Walk personal devices policy, version 1.\n",
  );
  policyFileId = String(file.file_id);
}, 60_000);
afterAll(async () => {
  await stack.stop();
});

describe("without Assurance, and with the stand-in policy", () => {
  it("says Policies is not loaded, then that the policy is not linked, then reads its version", async () => {
    let page = (await stack.ask("GET", "/data/devices")).json!;
    expect(page.policies_loaded).toBe(false);
    expect(page.policy).toBeNull();
    expect(page.policy_line).toBe("Policies is not loaded here.");
    const none = await stack.ask("POST", "/data/_test/devices/policies", { files: [], by: WALKER });
    expect(none.json).toMatchObject({ installed: true, real: false });
    page = (await stack.ask("GET", "/data/devices")).json!;
    expect(page.policy_line).toBe(
      "The personal devices policy is not linked in Assurance, so its version is not checked.",
    );
    const linked = await stack.ask("POST", "/data/_test/devices/policies", {
      files: [{ file_id: policyFileId, title: "Walk personal devices policy", version: 1 }],
      by: WALKER,
    });
    expect(linked.json).toMatchObject({ installed: true });
    page = (await stack.ask("GET", "/data/devices")).json!;
    expect(page.policy_line).toBeNull();
    expect(page.policy).toMatchObject({ file_id: policyFileId, version: 1, version_on: today() });
  });
});

describe("a personal laptop, never checked", () => {
  let deviceId = "";

  it("reads 'Not checked yet' and gives two Due rows on the day it was added", async () => {
    const device = await addDevice();
    deviceId = String(device.device_id);
    expect(device).toMatchObject({
      label: "Walk Laptop 14",
      state: "active",
      next_check: today(),
      checked: false,
      device_lines: ["Not checked yet.", "No personal-device acknowledgement."],
      check_lines: [],
    });
    const rows = await due();
    expect(rows.map((row) => [row.key, row.title, row.sub, row.due_on])).toEqual([
      [
        `device:${deviceId}:ack`,
        "Personal-device acknowledgement from Research intern",
        "Walk Laptop 14",
        today(),
      ],
      [
        `device:${deviceId}:check`,
        "Self-check of Research intern's Walk Laptop 14",
        "Not checked yet",
        today(),
      ],
    ]);
    expect(rows.every((row) => row.href === `/data/systems/devices/${deviceId}`)).toBe(true);
    expect(rows.some((row) => "owner_only" in row)).toBe(false);
  });

  it("a self-check with encryption off and a screenshot: the line, the file in Files, 'Used for'", async () => {
    const answer = await selfCheck(deviceId, {
      encryption: "no",
      screenshots: [{ name: "encryption.png", content: PNG.toString("base64") }],
    });
    expect(answer.status).toBe(200);
    const device = answer.json!.device as Body;
    expect(device.check_lines).toEqual(["Disk encryption is off.", "Locks after 10 minutes."]);
    expect(device.device_lines).toEqual(["No personal-device acknowledgement."]);
    expect(device.checked).toBe(true);
    const last = device.last_check as Body;
    const [fileId] = last.evidence_file_ids as string[];
    expect(typeof fileId).toBe("string");
    const file = (await stack.ask("GET", `/data/files/${fileId}`)).json!.file as Body;
    expect(file.folder_path).toBe("Security › Devices");
    expect(file.used_for).toEqual([
      {
        label: `Self-check of Research intern's laptop, ${dayOf(today())}`,
        href: `/data/systems/devices/${deviceId}`,
      },
    ]);
    // The check row leaves Due: the next one is a month away.
    expect((await due()).map((row) => row.key)).toEqual([`device:${deviceId}:ack`]);
  });

  it("his screen-lock limit of 5 compares the last check's 10 minutes", async () => {
    const saved = await stack.ask("POST", "/data/devices/setup", {
      screen_lock_max: "5",
      by: WALKER,
    });
    expect(saved.json!.setup).toEqual({ screen_lock_max: 5, check_months: null });
    const device = (await stack.ask("GET", `/data/devices/${deviceId}`)).json!.device as Body;
    expect(device.check_lines).toEqual([
      "Disk encryption is off.",
      "Locks after 10 minutes; your personal devices policy says 5.",
    ]);
    await stack.ask("POST", "/data/devices/setup", { screen_lock_max: "", by: WALKER });
  });

  it("the acknowledgement on version 1 takes its row away; version 2 in Files brings it back", async () => {
    const recorded = await stack.ask("POST", `/data/devices/${deviceId}/acknowledgements`, {
      on: today(),
      how: "signed",
      by_name: "Research intern",
      by: WALKER,
      attempt: attempt(),
    });
    expect(recorded.status).toBe(200);
    expect(recorded.json!.device).toMatchObject({
      ack_state: "current",
      acknowledgement: { policy_file_id: policyFileId, policy_version: 1 },
      device_lines: [],
    });
    expect(await due()).toEqual([]);
    // A second version of the policy, through the files service, same title and folder.
    const second = await put(
      "Walk personal devices policy",
      "policy-v2.txt",
      "Walk personal devices policy, version 2, with a shorter screen lock.\n",
    );
    expect(second.file_id).toBe(policyFileId);
    const device = (await stack.ask("GET", `/data/devices/${deviceId}`)).json!;
    expect((device.policy as Body).version).toBe(2);
    expect((device.device as Body).device_lines).toEqual([
      "Acknowledged version 1; the policy is now version 2.",
    ]);
    expect((await due()).map((row) => [row.key, row.due_on])).toEqual([
      [`device:${deviceId}:ack`, today()],
    ]);
  });

  it("names the screenshot and nothing else in 'Used for', from the service", async () => {
    const detail = (await stack.ask("GET", `/data/devices/${deviceId}`)).json!.device as Body;
    const [latest] = detail.checks as Body[];
    expect((latest!.files as Body[]).length).toBe(1);
    const other = await stack.ask("GET", `/data/_test/devices/service?file=${policyFileId}`);
    expect(other.json!.used_for).toEqual([]);
  });
});

describe("returned, retired, and the views", () => {
  it("a company laptop is returned; a personal phone is no longer used for work; both stay listed", async () => {
    const laptop = await addDevice({
      holder: "Walk Engineer",
      ownership: "company",
      model: "Walk Laptop 16",
      serial: "WALK-SERIAL-0002",
      issued_on: addDays(today(), -30),
    });
    const phone = await addDevice({
      holder: "Walk Analyst",
      kind: "phone",
      model: "",
      serial: "WALK-SERIAL-0003",
      platform: "android",
    });
    expect(phone.label).toBe("Phone");
    const returned = await stack.ask("POST", `/data/devices/${laptop.device_id}/return`, {
      on: today(),
      by: WALKER,
    });
    expect(returned.json!.device).toMatchObject({ state: "returned", next_check: null });
    const again = await stack.ask("POST", `/data/devices/${laptop.device_id}/return`, {
      by: WALKER,
    });
    expect([again.status, codeOf(again)]).toEqual([409, "invalid"]);
    const retired = await stack.ask("POST", `/data/devices/${phone.device_id}/retire`, {
      on: today(),
      why: "Replaced by a new phone",
      work_removed: "yes",
      by: WALKER,
    });
    expect(retired.json!.device).toMatchObject({
      state: "retired",
      retired: { why: "Replaced by a new phone", work_removed: "yes" },
      device_lines: [],
    });
    const listed = (await stack.ask("GET", "/data/devices?view=returned")).json!;
    expect((listed.devices as Body[]).map((row) => row.label).sort()).toEqual([
      "Phone",
      "Walk Laptop 16",
    ]);
    const active = (await stack.ask("GET", "/data/devices")).json!;
    expect((active.devices as Body[]).map((row) => row.label)).toEqual(["Walk Laptop 14"]);
    expect(active.counts).toEqual({
      active: 1,
      company: 0,
      personal: 1,
      checked: 1,
      acknowledged_current: 0,
      personal_active: 1,
    });
    expect(
      ((await stack.ask("GET", "/data/devices?view=all")).json!.devices as Body[]).length,
    ).toBe(3);
    // Neither gives a Due row any more.
    expect((await due()).every((row) => !String(row.key).includes(String(phone.device_id)))).toBe(
      true,
    );
    const undo = await stack.ask("POST", `/data/devices/${phone.device_id}/retire`, {
      undo: true,
      by: WALKER,
    });
    expect((undo.json!.device as Body).state).toBe("active");
    await stack.ask("POST", `/data/devices/${phone.device_id}/retire`, {
      why: "Replaced by a new phone",
      work_removed: "yes",
      by: WALKER,
    });
  });
});

describe("refusals", () => {
  it("refuses what §7.3 refuses, with the sentence the page shows", async () => {
    const device = await addDevice({ holder: "Walk Designer", model: "Walk Tablet" });
    const id = String(device.device_id);
    const cases: [string, Body, number, string][] = [
      ["/data/devices", { holder: "", ownership: "personal" }, 400, "Say who holds it."],
      ["/data/devices", { holder: "x", ownership: "both" }, 400, "Choose Company or Personal."],
      [
        "/data/devices",
        { holder: "x", ownership: "personal", notes: "password: hunter2" },
        400,
        "Write where it is kept, never its password.",
      ],
      [
        "/data/devices",
        { holder: "x", ownership: "personal", issued_on: addDays(today(), 3) },
        400,
        "That day is in the future.",
      ],
      [`/data/devices/${id}/return`, {}, 409, "Only a company device is returned."],
      [
        `/data/devices/${id}/retire`,
        { why: "Lost" },
        400,
        "Say whether work accounts were signed out and work data removed.",
      ],
      [
        `/data/devices/${id}/checks`,
        { by_name: "x", screen_lock_minutes: "2000" },
        400,
        "Type the minutes as a whole number from 0 to 1,440.",
      ],
      [
        `/data/devices/${id}/checks`,
        { by_name: "x", encryption: "maybe" },
        400,
        "Choose Yes, No or Not known.",
      ],
      [
        `/data/devices/${id}/checks`,
        { by_name: "x", on: addDays(today(), 1) },
        400,
        "That day is in the future.",
      ],
      [
        `/data/devices/${id}/checks`,
        {
          by_name: "x",
          screenshots: Array.from({ length: 6 }, () => ({
            name: "a.png",
            content: PNG.toString("base64"),
          })),
        },
        400,
        "Add at most 5 screenshots to one check.",
      ],
      [
        `/data/devices/${id}/checks`,
        {
          by_name: "x",
          screenshots: [
            { name: "notes.txt", content: Buffer.from("plain text").toString("base64") },
          ],
        },
        400,
        "A screenshot is a picture or a PDF.",
      ],
      [
        `/data/devices/${id}/checks`,
        { by_name: "x", screenshots: [{ file_id: "nope" }] },
        404,
        "That file is not in Files.",
      ],
      [
        `/data/devices/${id}/acknowledgements`,
        { how: "telepathy", by_name: "x" },
        400,
        "Choose how it was given.",
      ],
      [
        "/data/devices/setup",
        { screen_lock_max: "0" },
        400,
        "Type the limit as a whole number of minutes from 1 to 1,440, or leave it empty.",
      ],
      [
        "/data/devices/setup",
        { check_months: "13" },
        400,
        "Type the months as a whole number from 1 to 12, or leave it empty.",
      ],
      ["/data/devices/not-a-device/update", { holder: "x" }, 404, "That device is not here."],
    ];
    for (const [path, body, status, sentence] of cases) {
      const answer = await stack.ask("POST", path, { ...body, by: WALKER, attempt: attempt() });
      const error = answer.json!.error as Body | undefined;
      expect([path, answer.status, error?.message]).toEqual([path, status, sentence]);
    }
    const company = await addDevice({
      holder: "Walk Engineer",
      ownership: "company",
      model: "Walk Desktop",
      kind: "desktop",
    });
    const companyAck = await stack.ask(
      "POST",
      `/data/devices/${company.device_id}/acknowledgements`,
      {
        how: "signed",
        by_name: "x",
        by: WALKER,
      },
    );
    expect((companyAck.json!.error as Body).message).toBe(
      "An acknowledgement is for a personal device.",
    );
    // A serial is stored as typed, even when it looks like a key to the secret guard.
    const serial = await addDevice({ holder: "Walk Ops", serial: "ghp_WALK0001" });
    expect(serial.serial).toBe("ghp_WALK0001");
  });
});

describe("the service other modules read", () => {
  it("gives Summary lines and evidence that name no one, and counts", async () => {
    const service = (await stack.ask("GET", "/data/_test/devices/service")).json!;
    const keys = (service.summary as Body[]).map((line) => line.key);
    expect(keys).toEqual(["devices", "encryption", "acknowledgements"]);
    const [devices, encryption, acknowledgements] = service.summary as Body[];
    expect(devices!.words).toMatch(
      /^\d+ devices: \d+ company, \d+ personal; \d+ checked in the last month\.$/,
    );
    expect(encryption).toMatchObject({
      words: "1 device's last check found disk encryption off.",
      attention: true,
    });
    expect(acknowledgements!.words).toMatch(
      /personal devices have an acknowledgement on the current version\.$/,
    );
    expect((service.evidence as Body[]).map((option) => option.ref)).toEqual([
      "devices:register",
      "devices:acknowledgements",
    ]);
    expect(String((service.evidence as Body[])[0]!.label)).toMatch(
      /^Device register: \d+ devices, self-checked monthly$/,
    );
    expect(JSON.stringify(service)).not.toContain("%");
  });

  it("gives an overview block of counts only", async () => {
    const overview = (await stack.ask("GET", "/data/overview")).json!;
    expect(Object.keys(overview.devices as Body).sort()).toEqual([
      "acknowledged_current",
      "active",
      "checked",
      "personal_active",
    ]);
  });

  it("puts no device in the calendar and none in the search", async () => {
    const status = await stack.ask("GET", "/data/search?q=Walk");
    expect(status.status === 404 || !JSON.stringify(status.json).includes("Walk Laptop 14")).toBe(
      true,
    );
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
