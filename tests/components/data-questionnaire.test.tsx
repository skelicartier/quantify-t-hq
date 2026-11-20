import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { QuestionnaireCounts } from "@/components/data/questionnaires/counts-line";
import { AnswerCell } from "@/components/data/questionnaires/question-cell";
import type { LibraryLine, QuestionView } from "@/lib/data/api/questionnaires";

/**
 * A questionnaire's page parts (ws-notes/security/spec.md §9.7), drawn from fixed rows: the
 * line of counts, the suggestions with their strength in words ("By ID", "Likely",
 * "Possible") and "Use this", an answered question with Clear and "Save to the library", a
 * closed questionnaire with no buttons, and no "%" anywhere. Every question is invented.
 */

vi.mock("@/app/(portal)/data/waitlist/diligence/questionnaires/actions", () => ({
  answerQuestionAction: vi.fn(),
  clearQuestionAction: vi.fn(),
  toLibraryAction: vi.fn(),
}));

const line = (id: string, change: Partial<LibraryLine> = {}): LibraryLine => ({
  answer_id: id,
  question: `Invented library question ${id}?`,
  short: "yes",
  answer: `Invented answer ${id}.`,
  ssrm: "",
  state: "approved",
  review_by: "2027-11-20",
  review_due: false,
  href: `/data/waitlist/diligence/answers/${id}`,
  ...change,
});

const question = (change: Partial<QuestionView> = {}): QuestionView => ({
  row: 4,
  qid: "A&A-01.1",
  section: "Policies",
  text: "Do you keep a written information security policy, reviewed every year?",
  answer: null,
  suggestions: [],
  ...change,
});

describe("the line of counts", () => {
  it("is words and numbers, never a bar", () => {
    const { container } = render(
      <QuestionnaireCounts counts={{ by_id: 4, likely: 12, unanswered: 150 }} />,
    );
    expect(container.textContent).toBe("4 with a match by ID · 12 likely · 150 not answered");
    expect(container.querySelector('[role="progressbar"], meter, progress')).toBeNull();
    expect(container.textContent).not.toContain("%");
    expect(
      render(<QuestionnaireCounts counts={{ by_id: 0, likely: 1200, unanswered: 2000 }} />)
        .container.textContent,
    ).toBe("0 with a match by ID · 1,200 likely · 2,000 not answered");
  });
});

describe("the Answer cell", () => {
  const library = new Map([
    ["a1", line("a1")],
    ["a2", line("a2", { review_due: true, review_by: "2026-01-31" })],
    ["a3", line("a3", { short: "" })],
  ]);

  it("shows each suggestion's strength in words, its answer, and Use this", () => {
    const { container } = render(
      <AnswerCell
        questionnaireId="q1"
        entryId="e1"
        question={question({
          suggestions: [
            { answer_id: "a1", score: 1000, how: "id" },
            { answer_id: "a2", score: 571, how: "likely" },
            { answer_id: "a3", score: 300, how: "possible" },
          ],
        })}
        library={library}
        caiq={false}
        closed={false}
      />,
    );
    const words = [...container.querySelectorAll(".hqdata-suggestion__how")].map(
      (item) => item.textContent,
    );
    expect(words).toEqual(["By ID", "Likely", "Possible"]);
    expect(screen.getAllByRole("button", { name: "Use this answer for row 4" })).toHaveLength(3);
    expect(screen.getByRole("link", { name: "Invented library question a1?" })).toHaveAttribute(
      "href",
      "/data/waitlist/diligence/answers/a1",
    );
    expect(container.textContent).toContain("Yes. Invented answer a1.");
    expect(container.textContent).toContain("Review due since 31 Jan 2026.");
    expect(container.textContent).not.toContain("%");
    expect(container.textContent).not.toContain("1000");
    expect(screen.getByText("Answer")).toBeInTheDocument();
  });

  it("an answered question: its words, Clear, Save to the library for a typed one, Change", () => {
    const by = { staff_id: "walk-owner", name: "Walk Owner" };
    const { container } = render(
      <AnswerCell
        questionnaireId="q1"
        entryId="e1"
        question={question({
          answer: {
            short: "partly",
            text: "Reviewed by the founder.",
            ssrm: "shared_csc",
            answer_id: null,
            at: "2026-11-20T06:00:00.000Z",
            by,
          },
        })}
        library={library}
        caiq
        closed={false}
      />,
    );
    expect(container.querySelector(".hqdata-qanswer__text")?.textContent).toBe(
      "Partly. Reviewed by the founder.",
    );
    expect(container.textContent).toContain("Ownership: Shared CSP and CSC");
    expect(screen.getByRole("button", { name: "Clear" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save to the library" })).toBeInTheDocument();
    expect(screen.getByLabelText("Who owns the control (SSRM)")).toBeInTheDocument();
  });

  it("a closed questionnaire shows the answer and no button", () => {
    const { container } = render(
      <AnswerCell
        questionnaireId="q1"
        entryId="e1"
        question={question({ suggestions: [{ answer_id: "a1", score: 1000, how: "id" }] })}
        library={library}
        caiq={false}
        closed
      />,
    );
    expect(container.querySelectorAll("button")).toHaveLength(0);
    expect(container.querySelector("details")).toBeNull();
  });
});
