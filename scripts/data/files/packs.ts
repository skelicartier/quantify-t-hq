/**
 * Data-room packs (raise spec §8.10): a numbered set of files to share with an investor
 * after a good first meeting, mostly from "10 Fundraising and investors" and never from
 * "13 Directors' KYC"; what is still missing against an investor's published list for a
 * company that has not launched; a zip with `00 Index.txt` and a SHA-256 for every file;
 * and a record he keeps of who was given which version. HQ never sends a pack.
 *
 * Packs live in `files/packs.json` (rewritten whole) and the shares in
 * `files/pack-shares.jsonl` (one line each, never changed). A pack names files by id: the
 * zip and the index always take each file's current version.
 */

import { createHash, randomUUID } from "node:crypto";

import { Refused } from "../../mail-merge/engine";
import {
  PACK_CHECKLIST,
  PACK_SHARE_HOW,
  type PackCover,
  type PackNeed,
  type PackShareHow,
} from "../../../src/lib/data/labels";
import type { Answer, DataCore } from "../core";
import { LIMITS, clean, cleanText, isDay, normaliseEmail } from "../guard";
import type { Staff } from "../protocol";
import { RAISE_SERVICES, type InvestorsRaise, type PacksLookup } from "../raise-contracts";
import { ZipLimitError, ZipWriter, zipEntryName } from "../zip";
import { matchFile, termsOf } from "./search";
import { bytesInWords } from "./share";
import { extensionOf } from "./sniff";
import type { TextJobs } from "./text-jobs";
import { blobName, type FileMeta, type FileRow, type Vault } from "./vault";

export type PackItem = {
  item_id: string;
  file_id: string;
  covers: PackCover;
  note: string;
  added_at: string;
  added_by: Staff;
};

export type Pack = {
  pack_id: string;
  name: string;
  /** In order: the first is number 1. */
  items: PackItem[];
  /** Goes up by one at every change to the items (not a rename). */
  version: number;
  created_at: string;
  created_by: Staff;
  updated_at: string;
  updated_by: Staff;
  archived: { at: string; by: Staff } | null;
};

export type PackShare = {
  share_id: string;
  pack_id: string;
  version: number;
  investor_id: string | null;
  firm: string;
  how: PackShareHow;
  to: string[];
  shared_on: string;
  note: string;
  /** What was in it, as it was: so the record stays true after the pack changes. */
  files: {
    n: number;
    title: string;
    file_id: string;
    version_n: number;
    sha256: string;
    bytes: number;
  }[];
  at: string;
  by: Staff;
};

export const PACK_MAX_ITEMS = 99;
export const PACK_MAX_PACKS = 20;
export const PACK_ADD_MAX = 50;
export const PACK_SHARE_MAX_TO = 10;
const CANDIDATES_MAX = 200;
const PACKS = "files/packs.json";
const SHARES = "files/pack-shares.jsonl";
/** The walk's pack, pinned so the harness can open its page (test routes only). */
export const WALK_PACK_ID = "walk-pack";

export const KYC_REFUSAL = "Files in “13 Directors' KYC” never go in a pack.";
const BOARD_WARNING = "Board papers usually stay out until someone asks.";
const TRASH_WARNING = "In the trash: restore it or take it out.";
const GONE_WARNING = "No longer in Files: take it out of the pack.";
const KYC_WARNING = "Now in “13 Directors' KYC”: take it out of the pack.";

const COVERS = new Set<string>([...Object.keys(PACK_CHECKLIST), "other"]);
const CHECKLIST = Object.entries(PACK_CHECKLIST) as [
  keyof typeof PACK_CHECKLIST,
  { label: string; need: PackNeed; why: string },
][];

/** What an item covers, in words: its checklist label, or "Other". */
export const coverLabel = (covers: PackCover): string =>
  covers === "other" ? "Other" : PACK_CHECKLIST[covers].label;

const SHORT_MONTHS = [
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
/** "2026-11-13" → "13 Nov 2026". */
const dayWords = (day: string) => {
  const [year = "", month = "1", date = "1"] = day.split("-");
  return `${Number(date)} ${SHORT_MONTHS[Number(month) - 1] ?? ""} ${year}`;
};

/** One file as the index and the zip see it: present, with its current version, or gone. */
export type PackEntry = {
  n: number;
  item: PackItem;
  file: FileMeta | null;
  title: string;
  original_name: string;
  version_n: number;
  bytes: number;
  sha256: string;
};

/** "01 Walk deck.txt": the number, the title, and the original name's extension in lower case. */
export function entryNameOf(n: number, title: string, originalName: string): string {
  const ext = extensionOf(originalName);
  const base = zipEntryName(title).replace(/\//g, "-") || "File";
  const stem =
    ext && base.toLowerCase().endsWith(`.${ext}`) ? base.slice(0, -(ext.length + 1)) : base;
  return `${String(n).padStart(2, "0")} ${stem}${ext ? `.${ext}` : ""}`;
}

/** The checklist with the items that cover each line; a file gone or in the trash covers nothing. */
export function checklistOf(entries: readonly PackEntry[]): {
  key: string;
  label: string;
  need: PackNeed;
  why: string;
  covered_by: number[];
}[] {
  return CHECKLIST.map(([key, line]) => ({
    key,
    label: line.label,
    need: line.need,
    why: line.why,
    covered_by: entries
      .filter((entry) => entry.item.covers === key && entry.file && !entry.file.trashed)
      .map((entry) => entry.n),
  }));
}

/** Every Needed or Expected line nothing covers; "When there is some" lines are never missing. */
export function missingOf(entries: readonly PackEntry[]): string[] {
  return checklistOf(entries)
    .filter((line) => line.need !== "if_any" && line.covered_by.length === 0)
    .map((line) => line.label);
}

/** `00 Index.txt`, word for word (raise spec §8.10.2). */
export function indexText(
  pack: Pick<Pack, "name" | "version">,
  entries: readonly PackEntry[],
  day: string,
): string {
  const lines = [`${pack.name} · version ${pack.version} · ${dayWords(day)}`, ""];
  for (const entry of entries) {
    const label = coverLabel(entry.item.covers);
    if (!entry.file) {
      lines.push(`${entry.n}. ${label}: ${entry.title} (no longer in Files)`);
      continue;
    }
    lines.push(
      `${entry.n}. ${label}: ${entry.title} (${entry.original_name}), version ${entry.version_n}, ${bytesInWords(entry.bytes)}`,
      `   SHA-256 ${entry.sha256}`,
    );
  }
  if (entries.length) lines.push("");
  const missing = missingOf(entries);
  lines.push(
    missing.length ? `Missing: ${missing.join(", ")}.` : "Nothing on the checklist is missing.",
  );
  return `${lines.join("\n")}\n`;
}

type PacksFile = { format: 1; packs: Pack[] };

export function registerPacks(
  core: DataCore,
  vault: Vault,
  text: TextJobs,
  putFile: (input: {
    folderPath: string[];
    title: string;
    originalName: string;
    bytes: Uint8Array;
    by: Staff;
  }) => Promise<FileRow>,
): void {
  const store = core.store;
  const stored = store.readJson<Partial<PacksFile>>(PACKS, {});
  const packs: Pack[] = Array.isArray(stored.packs)
    ? stored.packs.filter((pack) => typeof pack?.pack_id === "string")
    : [];
  const shares: PackShare[] = store
    .readLines<PackShare>(SHARES)
    .filter((share) => typeof share?.share_id === "string");
  const save = () => store.writeJson(PACKS, { format: 1, packs });
  const raise = () => core.need<InvestorsRaise>(RAISE_SERVICES.investorsRaise);

  // ---------------------------------------------------------------- folders by their kind

  const defaultFolder = (key: string) =>
    vault.folderList().find((folder) => folder.default_key === key) ?? null;
  const within = (file: FileMeta, key: string) =>
    vault.pathOf(file.folder_id).some((folder) => folder.default_key === key);
  const inKyc = (file: FileMeta) => within(file, "kyc");

  // ---------------------------------------------------------------- reading a pack

  const mustPack = (packId: string): Pack => {
    const pack = packs.find((item) => item.pack_id === packId);
    if (!pack) throw new Refused(404, "not_found", "That pack is no longer here.");
    return pack;
  };

  const entriesOf = (pack: Pack): PackEntry[] =>
    pack.items.map((item, index) => {
      const file = vault.file(item.file_id);
      const version = file ? vault.current(file) : null;
      return {
        n: index + 1,
        item,
        file,
        title: file?.title ?? "A file since deleted",
        original_name: version?.original_name ?? "",
        version_n: version?.n ?? 0,
        bytes: version?.bytes ?? 0,
        sha256: version?.sha256 ?? "",
      };
    });

  const warningOf = (file: FileMeta | null): string => {
    if (!file) return GONE_WARNING;
    if (file.trashed) return TRASH_WARNING;
    if (inKyc(file)) return KYC_WARNING;
    if (within(file, "meetings")) return BOARD_WARNING;
    return "";
  };

  const lastShared = (packId: string): string | null =>
    shares
      .filter((share) => share.pack_id === packId)
      .reduce<string | null>(
        (last, share) => (!last || share.shared_on > last ? share.shared_on : last),
        null,
      );

  const summaryOf = (pack: Pack): Answer => ({
    ...pack,
    files: pack.items.length,
    missing: missingOf(entriesOf(pack)),
    last_shared_on: lastShared(pack.pack_id),
  });

  const detailOf = (pack: Pack): Answer => {
    const entries = entriesOf(pack);
    const today = core.day();
    const service = raise();
    return {
      pack,
      items: entries.map((entry) => ({
        ...entry.item,
        n: entry.n,
        file: entry.file ? vault.row(entry.file) : null,
        warning: warningOf(entry.file),
      })),
      checklist: checklistOf(entries),
      missing: missingOf(entries),
      index_text: indexText(pack, entries, today),
      shares: shares
        .filter((share) => share.pack_id === pack.pack_id)
        .sort((a, b) => b.shared_on.localeCompare(a.shared_on) || b.at.localeCompare(a.at)),
      firms: service ? service.firmOptions() : null,
      today,
    };
  };

  /** A change to the items: the version goes up by one. */
  const changed = (pack: Pack, by: Staff) => {
    pack.version += 1;
    pack.updated_at = core.now();
    pack.updated_by = by;
    save();
  };

  const coverOf = (value: unknown): PackCover => {
    const covers = clean(value, 20) || "other";
    if (!COVERS.has(covers))
      throw new Refused(400, "invalid", "Choose what it covers from the checklist.");
    return covers as PackCover;
  };

  const nameOf = (value: unknown): string => cleanText(value, 80) || "Data room";

  const make = (name: unknown, by: Staff, pinned?: string): Pack => {
    if (packs.filter((pack) => !pack.archived).length >= PACK_MAX_PACKS)
      throw new Refused(409, "too_many", "Twenty packs at most. Archive one first.");
    const now = core.now();
    const pack: Pack = {
      pack_id: pinned ?? randomUUID(),
      name: nameOf(name),
      items: [],
      version: 1,
      created_at: now,
      created_by: by,
      updated_at: now,
      updated_by: by,
      archived: null,
    };
    packs.push(pack);
    save();
    return pack;
  };

  /**
   * Add files in one change: refused whole when any one may not go in; repeats skipped.
   * `covers` is one checklist key for them all, or one per file in the same order.
   */
  const addItems = (pack: Pack, fileIds: unknown, coversValue: unknown, by: Staff) => {
    const ids = (Array.isArray(fileIds) ? fileIds : [])
      .map((value) => clean(value, 64))
      .filter((value) => value !== "");
    if (ids.length === 0) throw new Refused(400, "invalid", "Choose the files to add.");
    if (ids.length > PACK_ADD_MAX)
      throw new Refused(400, "invalid", "Fifty files at most at a time.");
    const each = Array.isArray(coversValue) ? coversValue.map(coverOf) : null;
    const all = each ? null : coverOf(coversValue);
    const fresh: { file_id: string; covers: PackCover }[] = [];
    let skipped = 0;
    for (const [index, id] of ids.entries()) {
      const file = vault.mustFile(id);
      if (inKyc(file)) throw new Refused(409, "kyc_folder", KYC_REFUSAL);
      if (file.trashed) throw new Refused(409, "trashed", "That file is in the trash.");
      if (
        pack.items.some((item) => item.file_id === id) ||
        fresh.some((item) => item.file_id === id)
      ) {
        skipped += 1;
        continue;
      }
      fresh.push({ file_id: id, covers: each?.[index] ?? all ?? "other" });
    }
    if (pack.items.length + fresh.length > PACK_MAX_ITEMS)
      throw new Refused(409, "too_many", "A pack holds 99 files at most.");
    if (fresh.length > 0) {
      const now = core.now();
      for (const { file_id, covers } of fresh)
        pack.items.push({
          item_id: randomUUID(),
          file_id,
          covers,
          note: "",
          added_at: now,
          added_by: by,
        });
      changed(pack, by);
    }
    return { added: fresh.length, skipped };
  };

  const mustItem = (pack: Pack, itemId: string): number => {
    const index = pack.items.findIndex((item) => item.item_id === itemId);
    if (index < 0) throw new Refused(404, "not_found", "That file is no longer in the pack.");
    return index;
  };

  // ---------------------------------------------------------------- routes

  core.route("GET", "/data/packs", (ctx) => {
    const archived = ctx.query.has("archived") && ctx.query.get("archived") !== "0";
    return {
      packs: packs
        .filter((pack) => (archived ? pack.archived !== null : pack.archived === null))
        .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
        .map(summaryOf),
      archived_count: packs.filter((pack) => pack.archived !== null).length,
    };
  });

  core.route("POST", "/data/packs", (ctx) => ({ pack: make(ctx.body.name, ctx.staff()) }));

  core.route("GET", "/data/packs/:id", (ctx) => detailOf(mustPack(ctx.params[0]!)));

  core.route("GET", "/data/packs/:id/candidates", (ctx) => {
    const pack = mustPack(ctx.params[0]!);
    const q = clean(ctx.query.get("q"), LIMITS.search);
    const terms = termsOf(q);
    const inPack = new Set(pack.items.map((item) => item.file_id));
    const fundraising: FileRow[] = [];
    const other: FileRow[] = [];
    const files = vault
      .files()
      .filter((file) => !file.trashed && !inKyc(file) && !inPack.has(file.file_id))
      .filter((file) => {
        if (terms.length === 0) return true;
        const current = vault.current(file);
        return (
          matchFile(file, current.original_name, () => text.textOf(current.sha256), q, terms) !==
          null
        );
      })
      .sort((a, b) => a.title.localeCompare(b.title, "en", { numeric: true }));
    for (const file of files)
      (within(file, "fundraising") ? fundraising : other).push(vault.row(file));
    const kept = fundraising.slice(0, CANDIDATES_MAX);
    return {
      fundraising: kept,
      other: other.slice(0, Math.max(0, CANDIDATES_MAX - kept.length)),
      total: fundraising.length + other.length,
    };
  });

  core.route("POST", "/data/packs/:id/items", (ctx) => {
    const by = ctx.staff();
    const pack = mustPack(ctx.params[0]!);
    const { added, skipped } = addItems(pack, ctx.body.file_ids, ctx.body.covers, by);
    return { pack, added, skipped };
  });

  core.route("POST", "/data/packs/:id/items/:itemId/move", (ctx) => {
    const by = ctx.staff();
    const pack = mustPack(ctx.params[0]!);
    const from = mustItem(pack, ctx.params[1]!);
    const asked = Number(ctx.body.to);
    if (!Number.isInteger(asked)) throw new Refused(400, "invalid", "Say which place it moves to.");
    const to = Math.min(pack.items.length, Math.max(1, asked)) - 1;
    if (to !== from) {
      const [item] = pack.items.splice(from, 1);
      pack.items.splice(to, 0, item!);
      changed(pack, by);
    }
    return { pack };
  });

  core.route("POST", "/data/packs/:id/items/:itemId/covers", (ctx) => {
    const by = ctx.staff();
    const pack = mustPack(ctx.params[0]!);
    const item = pack.items[mustItem(pack, ctx.params[1]!)]!;
    const covers = coverOf(ctx.body.covers);
    if (item.covers !== covers) {
      item.covers = covers;
      changed(pack, by);
    }
    return { pack };
  });

  core.route("POST", "/data/packs/:id/items/:itemId/remove", (ctx) => {
    const by = ctx.staff();
    const pack = mustPack(ctx.params[0]!);
    pack.items.splice(mustItem(pack, ctx.params[1]!), 1);
    changed(pack, by);
    return { pack };
  });

  core.route("POST", "/data/packs/:id/rename", (ctx) => {
    const by = ctx.staff();
    const pack = mustPack(ctx.params[0]!);
    pack.name = nameOf(ctx.body.name);
    pack.updated_at = core.now();
    pack.updated_by = by;
    save();
    return { pack };
  });

  core.route("POST", "/data/packs/:id/archive", (ctx) => {
    const by = ctx.staff();
    const pack = mustPack(ctx.params[0]!);
    if (!pack.archived) {
      pack.archived = { at: core.now(), by };
      pack.updated_at = core.now();
      pack.updated_by = by;
      save();
    }
    return { pack };
  });

  core.route("POST", "/data/packs/:id/restore", (ctx) => {
    const by = ctx.staff();
    const pack = mustPack(ctx.params[0]!);
    if (pack.archived) {
      if (packs.filter((item) => !item.archived).length >= PACK_MAX_PACKS)
        throw new Refused(409, "too_many", "Twenty packs at most. Archive one first.");
      pack.archived = null;
      pack.updated_at = core.now();
      pack.updated_by = by;
      save();
    }
    return { pack };
  });

  core.route("POST", "/data/packs/:id/shares", (ctx) => {
    const by = ctx.staff();
    const pack = mustPack(ctx.params[0]!);
    if (pack.items.length === 0) throw new Refused(409, "empty", "The pack is empty.");
    const body = ctx.body;
    const service = raise();
    const asked = clean(body.investor_id, 64);
    let investor_id: string | null = null;
    let firm = "";
    if (asked && service) {
      const name = service.name(asked);
      if (name === null) throw new Refused(404, "not_found", "That firm is not here.");
      investor_id = asked;
      firm = name;
    } else {
      firm = cleanText(body.firm, LIMITS.name);
      if (!firm) throw new Refused(400, "invalid", "Say which firm.");
    }
    const how = clean(body.how, 20);
    if (!(how in PACK_SHARE_HOW)) throw new Refused(400, "invalid", "Choose how it was shared.");
    const typed = Array.isArray(body.to)
      ? body.to.map((value) => clean(value, LIMITS.email))
      : clean(body.to, 4_000).split(/[\s,;]+/);
    const to: string[] = [];
    for (const raw of typed.filter((value) => value !== "")) {
      const email = normaliseEmail(raw);
      if (!email) throw new Refused(400, "invalid", `That is not an email address: ${raw}.`);
      if (!to.includes(email)) to.push(email);
    }
    if (to.length > PACK_SHARE_MAX_TO) throw new Refused(400, "invalid", "Ten addresses at most.");
    const today = core.day();
    const sharedOn = clean(body.shared_on, 10) || today;
    if (!isDay(sharedOn)) throw new Refused(400, "invalid", "Choose the day it was shared.");
    if (sharedOn > today) throw new Refused(400, "invalid", "That day is in the future.");
    const share: PackShare = {
      share_id: randomUUID(),
      pack_id: pack.pack_id,
      version: pack.version,
      investor_id,
      firm,
      how: how as PackShareHow,
      to,
      shared_on: sharedOn,
      note: cleanText(body.note, 2_000),
      files: entriesOf(pack)
        .filter((entry) => entry.file !== null)
        .map((entry) => ({
          n: entry.n,
          title: entry.title,
          file_id: entry.item.file_id,
          version_n: entry.version_n,
          sha256: entry.sha256,
          bytes: entry.bytes,
        })),
      at: core.now(),
      by,
    };
    store.appendLine(SHARES, share);
    shares.push(share);
    return { share };
  });

  core.route("POST", "/data/packs/:id/save-index", async (ctx) => {
    const by = ctx.staff();
    const pack = mustPack(ctx.params[0]!);
    const folder = defaultFolder("fundraising");
    const textOf = indexText(pack, entriesOf(pack), core.day());
    const file = await putFile({
      folderPath: folder ? vault.pathOf(folder.folder_id).map((step) => step.name) : [],
      title: `${pack.name} index`,
      originalName: `${pack.name} index.txt`,
      bytes: new TextEncoder().encode(textOf),
      by,
    });
    return { file };
  });

  // ---------------------------------------------------------------- the zip

  core.builds.provide("pack_zip", async (handle, input) => {
    const pack = mustPack(clean(input.body.pack_id, 64));
    const entries = entriesOf(pack);
    if (entries.length === 0) throw new Refused(409, "empty", "The pack is empty.");
    for (const entry of entries) {
      if (!entry.file)
        throw new Refused(
          409,
          "not_found",
          `“${entry.title}” is no longer in Files: take it out of the pack.`,
        );
      if (entry.file.trashed)
        throw new Refused(
          409,
          "trashed",
          `“${entry.title}” is in the trash: restore it or take it out of the pack.`,
        );
      if (inKyc(entry.file)) throw new Refused(409, "kyc_folder", KYC_REFUSAL);
    }
    const today = core.day();
    const name = `${pack.name.replace(/[/\\]/g, "-")} ${today}.zip`;
    handle.setName(name);
    handle.setProgress(0, entries.length + 2);
    const zip = new ZipWriter(handle.path);
    const manifest: string[] = [];
    try {
      const index = new TextEncoder().encode(indexText(pack, entries, today));
      await zip.addBytes("00 Index.txt", index);
      manifest.push(`${createHash("sha256").update(index).digest("hex")}  00 Index.txt`);
      handle.setProgress(1, entries.length + 2);
      for (const entry of entries) {
        const entryName = entryNameOf(entry.n, entry.title, entry.original_name);
        await zip.addFile(entryName, core.store.path(blobName(entry.sha256)));
        manifest.push(`${entry.sha256}  ${entryName}`);
        handle.setProgress(entry.n + 1, entries.length + 2);
        await core.yield();
      }
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

  // ---------------------------------------------------------------- what the investors module reads

  const lookup: PacksLookup = {
    sharedWith: (investorId) =>
      shares
        .filter((share) => share.investor_id !== null && share.investor_id === investorId)
        .sort((a, b) => b.shared_on.localeCompare(a.shared_on) || b.at.localeCompare(a.at))
        .map((share) => ({
          pack_id: share.pack_id,
          name: packs.find((pack) => pack.pack_id === share.pack_id)?.name ?? "A pack",
          version: share.version,
          shared_on: share.shared_on,
          how: PACK_SHARE_HOW[share.how] ?? share.how,
          files: share.files.length,
        })),
  };
  core.provide(RAISE_SERVICES.packs, lookup);

  // ---------------------------------------------------------------- the walk's pack (test routes only)

  if (core.testRoutes) {
    // What the investors module would read for a firm, for the tests.
    core.route("GET", "/data/_test/packs/shared/:id", (ctx) => ({
      shared: lookup.sharedWith(ctx.params[0]!),
    }));
    core.route("POST", "/data/_test/packs/seed", async (ctx) => {
      const by = ctx.staff();
      const known = packs.find((pack) => pack.pack_id === WALK_PACK_ID);
      if (known) return { pack: known, made: false };
      const folder = defaultFolder("fundraising");
      const path = folder ? vault.pathOf(folder.folder_id).map((step) => step.name) : [];
      const made: { file: FileRow; covers: PackCover }[] = [];
      for (const seed of WALK_PACK_FILES)
        made.push({
          file: await putFile({
            folderPath: path,
            title: seed.title,
            originalName: seed.name,
            bytes: new TextEncoder().encode(seed.text),
            by,
          }),
          covers: seed.covers,
        });
      const pack = make("Walk data room", by, WALK_PACK_ID);
      const now = core.now();
      for (const { file, covers } of made)
        pack.items.push({
          item_id: randomUUID(),
          file_id: file.file_id,
          covers,
          note: "",
          added_at: now,
          added_by: by,
        });
      changed(pack, by);
      return { pack, made: true };
    });
  }
}

/** The walk's three invented files, in "10 Fundraising and investors". */
const WALK_PACK_FILES: { title: string; name: string; text: string; covers: PackCover }[] = [
  {
    title: "Walk pitch deck",
    name: "walk-pitch-deck.txt",
    text: "Invented pitch deck for the walk: a terminal for Indian markets research.\n",
    covers: "deck",
  },
  {
    title: "Walk team",
    name: "walk-team.txt",
    text: "Invented team page for the walk: two founders, both invented.\n",
    covers: "team",
  },
  {
    title: "Walk one-pager",
    name: "walk-one-pager.txt",
    text: "Invented one-pager for the walk.\n",
    covers: "other",
  },
];
