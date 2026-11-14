// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { dueFrom, ruleOf, type RuleKey } from "../../scripts/data/company-contracts";
import { addDays } from "../../scripts/data/days";
import {
  minutesStep,
  noticeCheck,
  noticeWarning,
  quorumNeeded,
  serials,
  timetable,
  titleOf,
} from "../../scripts/data/meetings/rules";
import type { Meeting } from "../../scripts/data/meetings/types";
import { dayWords } from "../../src/lib/data/labels-registers";
import { WALKER, codeOf, startStack, type RawAnswer, type Stack } from "./helpers";

/**
 * Meetings (ws-notes/company/spec.md §7.9): §5.3's notice, quorum and minutes examples by
 * hand and through the stack, with the company record absent (a typed board size) and with
 * a fake one; every refusal of §7.3; the lock once signed; MGT-14 through the stand-in
 * `key-dates`; Due's seven-day window; the agenda and search sources; serial titles. Every
 * person is invented.
 */

const own = (key: RuleKey) => ruleOf(key).amount;

function meeting(change: Partial<Meeting> = {}): Meeting {
  const by = WALKER;
  return {
    meeting_id: "m1",
    kind: "board",
    title: "",
    scheduled_on: "2026-12-12",
    time: "",
    place: "",
    mode: "in_person",
    agenda: "",
    notice: { sent_on: null, shorter_reason: "" },
    state: "planned",
    held_on: null,
    chair: "",
    board_size: null,
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
    created_at: "2026-11-01T00:00:00.000Z",
    created_by: by,
    updated_at: "2026-11-01T00:00:00.000Z",
    updated_by: by,
    ...change,
  };
}

describe("the arithmetic of §5.3, by hand", () => {
  it("board notice: send by meeting − 7; 7 days is fine, 6 is short", () => {
    const planned = meeting();
    expect(noticeCheck(planned, own)?.send_by).toBe("2026-12-05");
    expect(noticeCheck(planned, own)?.sentence).toBe("No notice recorded. Send it by 5 Dec 2026.");
    const fine = noticeCheck(
      meeting({ notice: { sent_on: "2026-12-05", shorter_reason: "" } }),
      own,
    )!;
    expect(fine).toMatchObject({ days: 7, short: false, words: "7 days before" });
    const short = meeting({ notice: { sent_on: "2026-12-06", shorter_reason: "" } });
    const check = noticeCheck(short, own)!;
    expect(check).toMatchObject({ days: 6, short: true });
    expect(check.sentence).toBe("Sent 6 Dec 2026, 6 days before. The rule is at least 7.");
    expect(noticeWarning(check, "")).toBe("Notice went 6 days before; the rule is at least 7.");
    expect(noticeWarning(check, "All directors agreed")).toBeNull();
  });

  it("general-meeting notice counts clear days: send by meeting − 22", () => {
    const agm = meeting({ kind: "agm", scheduled_on: "2026-12-22" });
    expect(noticeCheck(agm, own)?.send_by).toBe("2026-11-30");
    expect(
      noticeCheck({ ...agm, notice: { sent_on: "2026-11-30", shorter_reason: "" } }, own),
    ).toMatchObject({ days: 21, short: false, words: "21 clear days before" });
    const short = noticeCheck(
      { ...agm, notice: { sent_on: "2026-12-01", shorter_reason: "" } },
      own,
    )!;
    expect(short.days).toBe(20);
    expect(noticeWarning(short, "")).toBe(
      "Notice went 20 clear days before; the rule is at least 21.",
    );
    expect(noticeCheck(meeting({ kind: "agm", scheduled_on: "2028-03-15" }), own)?.send_by).toBe(
      "2028-02-22",
    );
    expect(noticeCheck(meeting({ kind: "circular" }), own)).toBeNull();
  });

  it("board quorum: two, or a third of the board rounded up, whichever is more", () => {
    const needed = [1, 2, 3, 6, 7, 9, 10].map((n) => quorumNeeded(n, 2));
    expect(needed).toEqual([2, 2, 2, 2, 3, 3, 4]);
    expect(quorumNeeded(null, 2)).toBe(2);
    expect(quorumNeeded(6, 3)).toBe(3);
  });

  it("minutes: draft by H + 15, comments H + 22 or draft + 7, signed by H + 30", () => {
    const held = meeting({ state: "held", held_on: "2026-12-12" });
    expect(timetable(held, own).map((row) => row.by)).toEqual([
      "2026-12-27",
      "2027-01-03",
      "2027-01-11",
    ]);
    const drafted = {
      ...held,
      minutes: { ...held.minutes, draft_sent_on: "2026-12-20" },
    };
    expect(timetable(drafted, own)[1]?.by).toBe("2026-12-27");
    expect(minutesStep(drafted, own)).toEqual({ step: "comments", by: "2026-12-27" });
    const leap = meeting({ state: "held", held_on: "2028-02-14" });
    expect(timetable(leap, own).map((row) => row.by)).toEqual([
      "2028-02-29",
      "2028-03-07",
      "2028-03-15",
    ]);
    expect(
      timetable(meeting({ kind: "circular", state: "held", held_on: "2026-12-12" }), own),
    ).toEqual([]);
    // His amount replaces the rule's own.
    const longer = (key: RuleKey) => (key === "minutes-draft" ? 20 : own(key));
    expect(timetable(held, longer)[0]?.by).toBe("2027-01-01");
  });

  it("MGT-14: 30 days from the resolution", () => {
    expect(dueFrom(ruleOf("mgt-14"), "2026-12-20")).toBe("2027-01-19");
    expect(dueFrom(ruleOf("mgt-14"), "2028-01-30")).toBe("2028-02-29");
  });

  it("serial titles skip a cancelled meeting", () => {
    const all = [
      meeting({ meeting_id: "a", scheduled_on: "2026-12-01" }),
      meeting({ meeting_id: "b", scheduled_on: "2026-12-05", state: "cancelled" }),
      meeting({ meeting_id: "c", scheduled_on: "2026-12-12" }),
      meeting({ meeting_id: "d", kind: "agm", scheduled_on: "2026-12-20" }),
    ];
    const numbers = serials(all);
    expect(all.map((item) => titleOf(item, numbers))).toEqual([
      "Board meeting 1, 1 Dec 2026",
      "Board meeting, 5 Dec 2026 (cancelled)",
      "Board meeting 2, 12 Dec 2026",
      "AGM 1, 20 Dec 2026",
    ]);
  });
});

// ------------------------------------------------------------------ through the stack

let stack: Stack;
let today = "";
const PDF = Buffer.from("%PDF-1.4\n% invented signed minutes\n%%EOF\n").toString("base64");

const post = (path: string, body: Record<string, unknown> = {}) =>
  stack.ask("POST", path, { by: WALKER, ...body });
const message = (answer: RawAnswer) =>
  String((answer.json?.error as { message?: unknown } | undefined)?.message ?? "");
const meetingOf = (answer: RawAnswer) => answer.json?.meeting as Meeting;

beforeAll(async () => {
  stack = await startStack({ modules: ["files", "meetings"] });
  today = String((await stack.ask("GET", "/data/_test/day")).json?.day ?? "");
}, 60_000);
afterAll(() => stack.stop());

async function plan(body: Record<string, unknown>): Promise<Meeting> {
  const answer = await post("/data/meetings", { kind: "board", place: "Walk office", ...body });
  expect(answer.status, message(answer)).toBe(200);
  return meetingOf(answer);
}

describe("meetings through the stack", () => {
  it("without the company record: the typed board size and two directors make the quorum", async () => {
    const held = await plan({ scheduled_on: addDays(today, -3), held: true, board_size: 2 });
    expect(held.state).toBe("held");
    const answer = await post(`/data/meetings/${held.meeting_id}/held`, {
      held_on: addDays(today, -3),
      chair: "Walk Founder",
      attendees: [
        { name: "Walk Founder", role: "director", how: "in_person" },
        { name: "Walk Co-founder", role: "director", how: "video" },
      ],
    });
    expect(answer.status).toBe(200);
    expect(answer.json?.warnings).toEqual([]);
    const detail = (await stack.ask("GET", `/data/meetings/${held.meeting_id}`)).json!;
    expect(detail.quorum).toMatchObject({ needed: 2, present: 2, met: true });
    expect(detail.quorum_sentence).toBe("Quorum: 2 present of 2 needed.");
    expect(detail.directors).toBeNull();
  });

  it("one typed director warns that a board meeting needs two", async () => {
    const held = await plan({ scheduled_on: today, held: true, board_size: 1 });
    await post(`/data/meetings/${held.meeting_id}/held`, {
      held_on: today,
      attendees: [{ name: "Walk Founder", role: "director", how: "in_person" }],
    });
    const detail = (await stack.ask("GET", `/data/meetings/${held.meeting_id}`)).json!;
    expect(detail.warnings).toContain("The board has one director, and a board meeting needs two.");
    expect(detail.quorum).toMatchObject({ needed: 2, present: 1, met: false });
  });

  it("with a fake company: the directors in office count, a ceased one is refused", async () => {
    const directors = Array.from({ length: 7 }, (_, index) => ({
      director_id: `walk-director-${index + 1}`,
      name: `Walk Director ${index + 1}`,
      is_founder: index === 0,
      appointed_on: "2025-08-14",
    }));
    directors.push({
      director_id: "walk-director-gone",
      name: "Walk Former Director",
      is_founder: false,
      appointed_on: "2025-08-14",
      ceased_on: addDays(today, -30),
    } as (typeof directors)[number]);
    const installed = await post("/data/_test/meetings/company", { directors });
    expect(installed.json?.installed).toBe(true);
    const held = await plan({ scheduled_on: addDays(today, -1), held: true, board_size: 4 });
    expect(held.board_size).toBeNull();
    const refused = await post(`/data/meetings/${held.meeting_id}/held`, {
      held_on: addDays(today, -1),
      attendees: [
        { name: "Walk Former Director", role: "director", director_id: "walk-director-gone" },
      ],
    });
    expect(refused.status).toBe(400);
    expect(message(refused)).toMatch(
      /^Walk Former Director was not a director on \d+ \w{3} \d{4}\.$/,
    );
    await post(`/data/meetings/${held.meeting_id}/held`, {
      held_on: addDays(today, -1),
      attendees: directors.slice(0, 3).map((director) => ({
        name: director.name,
        role: "director",
        director_id: director.director_id,
        how: "video",
      })),
    });
    const detail = (await stack.ask("GET", `/data/meetings/${held.meeting_id}`)).json!;
    expect(detail.quorum).toMatchObject({ needed: 3, present: 3, met: true, directors: 7 });
    expect((detail.directors as unknown[]).length).toBe(7);
    await post("/data/_test/meetings/company", { on: false });
  });

  it("refuses with §7.3's sentences", async () => {
    const cases: [string, Record<string, unknown>, string][] = [
      ["/data/meetings", { kind: "lunch", scheduled_on: today }, "Choose from the list."],
      [
        "/data/meetings",
        { kind: "board", scheduled_on: addDays(today, 3), held: true },
        "That day is in the future.",
      ],
      [
        "/data/meetings",
        { kind: "board", scheduled_on: today, time: "9am" },
        "Type the time as 11:00.",
      ],
      [
        "/data/meetings",
        { kind: "board", scheduled_on: today, board_size: 16 },
        "Type how many directors the board had that day.",
      ],
      [
        "/data/meetings",
        { kind: "board", scheduled_on: today, agenda: "key xkeysib-abc123" },
        "That looks like a password or key. Keep it in your password manager and write where it lives instead.",
      ],
    ];
    for (const [path, body, sentence] of cases) {
      const answer = await post(path, body);
      expect(answer.status, sentence).toBe(400);
      expect(message(answer)).toBe(sentence);
    }
    const planned = await plan({ scheduled_on: addDays(today, 10) });
    const late = await post(`/data/meetings/${planned.meeting_id}/notice`, {
      sent_on: addDays(today, 1),
    });
    expect(message(late)).toBe("That day is in the future.");
    const egm = await plan({ kind: "egm", scheduled_on: addDays(today, -2), held: true });
    const after = await post(`/data/meetings/${egm.meeting_id}/notice`, {
      sent_on: addDays(today, -1),
    });
    expect(message(after)).toBe("The notice cannot go after the meeting.");
    const untitled = await post(`/data/meetings/${egm.meeting_id}/resolutions`, { title: "" });
    expect(message(untitled)).toBe("Give the resolution a title.");
    const wrong = await post(`/data/meetings/${egm.meeting_id}/resolutions`, {
      title: "Walk resolution",
      kind: "board",
    });
    expect(message(wrong)).toBe(
      "A board meeting passes board resolutions; members pass ordinary or special ones.",
    );
    const crowd = await post(`/data/meetings/${egm.meeting_id}/held`, {
      held_on: addDays(today, -2),
      attendees: Array.from({ length: 41 }, (_, index) => ({
        name: `Walk Member ${index}`,
        role: "member",
      })),
    });
    expect(crowd.status).toBe(400);
    const notPlanned = await post(`/data/meetings/${egm.meeting_id}/cancel`, { why: "Invented" });
    expect(notPlanned.status).toBe(409);
    expect(codeOf(notPlanned)).toBe("not_planned");
    expect(message(notPlanned)).toBe("Only a planned meeting can be cancelled.");
    const early = await post(`/data/meetings/${egm.meeting_id}/minutes/signed`, {
      signed_on: addDays(today, -3),
      by_name: "Walk Founder",
    });
    expect(message(early)).toBe("The minutes cannot be signed before the meeting.");
    const nobody = await post(`/data/meetings/${egm.meeting_id}/minutes/signed`, {
      signed_on: today,
      by_name: "",
    });
    expect(message(nobody)).toBe("Say who signed the minutes.");
  });

  it("locks signed minutes: every change refused but the MGT-14 choice, a later note and a first copy", async () => {
    const egm = await plan({ kind: "egm", scheduled_on: addDays(today, -5), held: true });
    const id = egm.meeting_id;
    const added = await post(`/data/meetings/${id}/resolutions`, {
      title: "Walk alteration of articles",
      kind: "special",
    });
    const rid = meetingOf(added).resolutions[0]!.resolution_id;
    expect(meetingOf(added).resolutions[0]?.mgt14).toBe("needed");
    const signed = await post(`/data/meetings/${id}/minutes/signed`, {
      signed_on: today,
      by_name: "Walk Founder",
    });
    expect(signed.status).toBe(200);
    const refusals = await Promise.all([
      post(`/data/meetings/${id}/update`, { place: "Elsewhere" }),
      post(`/data/meetings/${id}/notice`, { sent_on: addDays(today, -30) }),
      post(`/data/meetings/${id}/held`, { held_on: addDays(today, -5), attendees: [] }),
      post(`/data/meetings/${id}/cancel`, { why: "Invented" }),
      post(`/data/meetings/${id}/resolutions`, { title: "Another", kind: "ordinary" }),
      post(`/data/meetings/${id}/resolutions/${rid}/update`, { title: "Changed" }),
      post(`/data/meetings/${id}/minutes`, { text: "Changed" }),
      post(`/data/meetings/${id}/minutes/draft-sent`, { on: today }),
      post(`/data/meetings/${id}/minutes/comments-closed`, { on: today }),
      post(`/data/meetings/${id}/minutes/signed`, { signed_on: today, by_name: "Walk Founder" }),
    ]);
    for (const answer of refusals) {
      expect(answer.status).toBe(409);
      expect(codeOf(answer)).toBe("minutes_signed");
      expect(message(answer)).toBe(
        "These minutes are signed, so the meeting cannot change. Add a note after signing instead.",
      );
    }
    const choice = await post(`/data/meetings/${id}/resolutions/${rid}/mgt-14`, { mgt14: "ask" });
    expect(meetingOf(choice).resolutions[0]?.mgt14).toBe("ask");
    const note = await post(`/data/meetings/${id}/later-notes`, { text: "Invented correction." });
    expect(meetingOf(note).minutes.later_notes).toHaveLength(1);
    const copy = await post(`/data/meetings/${id}/minutes/signed-copy`, {
      content: PDF,
      name: "minutes.pdf",
    });
    expect(copy.status, message(copy)).toBe(200);
    expect(meetingOf(copy).minutes.signed?.file_id).toBeTruthy();
    const again = await post(`/data/meetings/${id}/minutes/signed-copy`, {
      content: PDF,
      name: "minutes.pdf",
    });
    expect(again.status).toBe(409);
    const file = (await stack.ask("GET", `/data/files/${meetingOf(copy).minutes.signed?.file_id}`))
      .json!;
    expect(JSON.stringify(file)).toContain("02 Board and shareholder meetings");
    expect(JSON.stringify(file)).toContain("Signed minutes of EGM");
  });

  it("MGT-14 through the stand-in key-dates: added when ticked, not otherwise, taken back on change", async () => {
    expect((await post("/data/_test/meetings/key-dates", {})).json?.installed).toBe(true);
    const held = addDays(today, -4);
    const egm = await plan({ kind: "egm", scheduled_on: held, held: true });
    const ticked = await post(`/data/meetings/${egm.meeting_id}/resolutions`, {
      title: "Walk private placement",
      kind: "special",
      add_date: true,
    });
    const links = ticked.json?.key_dates as { title: string; due_on: string; state: string }[];
    expect(links).toHaveLength(1);
    expect(links[0]).toMatchObject({
      title: "MGT-14: “Walk private placement”",
      due_on: addDays(held, 30),
      state: "coming_up",
    });
    const unticked = await post(`/data/meetings/${egm.meeting_id}/resolutions`, {
      title: "Walk second special resolution",
      kind: "special",
    });
    expect(unticked.json?.key_dates).toEqual([]);
    const rid = meetingOf(ticked).resolutions[0]!.resolution_id;
    const changed = await post(`/data/meetings/${egm.meeting_id}/resolutions/${rid}/update`, {
      outcome: "not_passed",
    });
    expect((changed.json?.key_dates as { state: string }[])[0]?.state).toBe("taken_back");
    const dates = (await stack.ask("GET", "/data/_test/meetings/key-dates")).json?.dates as {
      title: string;
    }[];
    expect(dates.map((date) => date.title)).toContain("MGT-14: “Walk private placement”");
    const detail = (await stack.ask("GET", `/data/meetings/${egm.meeting_id}`)).json!;
    expect(Object.keys(detail.key_dates as object)).toHaveLength(2);
    expect(detail.key_dates_note).toBe("");
    await post("/data/_test/meetings/key-dates", { on: false });
    const without = (await stack.ask("GET", `/data/meetings/${egm.meeting_id}`)).json!;
    expect(without.key_dates).toBeNull();
    expect(without.key_dates_note).toBe(
      "Key dates is not set up here yet, so this date is not in it.",
    );
  });

  it("Due: each step from seven days before its day, until done", async () => {
    const due = async () =>
      ((await stack.ask("GET", "/data/overview")).json?.due as {
        key: string;
        kind: string;
        title: string;
        due_on: string;
      }[]) ?? [];
    // A draft due in 7 days is a row; in 8 days it is not.
    const seven = await plan({ scheduled_on: addDays(today, -8), held: true, title: "Walk seven" });
    const eight = await plan({ scheduled_on: addDays(today, -7), held: true, title: "Walk eight" });
    let rows = await due();
    expect(rows.find((row) => row.key === `meeting:${seven.meeting_id}:draft`)).toMatchObject({
      kind: "meeting",
      title: "Send the draft minutes: Walk seven",
      due_on: addDays(today, 7),
    });
    expect(rows.some((row) => row.key === `meeting:${eight.meeting_id}:draft`)).toBe(false);
    // A planned meeting four days ahead: the notice was due three days ago.
    const soon = await plan({ scheduled_on: addDays(today, 4), title: "Walk soon" });
    rows = await due();
    expect(rows.find((row) => row.key === `meeting:${soon.meeting_id}:notice`)).toMatchObject({
      title: "Send the notice: Walk soon",
      due_on: addDays(today, -3),
    });
    await post(`/data/meetings/${soon.meeting_id}/notice`, { sent_on: today });
    await post(`/data/meetings/${seven.meeting_id}/minutes/draft-sent`, { on: today });
    rows = await due();
    expect(rows.some((row) => row.key === `meeting:${soon.meeting_id}:notice`)).toBe(false);
    expect(rows.some((row) => row.key === `meeting:${seven.meeting_id}:draft`)).toBe(false);
    expect(rows.find((row) => row.key === `meeting:${seven.meeting_id}:comments`)?.due_on).toBe(
      addDays(today, 7),
    );
  });

  it("the agenda and search sources", async () => {
    const planned = await plan({
      scheduled_on: addDays(today, 20),
      title: "Walk agenda meeting",
      place: "Walk registered office",
      agenda: "Invented: approve the walk budget",
    });
    const items = (await stack.ask("GET", "/data/_test/meetings/agenda")).json?.items as {
      key: string;
      plain: string;
      remind_days: number[];
      on: string;
    }[];
    expect(items.find((item) => item.key === `meeting:${planned.meeting_id}`)).toMatchObject({
      plain: "Company meeting",
      remind_days: [7, 0],
      on: addDays(today, 20),
    });
    expect(items.find((item) => item.key === `meeting:${planned.meeting_id}:notice`)?.plain).toBe(
      "Notice due",
    );
    const found = (await stack.ask("GET", "/data/_test/meetings/search?q=walk%20budget")).json
      ?.groups as { kind: string; count: number; hits: { title: string; subtitle: string }[] }[];
    expect(found[0]).toMatchObject({ kind: "meeting", count: 1 });
    expect(found[0]?.hits[0]?.subtitle).toMatch(/^Planned · /);
    const cancelled = await post(`/data/meetings/${planned.meeting_id}/cancel`, {
      why: "Invented",
    });
    expect(cancelled.status).toBe(200);
    const after = (await stack.ask("GET", "/data/_test/meetings/search?q=walk%20budget")).json
      ?.groups as unknown[];
    expect(after).toEqual([]);
  });

  it("serial titles through the stack: two board meetings and a cancelled one between", async () => {
    const fresh = await startStack({ modules: ["meetings"] });
    try {
      const ask = (path: string, body: Record<string, unknown>) =>
        fresh.ask("POST", path, { by: WALKER, ...body });
      const day = String((await fresh.ask("GET", "/data/_test/day")).json?.day);
      await ask("/data/meetings", { kind: "board", scheduled_on: addDays(day, 10) });
      const middle = meetingOf(
        await ask("/data/meetings", { kind: "board", scheduled_on: addDays(day, 20) }),
      );
      await ask("/data/meetings", { kind: "board", scheduled_on: addDays(day, 30) });
      await ask(`/data/meetings/${middle.meeting_id}/cancel`, { why: "Invented" });
      const rows = (await fresh.ask("GET", "/data/meetings")).json?.meetings as {
        serial_title: string;
        state: string;
      }[];
      expect(rows.map((row) => row.serial_title)).toEqual([
        `Board meeting 2, ${dayWords(addDays(day, 30))}`,
        `Board meeting, ${dayWords(addDays(day, 20))} (cancelled)`,
        `Board meeting 1, ${dayWords(addDays(day, 10))}`,
      ]);
    } finally {
      await fresh.stop();
    }
  });
});
