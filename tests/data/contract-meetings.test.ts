// @vitest-environment node
import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { addDays } from "../../scripts/data/days";
import {
  addLaterNote,
  addResolution,
  attachSignedMinutes,
  cancelMeeting,
  closeComments,
  markDraftSent,
  noteCirculars,
  planMeeting,
  readMeeting,
  readMeetings,
  recordHeld,
  recordNotice,
  saveMinutes,
  setMgt14,
  signMinutes,
  updateMeeting,
  updateResolution,
} from "@/lib/data/api/meetings";
import { readDataOverview } from "@/lib/data/api/overview";
import { DataRequestError } from "@/lib/data/socket";
import { WALKER, startStack, type Stack } from "./helpers";

/**
 * The portal's Meetings client against the real stack (ws-notes/company/spec.md §7.9):
 * every function's answer passes its schema, the overview parses with "meeting" rows in
 * Due, and the lock reaches the portal as the service's own sentence.
 */

let stack: Stack;
let today = "";

beforeAll(async () => {
  stack = await startStack({ env: true, modules: ["files", "meetings"] });
  today = String((await stack.ask("GET", "/data/_test/day")).json?.day ?? "");
  await stack.ask("POST", "/data/_test/meetings/key-dates", { by: WALKER });
}, 60_000);
afterAll(() => stack.stop());

const plan = {
  title: "",
  time: "11:00",
  place: "Walk office",
  mode: "in_person" as const,
  agenda: "Invented agenda",
};

describe("the portal and Meetings agree", () => {
  it("on every meeting, resolution and minutes call", async () => {
    const planned = await planMeeting(
      { ...plan, kind: "board", scheduled_on: addDays(today, 10), board_size: 2 },
      WALKER,
      randomUUID(),
    );
    expect(planned.notice_check?.send_by).toBe(addDays(today, 3));
    const id = planned.meeting.meeting_id;
    await updateMeeting(id, { agenda: "Invented: a changed agenda" }, WALKER);
    const notice = await recordNotice(id, { sent_on: today, shorter_reason: "" }, WALKER);
    expect(notice.warnings).toEqual([]);
    const cancelled = await planMeeting(
      { ...plan, kind: "board", scheduled_on: addDays(today, 20) },
      WALKER,
      randomUUID(),
    );
    await cancelMeeting(cancelled.meeting.meeting_id, { on: today, why: "Invented" }, WALKER);

    const held = await planMeeting(
      { ...plan, kind: "board", scheduled_on: addDays(today, -2), held: true, board_size: 2 },
      WALKER,
      randomUUID(),
    );
    const heldId = held.meeting.meeting_id;
    const circular = await planMeeting(
      {
        ...plan,
        kind: "circular",
        scheduled_on: addDays(today, -5),
        resolution: { title: "Walk circular", text: "", s179_3: false },
      },
      WALKER,
      randomUUID(),
    );
    const went = await recordHeld(
      heldId,
      {
        held_on: addDays(today, -2),
        chair: "Walk Founder",
        attendees: [
          { name: "Walk Founder", role: "director", director_id: null, how: "in_person" },
          { name: "Walk Co-founder", role: "director", director_id: null, how: "video" },
        ],
      },
      WALKER,
    );
    expect(went.warnings).toEqual([]);
    const added = await addResolution(
      heldId,
      {
        title: "Walk allotment authority",
        text: "",
        kind: "board",
        outcome: "passed",
        s179_3: true,
        add_date: true,
      },
      WALKER,
      randomUUID(),
    );
    const rid = added.meeting.resolutions[0]!.resolution_id;
    expect(added.meeting.resolutions[0]?.mgt14).toBe("ask");
    await updateResolution(heldId, rid, { text: "Invented text" }, WALKER);
    const needed = await setMgt14(heldId, rid, { mgt14: "needed", add_date: true }, WALKER);
    expect(needed.key_dates?.[0]?.due_on).toBe(addDays(today, 28));
    await noteCirculars(heldId, [circular.meeting.resolutions[0]!.resolution_id], WALKER);
    await saveMinutes(heldId, "Invented minutes", WALKER);
    await markDraftSent(heldId, today, WALKER);
    await closeComments(heldId, { on: today, comments: "None" }, WALKER);
    await signMinutes(heldId, { signed_on: today, by_name: "Walk Founder" }, WALKER);
    const copy = await attachSignedMinutes(
      heldId,
      { content: Buffer.from("invented signed minutes").toString("base64"), name: "m.txt" },
      WALKER,
    );
    expect(copy.meeting.minutes.signed?.file_id).toBeTruthy();
    await addLaterNote(heldId, "Invented note after signing", WALKER, randomUUID());

    const page = await readMeeting(heldId);
    expect(page.meeting.minutes.later_notes).toHaveLength(1);
    expect(page.signed_file?.title).toMatch(/^Minutes – Board meeting/);
    expect(page.key_dates?.[rid]?.[0]?.title).toBe("MGT-14: “Walk allotment authority”");
    const list = await readMeetings();
    expect(list.counts).toMatchObject({ all: 4, board: 3, circular: 1 });
    expect(list.held).toBe(2);
    const boards = await readMeetings({ kind: "board", state: "held" });
    expect(boards.meetings.map((row) => row.meeting_id)).toEqual([heldId]);
    expect(boards.meetings[0]?.minutes_step?.step).toBe("done");

    const overview = await readDataOverview();
    expect(overview.due.some((row) => row.kind === "meeting")).toBe(false);
  });

  it("the lock and the Due rows reach the portal", async () => {
    const held = await planMeeting(
      { ...plan, kind: "egm", scheduled_on: addDays(today, -20), held: true },
      WALKER,
      randomUUID(),
    );
    const overview = await readDataOverview();
    expect(
      overview.due.find((row) => row.key === `meeting:${held.meeting.meeting_id}:draft`),
    ).toMatchObject({ kind: "meeting", due_on: addDays(today, -5) });
    await signMinutes(held.meeting.meeting_id, { signed_on: today, by_name: "Walk" }, WALKER);
    const refused = await saveMinutes(held.meeting.meeting_id, "Changed", WALKER).catch(
      (error: unknown) => error,
    );
    expect(refused).toBeInstanceOf(DataRequestError);
    expect((refused as DataRequestError).message).toBe(
      "These minutes are signed, so the meeting cannot change. Add a note after signing instead.",
    );
  });
});
