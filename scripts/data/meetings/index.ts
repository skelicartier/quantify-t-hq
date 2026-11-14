/**
 * Meetings (ws-notes/company/spec.md §7): board meetings, AGMs, EGMs and resolutions by
 * circulation; the notice and its check; who was there and the board's quorum; the
 * resolutions with their MGT-14 choice, whose filing goes into Key dates through the
 * `key-dates` service when he ticks the box; and the minutes on the Secretarial Standard 1
 * timetable, locked once signed, with the signed copy in Files and notes after signing.
 *
 * The minutes and notice steps are Due rows of kind "meeting" from seven days before their
 * day until done, and the calendar's agenda (`agenda:meetings`); meetings and resolutions
 * are searchable (`search:meetings`); the `meetings` service tells the company record, the
 * close and the register which meetings were held and which resolutions passed. This is a
 * record to keep, not legal advice: every amount comes from the rule book.
 */

import { Refused } from "../../mail-merge/engine";
import type { Answer, DataCore, DueItem } from "../core";
import {
  COMPANY_SERVICES,
  dueFrom,
  ruleOf,
  standInKeyDates,
  type CompanyLookup,
  type FromRecord,
  type KeyDateLink,
  type KeyDatesService,
  type MeetingsLookup,
  type ResolutionView,
  type RuleKey,
} from "../company-contracts";
import { addDays } from "../days";
import { clean, isDay, isRouteId, wholeNumber } from "../guard";
import {
  agendaService,
  searchService,
  type AgendaItem,
  type AgendaSource,
  type DataSearchHit,
  type SearchSource,
} from "../raise-contracts";
import { snippetOf } from "../notes/snippet";
import { findTerms, matchesTerms } from "../../../src/lib/merge/find";
import {
  MEETING_KINDS,
  MEETING_STATES,
  dayShort,
  dayWords,
  isGeneral,
} from "../../../src/lib/data/labels-registers";
import { MeetingsBook, type Director, type Env } from "./book";
import { copyGiven, fileChoices, fileLink, folderNamed, keepCopy, checkCopy } from "./copy";
import { DUE_AHEAD_DAYS, MEETINGS_PAGE, MEETING_LIMITS } from "./limits";
import {
  meetingDay,
  minutesStep,
  noticeCheck,
  noticeWarning,
  quorumOf,
  quorumSentence,
  timetable,
  type Amounts,
} from "./rules";
import type { Meeting, Resolution } from "./types";

const MINUTES_FOLDER = [folderNamed("meetings", "02 Board and shareholder meetings")];
const NOT_IN_KEY_DATES = "Key dates is not set up here yet, so this date is not in it.";
const S179 =
  "A matter under section 179(3) cannot be passed by circulation; it needs a board meeting. Confirm with your CS.";

const flag = (value: unknown): boolean => value === true || value === "true" || value === "on";
const isOpen = (link: KeyDateLink) => link.state === "coming_up" || link.state === "in_progress";
const offsetOf = (value: string | null) => Math.min(200_000, Math.max(0, wholeNumber(value, 0)));

export const originOf = (resolutionId: string): string => `meetings:${resolutionId}`;
export const meetingHref = (id: string): string => `/data/company/meetings/${id}`;

/** The fake company the tests install: directors with the days they were in office. */
type FakeDirector = Director & { appointed_on: string | null; ceased_on: string | null };

export async function register(core: DataCore): Promise<void> {
  const book = new MeetingsBook(core);

  const company = () => core.need<CompanyLookup>(COMPANY_SERVICES.company);
  const keyDates = () => core.need<KeyDatesService>(COMPANY_SERVICES.keyDates);

  const env = (): Env => ({
    today: core.day(),
    directorsOn: (day) => {
      const record = company();
      if (!record) return null;
      try {
        return record.directorsOn(day);
      } catch {
        return null;
      }
    },
  });

  /** His amount for a rule when Key dates is here, else the rule's own. */
  const amounts: Amounts = (key: RuleKey) => {
    try {
      const service = keyDates();
      if (service) return service.rule(key).amount;
    } catch {
      // the rule's own amount below
    }
    return ruleOf(key).amount;
  };

  /** The board's size on a meeting's day: the company's directors, or the size he typed. */
  const boardOn = (meeting: Meeting, now: Env): number | null => {
    const directors = now.directorsOn(meetingDay(meeting));
    return directors && directors.length > 0 ? directors.length : meeting.board_size;
  };

  function warningsOf(meeting: Meeting, now: Env): string[] {
    const warnings: string[] = [];
    const notice = noticeWarning(noticeCheck(meeting, amounts), meeting.notice.shorter_reason);
    if (notice) warnings.push(notice);
    const size = boardOn(meeting, now);
    const quorum = quorumOf(meeting, size, amounts);
    if (quorum && size === 1)
      warnings.push(
        `The board has one director, and a board meeting needs ${quorum.needed === 2 ? "two" : quorum.needed}.`,
      );
    if (quorum && !quorum.met) warnings.push(`Quorum was not met. ${quorumSentence(quorum)}`);
    if (isGeneral(meeting.kind) && meeting.state === "held" && meeting.quorum_present === false)
      warnings.push("Quorum was not present.");
    if (meeting.state === "held" && meeting.chair && meeting.kind !== "circular") {
      const there = meeting.attendees.some(
        (person) => person.name.toLowerCase() === meeting.chair.toLowerCase(),
      );
      if (!there) warnings.push(`${meeting.chair}, named as chair, is not among those there.`);
    }
    if (meeting.kind === "circular" && meeting.resolutions.some((item) => item.s179_3))
      warnings.push(S179);
    return warnings;
  }

  const rowOf = (meeting: Meeting, titles: Map<string, string>, now: Env) => ({
    meeting_id: meeting.meeting_id,
    kind: meeting.kind,
    title: meeting.title,
    scheduled_on: meeting.scheduled_on,
    time: meeting.time,
    place: meeting.place,
    mode: meeting.mode,
    state: meeting.state,
    held_on: meeting.held_on,
    signed_on: meeting.minutes.signed?.on ?? null,
    cancelled: meeting.cancelled,
    quorum_present: meeting.quorum_present,
    serial_title: titles.get(meeting.meeting_id) ?? "",
    notice_check: noticeCheck(meeting, amounts),
    quorum: quorumOf(meeting, boardOn(meeting, now), amounts),
    minutes_step: minutesStep(meeting, amounts),
    resolutions: meeting.resolutions.length,
  });

  /** What another module sees of a resolution. */
  const viewOf = (meeting: Meeting, resolution: Resolution, title: string): ResolutionView => ({
    resolution_id: resolution.resolution_id,
    meeting_id: meeting.meeting_id,
    meeting_kind: meeting.kind,
    passed_on: meetingDay(meeting),
    meeting_title: title,
    title: resolution.title,
    kind: resolution.kind,
    href: `${meetingHref(meeting.meeting_id)}#resolution-${resolution.resolution_id}`,
  });

  const passedViews = (): ResolutionView[] => {
    const titles = book.titles();
    return book.meetings
      .filter((meeting) => meeting.state === "held")
      .flatMap((meeting) =>
        meeting.resolutions
          .filter((resolution) => resolution.outcome === "passed")
          .map((resolution) => viewOf(meeting, resolution, titles.get(meeting.meeting_id) ?? "")),
      )
      .sort(
        (a, b) =>
          b.passed_on.localeCompare(a.passed_on) || a.meeting_title.localeCompare(b.meeting_title),
      );
  };

  // ---------------------------------------------------------------- MGT-14 through Key dates

  const mgt14By = (meeting: Meeting): string => {
    const day = meetingDay(meeting);
    try {
      const service = keyDates();
      if (service) return service.dueOn("mgt-14", day) ?? day;
    } catch {
      // the rule's own amount below
    }
    return dueFrom(ruleOf("mgt-14"), day) ?? day;
  };

  const mgt14Item = (meeting: Meeting, resolution: Resolution): FromRecord => ({
    origin: {
      key: originOf(resolution.resolution_id),
      label: `Resolution “${resolution.title}”, ${book.title(meeting)}`,
      href: `${meetingHref(meeting.meeting_id)}#resolution-${resolution.resolution_id}`,
    },
    rule_key: "mgt-14",
    base_on: meetingDay(meeting),
    title: `MGT-14: “${resolution.title}”`,
    kind: "filing",
    owner_role: "cs",
  });

  /**
   * After a resolution changed: a passed one needing MGT-14 adds its date when the box was
   * ticked; one moved off "passed" or off "needed" takes its open date back. Null without
   * Key dates.
   */
  function syncMgt14(
    meeting: Meeting,
    resolution: Resolution,
    add: boolean,
    by: { staff_id: string; name: string },
  ): KeyDateLink[] | null {
    const service = keyDates();
    if (!service) return null;
    const origin = originOf(resolution.resolution_id);
    const wanted =
      meeting.state === "held" && resolution.outcome === "passed" && resolution.mgt14 === "needed";
    if (wanted && add) return service.add([mgt14Item(meeting, resolution)], by);
    if (!wanted && service.linksFor(origin).some(isOpen))
      return service.takeBack(origin, `The resolution was changed on ${dayWords(core.day())}.`, by);
    return service.linksFor(origin);
  }

  const keyDatesOf = (meeting: Meeting): Record<string, KeyDateLink[]> | null => {
    const service = keyDates();
    if (!service) return null;
    return Object.fromEntries(
      meeting.resolutions.map((resolution) => [
        resolution.resolution_id,
        service.linksFor(originOf(resolution.resolution_id)),
      ]),
    );
  };

  // ---------------------------------------------------------------- the answers

  const detailOf = (meeting: Meeting): Answer => {
    const now = env();
    const titles = book.titles();
    const day = meetingDay(meeting);
    const directors = now.directorsOn(day);
    const circulars =
      meeting.kind === "board" && meeting.state === "held"
        ? book.meetings
            .filter(
              (item) =>
                item.kind === "circular" && item.state === "held" && meetingDay(item) <= day,
            )
            .flatMap((item) =>
              item.resolutions
                .filter((resolution) => resolution.outcome === "passed" && !resolution.noted_at)
                .map((resolution) => viewOf(item, resolution, titles.get(item.meeting_id) ?? "")),
            )
        : [];
    const quorum = quorumOf(meeting, boardOn(meeting, now), amounts);
    return {
      meeting,
      serial_title: titles.get(meeting.meeting_id) ?? "",
      warnings: warningsOf(meeting, now),
      notice_check: noticeCheck(meeting, amounts),
      quorum,
      quorum_sentence: quorum ? quorumSentence(quorum) : "",
      board_size: boardOn(meeting, now),
      timetable: timetable(meeting, amounts),
      minutes_step: minutesStep(meeting, amounts),
      key_dates: keyDatesOf(meeting),
      key_dates_note: keyDates() ? "" : NOT_IN_KEY_DATES,
      mgt14_by: Object.fromEntries(
        meeting.resolutions
          .filter((item) => item.outcome === "passed" && item.mgt14 === "needed")
          .map((item) => [item.resolution_id, mgt14By(meeting)]),
      ),
      directors: directors
        ? directors.map(({ director_id, name }) => ({ director_id, name }))
        : null,
      circulars_to_note: circulars,
      noted_at: Object.fromEntries(
        meeting.resolutions
          .filter((item) => item.noted_at)
          .map((item) => [item.resolution_id, titles.get(item.noted_at ?? "") ?? ""]),
      ),
      signed_file: fileLink(core, meeting.minutes.signed?.file_id ?? null),
      files: fileChoices(core),
      files_here: core.need("files") !== null,
      events: book.eventsOf(meeting.meeting_id),
      today: now.today,
    };
  };

  const meetingAnswer = (meeting: Meeting, warnings = false): Answer =>
    warnings ? { meeting, warnings: warningsOf(meeting, env()) } : { meeting };

  // ---------------------------------------------------------------- Due and the agenda

  type Step = {
    part: "notice" | "record" | "draft" | "comments" | "signed";
    on: string;
    title: string;
    sub: string;
  };

  /** Every open notice, record and minutes step of a meeting, with its day. */
  function stepsOf(meeting: Meeting, title: string, today: string): Step[] {
    const steps: Step[] = [];
    if (meeting.state === "planned") {
      const check = noticeCheck(meeting, amounts);
      if (check && !check.sent_on)
        steps.push({
          part: "notice",
          on: check.send_by,
          title: `Send the notice: ${title}`,
          sub: check.clear
            ? `At least ${check.needed} clear days before (general meeting)`
            : `At least ${check.needed} days before (board)`,
        });
      if (meeting.scheduled_on < today)
        steps.push({
          part: "record",
          on: meeting.scheduled_on,
          title: `Record how ${title} went`,
          sub: `Planned for ${dayShort(meeting.scheduled_on)}`,
        });
    }
    if (meeting.state === "held" && !meeting.minutes.signed)
      for (const row of timetable(meeting, amounts)) {
        if (row.done_on) continue;
        if (row.step === "draft")
          steps.push({
            part: "draft",
            on: row.by,
            title: `Send the draft minutes: ${title}`,
            sub: `Within ${amounts("minutes-draft") ?? 15} days of the meeting (Secretarial Standard 1)`,
          });
        if (row.step === "comments" && meeting.minutes.draft_sent_on)
          steps.push({
            part: "comments",
            on: row.by,
            title: `Close comments on the minutes: ${title}`,
            sub: `${amounts("minutes-comments") ?? 7} days after the draft went out`,
          });
        if (row.step === "signed")
          steps.push({
            part: "signed",
            on: row.by,
            title: `Sign the minutes: ${title}`,
            sub: `Within ${amounts("minutes-signed") ?? 30} days of the meeting`,
          });
      }
    return steps;
  }

  core.provideDue((): DueItem[] => {
    const today = core.day();
    const horizon = addDays(today, DUE_AHEAD_DAYS);
    const titles = book.titles();
    return book.meetings.flatMap((meeting) =>
      stepsOf(meeting, titles.get(meeting.meeting_id) ?? "", today)
        .filter((step) => step.on <= horizon)
        .map((step) => ({
          key: `meeting:${meeting.meeting_id}:${step.part}`,
          kind: "meeting" as const,
          title: step.title,
          sub: step.sub,
          due_on: step.on,
          href: meetingHref(meeting.meeting_id),
        })),
    );
  });

  const agenda: AgendaSource = {
    agenda: (today) => {
      const titles = book.titles();
      const items: AgendaItem[] = [];
      for (const meeting of book.meetings) {
        const title = titles.get(meeting.meeting_id) ?? "";
        if (meeting.state === "planned")
          items.push({
            key: `meeting:${meeting.meeting_id}`,
            kind: "meeting",
            title,
            plain: "Company meeting",
            sub: meeting.place,
            on: meeting.scheduled_on,
            remind_days: [7, 0],
            href: meetingHref(meeting.meeting_id),
          });
        for (const step of stepsOf(meeting, title, today))
          if (step.part !== "record")
            items.push({
              key: `meeting:${meeting.meeting_id}:${step.part}`,
              kind: "meeting",
              title: step.title,
              plain: step.part === "notice" ? "Notice due" : "Minutes due",
              sub: step.sub,
              on: step.on,
              remind_days: [0],
              href: meetingHref(meeting.meeting_id),
            });
      }
      return items.sort((a, b) => a.on.localeCompare(b.on) || a.title.localeCompare(b.title));
    },
  };
  core.provide(agendaService("meetings"), agenda);

  // ---------------------------------------------------------------- search

  const search: SearchSource = {
    search: ({ terms, kind, limit }) => {
      if (terms.length === 0 || (kind !== null && kind !== "meeting")) return [];
      const titles = book.titles();
      const live = book.meetings
        .filter((meeting) => meeting.state !== "cancelled")
        .sort((a, b) => meetingDay(b).localeCompare(meetingDay(a)));
      const hits: DataSearchHit[] = [];
      const best: DataSearchHit[] = [];
      for (const meeting of live) {
        const title = titles.get(meeting.meeting_id) ?? "";
        const texts = [
          title,
          meeting.agenda,
          meeting.place,
          ...meeting.attendees.map((p) => p.name),
        ];
        if (matchesTerms(texts, terms))
          (matchesTerms([title], terms) ? best : hits).push({
            kind: "meeting",
            id: meeting.meeting_id,
            title,
            subtitle: `${MEETING_STATES[meeting.state].label} · ${dayWords(meetingDay(meeting))}`,
            snippet: snippetOf(meeting.agenda, terms),
            href: meetingHref(meeting.meeting_id),
          });
        for (const resolution of meeting.resolutions)
          if (matchesTerms([resolution.title, resolution.text], terms))
            (matchesTerms([resolution.title], terms) ? best : hits).push({
              kind: "meeting",
              id: resolution.resolution_id,
              title: resolution.title,
              subtitle: `Resolution · ${title}`,
              snippet: snippetOf(resolution.text, terms),
              href: `${meetingHref(meeting.meeting_id)}#resolution-${resolution.resolution_id}`,
            });
      }
      const found = [...best, ...hits];
      if (found.length === 0) return [];
      return [{ kind: "meeting", count: found.length, hits: found.slice(0, Math.max(0, limit)) }];
    },
  };
  core.provide(searchService("meetings"), search);

  // ---------------------------------------------------------------- the service

  const lookup: MeetingsLookup = {
    held: (kind) => {
      const titles = book.titles();
      return book.meetings
        .filter((meeting) => meeting.state === "held" && (!kind || meeting.kind === kind))
        .map((meeting) => ({
          meeting_id: meeting.meeting_id,
          kind: meeting.kind,
          held_on: meetingDay(meeting),
          title: titles.get(meeting.meeting_id) ?? "",
          href: meetingHref(meeting.meeting_id),
        }))
        .sort((a, b) => b.held_on.localeCompare(a.held_on) || a.title.localeCompare(b.title));
    },
    passed: (kind) => passedViews().filter((view) => !kind || view.kind === kind),
    resolution: (resolutionId) => {
      for (const meeting of book.meetings)
        for (const resolution of meeting.resolutions)
          if (resolution.resolution_id === resolutionId)
            return viewOf(meeting, resolution, book.title(meeting));
      return null;
    },
    usedFor: (fileId) => {
      const titles = book.titles();
      return book.meetings
        .filter((meeting) => meeting.minutes.signed?.file_id === fileId)
        .map((meeting) => ({
          label: `Signed minutes of ${titles.get(meeting.meeting_id) ?? ""}`,
          href: meetingHref(meeting.meeting_id),
        }));
    },
  };
  core.provide(COMPANY_SERVICES.meetings, lookup);

  // ---------------------------------------------------------------- routes

  core.route("GET", "/data/meetings", (ctx) => {
    const now = env();
    const titles = book.titles();
    const kind = clean(ctx.query.get("kind"), 20);
    const state = clean(ctx.query.get("state"), 20);
    const offset = offsetOf(ctx.query.get("offset"));
    const counts: Record<string, number> = { all: book.meetings.length };
    for (const key of Object.keys(MEETING_KINDS)) counts[key] = 0;
    for (const meeting of book.meetings) counts[meeting.kind] = (counts[meeting.kind] ?? 0) + 1;
    const chosen = book.meetings
      .filter(
        (meeting) =>
          (!(kind in MEETING_KINDS) || meeting.kind === kind) &&
          (!(state in MEETING_STATES) || meeting.state === state),
      )
      .sort(
        (a, b) =>
          meetingDay(b).localeCompare(meetingDay(a)) || b.created_at.localeCompare(a.created_at),
      );
    const directors = now.directorsOn(now.today);
    return {
      meetings: chosen.slice(offset, offset + MEETINGS_PAGE).map((m) => rowOf(m, titles, now)),
      total: chosen.length,
      offset,
      limit: MEETINGS_PAGE,
      counts,
      held: book.meetings.filter((meeting) => meeting.state === "held").length,
      directors: directors
        ? directors.map(({ director_id, name }) => ({ director_id, name }))
        : null,
      today: now.today,
    };
  });

  core.route("POST", "/data/meetings", (ctx) => {
    const by = ctx.staff();
    const now = env();
    const circular = ctx.body.kind === "circular";
    const asked =
      circular && ctx.body.resolution && typeof ctx.body.resolution === "object"
        ? (ctx.body.resolution as Record<string, unknown>)
        : null;
    // A resolution by circulation comes with its resolution: checked before anything is kept.
    if (asked && !clean(asked.title, MEETING_LIMITS.resolution_title))
      throw new Refused(400, "invalid", "Give the resolution a title.");
    const meeting = book.plan(ctx.body, by, now);
    let keyDatesAnswer: KeyDateLink[] | null = null;
    if (asked) {
      const resolution = book.addResolution(meeting, { ...asked, kind: "board" }, by);
      keyDatesAnswer = syncMgt14(meeting, resolution, flag(asked.add_date), by);
    }
    return {
      meeting,
      serial_title: book.title(meeting),
      notice_check: noticeCheck(meeting, amounts),
      warnings: warningsOf(meeting, now),
      key_dates: keyDatesAnswer,
    };
  });

  core.route("GET", "/data/meetings/:id", (ctx) => detailOf(book.get(ctx.params[0])));

  core.route("POST", "/data/meetings/:id/update", (ctx) => {
    const by = ctx.staff();
    const meeting = book.get(ctx.params[0]);
    const before = meetingDay(meeting);
    book.update(meeting, ctx.body, by, env());
    if (meetingDay(meeting) !== before) rebase(meeting, by);
    return meetingAnswer(meeting);
  });

  core.route("POST", "/data/meetings/:id/notice", (ctx) => {
    const by = ctx.staff();
    return meetingAnswer(book.notice(book.get(ctx.params[0]), ctx.body, by, env()), true);
  });

  /** The meeting's day moved: its MGT-14 dates are worked out again from the new day. */
  function rebase(meeting: Meeting, by: { staff_id: string; name: string }): void {
    const service = keyDates();
    if (!service) return;
    for (const resolution of meeting.resolutions) {
      const origin = originOf(resolution.resolution_id);
      if (service.linksFor(origin).length) service.rebase(origin, meetingDay(meeting), by);
    }
  }

  core.route("POST", "/data/meetings/:id/held", (ctx) => {
    const by = ctx.staff();
    const { meeting, moved } = book.held(book.get(ctx.params[0]), ctx.body, by, env());
    if (moved) rebase(meeting, by);
    return meetingAnswer(meeting, true);
  });

  core.route("POST", "/data/meetings/:id/cancel", (ctx) => {
    const by = ctx.staff();
    return meetingAnswer(book.cancel(book.get(ctx.params[0]), ctx.body, by, env()));
  });

  core.route("POST", "/data/meetings/:id/resolutions", (ctx) => {
    const by = ctx.staff();
    const meeting = book.get(ctx.params[0]);
    const resolution = book.addResolution(meeting, ctx.body, by);
    return { meeting, key_dates: syncMgt14(meeting, resolution, flag(ctx.body.add_date), by) };
  });

  core.route("POST", "/data/meetings/:id/resolutions/:rid/update", (ctx) => {
    const by = ctx.staff();
    const meeting = book.get(ctx.params[0]);
    const resolution = book.updateResolution(
      meeting,
      book.resolution(meeting, ctx.params[1]),
      ctx.body,
      by,
    );
    return { meeting, key_dates: syncMgt14(meeting, resolution, flag(ctx.body.add_date), by) };
  });

  core.route("POST", "/data/meetings/:id/resolutions/:rid/mgt-14", (ctx) => {
    const by = ctx.staff();
    const meeting = book.get(ctx.params[0]);
    const resolution = book.setMgt14(
      meeting,
      book.resolution(meeting, ctx.params[1]),
      ctx.body.mgt14,
      by,
    );
    return { meeting, key_dates: syncMgt14(meeting, resolution, flag(ctx.body.add_date), by) };
  });

  core.route("POST", "/data/meetings/:id/minutes", (ctx) => {
    const by = ctx.staff();
    return meetingAnswer(book.saveMinutes(book.get(ctx.params[0]), ctx.body, by));
  });

  core.route("POST", "/data/meetings/:id/minutes/draft-sent", (ctx) => {
    const by = ctx.staff();
    return meetingAnswer(book.draftSent(book.get(ctx.params[0]), ctx.body, by, env()));
  });

  core.route("POST", "/data/meetings/:id/minutes/comments-closed", (ctx) => {
    const by = ctx.staff();
    return meetingAnswer(book.commentsClosed(book.get(ctx.params[0]), ctx.body, by, env()));
  });

  core.route("POST", "/data/meetings/:id/minutes/signed", async (ctx) => {
    const by = ctx.staff();
    const meeting = book.get(ctx.params[0]);
    const signing = book.checkSigning(meeting, ctx.body, env());
    let fileId: string | null = null;
    if (copyGiven(ctx.body)) {
      checkCopy(core, ctx.body);
      fileId = (
        await keepCopy(
          core,
          ctx.body,
          {
            folder: MINUTES_FOLDER,
            title: `Minutes – ${book.title(meeting)}`,
            note: `Signed minutes of ${book.title(meeting)}`,
          },
          by,
        )
      ).file_id;
    }
    return meetingAnswer(book.sign(meeting, signing, fileId, by));
  });

  core.route("POST", "/data/meetings/:id/minutes/signed-copy", async (ctx) => {
    const by = ctx.staff();
    const meeting = book.get(ctx.params[0]);
    book.checkSignedCopy(meeting);
    const file = await keepCopy(
      core,
      ctx.body,
      {
        folder: MINUTES_FOLDER,
        title: `Minutes – ${book.title(meeting)}`,
        note: `Signed minutes of ${book.title(meeting)}`,
      },
      by,
    );
    return meetingAnswer(book.attachSigned(meeting, file.file_id, file.title, by));
  });

  core.route("POST", "/data/meetings/:id/later-notes", (ctx) => {
    const by = ctx.staff();
    return meetingAnswer(book.laterNote(book.get(ctx.params[0]), ctx.body, by));
  });

  core.route("POST", "/data/meetings/:id/note-circulars", (ctx) => {
    const by = ctx.staff();
    return meetingAnswer(book.noteCirculars(book.get(ctx.params[0]), ctx.body.resolution_ids, by));
  });

  // ---------------------------------------------------------------- test routes

  if (core.testRoutes) {
    core.route("POST", "/data/_test/meetings/pin", (ctx) => {
      ctx.staff();
      const id = ctx.body.id;
      if (!isRouteId(id)) throw new Refused(400, "invalid", "That is not an id.");
      const found = book.meetings.find((meeting) => meeting.meeting_id === id);
      book.pinned = found ? null : id;
      return { pinned: book.pinned, exists: Boolean(found) };
    });

    core.route("POST", "/data/_test/meetings/day", (ctx) => {
      const by = ctx.staff();
      const meeting = book.get(typeof ctx.body.id === "string" ? ctx.body.id : undefined);
      return meetingAnswer(book.moveDay(meeting, ctx.body.day, by));
    });

    // A fake `company` for a copy without C1's module: the directors given, each in office
    // from the day appointed until the day ceased. Only while no real one is here.
    let fakeDirectors: FakeDirector[] = [];
    const fakeCompany: CompanyLookup = {
      usedFor: () => [],
      facts: () => ({
        legal_name: "Walk Company Private Limited",
        incorporated_on: null,
        first_fy_end: null,
        small: "",
        startup: "",
        subsidiary: "",
        foreign_investment: "",
        dpiit_number: "",
        firms_registered_on: null,
      }),
      directorsOn: (day) =>
        fakeDirectors
          .filter(
            (director) =>
              (!director.appointed_on || director.appointed_on <= day) &&
              (!director.ceased_on || director.ceased_on > day),
          )
          .map(({ director_id, name, is_founder }) => ({ director_id, name, is_founder })),
    };
    core.route("POST", "/data/_test/meetings/company", (ctx) => {
      ctx.staff();
      const current = core.need<CompanyLookup>(COMPANY_SERVICES.company);
      if (ctx.body.on === false) {
        if (current === fakeCompany) core.provide(COMPANY_SERVICES.company, null);
        return { installed: false };
      }
      if (current && current !== fakeCompany) return { installed: false, real: true };
      const given = Array.isArray(ctx.body.directors) ? ctx.body.directors : [];
      fakeDirectors = given.map((item, index) => {
        const record = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
        return {
          director_id: clean(record.director_id, 64) || `stand-in-director-${index + 1}`,
          name: clean(record.name, 120) || `Walk Director ${index + 1}`,
          is_founder: record.is_founder === true,
          appointed_on: isDay(record.appointed_on) ? record.appointed_on : null,
          ceased_on: isDay(record.ceased_on) ? record.ceased_on : null,
        };
      });
      core.provide(COMPANY_SERVICES.company, fakeCompany);
      return { installed: true };
    });

    // The stand-in `key-dates` of the contract file, for a copy without C1's dates module.
    let standIn: ReturnType<typeof standInKeyDates> | null = null;
    core.route("POST", "/data/_test/meetings/key-dates", (ctx) => {
      ctx.staff();
      const current = core.need<KeyDatesService>(COMPANY_SERVICES.keyDates);
      if (ctx.body.on === false) {
        if (current && current === standIn) core.provide(COMPANY_SERVICES.keyDates, null);
        return { installed: false };
      }
      if (current && current !== standIn) return { installed: false, real: true };
      if (!current) {
        standIn = standInKeyDates();
        core.provide(COMPANY_SERVICES.keyDates, standIn);
      }
      return { installed: true };
    });
    core.route("GET", "/data/_test/meetings/key-dates", () => ({
      dates: standIn && core.need(COMPANY_SERVICES.keyDates) === standIn ? standIn.dates : [],
      real:
        Boolean(core.need(COMPANY_SERVICES.keyDates)) &&
        core.need(COMPANY_SERVICES.keyDates) !== standIn,
    }));

    core.route("GET", "/data/_test/meetings/agenda", () => ({
      items: core.need<AgendaSource>(agendaService("meetings"))?.agenda(core.day()) ?? [],
      today: core.day(),
    }));

    core.route("GET", "/data/_test/meetings/search", (ctx) => {
      const query = clean(ctx.query.get("q"), MEETING_LIMITS.search);
      return {
        groups:
          core.need<SearchSource>(searchService("meetings"))?.search({
            query,
            terms: findTerms(query),
            kind: null,
            limit: Math.min(50, Math.max(0, wholeNumber(ctx.query.get("limit"), 5))),
          }) ?? [],
      };
    });
  }
}
