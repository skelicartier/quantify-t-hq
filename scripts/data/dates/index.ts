/**
 * Key dates (spec §2.8): the dates he keeps, so nothing lapses, and the dates suggested
 * for an Indian private company, worked out from today and the AGM date. A suggestion is
 * only ever a row with its rule, who it applies to, the day it was checked and "Add it":
 * nothing is added on its own and nothing alarms for a date he did not add. What he did
 * add lands in the overview's Due once it is inside its reminder window.
 */

import { writeFileSync } from "node:fs";

import type { DataCore, DueItem } from "../core";
import { clean } from "../guard";
import { toCsv } from "../text";
import { DATE_KINDS, DATE_STATES, REPEATS } from "../../../src/lib/data/labels";
import type { FilesService } from "../leads/contracts";
import { readVault } from "../backup/vault-index";
import { registerDatesAgenda } from "./agenda";
import { CHECKED_ON } from "./catalogue";
import { DatesBook, inWindow, shownState, type KeyDate } from "./book";

const BOM = "﻿";
const FILES_SHOWN = 500;

export async function register(core: DataCore): Promise<void> {
  const book = new DatesBook(core);
  registerDatesAgenda(core, book);
  const files = () => core.need<FilesService>("files");
  const fileExists = (id: string): boolean => {
    const row = files()?.fileRow(id);
    return Boolean(row && !row.trashed_at);
  };

  const rowOf = (date: KeyDate, today: string) => {
    const file = date.file_id ? (files()?.fileRow(date.file_id) ?? null) : null;
    return {
      ...date,
      shown_state: shownState(date, today),
      overdue: date.state === "coming_up" && date.due_on < today,
      reminding: inWindow(date, today),
      file: file && !file.trashed_at ? { file_id: file.file_id, title: file.title } : null,
    };
  };

  core.provideDue((): DueItem[] => {
    const today = core.day();
    return book.dates
      .filter((date) => inWindow(date, today))
      .map((date) => ({
        key: `key_date:${date.date_id}`,
        kind: "key_date" as const,
        title: date.title,
        sub: [DATE_KINDS[date.kind], date.entity, date.handled_by].filter(Boolean).join(" · "),
        due_on: date.due_on,
        href: `/data/dates#date-${date.date_id}`,
      }));
  });

  core.route("GET", "/data/dates", (ctx) => {
    const today = core.day();
    const view = clean(ctx.query.get("view"), 20) || "upcoming";
    const sorted = [...book.dates].sort(
      (a, b) => a.due_on.localeCompare(b.due_on) || a.title.localeCompare(b.title),
    );
    const chosen =
      view === "all"
        ? sorted
        : view === "done"
          ? sorted.filter((date) => date.state !== "coming_up")
          : sorted.filter((date) => date.state === "coming_up");
    const vault = files() ? readVault(core.store).filter((file) => !file.trashed) : [];
    return {
      view: view === "all" || view === "done" ? view : "upcoming",
      dates: chosen.map((date) => rowOf(date, today)),
      counts: {
        upcoming: sorted.filter((date) => date.state === "coming_up").length,
        done: sorted.filter((date) => date.state !== "coming_up").length,
        all: sorted.length,
      },
      suggestions: book.suggestions(today),
      facts: book.facts,
      checked_on: CHECKED_ON,
      files: vault
        .map((file) => ({
          file_id: file.file_id,
          title: file.title,
          folder: file.folder.join(" › "),
        }))
        .sort((a, b) => a.folder.localeCompare(b.folder) || a.title.localeCompare(b.title))
        .slice(0, FILES_SHOWN),
      files_here: files() !== null,
      today,
    };
  });

  core.route("POST", "/data/dates", (ctx) => {
    const by = ctx.staff();
    return { date: rowOf(book.add(ctx.body, by, fileExists), core.day()) };
  });

  core.route("POST", "/data/dates/facts", (ctx) => {
    ctx.staff();
    return { facts: book.setFacts({ agm_on: ctx.body.agm_on }) };
  });

  core.route("POST", "/data/dates/suggested/:key/add", (ctx) => {
    const by = ctx.staff();
    return {
      date: rowOf(book.addSuggested(ctx.params[0]!, ctx.body, by, fileExists), core.day()),
    };
  });

  core.route("POST", "/data/dates/:id/update", (ctx) => {
    const by = ctx.staff();
    const date = book.get(ctx.params[0]);
    return { date: rowOf(book.update(date, ctx.body, by, fileExists), core.day()) };
  });

  core.route("POST", "/data/dates/:id/done", (ctx) => {
    const by = ctx.staff();
    const date = book.get(ctx.params[0]);
    return { date: rowOf(book.done(date, ctx.body.note, by), core.day()) };
  });

  core.route("POST", "/data/dates/:id/not-for-us", (ctx) => {
    const by = ctx.staff();
    const date = book.get(ctx.params[0]);
    return { date: rowOf(book.notForUs(date, ctx.body.note, by), core.day()) };
  });

  core.route("POST", "/data/dates/:id/delete", (ctx) => {
    ctx.staff();
    const date = book.get(ctx.params[0]);
    book.remove(date);
    return { deleted: date.date_id };
  });

  core.builds.provide("dates_csv", async (handle, input) => {
    const today = core.day();
    const all = [...book.dates].sort((a, b) => a.due_on.localeCompare(b.due_on));
    handle.setProgress(0, all.length);
    await core.yield();
    const text =
      BOM +
      toCsv(
        [
          "due_on",
          "what",
          "kind",
          "repeats",
          "company",
          "handled_by",
          "remind_days_before",
          "state",
          "notes",
          "file",
          "suggested_rule",
          "last_done",
        ],
        all.map((date) => [
          date.due_on,
          date.title,
          DATE_KINDS[date.kind],
          REPEATS[date.repeats],
          date.entity,
          date.handled_by,
          date.remind_days,
          DATE_STATES[shownState(date, today)],
          date.notes,
          date.file_id ? (files()?.fileRow(date.file_id)?.title ?? "") : "",
          date.from_suggestion ?? "",
          date.history[date.history.length - 1]?.done_at.slice(0, 10) ?? "",
        ]),
      );
    writeFileSync(handle.path, text, { mode: 0o600 });
    handle.setProgress(all.length, all.length);
    core.store.appendLine("dates/exports.jsonl", {
      at: core.now(),
      by: input.by,
      kind: "dates",
      rows: all.length,
    });
    return { name: `Key dates ${today}.csv`, type: "text/csv; charset=utf-8" };
  });
}
