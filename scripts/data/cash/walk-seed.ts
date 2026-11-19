/**
 * What the cash walk and the tests feed the view (ws-notes/duties/spec.md §5.3, §7.7): §5.3's
 * example, placed relative to the Monday of the week of today so that the week table reads the
 * same figures whatever day the walk runs. Every name is invented.
 */

import { addDays } from "../days";
import { mondayOf } from "./weeks";

/** The walk intern of the people walk is "Walk Intern"; this one is the cash walk's own. */
export const WALK_CASH_PERSON = { person_id: "walk-cash-intern", name: "Walk Intern One" };

/** §5.3's figures, from a day: opening on the Saturday before week 1's Monday less a week. */
export function walkCashFeeds(today: string) {
  const monday = mondayOf(today);
  const openingOn = addDays(monday, -9);
  return {
    opening: { currency: "INR", amount_minor: 120_000_000, as_of: openingOn },
    statements: [
      {
        currency: "INR",
        as_of: openingOn,
        cash_minor: 120_000_000,
        gross_burn_minor: 15_000_000,
        avg_net_burn_minor: 15_000_000,
        months: 3,
        collected_minor: 0,
        uncategorised: 0,
      },
    ],
    bills: [
      {
        bill_id: "walk-cash-bill",
        vendor_id: "walk-cash-vendor",
        vendor_name: "Walk Legal LLP",
        invoice_number: "WALK-INV-0011",
        invoice_on: addDays(monday, -20),
        currency: "INR",
        total_minor: 5_900_000,
        payable_minor: 5_900_000,
        open_minor: 5_900_000,
        category_id: null,
        pay_by: addDays(monday, 9),
        payments: [],
        cancelled: false,
        href: "/data/money/bills/walk-cash-bill",
      },
    ],
    owed: [
      {
        person_id: WALK_CASH_PERSON.person_id,
        name: WALK_CASH_PERSON.name,
        period: addDays(monday, 21).slice(0, 7),
        due_on: addDays(monday, 21),
        amount_minor: 1_500_000,
        currency: "INR",
      },
    ],
    lines: [
      {
        line_id: "walk-cash-expected",
        kind: "expected_in",
        on: addDays(monday, 31),
        currency: "INR",
        amount_minor: 10_000_000,
        name: "Walk Customer One",
        sure: false,
        counted_at: 20,
      },
    ],
    /** §5.3's scenario: a raise of ₹85,00,000 two months after the opening's month, a hire after three. */
    events: [
      {
        event_id: "walk-cash-raise",
        kind: "money_in",
        name: "The seed round",
        months: 3,
        amount_minor: 850_000_000,
        flagged: true,
      },
      {
        event_id: "walk-cash-hire",
        kind: "monthly_cost",
        name: "First engineer",
        months: 4,
        amount_minor: 6_000_000,
        flagged: true,
      },
    ],
  };
}
