// @vitest-environment node
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  LABS_ONLY_TRUST,
  NOT_ON_CHECKLIST,
  checklistOf,
  coverLabel,
  indexText,
  missingOf,
} from "../../scripts/data/files/packs";
import { PACK_KINDS, TRUST_CHECKLIST, TRUST_FIRST_FOLDERS } from "../../src/lib/data/labels-trust";
import { WALKER, codeOf, startStack, until, type RawAnswer, type Stack } from "./helpers";

/**
 * The trust pack against the real service (delivery spec §7.6): a second kind of pack with
 * its own checklist, more lines when it is "For Labs too", covers that never cross kinds,
 * shares recorded against waitlist firms, an index that says what it is, and packs and
 * share lines stored before kinds existed read as they always did. A data-room pack is
 * unchanged. Every file and firm is invented.
 */

let stack: Stack;
let scratch: string;
const FUNDRAISING = "10 Fundraising and investors";
const IP = "07 IP, product and data";
const KYC = "13 Directors' KYC";

const ALL_LINES = [
  "Security questionnaire answers",
  "Information security policy",
  "Access control policy",
  "Incident response plan",
  "Data handling and privacy policy",
  "Business continuity and disaster recovery",
  "ISO 27001 or SOC 2: status and plan",
  "Penetration test report",
  "Insurance certificate",
  "Accounts or an accountant's letter",
  "References, with their consent",
  "Answers for regulated Indian buyers",
];
const LABS_LINES = [
  "Data provenance",
  "Data dictionary",
  "Material non-public information policy",
  "Alternative-data diligence answers",
];
/** Needed or expected: what an empty trust pack is missing. */
const MISSING = ALL_LINES.slice(0, 10);
const MISSING_LABS = LABS_LINES.slice(0, 3);

beforeAll(async () => {
  stack = await startStack({ modules: ["files", "leads", "replies", "waitlist", "numbers"] });
  scratch = mkdtempSync(join(tmpdir(), "hqtp-"));
}, 60_000);
afterAll(async () => {
  await stack.stop();
  rmSync(scratch, { recursive: true, force: true });
});

type Row = { file_id: string; title: string };
type PackBody = { pack_id: string; name: string; kind: string; labs: boolean; version: number };
type Detail = {
  pack: PackBody & { items: { item_id: string; covers: string }[] };
  items: { item_id: string; n: number; covers: string }[];
  checklist: { key: string; label: string; need: string; why: string; covered_by: number[] }[];
  missing: string[];
  index_text: string;
  shares: { firm: string; entry_id: string | null; investor_id: string | null; version: number }[];
  firms: unknown[] | null;
  buyers: { entry_id: string; firm: string; stage: string }[] | null;
};

const post = (path: string, body: Record<string, unknown> = {}) =>
  stack.ask("POST", path, { by: WALKER, ...body });
const messageOf = (answer: RawAnswer) =>
  String((answer.json?.error as { message?: string } | undefined)?.message ?? "");

async function put(folder: string[], title: string, name: string, text: string): Promise<Row> {
  const answer = await post("/data/_test/files/put", {
    folder_path: folder,
    title,
    name,
    base64: Buffer.from(text).toString("base64"),
  });
  expect(answer.status).toBe(200);
  return answer.json!.file as Row;
}

async function make(name: string, extra: Record<string, unknown> = {}): Promise<PackBody> {
  const made = await post("/data/packs", { name, ...extra });
  expect(made.status, JSON.stringify(made.json)).toBe(200);
  return made.json!.pack as PackBody;
}

const detail = async (packId: string) =>
  (await stack.ask("GET", `/data/packs/${packId}`)).json as unknown as Detail;

async function zipOf(packId: string): Promise<string> {
  const started = await post("/data/builds", { kind: "pack_zip", pack_id: packId });
  expect(started.status).toBe(200);
  const id = (started.json!.build as { build_id: string }).build_id;
  let state = "building";
  await until(async () => {
    state = ((await stack.ask("GET", `/data/builds/${id}`)).json!.build as { state: string }).state;
    return state !== "building";
  }, "the pack's zip");
  expect(state).toBe("ready");
  const bytes = (await stack.raw(stack.socket, "GET", `/data/builds/${id}/bytes`)).bytes;
  const path = join(scratch, `${id}.zip`);
  writeFileSync(path, bytes);
  return path;
}

// ------------------------------------------------------------------ the checklist, as words

describe("the trust checklist", () => {
  it("holds the spec's sixteen lines, twelve for every pack and four for Labs", () => {
    const lines = Object.values(TRUST_CHECKLIST);
    expect(lines.filter((line) => line.for === "all").map((line) => line.label)).toEqual(ALL_LINES);
    expect(lines.filter((line) => line.for === "labs").map((line) => line.label)).toEqual(
      LABS_LINES,
    );
    expect(PACK_KINDS).toEqual({ data_room: "Data-room pack", trust: "Trust pack" });
    expect([...TRUST_FIRST_FOLDERS]).toEqual(["ip", "contracts", "finance", "team"]);
  });

  it("is the pack's own: by kind, and by Labs", () => {
    expect(missingOf([], { kind: "trust", labs: false })).toEqual(MISSING);
    expect(missingOf([], { kind: "trust", labs: true })).toEqual([...MISSING, ...MISSING_LABS]);
    expect(checklistOf([], { kind: "trust" })).toHaveLength(12);
    expect(checklistOf([], { kind: "trust", labs: true })).toHaveLength(16);
    // A data-room pack, and a pack stored before kinds existed, read as they always did.
    const dataRoom = ["Pitch deck", "Team", "Roadmap to the next round", "Cap table"];
    expect(missingOf([])).toEqual(dataRoom);
    expect(missingOf([], { kind: "data_room" })).toEqual(dataRoom);
    expect(missingOf([], { kind: "data_room", labs: true })).toEqual(dataRoom);
    expect(coverLabel("infosec_policy")).toBe("Information security policy");
    expect(coverLabel("deck")).toBe("Pitch deck");
    expect(coverLabel("other")).toBe("Other");
  });

  it("says trust pack on the index's first line, and leaves a data-room pack's as it was", () => {
    expect(indexText({ name: "Hand room", version: 3 }, [], "2026-11-14")).toBe(
      "Hand room · version 3 · 14 Nov 2026\n\nMissing: Pitch deck, Team, Roadmap to the next round, Cap table.\n",
    );
    expect(indexText({ name: "Hand room", version: 3, kind: "data_room" }, [], "2026-11-14")).toBe(
      indexText({ name: "Hand room", version: 3 }, [], "2026-11-14"),
    );
    expect(indexText({ name: "Hand trust", version: 2, kind: "trust" }, [], "2026-11-14")).toBe(
      `Hand trust · trust pack · version 2 · 14 Nov 2026\n\nMissing: ${MISSING.join(", ")}.\n`,
    );
  });
});

// ------------------------------------------------------------------ against the service

describe("a trust pack", () => {
  let trustId = "";
  let roomId = "";
  let files: Row[] = [];

  it("is made by its kind; a data-room pack is still the default, and never for Labs", async () => {
    const trust = await make("Hand trust pack", { kind: "trust" });
    trustId = trust.pack_id;
    expect(trust).toMatchObject({ kind: "trust", labs: false, version: 1 });
    const room = await make("Hand data room");
    roomId = room.pack_id;
    expect(room).toMatchObject({ kind: "data_room", labs: false, version: 1 });
    expect(await make("Hand Labs trust", { kind: "trust", labs: true })).toMatchObject({
      kind: "trust",
      labs: true,
    });
    expect((await make("", { kind: "trust" })).name).toBe("Trust pack");

    const refused = await post("/data/packs", { name: "Wrong", kind: "data_room", labs: true });
    expect(refused.status).toBe(400);
    expect(codeOf(refused)).toBe("invalid");
    expect(messageOf(refused)).toBe(LABS_ONLY_TRUST);
    expect(messageOf(refused)).toBe("Only a trust pack can be for Labs.");
    const unknown = await post("/data/packs", { name: "Wrong", kind: "press" });
    expect(unknown.status).toBe(400);
  });

  it("has its own checklist and missing lines, with each line's why", async () => {
    const read = await detail(trustId);
    expect(read.pack).toMatchObject({ kind: "trust", labs: false });
    expect(read.checklist.map((line) => line.label)).toEqual(ALL_LINES);
    expect(read.missing).toEqual(MISSING);
    expect(read.checklist.find((line) => line.key === "references")).toMatchObject({
      need: "if_any",
      why: TRUST_CHECKLIST.references.why,
    });
    expect(read.checklist.find((line) => line.key === "certification")!.need).toBe("required");
    expect(read.checklist.find((line) => line.key === "pen_test")!.need).toBe("expected");
    const room = await detail(roomId);
    expect(room.checklist.map((line) => line.key)).toEqual([
      "deck",
      "team",
      "roadmap",
      "cap_table",
      "pilot_data",
      "burn",
    ]);
    expect(room.buyers).toBeNull();
  });

  it("gains the Labs lines when it is For Labs too, and the version goes up by one each change", async () => {
    const on = await post(`/data/packs/${trustId}/labs`, { labs: true });
    expect(on.json).toMatchObject({ pack: { labs: true, version: 2 } });
    const read = await detail(trustId);
    expect(read.checklist.map((line) => line.label)).toEqual([...ALL_LINES, ...LABS_LINES]);
    expect(read.missing).toEqual([...MISSING, ...MISSING_LABS]);
    // The same answer twice changes nothing.
    const again = await post(`/data/packs/${trustId}/labs`, { labs: true });
    expect(again.json).toMatchObject({ pack: { labs: true, version: 2 } });
    const off = await post(`/data/packs/${trustId}/labs`, { labs: false });
    expect(off.json).toMatchObject({ pack: { labs: false, version: 3 } });
    expect((await detail(trustId)).missing).toEqual(MISSING);

    const room = await post(`/data/packs/${roomId}/labs`, { labs: true });
    expect(room.status).toBe(400);
    expect(messageOf(room)).toBe(LABS_ONLY_TRUST);
    expect((await post(`/data/packs/${trustId}/labs`, { labs: "yes" })).status).toBe(400);
    expect((await post("/data/packs/no-such-pack/labs", { labs: true })).status).toBe(404);
  });

  it("lists by kind, each pack's missing lines by its own checklist", async () => {
    type Summary = PackBody & { missing: string[]; files: number };
    const listOf = async (query: string) =>
      (await stack.ask("GET", `/data/packs${query}`)).json!.packs as Summary[];
    const trust = await listOf("?kind=trust");
    expect(trust.length).toBeGreaterThanOrEqual(3);
    expect(trust.every((pack) => pack.kind === "trust")).toBe(true);
    expect(trust.find((pack) => pack.pack_id === trustId)).toMatchObject({
      labs: false,
      missing: MISSING,
      files: 0,
    });
    expect(trust.find((pack) => pack.name === "Hand Labs trust")!.missing).toEqual([
      ...MISSING,
      ...MISSING_LABS,
    ]);
    const rooms = await listOf("?kind=data_room");
    expect(rooms.map((pack) => pack.pack_id)).toEqual([roomId]);
    expect(rooms[0]!.missing).toEqual([
      "Pitch deck",
      "Team",
      "Roadmap to the next round",
      "Cap table",
    ]);
    const both = await listOf("");
    expect(both).toHaveLength(trust.length + rooms.length);
    // An unknown kind is no filter.
    expect(await listOf("?kind=press")).toHaveLength(both.length);
  });

  it("offers its files from 05 to 08 first, and a data-room pack's from 10", async () => {
    files = [
      await put([IP], "Hand security policy", "hand-security-policy.txt", "abc"),
      await put([IP], "Hand questionnaire answers", "hand-questionnaire.txt", "abcd"),
      await put([FUNDRAISING], "Hand audit plan", "hand-audit-plan.txt", "abcde"),
    ];
    const forTrust = (await stack.ask("GET", `/data/packs/${trustId}/candidates`)).json!;
    expect(forTrust.first_label).toBe("From 05, 06, 07 and 08");
    expect((forTrust.fundraising as Row[]).map((row) => row.title)).toEqual([
      "Hand questionnaire answers",
      "Hand security policy",
    ]);
    expect((forTrust.other as Row[]).map((row) => row.title)).toContain("Hand audit plan");
    const forRoom = (await stack.ask("GET", `/data/packs/${roomId}/candidates`)).json!;
    expect(forRoom.first_label).toBe("From 10 Fundraising and investors");
    expect((forRoom.fundraising as Row[]).map((row) => row.title)).toEqual(["Hand audit plan"]);
  });

  it("refuses a cover from the other kind's checklist, in either direction", async () => {
    const ids = files.map((file) => file.file_id);
    const wrong = await post(`/data/packs/${trustId}/items`, { file_ids: ids, covers: "deck" });
    expect(wrong.status).toBe(400);
    expect(codeOf(wrong)).toBe("invalid");
    expect(messageOf(wrong)).toBe(NOT_ON_CHECKLIST);
    expect(messageOf(wrong)).toBe("That is not on this pack's checklist.");
    const wrongRoom = await post(`/data/packs/${roomId}/items`, {
      file_ids: ids,
      covers: ["deck", "infosec_policy", "other"],
    });
    expect(wrongRoom.status).toBe(400);
    expect(messageOf(wrongRoom)).toBe(NOT_ON_CHECKLIST);
    // Refused whole: nothing went in.
    expect((await detail(trustId)).items).toEqual([]);
    expect((await detail(roomId)).items).toEqual([]);

    const added = await post(`/data/packs/${trustId}/items`, {
      file_ids: ids,
      covers: ["infosec_policy", "questionnaire", "other"],
    });
    expect(added.json).toMatchObject({ added: 3, skipped: 0, pack: { version: 4 } });
    const third = (await detail(trustId)).items[2]!;
    const refused = await post(`/data/packs/${trustId}/items/${third.item_id}/covers`, {
      covers: "cap_table",
    });
    expect(refused.status).toBe(400);
    expect(messageOf(refused)).toBe(NOT_ON_CHECKLIST);
    const covered = await post(`/data/packs/${trustId}/items/${third.item_id}/covers`, {
      covers: "certification",
    });
    expect(covered.json).toMatchObject({ pack: { version: 5 } });

    const read = await detail(trustId);
    expect(read.items.map((item) => [item.n, item.covers])).toEqual([
      [1, "infosec_policy"],
      [2, "questionnaire"],
      [3, "certification"],
    ]);
    expect(read.missing).toEqual([
      "Access control policy",
      "Incident response plan",
      "Data handling and privacy policy",
      "Business continuity and disaster recovery",
      "Penetration test report",
      "Insurance certificate",
      "Accounts or an accountant's letter",
    ]);
    expect(read.missing).not.toContain("References, with their consent");
    expect(read.checklist.find((line) => line.key === "questionnaire")!.covered_by).toEqual([2]);
  });

  it("never takes a file from 13 Directors' KYC", async () => {
    const passport = await put([KYC], "Hand passport", "hand-passport.txt", "invented passport");
    const refused = await post(`/data/packs/${trustId}/items`, {
      file_ids: [passport.file_id],
      covers: "other",
    });
    expect(refused.status).toBe(409);
    expect(codeOf(refused)).toBe("kyc_folder");
    const candidates = (await stack.ask("GET", `/data/packs/${trustId}/candidates`)).json!;
    expect(
      [...(candidates.fundraising as Row[]), ...(candidates.other as Row[])].map(
        (row) => row.file_id,
      ),
    ).not.toContain(passport.file_id);
  });

  it("says trust pack on its index, in the page and in the zip", async () => {
    const read = await detail(trustId);
    const lines = read.index_text.split("\n");
    expect(lines[0]).toMatch(
      /^Hand trust pack · trust pack · version 5 · \d{1,2} [A-Z][a-z]{2} \d{4}$/,
    );
    expect(lines[2]).toBe(
      "1. Information security policy: Hand security policy (hand-security-policy.txt), version 1, 3 B",
    );
    expect(lines.at(-2)).toBe(
      "Missing: Access control policy, Incident response plan, Data handling and privacy policy, Business continuity and disaster recovery, Penetration test report, Insurance certificate, Accounts or an accountant's letter.",
    );
    const path = await zipOf(trustId);
    expect(execFileSync("unzip", ["-p", path, "00 Index.txt"]).toString()).toBe(read.index_text);
    // A data-room pack's first line is what it always was.
    expect((await detail(roomId)).index_text.split("\n")[0]).toMatch(
      /^Hand data room · version 1 · \d{1,2} [A-Z][a-z]{2} \d{4}$/,
    );
  });

  it("records a share against a waitlist firm, or a firm typed by hand", async () => {
    const joined = await post("/data/waitlist", {
      email: "cio@buyer901.example",
      firm: "Walk Buyer 901",
      quote: "Invented: send us your security pack.",
    });
    expect(joined.status, JSON.stringify(joined.json)).toBe(200);
    const entryId = String((joined.json!.entry as { entry_id: string }).entry_id);
    const read = await detail(trustId);
    expect(read.buyers).toEqual([{ entry_id: entryId, firm: "Walk Buyer 901", stage: "joined" }]);

    const today = String((await stack.ask("GET", "/data/_test/day")).json!.day);
    const shared = await post(`/data/packs/${trustId}/shares`, {
      entry_id: entryId,
      how: "mailbox",
      to: "cio@buyer901.example",
      shared_on: today,
      note: "",
    });
    expect(shared.status, JSON.stringify(shared.json)).toBe(200);
    expect(shared.json!.share).toMatchObject({
      entry_id: entryId,
      investor_id: null,
      firm: "Walk Buyer 901",
      version: 5,
      to: ["cio@buyer901.example"],
    });
    const typed = await post(`/data/packs/${trustId}/shares`, {
      firm: "Walk Buyer 902",
      how: "meeting",
      to: "",
      shared_on: today,
      note: "",
    });
    expect(typed.json!.share).toMatchObject({
      entry_id: null,
      investor_id: null,
      firm: "Walk Buyer 902",
    });

    const unknown = await post(`/data/packs/${trustId}/shares`, {
      entry_id: "00000000-0000-4000-8000-000000000000",
      how: "mailbox",
      to: "",
      shared_on: today,
      note: "",
    });
    expect(unknown.status).toBe(404);
    expect(codeOf(unknown)).toBe("not_found");
    expect(messageOf(unknown)).toBe("That firm is not on the waitlist.");
    const nobody = await post(`/data/packs/${trustId}/shares`, {
      how: "mailbox",
      to: "",
      shared_on: today,
      note: "",
    });
    expect(nobody.status).toBe(400);
    expect((await detail(trustId)).shares.map((share) => share.firm).sort()).toEqual([
      "Walk Buyer 901",
      "Walk Buyer 902",
    ]);
  });

  it("keeps a data-room pack's share as it was: a waitlist firm is not its to name", async () => {
    await post(`/data/packs/${roomId}/items`, { file_ids: [files[2]!.file_id], covers: "deck" });
    const today = String((await stack.ask("GET", "/data/_test/day")).json!.day);
    const buyers = (await detail(trustId)).buyers!;
    const shared = await post(`/data/packs/${roomId}/shares`, {
      entry_id: buyers[0]!.entry_id,
      firm: "Walk Fund 960",
      how: "meeting",
      to: "",
      shared_on: today,
      note: "",
    });
    expect(shared.json!.share).toMatchObject({
      entry_id: null,
      investor_id: null,
      firm: "Walk Fund 960",
    });
  });

  it("makes the walk's trust pack once, with three files in 07", async () => {
    const seeded = await post("/data/_test/packs/seed-trust");
    expect(seeded.json).toMatchObject({
      made: true,
      pack: { pack_id: "walk-trust-pack", name: "Walk trust pack", kind: "trust", labs: false },
    });
    expect((await post("/data/_test/packs/seed-trust")).json).toMatchObject({ made: false });
    const read = await detail("walk-trust-pack");
    expect(read.items.map((item) => item.covers)).toEqual([
      "infosec_policy",
      "questionnaire",
      "certification",
    ]);
    expect(read.missing).toEqual([
      "Access control policy",
      "Incident response plan",
      "Data handling and privacy policy",
      "Business continuity and disaster recovery",
      "Penetration test report",
      "Insurance certificate",
      "Accounts or an accountant's letter",
    ]);
    const files07 = (read as unknown as { items: { file: { folder_path: string } }[] }).items;
    expect(files07.every((item) => item.file.folder_path === IP)).toBe(true);
  });
});

// ------------------------------------------------------------------ what was stored before kinds

describe("packs and shares stored before kinds existed", () => {
  it("read as data-room packs, and their shares as ones with no waitlist firm", async () => {
    const before = (await stack.ask("GET", "/data/packs")).json!.packs as PackBody[];
    const packsPath = join(stack.dir, "data", "files", "packs.json");
    const sharesPath = join(stack.dir, "data", "files", "pack-shares.jsonl");
    // As the raise batch wrote them: no `kind`, no `labs`, no `entry_id`.
    const stored = JSON.parse(readFileSync(packsPath, "utf8")) as {
      format: number;
      packs: Record<string, unknown>[];
    };
    expect(stored.format).toBe(1);
    const room = stored.packs.find((pack) => pack.name === "Hand data room")!;
    delete room.kind;
    delete room.labs;
    writeFileSync(packsPath, JSON.stringify(stored));
    const lines = readFileSync(sharesPath, "utf8")
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as Record<string, unknown>);
    const old = lines.find((line) => line.firm === "Walk Fund 960")!;
    delete old.entry_id;
    writeFileSync(sharesPath, `${lines.map((line) => JSON.stringify(line)).join("\n")}\n`);

    // The worker starts again and reads what is on the disk.
    await post("/data/_test/crash");
    await until(
      async () => (await stack.ask("GET", "/data/packs")).status === 200,
      "Data to come back",
      30_000,
    );
    const after = (await stack.ask("GET", "/data/packs")).json!.packs as PackBody[];
    expect(after.map((pack) => [pack.name, pack.kind, pack.labs]).sort()).toEqual(
      before.map((pack) => [pack.name, pack.kind, pack.labs]).sort(),
    );
    const roomId = String(room.pack_id);
    const read = await detail(roomId);
    expect(read.pack).toMatchObject({ kind: "data_room", labs: false });
    expect(read.missing).toEqual(["Team", "Roadmap to the next round", "Cap table"]);
    expect(read.shares).toEqual([
      expect.objectContaining({ firm: "Walk Fund 960", entry_id: null, investor_id: null }),
    ]);
    // Its next save writes the kind back.
    await post(`/data/packs/${roomId}/rename`, { name: "Hand data room" });
    const rewritten = JSON.parse(readFileSync(packsPath, "utf8")) as {
      packs: Record<string, unknown>[];
    };
    expect(rewritten.packs.find((pack) => pack.pack_id === roomId)).toMatchObject({
      kind: "data_room",
      labs: false,
    });
    // A trust pack's shares survive the restart as they were.
    const trust = after.find((pack) => pack.name === "Hand trust pack")!;
    expect((await detail(trust.pack_id)).shares.filter((share) => share.entry_id)).toHaveLength(1);
  });

  it("counts both kinds towards the twenty", async () => {
    const inUse = ((await stack.ask("GET", "/data/packs")).json!.packs as PackBody[]).length;
    for (let index = inUse; index < 20; index += 1)
      await make(`Filler ${index}`, index % 2 === 0 ? { kind: "trust" } : {});
    for (const kind of ["trust", "data_room"]) {
      const refused = await post("/data/packs", { name: "One too many", kind });
      expect(refused.status).toBe(409);
      expect(codeOf(refused)).toBe("too_many");
    }
  });
});
