// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import * as files from "@/lib/data/api/files";
import { openBuild, startBuild, waitForBuild } from "@/lib/data/api/builds";
import { readDataOverview } from "@/lib/data/api/overview";
import { dataRead } from "@/lib/data/read";
import { DataRequestError } from "@/lib/data/socket";
import {
  inventedCsv,
  inventedPdf,
  inventedPng,
  textRead,
} from "../../scripts/data/files/walk-seed";
import { WALK_KEY, WalkProvider } from "../../scripts/mail-merge/e2e-provider";
import type { OutgoingMail } from "../../scripts/mail-merge/provider";
import { WALKER, startStack, type Stack } from "./helpers";

/**
 * The portal's Files client held to the real service: every call the pages and actions
 * make, made here over the socket, and every answer has to pass the portal's own schema.
 */
let stack: Stack;
const sent: OutgoingMail[] = [];

beforeAll(async () => {
  stack = await startStack({
    env: true,
    modules: ["files"],
    liveProvider: (key) => new WalkProvider(key, () => undefined),
    shareProvider: (key) => new WalkProvider(key, (mail) => sent.push(mail)),
  });
  stack.engine.saveSettings({
    from_email: "founder@walk.example",
    from_name: "Walk Founder",
    reply_to: "",
  });
  await stack.engine.setKey({ key: WALK_KEY });
}, 60_000);
afterAll(async () => {
  await stack.stop();
});

async function upload(
  name: string,
  bytes: Uint8Array,
  extra: { folder_id?: string; file_id?: string } = {},
) {
  const begun = await files.beginUpload({
    name,
    size: bytes.length,
    folder_id: extra.folder_id ?? "",
    relative_path: name,
    ...(extra.file_id ? { file_id: extra.file_id } : {}),
    by: WALKER,
  });
  for (let index = 0; index < begun.parts; index += 1)
    await files.sendUploadPart(
      begun.upload_id,
      index,
      bytes.subarray(index * begun.part_bytes, (index + 1) * begun.part_bytes),
    );
  return files.finishUpload(begun.upload_id, WALKER, begun.upload_id);
}

async function readAll(body: AsyncIterable<Buffer>): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of body) chunks.push(chunk);
  return Buffer.concat(chunks);
}

describe("the portal and Files agree", () => {
  it("on folders, uploads, the list in every view, and one file", async () => {
    const { folders } = await files.readFolders();
    expect(folders).toHaveLength(14);
    const made = await files.createFolder({
      name: "Contract",
      parent_id: folders[1]!.folder_id,
      by: WALKER,
    });
    expect(made.folder.depth).toBe(2);
    await files.renameFolder(made.folder.folder_id, "Contract test", WALKER);
    await files.moveFolder(made.folder.folder_id, null, WALKER);

    const pdf = await upload(
      "contract.pdf",
      await inventedPdf(["The registered office of Walk Fund."]),
      {
        folder_id: made.folder.folder_id,
      },
    );
    expect(pdf.outcome).toBe("added");
    const id = pdf.file!.file_id;
    expect(await textRead(stack.socket, id)).toBe("read");
    const found = await files.readFiles({ q: "registered office" });
    expect(found.total).toBe(1);
    expect(found.files[0]?.match?.where).toBe("text");
    const again = await upload("contract.pdf", await inventedPdf(["Another"]), {
      folder_id: made.folder.folder_id,
    });
    expect(again.outcome).toBe("name_taken");
    expect((await files.resolveUpload(again.upload_id!, "version", WALKER)).outcome).toBe(
      "version_added",
    );
    const version = await upload("contract v3.pdf", await inventedPdf(["Third"]), { file_id: id });
    expect(version.outcome).toBe("version_added");
    expect(version.message).toBe("Added as version 3 of “contract.pdf”.");
    await upload("people.csv", inventedCsv(12, "contract"));
    await upload("logo.png", inventedPng("contract"));

    for (const view of ["folder", "starred", "recent", "review", "trash", "shared"]) {
      const list = await files.readFiles({ view });
      expect(list.view).toBe(view);
    }
    const inFolder = await files.readFiles({ folder: made.folder.folder_id });
    expect(inFolder.files.map((row) => row.title)).toEqual(["contract.pdf"]);
    expect(inFolder.path.map((step) => step.name)).toEqual(["Contract test"]);

    const detail = (await files.readFile(id)).file;
    expect(detail.versions.map((item) => item.n)).toEqual([1, 2, 3]);
    expect(detail.preview.kind).toBe("pdf");
    expect(detail.sender).toEqual({
      from_name: "Walk Founder",
      from_email: "founder@walk.example",
    });
    await files.updateFile(id, { tags: "legal", review_by: "2026-11-12", starred: true }, WALKER);
    await files.makeCurrent(id, detail.versions[0]!.version_id, WALKER);
    const opened = await files.openFileBytes(id, { version: 2, log: "download", by: WALKER });
    expect(opened.type).toBe("application/pdf");
    expect((await readAll(opened.body)).subarray(0, 5).toString()).toBe("%PDF-");
    const after = (await files.readFile(id)).file;
    expect(after.activity[0]?.verb).toBe("Downloaded");
    expect(after.activity.map((line) => line.verb)).toContain("Made version 1 current");

    const bulk = await files.bulkFiles({ ids: [id], change: "unstar", value: "", by: WALKER });
    expect(bulk).toMatchObject({ changed: 1, skipped: 0 });
    expect((await files.checkFiles(WALKER)).job.kind).toBe("checking");

    // The overview's recent files and Due's file review come from this module.
    const overview = await readDataOverview();
    expect(overview.recent_files?.[0]?.file_id).toBeTypeOf("string");
    expect(
      overview.due.some((item) => item.kind === "file_review" && item.href === `/data/files/${id}`),
    ).toBe(true);
  }, 60_000);

  it("on sharing: by email to the stand-in provider, and from the share sheet", async () => {
    const png = await upload("share.png", inventedPng("share"));
    const id = png.file!.file_id;
    const answer = await files.shareByEmail(id, {
      to: "partner1@fund1.example",
      subject: "A picture",
      message: "Please find it attached.",
      by: WALKER,
    });
    expect(answer.share.result).toBe("sent");
    expect(sent.at(-1)?.attachments?.[0]?.name).toBe("share.png");
    expect((await files.logShareSheet(id, WALKER)).share.how).toBe("share_sheet");
    const shared = await files.readFiles({ view: "shared" });
    expect(shared.shares.map((share) => share.how)).toEqual(["share_sheet", "email"]);
  });

  it("on the trash, the folder zip, and the refusals", async () => {
    const png = await upload("gone.png", inventedPng("gone"));
    const id = png.file!.file_id;
    await files.trashFile(id, WALKER);
    await files.restoreFile(id, WALKER);
    await files.trashFile(id, WALKER);
    await expect(files.emptyTrash("999", WALKER)).rejects.toMatchObject({ code: "unconfirmed" });
    await files.deleteForever(id, WALKER);
    await expect(files.readFile(id)).rejects.toMatchObject({ status: 404, code: "not_found" });
    // A file not found is the page's notFound(); the read never reads as an empty file.
    expect(await dataRead(() => files.readFile("nope"))).toMatchObject({ ok: false });

    const { folders } = await files.readFolders();
    const folder = folders.find((item) => item.name === "Contract test")!;
    const build = await startBuild({ kind: "folder_zip", folder_id: folder.folder_id, by: WALKER });
    const ready = await waitForBuild(build.build.build_id, { timeoutMs: 10_000, everyMs: 50 });
    expect(ready).toMatchObject({ state: "ready", name: "Contract test.zip" });
    const zip = await openBuild(build.build.build_id);
    expect((await readAll(zip.body)).subarray(0, 4).toString("hex")).toBe("504b0304");

    await expect(files.deleteFolder(folders[0]!.folder_id, WALKER)).rejects.toBeInstanceOf(
      DataRequestError,
    );
    await expect(files.deleteFolder(folder.folder_id, WALKER)).rejects.toMatchObject({
      code: "not_empty",
    });
    await expect(
      files.beginUpload({
        name: "x",
        size: 300 * 1024 * 1024,
        folder_id: "",
        relative_path: "x",
        by: WALKER,
      }),
    ).rejects.toMatchObject({ code: "too_large" });
  }, 30_000);
});
