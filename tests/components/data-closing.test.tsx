import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  ClosingSectionView,
  OPENS_AT_SOFT,
  type ClosingActions,
} from "@/components/data/closing/closing-section-view";
import type { ClosingPage, Closing } from "@/lib/data/api/closing";
import { OFFERS_LINE } from "@/lib/data/labels-close";
import type { ActionState } from "@/lib/forms/action-state";

/**
 * The Closing section on an investor firm's page (ws-notes/company/spec.md §9.7.7), drawn
 * from fixed data: the guardrail callouts with their Source links and who to confirm with,
 * the deadlines line, the checklist's rows and the Key dates each step added; never a
 * progress bar, a meter or "%", and the offers line in words. Every firm is invented.
 */

const ID = "c4000000000000000000000000000281";
const WALKER = { staff_id: "walk-owner", name: "Walk Owner" };
const AT = "2027-03-14T06:00:00.000Z";
const action = vi.fn(async (): Promise<ActionState> => ({
  status: "sent",
  message: "Done.",
  sentAt: 1,
}));
const ACTIONS: ClosingActions = {
  start: action,
  terms: action,
  step: action,
  clear: action,
  addDates: action,
  refundDate: action,
};

const CLOSING: Closing = {
  closing_id: ID,
  investor_id: ID,
  firm: "Walk Fund 281",
  instrument: "iSAFE",
  class_id: "stand-in-equity",
  shares: 1_250,
  price_per_share: 1_000,
  holder: { name: "Walk Fund 281", kind: "fund", email: "", address: "" },
  pooled: null,
  documents_sent: null,
  documents_signed: null,
  offer_letter: { on: "2027-01-05", serial: "PAS-4/001", file_id: null, at: AT, by: WALKER },
  money_received: {
    on: "2027-01-12",
    amount: 2_500_000,
    currency: "INR",
    own_account: true,
    reference: "WALK-FIRC-1",
    firc_file_id: null,
    at: AT,
    by: WALKER,
  },
  bank_kyc: { on: "2027-01-13", from_receiving_bank: false, file_id: null, at: AT, by: WALKER },
  valuation: null,
  board_approval: null,
  allotment: {
    on: "2027-03-12",
    shares: 1_250,
    price_per_share: 1_000,
    class_id: "stand-in-equity",
    at: AT,
    by: WALKER,
  },
  register: null,
  certificate: null,
  refund: null,
  notes: "",
  created_at: AT,
  created_by: WALKER,
  updated_at: AT,
  updated_by: WALKER,
};

const link = (
  rule: string,
  origin: string,
  title: string,
  due: string,
  state: "coming_up" | "done" = "coming_up",
) => ({
  date_id: `stand-in-${rule}`,
  rule_key: rule,
  origin_key: origin,
  title,
  due_on: due,
  state,
  overdue: false,
  evidence: { srn: "", challan: "", filed_on: null, fee_paid: null, filed_file_id: null, note: "" },
  href: `/data/dates#date-stand-in-${rule}`,
});

function page(change: Partial<ClosingPage> = {}): ClosingPage {
  return {
    ok: true,
    closing: CLOSING,
    firm: {
      investor_id: ID,
      firm: "Walk Fund 281",
      stage: "signed",
      residency: "non_resident",
      latest: { state: "signed", amount: 25_000, currency: "USD", instrument: "SAFE" },
      contact: null,
    },
    guardrails: [
      {
        key: "receiving-bank",
        words:
          "For a non-resident, the FIRC and the investor's KYC come from the bank that received the money.",
        extra: "",
        short: "KYC not from the receiving bank",
        source_url: "https://treelife.in/compliance/fc-gpr-filing-after-foreign-investment/",
        confirm_with: "CS",
      },
    ],
    deadlines: [
      { rule_key: "allotment", title: "Allot by", on: "2027-03-13", done_on: "2027-03-12" },
      { rule_key: "pas-3", title: "PAS-3 by", on: "2027-03-27", done_on: null },
      { rule_key: "register-entry", title: "Register by", on: "2027-03-19", done_on: null },
      { rule_key: "share-certificates", title: "Certificates by", on: "2027-05-12", done_on: null },
      { rule_key: "fc-gpr", title: "FC-GPR by", on: "2027-04-11", done_on: null },
    ],
    key_dates: [
      link(
        "allotment",
        `closing:${ID}:money`,
        "Allot shares to Walk Fund 281, or refund",
        "2027-03-13",
        "done",
      ),
      link("pas-3", `closing:${ID}:allotment`, "PAS-3: allotment to Walk Fund 281", "2027-03-27"),
    ],
    missing_dates: true,
    refund_date_due: false,
    register: null,
    resolutions: null,
    classes: [{ class_id: "stand-in-equity", name: "Equity shares of ₹10 each" }],
    can_start: false,
    key_dates_here: true,
    members_here: true,
    company: null,
    round: {
      special_resolution: null,
      separate_account: null,
      valuation: null,
      firms_registered: null,
    },
    events: [],
    today: "2027-03-14",
    ...change,
  };
}

describe("the Closing section", () => {
  it("draws the guardrails with their sources, the deadlines line and the checklist", () => {
    const { container } = render(
      <ClosingSectionView investorId={ID} read={{ ok: true, data: page() }} actions={ACTIONS} />,
    );
    const section = container.querySelector('[data-section="investor-closing"]') as HTMLElement;
    const callout = within(section).getByText(/the bank that received the money\./, {
      selector: "span",
    });
    expect(callout.textContent).toContain("Confirm with your CS.");
    const source = within(callout).getByRole("link", { name: "Source" });
    expect(source.getAttribute("href")).toBe(
      "https://treelife.in/compliance/fc-gpr-filing-after-foreign-investment/",
    );
    expect(source.getAttribute("rel")).toContain("noopener");
    const line = section.querySelector("[data-deadlines]")?.textContent ?? "";
    expect(line).toBe(
      "Allotted 12 Mar 2027 · PAS-3 by 27 Mar 2027 · Register by 19 Mar 2027 · Certificates by 12 May 2027 · FC-GPR by 11 Apr 2027",
    );
    const money = section.querySelector('tr[data-step="money-received"]') as HTMLElement;
    expect(money.textContent).toContain("12 Jan 2027");
    expect(money.textContent).toContain("₹25,00,000 from their own account · FIRC WALK-FIRC-1");
    expect(money.textContent).toContain("Allot shares to Walk Fund 281, or refund");
    expect(within(money).getByText("Done")).toBeTruthy();
    const allotment = section.querySelector('tr[data-step="allotment"]') as HTMLElement;
    expect(allotment.textContent).toContain(
      "1,250 shares at ₹1,000 a share · Equity shares of ₹10 each",
    );
    expect(allotment.textContent).toContain("PAS-3: allotment to Walk Fund 281");
    // Bank KYC shows for a non-resident; Refund only before the allotment.
    expect(section.querySelector('tr[data-step="bank-kyc"]')).not.toBeNull();
    expect(section.querySelector('tr[data-step="refund"]')).toBeNull();
    expect(within(section).getByText("Walk Fund 281, a fund")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Add the deadlines now" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Add the refund date to Key dates" })).toBeNull();
    expect(section.textContent).toContain("This is a record to keep, not legal advice.");
  });

  it("has no progress bar, no meter and no per cent sign", () => {
    const { container } = render(
      <ClosingSectionView investorId={ID} read={{ ok: true, data: page() }} actions={ACTIONS} />,
    );
    expect(
      container.querySelectorAll('[role="progressbar"], [role="meter"], progress, meter, .meter'),
    ).toHaveLength(0);
    expect(container.textContent).not.toContain("%");
  });

  it("before Soft commit says one quiet line; at Soft commit offers the start", () => {
    const early = render(
      <ClosingSectionView
        investorId={ID}
        read={{
          ok: true,
          data: page({ closing: null, guardrails: [], deadlines: [], can_start: false }),
        }}
        actions={ACTIONS}
      />,
    );
    expect(early.container.textContent).toContain(OPENS_AT_SOFT);
    early.unmount();
    render(
      <ClosingSectionView
        investorId={ID}
        read={{
          ok: true,
          data: page({ closing: null, guardrails: [], deadlines: [], can_start: true }),
        }}
        actions={ACTIONS}
      />,
    );
    expect(screen.getByRole("button", { name: "Start the closing checklist" })).toBeTruthy();
  });

  it("without Key dates says so beside the worked-out days", () => {
    const { container } = render(
      <ClosingSectionView
        investorId={ID}
        read={{
          ok: true,
          data: page({ key_dates: null, key_dates_here: false, missing_dates: false }),
        }}
        actions={ACTIONS}
      />,
    );
    expect(container.textContent).toContain(
      "Key dates is not set up here yet, so these dates are not in it.",
    );
    expect(container.querySelector("[data-deadlines]")?.textContent).toContain(
      "PAS-3 by 27 Mar 2027",
    );
  });

  it("the offers line is words, never a bar or a fraction of the limit alone", () => {
    expect(OFFERS_LINE(1, "2026-27", 200)).toBe(
      "1 offered in 2026-27. The law allows 200 a year per class of shares; a syndicate or fund counts once.",
    );
    expect(OFFERS_LINE(0, "2027-28", 200)).not.toMatch(/%|of 200$/);
  });
});
