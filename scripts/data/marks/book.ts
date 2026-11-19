/**
 * The trademark book (ws-notes/duties/spec.md §6.4): `marks/marks.json` and
 * `marks/events.jsonl` (one line per change, naming fields and steps, never values). A mark
 * is never deleted: it is refused, abandoned, withdrawn or removed, and stays listed.
 */

import { randomUUID } from "node:crypto";

import { Refused } from "../../mail-merge/engine";
import type { Flag } from "../company-contracts";
import type { DataCore } from "../core";
import { clean, cleanText, isDay } from "../guard";
import type { Staff } from "../protocol";
import { MARK_STATUSES, MARK_STEPS, type MarkStepKey } from "../../../src/lib/data/labels-security";
import { isDead } from "./clocks";
import { LIMIT, SAY, tooMany } from "./limits";
import type { Mark, MarkEvent, MarkStatus } from "./types";

const MARKS = "marks/marks.json";
const EVENTS = "marks/events.jsonl";

type Input = Record<string, unknown>;
type StepField = keyof Mark["steps"];

const KINDS = new Set<string>(["word", "device", "combined"]);
const FLAGS = new Set<string>(["yes", "no", ""]);

/** Each step: the day it sets, the number it may carry, and the status it implies. */
const STEPS: Record<
  MarkStepKey,
  { field: StepField; number?: StepField; status?: MarkStatus; after?: StepField }
> = {
  deficiency_notice: { field: "deficiency_notice_on" },
  deficiency_fixed: { field: "deficiency_fixed_on", after: "deficiency_notice_on" },
  exam_report: { field: "exam_report_on", status: "objected" },
  exam_reply: { field: "exam_reply_on", after: "exam_report_on" },
  hearing: { field: "hearing_on" },
  journal: { field: "journal_on", number: "journal_number", status: "accepted_and_advertised" },
  opposition_notice: { field: "opposition_notice_on", status: "opposed" },
  counter_statement: { field: "counter_statement_on", after: "opposition_notice_on" },
  registered: { field: "registered_on", number: "certificate_number", status: "registered" },
};

/** Days that may be ahead of today: the hearing, and the expiry on the certificate. */
const FUTURE_OK = new Set<StepField>(["hearing_on", "expires_on"]);

const EMPTY_STEPS: Mark["steps"] = {
  deficiency_notice_on: null,
  deficiency_fixed_on: null,
  exam_report_on: null,
  exam_reply_on: null,
  hearing_on: null,
  journal_number: "",
  journal_on: null,
  opposition_notice_on: null,
  counter_statement_on: null,
  registered_on: null,
  certificate_number: "",
  expires_on: null,
};

const FIELD_WORDS: Record<string, string> = {
  name: "The mark",
  kind: "Kind",
  class_number: "Class",
  goods: "Goods and services",
  application_number: "Application number",
  applied_on: "Applied on",
  applicant: "Applicant",
  agent: "Agent",
  agent_contact_id: "Agent's contact",
  filed_as_startup: "Filed as a startup",
  fee_paid: "Fee paid",
  expires_on: "Expiry on the certificate",
  notes: "Notes",
};

function markOf(raw: unknown): Mark | null {
  const r = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : null;
  if (!r || typeof r.mark_id !== "string" || typeof r.name !== "string") return null;
  const steps = (r.steps && typeof r.steps === "object" ? r.steps : {}) as Record<string, unknown>;
  const mark = r as unknown as Mark;
  return {
    ...mark,
    steps: { ...EMPTY_STEPS, ...(steps as Partial<Mark["steps"]>) },
    renewals: Array.isArray(r.renewals) ? (r.renewals as Mark["renewals"]) : [],
    watch: Array.isArray(r.watch) ? (r.watch as Mark["watch"]) : [],
    file_ids: Array.isArray(r.file_ids)
      ? (r.file_ids as unknown[]).filter((id): id is string => typeof id === "string")
      : [],
    status: r.status && String(r.status) in MARK_STATUSES ? (r.status as MarkStatus) : "drafting",
  };
}

export class MarksBook {
  readonly #core: DataCore;
  marks: Mark[];
  /** Under test routes: the id the next mark takes (the walk's pinned record). */
  pinned: string | null = null;

  constructor(core: DataCore) {
    this.#core = core;
    core.store.ensureDir("marks");
    const stored = core.store.readJson<{ marks?: unknown[] }>(MARKS, {});
    this.marks = Array.isArray(stored.marks)
      ? stored.marks.map(markOf).filter((item): item is Mark => item !== null)
      : [];
  }

  #save(): void {
    this.#core.store.writeJson(MARKS, { format: 1, marks: this.marks });
  }

  log(mark: Mark, verb: string, detail: string, by: Staff): void {
    const line: MarkEvent = {
      event_id: randomUUID(),
      mark_id: mark.mark_id,
      verb,
      detail,
      by,
      at: this.#core.now(),
    };
    this.#core.store.appendLine(EVENTS, line);
  }

  eventsOf(markId: string, limit = 100): MarkEvent[] {
    return this.#core.store
      .readLines<MarkEvent>(EVENTS)
      .filter((event) => event?.mark_id === markId)
      .reverse()
      .slice(0, limit);
  }

  get(id: string | undefined): Mark {
    const found = id ? this.marks.find((item) => item.mark_id === id) : undefined;
    if (!found) throw new Refused(404, "not_found", SAY.mark);
    return found;
  }

  #touch(mark: Mark, by: Staff): void {
    mark.updated_at = this.#core.now();
    mark.updated_by = by;
    this.#save();
  }

  // ---------------------------------------------------------------- reading inputs

  #day(value: unknown, future = false): string | null {
    const day = clean(value, 10);
    if (!day) return null;
    if (!isDay(day)) throw new Refused(400, "invalid", SAY.notADay);
    if (!future && day > this.#core.day()) throw new Refused(400, "invalid", SAY.future);
    return day;
  }

  #class(value: unknown): number {
    const text = clean(value, 4);
    const number = /^\d+$/.test(text) ? Number(text) : NaN;
    if (!Number.isInteger(number) || number < LIMIT.class_min || number > LIMIT.class_max)
      throw new Refused(400, "invalid", SAY.class);
    return number;
  }

  #fee(value: unknown): number | null {
    const text = clean(value, 20).replace(/[₹,\s]/g, "");
    if (!text) return null;
    const number = /^\d+$/.test(text) ? Number(text) : NaN;
    if (!Number.isInteger(number) || number < 1 || number > LIMIT.fee_max)
      throw new Refused(400, "invalid", SAY.fee);
    return number;
  }

  #contact(value: unknown): string | null {
    const id = clean(value, 64);
    if (!id) return null;
    const contacts = this.#core.need<{ get(contactId: string): unknown }>("contacts");
    if (!contacts) return null;
    if (!contacts.get(id)) throw new Refused(404, "not_found", SAY.contact);
    return id;
  }

  #fields(input: Input, base: Mark | null) {
    const has = (name: string) => Object.prototype.hasOwnProperty.call(input, name);
    const name = has("name") ? cleanText(input.name, LIMIT.name) : (base?.name ?? "");
    if (!name) throw new Refused(400, "invalid", SAY.name);
    const kind = has("kind") ? clean(input.kind, 10) || "word" : (base?.kind ?? "word");
    if (!KINDS.has(kind)) throw new Refused(400, "invalid", SAY.kind);
    const flag = has("filed_as_startup")
      ? clean(input.filed_as_startup, 4)
      : (base?.filed_as_startup ?? "");
    if (!FLAGS.has(flag)) throw new Refused(400, "invalid", SAY.flag);
    const fields = {
      name,
      kind: kind as Mark["kind"],
      class_number: has("class_number")
        ? this.#class(input.class_number)
        : (base?.class_number ?? this.#class("")),
      goods: has("goods") ? cleanText(input.goods, LIMIT.goods) : (base?.goods ?? ""),
      application_number: has("application_number")
        ? clean(input.application_number, LIMIT.application_number)
        : (base?.application_number ?? ""),
      applied_on: has("applied_on") ? this.#day(input.applied_on) : (base?.applied_on ?? null),
      applicant: has("applicant")
        ? cleanText(input.applicant, LIMIT.people)
        : (base?.applicant ?? ""),
      agent: has("agent") ? cleanText(input.agent, LIMIT.people) : (base?.agent ?? ""),
      agent_contact_id: has("agent_contact_id")
        ? this.#contact(input.agent_contact_id)
        : (base?.agent_contact_id ?? null),
      filed_as_startup: flag as Flag,
      fee_paid: has("fee_paid") ? this.#fee(input.fee_paid) : (base?.fee_paid ?? null),
      notes: has("notes") ? cleanText(input.notes, LIMIT.notes) : (base?.notes ?? ""),
    };
    const key = (mark: Pick<Mark, "name" | "class_number" | "application_number">) =>
      `${mark.name.toLowerCase()}|${mark.class_number}|${mark.application_number.toLowerCase()}`;
    if (
      this.marks.some(
        (other) => other.mark_id !== base?.mark_id && !isDead(other) && key(other) === key(fields),
      )
    )
      throw new Refused(409, "taken", SAY.taken);
    return fields;
  }

  /** Every recorded step on or after the application, and each answer after its notice. */
  #checkSteps(mark: Mark): void {
    const applied = mark.applied_on;
    for (const [field, value] of Object.entries(mark.steps)) {
      if (typeof value !== "string" || !isDay(value) || field === "expires_on") continue;
      if (applied && value < applied) throw new Refused(400, "invalid", SAY.beforeApplied);
    }
    for (const step of Object.values(STEPS)) {
      if (!step.after) continue;
      const later = mark.steps[step.field];
      const earlier = mark.steps[step.after];
      if (typeof later === "string" && typeof earlier === "string" && later < earlier)
        throw new Refused(400, "invalid", SAY.order);
    }
  }

  // ---------------------------------------------------------------- writes

  add(input: Input, by: Staff): Mark {
    if (this.marks.length >= LIMIT.marks) throw new Refused(409, "too_many", tooMany(LIMIT.marks));
    const fields = this.#fields(input, null);
    const now = this.#core.now();
    const status = clean(input.status, 30) || (fields.application_number ? "filed" : "drafting");
    if (!(status in MARK_STATUSES)) throw new Refused(400, "invalid", SAY.status);
    const mark: Mark = {
      mark_id: this.pinned ?? randomUUID(),
      ...fields,
      status: status as MarkStatus,
      status_on: fields.applied_on,
      steps: { ...EMPTY_STEPS, expires_on: this.#day(input.expires_on, true) },
      renewals: [],
      watch: [],
      file_ids: [],
      created_at: now,
      created_by: by,
      updated_at: now,
      updated_by: by,
    };
    this.#checkSteps(mark);
    this.pinned = null;
    this.marks.push(mark);
    this.#save();
    this.log(mark, "added", "", by);
    return mark;
  }

  update(mark: Mark, input: Input, by: Staff): Mark {
    const fields = this.#fields(input, mark);
    const next: Mark = structuredClone({ ...mark, ...fields });
    if (Object.prototype.hasOwnProperty.call(input, "expires_on"))
      next.steps.expires_on = this.#day(input.expires_on, true);
    this.#checkSteps(next);
    const before = mark as unknown as Record<string, unknown>;
    const after = { ...fields, expires_on: next.steps.expires_on } as Record<string, unknown>;
    const changed = Object.keys(after).filter((key) =>
      key === "expires_on"
        ? after[key] !== mark.steps.expires_on
        : JSON.stringify(after[key]) !== JSON.stringify(before[key]),
    );
    Object.assign(mark, next);
    this.#touch(mark, by);
    this.log(
      mark,
      "changed",
      changed.length ? changed.map((key) => FIELD_WORDS[key] ?? key).join(", ") : "Nothing",
      by,
    );
    return mark;
  }

  step(mark: Mark, input: Input, by: Staff): Mark {
    const key = clean(input.step, 30);
    if (!Object.prototype.hasOwnProperty.call(STEPS, key))
      throw new Refused(400, "invalid", SAY.step);
    const step = STEPS[key as MarkStepKey];
    const on = this.#day(input.on, FUTURE_OK.has(step.field));
    if (!on) throw new Refused(400, "invalid", SAY.notADay);
    if (step.after && !mark.steps[step.after])
      throw new Refused(
        409,
        "invalid",
        step.after === "exam_report_on" ? SAY.needsReport : SAY.needsNotice,
      );
    const next = structuredClone(mark);
    (next.steps as Record<string, unknown>)[step.field] = on;
    if (step.number && Object.prototype.hasOwnProperty.call(input, "number"))
      (next.steps as Record<string, unknown>)[step.number] = clean(
        input.number,
        LIMIT.certificate_number,
      );
    if (step.status) {
      next.status = step.status;
      next.status_on = on;
    }
    this.#checkSteps(next);
    Object.assign(mark, next);
    this.#touch(mark, by);
    this.log(mark, "step", MARK_STEPS[key as MarkStepKey], by);
    return mark;
  }

  setStatus(mark: Mark, input: Input, by: Staff): Mark {
    const status = clean(input.status, 30);
    if (!(status in MARK_STATUSES)) throw new Refused(400, "invalid", SAY.status);
    mark.status = status as MarkStatus;
    mark.status_on = this.#day(input.on) ?? this.#core.day();
    this.#touch(mark, by);
    this.log(mark, "status", MARK_STATUSES[status as MarkStatus], by);
    return mark;
  }

  renewed(mark: Mark, input: Input, expiryNow: string | null, by: Staff): Mark {
    const renewedOn = this.#day(input.renewed_on) ?? this.#core.day();
    const expiresOn = this.#day(input.expires_on, true);
    if (!expiresOn) throw new Refused(400, "invalid", SAY.noExpiry);
    if (expiryNow && expiresOn <= expiryNow) throw new Refused(400, "invalid", SAY.expiresBefore);
    mark.renewals.push({
      renewed_on: renewedOn,
      expires_on: expiresOn,
      srn: clean(input.srn, LIMIT.srn),
      by,
      at: this.#core.now(),
    });
    if (mark.status === "removed" || mark.status === "registered") {
      mark.status = "registered";
      mark.status_on = renewedOn;
    }
    this.#touch(mark, by);
    this.log(mark, "renewed", "", by);
    return mark;
  }

  watch(mark: Mark, input: Input, by: Staff): Mark {
    const text = cleanText(input.text, LIMIT.watch);
    if (text.length < LIMIT.watch_min) throw new Refused(400, "invalid", SAY.watch);
    if (mark.watch.length >= LIMIT.watch_notes)
      throw new Refused(409, "too_many", tooMany(LIMIT.watch_notes));
    mark.watch.unshift({
      note_id: randomUUID(),
      on: this.#day(input.on) ?? this.#core.day(),
      text,
      by,
      at: this.#core.now(),
    });
    this.#touch(mark, by);
    this.log(mark, "watch note", "", by);
    return mark;
  }

  attach(mark: Mark, fileId: string, by: Staff): Mark {
    if (mark.file_ids.includes(fileId)) return mark;
    if (mark.file_ids.length >= LIMIT.files) throw new Refused(409, "too_many", SAY.tooManyFiles);
    mark.file_ids.push(fileId);
    this.#touch(mark, by);
    this.log(mark, "file attached", "", by);
    return mark;
  }

  detach(mark: Mark, fileId: string, by: Staff): Mark {
    if (!mark.file_ids.includes(fileId)) throw new Refused(404, "not_found", SAY.file);
    mark.file_ids = mark.file_ids.filter((id) => id !== fileId);
    this.#touch(mark, by);
    this.log(mark, "file detached", "", by);
    return mark;
  }
}
