import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  MinutesSection,
  SIGN_HINT,
  type MinutesData,
} from "@/components/data/meetings/minutes-section";
import type { ActionState } from "@/lib/forms/action-state";

/**
 * The minutes of one meeting (ws-notes/company/spec.md §7.7.3, item 5), drawn from fixed
 * data: unsigned, the timetable and every step from writing them to signing; signed, the
 * lock with the signed copy, no step left to take, and the note after signing that can be
 * added and never changed. Everyone is invented.
 */

const TODAY = "2026-12-28";
const action = vi.fn(async (): Promise<ActionState> => ({
  status: "sent",
  message: "Saved.",
  sentAt: 1,
}));
const actions = {
  save: action,
  draftSent: action,
  closeComments: action,
  sign: action,
  attachSigned: action,
  laterNote: action,
};

const unsigned: MinutesData = {
  meeting_id: "walk-board",
  chair: "Walk Founder",
  held: true,
  minutes: {
    text: "Invented minutes.",
    draft_sent_on: "2026-12-20",
    comments_closed_on: null,
    comments: "",
    signed: null,
    later_notes: [],
  },
  timetable: [
    { step: "draft", by: "2026-12-27", done_on: "2026-12-20" },
    { step: "comments", by: "2026-12-27", done_on: null },
    { step: "signed", by: "2027-01-11", done_on: null },
  ],
  signed_file: null,
};

const signed: MinutesData = {
  ...unsigned,
  minutes: {
    ...unsigned.minutes,
    comments_closed_on: "2026-12-27",
    signed: { on: "2026-12-28", by_name: "Walk Founder", file_id: "file-1" },
    later_notes: [
      {
        note_id: "n1",
        text: "Invented: a correction after signing.",
        at: "2026-12-28T06:00:00.000Z",
        by: { name: "Walk Owner" },
      },
    ],
  },
  timetable: [
    { step: "draft", by: "2026-12-27", done_on: "2026-12-20" },
    { step: "comments", by: "2026-12-27", done_on: "2026-12-27" },
    { step: "signed", by: "2027-01-11", done_on: "2026-12-28" },
  ],
  signed_file: { file_id: "file-1", title: "Minutes – Board meeting 1, 12 Dec 2026" },
};

const draw = (data: MinutesData) =>
  render(
    <MinutesSection
      data={data}
      actions={actions}
      files={[
        { file_id: "file-9", title: "Old minutes", folder: "02 Board and shareholder meetings" },
      ]}
      filesHere
      today={TODAY}
      now={Date.parse("2026-12-28T08:00:00.000Z")}
    />,
  );

describe("the minutes section", () => {
  it("unsigned: the timetable and every step until signing", () => {
    const { container } = draw(unsigned);
    const table = screen.getByRole("table", { name: "Minutes timetable" });
    const rows = within(table).getAllByRole("row").slice(1);
    expect(rows.map((row) => row.textContent)).toEqual([
      "Draft sent to the directors27 Dec 202620 Dec 2026",
      "Comments closed27 Dec 2026Not yet",
      "Entered and signed11 Jan 2027Not yet",
    ]);
    // Comments were due yesterday and are not closed: the day reads as late.
    expect(within(rows[1]!).getByText("27 Dec 2026").className).toContain("hqdata-late");
    const labels = [...container.querySelectorAll("summary")].map((item) => item.textContent);
    expect(labels).toEqual(["Write the minutes", "Close comments", "Mark the minutes signed"]);
    expect(screen.getByText(SIGN_HINT)).toBeTruthy();
    expect((screen.getByLabelText("Signed by") as HTMLInputElement).value).toBe("Walk Founder");
    expect(screen.getByLabelText("Or attach it here")).toBeTruthy();
    expect(container.querySelector(".hqdata-minutes__text")?.textContent).toBe("Invented minutes.");
    expect(screen.queryByText(/The minutes are locked/)).toBeNull();
    expect(screen.queryByText("Add a note after signing")).toBeNull();
  });

  it("signed: the lock with the copy, no steps, and the note after signing", () => {
    const { container } = draw(signed);
    const lock = screen.getByText(
      /Signed on 28 Dec 2026 by Walk Founder\. The minutes are locked\./,
    );
    expect(lock).toBeTruthy();
    const link = screen.getByRole("link", { name: "Minutes – Board meeting 1, 12 Dec 2026" });
    expect(link.getAttribute("href")).toBe("/data/files/file-1");
    const labels = [...container.querySelectorAll("summary")].map((item) => item.textContent);
    expect(labels).toEqual(["Add a note after signing"]);
    expect(screen.getByText("Invented: a correction after signing.")).toBeTruthy();
    expect(
      screen.getByText("A note after signing is kept as it is: it cannot be changed or removed."),
    ).toBeTruthy();
    expect(screen.queryByText("Write the minutes")).toBeNull();
    expect(screen.queryByText("Mark the minutes signed")).toBeNull();
  });

  it("signed without a copy offers to attach one, once", () => {
    const { container } = draw({
      ...signed,
      minutes: { ...signed.minutes, signed: { ...signed.minutes.signed!, file_id: null } },
      signed_file: null,
    });
    expect(screen.getByText("No signed copy is attached yet.")).toBeTruthy();
    const labels = [...container.querySelectorAll("summary")].map((item) => item.textContent);
    expect(labels).toEqual(["Attach the signed copy", "Add a note after signing"]);
  });

  it("before the meeting is held there are no minutes to write", () => {
    const { container } = draw({ ...unsigned, held: false, timetable: [] });
    expect(screen.getByText("The minutes come once the meeting is held.")).toBeTruthy();
    expect(container.querySelectorAll("summary")).toHaveLength(0);
  });
});
