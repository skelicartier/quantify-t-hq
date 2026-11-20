/**
 * The policy register (ws-notes/security/spec.md §8): the eleven policies a buyer asks for
 * (`POLICY_SET`) and any of his own, each linked to a document in Files, with who owns and
 * approved it. HQ writes no policy: the version and the next review are Files' own (the
 * document's current version and its review date, which already feeds Due), so this module
 * adds no Due row, no calendar item and no search of its own.
 *
 * Provides `policies` (`PoliciesLookup`: `fileFor` for the personal devices policy's version,
 * `usedFor`, the Summary's line, evidence) and the overview's `policies` block. Nothing here
 * sends, files or publishes anything. A record and a reminder, not certification advice.
 */

import { writeFileSync } from "node:fs";

import { Refused } from "../../mail-merge/engine";
import type { DataCore } from "../core";
import { clean, isDay } from "../guard";
import type { FileRow, FilesService } from "../files/index";
import { fileChoices } from "../meetings/copy";
import {
  SECURITY_SERVICES,
  type EvidenceOption,
  type PoliciesLookup,
  type PolicyFile,
  type SummaryLine,
} from "../security-contracts";
import { toCsv } from "../text";
import { POLICY_STATES } from "../../../src/lib/data/labels-assurance";
import {
  POLICY_KEYS,
  POLICY_SET,
  isPolicyKey,
  ofWords,
  type ControlKey,
  type PolicyKey,
} from "../../../src/lib/data/labels-controls";
import { TRUST_CHECKLIST } from "../../../src/lib/data/labels-trust";
import { PoliciesBook, isOwnKey } from "./book";
import { SAY } from "./limits";
import { countsAsCurrent, policyStateOf } from "./state";
import type { PolicyEntry } from "./types";
import { WALK_POLICY_FOLDER } from "./walk-seed";

const BOM = "﻿";
const PAGE = "/data/assurance/policies";
const KEY = "([a-z0-9_-]{1,64})";
const route = (tail: string) => new RegExp(`^\\/data\\/policies\\/${KEY}\\/${tail}$`);

export const policyHref = (key: string): string => `${PAGE}#policy-${key}`;

const lowerFirst = (text: string): string => text.charAt(0).toLowerCase() + text.slice(1);

export async function register(core: DataCore): Promise<void> {
  let pinnedDay: string | null = null;
  const today = (): string => pinnedDay ?? core.day();
  const book = new PoliciesBook(core, today);

  const files = () => core.need<FilesService>("files");
  const rowOf = (fileId: string | null): FileRow | null => {
    if (!fileId) return null;
    try {
      return files()?.fileRow(fileId) ?? null;
    } catch (error) {
      core.log(
        `policies: a file could not be read: ${error instanceof Error ? error.name : "error"}`,
      );
      return null;
    }
  };

  const titleOf = (key: string, entry: PolicyEntry | null): string =>
    isPolicyKey(key) ? POLICY_SET[key].title : (entry?.title ?? key);

  const viewOf = (key: string, on = today()) => {
    const entry = book.entry(key);
    const expected = isPolicyKey(key) ? POLICY_SET[key] : null;
    const row = rowOf(entry?.file_id ?? null);
    const state = policyStateOf(
      entry,
      {
        files_here: files() !== null,
        file: row ? { trashed: row.trashed_at !== null, review_by: row.review_by } : null,
      },
      on,
    );
    const trust =
      expected?.trust && expected.trust in TRUST_CHECKLIST
        ? TRUST_CHECKLIST[expected.trust as keyof typeof TRUST_CHECKLIST].label
        : null;
    return {
      key,
      own: !expected,
      title: titleOf(key, entry),
      controls: [...(expected?.controls ?? [])] as ControlKey[],
      why: expected?.why ?? "",
      trust_label: trust,
      trust_words: trust ? `In a trust pack as ‘${trust}’.` : "",
      file:
        entry?.file_id && row
          ? {
              file_id: row.file_id,
              title: row.title,
              folder: row.folder_path,
              version: row.current_n,
              review_by: row.review_by,
              trashed: row.trashed_at !== null,
              href: `/data/files/${row.file_id}`,
            }
          : null,
      file_id: entry?.file_id ?? null,
      owner: entry?.owner ?? "",
      approved_by: entry?.approved_by ?? "",
      approved_on: entry?.approved_on ?? null,
      note: entry?.note ?? "",
      not_needed: entry?.not_needed ?? null,
      state: state.state,
      state_label: POLICY_STATES[state.state].label,
      words: state.words,
      next_review: state.next_review,
      updated_at: entry?.updated_at ?? null,
      updated_by: entry?.updated_by ?? null,
      href: policyHref(key),
    };
  };
  type View = ReturnType<typeof viewOf>;

  const expectedViews = (on = today()): View[] => POLICY_KEYS.map((key) => viewOf(key, on));
  const ownViews = (on = today()): View[] =>
    book
      .own()
      .sort((a, b) => a.title.localeCompare(b.title))
      .map((entry) => viewOf(entry.key, on));

  const countsOf = (on = today()) => {
    const expected = expectedViews(on);
    const own = ownViews(on);
    const all = [...expected, ...own];
    return {
      expected: expected.filter((view) => view.state !== "not_needed").length,
      linked: all.filter((view) => view.file !== null).length,
      current: expected.filter((view) => countsAsCurrent(view.state)).length,
      lapsed: all.filter((view) => view.state === "lapsed").length,
      own: own.length,
    };
  };

  // ---------------------------------------------------------------- the service

  const summaryLine = (on: string): SummaryLine => {
    const expected = expectedViews(on).filter((view) => view.state !== "not_needed");
    const current = expected.filter((view) => countsAsCurrent(view.state)).length;
    const lapsed = expected.filter((view) => view.state === "lapsed").length;
    const missing = expected.filter(
      (view) => view.state === "no_document" || view.state === "trashed",
    ).length;
    const head = ofWords(current, expected.length, "expected policies");
    const verb = current === 1 ? "has" : "have";
    return {
      key: "policies",
      area: "assurance",
      title: "Policies",
      words: `${head} ${verb} a current document${lapsed > 0 ? `; ${lapsed} lapsed` : ""}.`,
      attention: lapsed > 0 || missing > 0,
      href: PAGE,
    };
  };

  const evidence = (on: string): EvidenceOption[] =>
    [...expectedViews(on), ...ownViews(on)]
      .filter((view) => view.file !== null && !view.file.trashed && view.state !== "not_needed")
      .map((view) => {
        const current = countsAsCurrent(view.state);
        return {
          ref: `policies:policy:${view.key}`,
          label: `${view.title}, version ${view.file!.version}`,
          href: view.href,
          current,
          why: current ? "" : view.words,
        };
      });

  const service: PoliciesLookup = {
    usedFor: (fileId) =>
      book.entries
        .filter((entry) => entry.file_id === fileId)
        .map((entry) => ({
          label: isOwnKey(entry.key)
            ? `“${entry.title}”, in Policies`
            : `The ${lowerFirst(titleOf(entry.key, entry))}`,
          href: policyHref(entry.key),
        })),
    fileFor: (key: PolicyKey): PolicyFile | null => {
      const entry = book.entry(key);
      if (!entry?.file_id || entry.not_needed) return null;
      const row = rowOf(entry.file_id);
      if (!row || row.trashed_at) return null;
      return {
        key,
        file_id: row.file_id,
        title: row.title,
        version: row.current_n,
        href: `/data/files/${row.file_id}`,
      };
    },
    summary: (on) => [summaryLine(on)],
    evidence: (on) => evidence(on),
  };
  core.provide(SECURITY_SERVICES.policies, service);

  core.provideOverview("policies", () => {
    const on = today();
    const next = [...expectedViews(on), ...ownViews(on)]
      .filter((view) => view.next_review !== null)
      .sort((a, b) => a.next_review!.localeCompare(b.next_review!))[0];
    return {
      ...countsOf(on),
      next: next ? { title: `Review ${next.title}`, on: next.next_review! } : null,
    };
  });

  // ---------------------------------------------------------------- routes (fixed paths first)

  core.route("GET", "/data/policies", () => {
    const on = today();
    return {
      policies: expectedViews(on),
      own: ownViews(on),
      counts: countsOf(on),
      files: fileChoices(core),
      files_here: files() !== null,
      today: on,
    };
  });

  core.route("POST", "/data/policies/own", (ctx) => {
    const by = ctx.staff();
    return { policy: viewOf(book.addOwn(ctx.body, by).key) };
  });

  core.route("POST", route("link"), (ctx) => {
    const by = ctx.staff();
    const key = ctx.params[0]!;
    if (!book.known(key)) throw new Refused(404, "not_found", SAY.policy);
    const fileId = clean(ctx.body.file_id, 64) || null;
    if (fileId) {
      const service = files();
      if (!service) throw new Refused(409, "files_missing", SAY.filesMissing);
      const row = service.fileRow(fileId);
      if (!row) throw new Refused(404, "not_found", SAY.file);
      if (row.trashed_at) throw new Refused(409, "trashed", SAY.trashed);
    }
    book.link(key, fileId, by);
    return { policy: viewOf(key) };
  });

  core.route("POST", route("update"), (ctx) => {
    const by = ctx.staff();
    const key = ctx.params[0]!;
    book.update(key, ctx.body, by);
    return { policy: viewOf(key) };
  });

  core.route("POST", route("not-needed"), (ctx) => {
    const by = ctx.staff();
    const key = ctx.params[0]!;
    book.notNeeded(key, ctx.body, by);
    return { policy: viewOf(key) };
  });

  core.route("GET", new RegExp(`^\\/data\\/policies\\/${KEY}\\/events$`), (ctx) => {
    const key = ctx.params[0]!;
    if (!book.known(key)) throw new Refused(404, "not_found", SAY.policy);
    return { events: book.events(key) };
  });

  // ---------------------------------------------------------------- the register as a CSV

  core.builds.provide("policies_csv", async (handle, input) => {
    const on = today();
    const views = [...expectedViews(on), ...ownViews(on)];
    handle.setProgress(0, views.length);
    await core.yield();
    const rows = views.map((view) => [
      view.title,
      view.file?.title ?? "",
      view.file ? view.file.version : "",
      view.owner,
      view.approved_by,
      view.approved_on ?? "",
      view.next_review ?? "",
      view.words,
    ]);
    const text =
      BOM +
      toCsv(
        [
          "Policy",
          "Document",
          "Version",
          "Owner",
          "Approved by",
          "Approved on",
          "Next review",
          "State",
        ],
        rows,
      );
    writeFileSync(handle.path, text, { mode: 0o600 });
    handle.setProgress(views.length, views.length);
    core.store.appendLine("policies/exports.jsonl", {
      at: core.now(),
      by: input.by,
      kind: "policies",
      rows: rows.length,
    });
    return { name: `Policies ${on}.csv`, type: "text/csv; charset=utf-8" };
  });

  // ---------------------------------------------------------------- test routes

  if (core.testRoutes) {
    core.route("POST", "/data/_test/policies/today", (ctx) => {
      ctx.staff();
      const day = ctx.body.day;
      if (day === null || day === undefined || day === "") pinnedDay = null;
      else if (isDay(day)) pinnedDay = day;
      else throw new Refused(400, "invalid", SAY.notADay);
      return { today: today(), pinned: pinnedDay !== null };
    });

    /**
     * The walk's documents: two invented policies put into Files ("Security › Policies"), for
     * the walk to give review dates and link. Safe twice: Files keeps one file per content.
     */
    core.route("POST", "/data/_test/policies/seed", async (ctx) => {
      const by = ctx.staff();
      const service = files();
      if (!service) return { files: [] };
      const made: { key: string; file_id: string; title: string }[] = [];
      for (const [key, title] of [
        ["access_control", "Walk access control policy"],
        ["backup", "Walk backup policy"],
      ] as const) {
        const row = await service.putFile({
          folderPath: WALK_POLICY_FOLDER,
          title,
          originalName: `${title}.txt`,
          bytes: new TextEncoder().encode(`${title}. An invented document for the walk.\n`),
          by,
        });
        made.push({ key, file_id: row.file_id, title: row.title });
      }
      return { files: made };
    });

    core.route("GET", "/data/_test/policies/lookup", (ctx) => {
      const on = today();
      const lookup = core.need<PoliciesLookup>(SECURITY_SERVICES.policies);
      const key = clean(ctx.query.get("key"), 40);
      return {
        summary: lookup?.summary(on, ctx.query.get("owner") === "1") ?? [],
        evidence: lookup?.evidence(on) ?? [],
        used_for: lookup?.usedFor(clean(ctx.query.get("file_id"), 64)) ?? [],
        file_for: isPolicyKey(key) ? (lookup?.fileFor(key) ?? null) : null,
        today: on,
      };
    });
  }
}
