/**
 * The `key-dates` service (ws-notes/company/spec.md §6.6): how a record that starts a
 * statutory clock (a special resolution, money received, an allotment, a contact change)
 * puts its filing into Key dates, so the Key date, with its evidence, is the one record of
 * that filing. One date per origin and rule; a rule waiting for his CA's or CS's
 * confirmation adds none; a moved event moves its open dates; a step recorded on the record
 * marks its date done; an event taken back leaves its open dates "Taken back" and its done
 * ones as they are. Also what the company module asks of Key dates (`KeyDatesInternal`).
 */

import { Refused } from "../../mail-merge/engine";
import {
  NO_EVIDENCE,
  dueFrom,
  isRuleKey,
  ruleOf,
  type Evidence,
  type FromRecord,
  type KeyDateLink,
  type KeyDatesService,
  type OwnerRole,
  type RuleKey,
} from "../company-contracts";
import type { DataCore } from "../core";
import { LIMITS, clean, cleanText, isDay } from "../guard";
import type { Staff } from "../protocol";
import { OWNER_ROLES, confirmWords } from "../../../src/lib/data/labels-company";
import { DEFAULT_ENTITY, openDate, type DatesBook, type KeyDate } from "./book";
import type { Facts } from "./catalogue";
import { clockWords, type RuleBook } from "./rules";

/** A date of an origin, rule or none (a director's DSC follows no clock). */
export type OriginLink = Omit<KeyDateLink, "rule_key"> & { rule_key: RuleKey | null };

/** What the company module asks of Key dates besides the contract's service. */
export type KeyDatesInternal = KeyDatesService & {
  /** The facts as Key dates works its suggestions out with them, his amounts included. */
  facts(): Facts;
  /** The last AGM held: from Meetings when it is later, else the day typed on Key dates. */
  lastAgm(): { on: string; from: "meetings" | "typed" } | null;
  /** How many rules and calendar dates no CA or CS has confirmed. */
  rulesUnconfirmed(): number;
  /** Every date of these origins, rule or none, earliest first. */
  datesOf(originKeys: readonly string[]): OriginLink[];
  /** A director's DSC expiry moved: its open date moves too, under the new suggestion key. */
  moveDsc(originKey: string, expiresOn: string, suggestionKey: string): void;
};

const KINDS = new Set(["filing", "board", "other"]);
const OWNER_KEYS = new Set<string>(Object.keys(OWNER_ROLES));

/** A date as the records that started it see it. */
export function linkOf(date: KeyDate, today: string): OriginLink {
  return {
    date_id: date.date_id,
    rule_key: date.rule_key,
    origin_key: date.origin?.key ?? "",
    title: date.title,
    due_on: date.due_on,
    state: date.state,
    overdue: openDate(date) && date.due_on < today,
    evidence: { ...date.evidence },
    href: `/data/dates#date-${date.date_id}`,
  };
}

const byDue = (a: OriginLink, b: OriginLink): number =>
  a.due_on.localeCompare(b.due_on) || String(a.rule_key).localeCompare(String(b.rule_key));

export function keyDatesService(
  core: DataCore,
  book: DatesBook,
  rules: RuleBook,
  context: {
    facts(): Facts;
    lastAgm(): { on: string; from: "meetings" | "typed" } | null;
  },
): KeyDatesInternal {
  const today = () => core.day();
  const datesOf = (originKeys: readonly string[]): OriginLink[] => {
    const keys = new Set(originKeys);
    return book.dates
      .filter((date) => date.origin && keys.has(date.origin.key))
      .map((date) => linkOf(date, today()))
      .sort(byDue);
  };
  const linksFor = (originKey: string): KeyDateLink[] =>
    datesOf([originKey]).filter((link): link is KeyDateLink => link.rule_key !== null);
  const dueOn = (key: RuleKey, baseOn: string): string | null =>
    dueFrom(ruleOf(key), baseOn, rules.amount(key));
  const allowed = (key: RuleKey): boolean =>
    !ruleOf(key).only_when_confirmed || rules.isConfirmed(key);

  const service: KeyDatesInternal = {
    usedFor(fileId) {
      const out: { label: string; href: string }[] = [];
      for (const date of book.dates) {
        const href = `/data/dates#date-${date.date_id}`;
        const filed =
          date.evidence.filed_file_id === fileId ||
          date.history.some((line) => line.evidence.filed_file_id === fileId);
        if (filed) out.push({ label: `Filed copy of “${date.title}”, in Key dates`, href });
        if (date.file_id === fileId)
          out.push({ label: `Kept with “${date.title}”, in Key dates`, href });
      }
      return out;
    },

    rule: (key) => ({ amount: rules.amount(key), confirmed: rules.isConfirmed(key) }),

    dueOn,

    add(items: readonly FromRecord[], by: Staff) {
      const origins: string[] = [];
      for (const item of items) {
        const originKey = clean(item.origin?.key, 200);
        if (!originKey || !isRuleKey(item.rule_key) || !isDay(item.base_on))
          throw new Refused(400, "invalid", "That date cannot be worked out.");
        if (!origins.includes(originKey)) origins.push(originKey);
        if (!allowed(item.rule_key)) continue;
        if (book.dates.some((d) => d.origin?.key === originKey && d.rule_key === item.rule_key))
          continue;
        const due = dueOn(item.rule_key, item.base_on);
        if (!due) continue;
        const rule = ruleOf(item.rule_key);
        const kind = item.kind && KINDS.has(item.kind) ? item.kind : "filing";
        const role = item.owner_role && OWNER_KEYS.has(item.owner_role) ? item.owner_role : "";
        book.add(
          {
            title: cleanText(item.title, LIMITS.title) || rule.title,
            kind,
            due_on: due,
            repeats: item.repeats === "yearly" ? "yearly" : "never",
            entity: DEFAULT_ENTITY,
            handled_by: cleanText(item.handled_by ?? "", LIMITS.name),
            remind_days: kind === "filing" ? 14 : 7,
            notes:
              cleanText(item.notes ?? "", LIMITS.notes) ||
              `${clockWords(rule, rules.amount(item.rule_key))}. ${confirmWords(rule.confirm_with)}.`,
          },
          by,
          () => true,
          null,
          {
            rule_key: item.rule_key,
            statutory: true,
            origin: {
              key: originKey,
              label: cleanText(item.origin.label, LIMITS.title),
              href: clean(item.origin.href, 300),
            },
            base_on: item.base_on,
            owner_role: role as OwnerRole,
          },
        );
      }
      return origins.flatMap(linksFor).sort(byDue);
    },

    linksFor,

    rebase(originKey, baseOn, by) {
      void by;
      if (!isDay(baseOn)) throw new Refused(400, "invalid", "That is not a day.");
      let changed = false;
      for (const date of book.dates) {
        if (date.origin?.key !== originKey || !openDate(date) || !date.rule_key) continue;
        const due = dueOn(date.rule_key, baseOn);
        if (!due) continue;
        date.base_on = baseOn;
        date.due_on = due;
        date.updated_at = core.now();
        changed = true;
      }
      if (changed) book.save();
      return linksFor(originKey);
    },

    done(originKey, ruleKey, evidence: Evidence, by) {
      const dates = book.dates.filter((d) => d.origin?.key === originKey && d.rule_key === ruleKey);
      const open = dates.find(openDate);
      if (open) {
        const kept = { ...NO_EVIDENCE, ...evidence };
        return linkOf(book.done(open, kept, by, context.facts()), today()) as KeyDateLink;
      }
      const found = dates[0];
      return found ? (linkOf(found, today()) as KeyDateLink) : null;
    },

    takeBack(originKey, why, by) {
      void by;
      const text = cleanText(why, LIMITS.notes);
      let changed = false;
      for (const date of book.dates)
        if (date.origin?.key === originKey && openDate(date)) {
          book.takeBack(date, text);
          changed = true;
        }
      if (changed) book.save();
      return linksFor(originKey);
    },

    facts: () => context.facts(),
    lastAgm: () => context.lastAgm(),
    rulesUnconfirmed: () => rules.unconfirmed(),
    datesOf,

    moveDsc(originKey, expiresOn, suggestionKey) {
      let changed = false;
      for (const date of book.dates)
        if (date.origin?.key === originKey && openDate(date) && date.due_on !== expiresOn) {
          date.due_on = expiresOn;
          date.from_suggestion = suggestionKey;
          date.updated_at = core.now();
          changed = true;
        }
      if (changed) book.save();
    },
  };
  return service;
}
