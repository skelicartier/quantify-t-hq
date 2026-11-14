/**
 * Meetings, kept whole in `meetings/meetings.json` (rewritten on every change) with one
 * line per change in `meetings/events.jsonl`. Every write checks its input here; the lock
 * is here too: once the minutes are signed, the meeting refuses every change but the
 * MGT-14 choice, a note after signing and a first signed copy.
 */

import { randomUUID } from "node:crypto";

import { Refused } from "../../mail-merge/engine";
import type { DataCore } from "../core";
import { cleanText, isDay } from "../guard";
import type { Staff } from "../protocol";
import {
  ATTENDEE_ROLES,
  ATTENDING,
  MEETING_KINDS,
  MEETING_MODES,
  MGT14_CHOICES,
  RESOLUTION_OUTCOMES,
  dayWords,
  isGeneral,
} from "../../../src/lib/data/labels-registers";
import { MEETING_LIMITS, MEETING_TOTAL } from "./limits";
import { meetingDay, serials, titleOf } from "./rules";
import type { Attendee, Meeting, MeetingKind, MeetingsEvent, Resolution } from "./types";

const MEETINGS = "meetings/meetings.json";
const EVENTS = "meetings/events.jsonl";

type Input = Record<string, unknown>;

export const CHOOSE = "Choose from the list.";
export const FUTURE = "That day is in the future.";
export const NOT_A_DAY = "That is not a day.";
export const LOCKED =
  "These minutes are signed, so the meeting cannot change. Add a note after signing instead.";

const has = (input: Input, name: string) => Object.prototype.hasOwnProperty.call(input, name);
const isKey = <T extends object>(table: T, value: unknown): value is keyof T =>
  typeof value === "string" && Object.prototype.hasOwnProperty.call(table, value);
const flag = (value: unknown): boolean => value === true || value === "true" || value === "on";

/** A director in office on a day, as the company record gives them. */
export type Director = { director_id: string; name: string; is_founder: boolean };

/** What a write needs besides its input: today, and the directors when the company is here. */
export type Env = {
  today: string;
  /** Directors in office on a day; null when the company record is not here. */
  directorsOn(day: string): Director[] | null;
};

export function defaultMgt14(kind: Resolution["kind"], s179: boolean): Resolution["mgt14"] {
  if (kind === "special") return "needed";
  if (kind === "board" && s179) return "ask";
  return "not_needed";
}

export class MeetingsBook {
  readonly #core: DataCore;
  meetings: Meeting[];
  events: MeetingsEvent[];
  /** Under test routes, the next meeting made takes this id. */
  pinned: string | null = null;

  constructor(core: DataCore) {
    this.#core = core;
    core.store.ensureDir("meetings");
    const stored = core.store.readJson<{ meetings?: Meeting[] }>(MEETINGS, {});
    this.meetings = Array.isArray(stored.meetings)
      ? stored.meetings.filter(
          (meeting) =>
            typeof meeting?.meeting_id === "string" &&
            isKey(MEETING_KINDS, meeting.kind) &&
            isDay(meeting.scheduled_on),
        )
      : [];
    this.events = core.store
      .readLines<MeetingsEvent>(EVENTS)
      .filter((event) => typeof event?.event_id === "string");
  }

  // ---------------------------------------------------------------- files

  save(): void {
    this.#core.store.writeJson(MEETINGS, { format: 1, meetings: this.meetings });
  }

  event(meeting: Meeting, verb: string, detail: string, by: Staff): void {
    const event: MeetingsEvent = {
      event_id: randomUUID(),
      meeting_id: meeting.meeting_id,
      verb,
      detail,
      by,
      at: this.#core.now(),
    };
    this.events.push(event);
    this.#core.store.appendLine(EVENTS, event);
  }

  eventsOf(meetingId: string): MeetingsEvent[] {
    return this.events
      .filter((event) => event.meeting_id === meetingId)
      .reverse()
      .sort((a, b) => b.at.localeCompare(a.at));
  }

  #touch(meeting: Meeting, by: Staff): void {
    meeting.updated_at = this.#core.now();
    meeting.updated_by = by;
  }

  // ---------------------------------------------------------------- lookups

  get(id: string | undefined): Meeting {
    const meeting = id ? this.meetings.find((item) => item.meeting_id === id) : undefined;
    if (!meeting) throw new Refused(404, "not_found", "That meeting is not here.");
    return meeting;
  }

  resolution(meeting: Meeting, id: string | undefined): Resolution {
    const found = id ? meeting.resolutions.find((item) => item.resolution_id === id) : undefined;
    if (!found) throw new Refused(404, "not_found", "That resolution is not on this meeting.");
    return found;
  }

  /** The serial title of one meeting, worked out against every meeting. */
  title(meeting: Meeting): string {
    return titleOf(meeting, serials(this.meetings));
  }

  titles(): Map<string, string> {
    const numbers = serials(this.meetings);
    return new Map(this.meetings.map((meeting) => [meeting.meeting_id, titleOf(meeting, numbers)]));
  }

  // ---------------------------------------------------------------- the checks

  #unlocked(meeting: Meeting): void {
    if (meeting.minutes.signed) throw new Refused(409, "minutes_signed", LOCKED);
  }

  #held(meeting: Meeting): string {
    if (meeting.kind === "circular")
      throw new Refused(409, "circular", "A resolution by circulation has no minutes.");
    if (meeting.state !== "held" || !meeting.held_on)
      throw new Refused(409, "not_held", "Record how the meeting went first.");
    return meeting.held_on;
  }

  #day(value: unknown, today: string, past: boolean): string {
    if (!isDay(value)) throw new Refused(400, "invalid", NOT_A_DAY);
    if (past && value > today) throw new Refused(400, "invalid", FUTURE);
    return value;
  }

  #time(value: unknown): string {
    const time = typeof value === "string" ? value.trim() : "";
    if (time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(time))
      throw new Refused(400, "invalid", "Type the time as 11:00.");
    return time;
  }

  /** The board's size, typed only when the company record has no directors on that day. */
  #boardSize(value: unknown, day: string, env: Env): number | null {
    const directors = env.directorsOn(day);
    if (directors && directors.length > 0) return null;
    if (value === undefined || value === null || value === "") return null;
    const size = typeof value === "number" ? value : Number(String(value).trim());
    if (
      !Number.isInteger(size) ||
      size < MEETING_LIMITS.board_min ||
      size > MEETING_LIMITS.board_max
    )
      throw new Refused(400, "invalid", "Type how many directors the board had that day.");
    return size;
  }

  // ---------------------------------------------------------------- plan, change, cancel

  plan(input: Input, by: Staff, env: Env): Meeting {
    if (this.meetings.length >= MEETING_TOTAL)
      throw new Refused(
        409,
        "too_many",
        `Data holds ${MEETING_TOTAL.toLocaleString("en")} at most.`,
      );
    if (!isKey(MEETING_KINDS, input.kind)) throw new Refused(400, "invalid", CHOOSE);
    const kind = input.kind as MeetingKind;
    const mode = input.mode === undefined || input.mode === "" ? "in_person" : input.mode;
    if (!isKey(MEETING_MODES, mode)) throw new Refused(400, "invalid", CHOOSE);
    const held = flag(input.held) || kind === "circular";
    const day = this.#day(input.scheduled_on, env.today, held);
    const at = this.#core.now();
    const meeting: Meeting = {
      meeting_id: this.pinned ?? randomUUID(),
      kind,
      title: cleanText(input.title, MEETING_LIMITS.title),
      scheduled_on: day,
      time: this.#time(input.time),
      place: cleanText(input.place, MEETING_LIMITS.place),
      mode,
      agenda: cleanText(input.agenda, MEETING_LIMITS.agenda),
      notice: { sent_on: null, shorter_reason: "" },
      state: held ? "held" : "planned",
      held_on: held ? day : null,
      chair: "",
      board_size: kind === "board" ? this.#boardSize(input.board_size, day, env) : null,
      attendees: [],
      quorum_present: null,
      resolutions: [],
      minutes: {
        text: "",
        draft_sent_on: null,
        comments_closed_on: null,
        comments: "",
        signed: null,
        later_notes: [],
      },
      cancelled: null,
      created_at: at,
      created_by: by,
      updated_at: at,
      updated_by: by,
    };
    if (this.meetings.some((item) => item.meeting_id === meeting.meeting_id))
      throw new Refused(409, "taken", "That meeting is already here.");
    this.pinned = null;
    this.meetings.push(meeting);
    this.save();
    this.event(meeting, held ? "recorded" : "planned", dayWords(day), by);
    return meeting;
  }

  update(meeting: Meeting, input: Input, by: Staff, env: Env): Meeting {
    this.#unlocked(meeting);
    if (meeting.state === "cancelled")
      throw new Refused(409, "cancelled", "This meeting was cancelled.");
    const changed: string[] = [];
    if (has(input, "kind") && input.kind !== meeting.kind) {
      if (!isKey(MEETING_KINDS, input.kind)) throw new Refused(400, "invalid", CHOOSE);
      if (meeting.state !== "planned" || input.kind === "circular" || meeting.kind === "circular")
        throw new Refused(409, "not_planned", "Only a planned meeting can change its kind.");
      meeting.kind = input.kind as MeetingKind;
      changed.push("kind");
    }
    if (has(input, "title")) {
      const title = cleanText(input.title, MEETING_LIMITS.title);
      if (title !== meeting.title) changed.push("title");
      meeting.title = title;
    }
    if (has(input, "scheduled_on")) {
      const day = this.#day(input.scheduled_on, env.today, meeting.state === "held");
      if (day !== meeting.scheduled_on) {
        changed.push("day");
        meeting.scheduled_on = day;
        if (meeting.kind === "circular") meeting.held_on = day;
      }
    }
    if (has(input, "time")) {
      const time = this.#time(input.time);
      if (time !== meeting.time) changed.push("time");
      meeting.time = time;
    }
    if (has(input, "place")) {
      const place = cleanText(input.place, MEETING_LIMITS.place);
      if (place !== meeting.place) changed.push("place");
      meeting.place = place;
    }
    if (has(input, "mode")) {
      if (!isKey(MEETING_MODES, input.mode)) throw new Refused(400, "invalid", CHOOSE);
      if (input.mode !== meeting.mode) changed.push("how");
      meeting.mode = input.mode as Meeting["mode"];
    }
    if (has(input, "agenda")) {
      const agenda = cleanText(input.agenda, MEETING_LIMITS.agenda);
      if (agenda !== meeting.agenda) changed.push("agenda");
      meeting.agenda = agenda;
    }
    if (has(input, "board_size") && meeting.kind === "board") {
      const size = this.#boardSize(input.board_size, meetingDay(meeting), env);
      if (size !== meeting.board_size) changed.push("board size");
      meeting.board_size = size;
    }
    if (meeting.kind !== "board") meeting.board_size = null;
    this.#touch(meeting, by);
    this.save();
    if (changed.length) this.event(meeting, "changed", changed.join(", "), by);
    return meeting;
  }

  notice(meeting: Meeting, input: Input, by: Staff, env: Env): Meeting {
    this.#unlocked(meeting);
    if (meeting.kind === "circular")
      throw new Refused(409, "circular", "A resolution by circulation has no notice.");
    if (meeting.state === "cancelled")
      throw new Refused(409, "cancelled", "This meeting was cancelled.");
    const sent = this.#day(input.sent_on, env.today, true);
    if (sent > meetingDay(meeting))
      throw new Refused(400, "invalid", "The notice cannot go after the meeting.");
    meeting.notice = {
      sent_on: sent,
      shorter_reason: cleanText(input.shorter_reason, MEETING_LIMITS.shorter_reason),
    };
    this.#touch(meeting, by);
    this.save();
    this.event(meeting, "notice", `Sent ${dayWords(sent)}`, by);
    return meeting;
  }

  /** Who was there, read and checked: at most 40, each director in office on the day. */
  #attendees(value: unknown, day: string, env: Env): Attendee[] {
    const rows = Array.isArray(value) ? value : [];
    if (rows.length > MEETING_LIMITS.attendees)
      throw new Refused(400, "invalid", `Record at most ${MEETING_LIMITS.attendees} people.`);
    const directors = env.directorsOn(day);
    return rows.map((row) => {
      const record = row && typeof row === "object" ? (row as Input) : {};
      const role = record.role ?? "director";
      const how = record.how === undefined || record.how === "" ? "in_person" : record.how;
      if (!isKey(ATTENDEE_ROLES, role) || !isKey(ATTENDING, how))
        throw new Refused(400, "invalid", CHOOSE);
      let name = cleanText(record.name, MEETING_LIMITS.attendee_name);
      let directorId: string | null = null;
      const asked = typeof record.director_id === "string" ? record.director_id.trim() : "";
      if (asked && directors) {
        const found = directors.find((director) => director.director_id === asked);
        if (!found)
          throw new Refused(
            400,
            "invalid",
            `${name || "That person"} was not a director on ${dayWords(day)}.`,
          );
        directorId = found.director_id;
        name = name || found.name;
      }
      if (!name) throw new Refused(400, "invalid", "Give each person's name.");
      return {
        attendee_id: randomUUID(),
        name,
        role: role as Attendee["role"],
        director_id: directorId,
        how: how as Attendee["how"],
      };
    });
  }

  /** Records how it went; asked again before signing, it corrects the record. */
  held(meeting: Meeting, input: Input, by: Staff, env: Env): { meeting: Meeting; moved: boolean } {
    this.#unlocked(meeting);
    if (meeting.state === "cancelled")
      throw new Refused(409, "cancelled", "This meeting was cancelled.");
    if (meeting.kind === "circular")
      throw new Refused(409, "circular", "A resolution by circulation is recorded when passed.");
    const day = this.#day(input.held_on, env.today, true);
    const attendees = this.#attendees(input.attendees, day, env);
    const moved = meeting.held_on !== null && meeting.held_on !== day;
    meeting.state = "held";
    meeting.held_on = day;
    meeting.chair = cleanText(input.chair, MEETING_LIMITS.chair);
    meeting.attendees = attendees;
    meeting.quorum_present = isGeneral(meeting.kind)
      ? input.quorum_present === undefined || input.quorum_present === null
        ? null
        : flag(input.quorum_present)
      : null;
    this.#touch(meeting, by);
    this.save();
    this.event(
      meeting,
      "held",
      `${dayWords(day)} · ${attendees.length} ${attendees.length === 1 ? "person" : "people"} there`,
      by,
    );
    return { meeting, moved };
  }

  cancel(meeting: Meeting, input: Input, by: Staff, env: Env): Meeting {
    this.#unlocked(meeting);
    if (meeting.state !== "planned")
      throw new Refused(409, "not_planned", "Only a planned meeting can be cancelled.");
    const on = input.on === undefined || input.on === "" ? env.today : input.on;
    if (!isDay(on)) throw new Refused(400, "invalid", NOT_A_DAY);
    const why = cleanText(input.why, MEETING_LIMITS.cancel_why);
    meeting.state = "cancelled";
    meeting.cancelled = { on, why };
    this.#touch(meeting, by);
    this.save();
    this.event(meeting, "cancelled", why, by);
    return meeting;
  }

  // ---------------------------------------------------------------- resolutions

  #resolutionFields(
    meeting: Meeting,
    input: Input,
    base: Resolution | null,
  ): Omit<Resolution, "resolution_id" | "number" | "noted_at"> {
    const title =
      has(input, "title") || !base
        ? cleanText(input.title, MEETING_LIMITS.resolution_title)
        : base.title;
    if (!title) throw new Refused(400, "invalid", "Give the resolution a title.");
    const text =
      has(input, "text") || !base
        ? cleanText(input.text, MEETING_LIMITS.resolution_text)
        : base.text;
    const general = isGeneral(meeting.kind);
    const kind = input.kind ?? base?.kind ?? (general ? "ordinary" : "board");
    const fits = general ? kind === "ordinary" || kind === "special" : kind === "board";
    if (!fits)
      throw new Refused(
        400,
        "invalid",
        "A board meeting passes board resolutions; members pass ordinary or special ones.",
      );
    const outcome = input.outcome ?? base?.outcome ?? "passed";
    if (!isKey(RESOLUTION_OUTCOMES, outcome)) throw new Refused(400, "invalid", CHOOSE);
    const s179 = has(input, "s179_3") ? flag(input.s179_3) : (base?.s179_3 ?? false);
    const asked = input.mgt14 === undefined || input.mgt14 === "" ? null : input.mgt14;
    if (asked !== null && !isKey(MGT14_CHOICES, asked)) throw new Refused(400, "invalid", CHOOSE);
    const mgt14 =
      (asked as Resolution["mgt14"] | null) ??
      base?.mgt14 ??
      defaultMgt14(kind as Resolution["kind"], s179);
    return {
      title,
      text,
      kind: kind as Resolution["kind"],
      outcome: outcome as Resolution["outcome"],
      s179_3: s179,
      mgt14,
    };
  }

  addResolution(meeting: Meeting, input: Input, by: Staff): Resolution {
    this.#unlocked(meeting);
    if (meeting.state !== "held")
      throw new Refused(409, "not_held", "Record how the meeting went first.");
    if (meeting.resolutions.length >= MEETING_LIMITS.resolutions)
      throw new Refused(
        409,
        "too_many",
        `A meeting holds ${MEETING_LIMITS.resolutions} resolutions at most.`,
      );
    const fields = this.#resolutionFields(meeting, input, null);
    const resolution: Resolution = {
      resolution_id: randomUUID(),
      number: Math.max(0, ...meeting.resolutions.map((item) => item.number)) + 1,
      ...fields,
      noted_at: null,
    };
    meeting.resolutions.push(resolution);
    this.#touch(meeting, by);
    this.save();
    this.event(meeting, "resolution", `${resolution.number}. ${resolution.title}`, by);
    return resolution;
  }

  updateResolution(meeting: Meeting, resolution: Resolution, input: Input, by: Staff): Resolution {
    this.#unlocked(meeting);
    const fields = this.#resolutionFields(meeting, input, resolution);
    Object.assign(resolution, fields);
    this.#touch(meeting, by);
    this.save();
    this.event(meeting, "resolution changed", `${resolution.number}. ${resolution.title}`, by);
    return resolution;
  }

  /** The MGT-14 choice: the one thing a signed meeting still takes on its resolutions. */
  setMgt14(meeting: Meeting, resolution: Resolution, value: unknown, by: Staff): Resolution {
    if (!isKey(MGT14_CHOICES, value)) throw new Refused(400, "invalid", CHOOSE);
    const before = resolution.mgt14;
    resolution.mgt14 = value as Resolution["mgt14"];
    this.#touch(meeting, by);
    this.save();
    if (before !== resolution.mgt14)
      this.event(
        meeting,
        "mgt-14",
        `${resolution.number}. ${resolution.title}: ${MGT14_CHOICES[resolution.mgt14]}`,
        by,
      );
    return resolution;
  }

  /** Circulars passed before a held board meeting and not noted yet are noted at it. */
  noteCirculars(meeting: Meeting, ids: unknown, by: Staff): Meeting {
    this.#unlocked(meeting);
    if (meeting.kind !== "board" || meeting.state !== "held")
      throw new Refused(409, "not_held", "Circulars are noted at a board meeting that was held.");
    const wanted = new Set(Array.isArray(ids) ? ids.filter((id) => typeof id === "string") : []);
    const noted: string[] = [];
    for (const circular of this.meetings)
      if (circular.kind === "circular" && circular.state === "held")
        for (const resolution of circular.resolutions)
          if (wanted.has(resolution.resolution_id) && resolution.noted_at === null) {
            if (meetingDay(circular) > (meeting.held_on ?? ""))
              throw new Refused(
                400,
                "invalid",
                "A resolution passed after the meeting cannot be noted at it.",
              );
            resolution.noted_at = meeting.meeting_id;
            noted.push(resolution.title);
            this.event(circular, "noted", this.title(meeting), by);
          }
    if (noted.length === 0)
      throw new Refused(400, "invalid", "Choose the resolutions to note at this meeting.");
    this.#touch(meeting, by);
    this.save();
    this.event(meeting, "circulars noted", noted.join(" · "), by);
    return meeting;
  }

  // ---------------------------------------------------------------- minutes

  saveMinutes(meeting: Meeting, input: Input, by: Staff): Meeting {
    this.#unlocked(meeting);
    this.#held(meeting);
    meeting.minutes.text = cleanText(input.text, MEETING_LIMITS.minutes);
    this.#touch(meeting, by);
    this.save();
    this.event(meeting, "minutes", "", by);
    return meeting;
  }

  draftSent(meeting: Meeting, input: Input, by: Staff, env: Env): Meeting {
    this.#unlocked(meeting);
    const held = this.#held(meeting);
    const on = this.#day(input.on, env.today, true);
    if (on < held) throw new Refused(400, "invalid", "The draft cannot go out before the meeting.");
    if (meeting.minutes.comments_closed_on && on > meeting.minutes.comments_closed_on)
      throw new Refused(400, "invalid", "The draft went out before comments closed.");
    meeting.minutes.draft_sent_on = on;
    this.#touch(meeting, by);
    this.save();
    this.event(meeting, "draft sent", dayWords(on), by);
    return meeting;
  }

  commentsClosed(meeting: Meeting, input: Input, by: Staff, env: Env): Meeting {
    this.#unlocked(meeting);
    const held = this.#held(meeting);
    const on = this.#day(input.on, env.today, true);
    if (on < held) throw new Refused(400, "invalid", "Comments cannot close before the meeting.");
    const draft = meeting.minutes.draft_sent_on;
    if (!draft) throw new Refused(409, "no_draft", "Mark the draft sent first.");
    if (on < draft)
      throw new Refused(400, "invalid", "Comments cannot close before the draft went out.");
    meeting.minutes.comments_closed_on = on;
    if (has(input, "comments"))
      meeting.minutes.comments = cleanText(input.comments, MEETING_LIMITS.comments);
    this.#touch(meeting, by);
    this.save();
    this.event(meeting, "comments closed", dayWords(on), by);
    return meeting;
  }

  /** The signing's day and signer, checked before any copy is kept. */
  checkSigning(meeting: Meeting, input: Input, env: Env): { on: string; by_name: string } {
    this.#unlocked(meeting);
    const held = this.#held(meeting);
    if (!isDay(input.signed_on)) throw new Refused(400, "invalid", NOT_A_DAY);
    const on = input.signed_on;
    if (on < held)
      throw new Refused(400, "invalid", "The minutes cannot be signed before the meeting.");
    if (on > env.today) throw new Refused(400, "invalid", FUTURE);
    const before = meeting.minutes.comments_closed_on ?? meeting.minutes.draft_sent_on;
    if (before && on < before)
      throw new Refused(
        400,
        "invalid",
        "The minutes cannot be signed before the draft went out and comments closed.",
      );
    const byName = cleanText(input.by_name, MEETING_LIMITS.signed_by);
    if (!byName) throw new Refused(400, "invalid", "Say who signed the minutes.");
    return { on, by_name: byName };
  }

  sign(
    meeting: Meeting,
    signing: { on: string; by_name: string },
    fileId: string | null,
    by: Staff,
  ): Meeting {
    this.#unlocked(meeting);
    meeting.minutes.signed = { ...signing, file_id: fileId, at: this.#core.now(), by };
    this.#touch(meeting, by);
    this.save();
    this.event(meeting, "signed", `${dayWords(signing.on)} by ${signing.by_name}`, by);
    return meeting;
  }

  /** The signed copy, only while none is attached. */
  attachSigned(meeting: Meeting, fileId: string, title: string, by: Staff): Meeting {
    const signed = meeting.minutes.signed;
    if (!signed) throw new Refused(409, "not_signed", "Mark the minutes signed first.");
    if (signed.file_id)
      throw new Refused(409, "minutes_signed", "The signed copy is already attached.");
    signed.file_id = fileId;
    this.#touch(meeting, by);
    this.save();
    this.event(meeting, "signed copy", title, by);
    return meeting;
  }

  checkSignedCopy(meeting: Meeting): void {
    const signed = meeting.minutes.signed;
    if (!signed) throw new Refused(409, "not_signed", "Mark the minutes signed first.");
    if (signed.file_id)
      throw new Refused(409, "minutes_signed", "The signed copy is already attached.");
  }

  laterNote(meeting: Meeting, input: Input, by: Staff): Meeting {
    if (!meeting.minutes.signed)
      throw new Refused(
        409,
        "not_signed",
        "A note after signing is for signed minutes; change the minutes instead.",
      );
    const text = cleanText(input.text, MEETING_LIMITS.later_note);
    if (!text) throw new Refused(400, "invalid", "Write the note.");
    meeting.minutes.later_notes.push({
      note_id: randomUUID(),
      text,
      at: this.#core.now(),
      by,
    });
    this.#touch(meeting, by);
    this.save();
    this.event(meeting, "later note", "", by);
    return meeting;
  }

  /** Under test routes: the walk moves a planned meeting's day into the past. */
  moveDay(meeting: Meeting, day: unknown, by: Staff): Meeting {
    if (!isDay(day)) throw new Refused(400, "invalid", NOT_A_DAY);
    if (meeting.state !== "planned")
      throw new Refused(409, "not_planned", "Only a planned meeting's day moves.");
    meeting.scheduled_on = day;
    this.#touch(meeting, by);
    this.save();
    this.event(meeting, "changed", "day", by);
    return meeting;
  }
}
