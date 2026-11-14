// @vitest-environment node
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { addDays } from "../../scripts/data/days";
import { SECRET_MESSAGE } from "../../scripts/data/guard";
import {
  engagementMonths,
  midpointOf,
  revokeBy,
  stipendDueOn,
} from "../../scripts/data/people/dates";
import { WALKER, codeOf, startStack, until, type RawAnswer, type Stack } from "./helpers";

/**
 * The people ledger (company spec §8), through the real stack: §5.5's worked days (both
 * evaluation days, both stipend due days, both offboarding pairs), every refusal of §8.4, the
 * certificate gated by a completed final evaluation, the documents-before-access warning, a
 * withdrawn payment that stays and opens its month again, offboarding from start to "Ended",
 * Due rows only when the overview is asked as the Owner, an events log without amounts,
 * `people-letters`' four counts, and the stipends CSV. Every person is invented, on
 * `.example` addresses; the days the spec fixes are calendar days, so they hold on any day.
 */

let stack: Stack;
let today = "";

beforeAll(async () => {
  stack = await startStack();
  today = String((await stack.ask("GET", "/data/_test/day")).json?.day ?? "");
}, 60_000);
afterAll(() => stack.stop());

type Json = Record<string, unknown>;
type Evaluation = { due_on: string | null; held_on: string | null; outcome: string };
type Grant = { access_id: string; system: string; revoked_on: string | null; never_had: boolean };
type Payment = { payment_id: string; period: string; withdrawn: unknown };
type Person = {
  person_id: string;
  name: string;
  evaluations: { midpoint: Evaluation; final: Evaluation };
  access: Grant[];
  payments: Payment[];
  ended_on: string | null;
  offboarding: { last_day: string } | null;
  certificate: { number: string } | null;
};
type Period = { period: string; due_on: string | null; open: boolean; paid: Payment[] };
type PersonPage = {
  person: Person;
  state: string;
  periods: Period[];
  deadlines: { access_id: string; by: string }[];
  warnings: string[];
};
type Due = {
  key: string;
  kind: string;
  title: string;
  sub: string;
  due_on: string;
  owner_only?: boolean;
};

const message = (answer: RawAnswer): string =>
  String(((answer.json?.error ?? {}) as { message?: unknown }).message ?? "");

const post = (path: string, body: Json): Promise<RawAnswer> =>
  stack.ask("POST", path, { by: WALKER, ...body });

async function ok(path: string, body: Json): Promise<Json> {
  const answer = await post(path, body);
  expect(answer.status, `${path}: ${message(answer)}`).toBe(200);
  return answer.json!;
}

async function get<T = Json>(path: string): Promise<T> {
  const answer = await stack.ask("GET", path);
  expect(answer.status, `${path}: ${message(answer)}`).toBe(200);
  return answer.json as T;
}

async function refused(path: string, body: Json, status: number, words: string): Promise<void> {
  const answer = await post(path, body);
  expect(answer.status, `${path}: ${message(answer)}`).toBe(status);
  expect(message(answer)).toBe(words);
}

const intern = (change: Json = {}): Json => ({
  name: "Walk Intern",
  email: "intern@walkintern.example",
  kind: "intern",
  role_title: "Research intern",
  starts_on: "2026-12-01",
  ends_on: "2027-02-28",
  mentor: "Walk Mentor",
  brief: "Invented: build the sector screens, with a written handover.",
  stipend: { amount: 15000, currency: "INR", pays_on: 7 },
  ...change,
});

async function add(change: Json = {}): Promise<Person> {
  return (await ok("/data/people", intern(change))).person as Person;
}

const page = (id: string) => get<PersonPage>(`/data/people/${id}`);
const dueOf = async (owner: boolean): Promise<Due[]> =>
  (await get<{ due: Due[] }>(`/data/overview${owner ? "?owner=1" : ""}`)).due;

describe("the worked days (spec §5.5)", () => {
  it("works out the midpoint, the stipend's due day and the offboarding deadlines by hand", () => {
    expect(midpointOf("2026-12-01", "2027-02-28")).toBe("2027-01-14");
    expect(midpointOf("2027-12-01", "2028-02-29")).toBe("2028-01-15");
    expect(stipendDueOn("2027-01", 7)).toBe("2027-02-07");
    expect(stipendDueOn("2028-02", "month_end")).toBe("2028-02-29");
    expect(stipendDueOn("2026-12", 28)).toBe("2027-01-28");
    expect([revokeBy("2027-02-26", true), revokeBy("2027-02-26", false)]).toEqual([
      "2027-02-27",
      "2027-03-03",
    ]);
    expect([revokeBy("2028-02-25", true), revokeBy("2028-02-25", false)]).toEqual([
      "2028-02-26",
      "2028-03-01",
    ]);
    expect(
      engagementMonths(
        { starts_on: "2026-12-15", ends_on: "2027-02-26", offboarding: null, ended_on: null },
        "2026-11-14",
      ),
    ).toEqual(["2026-12", "2027-01", "2027-02"]);
    // Open-ended: up to this month.
    expect(
      engagementMonths(
        { starts_on: "2026-10-01", ends_on: null, offboarding: null, ended_on: null },
        "2026-11-14",
      ),
    ).toEqual(["2026-10", "2026-11"]);
  });

  it("gives a new person both evaluation days and each month's due day through the service", async () => {
    const a = await add();
    expect(a.evaluations.midpoint.due_on).toBe("2027-01-14");
    expect(a.evaluations.final.due_on).toBe("2027-02-28");
    const pa = await page(a.person_id);
    expect(pa.periods.map((period) => [period.period, period.due_on])).toEqual([
      ["2026-12", "2027-01-07"],
      ["2027-01", "2027-02-07"],
      ["2027-02", "2027-03-07"],
    ]);
    const b = await add({
      name: "Walk Leap Intern",
      starts_on: "2027-12-01",
      ends_on: "2028-02-29",
      stipend: { amount: 15000, currency: "INR", pays_on: "month_end" },
    });
    expect(b.evaluations.midpoint.due_on).toBe("2028-01-15");
    const pb = await page(b.person_id);
    expect(pb.periods.find((period) => period.period === "2028-02")?.due_on).toBe("2028-02-29");
  });

  it("gives each grant its deadline once offboarding starts, and moves the worked-out final evaluation", async () => {
    const a = await add({ name: "Walk Offboard Intern" });
    for (const [system, critical] of [
      ["Code host", true],
      ["Shared drives", false],
    ] as const)
      await ok(`/data/people/${a.person_id}/access`, { system, critical });
    const started = await ok(`/data/people/${a.person_id}/offboard`, { last_day: "2027-02-26" });
    expect((started.deadlines as { by: string }[]).map((item) => item.by).sort()).toEqual([
      "2027-02-27",
      "2027-03-03",
    ]);
    const person = started.person as Person;
    expect(person.evaluations.final.due_on).toBe("2027-02-26");
    const b = await add({
      name: "Walk Leap Offboard",
      starts_on: "2027-12-01",
      ends_on: "2028-02-29",
    });
    await ok(`/data/people/${b.person_id}/access`, { system: "Email and sign-in", critical: true });
    await ok(`/data/people/${b.person_id}/access`, { system: "Chat", critical: false });
    const leap = await ok(`/data/people/${b.person_id}/offboard`, { last_day: "2028-02-25" });
    expect((leap.deadlines as { by: string }[]).map((item) => item.by).sort()).toEqual([
      "2028-02-26",
      "2028-03-01",
    ]);
  });

  it("keeps an evaluation day he moved by hand when the dates change", async () => {
    const a = await add({ name: "Walk Moved Intern" });
    await ok(`/data/people/${a.person_id}/evaluations/midpoint`, { due_on: "2027-01-20" });
    const changed = (await ok(`/data/people/${a.person_id}/update`, { ends_on: "2027-03-31" }))
      .person as Person;
    expect(changed.evaluations.midpoint.due_on).toBe("2027-01-20");
    expect(changed.evaluations.final.due_on).toBe("2027-03-31");
  });
});

describe("refusals (spec §8.4)", () => {
  it("refuses each field it cannot take, in its own words", async () => {
    await refused("/data/people", intern({ name: "" }), 400, "Give the person's name.");
    await refused(
      "/data/people",
      intern({ email: "not an address" }),
      400,
      "That is not an email address.",
    );
    await refused(
      "/data/people",
      intern({ kind: "volunteer" }),
      400,
      "Choose intern, employee or contractor.",
    );
    await refused("/data/people", intern({ starts_on: "" }), 400, "Give the first day.");
    await refused(
      "/data/people",
      intern({ ends_on: "2026-11-30" }),
      400,
      "It cannot end before it starts.",
    );
    await refused(
      "/data/people",
      intern({ ends_on: "" }),
      400,
      "An internship or a contract needs an end day.",
    );
    await refused(
      "/data/people",
      intern({ kind: "contractor", ends_on: "" }),
      400,
      "An internship or a contract needs an end day.",
    );
    const secret = await post("/data/people", intern({ brief: "the key is xkeysib-abc123" }));
    expect([secret.status, codeOf(secret), message(secret)]).toEqual([
      400,
      "secret",
      SECRET_MESSAGE,
    ]);
    for (const amount of ["fifteen", 0, 10_000_001, 1.5])
      await refused(
        "/data/people",
        intern({ stipend: { amount, currency: "INR", pays_on: 7 } }),
        400,
        "Type the stipend as a number, such as 15000.",
      );
    for (const pays_on of [0, 29, "monthly"])
      await refused(
        "/data/people",
        intern({ stipend: { amount: 15000, currency: "INR", pays_on } }),
        400,
        "Choose a day from 1 to 28, or the month's last day.",
      );
    // An open-ended employee needs no end day, and "15,000" is a number.
    const employee = await add({
      name: "Walk Employee",
      kind: "employee",
      ends_on: "",
      stipend: { amount: "15,000", currency: "INR", pays_on: "month_end" },
    });
    expect(employee.evaluations.final.due_on).toBeNull();

    const a = await add({ name: "Walk Refusal Intern" });
    const at = `/data/people/${a.person_id}`;
    await refused(
      `${at}/documents`,
      { kind: "internship", title: "" },
      400,
      "Give the document a title.",
    );
    await refused(
      `${at}/documents`,
      { kind: "internship", title: "Internship letter", signed_on: addDays(today, 1) },
      400,
      "That day is in the future.",
    );
    await refused(`${at}/evaluations/midpoint`, { held_on: today }, 400, "Choose how it went.");
    await refused(
      `${at}/evaluations/midpoint`,
      { held_on: today, outcome: "completed" },
      400,
      "Choose how it went.",
    );
    await refused(
      `${at}/evaluations/final`,
      { held_on: addDays(today, 1), outcome: "completed" },
      400,
      "That day is in the future.",
    );
    await refused(
      `${at}/payments`,
      {
        period: "2027-03",
        amount: 15000,
        currency: "INR",
        paid_on: today,
        reference: "WALK-UTR-9",
      },
      400,
      "That month is outside Walk Refusal Intern's engagement.",
    );
    await refused(
      `${at}/payments`,
      { period: "2026-12", amount: 15000, currency: "INR", paid_on: today, reference: "PIN 1234" },
      400,
      "Write the bank's reference, never a password.",
    );
    await refused(
      `${at}/payments`,
      {
        period: "2026-12",
        amount: "lots",
        currency: "INR",
        paid_on: today,
        reference: "WALK-UTR-9",
      },
      400,
      "Type the amount as a number, such as 15000.",
    );
    await refused(
      `${at}/payments`,
      { period: "2026-12", amount: 15000, currency: "INR", paid_on: addDays(today, 1) },
      400,
      "That day is in the future.",
    );
    const paid = (
      await ok(`${at}/payments`, {
        period: "2026-12",
        amount: 15000,
        currency: "INR",
        paid_on: today,
        reference: "WALK-UTR-9",
        attempt: randomUUID(),
      })
    ).person as Person;
    await refused(
      `${at}/payments/${paid.payments[0]!.payment_id}/withdraw`,
      { why: "" },
      400,
      "Say why it is withdrawn.",
    );
    await refused(`${at}/access`, { system: "" }, 400, "Name the system.");
    const granted = (
      await ok(`${at}/access`, { system: "Code host", critical: true, granted_on: today })
    ).person as Person;
    await refused(
      `${at}/access/${granted.access[0]!.access_id}/revoke`,
      { on: addDays(today, -1) },
      400,
      "It cannot be revoked before it was granted.",
    );
    await refused(
      `${at}/offboard`,
      { last_day: "2026-11-01" },
      400,
      "The last day cannot be before the first day.",
    );
    for (let index = 1; index < 50; index += 1)
      await ok(`${at}/access`, { system: `Invented system ${index}` });
    await refused(`${at}/access`, { system: "One too many" }, 400, "Data holds 50 at most.");
    const missing = await stack.ask("GET", "/data/people/not-a-person");
    expect([missing.status, codeOf(missing)]).toEqual([404, "not_found"]);
  });

  it("replays a repeated add rather than adding twice", async () => {
    const attempt = randomUUID();
    const first = (await ok("/data/people", { ...intern({ name: "Walk Twice" }), attempt }))
      .person as Person;
    const again = (await ok("/data/people", { ...intern({ name: "Walk Twice" }), attempt }))
      .person as Person;
    expect(again.person_id).toBe(first.person_id);
    const all = await get<{ people: Person[] }>("/data/people?state=all");
    expect(all.people.filter((person) => person.name === "Walk Twice")).toHaveLength(1);
    // Kept under people/, not in Data's own replay log, which every backup holds.
    expect(readFileSync(join(stack.dir, "data", "attempts.jsonl"), "utf8")).not.toContain(
      "Walk Twice",
    );
    expect(readFileSync(join(stack.dir, "data", "people", "attempts.jsonl"), "utf8")).toContain(
      attempt,
    );
  });
});

describe("the certificate, documents and the stipend ledger", () => {
  it("refuses the certificate before a completed final evaluation and records it after", async () => {
    const a = await add({ name: "Walk Certificate Intern" });
    const at = `/data/people/${a.person_id}`;
    const early = await post(`${at}/certificate`, { number: "WALK-CERT-1", issued_on: today });
    expect([early.status, codeOf(early), message(early)]).toEqual([
      409,
      "needs_final",
      "Record the final evaluation as completed first: the certificate follows it.",
    ]);
    await ok(`${at}/evaluations/final`, { held_on: today, outcome: "not_completed" });
    expect(
      (await post(`${at}/certificate`, { number: "WALK-CERT-1", issued_on: today })).status,
    ).toBe(409);
    await ok(`${at}/evaluations/final`, {
      held_on: today,
      outcome: "completed",
      by_name: "Walk Mentor",
      summary: "Invented: shipped the screens.",
    });
    const done = (await ok(`${at}/certificate`, { number: "WALK-CERT-1", issued_on: today }))
      .person as Person;
    expect(done.certificate?.number).toBe("WALK-CERT-1");
  });

  it("warns when access was granted before a signed IP assignment, and not once one comes first", async () => {
    const a = await add({ name: "Walk Early Access" });
    const at = `/data/people/${a.person_id}`;
    await ok(`${at}/access`, {
      system: "Code host",
      critical: true,
      granted_on: addDays(today, -10),
    });
    let warnings = (await page(a.person_id)).warnings;
    expect(warnings).toContain("No signed letter yet.");
    expect(warnings).toContain(
      "Access was granted before a signed IP assignment. The usual control is documents before access.",
    );
    await ok(`${at}/documents`, {
      kind: "ip_assignment",
      title: "IP assignment",
      signed_on: addDays(today, -5),
    });
    warnings = (await page(a.person_id)).warnings;
    expect(warnings.some((line) => line.startsWith("Access was granted"))).toBe(true);
    const b = await add({ name: "Walk Docs First" });
    await ok(`/data/people/${b.person_id}/documents`, {
      kind: "internship",
      title: "Internship letter",
      signed_on: addDays(today, -12),
      includes_ip: true,
      includes_confidentiality: true,
    });
    await ok(`/data/people/${b.person_id}/access`, {
      system: "Code host",
      critical: true,
      granted_on: addDays(today, -10),
    });
    expect((await page(b.person_id)).warnings).toEqual([]);
  });

  it("keeps a withdrawn payment, struck through, and owes its month again", async () => {
    const a = await add({ name: "Walk Payment Intern" });
    const at = `/data/people/${a.person_id}`;
    const paid = (
      await ok(`${at}/payments`, {
        period: "2027-01",
        amount: 15000,
        currency: "INR",
        paid_on: today,
        reference: "WALK-UTR-1",
        tds_deducted: "",
      })
    ).person as Person;
    let jan = (await page(a.person_id)).periods.find((period) => period.period === "2027-01")!;
    expect(jan.open).toBe(false);
    const id = paid.payments[0]!.payment_id;
    await ok(`${at}/payments/${id}/withdraw`, { why: "Invented: paid to the wrong account" });
    const after = await page(a.person_id);
    jan = after.periods.find((period) => period.period === "2027-01")!;
    expect(jan.open).toBe(true);
    expect(jan.paid).toHaveLength(1);
    expect(jan.paid[0]!.withdrawn).not.toBeNull();
    expect(after.person.payments).toHaveLength(1);
    const twice = await post(`${at}/payments/${id}/withdraw`, { why: "Again" });
    expect(twice.status).toBe(409);
  });
});

describe("signed copies, kept with the ledger and never in Files (the lead's decision)", () => {
  it("keeps the copy in people/files (0600), gives it back whole, and leaves Files and search without it", async () => {
    const a = await add({ name: "Walk Copy Intern" });
    const letter = Buffer.from("%PDF-1.4\n% Invented zebrafinch internship letter\n%%EOF\n");
    const person = (
      await ok(`/data/people/${a.person_id}/documents`, {
        kind: "internship",
        title: "Zebrafinch internship letter",
        signed_on: today,
        includes_ip: true,
        content: letter.toString("base64"),
        name: "zebrafinch-letter.pdf",
        attempt: randomUUID(),
      })
    ).person as Person & {
      documents: { copy: { copy_id: string; file: string; mime: string; bytes: number } | null }[];
    };
    const copy = person.documents[0]!.copy!;
    expect(copy).toMatchObject({ mime: "application/pdf", bytes: letter.length });
    const path = join(stack.dir, "data", "people", "files", copy.file);
    expect(readFileSync(path).equals(letter)).toBe(true);
    expect(statSync(path).mode & 0o777).toBe(0o600);
    const read = await get<{ content: string; type: string; copy: { name: string } }>(
      `/data/people/${a.person_id}/copies/${copy.copy_id}`,
    );
    expect(Buffer.from(read.content, "base64").equals(letter)).toBe(true);
    expect([read.type, read.copy.name]).toEqual(["application/pdf", "zebrafinch-letter.pdf"]);
    // Files never had it: not in its list, its index or Data's search.
    const recent = await get<{ files: { title: string; original_name: string }[] }>(
      "/data/files?view=recent",
    );
    expect(
      recent.files.some((file) => /zebrafinch/i.test(`${file.title} ${file.original_name}`)),
    ).toBe(false);
    const index = join(stack.dir, "data", "files", "index.json");
    if (existsSync(index)) expect(readFileSync(index, "utf8")).not.toMatch(/zebrafinch/i);
    const search = await get<{ total: number; groups: unknown[] }>("/data/search?q=zebrafinch");
    expect([search.total, search.groups]).toEqual([0, []]);
    // An unknown copy, or another person's, is not here.
    const other = await add({ name: "Walk Other Copy" });
    const elsewhere = await stack.ask(
      "GET",
      `/data/people/${other.person_id}/copies/${copy.copy_id}`,
    );
    expect([elsewhere.status, codeOf(elsewhere)]).toEqual([404, "not_found"]);
  });

  it("keeps the certificate's copy too, takes no file from Files, and refuses one over 3 MB", async () => {
    const a = await add({ name: "Walk Certificate Copy" });
    const at = `/data/people/${a.person_id}`;
    await ok(`${at}/evaluations/final`, { held_on: today, outcome: "completed" });
    const certificate = (
      await ok(`${at}/certificate`, {
        number: "WALK-CERT-9",
        issued_on: today,
        content: Buffer.from("%PDF-1.4 invented certificate\n").toString("base64"),
        name: "certificate.pdf",
      })
    ).person as Person & { certificate: { copy: { copy_id: string } | null } };
    expect(certificate.certificate.copy?.copy_id).toMatch(/.+/);
    await refused(
      `${at}/documents`,
      { kind: "nda", title: "NDA", file_id: "0123456789abcdef0123456789abcdef" },
      400,
      "Attach the signed copy itself: the people ledger keeps its own copies, never in Files.",
    );
    const big = await post(`${at}/documents`, {
      kind: "nda",
      title: "NDA",
      content: Buffer.alloc(3 * 1024 * 1024 + 1, 1).toString("base64"),
      name: "big.pdf",
    });
    expect([big.status, codeOf(big), message(big)]).toEqual([
      400,
      "too_large",
      "That copy is over 3 MB. Add a smaller scan of it.",
    ]);
  });
});

describe("offboarding and the owner-only Due", () => {
  it("shows Due rows only to the Owner, ends once every grant is gone, and keeps the offboarding after a revoke", async () => {
    const starts = addDays(today, -30);
    const a = await add({
      name: "Walk Due Intern",
      starts_on: starts,
      ends_on: addDays(today, 59),
      stipend: { amount: 15000, currency: "INR", pays_on: "month_end" },
    });
    const at = `/data/people/${a.person_id}`;
    const due = async () =>
      (await dueOf(true)).filter((row) => row.key.startsWith(`person:${a.person_id}:`));
    // Engaged without a letter, with the first month's stipend owed.
    let rows = await due();
    expect(rows.every((row) => row.kind === "person" && row.owner_only === true)).toBe(true);
    expect(rows.map((row) => row.title)).toContain("Signed letter for Walk Due Intern");
    const stipend = rows.find(
      (row) => row.key === `person:${a.person_id}:stipend:${starts.slice(0, 7)}`,
    );
    expect(stipend?.title).toMatch(/^Pay Walk Due Intern's stipend for [A-Z][a-z]{2} \d{4}$/);
    expect(stipend?.sub).toBe("₹15,000");
    // Never without asking as the Owner.
    expect((await dueOf(false)).some((row) => row.kind === "person")).toBe(false);

    const code = (await ok(`${at}/access`, { system: "Code host", critical: true }))
      .person as Person;
    const drives = (await ok(`${at}/access`, { system: "Shared drives" })).person as Person;
    const codeId = code.access[0]!.access_id;
    const drivesId = drives.access[1]!.access_id;
    await ok(`${at}/offboard`, { last_day: today });
    rows = await due();
    expect(rows.find((row) => row.key.endsWith(`:access:${codeId}`))).toMatchObject({
      title: "Revoke Code host for Walk Due Intern",
      sub: "Critical: by the end of the day after the last day",
      due_on: addDays(today, 1),
    });
    expect(rows.find((row) => row.key.endsWith(`:access:${drivesId}`))).toMatchObject({
      sub: "Within 5 days of the last day",
      due_on: addDays(today, 5),
    });
    // The worked-out final evaluation follows the last day.
    expect(rows.find((row) => row.key === `person:${a.person_id}:final`)?.due_on).toBe(today);
    expect((await page(a.person_id)).state).toBe("offboarding");

    // Cancelled while nothing is revoked, started again, then revoked: it stays.
    await ok(`${at}/offboard/cancel`, {});
    expect((await page(a.person_id)).person.offboarding).toBeNull();
    await ok(`${at}/offboard`, { last_day: today });
    await ok(`${at}/access/${codeId}/revoke`, { on: today });
    const stays = await post(`${at}/offboard/cancel`, {});
    expect([stays.status, codeOf(stays), message(stays)]).toEqual([
      409,
      "offboarding_moved",
      "Access has been revoked since; the offboarding stays.",
    ]);
    rows = await due();
    expect(rows.some((row) => row.key.endsWith(`:access:${codeId}`))).toBe(false);
    expect((await page(a.person_id)).person.ended_on).toBeNull();
    await ok(`${at}/access/${drivesId}/never`, {});
    const ended = await page(a.person_id);
    expect(ended.person.ended_on).toBe(today);
    expect(ended.state).toBe("ended");
    expect(ended.deadlines).toEqual([]);
    rows = await due();
    expect(rows.some((row) => row.key.includes(":access:"))).toBe(false);
    expect(rows.some((row) => row.key.endsWith(":final") || row.key.endsWith(":letter"))).toBe(
      false,
    );
  });

  it("writes no amount into the events log", async () => {
    const a = await add({
      name: "Walk Amount Intern",
      stipend: { amount: 17345, currency: "INR", pays_on: 7 },
    });
    await ok(`/data/people/${a.person_id}/payments`, {
      period: "2026-12",
      amount: 17346,
      currency: "INR",
      paid_on: today,
      reference: "WALK-UTR-2",
      tds_deducted: 1734,
    });
    await ok(`/data/people/${a.person_id}/update`, {
      stipend: { amount: 18345, currency: "INR", pays_on: 7 },
    });
    await until(
      () =>
        readFileSync(join(stack.dir, "data", "people", "events.jsonl"), "utf8").includes(
          "payment recorded",
        ),
      "the events log",
    );
    const events = readFileSync(join(stack.dir, "data", "people", "events.jsonl"), "utf8")
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line) as { person_id: string; verb: string; detail: string });
    const mine = events.filter((event) => event.person_id === a.person_id);
    expect(mine.map((event) => event.verb)).toEqual(["added", "payment recorded", "changed"]);
    expect(mine[2]!.detail).toBe("stipend");
    for (const event of events)
      for (const amount of ["17345", "17,345", "17346", "17,346", "1734", "18345", "18,345"])
        expect(`${event.verb} ${event.detail}`.includes(amount), event.detail).toBe(false);
  });
});

describe("people-letters and the stipends CSV", () => {
  it("counts the engaged, their signed letters, the interns and contractors and their IP, never a name", async () => {
    const day = "2031-06-15";
    const letter = (kind: string, includes_ip: boolean) => ({
      kind,
      title: "Letter",
      signed_on: today,
      includes_ip,
      includes_confidentiality: true,
    });
    const one = await add({
      name: "Walk Count One",
      starts_on: "2031-06-01",
      ends_on: "2031-08-31",
    });
    await ok(`/data/people/${one.person_id}/documents`, letter("internship", true));
    const two = await add({
      name: "Walk Count Two",
      kind: "contractor",
      starts_on: "2031-06-01",
      ends_on: "2031-06-30",
    });
    await ok(`/data/people/${two.person_id}/documents`, letter("contractor", false));
    const three = await add({
      name: "Walk Count Three",
      kind: "employee",
      starts_on: "2031-05-01",
      ends_on: "",
    });
    void three;
    // Not engaged that day: starts later, or ended before.
    await add({ name: "Walk Count Later", starts_on: "2031-07-01", ends_on: "2031-09-30" });
    await add({ name: "Walk Count Earlier", starts_on: "2031-01-01", ends_on: "2031-06-14" });
    const answer = await get<{ counts: Json }>(`/data/_test/people/letters?day=${day}`);
    // Every other person this file adds is engaged from 2031 onwards only if open-ended.
    const employees = (
      await get<{ people: { kind: string; ends_on: string | null; starts_on: string }[] }>(
        "/data/people?state=all",
      )
    ).people.filter((person) => person.ends_on === null && person.starts_on <= day).length;
    expect(answer.counts).toEqual({
      engaged: 2 + employees,
      with_letter: 2,
      interns_and_contractors: 2,
      with_ip: 1,
    });
    expect(JSON.stringify(answer)).not.toContain("Walk Count");
  });

  it("makes the stipends CSV with its columns and “CA to confirm” on every row", async () => {
    const a = await add({ name: "Walk Csv Intern" });
    await ok(`/data/people/${a.person_id}/payments`, {
      period: "2026-12",
      amount: 15000,
      currency: "INR",
      paid_on: today,
      reference: "WALK-UTR-3",
      tds_deducted: 0,
    });
    const made = await stack.ask("POST", "/data/builds", { kind: "stipends_csv", by: WALKER });
    expect(made.status).toBe(200);
    const buildId = String((made.json!.build as Json).build_id);
    let build: Json = {};
    await until(async () => {
      build = (await stack.ask("GET", `/data/builds/${buildId}`)).json!.build as Json;
      return build.state !== "building";
    }, "the CSV");
    expect(build.state).toBe("ready");
    expect(String(build.name)).toBe(`Stipends ${today}.csv`);
    const bytes = (await stack.raw(stack.socket, "GET", `/data/builds/${buildId}/bytes`)).bytes;
    const text = bytes.toString("utf8");
    expect(text.charCodeAt(0)).toBe(0xfeff);
    const lines = text.slice(1).trim().split("\r\n");
    expect(lines[0]).toBe(
      "person,kind,period,due_on,amount,currency,paid_on,reference,tds_deducted,tax_treatment,withdrawn",
    );
    const row = lines.find((line) => line.startsWith("Walk Csv Intern,"));
    expect(row).toBe(
      `Walk Csv Intern,Intern,2026-12,2027-01-07,15000,INR,${today},WALK-UTR-3,0,CA to confirm,`,
    );
    expect(lines.slice(1).every((line) => line.includes(",CA to confirm,"))).toBe(true);
  });
});
