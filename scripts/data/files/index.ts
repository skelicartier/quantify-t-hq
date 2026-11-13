/**
 * Files: the company's papers, decks, reports and lead files, kept on this Mac with every
 * version, notes and review dates, and found by name or by the words inside. This module
 * registers the Files routes, the folder zip, the overview's "Recent files" and the file
 * reviews in Due, and provides the `files` service the other modules use (addendum 2).
 */

import { Refused } from "../../mail-merge/engine";
import { parseCsv } from "../../../src/lib/crm/csv";
import type { FileKind } from "../../../src/lib/data/labels";
import type { Answer, DataCore, DueItem } from "../core";
import { LIMITS, clean, isUuid, wholeNumber } from "../guard";
import type { Staff } from "../protocol";
import { SHARE_MAX_BYTES } from "../protocol";
import { decode, toCsv } from "../text";
import { ZipLimitError, ZipWriter, zipEntryName } from "../zip";
import { Checker } from "./check";
import { byMatch, matchFile, termsOf } from "./search";
import { Shares } from "./share";
import { servedType, sniff } from "./sniff";
import { TextJobs, readsText } from "./text-jobs";
import { MAX_FILE_BYTES, TOO_LARGE, Uploads } from "./uploads";
import {
  DUE_WINDOW_DAYS,
  PAGE,
  REVIEW_WINDOW_DAYS,
  Vault,
  blobName,
  cleanName,
  numbered,
  type ChangeListener,
  type FileMeta,
  type FileRow,
  type Folder,
  type Version,
} from "./vault";

export type { FileMeta, FileRow, Folder, Version } from "./vault";

/** What the other modules get through `core.need("files")` (addendum 2). */
export type FilesService = {
  csvFiles(): FileRow[];
  fileRow(fileId: string): FileRow | null;
  versions(fileId: string): Version[];
  versionPath(
    fileId: string,
    n?: number,
  ): {
    path: string;
    sha256: string;
    n: number;
    bytes: number;
    original_name: string;
    kind: FileKind;
  } | null;
  putFile(input: {
    folderPath: string[];
    title: string;
    originalName: string;
    bytes: Uint8Array;
    by: Staff;
    note?: string;
  }): Promise<FileRow>;
  onChange: (listener: ChangeListener) => () => void;
};

type UsedFor = { usedFor?: (fileId: string) => { label: string; href: string }[] };

const VIEWS = ["folder", "starred", "recent", "review", "trash", "shared"] as const;
type View = (typeof VIEWS)[number];
const PREVIEW_TEXT_CHARS = 2_000;
const PREVIEW_TEXT_BYTES = 256 * 1024;
const PREVIEW_CSV_BYTES = 1024 * 1024;
const PREVIEW_ROWS = 200;
const ZIP_MAX_FILES = 5_000;
const byName = (a: string, b: string) => a.localeCompare(b, "en", { numeric: true });

export function register(core: DataCore): void {
  const vault = new Vault(core);
  vault.open();
  const text = new TextJobs(core, vault);
  const uploads = new Uploads(core, vault, text);
  uploads.open();
  const checker = new Checker(core, vault);
  const shares = new Shares(core, vault);
  shares.open();
  text.resume();

  const detail = (file: FileMeta) => detailOf(core, vault, text, file);

  // ------------------------------------------------------------------ folders

  core.route("GET", "/data/folders", () => ({ folders: vault.folderList() }));
  core.route("POST", "/data/folders", (ctx) => {
    const folder = vault.createFolder(ctx.body.name, ctx.body.parent_id, ctx.staff());
    return { folder: vault.folderView(folder.folder_id) };
  });
  core.route("POST", "/data/folders/:id/rename", (ctx) => {
    ctx.staff();
    const folder = vault.renameFolder(ctx.params[0]!, ctx.body.name);
    return { folder: vault.folderView(folder.folder_id) };
  });
  core.route("POST", "/data/folders/:id/move", (ctx) => {
    ctx.staff();
    const folder = vault.moveFolder(ctx.params[0]!, ctx.body.parent_id);
    return { folder: vault.folderView(folder.folder_id) };
  });
  core.route("POST", "/data/folders/:id/delete", (ctx) => {
    ctx.staff();
    vault.deleteFolder(ctx.params[0]!);
    return { deleted: true };
  });

  // ------------------------------------------------------------------ the list

  core.route("GET", "/data/files", (ctx) => {
    const query = ctx.query;
    const raw = clean(query.get("view"), 20);
    const view: View = (VIEWS as readonly string[]).includes(raw) ? (raw as View) : "folder";
    const today = core.day();
    const q = clean(query.get("q"), LIMITS.search);
    const tag = clean(query.get("tag"), LIMITS.tag);
    const kind = clean(query.get("kind"), 20);
    const offset = Math.max(0, wholeNumber(query.get("offset"), 0));
    const folderParam = clean(query.get("folder"), 64);
    const within = clean(query.get("in"), 64);
    let folder: Folder | null = null;
    if (view === "folder") {
      folder = folderParam
        ? vault.folderView(folderParam)
        : vault.folderView(vault.inbox().folder_id);
      if (!folder) throw new Refused(404, "not_found", "That folder is no longer here.");
    }
    const live = vault.files().filter((file) => !file.trashed);
    let list: FileMeta[] = [];
    let rows: FileRow[] = [];
    let total = 0;
    let shared: ReturnType<Shares["rows"]> | null = null;
    if (view === "shared") {
      shared = shares.rows(offset);
      total = shared.total;
    } else {
      if (view === "trash")
        list = vault
          .trashed()
          .sort((a, b) => (b.trashed?.at ?? "").localeCompare(a.trashed?.at ?? ""));
      else if (view === "starred")
        list = live
          .filter((file) => file.starred)
          .sort((a, b) => b.updated_at.localeCompare(a.updated_at));
      else if (view === "recent")
        list = [...live].sort((a, b) => b.updated_at.localeCompare(a.updated_at)).slice(0, 100);
      else if (view === "review") list = vault.reviewDue(today, REVIEW_WINDOW_DAYS);
      else if (q) list = within ? live.filter((file) => file.folder_id === within) : live;
      else
        list = live
          .filter((file) => file.folder_id === folder!.folder_id)
          .sort((a, b) => byName(a.title, b.title));
      if (tag)
        list = list.filter((file) =>
          file.tags.some((item) => item.toLowerCase() === tag.toLowerCase()),
        );
      if (kind) list = list.filter((file) => vault.current(file).kind === kind);
      if (q) {
        const terms = termsOf(q);
        const matched: {
          row: FileRow;
          match: NonNullable<FileRow["match"]>;
          updated_at: string;
        }[] = [];
        for (const file of list) {
          const current = vault.current(file);
          const match = matchFile(
            file,
            current.original_name,
            () => text.textOf(current.sha256),
            q,
            terms,
          );
          if (match) matched.push({ row: vault.row(file), match, updated_at: file.updated_at });
        }
        matched.sort(byMatch);
        total = matched.length;
        rows = matched
          .slice(offset, offset + PAGE)
          .map((item) => ({ ...item.row, match: item.match }));
      } else {
        total = list.length;
        rows = list.slice(offset, offset + PAGE).map((file) => vault.row(file));
      }
    }
    const last = checker.last();
    return {
      view,
      files: rows,
      total,
      offset,
      limit: PAGE,
      folder,
      path: folder
        ? vault.pathOf(folder.folder_id).map((step) => vault.folderView(step.folder_id)!)
        : [],
      subfolders: folder && !q ? vault.subfolders(folder.folder_id) : [],
      counts: {
        starred: live.filter((file) => file.starred).length,
        review_due: vault.reviewDue(today, REVIEW_WINDOW_DAYS).length,
        trash: vault.trashed().length,
        shared: shares.count(),
      },
      totals: {
        files: live.length,
        bytes: live.reduce((sum, file) => sum + vault.current(file).bytes, 0),
        trash_bytes: vault.trashed().reduce((sum, file) => sum + vault.current(file).bytes, 0),
      },
      jobs: { reading: text.pending(), checking: checker.running() },
      today,
      tags: vault.tags(),
      last_check: last,
      shares: shared?.shares ?? [],
    };
  });

  core.route("POST", "/data/files/bulk", (ctx) => {
    const by = ctx.staff();
    return vault.bulk(ctx.body.ids, ctx.body.change, ctx.body.value, by);
  });
  core.route("POST", "/data/files/check", (ctx) => ({ job: checker.start(ctx.staff()) }));
  core.route("POST", "/data/trash/empty", (ctx) => {
    ctx.staff();
    return vault.emptyTrash(ctx.body.confirm);
  });

  // ------------------------------------------------------------------ one file

  core.route("GET", "/data/files/:id", (ctx) => ({ file: detail(vault.mustFile(ctx.params[0]!)) }));
  core.route("POST", "/data/files/:id/update", (ctx) => {
    const by = ctx.staff();
    return { file: detail(vault.update(ctx.params[0]!, ctx.body, by)) };
  });
  core.route("POST", "/data/files/:id/versions/:vid/current", (ctx) => {
    const by = ctx.staff();
    return { file: detail(vault.makeCurrent(ctx.params[0]!, ctx.params[1]!, by)) };
  });
  core.route("POST", "/data/files/:id/trash", (ctx) => ({
    file: detail(vault.trash(ctx.params[0]!, ctx.staff())),
  }));
  core.route("POST", "/data/files/:id/restore", (ctx) => ({
    file: detail(vault.restore(ctx.params[0]!, ctx.staff())),
  }));
  core.route("POST", "/data/files/:id/delete-forever", (ctx) => {
    ctx.staff();
    const { bytes_freed } = vault.deleteForever(ctx.params[0]!);
    return { deleted: true, bytes_freed };
  });

  /** The bytes of one version, for the host to stream; "Opened" and "Downloaded" are logged here. */
  core.stream("GET", "/data/files/:id/bytes", (ctx) => {
    const file = vault.mustFile(ctx.params[0]!);
    const n = wholeNumber(ctx.query.get("version"), 0);
    const version = n > 0 ? file.versions.find((item) => item.n === n) : vault.current(file);
    if (!version) throw new Refused(404, "not_found", "That version is no longer here.");
    if (!core.store.exists(blobName(version.sha256)))
      throw new Refused(404, "not_found", "This file's bytes are missing from this Mac.");
    const log = clean(ctx.query.get("log"), 20);
    const staff_id = clean(ctx.query.get("by_id"), LIMITS.staff_id);
    const name = clean(ctx.query.get("by_name"), LIMITS.staff_name);
    if ((log === "open" || log === "download") && staff_id && name)
      vault.log(
        file.file_id,
        log === "open" ? "Opened" : "Downloaded",
        n > 0 ? `Version ${version.n}` : "",
        { staff_id, name },
      );
    return {
      file: {
        path: core.store.path(blobName(version.sha256)),
        size: version.bytes,
        type: servedType(version.mime),
        name: version.original_name,
        sha256: version.sha256,
        remove_after: false,
      },
    };
  });

  // ------------------------------------------------------------------ uploads

  core.route("POST", "/data/uploads", (ctx) => {
    const by = ctx.staff();
    const answer = uploads.begin(ctx.body, by);
    // The walk pins a file's id so the harness can open its page without asking (test routes only).
    if (core.testRoutes && isUuid(ctx.body.pin_file_id))
      uploads.pin(String(answer.upload_id), ctx.body.pin_file_id.toLowerCase());
    return answer;
  });
  core.stream("POST", "/data/uploads/:id/parts/:n", (ctx) => uploads.part(ctx));
  core.route("POST", "/data/uploads/:id/finish", (ctx) =>
    uploads.finish(ctx.params[0]!, ctx.staff()),
  );
  core.route("POST", "/data/uploads/:id/resolve", (ctx) => {
    const by = ctx.staff();
    return uploads.resolve(ctx.params[0]!, ctx.body.choice, by);
  });
  core.route("POST", "/data/uploads/:id/cancel", (ctx) => {
    ctx.staff();
    return uploads.cancel(ctx.params[0]!);
  });

  // ------------------------------------------------------------------ sharing

  core.route("POST", "/data/files/:id/share/email", (ctx) =>
    shares.email(ctx.params[0]!, ctx.body, ctx.staff(), ctx.attempt),
  );
  core.route("POST", "/data/files/:id/share/sheet", (ctx) =>
    shares.sheet(ctx.params[0]!, ctx.staff()),
  );

  // ------------------------------------------------------------------ test knobs

  if (core.testRoutes) {
    core.route("POST", "/data/_test/files/free-bytes", (ctx) => {
      const bytes = ctx.body.bytes;
      uploads.freeBytesOverride =
        typeof bytes === "number" && Number.isSafeInteger(bytes) && bytes >= 0 ? bytes : null;
      return { free_bytes: uploads.freeBytes() };
    });
  }

  // ------------------------------------------------------------------ the overview, Due, the zip

  // The block is a list (unit1-api §8); the provider's type says an object, which a list is.
  core.provideOverview(
    "recent_files",
    (): Answer =>
      vault
        .files()
        .filter((file) => !file.trashed)
        .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
        .slice(0, 8)
        .map((file) => {
          const row = vault.row(file);
          return {
            file_id: row.file_id,
            title: row.title,
            folder_path: row.folder_path,
            kind: row.kind,
            bytes: row.bytes,
            updated_at: row.updated_at,
            updated_by_name: row.updated_by_name,
          };
        }) as unknown as Answer,
  );
  core.provideDue(() =>
    vault.reviewDue(core.day(), DUE_WINDOW_DAYS).map((file): DueItem => ({
      key: `file_review:${file.file_id}`,
      kind: "file_review",
      title: file.title,
      sub: vault.folderPath(file.folder_id),
      due_on: file.review_by!,
      href: `/data/files/${file.file_id}`,
    })),
  );

  core.builds.provide("folder_zip", async (handle, input) => {
    const top = vault.folder(input.folder_id);
    if (!top) throw new Refused(404, "not_found", "That folder is no longer here.");
    const entries: { parts: string[]; file: FileMeta; version: Version }[] = [];
    const walk = (folder_id: string, parts: string[]) => {
      for (const file of vault.files())
        if (!file.trashed && file.folder_id === folder_id)
          entries.push({ parts, file, version: vault.current(file) });
      for (const sub of vault.subfolders(folder_id)) walk(sub.folder_id, [...parts, sub.name]);
    };
    walk(top.folder_id, [top.name]);
    if (entries.length > ZIP_MAX_FILES)
      throw new Refused(
        400,
        "too_many",
        `That folder has ${entries.length.toLocaleString("en-GB")} files; a zip holds 5,000. Download its subfolders.`,
      );
    const name = `${zipEntryName(top.name) || "Files"}.zip`;
    handle.setName(name);
    handle.setProgress(0, entries.length);
    const zip = new ZipWriter(handle.path);
    const taken = new Set<string>();
    const index: (string | number)[][] = [];
    const manifest: string[] = [];
    try {
      for (const [done, entry] of entries.entries()) {
        let path = zipEntryName(...entry.parts, entry.file.title);
        for (let copy = 2; taken.has(path.toLowerCase()); copy += 1)
          path = zipEntryName(...entry.parts, numbered(entry.file.title, copy));
        taken.add(path.toLowerCase());
        await zip.addFile(path, core.store.path(blobName(entry.version.sha256)));
        manifest.push(`${entry.version.sha256}  ${path}`);
        index.push([
          path,
          entry.file.title,
          entry.version.n,
          entry.version.bytes,
          entry.version.sha256,
          entry.version.added_at,
          entry.version.added_by.name,
        ]);
        handle.setProgress(done + 1, entries.length);
        await core.yield();
      }
      const csv = new TextEncoder().encode(
        toCsv(["path", "title", "version", "bytes", "sha256", "added on", "added by"], index),
      );
      await zip.addBytes("index.csv", csv);
      const { createHash } = await import("node:crypto");
      manifest.push(`${createHash("sha256").update(csv).digest("hex")}  index.csv`);
      await zip.addBytes(
        "manifest-sha256.txt",
        new TextEncoder().encode(`${manifest.join("\n")}\n`),
      );
      await zip.finish();
    } catch (error) {
      await zip.abort();
      if (error instanceof ZipLimitError) throw new Refused(400, "too_many", error.message);
      throw error;
    }
    return { name, type: "application/zip" };
  });

  // ------------------------------------------------------------------ the service

  const service: FilesService = {
    csvFiles: () =>
      vault
        .files()
        .filter((file) => !file.trashed && vault.current(file).kind === "csv")
        .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
        .map((file) => vault.row(file)),
    fileRow: (fileId) => {
      const file = vault.file(fileId);
      return file ? vault.row(file) : null;
    },
    versions: (fileId) =>
      [...(vault.file(fileId)?.versions ?? [])]
        .sort((a, b) => a.n - b.n)
        .map((version) => ({ ...version })),
    versionPath: (fileId, n) => {
      const file = vault.file(fileId);
      if (!file) return null;
      const version =
        n === undefined ? vault.current(file) : file.versions.find((item) => item.n === n);
      if (!version) return null;
      return {
        path: core.store.path(blobName(version.sha256)),
        sha256: version.sha256,
        n: version.n,
        bytes: version.bytes,
        original_name: version.original_name,
        kind: version.kind,
      };
    },
    putFile: async (input) => {
      const bytes = input.bytes;
      if (bytes.length === 0) throw new Refused(400, "empty", "That file is empty.");
      if (bytes.length > MAX_FILE_BYTES) throw new Refused(400, "too_large", TOO_LARGE);
      uploads.checkRoom(bytes.length);
      const folder = vault.ensureFolderPath(input.folderPath, null, input.by) ?? vault.inbox();
      const originalName = cleanName(input.originalName, LIMITS.file_name) || "file";
      const sha256 = uploads.keepBytes(bytes);
      const existing = vault.findDuplicate(sha256);
      if (existing) return vault.row(existing);
      const sniffed = sniff(bytes.subarray(0, 8_192), originalName);
      const title = cleanName(input.title, LIMITS.title) || originalName;
      const clash = vault.findByTitle(folder.folder_id, title);
      const version = vault.newVersion({
        sha256,
        bytes: bytes.length,
        kind: sniffed.kind,
        mime: sniffed.mime,
        original_name: originalName,
        by: input.by,
        note: clean(input.note, LIMITS.title),
        n: clash ? vault.nextVersionNumber(clash) : 1,
        text: readsText(sniffed.kind) ? "pending" : "not_applicable",
      });
      let file: FileMeta;
      if (clash) {
        vault.addVersion(clash, version, input.by);
        file = clash;
      } else
        file = vault.addFile({
          folder_id: folder.folder_id,
          title,
          came_from: "",
          version,
          by: input.by,
        });
      if (version.text === "pending") text.queue(sha256, sniffed.kind);
      return vault.row(file);
    },
    onChange: (listener) => vault.onChange(listener),
  };
  core.provide("files", service);

  if (core.testRoutes) {
    // The service as another module sees it, over the socket, for the tests.
    const changes: { kind: string; file_id: string }[] = [];
    service.onChange((event) => {
      changes.push(event);
      if (changes.length > 200) changes.shift();
    });
    core.route("GET", "/data/_test/files/changes", () => ({ changes: [...changes] }));
    core.route("POST", "/data/_test/files/put", async (ctx) => {
      const row = await service.putFile({
        folderPath: Array.isArray(ctx.body.folder_path)
          ? ctx.body.folder_path.map((part) => String(part))
          : [],
        title: clean(ctx.body.title, LIMITS.title),
        originalName: clean(ctx.body.name, LIMITS.file_name),
        bytes: Buffer.from(clean(ctx.body.base64, 8_000_000), "base64"),
        by: ctx.staff(),
      });
      return {
        file: row,
        csv: service.csvFiles().map((item) => item.file_id),
        versions: service.versions(row.file_id).map((version) => version.n),
        path: service.versionPath(row.file_id)?.sha256 ?? null,
      };
    });
  }
}

// ------------------------------------------------------------------ one file's page

export type Preview = {
  kind: "pdf" | "image" | "csv" | "text" | "none";
  text?: string;
  table?: { header: string[]; rows: string[][] };
  text_state: Version["text"];
};

function previewOf(text: TextJobs, version: Version): Preview {
  const state = version.text;
  if (version.kind === "pdf")
    return {
      kind: "pdf",
      text: text.textOf(version.sha256).slice(0, PREVIEW_TEXT_CHARS),
      text_state: state,
    };
  if (version.kind === "image") return { kind: "image", text_state: state };
  if (version.kind === "csv") {
    const head = text.head(version.sha256, PREVIEW_CSV_BYTES);
    const table = parseCsv(decode(head));
    let rows = table.rows;
    if (head.length >= PREVIEW_CSV_BYTES - 3 && rows.length > 0) rows = rows.slice(0, -1);
    return {
      kind: "csv",
      table: { header: table.header, rows: rows.slice(0, PREVIEW_ROWS) },
      text_state: state,
    };
  }
  if (version.kind === "text")
    return {
      kind: "text",
      text: decode(text.head(version.sha256, PREVIEW_TEXT_BYTES)),
      text_state: state,
    };
  return { kind: "none", text_state: state };
}

function detailOf(core: DataCore, vault: Vault, text: TextJobs, file: FileMeta): Answer {
  const current = vault.current(file);
  const used: { label: string; href: string }[] = [];
  for (const name of ["leads", "waitlist"]) {
    try {
      used.push(...(core.need<UsedFor>(name)?.usedFor?.(file.file_id) ?? []));
    } catch (error) {
      core.log(`used-for from ${name} failed: ${error instanceof Error ? error.name : "error"}`);
    }
  }
  // The address it would go from is Mail merge's, read fresh (a stat when nothing changed).
  core.sender.poll();
  const settings = core.sender.settings();
  const folderOf = file.trashed ? file.trashed.from_folder_id : file.folder_id;
  return {
    ...file,
    versions: [...file.versions].sort((a, b) => a.n - b.n),
    row: vault.row(file),
    folder_path: vault.folderPath(file.folder_id),
    path: vault.pathOf(folderOf).map((folder) => vault.folderView(folder.folder_id)!),
    folders: vault
      .folderList()
      .map((folder) => ({ folder_id: folder.folder_id, path: folder.path, depth: folder.depth })),
    activity: vault.activity(file.file_id),
    preview: previewOf(text, current),
    used_for: used,
    sender: { from_name: settings.from_name, from_email: settings.from_email },
    share_max_bytes: SHARE_MAX_BYTES,
    today: core.day(),
  };
}
