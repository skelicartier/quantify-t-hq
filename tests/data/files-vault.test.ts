// @vitest-environment node
import { createHash, randomBytes } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { DEFAULT_FOLDERS } from "@/lib/data/labels";
import {
  inventedCsv,
  inventedPdf,
  inventedPng,
  socketCall,
  uploadVia,
} from "../../scripts/data/files/walk-seed";
import { WALKER, startStack, type Stack } from "./helpers";

/**
 * The vault on the real stack: folders, uploads in parts with the SHA-256 kept, a
 * duplicate, a name clash and each choice, versions, the trash, bulk changes and the
 * limits. Every file is invented.
 */
let stack: Stack;
const sha = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
type Row = {
  file_id: string;
  title: string;
  folder_id: string;
  versions: number;
  starred: boolean;
  tags: string[];
};
type FolderView = {
  folder_id: string;
  name: string;
  depth: number;
  default_key: string | null;
  hint: string;
};

const json = (method: "GET" | "POST", path: string, body?: unknown) =>
  socketCall(stack.socket, method, path, body === undefined ? undefined : { json: body });
const folders = async () => (await json("GET", "/data/folders")).body.folders as FolderView[];
const errorCode = (reply: { body: Record<string, unknown> }) =>
  String((reply.body.error as { code?: string } | undefined)?.code ?? "");
const errorMessage = (reply: { body: Record<string, unknown> }) =>
  String((reply.body.error as { message?: string } | undefined)?.message ?? "");

beforeAll(async () => {
  stack = await startStack({ modules: ["files"] });
}, 60_000);
afterAll(async () => {
  await stack.stop();
});

describe("folders", () => {
  it("starts with the fourteen default folders in number order, KYC last, with their hints", async () => {
    const list = await folders();
    expect(list.map((folder) => folder.name)).toEqual(DEFAULT_FOLDERS.map((folder) => folder.name));
    expect(list.at(-1)?.name).toBe("13 Directors' KYC");
    expect(list[0]?.hint).toBe(DEFAULT_FOLDERS[0]?.hint);
    expect(list.every((folder) => folder.depth === 1 && folder.default_key)).toBe(true);
  });

  it("nests four deep at most, refuses a name taken, renames, and deletes only an empty folder of his own", async () => {
    const finance = (await folders()).find((folder) => folder.default_key === "finance")!;
    let parent = finance.folder_id;
    for (const name of ["Bank", "2026", "November"]) {
      const made = await json("POST", "/data/folders", { name, parent_id: parent, by: WALKER });
      expect(made.status).toBe(200);
      parent = (made.body.folder as FolderView).folder_id;
    }
    const tooDeep = await json("POST", "/data/folders", {
      name: "Week 1",
      parent_id: parent,
      by: WALKER,
    });
    expect(tooDeep.status).toBe(400);
    expect(errorCode(tooDeep)).toBe("too_deep");
    const taken = await json("POST", "/data/folders", {
      name: "bank",
      parent_id: finance.folder_id,
      by: WALKER,
    });
    expect(errorCode(taken)).toBe("name_taken");
    const renamed = await json("POST", `/data/folders/${parent}/rename`, {
      name: "Nov",
      by: WALKER,
    });
    expect((renamed.body.folder as FolderView).name).toBe("Nov");
    const notDefault = await json("POST", `/data/folders/${finance.folder_id}/delete`, {
      by: WALKER,
    });
    expect(errorCode(notDefault)).toBe("default_folder");
    const bank = (await folders()).find((folder) => folder.name === "Bank")!;
    const notEmpty = await json("POST", `/data/folders/${bank.folder_id}/delete`, { by: WALKER });
    expect(errorCode(notEmpty)).toBe("not_empty");
    expect(
      (await json("POST", `/data/folders/${parent}/delete`, { by: WALKER })).body.deleted,
    ).toBe(true);
    const renamedDefault = await json("POST", `/data/folders/${finance.folder_id}/rename`, {
      name: "08 Money",
      by: WALKER,
    });
    expect(renamedDefault.status).toBe(200);
  });

  it("keeps a dropped folder's shape below the open one, four levels in all", async () => {
    const leads = (await folders()).find((folder) => folder.default_key === "leads")!;
    const answer = await uploadVia(stack.socket, {
      name: "deep.csv",
      bytes: inventedCsv(3, "deep"),
      by: WALKER,
      folder_id: leads.folder_id,
      relative_path: "Drop/A/B/C/D/deep.csv",
    });
    expect(answer.body.outcome).toBe("added");
    const file = answer.body.file as Row & { folder_path: string };
    expect(file.folder_path).toBe("11 Leads, lists and outreach › Drop › A › B");
  });
});

describe("uploads in parts", () => {
  it("takes a 60 MB file in 20 parts, keeps its SHA-256 and gives back the same bytes", async () => {
    const bytes = randomBytes(60 * 1024 * 1024);
    const begun = await json("POST", "/data/uploads", {
      name: "big.bin",
      size: bytes.length,
      by: WALKER,
    });
    expect(begun.body.parts).toBe(20);
    await socketCall(stack.socket, "POST", `/data/uploads/${String(begun.body.upload_id)}/cancel`, {
      json: { by: WALKER },
    });
    const answer = await uploadVia(stack.socket, { name: "big.bin", bytes, by: WALKER });
    expect(answer.body.outcome).toBe("added");
    const id = (answer.body.file as Row).file_id;
    const detail = (await json("GET", `/data/files/${id}`)).body.file as {
      versions: { sha256: string }[];
    };
    expect(detail.versions[0]?.sha256).toBe(sha(bytes));
    const back = await stack.ask("GET", `/data/files/${id}/bytes`);
    expect(back.status).toBe(200);
    expect(back.headers["x-data-sha256"]).toBe(sha(bytes));
    expect(back.headers["content-type"]).toBe("application/octet-stream");
    expect(Buffer.compare(back.bytes, bytes)).toBe(0);
    const blob = join(stack.dir, "data", "files", "blobs", sha(bytes).slice(0, 2), sha(bytes));
    expect(existsSync(blob)).toBe(true);
    expect(readdirSync(join(stack.dir, "data", "files", "uploads"))).toEqual([]);
  }, 60_000);

  it("refuses a 251 MB file before any part, and an empty one", async () => {
    const tooBig = await json("POST", "/data/uploads", {
      name: "huge.bin",
      size: 251 * 1024 * 1024,
      by: WALKER,
    });
    expect(tooBig.status).toBe(400);
    expect(errorCode(tooBig)).toBe("too_large");
    expect(errorMessage(tooBig)).toMatch(/^That file is over 250 MB/);
    const empty = await json("POST", "/data/uploads", { name: "empty.txt", size: 0, by: WALKER });
    expect(errorCode(empty)).toBe("empty");
  });

  it("refuses an upload that would leave under 5 GB free", async () => {
    await json("POST", "/data/_test/files/free-bytes", {
      bytes: 5 * 1024 * 1024 * 1024 + 10,
      by: WALKER,
    });
    const full = await json("POST", "/data/uploads", { name: "a.txt", size: 100, by: WALKER });
    expect(full.status).toBe(507);
    expect(errorCode(full)).toBe("disk_full");
    expect(errorMessage(full)).toBe("This Mac would have under 5 GB free; the file was not added.");
    await json("POST", "/data/_test/files/free-bytes", { bytes: null, by: WALKER });
    expect(
      (await json("POST", "/data/uploads", { name: "a.txt", size: 100, by: WALKER })).status,
    ).toBe(200);
  });

  it("says the same bytes are already here, and adds them anyway when asked", async () => {
    const bytes = inventedPng("dup");
    const first = await uploadVia(stack.socket, { name: "logo.png", bytes, by: WALKER });
    expect(first.body.outcome).toBe("added");
    const again = await uploadVia(stack.socket, { name: "logo copy.png", bytes, by: WALKER });
    expect(again.body.outcome).toBe("duplicate");
    expect(again.body.message).toBe("Already here as “logo.png” in 00 Inbox. Not added again.");
    const anyway = await uploadVia(stack.socket, {
      name: "logo copy.png",
      bytes,
      by: WALKER,
      choice: "anyway",
    });
    expect(anyway.body.outcome).toBe("added");
    expect((anyway.body.file as Row).title).toBe("logo copy.png");
  });

  it("asks when the name is taken with other bytes, and does each choice", async () => {
    const one = await uploadVia(stack.socket, {
      name: "deck.pdf",
      bytes: await inventedPdf(["Deck one"]),
      by: WALKER,
    });
    const id = (one.body.file as Row).file_id;
    const asked = await uploadVia(stack.socket, {
      name: "deck.pdf",
      bytes: await inventedPdf(["Deck two"]),
      by: WALKER,
    });
    expect(asked.body.outcome).toBe("name_taken");
    expect(asked.body.message).toBe("A file named “deck.pdf” is already in this folder.");
    const version = await uploadVia(stack.socket, {
      name: "deck.pdf",
      bytes: await inventedPdf(["Deck two"]),
      by: WALKER,
      choice: "version",
    });
    expect(version.body.outcome).toBe("version_added");
    expect(version.body.message).toBe("Added as version 2 of “deck.pdf”.");
    const both = await uploadVia(stack.socket, {
      name: "deck.pdf",
      bytes: await inventedPdf(["Deck three"]),
      by: WALKER,
      choice: "both",
    });
    expect((both.body.file as Row).title).toBe("deck (2).pdf");
    const threeBytes = await inventedPdf(["Deck four"]);
    const skipped = await uploadVia(stack.socket, {
      name: "deck.pdf",
      bytes: threeBytes,
      by: WALKER,
      choice: "skip",
    });
    expect(skipped.body.outcome).toBe("skipped");
    expect(
      existsSync(
        join(stack.dir, "data", "files", "blobs", sha(threeBytes).slice(0, 2), sha(threeBytes)),
      ),
    ).toBe(false);

    // Versions: v2 is current; v1 is still there with its own bytes; making v1 current keeps v2.
    let detail = (await json("GET", `/data/files/${id}`)).body.file as {
      current: string;
      versions: { version_id: string; n: number; sha256: string }[];
    };
    expect(detail.versions.map((item) => item.n)).toEqual([1, 2]);
    expect(detail.current).toBe(detail.versions[1]!.version_id);
    const v1 = await stack.ask("GET", `/data/files/${id}/bytes?version=1`);
    expect(v1.headers["x-data-sha256"]).toBe(detail.versions[0]!.sha256);
    const made = await json(
      "POST",
      `/data/files/${id}/versions/${detail.versions[0]!.version_id}/current`,
      { by: WALKER },
    );
    detail = made.body.file as typeof detail;
    expect(detail.current).toBe(detail.versions[0]!.version_id);
    expect(detail.versions).toHaveLength(2);
  });
});

describe("one file's changes, the trash and bulk", () => {
  it("logs each change with who and when", async () => {
    const added = await uploadVia(stack.socket, {
      name: "minutes.txt",
      bytes: Buffer.from("Invented minutes.\n"),
      by: WALKER,
    });
    const id = (added.body.file as Row).file_id;
    const meetings = (await folders()).find((folder) => folder.default_key === "meetings")!;
    const steps: Record<string, unknown>[] = [
      { title: "Board minutes.txt" },
      { folder_id: meetings.folder_id },
      { tags: "board, 2026" },
      { notes: "Signed copy is in the safe." },
      { starred: true },
      { review_by: "2026-11-20" },
    ];
    for (const step of steps)
      expect((await json("POST", `/data/files/${id}/update`, { ...step, by: WALKER })).status).toBe(
        200,
      );
    const detail = (await json("GET", `/data/files/${id}`)).body.file as {
      title: string;
      tags: string[];
      activity: { verb: string; by: { name: string }; at: string }[];
    };
    expect(detail.title).toBe("Board minutes.txt");
    expect(detail.tags).toEqual(["board", "2026"]);
    expect(detail.activity.map((line) => line.verb)).toEqual([
      "Review date set",
      "Starred",
      "Notes changed",
      "Tags changed",
      "Moved from 00 Inbox",
      "Renamed from “minutes.txt”",
      "Added",
    ]);
    expect(
      detail.activity.every((line) => line.by.name === WALKER.name && /^\d{4}-/.test(line.at)),
    ).toBe(true);
    const secret = await json("POST", `/data/files/${id}/update`, {
      notes: "key xkeysib-abc",
      by: WALKER,
    });
    expect(errorCode(secret)).toBe("secret");
  });

  it("trashes, restores to the folder it came from, deletes forever keeping shared bytes, and empties with the count", async () => {
    const bytes = inventedPng("shared-bytes");
    const a = (await uploadVia(stack.socket, { name: "a.png", bytes, by: WALKER })).body
      .file as Row;
    const b = (
      await uploadVia(stack.socket, { name: "b.png", bytes, by: WALKER, choice: "anyway" })
    ).body.file as Row;
    const blob = join(stack.dir, "data", "files", "blobs", sha(bytes).slice(0, 2), sha(bytes));
    const trashed = await json("POST", `/data/files/${a.file_id}/trash`, { by: WALKER });
    expect((trashed.body.file as { trashed: { by: { name: string } } }).trashed.by.name).toBe(
      WALKER.name,
    );
    const list = await json("GET", "/data/files?view=trash");
    expect((list.body.files as Row[]).map((row) => row.file_id)).toContain(a.file_id);
    const restored = await json("POST", `/data/files/${a.file_id}/restore`, { by: WALKER });
    expect((restored.body.file as Row).folder_id).toBe(a.folder_id);
    const notTrash = await json("POST", `/data/files/${a.file_id}/delete-forever`, { by: WALKER });
    expect(errorCode(notTrash)).toBe("not_in_trash");
    await json("POST", `/data/files/${a.file_id}/trash`, { by: WALKER });
    expect(
      (await json("POST", `/data/files/${a.file_id}/delete-forever`, { by: WALKER })).body.deleted,
    ).toBe(true);
    expect(existsSync(blob)).toBe(true);
    await json("POST", `/data/files/${b.file_id}/trash`, { by: WALKER });
    const count = ((await json("GET", "/data/files?view=trash")).body.counts as { trash: number })
      .trash;
    const wrong = await json("POST", "/data/trash/empty", { confirm: count + 1, by: WALKER });
    expect(errorCode(wrong)).toBe("unconfirmed");
    const emptied = await json("POST", "/data/trash/empty", { confirm: String(count), by: WALKER });
    expect(emptied.body.deleted).toBe(count);
    expect(existsSync(blob)).toBe(false);
  });

  it("changes many at once and refuses over 500", async () => {
    const ids: string[] = [];
    for (const tag of ["b1", "b2", "b3"])
      ids.push(
        (
          (
            await uploadVia(stack.socket, {
              name: `${tag}.png`,
              bytes: inventedPng(tag),
              by: WALKER,
            })
          ).body.file as Row
        ).file_id,
      );
    const brand = (await folders()).find((folder) => folder.default_key === "brand")!;
    expect(
      (await json("POST", "/data/files/bulk", { ids: ids.join(","), change: "star", by: WALKER }))
        .body,
    ).toMatchObject({ changed: 3, skipped: 0 });
    expect(
      (await json("POST", "/data/files/bulk", { ids, change: "tag", value: "logo", by: WALKER }))
        .body.changed,
    ).toBe(3);
    expect(
      (
        await json("POST", "/data/files/bulk", {
          ids,
          change: "move",
          value: brand.folder_id,
          by: WALKER,
        })
      ).body.changed,
    ).toBe(3);
    const starred = await json("GET", "/data/files?view=starred");
    const rows = (starred.body.files as (Row & { folder_id: string })[]).filter((row) =>
      ids.includes(row.file_id),
    );
    expect(
      rows.every((row) => row.tags.includes("logo") && row.folder_id === brand.folder_id),
    ).toBe(true);
    expect(
      (await json("POST", "/data/files/bulk", { ids: [ids[0]], change: "trash", by: WALKER })).body
        .changed,
    ).toBe(1);
    const many = await json("POST", "/data/files/bulk", {
      ids: Array.from({ length: 501 }, (_, index) => `id-${index}`),
      change: "star",
      by: WALKER,
    });
    expect(errorMessage(many)).toBe("Choose 500 at most.");
  });

  it("gives other modules the files service: putFile dedupes by bytes and makes folders", async () => {
    const csv = inventedCsv(4, "put");
    const put = await json("POST", "/data/_test/files/put", {
      folder_path: ["11 Leads, lists and outreach", "Sources"],
      title: "sources.csv",
      name: "sources.csv",
      base64: Buffer.from(csv).toString("base64"),
      by: WALKER,
    });
    const file = put.body.file as Row & { folder_path: string };
    expect(file.folder_path).toBe("11 Leads, lists and outreach › Sources");
    expect(put.body.csv).toContain(file.file_id);
    expect(put.body.path).toBe(sha(csv));
    const again = await json("POST", "/data/_test/files/put", {
      folder_path: ["Elsewhere"],
      title: "other.csv",
      name: "other.csv",
      base64: Buffer.from(csv).toString("base64"),
      by: WALKER,
    });
    expect((again.body.file as Row).file_id).toBe(file.file_id);
    const changes = (await json("GET", "/data/_test/files/changes")).body.changes as {
      kind: string;
    }[];
    expect(changes.some((change) => change.kind === "added")).toBe(true);
    expect(changes.some((change) => change.kind === "trashed")).toBe(true);
    expect(changes.some((change) => change.kind === "deleted")).toBe(true);
    // index.json is whole JSON after every write.
    const index = JSON.parse(
      readFileSync(join(stack.dir, "data", "files", "index.json"), "utf8"),
    ) as {
      format: number;
      folders: unknown[];
    };
    expect(index.format).toBe(1);
  });
});
