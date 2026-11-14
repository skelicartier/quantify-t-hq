// @vitest-environment node
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { WALKER, codeOf, startStack, until, type Stack } from "./helpers";

/**
 * Data-room packs against the real service (raise spec §8.10): the spec's hand check (three
 * invented files whose bytes are `abc`, `abcd` and `abcde`), the KYC refusal, files in the
 * trash, the version rules, a share's record of what was in it, "Save the index in Files",
 * and what the investors module reads (`sharedWith`). Every file and firm is invented.
 */

let stack: Stack;
let scratch: string;
const FUNDRAISING = "10 Fundraising and investors";
const KYC = "13 Directors' KYC";
const sha256 = (bytes: Uint8Array | string) => createHash("sha256").update(bytes).digest("hex");

beforeAll(async () => {
  stack = await startStack({ modules: ["files", "leads", "replies", "waitlist", "numbers"] });
  scratch = mkdtempSync(join(tmpdir(), "hqpk-"));
}, 60_000);
afterAll(async () => {
  await stack.stop();
  rmSync(scratch, { recursive: true, force: true });
});

type Row = { file_id: string; title: string; versions: number; folder_path: string };
type Item = { item_id: string; n: number; file_id: string; covers: string; warning: string };
type PackDetail = {
  pack: { pack_id: string; name: string; version: number; items: { item_id: string }[] };
  items: Item[];
  checklist: { key: string; covered_by: number[] }[];
  missing: string[];
  index_text: string;
  shares: { files: { n: number; title: string }[]; version: number; firm: string }[];
  firms: { investor_id: string; firm: string }[] | null;
};

async function put(folder: string[], title: string, name: string, text: string): Promise<Row> {
  const answer = await stack.ask("POST", "/data/_test/files/put", {
    folder_path: folder,
    title,
    name,
    base64: Buffer.from(text).toString("base64"),
    by: WALKER,
  });
  expect(answer.status).toBe(200);
  return answer.json!.file as Row;
}

async function makePack(name: string): Promise<string> {
  const made = await stack.ask("POST", "/data/packs", { name, by: WALKER });
  expect(made.status).toBe(200);
  return (made.json!.pack as { pack_id: string }).pack_id;
}

const detail = async (packId: string) =>
  (await stack.ask("GET", `/data/packs/${packId}`)).json as unknown as PackDetail;

async function zipOf(packId: string): Promise<string> {
  const started = await stack.ask("POST", "/data/builds", {
    kind: "pack_zip",
    pack_id: packId,
    by: WALKER,
  });
  expect(started.status).toBe(200);
  const id = (started.json!.build as { build_id: string }).build_id;
  let state = "building";
  await until(async () => {
    state = ((await stack.ask("GET", `/data/builds/${id}`)).json!.build as { state: string }).state;
    return state !== "building";
  }, "the pack's zip");
  if (state !== "ready") {
    const detail = (
      (await stack.ask("GET", `/data/builds/${id}`)).json!.build as {
        detail: string;
      }
    ).detail;
    throw new Error(detail);
  }
  const bytes = (await stack.raw(stack.socket, "GET", `/data/builds/${id}/bytes`)).bytes;
  const path = join(scratch, `${id}.zip`);
  writeFileSync(path, bytes);
  return path;
}

const names = (path: string) =>
  execFileSync("unzip", ["-Z1", path], { encoding: "utf8" }).split("\n").filter(Boolean);
const entry = (path: string, name: string) => execFileSync("unzip", ["-p", path, name]);

describe("a pack, by the spec's hand check", () => {
  let packId = "";
  let files: Row[] = [];

  it("is made at version 1 with nothing in it", async () => {
    packId = await makePack("Hand data room");
    const read = await detail(packId);
    expect(read.pack.version).toBe(1);
    expect(read.items).toEqual([]);
    expect(read.missing).toEqual(["Pitch deck", "Team", "Roadmap to the next round", "Cap table"]);
    expect(read.index_text).toMatch(
      /^Hand data room · version 1 · \d{1,2} [A-Z][a-z]{2} \d{4}\n\nMissing: Pitch deck, Team, Roadmap to the next round, Cap table\.\n$/,
    );
    expect(read.firms).toBeNull();
  });

  it("takes three files in one request (version 2), and a cover change makes version 3", async () => {
    files = [
      await put([FUNDRAISING], "Hand deck", "hand-deck.txt", "abc"),
      await put([FUNDRAISING], "Hand team", "hand-team.txt", "abcd"),
      await put([FUNDRAISING], "Hand notes", "hand-notes.txt", "abcde"),
    ];
    const added = await stack.ask("POST", `/data/packs/${packId}/items`, {
      file_ids: files.map((file) => file.file_id),
      covers: ["deck", "team", "team"],
      by: WALKER,
    });
    expect(added.json).toMatchObject({ added: 3, skipped: 0, pack: { version: 2 } });
    const again = await stack.ask("POST", `/data/packs/${packId}/items`, {
      file_ids: [files[0]!.file_id],
      by: WALKER,
    });
    expect(again.json).toMatchObject({ added: 0, skipped: 1, pack: { version: 2 } });
    const third = (await detail(packId)).items[2]!;
    const covered = await stack.ask("POST", `/data/packs/${packId}/items/${third.item_id}/covers`, {
      covers: "other",
      by: WALKER,
    });
    expect(covered.json).toMatchObject({ pack: { version: 3 } });
  });

  it("numbers the index 1 to 3 and says what is missing", async () => {
    const read = await detail(packId);
    expect(read.items.map((item) => [item.n, item.covers])).toEqual([
      [1, "deck"],
      [2, "team"],
      [3, "other"],
    ]);
    expect(read.missing).toEqual(["Roadmap to the next round", "Cap table"]);
    expect(read.checklist.find((line) => line.key === "pilot_data")?.covered_by).toEqual([]);
    const lines = read.index_text.split("\n");
    expect(lines[0]).toMatch(/^Hand data room · version 3 · \d{1,2} [A-Z][a-z]{2} \d{4}$/);
    expect(lines.slice(1)).toEqual([
      "",
      "1. Pitch deck: Hand deck (hand-deck.txt), version 1, 3 B",
      `   SHA-256 ${sha256("abc")}`,
      "2. Team: Hand team (hand-team.txt), version 1, 4 B",
      `   SHA-256 ${sha256("abcd")}`,
      "3. Other: Hand notes (hand-notes.txt), version 1, 5 B",
      `   SHA-256 ${sha256("abcde")}`,
      "",
      "Missing: Roadmap to the next round, Cap table.",
      "",
    ]);
  });

  it("zips the index, the three files and a manifest every line of which matches", async () => {
    const path = await zipOf(packId);
    execFileSync("unzip", ["-tq", path]);
    expect(names(path)).toEqual([
      "00 Index.txt",
      "01 Hand deck.txt",
      "02 Hand team.txt",
      "03 Hand notes.txt",
      "manifest-sha256.txt",
    ]);
    const manifest = entry(path, "manifest-sha256.txt").toString();
    expect(manifest.endsWith("\n")).toBe(true);
    const lines = manifest.trimEnd().split("\n");
    expect(lines).toHaveLength(4);
    expect(lines[1]).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad  01 Hand deck.txt",
    );
    for (const line of lines) {
      const [hash = "", ...rest] = line.split("  ");
      expect(sha256(entry(path, rest.join("  ")))).toBe(hash);
    }
    expect(entry(path, "00 Index.txt").toString()).toBe((await detail(packId)).index_text);
  });

  it("renumbers when item 3 moves to place 1 (version 4), and a rename leaves it at 4", async () => {
    const third = (await detail(packId)).items[2]!;
    const moved = await stack.ask("POST", `/data/packs/${packId}/items/${third.item_id}/move`, {
      to: 1,
      by: WALKER,
    });
    expect(moved.json).toMatchObject({ pack: { version: 4 } });
    const read = await detail(packId);
    expect(read.items.map((item) => [item.n, item.file_id])).toEqual([
      [1, files[2]!.file_id],
      [2, files[0]!.file_id],
      [3, files[1]!.file_id],
    ]);
    expect(read.index_text).toContain("1. Other: Hand notes (hand-notes.txt)");
    const same = await stack.ask("POST", `/data/packs/${packId}/items/${third.item_id}/move`, {
      to: 1,
      by: WALKER,
    });
    expect(same.json).toMatchObject({ pack: { version: 4 } });
    const renamed = await stack.ask("POST", `/data/packs/${packId}/rename`, {
      name: "Hand room",
      by: WALKER,
    });
    expect(renamed.json).toMatchObject({ pack: { version: 4, name: "Hand room" } });
    const list = (await stack.ask("GET", "/data/packs")).json!.packs as {
      pack_id: string;
      files: number;
      missing: string[];
      last_shared_on: string | null;
    }[];
    expect(list.find((pack) => pack.pack_id === packId)).toMatchObject({
      files: 3,
      missing: ["Roadmap to the next round", "Cap table"],
      last_shared_on: null,
    });
  });
});

describe("what never goes in", () => {
  it("refuses a file in “13 Directors' KYC” or below it, with its sentence", async () => {
    const packId = await makePack("KYC check");
    const passport = await put([KYC], "Walk passport", "walk-passport.txt", "invented passport");
    const below = await put([KYC, "Scans"], "Walk PAN", "walk-pan.txt", "invented PAN");
    const fine = await put([FUNDRAISING], "Walk fine", "walk-fine.txt", "invented fine");
    for (const file of [passport, below]) {
      const refused = await stack.ask("POST", `/data/packs/${packId}/items`, {
        file_ids: [fine.file_id, file.file_id],
        by: WALKER,
      });
      expect(refused.status).toBe(409);
      expect(codeOf(refused)).toBe("kyc_folder");
      expect((refused.json!.error as { message: string }).message).toBe(
        "Files in “13 Directors' KYC” never go in a pack.",
      );
    }
    // Refused whole: the good file did not go in either.
    expect((await detail(packId)).items).toEqual([]);
    const candidates = (await stack.ask("GET", `/data/packs/${packId}/candidates`)).json!;
    const all = [...(candidates.fundraising as Row[]), ...(candidates.other as Row[])].map(
      (row) => row.file_id,
    );
    expect(all).toContain(fine.file_id);
    expect(all).not.toContain(passport.file_id);
    expect(all).not.toContain(below.file_id);
    expect((candidates.fundraising as Row[]).map((row) => row.file_id)).toContain(fine.file_id);
  });

  it("refuses a file in the trash, and warns and refuses the zip when one is trashed later", async () => {
    const packId = await makePack("Trash check");
    const gone = await put([FUNDRAISING], "Walk gone", "walk-gone.txt", "invented gone");
    const later = await put([FUNDRAISING], "Walk later", "walk-later.txt", "invented later");
    const board = await put(
      ["02 Board and shareholder meetings"],
      "Walk minutes",
      "walk-minutes.txt",
      "invented minutes",
    );
    await stack.ask("POST", `/data/files/${gone.file_id}/trash`, { by: WALKER });
    const refused = await stack.ask("POST", `/data/packs/${packId}/items`, {
      file_ids: [gone.file_id],
      by: WALKER,
    });
    expect(refused.status).toBe(409);
    expect(codeOf(refused)).toBe("trashed");
    await stack.ask("POST", `/data/packs/${packId}/items`, {
      file_ids: [later.file_id, board.file_id],
      covers: "deck",
      by: WALKER,
    });
    let read = await detail(packId);
    expect(read.items.map((item) => item.warning)).toEqual([
      "",
      "Board papers usually stay out until someone asks.",
    ]);
    await stack.ask("POST", `/data/files/${later.file_id}/trash`, { by: WALKER });
    read = await detail(packId);
    expect(read.items[0]?.warning).toBe("In the trash: restore it or take it out.");
    // A file in the trash covers nothing: the deck is the board file's now.
    expect(read.checklist.find((line) => line.key === "deck")?.covered_by).toEqual([2]);
    await expect(zipOf(packId)).rejects.toThrow(
      "“Walk later” is in the trash: restore it or take it out of the pack.",
    );
  });
});

describe("shares and the index in Files", () => {
  it("keeps what was in it as it was, and refuses an empty pack or no firm", async () => {
    const packId = await makePack("Share check");
    const empty = await stack.ask("POST", `/data/packs/${packId}/shares`, {
      firm: "Walk Fund 9",
      how: "mailbox",
      by: WALKER,
    });
    expect(codeOf(empty)).toBe("empty");
    const a = await put([FUNDRAISING], "Share deck", "share-deck.txt", "invented share deck");
    const b = await put([FUNDRAISING], "Share team", "share-team.txt", "invented share team");
    await stack.ask("POST", `/data/packs/${packId}/items`, {
      file_ids: [a.file_id, b.file_id],
      covers: ["deck", "team"],
      by: WALKER,
    });
    const noFirm = await stack.ask("POST", `/data/packs/${packId}/shares`, {
      how: "mailbox",
      by: WALKER,
    });
    expect((noFirm.json!.error as { message: string }).message).toBe("Say which firm.");
    const badTo = await stack.ask("POST", `/data/packs/${packId}/shares`, {
      firm: "Walk Fund 9",
      how: "mailbox",
      to: "partner9@fund9.example, not-an-address",
      by: WALKER,
    });
    expect((badTo.json!.error as { message: string }).message).toBe(
      "That is not an email address: not-an-address.",
    );
    const shared = await stack.ask("POST", `/data/packs/${packId}/shares`, {
      firm: "Walk Fund 9",
      how: "mailbox",
      to: "partner9@fund9.example analyst9@fund9.example",
      note: "After the first meeting.",
      by: WALKER,
    });
    expect(shared.status).toBe(200);
    expect(shared.json!.share).toMatchObject({
      version: 2,
      firm: "Walk Fund 9",
      investor_id: null,
      to: ["partner9@fund9.example", "analyst9@fund9.example"],
      files: [
        { n: 1, title: "Share deck", version_n: 1, bytes: 19 },
        { n: 2, title: "Share team", version_n: 1, bytes: 19 },
      ],
    });
    const first = (await detail(packId)).items[0]!;
    await stack.ask("POST", `/data/packs/${packId}/items/${first.item_id}/remove`, {
      by: WALKER,
    });
    const read = await detail(packId);
    expect(read.pack.version).toBe(3);
    expect(read.shares[0]?.version).toBe(2);
    expect(read.shares[0]?.files.map((file) => file.title)).toEqual(["Share deck", "Share team"]);
  });

  it("names the firm from the investor list when it is there, and the investors module reads it", async () => {
    const packId = await makePack("Firm check");
    const a = await put([FUNDRAISING], "Firm deck", "firm-deck.txt", "invented firm deck");
    await stack.ask("POST", `/data/packs/${packId}/items`, {
      file_ids: [a.file_id],
      covers: "deck",
      by: WALKER,
    });
    const id = "0123456789abcdef0123456789abcdef";
    const installed = await stack.ask("POST", "/data/_test/numbers/raise", {
      funnel: {},
      firms: [{ investor_id: id, firm: "Walk Fund 77", stage: "met", people: [] }],
      by: WALKER,
    });
    expect(installed.json).toMatchObject({ installed: true });
    try {
      expect((await detail(packId)).firms).toEqual([
        { investor_id: id, firm: "Walk Fund 77", stage: "met" },
      ]);
      const unknown = await stack.ask("POST", `/data/packs/${packId}/shares`, {
        investor_id: "fedcba9876543210fedcba9876543210",
        how: "meeting",
        by: WALKER,
      });
      expect(unknown.status).toBe(404);
      expect((unknown.json!.error as { message: string }).message).toBe("That firm is not here.");
      for (const day of ["2026-01-05", "2026-01-07"])
        await stack.ask("POST", `/data/packs/${packId}/shares`, {
          investor_id: id,
          firm: "typed, not used",
          how: day === "2026-01-05" ? "meeting" : "mailbox",
          shared_on: day,
          by: WALKER,
        });
      const shared = (await stack.ask("GET", `/data/_test/packs/shared/${id}`)).json!.shared;
      expect(shared).toEqual([
        {
          pack_id: packId,
          name: "Firm check",
          version: 2,
          shared_on: "2026-01-07",
          how: "Sent the zip from my mailbox",
          files: 1,
        },
        {
          pack_id: packId,
          name: "Firm check",
          version: 2,
          shared_on: "2026-01-05",
          how: "Shown in a meeting",
          files: 1,
        },
      ]);
      const list = (await stack.ask("GET", "/data/packs")).json!.packs as {
        pack_id: string;
        last_shared_on: string | null;
      }[];
      expect(list.find((pack) => pack.pack_id === packId)?.last_shared_on).toBe("2026-01-07");
    } finally {
      await stack.ask("POST", "/data/_test/numbers/raise", { on: false, by: WALKER });
    }
  });

  it("saves the index in “10 Fundraising and investors”, a new version only when it changed", async () => {
    const packId = await makePack("Index check");
    const a = await put([FUNDRAISING], "Index deck", "index-deck.txt", "invented index deck");
    const b = await put([FUNDRAISING], "Index team", "index-team.txt", "invented index team");
    await stack.ask("POST", `/data/packs/${packId}/items`, {
      file_ids: [a.file_id, b.file_id],
      covers: ["deck", "team"],
      by: WALKER,
    });
    const saved = (await stack.ask("POST", `/data/packs/${packId}/save-index`, { by: WALKER }))
      .json!.file as Row;
    expect(saved).toMatchObject({
      title: "Index check index",
      folder_path: FUNDRAISING,
      versions: 1,
    });
    const again = (await stack.ask("POST", `/data/packs/${packId}/save-index`, { by: WALKER }))
      .json!.file as Row;
    expect(again).toMatchObject({ file_id: saved.file_id, versions: 1 });
    const second = (await detail(packId)).items[1]!;
    await stack.ask("POST", `/data/packs/${packId}/items/${second.item_id}/move`, {
      to: 1,
      by: WALKER,
    });
    const changed = (await stack.ask("POST", `/data/packs/${packId}/save-index`, { by: WALKER }))
      .json!.file as Row;
    expect(changed).toMatchObject({ file_id: saved.file_id, versions: 2 });
  });
});

describe("what Files gives the calendar and the search", () => {
  it("lists a file with a review date, and finds a word in a file's name", async () => {
    const file = await put([FUNDRAISING], "Walk quillfeather report", "quill.txt", "invented");
    await stack.ask("POST", `/data/files/${file.file_id}/update`, {
      review_by: "2026-12-01",
      by: WALKER,
    });
    const answer = (await stack.ask("GET", "/data/_test/files/raise?q=quillfeather")).json!;
    expect(answer.agenda).toContainEqual({
      key: `file_review:${file.file_id}`,
      kind: "file_review",
      title: "Review Walk quillfeather report",
      plain: "File review",
      sub: FUNDRAISING,
      on: "2026-12-01",
      remind_days: [0],
      href: `/data/files/${file.file_id}`,
    });
    expect(answer.search).toEqual([
      {
        kind: "file",
        count: 1,
        hits: [
          {
            kind: "file",
            id: file.file_id,
            title: "Walk quillfeather report",
            subtitle: FUNDRAISING,
            snippet: "",
            href: `/data/files/${file.file_id}`,
          },
        ],
      },
    ]);
    await stack.ask("POST", `/data/files/${file.file_id}/trash`, { by: WALKER });
    const after = (await stack.ask("GET", "/data/_test/files/raise?q=quillfeather")).json!;
    expect((after.agenda as { key: string }[]).map((item) => item.key)).not.toContain(
      `file_review:${file.file_id}`,
    );
    expect(after.search).toEqual([{ kind: "file", count: 0, hits: [] }]);
  });
});
