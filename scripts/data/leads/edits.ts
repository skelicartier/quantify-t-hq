/**
 * What Data itself keeps about leads, beside what it reads: field edits and tags, leads
 * added by hand (or from a reply, a referral, a yes), notes, and a log of every change and
 * every export. None of it is ever written into Mail merge's lists: an edit here changes
 * the lead and leaves the list row as it was.
 */

import { randomUUID } from "node:crypto";

import type { DataStore } from "../store";
import type { Staff } from "../protocol";
import type { LeadEdit, LeadNote, ManualLead } from "./types";

const EDITS = "leads/edits.json";
const MANUAL = "leads/manual.json";
const NOTES = "leads/notes.jsonl";
const EVENTS = "leads/events.jsonl";
const EXPORTS = "leads/exports.jsonl";

export type LeadEvent = {
  lead_id: string;
  kind: "edit" | "tag" | "stop" | "unstop" | "added";
  detail: string;
  by: Staff;
  at: string;
};

type NoteLine =
  | { note_id: string; lead_id: string; text: string; by: Staff; at: string }
  | { note_id: string; deleted_at: string; by: Staff };

export type ExportLine = {
  at: string;
  by: Staff;
  kind: "this_view" | "tracker" | "left_out";
  view: string;
  rows: number;
};

export class LeadRecords {
  readonly #store: DataStore;
  edits: Record<string, LeadEdit>;
  manual: ManualLead[];
  readonly #notes = new Map<string, LeadNote & { lead_id: string }>();
  readonly #notesByLead = new Map<string, string[]>();
  readonly #events = new Map<string, LeadEvent[]>();

  constructor(store: DataStore) {
    this.#store = store;
    store.ensureDir("leads");
    const edits = store.readJson<Record<string, LeadEdit>>(EDITS, {});
    this.edits = edits && typeof edits === "object" && !Array.isArray(edits) ? edits : {};
    const manual = store.readJson<ManualLead[]>(MANUAL, []);
    this.manual = Array.isArray(manual)
      ? manual.filter((item) => typeof item?.email === "string")
      : [];
    for (const line of store.readLines<NoteLine>(NOTES)) {
      if (!line || typeof line.note_id !== "string") continue;
      if ("deleted_at" in line) {
        const known = this.#notes.get(line.note_id);
        if (known) {
          this.#notes.delete(line.note_id);
          const list = this.#notesByLead.get(known.lead_id) ?? [];
          this.#notesByLead.set(
            known.lead_id,
            list.filter((id) => id !== line.note_id),
          );
        }
        continue;
      }
      this.#notes.set(line.note_id, line);
      const list = this.#notesByLead.get(line.lead_id);
      if (list) list.push(line.note_id);
      else this.#notesByLead.set(line.lead_id, [line.note_id]);
    }
    for (const event of store.readLines<LeadEvent>(EVENTS)) {
      if (!event || typeof event.lead_id !== "string") continue;
      const list = this.#events.get(event.lead_id);
      if (list) list.push(event);
      else this.#events.set(event.lead_id, [event]);
    }
  }

  // ------------------------------------------------------------------ edits and tags

  edit(leadId: string): LeadEdit | null {
    return this.edits[leadId] ?? null;
  }

  saveEdit(leadId: string, change: (edit: LeadEdit) => void, by: Staff, at: string): LeadEdit {
    const edit: LeadEdit = this.edits[leadId] ?? {
      fields: {},
      tags: [],
      updated_at: at,
      updated_by: by,
    };
    change(edit);
    edit.updated_at = at;
    edit.updated_by = by;
    this.edits[leadId] = edit;
    this.#store.writeJson(EDITS, this.edits);
    return edit;
  }

  // ------------------------------------------------------------------ manual leads

  addManual(lead: ManualLead): void {
    this.manual.push(lead);
    this.#store.writeJson(MANUAL, this.manual);
  }

  manualFor(email: string): ManualLead | null {
    return this.manual.find((item) => item.email === email) ?? null;
  }

  // ------------------------------------------------------------------ notes

  notes(leadId: string): LeadNote[] {
    return (this.#notesByLead.get(leadId) ?? [])
      .map((id) => this.#notes.get(id))
      .filter((note): note is LeadNote & { lead_id: string } => Boolean(note))
      .map(({ note_id, text, by, at }) => ({ note_id, text, by, at }))
      .sort((a, b) => b.at.localeCompare(a.at));
  }

  hasNotes(leadId: string): boolean {
    return (this.#notesByLead.get(leadId)?.length ?? 0) > 0;
  }

  note(noteId: string): (LeadNote & { lead_id: string }) | null {
    return this.#notes.get(noteId) ?? null;
  }

  addNote(leadId: string, text: string, by: Staff, at: string): LeadNote {
    const note = { note_id: randomUUID(), lead_id: leadId, text, by, at };
    this.#store.appendLine(NOTES, note);
    this.#notes.set(note.note_id, note);
    const list = this.#notesByLead.get(leadId);
    if (list) list.push(note.note_id);
    else this.#notesByLead.set(leadId, [note.note_id]);
    return { note_id: note.note_id, text, by, at };
  }

  deleteNote(noteId: string, by: Staff, at: string): void {
    const note = this.#notes.get(noteId);
    if (!note) return;
    this.#store.appendLine(NOTES, { note_id: noteId, deleted_at: at, by });
    this.#notes.delete(noteId);
    this.#notesByLead.set(
      note.lead_id,
      (this.#notesByLead.get(note.lead_id) ?? []).filter((id) => id !== noteId),
    );
  }

  // ------------------------------------------------------------------ events and exports

  events(leadId: string): LeadEvent[] {
    return this.#events.get(leadId) ?? [];
  }

  logEvent(event: LeadEvent): void {
    this.#store.appendLine(EVENTS, event);
    const list = this.#events.get(event.lead_id);
    if (list) list.push(event);
    else this.#events.set(event.lead_id, [event]);
  }

  logExport(line: ExportLine): void {
    this.#store.appendLine(EXPORTS, line);
  }

  exports(): ExportLine[] {
    return this.#store.readLines<ExportLine>(EXPORTS);
  }

  /** Whether Data holds anything of its own about a lead: notes, edits or tags. */
  hasData(leadId: string): boolean {
    const edit = this.edits[leadId];
    return (
      this.hasNotes(leadId) ||
      Boolean(edit && (Object.keys(edit.fields).length > 0 || edit.tags.length > 0))
    );
  }
}
