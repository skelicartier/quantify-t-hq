import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  NO_NOTES,
  NotesSectionView,
  SECTION_ROWS,
} from "@/components/data/notes/notes-section-view";
import type { NoteRow, NotesPage } from "@/lib/data/api/notes";
import type { ActionState } from "@/lib/forms/action-state";

/**
 * The Notes section on a firm's page (raise spec §6.6.2), drawn from fixed data: the empty
 * sentence, the composer's fields and its hidden subject fields, each row's counts (open
 * actions in the attention tone once one is overdue), the link to all of them, and the
 * Data state in place of the list when the read fails. Every firm is invented.
 */

const TODAY = "2026-11-13";
const SUBJECT = {
  kind: "investor" as const,
  id: "0123456789abcdef0123456789abcdef",
  name: "Walk Fund 281",
};
const WALKER = { staff_id: "walk-owner", name: "Walk Owner" };
const PATH = `/data/investors/${SUBJECT.id}`;

const action = vi.fn(async (): Promise<ActionState> => ({
  status: "sent",
  message: "Added.",
  sentAt: 1,
}));

function note(id: string, change: Partial<NoteRow> = {}): NoteRow {
  return {
    note_id: id,
    subject: { kind: "investor", id: SUBJECT.id },
    subject_name: SUBJECT.name,
    kind: "call",
    held_on: "2026-11-12",
    title: `Call ${id}`,
    body: "",
    people: "",
    objections: [],
    actions: [],
    decision_id: null,
    created_at: "2026-11-12T06:00:00.000Z",
    created_by: WALKER,
    updated_at: "2026-11-12T06:00:00.000Z",
    updated_by: WALKER,
    withdrawn: null,
    open_actions: 0,
    href: PATH,
    ...change,
  };
}

const openAction = (id: string, dueOn: string | null) => ({
  action_id: id,
  title: `Action ${id}`,
  due_on: dueOn,
  owner: "",
  state: "open" as const,
  done_at: null,
  done_by: null,
  created_at: "2026-11-12T06:00:00.000Z",
  created_by: WALKER,
});

function page(notes: NoteRow[], total = notes.length): NotesPage {
  return {
    ok: true,
    notes,
    total,
    offset: 0,
    limit: 100,
    counts: { all: total },
    today: TODAY,
  };
}

function draw(read: Parameters<typeof NotesSectionView>[0]["read"]) {
  return render(
    <NotesSectionView subject={SUBJECT} today={TODAY} path={PATH} read={read} action={action} />,
  );
}

describe("the Notes section", () => {
  it("says what to write when the firm has no notes, and where the older ones are", () => {
    draw({ ok: true, data: page([]) });
    expect(screen.getByRole("heading", { name: "Notes" }).id).toBe("investor-notes");
    expect(screen.getByText(NO_NOTES)).toBeTruthy();
    expect(
      screen.getByText("Notes written before this section are in Activity below."),
    ).toBeTruthy();
    expect(screen.queryByRole("list", { name: `Notes on ${SUBJECT.name}` })).toBeNull();
  });

  it("holds the composer: its fields, Call first, today, and the hidden subject", () => {
    const { container } = draw({ ok: true, data: page([]) });
    expect(container.querySelector("summary")?.textContent).toBe("Add a note");
    const kind = screen.getByLabelText("Kind") as HTMLSelectElement;
    expect([...kind.options].map((option) => option.textContent)).toEqual([
      "Call",
      "Meeting",
      "Email",
      "Note",
    ]);
    expect(kind.value).toBe("call");
    expect((screen.getByLabelText("Held on") as HTMLInputElement).value).toBe(TODAY);
    expect((screen.getByLabelText("Title") as HTMLInputElement).placeholder).toBe(
      "First call with the partner",
    );
    expect((screen.getByLabelText("What was said") as HTMLTextAreaElement).maxLength).toBe(8_000);
    expect(screen.getByLabelText("Who was there")).toBeTruthy();
    expect(screen.getByLabelText("Objections").getAttribute("aria-describedby")).toBeTruthy();
    expect(
      screen.getByText("One per line. Answer them from the Investor FAQ on the note's page."),
    ).toBeTruthy();
    for (const index of [1, 2, 3]) {
      expect(screen.getByLabelText(`Action ${index}`)).toBeTruthy();
      expect(screen.getByLabelText(`By, action ${index}`)).toBeTruthy();
      expect(screen.getByLabelText(`Who, action ${index}`)).toBeTruthy();
    }
    expect(screen.getByText("Each action with a day joins Due on that day.")).toBeTruthy();
    const hidden = Object.fromEntries(
      [...container.querySelectorAll<HTMLInputElement>('input[type="hidden"]')]
        .filter((input) => input.name !== "attempt")
        .map((input) => [input.name, input.value]),
    );
    expect(hidden).toEqual({
      subject_kind: "investor",
      subject_id: SUBJECT.id,
      subject_name: SUBJECT.name,
      path: PATH,
    });
    expect(screen.getByRole("button", { name: "Add the note" })).toBeTruthy();
  });

  it("lists each note with its counts, overdue actions in the attention tone", () => {
    draw({
      ok: true,
      data: page([
        note("a", {
          title: "First call with the partner",
          objections: [
            { objection_id: "o1", text: "Why India first?", faq_id: null },
            { objection_id: "o2", text: "Is the data licensed?", faq_id: null },
          ],
          actions: [openAction("x", "2026-11-12"), openAction("y", null)],
          open_actions: 2,
        }),
        note("b", {
          kind: "meeting",
          title: "Second meeting",
          objections: [{ objection_id: "o3", text: "Who else is in?", faq_id: null }],
          actions: [openAction("z", TODAY)],
          open_actions: 1,
        }),
      ]),
    });
    const list = screen.getByRole("list", { name: `Notes on ${SUBJECT.name}` });
    const rows = within(list).getAllByRole("listitem");
    expect(rows).toHaveLength(2);
    expect(
      within(rows[0]!).getByRole("link", { name: "First call with the partner" }),
    ).toBeTruthy();
    expect(
      within(rows[0]!)
        .getByRole("link", { name: "First call with the partner" })
        .getAttribute("href"),
    ).toBe("/data/notes/a");
    expect(rows[0]!.textContent).toContain("2 objections");
    const late = within(rows[0]!).getByText("2 open actions");
    expect(late.className).toContain("pill--attention");
    expect(rows[1]!.textContent).toContain("1 objection");
    expect(within(rows[1]!).getByText("1 open action").className).not.toContain("pill");
    expect(rows[1]!.textContent).toContain("Meeting");
    const all = screen.getByRole("link", { name: "All 2 notes" });
    expect(all.getAttribute("href")).toBe(
      `/data/notes?subject_kind=investor&subject_id=${SUBJECT.id}`,
    );
  });

  it("shows twenty at most, and the link to every one", () => {
    const many = Array.from({ length: 25 }, (_, index) => note(`n${index}`));
    draw({ ok: true, data: page(many, 25) });
    const list = screen.getByRole("list", { name: `Notes on ${SUBJECT.name}` });
    expect(within(list).getAllByRole("listitem")).toHaveLength(SECTION_ROWS);
    expect(screen.getByRole("link", { name: "All 25 notes" })).toBeTruthy();
  });

  it("draws the Data state, never an empty list, when the read fails", () => {
    const { container } = draw({
      ok: false,
      state: "refused",
      message: "That part of Data is not loaded.",
      detail: "",
      progress: null,
    });
    expect(screen.getByRole("alert").textContent).toBe("That part of Data is not loaded.");
    expect(screen.queryByText(NO_NOTES)).toBeNull();
    expect(container.querySelector("summary")).toBeNull();
  });
});
