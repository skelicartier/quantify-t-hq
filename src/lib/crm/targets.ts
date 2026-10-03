/** How a target account's tier and its wait for a touch are written. */
export const TIER_LABELS: Readonly<Record<number, string>> = {
  1: "Tier 1 — the most wanted",
  2: "Tier 2",
  3: "Tier 3 — worth a look",
};

export function tierShort(tier: number): string {
  return `Tier ${tier}`;
}

/** "Never touched", "Touched today", "16 days since a touch". */
export function untouchedWords(days: number | null): string {
  if (days === null) return "Never touched";
  if (days === 0) return "Touched today";
  return `${days} day${days === 1 ? "" : "s"} since a touch`;
}
