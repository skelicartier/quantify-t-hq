/**
 * Assurance › Summary (ws-notes/security/spec.md §8.4): asks, in order, `tools`, `devices`,
 * `logs`, `recovery` (Systems), `policies`, `findings`, `assurance` (Assurance),
 * `questionnaires`, `profiles` (Buyers) for `summary(today, owner)`, each inside a try. A
 * module that is absent is one line in `absent` ("Devices is not loaded here."); one that
 * throws is logged and its row reads "Could not be read just now." The Owner flag is passed
 * on as the portal set it and nothing else of the Owner's is read here: a line counts
 * something worked out from the people ledger only when its own module was asked as the
 * Owner. Sentences and links; never a meter.
 */

import { type SummaryArea, type SummaryLine, type SummarySource } from "../security-contracts";
import {
  COULD_NOT_READ,
  NOTHING_YET,
  SUMMARY_MODULES,
} from "../../../src/lib/data/labels-assurance";
import { notLoaded } from "../../../src/lib/data/labels-controls";

export type Absent = {
  name: string;
  area: SummaryArea;
  title: string;
  words: string;
  href: string;
};

export type SummaryAnswer = {
  areas: { area: SummaryArea; lines: SummaryLine[] }[];
  absent: Absent[];
  owner: boolean;
  today: string;
};

const AREAS: readonly SummaryArea[] = ["systems", "assurance", "buyers"];

export function summaryOf(
  need: (name: string) => unknown,
  today: string,
  owner: boolean,
  log: (line: string) => void,
): SummaryAnswer {
  const lines = new Map<SummaryArea, SummaryLine[]>(AREAS.map((area) => [area, []]));
  const absent: Absent[] = [];
  for (const mod of SUMMARY_MODULES) {
    const source = need(mod.name) as Partial<SummarySource> | null;
    if (!source || typeof source.summary !== "function") {
      absent.push({
        name: mod.name,
        area: mod.area,
        title: mod.title,
        words: notLoaded(mod.title),
        href: mod.href,
      });
      continue;
    }
    try {
      const given = source.summary(today, owner);
      const list = Array.isArray(given) ? given : [];
      // A module with nothing to say still has its row: the tables always have their rows.
      if (list.length === 0)
        lines.get(mod.area)!.push({
          key: `${mod.name}:empty`,
          area: mod.area,
          title: mod.title,
          words: NOTHING_YET,
          attention: false,
          href: mod.href,
        });
      for (const line of list)
        lines.get(mod.area)!.push({
          key: `${mod.name}:${String(line.key)}`,
          area: mod.area,
          title: String(line.title),
          words: String(line.words),
          attention: line.attention === true,
          href: typeof line.href === "string" && line.href.startsWith("/") ? line.href : mod.href,
        });
    } catch (error) {
      log(
        `assurance: ${mod.name}'s summary failed: ${error instanceof Error ? error.name : "error"}`,
      );
      lines.get(mod.area)!.push({
        key: `${mod.name}:failed`,
        area: mod.area,
        title: mod.title,
        words: COULD_NOT_READ,
        attention: false,
        href: mod.href,
      });
    }
  }
  return {
    areas: AREAS.map((area) => ({ area, lines: lines.get(area)! })),
    absent,
    owner,
    today,
  };
}
