import Link from "next/link";

import { dayWords } from "@/lib/data/labels-company";

import "./rule-line.css";

/**
 * What an answer carries beside a day or a comparison worked out from a duty rule: the shape
 * of `RuleLine` in `scripts/data/duties-contracts.ts`, declared again here because pages never
 * import from `scripts/`.
 */
export type RuleLine = {
  key: string;
  title: string;
  confirm_with: "CA" | "CS" | "lawyer" | "agent" | "bank" | null;
  confirmed_by: string | null;
  confirmed_on: string | null;
  /** False: nothing was worked out; `readings` says what the sources give. */
  usable: boolean;
  /** The day it comes into force, while that is still ahead; else null. */
  starts_on: string | null;
  /** The labels of the readings, when the sources disagree and nothing is confirmed; else []. */
  readings: readonly string[];
};

const WHO: Record<NonNullable<RuleLine["confirm_with"]>, string> = {
  CA: "your CA",
  CS: "your CS",
  lawyer: "your lawyer",
  agent: "your trademark agent",
  bank: "your bank",
};

/** Where the rule is, in Key dates › Rules. */
export const ruleHref = (key: string): string => `/data/dates?view=rules#rule-${key}`;

/** "a and b"; "a, b and c". */
function joined(items: readonly string[]): string {
  if (items.length < 2) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1] ?? ""}`;
}

/**
 * A rule's state beside the value worked out from it (ws-notes/duties/spec.md §3.4): who to
 * confirm it with, who confirmed it and when, the readings the sources disagree on, or the day
 * it comes into force. Nothing for no rule, and nothing for a rule nobody confirms.
 */
export function RuleLineNote({ line }: { line: RuleLine | null }) {
  if (!line) return null;
  const href = ruleHref(line.key);
  const who = line.confirm_with ? WHO[line.confirm_with] : null;
  if (line.readings.length > 0)
    return (
      <span className="hqdata-rule-line">
        The sources give {joined(line.readings)}.{" "}
        <Link href={href}>
          {who
            ? `Nothing is worked out until ${who} confirms one.`
            : "Nothing is worked out until one is confirmed."}
        </Link>
      </span>
    );
  if (line.starts_on)
    return <span className="hqdata-rule-line">Not in force until {dayWords(line.starts_on)}.</span>;
  if (line.confirmed_by !== null)
    return (
      <span className="hqdata-rule-line">
        <Link href={href}>
          Confirmed by {line.confirmed_by}
          {line.confirmed_on ? `, ${dayWords(line.confirmed_on)}` : ""}
        </Link>
      </span>
    );
  if (line.usable && who)
    return (
      <span className="hqdata-rule-line">
        <Link href={href}>Confirm with {who}</Link>
      </span>
    );
  return null;
}
