/**
 * What the company record works out (ws-notes/company/spec.md §5.2, §6.5), pure: each
 * director's DIR-3 KYC due day and DSC row, the rows "What the facts decide" lists on
 * Company › Facts, and the words each row says about where its day came from. Nothing here
 * reads a file or the clock; `today` is given.
 */

import { fyStartYear, type RuleKey } from "../company-contracts";
import { addDays } from "../days";
import type { DateKind, Repeats } from "../../../src/lib/data/labels";
import { CONTACT_FIELDS, dayWords, firstFyEndOptions } from "../../../src/lib/data/labels-company";
import type { ContactChange, Director } from "../company/types";
import { amountIn, firstAgm, nextAgm, type Facts } from "./catalogue";

export { firstFyEndOptions };

/** The three-year rule began on 31 Mar 2026: before FY 2025-26 the next KYC is the CS's to say. */
const KYC_FROM_FY = 2025;

/**
 * A director's next DIR-3 KYC (§5.2): from the last KYC filed in FY 2025-26 or later, 30 June
 * of that financial year's start plus his amount of years; with none, from a DIN allotted in
 * FY 2025-26 or later, one year more; otherwise no day.
 */
export function kycDue(
  director: Pick<Director, "kyc" | "din_allotted_on" | "name">,
  facts: Facts,
): { due_on: string | null; words: string; from_fact: string | null } {
  const years = amountIn(facts, "dir-3-kyc");
  const last = director.kyc.last_filed_on;
  if (last && fyStartYear(last) >= KYC_FROM_FY) {
    const due = `${fyStartYear(last) + years}-06-30`;
    return {
      due_on: due,
      words: dayWords(due),
      from_fact: `From ${director.name}'s KYC filed ${dayWords(last)}`,
    };
  }
  const allotted = director.din_allotted_on;
  if (!last && allotted && fyStartYear(allotted) >= KYC_FROM_FY) {
    const due = `${fyStartYear(allotted) + years + 1}-06-30`;
    return {
      due_on: due,
      words: dayWords(due),
      from_fact: `From ${director.name}'s DIN allotted ${dayWords(allotted)}`,
    };
  }
  return { due_on: null, words: "Ask your CS", from_fact: null };
}

export const KYC_ASK =
  "Ask your CS when this director's next KYC is due: the three-year rule began on 31 Mar 2026.";

/** "20261231" from "2026-12-31", for a suggestion's key. */
const compact = (day: string): string => day.replace(/-/g, "");

/** A row the company record suggests: one per director (KYC, DSC). */
export type RecordSuggestion = {
  key: string;
  title: string;
  kind: DateKind;
  repeats: Repeats;
  remind_days: 0 | 2 | 7 | 14;
  rule_key: RuleKey | null;
  statutory: boolean;
  next: string | null;
  from_fact: string;
  needs: string | null;
  origin: { key: string; label: string; href: string };
  base_on: string | null;
};

export const dscOrigin = (directorId: string): string => `company:${directorId}:dsc`;
export const kycOrigin = (directorId: string): string => `company:${directorId}:kyc`;
export const changeOrigin = (changeId: string): string => `company:${changeId}`;
export const directorHref = (directorId: string): string => `/data/company/directors/${directorId}`;

/** The DSC and DIR-3 KYC rows of each director in office (§6.5). */
export function directorSuggestions(
  directors: readonly Director[],
  facts: Facts,
): RecordSuggestion[] {
  const rows: RecordSuggestion[] = [];
  for (const director of directors) {
    const origin = (key: string) => ({
      key,
      label: `Director: ${director.name}`,
      href: directorHref(director.director_id),
    });
    if (director.dsc.expires_on)
      rows.push({
        key: `director-dsc-${director.director_id}-${compact(director.dsc.expires_on)}`,
        title: `Director's DSC: ${director.name}`,
        kind: "renewal",
        repeats: "never",
        remind_days: 14,
        rule_key: null,
        statutory: false,
        next: director.dsc.expires_on,
        from_fact: `From ${director.name}'s DSC, expiring ${dayWords(director.dsc.expires_on)}`,
        needs: null,
        origin: origin(dscOrigin(director.director_id)),
        base_on: null,
      });
    const kyc = kycDue(director, facts);
    rows.push({
      key: `dir-3-kyc-${director.director_id}-${kyc.due_on ? kyc.due_on.slice(0, 4) : "ask"}`,
      title: `DIR-3 KYC: ${director.name}`,
      kind: "filing",
      repeats: "never",
      remind_days: 14,
      rule_key: "dir-3-kyc",
      statutory: true,
      next: kyc.due_on,
      from_fact: kyc.from_fact ?? `From ${director.name}'s record`,
      needs: kyc.due_on ? null : `Ask your CS when ${director.name}'s next KYC is due.`,
      origin: origin(kycOrigin(director.director_id)),
      base_on: null,
    });
  }
  return rows;
}

/** The DIR-3 KYC-Web filing a contact change starts, as `key-dates` adds it (§6.5). */
export function changeItem(change: ContactChange, director: Pick<Director, "name">) {
  return {
    origin: {
      key: changeOrigin(change.change_id),
      label: `Contact change: ${director.name}`,
      href: directorHref(change.director_id),
    },
    rule_key: "dir-3-kyc-change" as const,
    base_on: change.changed_on,
    title: `DIR-3 KYC-Web: ${director.name}'s new ${CONTACT_FIELDS[change.field].toLowerCase()}`,
    kind: "filing" as const,
  };
}

/** The rows of "What the facts decide" (§6.7.2). */
export function decides(input: {
  facts: Facts;
  directors: readonly Director[];
  agm: { on: string; from: "meetings" | "typed" } | null;
}): { rule: string; worked_out: string; from: string }[] {
  const { facts } = input;
  const rows: { rule: string; worked_out: string; from: string }[] = [];
  if (input.agm)
    rows.push({
      rule: "Next AGM",
      worked_out: `By ${dayWords(nextAgm(input.agm.on, facts))}`,
      from: `AGM held ${dayWords(input.agm.on)}${input.agm.from === "meetings" ? ", from Meetings" : ""}`,
    });
  else if (facts.first_fy_end)
    rows.push({
      rule: "First AGM",
      worked_out: `By ${dayWords(firstAgm(facts.first_fy_end, facts))}`,
      from: `First financial year ends ${dayWords(facts.first_fy_end)}`,
    });
  else
    rows.push({
      rule: "First AGM",
      worked_out: "Not known",
      from: "Needs the incorporation day and the first financial year's end",
    });
  rows.push({
    rule: "Annual return",
    worked_out:
      facts.small === "yes"
        ? "MGT-7A, as a small company"
        : facts.small === "no"
          ? "MGT-7"
          : "Not known until Small company is answered",
    from: `Small company: ${facts.small === "yes" ? "Yes" : facts.small === "no" ? "No" : "Not known"}`,
  });
  const small = facts.small === "yes" || facts.startup === "yes";
  const other = facts.small === "no" && facts.startup === "no";
  rows.push({
    rule: "Board meetings",
    worked_out: small
      ? `One in each half of the year, at least ${amountIn(facts, "board-gap-small")} days apart`
      : other
        ? `Four a year, at most ${amountIn(facts, "board-gap-other")} days apart`
        : "Not known",
    from: small
      ? facts.small === "yes"
        ? "Small company: Yes"
        : "DPIIT-recognised startup: Yes"
      : other
        ? "Small company: No · DPIIT-recognised startup: No"
        : "Needs Small company and DPIIT-recognised startup",
  });
  if (!facts.incorporated_on)
    rows.push({ rule: "INC-20A", worked_out: "Not known", from: "Needs the incorporation day" });
  else if (facts.incorporated_on < "2018-11-02")
    rows.push({
      rule: "INC-20A",
      worked_out: "Does not apply",
      from: `Incorporated ${dayWords(facts.incorporated_on)}, before 2 Nov 2018`,
    });
  else
    rows.push({
      rule: "INC-20A",
      worked_out: `Due ${dayWords(addDays(facts.incorporated_on, amountIn(facts, "inc-20a")))}`,
      from: `Incorporated ${dayWords(facts.incorporated_on)}`,
    });
  for (const director of input.directors) {
    const kyc = kycDue(director, facts);
    rows.push({
      rule: `DIR-3 KYC: ${director.name}`,
      worked_out: kyc.due_on ? `By ${kyc.words}` : "Ask your CS",
      from: director.kyc.last_filed_on
        ? `KYC filed ${dayWords(director.kyc.last_filed_on)}`
        : director.din_allotted_on
          ? `DIN allotted ${dayWords(director.din_allotted_on)}`
          : "No KYC or DIN day recorded",
    });
  }
  return rows;
}
