import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Systems › Devices on screen (ws-notes/security/spec.md §3.5, §7.6, §7.7): the latest
 * self-check's answers and check lines in words, never a "%"; the register asked with the
 * Owner flag only for the Owner; an Admin's page draws `OWNER_LEFT_OUT` and neither "In the
 * people ledger" nor "Owed by", and no ledger name. With the client mocked; everything invented.
 */

const mocks = vi.hoisted(() => ({ requireData: vi.fn(), readDevices: vi.fn() }));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/data/access", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/data/access")>()),
  requireData: mocks.requireData,
}));
vi.mock("@/lib/data/api/devices", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/data/api/devices")>()),
  readDevices: mocks.readDevices,
}));

import DevicesRegisterPage from "@/app/(portal)/data/systems/devices/page";
import { LatestCheck } from "@/components/data/devices/device-checks";
import type { DeviceRow, DevicesPage, SelfCheck } from "@/lib/data/api/devices";
import { OWNER_LEFT_OUT } from "@/lib/data/labels-controls";

const WALKER = { staff_id: "walk-owner", name: "Walk Owner" };
const STAFF = { staff_id: "walk-staff", display_name: "Walk Staff", email: "staff@hq.test" };
const contextFor = (role: string) => ({
  token: "walk-token",
  me: { role, capabilities: ["mail:send", "crm:read"], staff: STAFF },
});

const check: SelfCheck = {
  check_id: "walk-check",
  on: "2026-11-20",
  by_name: "Research intern",
  encryption: "no",
  screen_lock_minutes: 30,
  os_version: "26.1",
  updates_automatic: "yes",
  password_manager: "no",
  malware_protection: "not_applicable",
  firewall: "",
  work_data_local: "no",
  evidence_file_ids: ["walk-shot"],
  note: "",
  at: "2026-11-20T06:00:00.000Z",
  by: WALKER,
};

const LINES = [
  "Disk encryption is off.",
  "Locks after 30 minutes; your personal devices policy says 15.",
  "No password manager.",
  "Not answered: firewall.",
];

function row(owner: boolean): DeviceRow {
  return {
    device_id: "walk-device",
    holder: "Research intern",
    kind: "laptop",
    ownership: "personal",
    model: "Walk Laptop 14",
    serial: "WALK-SERIAL-0001",
    platform: "mac",
    issued_on: null,
    returned_on: null,
    retired: null,
    notes: "",
    created_at: "2026-11-20T05:00:00.000Z",
    created_by: WALKER,
    updated_at: "2026-11-20T06:00:00.000Z",
    updated_by: WALKER,
    label: "Walk Laptop 14",
    state: "active",
    added_on: "2026-11-20",
    last_check: check,
    checks_count: 1,
    next_check: "2026-12-20",
    checked: true,
    overdue: false,
    due: false,
    acknowledgement: null,
    ack_state: "none",
    ack_due_on: "2026-11-20",
    ack_line: "No personal-device acknowledgement.",
    check_lines: LINES,
    device_lines: ["No personal-device acknowledgement."],
    href: "/data/systems/devices/walk-device",
    ...(owner
      ? {
          person: {
            person_id: "walk-intern",
            name: "Walk Intern One",
            state: "offboarding" as const,
            last_day: "2026-11-27",
            href: "/data/people/walk-intern",
          },
          owed: { by: "2026-12-02", words: "Within 5 days of the last day", done: false },
        }
      : {}),
  };
}

function page(owner: boolean): DevicesPage {
  return {
    ok: true,
    view: "active",
    devices: [row(owner)],
    counts: {
      active: 1,
      company: 0,
      personal: 1,
      checked: 1,
      acknowledged_current: 0,
      personal_active: 1,
    },
    setup: { screen_lock_max: 15, check_months: null },
    policy: null,
    policies_loaded: false,
    policy_line: "Policies is not loaded here.",
    files_here: true,
    today: "2026-11-20",
  };
}

const previous = process.env.HQ_MAIL_MERGE_SOCKET;
beforeEach(() => {
  process.env.HQ_MAIL_MERGE_SOCKET = "/nonexistent/hq-test/s.sock";
  for (const mock of Object.values(mocks)) mock.mockReset();
});
afterEach(() => {
  if (previous === undefined) delete process.env.HQ_MAIL_MERGE_SOCKET;
  else process.env.HQ_MAIL_MERGE_SOCKET = previous;
});

describe("the latest self-check", () => {
  it("prints each answer and each line in words, the screenshots as links, and no per cent sign", () => {
    const { container } = render(
      <LatestCheck
        check={check}
        lines={LINES}
        files={[
          { file_id: "walk-shot", title: "Self-check 1 of Research intern's Walk Laptop 14" },
        ]}
      />,
    );
    const text = container.textContent ?? "";
    for (const words of [
      "Checked20 Nov 2026, by Research intern",
      "Disk encryptionNo",
      "Screen lockAfter 30 minutes",
      "System version26.1",
      "Malware protection is onNot applicable",
      "The firewall is onNot known",
      ...LINES,
    ])
      expect([words, text.includes(words)]).toEqual([words, true]);
    expect(screen.getByRole("link", { name: /Self-check 1 of Research intern/ })).toHaveAttribute(
      "href",
      "/data/files/walk-shot",
    );
    expect(text).not.toContain("%");
    expect(container.querySelector('[role="progressbar"], .meter, progress, meter')).toBeNull();
  });

  it("says when there is no check yet", () => {
    const { container } = render(<LatestCheck check={null} lines={[]} files={[]} />);
    expect(container.textContent).toBe("Not checked yet.");
  });
});

describe("the register and the Owner", () => {
  it("as an Admin asks without the flag, draws the left-out line and neither ledger column", async () => {
    mocks.requireData.mockResolvedValue({ context: contextFor("admin"), allowed: true });
    mocks.readDevices.mockResolvedValue(page(false));
    const { container } = render(await DevicesRegisterPage({ searchParams: Promise.resolve({}) }));
    expect(mocks.readDevices).toHaveBeenCalledWith("active", false);
    expect(container.textContent).toContain(OWNER_LEFT_OUT);
    const heads = [...container.querySelectorAll("#table-devices th")].map((th) => th.textContent);
    expect(heads).toEqual([
      "Device",
      "Holder",
      "Company or personal",
      "Last check",
      "Encryption",
      "Screen lock",
      "Acknowledged",
      "Next check",
    ]);
    expect(container.textContent).not.toContain("Walk Intern One");
    expect(container.textContent).not.toContain("Owed by");
    expect(container.textContent).not.toContain("%");
    expect(container.textContent).toContain("Disk encryption is off.");
  });

  it("as the Owner asks with the flag and draws the two columns with the person and the day", async () => {
    mocks.requireData.mockResolvedValue({ context: contextFor("owner"), allowed: true });
    mocks.readDevices.mockResolvedValue(page(true));
    const { container } = render(
      await DevicesRegisterPage({ searchParams: Promise.resolve({ view: "active" }) }),
    );
    expect(mocks.readDevices).toHaveBeenCalledWith("active", true);
    expect(container.textContent).not.toContain(OWNER_LEFT_OUT);
    const heads = [...container.querySelectorAll("#table-devices th")].map((th) => th.textContent);
    expect(heads.slice(-2)).toEqual(["In the people ledger", "Owed by"]);
    expect(screen.getByRole("link", { name: "Walk Intern One" })).toHaveAttribute(
      "href",
      "/data/people/walk-intern",
    );
    expect(container.textContent).toContain("2 Dec 2026");
  });

  it("says Data is for Owners and Admins to anyone else, and reads nothing", async () => {
    mocks.requireData.mockResolvedValue({ context: contextFor("sales"), allowed: false });
    const { container } = render(await DevicesRegisterPage({ searchParams: Promise.resolve({}) }));
    expect(mocks.readDevices).not.toHaveBeenCalled();
    expect(container.textContent).toContain("Data is for Owners and Admins.");
  });
});
