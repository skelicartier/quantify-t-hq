import type { ReactNode } from "react";
import Link from "next/link";

import { RuleLineNote, ruleHref, type RuleLine } from "@/components/data/duties/rule-line";
import { MoneyTabs, type MoneyTab } from "@/components/data/money/money-tabs";
import { StatusPill } from "@/components/ui/status-pill";
import { dayWords } from "@/lib/data/labels-company";
import { minorWords } from "@/lib/data/labels-duties";
import { BILL_STATES, MONEY_ABOUT, RULES_ABSENT, type BillState } from "@/lib/data/labels-money";

/**
 * What every Money page carries (ws-notes/duties/spec.md §8.6): the strip of views (the
 * Statements tab for the Owner only), the About line of §2 rule 3, and — in a copy without the
 * rule book — the one sentence that says why no day or comparison is worked out.
 */
export function MoneyBody({
  current,
  owner,
  rulesHere,
  children,
}: {
  current: MoneyTab;
  owner: boolean;
  /** False: the rule book is not loaded, so nothing rule-driven is worked out. */
  rulesHere: boolean;
  children: ReactNode;
}) {
  return (
    <>
      <MoneyTabs current={current} owner={owner} />
      <div className="hqdata-money">
        <p className="page-note">{MONEY_ABOUT}</p>
        {!rulesHere && <p className="page-note">{RULES_ABSENT}</p>}
        {children}
      </div>
    </>
  );
}

export function BillStatePill({ state }: { state: BillState }) {
  const labelled = BILL_STATES[state];
  return <StatusPill value={state} label={labelled.label} tone={labelled.tone} />;
}

/** "18 Nov 2026 (15-day limit)", "18 Nov 2026 (your date)" or "None set". */
export function payByWords(payBy: string | null, short: string): string {
  if (!payBy) return "None set";
  return short ? `${dayWords(payBy)} ${short}` : dayWords(payBy);
}

/** An amount in its own currency, or a quiet dash for none. */
export function Money({ minor, currency }: { minor: number | null; currency: string }) {
  if (minor === null) return <span className="quiet">—</span>;
  return <span className="hqdata-money__figure">{minorWords(minor, currency)}</span>;
}

/** A rule's source, as a link on screen and its address on paper. */
export function Source({ url }: { url: string }) {
  return (
    <>
      <a className="text-link" href={url} rel="noreferrer" target="_blank">
        Source
      </a>
      <span className="hqdata-print-only"> ({url})</span>
    </>
  );
}

/** "Realise by": a day with its rule line, or why nothing is worked out. */
export function RealiseBy({
  row,
}: {
  row: {
    realise_by: string | null;
    readings: readonly string[];
    rules: { realisation: RuleLine | null };
  };
}) {
  if (row.realise_by)
    return (
      <>
        {dayWords(row.realise_by)}
        <RuleLineNote line={row.rules.realisation} />
      </>
    );
  if (row.readings.length > 0)
    return (
      <>
        Not worked out: the sources give {row.readings.join(" and ")}.
        {row.rules.realisation && (
          <span className="hqdata-rule-line">
            <Link href={ruleHref(row.rules.realisation.key)}>
              Nothing is worked out until your bank confirms one.
            </Link>
          </span>
        )}
      </>
    );
  return <span className="quiet">Not worked out</span>;
}
