import { StatusPill } from "@/components/ui/status-pill";
import { AMOUNT_STATES, INVESTOR_STAGES, labelOf, toneOf } from "@/lib/data/labels";
import { formatMoney } from "@/lib/format";

/** An investor firm's one stage, as the list, the tabs and the record show it. */
export function InvestorStagePill({ stage }: { stage: string }) {
  return (
    <StatusPill
      value={stage}
      label={labelOf(INVESTOR_STAGES, stage)}
      tone={toneOf(INVESTOR_STAGES, stage)}
    />
  );
}

/**
 * One recorded amount in its own currency with what it is: "$50,000 · Soft". Never a
 * share of anything: there is no target to measure it against.
 */
export function amountWords(
  amount: { state: string; amount: number; currency: string } | null,
): string {
  if (!amount) return "None recorded";
  return `${formatMoney(amount.amount, amount.currency)} · ${labelOf(AMOUNT_STATES, amount.state)}`;
}
