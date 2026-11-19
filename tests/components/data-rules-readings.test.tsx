import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

/**
 * Key dates › Rules with the duty rules (duties spec §7.2): a rule the sources disagree on
 * shows "Sources disagree", each reading with its sentence and its own source, and the line
 * that nothing is worked out until it is confirmed; its confirm form asks which reading (or
 * his own amount); a rule not yet in force says from when; a rule nobody confirms says so and
 * has no confirm form; the count line counts only rules that can be confirmed; and no "%"
 * anywhere. Every name is invented.
 */

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { RulesView, type RuleActions } from "@/components/data/dates/rules-view";
import type { RuleView } from "@/lib/data/api/dates";
import { INITIAL_ACTION_STATE, type ActionState } from "@/lib/forms/action-state";

const act = async (): Promise<ActionState> => INITIAL_ACTION_STATE;
const ACTIONS: RuleActions = { amount: act, confirm: act, unconfirm: act, move: act };
const TODAY = "2026-11-18";

const base = {
  default_amount: null,
  changed: false,
  verified_on: "2026-11-14",
  confirmed: null,
  confirmation_dropped: false,
  late_words: "",
  used_by: 0,
  movable: 0,
  duty: true as const,
  usable: false,
  starts_on: null,
  reading: null,
  readings: [],
};

const realisation: RuleView = {
  ...base,
  key: "export-realisation",
  area: "export",
  title: "Bring the money home for an export invoice",
  from: "the invoice date",
  clock: "The sources give 9 months and 15 months.",
  amount: null,
  unit: "months",
  sources: [{ name: "Walk source one", url: "https://walk-one.example/rbi" }],
  confirm_with: "bank",
  only_when_confirmed: true,
  note: "Your AD bank or CA confirms which applies to your invoices.",
  sense: "within",
  readings: [
    {
      label: "9 months",
      words: "Two sources of September and October 2026.",
      sources: [{ name: "Walk source two", url: "https://walk-two.example/nine" }],
    },
    {
      label: "15 months",
      words: "Two sources of November 2025 and March 2026.",
      sources: [{ name: "Walk source three", url: "https://walk-three.example/fifteen" }],
    },
  ],
};

const dpdp: RuleView = {
  ...base,
  key: "dpdp-board-report",
  area: "security",
  title: "Detailed report of a personal data breach to the Data Protection Board",
  from: "becoming aware of the breach",
  clock: "72 hours after becoming aware of the breach",
  amount: 72,
  default_amount: 72,
  unit: "hours",
  sources: [{ name: "Walk source four", url: "https://walk-four.example/dpdp" }],
  confirm_with: "lawyer",
  only_when_confirmed: false,
  note: "",
  sense: "within",
  starts_on: "2027-05-12",
};

const closeBy: RuleView = {
  ...base,
  key: "close-by",
  area: "books",
  title: "Close the month and send the CA's pack",
  from: "the end of the month",
  clock: "5 working days after the end of the month",
  amount: 5,
  default_amount: 5,
  unit: "working_days",
  sources: [{ name: "Walk source five", url: "https://walk-five.example/mis" }],
  confirm_with: null,
  only_when_confirmed: false,
  note: "Practice, not law: three to five working days.",
  sense: "within",
  usable: true,
};

const rate: RuleView = {
  ...base,
  key: "tds-rate-professional",
  area: "tds",
  title: "Rate: professional fees",
  from: "the amount paid or credited",
  clock: "10 per cent of the amount paid or credited",
  amount: 10,
  default_amount: 10,
  unit: "per_cent",
  sources: [{ name: "Walk source six", url: "https://walk-six.example/tds" }],
  confirm_with: "CA",
  only_when_confirmed: false,
  note: "",
  sense: "rate",
  usable: true,
};

function draw(rules: RuleView[]) {
  return render(
    <RulesView
      rules={rules}
      counts={{ all: rules.length, confirmed: 0, changed: 0, confirmable: 3 }}
      today={TODAY}
      actions={ACTIONS}
    />,
  );
}

describe("the duty rules in Key dates › Rules", () => {
  it("shows both readings, their sources and the silent line for a disputed rule", () => {
    const { container } = draw([realisation, dpdp, closeBy, rate]);
    const row = container.querySelector("#rule-export-realisation") as HTMLElement;
    expect(row).not.toBeNull();
    const text = row.textContent ?? "";
    expect(text).toContain("Sources disagree");
    expect(text).toContain("Nothing is worked out from this rule until it is confirmed.");
    expect(text).toContain("9 months");
    expect(text).toContain("Two sources of September and October 2026.");
    expect(text).toContain("15 months");
    expect(text).toContain("Two sources of November 2025 and March 2026.");
    expect(text).toContain("The sources give 9 months and 15 months.");
    const links = within(row)
      .getAllByRole("link", { name: "Source" })
      .map((link) => link.getAttribute("href"));
    expect(links).toEqual(
      expect.arrayContaining([
        "https://walk-one.example/rbi",
        "https://walk-two.example/nine",
        "https://walk-three.example/fifteen",
      ]),
    );
    expect(text).toContain("Confirm with your bank");
  });

  it("asks which reading was confirmed, the first chosen, or his own amount", () => {
    const { container } = draw([realisation]);
    const radios = [
      ...container.querySelectorAll<HTMLInputElement>(
        '#rule-export-realisation input[name="reading"]',
      ),
    ];
    expect(radios.map((radio) => radio.value)).toEqual(["0", "1", "own"]);
    expect(radios.map((radio) => radio.defaultChecked)).toEqual([true, false, false]);
    expect(
      container.querySelector('#rule-export-realisation input[name="own_amount"]'),
    ).not.toBeNull();
    const roles = [
      ...container.querySelectorAll<HTMLOptionElement>(
        '#rule-export-realisation select[name="role"] option',
      ),
    ].map((option) => option.textContent);
    expect(roles).toEqual(["CA", "CS", "Lawyer", "Trademark agent", "Bank"]);
  });

  it("says when a rule comes into force, and what a rule nobody confirms is", () => {
    const { container } = draw([realisation, dpdp, closeBy, rate]);
    expect(container.querySelector("#rule-dpdp-board-report")?.textContent).toContain(
      "In force from 12 May 2027.",
    );
    const close = container.querySelector("#rule-close-by") as HTMLElement;
    expect(close.textContent).toContain("Your own practice");
    expect(within(close).queryByText("Record a confirmation")).toBeNull();
    expect(within(close).getByText("Change the amount")).toBeTruthy();
  });

  it("puts each area in its own table and counts the rules that can be confirmed", () => {
    draw([realisation, dpdp, closeBy, rate]);
    expect(screen.getByText("0 of 3 rules confirmed")).toBeTruthy();
    for (const caption of [
      "Export invoices",
      "Security incidents and notices",
      "Books and vouchers",
      "Tax deducted from Indian vendors",
    ])
      expect(screen.getAllByText(caption).length).toBeGreaterThan(0);
  });

  it("never writes a per cent sign", () => {
    const { container } = draw([realisation, dpdp, closeBy, rate]);
    expect(container.textContent ?? "").not.toContain("%");
    expect(container.textContent ?? "").toContain("10 per cent of the amount paid or credited");
  });
});
