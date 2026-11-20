// @vitest-environment node
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { addMonths } from "../../scripts/data/company-contracts";
import { addDays, localDay } from "../../scripts/data/days";
import { ruleLineOf, type DutyRuleState } from "../../scripts/data/duties-contracts";
import { writeXlsx } from "../../scripts/data/questionnaires/xlsx-write";
import { GET as calendarFeedRoute } from "@/app/cal/[token]/route";
import { dataOwedRows } from "@/components/data/home-block";
import type { DataOverview } from "@/lib/data/api/overview";
import { NOT_EMPANELLED } from "@/lib/data/labels-assurance";
import { dayWords } from "@/lib/data/labels-company";
import { billedWords } from "@/lib/data/labels-systems";
import { outOfDateWords } from "@/lib/data/labels-questionnaires";
import { Scripted } from "./leads-kit";
import { WALKER, codeOf, startStack, until, type RawAnswer, type Stack } from "./helpers";
import { deflated } from "./questionnaires-kit";

/**
 * The security batch's seams with every module loaded (ws-notes/security/spec.md §3.6). Each
 * unit proved its half against stand-ins; this file proves the halves meet: every stand-in
 * idle and the Summary whole; the Owner rule end to end through the people ledger, Tools and
 * Devices; a customer duty in the real profiles shortening a Dependabot finding's day, and
 * the lead's merge fix (a `cscrf-empanelled` duty, read through `inContract`, putting the
 * "not empanelled" line on a pen test); the real policies and pen tests as an answer's
 * evidence; Tools beside Key dates, Money and Domains; a device's acknowledgement following
 * the policy's version in Files; a questionnaire round trip through U4's XLSX build; a log
 * system from a real tool with the real rule book's line; Data's own backup row; search and
 * the calendar; and nothing sent or fetched.
 *
 * Every person, firm, address, file and question is invented (spec §2 rule 7: no CAIQ or SIG
 * text, no real person). The ledger's person is "Walk Intern Seven", a name no walk seeds; the
 * device's holder is typed as "Summer research intern", so an Admin's answers can be shown to
 * hold the typed holder and never the ledger's name. The other names follow §3.6.
 *
 * Shipped shapes the spec did not say, tested as shipped: the exports are builds (U1's
 * `tools_accounts_csv`, U4's `questionnaire_xlsx` with `questionnaire_id`); Devices' export is
 * a GET answering `{ name, csv }` (U2); Home's owed rows are proved with Home's own
 * `dataOwedRows` on the overview read as of the close-by day, since the row is due a week
 * from today; the questionnaire service answers no question cells, so the round trip reads
 * the re-import's preview, which shows the rows as read before anything is kept (§9.3).
 */

type Body = Record<string, unknown>;
type Due = {
  key: string;
  kind: string;
  title: string;
  sub: string;
  due_on: string;
  owner_only?: boolean;
};
type Fix = { fix_by: string; words: string; lines: string[]; because: Body | null };

const INTERN = "Walk Intern Seven";
const INTERN_EMAIL = "walk.seven@walk.example";
const HOLDER = "Summer research intern";
const ACCOUNT = "walk.intern@walk.example";
const LAST_DAY = "2026-11-27";
const CLOSE_BY = "2026-11-28";
const DATA_OFF_BY = "2026-12-02";
const NINE = [
  "tools",
  "devices",
  "logs",
  "recovery",
  "policies",
  "findings",
  "assurance",
  "questionnaires",
  "profiles",
] as const;

let stack: Stack;
let out = "";
let today = "";
const mail = new Scripted();
const shared = new Scripted();

let personId = "";
let mailTool = "";
let mailAccount = "";
let laptopId = "";
let entryId = "";
let profileId = "";
let penTestId = "";

const message = (answer: RawAnswer): string =>
  String(((answer.json?.error ?? {}) as { message?: unknown }).message ?? "");

async function ok(path: string, body: Body = {}): Promise<Body> {
  const answer = await stack.ask("POST", path, { by: WALKER, ...body });
  expect(answer.status, `${path}: ${message(answer)}`).toBe(200);
  return answer.json!;
}

async function get(path: string): Promise<Body> {
  const answer = await stack.ask("GET", path);
  expect(answer.status, `${path}: ${message(answer)}`).toBe(200);
  return answer.json!;
}

const attempt = () => crypto.randomUUID();
const b64 = (bytes: Uint8Array | string) => Buffer.from(bytes).toString("base64");

/** Every Due row, the later ones past the first 30 included. */
const dueAll = async (owner: boolean): Promise<Due[]> =>
  (await get(`/data/overview?due=all${owner ? "&owner=1" : ""}`)).due as Due[];

async function build(kind: string, extra: Body = {}): Promise<Buffer> {
  const started = await ok("/data/builds", { kind, ...extra });
  const buildId = String((started.build as Body).build_id);
  let state = "building";
  await until(
    async () => {
      state = String(((await get(`/data/builds/${buildId}`)).build as Body).state);
      return state !== "building";
    },
    kind,
    60_000,
  );
  expect(state, kind).toBe("ready");
  return (await stack.raw(stack.socket, "GET", `/data/builds/${buildId}/bytes`)).bytes;
}

/** A backup through the backup build, as the backup page makes one; returns its entries. */
async function backupEntries(people: boolean): Promise<{ path: string; names: string[] }> {
  await ok("/data/_test/backup/free-bytes", { bytes: 10 ** 13 });
  const bytes = await build("backup", { people });
  await ok("/data/_test/backup/free-bytes", { bytes: null });
  const path = join(out, `backup-${String(people)}-${attempt()}.zip`);
  writeFileSync(path, bytes);
  const names = execFileSync("unzip", ["-Z1", path], { encoding: "utf8" })
    .split("\n")
    .filter(Boolean);
  return { path, names };
}
const zipEntry = (zip: string, name: string): Buffer => execFileSync("unzip", ["-p", zip, name]);

/** A document in Files, as the files module's own test route puts one (a new version when the title is there). */
async function putFile(
  title: string,
  name: string,
  text: string,
  folder = ["Security", "Policies"],
) {
  const answer = await ok("/data/_test/files/put", {
    folder_path: folder,
    title,
    name,
    base64: b64(text),
  });
  return answer.file as Body & { file_id: string; version: number };
}

/** The calendar feed as a calendar app reads it, unfolded. */
async function feedText(detail: "full" | "plain"): Promise<string> {
  await ok("/data/calendar/detail", { detail });
  const token = String((await ok("/data/calendar/link")).token);
  const response = await calendarFeedRoute(new NextRequest(`http://127.0.0.1:3150/cal/${token}`), {
    params: Promise.resolve({ token }),
  });
  expect(response.status).toBe(200);
  return (await response.text()).replace(/\r\n[ \t]/g, "").replace(/\\,/g, ",");
}

const findingOf = async (id: string) =>
  (await get(`/data/findings/${id}`)).finding as Body & { fix: Fix; status: string };
const penTestOf = async (id: string) =>
  ((await get(`/data/findings/pen-tests/${id}`)).pen_test as Body & { checks: string[] }).checks;

beforeAll(async () => {
  out = mkdtempSync(join(tmpdir(), "hqsm-"));
  // Every module, as the sender loads them (core.ts MODULES); both providers only record.
  stack = await startStack({ env: true, liveProvider: () => mail, shareProvider: () => shared });
  today = String((await get("/data/_test/day")).day);
  expect(today).toBe(localDay(new Date()));
}, 120_000);

afterAll(async () => {
  await stack.stop();
  rmSync(out, { recursive: true, force: true });
});

describe("the security batch, merged (spec §3.6)", () => {
  it("1. every stand-in route declines while the real module answers; the Summary has every module and none absent", async () => {
    const tools = [{ tool_id: "walk-stand-in-tool", name: "Walk stand-in tool" }];
    const routes: [string, Body][] = [
      ["/data/_test/devices/tools", { tools }],
      ["/data/_test/logs/tools", { tools }],
      ["/data/_test/recovery/tools", { tools }],
      ["/data/_test/tools/devices", { by_person: {} }],
      ["/data/_test/devices/policies", { files: [] }],
      ["/data/_test/findings/profiles", { in_force: [] }],
      ...["tools", "devices", "logs", "recovery", "policies", "findings", "assurance"].map(
        (name): [string, Body] => ["/data/_test/answers/evidence", { name, options: [] }],
      ),
      ...NINE.map((name): [string, Body] => ["/data/_test/assurance/source", { name, lines: [] }]),
    ];
    for (const [path, body] of routes)
      expect({ path, body: body.name, answer: await ok(path, body) }).toMatchObject({
        path,
        answer: { installed: false, real: true },
      });

    for (const owner of [true, false]) {
      const summary = (await get(`/data/assurance${owner ? "?owner=1" : ""}`)) as {
        areas: { area: string; lines: { key: string; words: string }[] }[];
        absent: unknown[];
        owner: boolean;
      };
      expect(summary.owner).toBe(owner);
      expect(summary.absent).toEqual([]);
      expect(summary.areas.map((area) => area.area)).toEqual(["systems", "assurance", "buyers"]);
      const lines = summary.areas.flatMap((area) => area.lines);
      for (const name of NINE)
        expect(
          lines.some((line) => line.key.startsWith(`${name}:`)),
          name,
        ).toBe(true);
      expect(lines.filter((line) => /is not loaded here\.$/.test(line.words))).toEqual([]);
      expect(lines.filter((line) => line.key.endsWith(":failed"))).toEqual([]);
      expect(JSON.stringify(summary)).not.toContain("%");
    }
  });

  it("2. the Owner rule end to end: a leaver's account and laptop are the Owner's rows only, and closing both takes them away", async () => {
    personId = String(
      (
        (await ok("/data/people", {
          name: INTERN,
          email: INTERN_EMAIL,
          kind: "intern",
          role_title: "Research intern",
          starts_on: "2026-09-01",
          ends_on: "2027-01-29",
          mentor: "Walk Mentor",
          attempt: attempt(),
        })) as { person: Body }
      ).person.person_id,
    );
    mailTool = String(
      (
        (await ok("/data/tools", {
          name: "Walk Mail",
          category: "mail_docs",
          critical: true,
          mfa: "enforced",
          attempt: attempt(),
        })) as { tool: Body }
      ).tool.tool_id,
    );
    mailAccount = String(
      (
        (await ok(`/data/tools/${mailTool}/accounts`, { holder: ACCOUNT, attempt: attempt() })) as {
          account: Body;
        }
      ).account.account_id,
    );
    laptopId = String(
      (
        (await ok("/data/devices", {
          holder: HOLDER,
          kind: "laptop",
          ownership: "personal",
          platform: "mac",
          model: "Walk Laptop 14",
          serial: "WALK-MERGED-0001",
          attempt: attempt(),
        })) as { device: Body }
      ).device.device_id,
    );

    // As the Owner, both linked to the person; without the flag, refused.
    for (const path of [
      `/data/tools/accounts/${mailAccount}/link`,
      `/data/devices/${laptopId}/link`,
    ]) {
      const refused = await stack.ask("POST", path, { person_id: personId, by: WALKER });
      expect([path, refused.status, codeOf(refused)]).toEqual([path, 403, "owner_only"]);
      await ok(path, { person_id: personId, owner: true });
    }
    await ok(`/data/people/${personId}/offboard`, { last_day: LAST_DAY, attempt: attempt() });

    const leaverRows = (rows: Due[]) =>
      rows.filter((row) => row.kind === "account" || String(row.key).endsWith(":leaver"));
    const ownerDue = await dueAll(true);
    expect(
      leaverRows(ownerDue).map((row) => [row.key, row.title, row.due_on, row.owner_only]),
    ).toEqual([
      [`account:${mailAccount}`, `Close Walk Mail for ${INTERN}`, CLOSE_BY, true],
      [
        `device:${laptopId}:leaver`,
        `Check work data is off ${INTERN}'s Walk Laptop 14`,
        DATA_OFF_BY,
        true,
      ],
    ]);

    // Home's owed rows, as Home reads the overview on the close-by day: "Account" for the Owner only.
    const homeOn = async (owner: boolean) =>
      dataOwedRows({
        due: (await get(`/data/overview?due=all${owner ? "&owner=1" : ""}`))
          .due as DataOverview["due"],
        today: CLOSE_BY,
      });
    expect((await homeOn(true)).filter((row) => row.kind === "Account")).toEqual([
      expect.objectContaining({
        key: `data:account:${mailAccount}`,
        title: `Close Walk Mail for ${INTERN}`,
        due_on: CLOSE_BY,
        urgency: 2,
      }),
    ]);
    expect((await homeOn(false)).some((row) => row.kind === "Account")).toBe(false);

    // Nothing an Admin can read holds the name, the address, the id or either day.
    const words = [INTERN, INTERN_EMAIL, personId, LAST_DAY, CLOSE_BY, DATA_OFF_BY];
    const leaks = (text: string) => words.filter((word) => text.includes(word));
    const adminDue = await dueAll(false);
    expect(leaverRows(adminDue)).toEqual([]);
    expect(leaks(JSON.stringify(adminDue))).toEqual([]);
    const adminCsv = (await build("tools_accounts_csv")).toString("utf8");
    expect(adminCsv).not.toContain("In the people ledger");
    expect(adminCsv).toContain(ACCOUNT);
    expect(leaks(adminCsv)).toEqual([]);
    const adminDevicesCsv = String((await get("/data/devices/export")).csv);
    expect(adminDevicesCsv).toContain(HOLDER);
    expect(leaks(adminDevicesCsv)).toEqual([]);
    const adminDevices = (await get("/data/devices")).devices as Body[];
    const laptop = adminDevices.find((row) => row.device_id === laptopId)!;
    expect(laptop.holder).toBe(HOLDER);
    expect("person" in laptop || "owed" in laptop).toBe(false);
    for (const path of [
      "/data/assurance",
      "/data/calendar/items",
      "/data/search?q=intern",
      "/data/search?q=seven",
      "/data/tools/accounts",
      `/data/tools/${mailTool}`,
      `/data/devices/${laptopId}`,
      "/data/overview",
    ])
      expect({ path, found: leaks(JSON.stringify(await get(path))) }).toEqual({ path, found: [] });
    const calendar = (await get("/data/calendar/items")).items as { kind: string }[];
    expect(calendar.some((item) => item.kind === "account" || item.kind === "device")).toBe(false);
    expect(leaks(await feedText("full"))).toEqual([]);
    const admins = await backupEntries(false);
    for (const folder of ["data/people/", "data/tools/owner/", "data/devices/owner/"])
      expect(
        admins.names.some((name) => name.startsWith(folder)),
        folder,
      ).toBe(false);
    for (const name of admins.names.filter((entry) => !entry.endsWith("/")))
      expect({ name, found: leaks(zipEntry(admins.path, name).toString("latin1")) }).toEqual({
        name,
        found: [],
      });

    // The Owner reads both: the Summary counts the leaver, the person's page section lists both.
    const ownerSummary = JSON.stringify(await get("/data/assurance?owner=1"));
    expect(ownerSummary).toMatch(/leaver/);
    const section = await get(`/data/tools/for-person/${personId}?owner=1`);
    expect((section.accounts as Body[]).map((row) => row.tool_name)).toEqual(["Walk Mail"]);
    expect(section.devices as Body[]).toEqual([
      expect.objectContaining({
        device_id: laptopId,
        label: "Walk Laptop 14",
        ownership: "personal",
        by: DATA_OFF_BY,
        done: false,
      }),
    ]);
    expect(((await get(`/data/devices/${laptopId}?owner=1`)).owner as Body).person).toMatchObject({
      person_id: personId,
      name: INTERN,
    });

    // Closing the account and retiring the laptop with work data removed take both rows away.
    await ok(`/data/tools/accounts/${mailAccount}/close`, { closed_on: today });
    await ok(`/data/devices/${laptopId}/retire`, {
      on: today,
      why: "The internship ended",
      work_removed: "yes",
    });
    expect(leaverRows(await dueAll(true))).toEqual([]);
    const after = await get(`/data/tools/for-person/${personId}?owner=1`);
    expect(after.devices as Body[]).toEqual([expect.objectContaining({ done: true })]);
  }, 180_000);

  it("3. a customer duty shortens a fix-by day, and the empanelled duty puts its line on a pen test", async () => {
    entryId = String(
      (
        (await ok("/data/waitlist", {
          email: "asha@walkcapital.example",
          firm: "Walk Capital",
        })) as { entry: Body }
      ).entry.entry_id,
    );
    profileId = String(
      ((await ok("/data/profiles", { entry_id: entryId, attempt: attempt() })) as { profile: Body })
        .profile.profile_id,
    );
    const profile = (
      (await ok(`/data/profiles/${profileId}/update`, {
        sebi: "on",
        sebi_category: "mid",
        applies_from: today,
      })) as { profile: { duties: { duty_id: string; key: string }[] } }
    ).profile;
    const duty = (key: string) => profile.duties.find((item) => item.key === key)!.duty_id;
    const mark = (key: string, state: "in_contract" | "not_in_contract") =>
      ok(`/data/profiles/${profileId}/duties/${duty(key)}`, { state });
    await mark("cscrf-patch", "in_contract");

    const alert = {
      number: 1,
      state: "open",
      html_url: "https://github.com/walk-org/walk-merged/security/dependabot/1",
      created_at: "2026-11-19T20:00:00Z",
      fixed_at: null,
      dismissed_at: null,
      auto_dismissed_at: null,
      dismissed_reason: null,
      dismissed_comment: null,
      dependency: {
        package: { ecosystem: "npm", name: "walk-merged-parser" },
        manifest_path: "package-lock.json",
      },
      security_advisory: {
        ghsa_id: "GHSA-2c3f-4g5h-6j7m",
        cve_id: null,
        summary: "Walk merged parser reads past its buffer",
        description: "An invented advisory.",
        severity: "high",
      },
      security_vulnerability: {
        severity: "high",
        vulnerable_version_range: "< 1.4.2",
        first_patched_version: { identifier: "1.4.2" },
      },
    };
    const preview = await ok("/data/findings/dependabot/preview", {
      content: b64(JSON.stringify([alert])),
      name: "dependabot-alerts.json",
    });
    expect(preview.counts).toMatchObject({ alerts: 1, new: 1, refused: 0 });
    await ok("/data/findings/dependabot/import", {
      import_id: preview.import_id,
      attempt: attempt(),
    });
    const listed = (await get("/data/findings?view=all&source=dependabot")).findings as Body[];
    expect(listed).toHaveLength(1);
    const findingId = String(listed[0]!.finding_id);
    expect((await findingOf(findingId)).found_on).toBe("2026-11-20");

    const shorter = (await findingOf(findingId)).fix;
    expect(shorter).toMatchObject({ fix_by: "2026-11-27", words: "Fix by 27 Nov 2026" });
    expect(shorter.lines).toEqual([
      "Shorter because of Walk Capital's contract: high-severity missing patches fixed within 1 week.",
    ]);
    const dueRow = async () =>
      (await dueAll(false)).find((row) => row.key === `finding:${findingId}`);
    expect(await dueRow()).toMatchObject({ kind: "finding", due_on: "2026-11-27" });

    await mark("cscrf-patch", "not_in_contract");
    const window = (await findingOf(findingId)).fix;
    expect(window).toMatchObject({
      fix_by: "2026-12-20",
      words: "Fix by 20 Dec 2026",
      because: null,
    });
    expect(window.lines).toEqual([]);
    // A 30-day day enters Due 7 days before it: absent now, there with the module's day pinned to 13 Dec.
    expect(await dueRow()).toBeUndefined();
    await ok("/data/_test/findings/today", { day: "2026-12-13" });
    expect(await dueRow()).toMatchObject({ due_on: "2026-12-20" });
    await ok("/data/_test/findings/today", { day: null });

    // The lead's fix: cscrf-empanelled has no effect on a day, so it is read through inContract.
    const addPenTest = async (tester: string, empanelled: "yes" | "no") =>
      String(
        (
          (await ok("/data/findings/pen-tests", {
            tester,
            kind: "third_party",
            empanelled,
            scope: "The walk app",
            started_on: "2026-11-02",
            report_on: "2026-11-10",
            attempt: attempt(),
          })) as { pen_test: Body }
        ).pen_test.pen_test_id,
      );
    const notMarked = await addPenTest("Walk Merged Testers", "no");
    const marked = await addPenTest("Walk Empanelled Testers", "yes");
    expect(await penTestOf(notMarked)).not.toContain(NOT_EMPANELLED);
    await mark("cscrf-empanelled", "in_contract");
    expect(
      ((await get("/data/_test/profiles/lookup")).in_force as { key: string }[]).map(
        (item) => item.key,
      ),
    ).not.toContain("cscrf-empanelled");
    expect(NOT_EMPANELLED).toBe(
      "Tested by someone CERT-In has not empanelled, or it is not known.",
    );
    expect(await penTestOf(notMarked)).toContain(NOT_EMPANELLED);
    expect(await penTestOf(marked)).not.toContain(NOT_EMPANELLED);
    const page = (await get("/data/findings")).pen_tests as {
      pen_test_id: string;
      checks: string[];
    }[];
    expect(page.find((row) => row.pen_test_id === notMarked)!.checks).toContain(NOT_EMPANELLED);
    // Applying from a later day, it is not in force yet: the line goes.
    await ok(`/data/profiles/${profileId}/update`, {
      sebi: "on",
      sebi_category: "mid",
      applies_from: addDays(today, 1),
    });
    expect(await penTestOf(notMarked)).not.toContain(NOT_EMPANELLED);
    await ok(`/data/profiles/${profileId}/update`, {
      sebi: "on",
      sebi_category: "mid",
      applies_from: today,
    });
    await mark("cscrf-empanelled", "not_in_contract");
    expect(await penTestOf(notMarked)).not.toContain(NOT_EMPANELLED);
  }, 120_000);

  it("4. the real policies and pen tests are an answer's evidence: an old report reads out of date, a current policy reads nothing", async () => {
    const policy = await putFile(
      "Walk merged access control policy",
      "walk-merged-access-control.txt",
      "Walk merged access control policy, version 1. Access is reviewed every quarter.\n",
    );
    await ok(`/data/files/${policy.file_id}/update`, { review_by: addDays(today, 200) });
    await ok("/data/policies/access_control/link", { file_id: policy.file_id });
    penTestId = String(
      (
        (await ok("/data/findings/pen-tests", {
          tester: "Walk Testers",
          kind: "third_party",
          empanelled: "yes",
          scope: "The walk app and its sign-in",
          started_on: "2025-09-22",
          report_on: "2025-10-02",
          attempt: attempt(),
        })) as { pen_test: Body }
      ).pen_test.pen_test_id,
    );

    const options = (await get("/data/answers")).evidence_options as {
      ref: string;
      label: string;
      current: boolean;
      why: string;
    }[];
    const penRef = `findings:pen_test:${penTestId}`;
    expect(options.find((option) => option.ref === penRef)).toMatchObject({
      label: "Penetration test by Walk Testers, 2 Oct 2025",
      current: false,
      why: "Older than 12 months.",
    });
    expect(options.find((option) => option.ref === "policies:policy:access_control")).toMatchObject(
      { label: "Access control policy, version 1", current: true, why: "" },
    );

    const approved = async (question: string, evidence: string) => {
      const made = (await ok("/data/answers", {
        question,
        answer: "Yes, and the walk keeps the record.",
        short: "yes",
        topic: "policies",
        evidence,
        attempt: attempt(),
      })) as { answer: { answer_id: string } };
      await ok(`/data/answers/${made.answer.answer_id}/approve`, { by_name: "Walk Owner" });
      return (await get(`/data/answers/${made.answer.answer_id}`)) as {
        answer: { state: string; evidence_lapsed: number };
        evidence: { ref: string; label: string; current: boolean; why: string }[];
      };
    };
    const tested = await approved("Is the walk app tested by an outside tester each year?", penRef);
    expect(tested.answer.state).toBe("approved");
    expect(tested.answer.evidence_lapsed).toBe(1);
    const [item] = tested.evidence;
    expect(item!.current).toBe(false);
    expect(outOfDateWords(item!.label, item!.why)).toBe(
      "Its evidence is out of date: Penetration test by Walk Testers, 2 Oct 2025. Older than 12 months.",
    );
    const covered = await approved(
      "Is walk access reviewed and written down?",
      "policies:policy:access_control",
    );
    expect(covered.answer.evidence_lapsed).toBe(0);
    expect(covered.evidence).toEqual([
      expect.objectContaining({ ref: "policies:policy:access_control", current: true, why: "" }),
    ]);
  });

  it("5. a tool beside Key dates, Money and Domains: the hidden suggestion, the billed sentence, the domain that sends as it", async () => {
    const vendorId = String(
      (
        (await ok("/data/money/vendors", { name: "Walk Mail Vendor", residency: "resident" })) as {
          vendor: Body;
        }
      ).vendor.vendor_id,
    );
    for (const [number, back] of [
      ["WALK-MM-0001", 40],
      ["WALK-MM-0002", 10],
    ] as const)
      await ok("/data/money/bills", {
        vendor_id: vendorId,
        invoice_number: number,
        invoice_on: addDays(today, -back),
        taxable: "10000",
        gst: "1800",
        currency: "INR",
        attempt: attempt(),
      });
    const before = (await get("/data/dates")).suggestions as { key: string }[];
    expect(before.map((row) => row.key)).toContain("mail-plan");
    await ok(`/data/tools/${mailTool}/update`, {
      name: "Walk Mail",
      category: "mail_docs",
      critical: true,
      key_date: "mail-plan",
      billing: "yearly",
      renews_on: addDays(today, 60),
      vendor_id: vendorId,
    });
    const dates = await get("/data/dates");
    expect((dates.suggestions as { key: string }[]).map((row) => row.key)).not.toContain(
      "mail-plan",
    );
    expect(dates.hidden).toEqual(
      expect.arrayContaining([
        {
          key: "mail-plan",
          title: "The mail provider's plan",
          why: "This renewal is on its tool's row in Systems.",
        },
      ]),
    );

    await ok("/data/domains", { name: "walk-merged.example", sends_as: "Walk Mail" });
    const page = await get(`/data/tools/${mailTool}`);
    expect(page.vendor).toMatchObject({ vendor_id: vendorId, name: "Walk Mail Vendor" });
    const since = addMonths(today, -12);
    expect(page.billed_since).toBe(since);
    expect(billedWords(String(page.billed_since), page.billed as never)).toBe(
      `Billed since ${dayWords(since)}: ₹23,600 in 2 bills`,
    );
    // §3.6's example, on the day the spec was written.
    if (today === "2026-11-20")
      expect(billedWords(since, page.billed as never)).toBe(
        "Billed since 20 Nov 2025: ₹23,600 in 2 bills",
      );
    expect((page.senders as Body[]).map((domain) => domain.name)).toEqual(["walk-merged.example"]);
  });

  it("6. a device's acknowledgement follows the policy's version in Files", async () => {
    const first = await putFile(
      "Walk merged personal devices policy",
      "walk-merged-devices-v1.txt",
      "Walk merged personal devices policy, version 1. Disks encrypted, screens locked.\n",
    );
    await ok("/data/policies/personal_devices/link", { file_id: first.file_id });
    const deviceId = String(
      (
        (await ok("/data/devices", {
          holder: HOLDER,
          kind: "laptop",
          ownership: "personal",
          platform: "mac",
          model: "Walk Laptop 15",
          serial: "WALK-MERGED-0002",
          attempt: attempt(),
        })) as { device: Body }
      ).device.device_id,
    );
    const devices = await get("/data/devices");
    expect(devices.policy).toMatchObject({ file_id: first.file_id, version: 1 });
    expect(devices.policy_line).toBeNull();
    const recorded = (await ok(`/data/devices/${deviceId}/acknowledgements`, {
      on: today,
      how: "signed",
      by_name: HOLDER,
      attempt: attempt(),
    })) as { device: Body };
    expect(recorded.device).toMatchObject({
      ack_state: "current",
      acknowledgement: { policy_file_id: first.file_id, policy_version: 1 },
    });
    const ackRow = async () =>
      (await dueAll(false)).find((row) => row.key === `device:${deviceId}:ack`);
    expect(await ackRow()).toBeUndefined();

    const second = await putFile(
      "Walk merged personal devices policy",
      "walk-merged-devices-v2.txt",
      "Walk merged personal devices policy, version 2, with a shorter screen lock.\n",
    );
    expect(second.file_id).toBe(first.file_id);
    const read = await get(`/data/devices/${deviceId}`);
    expect((read.policy as Body).version).toBe(2);
    expect((read.device as Body).device_lines).toContain(
      "Acknowledged version 1; the policy is now version 2.",
    );
    expect(await ackRow()).toMatchObject({ kind: "device", due_on: today });
  });

  it("7. a questionnaire round trip: an invented XLSX in, four accepted by ID, the rest answered, out through the XLSX build and back, then sent", async () => {
    const opened = (await ok("/data/diligence", { entry_id: entryId, attempt: attempt() })) as {
      diligence: { diligence_id: string };
    };
    const diligenceId = opened.diligence.diligence_id;
    await ok(`/data/diligence/${diligenceId}/questionnaire`, { due_on: addDays(today, 5) });

    // Twelve invented questions with invented IDs: no CAIQ or SIG text.
    const questions = Array.from({ length: 12 }, (_, n) => ({
      id: `WM-${String(n + 1).padStart(2, "0")}`,
      section: n < 6 ? "Walk access" : "Walk operations",
      text: `Walk merged question ${n + 1}: is the walk's ${["door", "badge", "key", "lamp", "desk", "shelf", "clock", "plant", "kettle", "chair", "window", "mat"][n]} looked after?`,
    }));
    const byId = new Set(["WM-01", "WM-04", "WM-07", "WM-10"]);
    const library = new Map<string, string>();
    for (const question of questions.filter((item) => byId.has(item.id))) {
      const answer = `The walk's library says yes to ${question.id}.`;
      const made = (await ok("/data/answers", {
        question: `A library question for ${question.id}?`,
        answer,
        short: "yes",
        topic: "policies",
        other_ids: question.id,
        attempt: attempt(),
      })) as { answer: { answer_id: string } };
      await ok(`/data/answers/${made.answer.answer_id}/approve`, { by_name: "Walk Owner" });
      library.set(question.id, answer);
    }

    const sheet = join(out, "walk-merged-review.xlsx");
    await writeXlsx(sheet, {
      sheet: "Walk review",
      rows: [
        ["Question ID", "Section", "Question", "Answer", "Comments"],
        ...questions.map((question) => [question.id, question.section, question.text]),
      ],
      wide: [2, 3, 4],
    });
    const preview = (await ok("/data/questionnaires/preview", {
      content: b64(deflated(new Uint8Array(readFileSync(sheet)))),
      name: "walk-merged-review.xlsx",
    })) as {
      import_id: string;
      format: string;
      header_row: number;
      guess: Body;
      questions: number;
    };
    expect(preview).toMatchObject({ format: "xlsx", header_row: 1, questions: 12 });
    expect(preview.guess).toMatchObject({ id: 0, section: 1, question: 2, answer: 3, comment: 4 });
    const made = (await ok("/data/questionnaires", {
      import_id: preview.import_id,
      map: preview.guess,
      header_row: preview.header_row,
      kind: "buyer",
      entry_id: entryId,
      attempt: attempt(),
    })) as { questionnaire: { questionnaire_id: string; diligence_id: string; total: number } };
    const id = made.questionnaire.questionnaire_id;
    expect(made.questionnaire).toMatchObject({ diligence_id: diligenceId, total: 12 });
    expect(((await get(`/data/questionnaires/${id}`)).counts as Body).by_id).toBe(4);
    expect(await ok(`/data/questionnaires/${id}/accept-by-id`)).toMatchObject({ accepted: 4 });

    const typed = (n: number) => `Walk merged answer ${n + 1}.`;
    for (const [n, question] of questions.entries())
      if (!byId.has(question.id))
        await ok(`/data/questionnaires/${id}/questions/${n + 2}/answer`, {
          short: n % 2 === 0 ? "yes" : "partly",
          text: typed(n),
          ssrm: "",
        });
    expect((await get(`/data/questionnaires/${id}`)).counts).toMatchObject({
      total: 12,
      answered: 12,
      unanswered: 0,
    });
    const row = async () =>
      (await dueAll(false)).find((item) => item.key === `diligence:${diligenceId}:questionnaire`);
    expect(await row()).toMatchObject({
      title: "Answer Walk Capital's questionnaire",
      sub: "Diligence · their questionnaire · 12 of 12 answered",
    });

    const exported = await build("questionnaire_xlsx", { questionnaire_id: id });
    const again = (await ok("/data/questionnaires/preview", {
      content: b64(exported),
      name: "walk-merged-review answers.xlsx",
    })) as {
      import_id: string;
      header_row: number;
      rows: string[][];
      guess: Body;
      questions: number;
    };
    expect(again).toMatchObject({ header_row: 1, questions: 12 });
    expect(again.rows).toEqual(
      questions.map((question, n) =>
        byId.has(question.id)
          ? [question.id, question.section, question.text, "Yes", library.get(question.id)]
          : [
              question.id,
              question.section,
              question.text,
              n % 2 === 0 ? "Yes" : "Partly",
              typed(n),
            ],
      ),
    );
    const copy = (await ok("/data/questionnaires", {
      import_id: again.import_id,
      map: again.guess,
      header_row: again.header_row,
      kind: "other",
      title: "Walk merged round trip",
      attempt: attempt(),
    })) as { questionnaire: { total: number; diligence_id: string | null } };
    expect(copy.questionnaire).toMatchObject({ total: 12, diligence_id: null });

    // The first is marked sent with a kept copy: answered, its Due row gone, the copy in Files.
    const kept = await ok(`/data/questionnaires/${id}/keep`, { format: "xlsx" });
    const fileId = String(kept.file_id);
    await ok(`/data/questionnaires/${id}/sent`, {
      on: today,
      how: "By email to their security team",
      file_id: fileId,
    });
    const item = (
      (await get(`/data/diligence/for-entry/${entryId}`)).diligence as {
        questionnaire: { answered_on: string | null; answers_file_id: string | null };
      }
    ).questionnaire;
    expect(item).toMatchObject({ answered_on: today, answers_file_id: fileId });
    expect(await row()).toBeUndefined();
    const file = (await get(`/data/files/${fileId}`)).file as { used_for: { label: string }[] };
    expect(file.used_for.map((use) => use.label)).toContain(
      "Answers to Walk Capital's questionnaire",
    );
  }, 120_000);

  it("8. a log system from the tool Walk Cloud, kept 30 days outside India: the real rule book's line and both readings", async () => {
    const cloud = String(
      (
        (await ok("/data/tools", {
          name: "Walk Cloud",
          category: "cloud",
          critical: true,
          attempt: attempt(),
        })) as { tool: Body }
      ).tool.tool_id,
    );
    const page = await get("/data/logs");
    expect(page.tools_loaded).toBe(true);
    expect((page.tools as Body[]).map((tool) => tool.name)).toContain("Walk Cloud");
    const system = (
      (await ok("/data/logs", {
        tool_id: cloud,
        kinds: ["cloud", "sign_in"],
        where: "The cloud's log store",
        retention_days: "30",
        place: "outside",
        region: "Walk Region 1",
        time_source: "cloud",
        zone_recorded: "no",
        attempt: attempt(),
      })) as { system: Body & { log_id: string; lines: { key: string; words: string }[] } }
    ).system;
    expect(system).toMatchObject({
      name: "Walk Cloud",
      tool: { tool_id: cloud, name: "Walk Cloud" },
    });
    expect(system.lines.map((line) => line.key)).toEqual(
      expect.arrayContaining(["retention_short", "place_outside"]),
    );
    expect(system.lines.find((line) => line.key === "place_outside")!.words).toBe(
      "The sources disagree. Confirm with your lawyer.",
    );
    const detail = await get(`/data/logs/${system.log_id}`);
    const state = (await get("/data/_test/dates/duty-state?key=cert-in-logs"))
      .state as DutyRuleState;
    expect((detail.rules as { logs: unknown }).logs).toEqual(ruleLineOf(state));
    expect((detail.rules as { logs: Body }).logs).toMatchObject({
      key: "cert-in-logs",
      title: "Keep the logs of every system",
      confirm_with: "lawyer",
    });
    expect((detail.readings as { label: string }[]).map((reading) => reading.label)).toEqual([
      "Within India",
      "Outside India, if produced in time",
    ]);
  });

  it("9. Data's own backup: made and downloaded through the backup routes, its row reads the day", async () => {
    const added = (await ok("/data/recovery", {
      kind: "hq_data",
      what: "the backup zip",
      how_often: "by_hand",
      where: "This Mac's Downloads, then a disk",
      attempt: attempt(),
    })) as { backup: Body };
    expect(added.backup).toMatchObject({
      name: "Data on this Mac",
      downloaded: "No backup of Data has been downloaded yet.",
    });
    await ok("/data/_test/backup/free-bytes", { bytes: 10 ** 13 });
    const started = await ok("/data/builds", { kind: "backup" });
    const buildId = String((started.build as Body).build_id);
    await until(
      async () => ((await get(`/data/builds/${buildId}`)).build as Body).state === "ready",
      "the backup",
      60_000,
    );
    await stack.raw(stack.socket, "GET", `/data/builds/${buildId}/bytes`);
    await ok("/data/backup/downloaded", { build_id: buildId });
    await ok("/data/_test/backup/free-bytes", { bytes: null });
    const row = ((await get("/data/recovery")).backups as Body[]).find(
      (backup) => backup.backup_id === added.backup.backup_id,
    );
    expect(row).toMatchObject({
      kind: "hq_data",
      downloaded: `Last downloaded ${dayWords(today)}`,
    });
  }, 90_000);

  it("10. search has Tools, Findings and Answers; the calendar has a renewal, a restore test, an insurance renewal and a review, and kinds only names none of them", async () => {
    await ok("/data/recovery", {
      name: "Walk merged database",
      what: "The walk app's database",
      how_often: "daily",
      where: "Walk Cloud's backup store",
      off_system: "yes",
      cannot_be_changed: "no",
      owner: "Walk Engineer",
      attempt: attempt(),
    });
    await ok("/data/assurance/insurance", {
      kind: "cyber",
      insurer: "Walk Merged Insurance",
      policy_number: "WALK-MERGED-POL-1",
      cover: "50,00,000",
      currency: "INR",
      premium: "42000",
      starts_on: addDays(today, -60),
      ends_on: addDays(today, 300),
      attempt: attempt(),
    });
    await ok("/data/assurance/reviews", {
      held_on: addDays(today, -30),
      attendees: "Walk Owner, Walk Admin",
      decisions: "Walk decision: keep the registers current.",
      attempt: attempt(),
    });

    const groups = (await get("/data/search?q=walk")).groups as { label: string }[];
    expect(groups.map((group) => group.label)).toEqual(
      expect.arrayContaining(["Tools", "Findings", "Answers"]),
    );

    const items = (await get("/data/calendar/items")).items as {
      key: string;
      kind: string;
      title: string;
      plain: string;
    }[];
    for (const kind of ["tool", "backup", "insurance", "management_review"])
      expect(
        items.some((item) => item.kind === kind),
        kind,
      ).toBe(true);
    expect(items.find((item) => item.kind === "tool")!.title).toContain("Walk Mail");
    expect(items.find((item) => item.kind === "insurance")!.title).toContain(
      "Walk Merged Insurance",
    );

    const names = [
      "Walk Mail",
      "Walk Cloud",
      "Walk Merged Insurance",
      "Walk Capital",
      "Walk Testers",
    ];
    for (const item of items)
      expect({ key: item.key, found: names.filter((name) => item.plain.includes(name)) }).toEqual({
        key: item.key,
        found: [],
      });
    const plain = await feedText("plain");
    for (const word of [
      "SUMMARY:Restore test",
      "SUMMARY:Insurance renewal",
      "SUMMARY:Management review",
    ])
      expect(plain, word).toContain(word);
    expect(names.filter((name) => plain.includes(name))).toEqual([]);
    expect(plain).not.toContain(INTERN);
    const full = await feedText("full");
    expect(full).toContain("Walk Merged Insurance");
  });

  it("11. nothing was sent or fetched: no mail, no share, and the nine modules import no network or process module", async () => {
    expect(mail.sent).toEqual([]);
    expect(shared.sent).toEqual([]);
    const overview = await get("/data/overview");
    expect(overview.sent_today).toBe(0);
    expect((overview.week as { sent: number }[]).every((day) => day.sent === 0)).toBe(true);

    const root = join(process.cwd(), "scripts", "data");
    const files: string[] = [];
    const walk = (folder: string) => {
      for (const name of readdirSync(folder)) {
        const path = join(folder, name);
        if (statSync(path).isDirectory()) walk(path);
        else if (/\.[cm]?tsx?$/.test(name)) files.push(path);
      }
    };
    for (const name of NINE) walk(join(root, name));
    expect(files.length).toBeGreaterThan(50);
    const banned =
      /\bfrom\s+["'](?:node:)?(?:net|tls|http|https|dgram|child_process)["']|import\(\s*["'](?:node:)?(?:net|tls|http|https|dgram|child_process)["']|require\(\s*["'](?:node:)?(?:net|tls|http|https|dgram|child_process)["']|\bfetch\(/;
    const found = files.filter((path) => banned.test(readFileSync(path, "utf8")));
    expect(found).toEqual([]);
  });
});
