// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { addDays, localDay } from "../../scripts/data/days";
import {
  addDevice,
  exportDevices,
  linkDevice,
  readDevice,
  readDevices,
  recordAcknowledgement,
  recordCheck,
  retireDevice,
  returnDevice,
  saveDevicesSetup,
  updateDevice,
} from "@/lib/data/api/devices";
import { WALKER, startStack, type Stack } from "./helpers";

/**
 * The portal's Devices client against the real stack (ws-notes/security/spec.md §7.4, §7.7):
 * every answer passes its schema, asked as the Owner and not; the Admin's answers carry no
 * person and no owed day. Invented names; screenshots are bytes made here.
 */

let stack: Stack;
const today = () => localDay(new Date());
const attempt = () => crypto.randomUUID();
const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.from("an invented screenshot"),
]).toString("base64");

beforeAll(async () => {
  stack = await startStack({ env: true, modules: ["files", "people", "devices"] });
}, 60_000);
afterAll(() => stack.stop());

describe("the portal and Devices agree", () => {
  it("every read and write answers what its schema reads", async () => {
    const empty = await readDevices("active", false);
    expect(empty.devices).toEqual([]);
    expect(empty.policy_line).toBe("Policies is not loaded here.");
    const put = await stack.ask("POST", "/data/_test/files/put", {
      folder_path: ["Security", "Policies"],
      title: "Walk personal devices policy",
      name: "policy.txt",
      base64: Buffer.from("Walk personal devices policy, version 1.\n").toString("base64"),
      by: WALKER,
    });
    const policyId = String((put.json!.file as Record<string, unknown>).file_id);
    await stack.ask("POST", "/data/_test/devices/policies", {
      files: [{ file_id: policyId, title: "Walk personal devices policy", version: 1 }],
      by: WALKER,
    });
    const added = await addDevice(
      {
        holder: "Research intern",
        kind: "laptop",
        ownership: "personal",
        model: "Walk Laptop 14",
        serial: "WALK-SERIAL-0001",
        platform: "mac",
      },
      WALKER,
      attempt(),
    );
    const id = added.device.device_id;
    await updateDevice(id, { notes: "Recovery key in the office safe." }, WALKER);
    const checked = await recordCheck(
      id,
      { by_name: "Research intern", encryption: "no", screen_lock_minutes: "30" },
      [{ name: "shot.png", content: PNG }],
      WALKER,
      attempt(),
    );
    expect(checked.device.check_lines[0]).toBe("Disk encryption is off.");
    const acked = await recordAcknowledgement(
      id,
      { policy_file_id: policyId, how: "email", by_name: "Research intern", on: today() },
      {},
      WALKER,
      attempt(),
    );
    expect(acked.device.ack_state).toBe("current");
    const setup = await saveDevicesSetup({ screen_lock_max: "15", check_months: "2" }, WALKER);
    expect(setup.setup).toEqual({ screen_lock_max: 15, check_months: 2 });
    const company = await addDevice(
      {
        holder: "Walk Engineer",
        ownership: "company",
        model: "Walk Laptop 16",
        issued_on: addDays(today(), -10),
      },
      WALKER,
      attempt(),
    );
    await returnDevice(company.device.device_id, today(), WALKER);
    const phone = await addDevice(
      { holder: "Walk Analyst", ownership: "personal", kind: "phone", platform: "ios" },
      WALKER,
      attempt(),
    );
    await retireDevice(
      phone.device.device_id,
      { on: today(), why: "Replaced", work_removed: "yes" },
      WALKER,
    );
    await retireDevice(phone.device.device_id, { undo: true }, WALKER);
    for (const view of ["active", "returned", "all"])
      for (const owner of [false, true]) {
        const page = await readDevices(view, owner);
        expect(page.view).toBe(view);
        for (const row of page.devices) expect("person" in row).toBe(owner);
      }
    const person = await stack.ask("POST", "/data/people", {
      name: "Walk Intern One",
      email: "one@walkintern.example",
      kind: "intern",
      starts_on: addDays(today(), -30),
      ends_on: addDays(today(), 30),
      by: WALKER,
    });
    const personId = String((person.json!.person as Record<string, unknown>).person_id);
    expect((await linkDevice(id, personId, WALKER)).linked).toBe(true);
    const asOwner = await readDevice(id, true);
    expect(asOwner.owner?.person?.name).toBe("Walk Intern One");
    expect(asOwner.device.checks[0]?.files.length).toBe(1);
    expect(asOwner.device.acknowledgements[0]?.policy_version).toBe(1);
    const asAdmin = await readDevice(id, false);
    expect(asAdmin.owner).toBeUndefined();
    expect(JSON.stringify(asAdmin)).not.toContain("Walk Intern One");
    expect((await linkDevice(id, "", WALKER)).linked).toBe(false);
    const csv = await exportDevices(false);
    expect(csv.name).toMatch(/^Devices \d{4}-\d{2}-\d{2}\.csv$/);
    expect(csv.csv).toContain("Walk Laptop 14");
    expect((await exportDevices(true)).csv).toContain("in_the_people_ledger");
  });
});
