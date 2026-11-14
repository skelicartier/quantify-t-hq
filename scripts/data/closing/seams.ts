/**
 * What the closing reads of the investor firms (ws-notes/company/spec.md §9.2): the
 * `investors-close` provider, which C4 adds to the investors module. C4-internal: no other
 * unit needs it, so it is typed here and not in the contract file.
 */

import type { AmountState, InvestorStage } from "../../../src/lib/data/labels";

export const INVESTORS_CLOSE = "investors-close";

export type CloseFirm = {
  investor_id: string;
  firm: string;
  stage: InvestorStage;
  /** From the firm's qualification (raise §5.2): "" when not known. */
  residency: "resident" | "non_resident" | "";
  latest: {
    state: AmountState;
    amount: number;
    currency: "USD" | "INR";
    instrument: string;
  } | null;
  contact: { email: string; name: string } | null;
};

export type InvestorsClose = {
  firm(investorId: string): CloseFirm | null;
  /** The round's instrument (raise §5.2), or null with no round recorded. */
  roundInstrument(): string | null;
};
