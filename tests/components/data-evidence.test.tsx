import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  EvidenceCell,
  LateLine,
  NotForUsFields,
  SIGN_OFF_HINT,
  type EvidenceRow,
} from "@/components/data/dates/evidence";

/**
 * Key dates' evidence (company spec §6.7.5, §6.10), drawn from fixed rows: every part of
 * what a filing kept, "None kept" for a done date with nothing, a filed copy linked to its
 * file, the statutory "Not for us" form with its three sign-off fields and hint, and the
 * late line in rupees. No "%" anywhere. Every number is invented.
 */

const NONE = {
  srn: "",
  challan: "",
  filed_on: null,
  fee_paid: null,
  filed_file_id: null,
};

const row = (change: Partial<EvidenceRow> = {}): EvidenceRow => ({
  state: "done",
  evidence: { ...NONE },
  filed_file: null,
  ...change,
});

describe("the Evidence cell", () => {
  it("shows the SRN, the day, the fee and the filed copy, each linked where it is a file", () => {
    const { container } = render(
      <EvidenceCell
        date={row({
          evidence: {
            srn: "WALK-SRN-2",
            challan: "",
            filed_on: "2026-11-14",
            fee_paid: 300,
            filed_file_id: "walk-file",
          },
          filed_file: { file_id: "walk-file", title: "AOC-4 – filed 14 Nov 2026" },
        })}
      />,
    );
    expect(container.textContent).toBe("SRN WALK-SRN-2 · filed 14 Nov · ₹300 · Filed copy");
    expect(screen.getByRole("link", { name: "Filed copy" })).toHaveAttribute(
      "href",
      "/data/files/walk-file",
    );
    expect(container.textContent).not.toContain("%");
  });

  it("says None kept for a done date with nothing, and a dash for one not done", () => {
    expect(render(<EvidenceCell date={row()} />).container.textContent).toBe("None kept");
    expect(render(<EvidenceCell date={row({ state: "coming_up" })} />).container.textContent).toBe(
      "—",
    );
  });

  it("writes a fee in Indian grouping", () => {
    const { container } = render(
      <EvidenceCell date={row({ evidence: { ...NONE, fee_paid: 2_500_000 } })} />,
    );
    expect(container.textContent).toBe("₹25,00,000");
  });
});

describe("the late line", () => {
  it("counts the days and the fee so far, or for a date filed late", () => {
    const words = "An additional fee of ₹100 a day with no cap.";
    expect(
      render(<LateLine late={{ days: 1, amount: 100, words }} done={false} />).container
        .textContent,
    ).toBe("1 day late: ₹100 so far");
    expect(
      render(<LateLine late={{ days: 30, amount: 3000, words }} done />).container.textContent,
    ).toBe("Filed 30 days late: ₹3,000");
    expect(render(<LateLine late={null} done={false} />).container.textContent).toBe("");
  });
});

describe("Not for us on a statutory date", () => {
  it("asks who confirmed it, their role and the day, with the hint", () => {
    render(<NotForUsFields prefix="nope" statutory today="2026-11-14" contacts={null} />);
    expect(screen.getByLabelText("Who confirmed it does not apply")).toHaveAttribute(
      "name",
      "sign_off_name",
    );
    const role = screen.getByLabelText("Their role");
    expect([...role.querySelectorAll("option")].map((option) => option.textContent)).toEqual([
      "CA",
      "CS",
      "Lawyer",
    ]);
    expect(screen.getByLabelText("On")).toHaveValue("2026-11-14");
    expect(screen.getByText(SIGN_OFF_HINT)).toBeInTheDocument();
    expect(screen.getByLabelText("Why")).toBeInTheDocument();
  });

  it("asks only why on a date he typed", () => {
    render(<NotForUsFields prefix="typed" statutory={false} today="2026-11-14" />);
    expect(screen.queryByLabelText("Who confirmed it does not apply")).toBeNull();
    expect(screen.getByLabelText("Why")).toBeInTheDocument();
  });
});
