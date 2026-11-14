/**
 * The one round (raise spec §5.2, report 3.1): the terms he is raising on, kept whole in
 * `investors/round.json`, with one line per save in `investors/round-history.jsonl` (the
 * whole record each time, so any earlier version can be read back). There is no target
 * and no range field, and none may be added. Nothing here sends anything.
 */

import { randomUUID } from "node:crypto";

import type { DataCore } from "../core";
import type { Staff } from "../protocol";
import { roundChanges } from "./raise";
import type { Round } from "./types";

const ROUND = "investors/round.json";
const HISTORY = "investors/round-history.jsonl";
const HISTORY_ROWS = 50;

type HistoryLine = { round: Round; by: Staff; at: string };

export class RoundBook {
  readonly #core: DataCore;
  round: Round | null;

  constructor(core: DataCore) {
    this.#core = core;
    const stored = core.store.readJson<{ round?: Round | null }>(ROUND, {});
    this.round =
      stored.round && typeof stored.round === "object" && typeof stored.round.round_id === "string"
        ? stored.round
        : null;
  }

  save(fields: Omit<Round, "round_id" | "updated_at" | "updated_by">, by: Staff): Round {
    const at = this.#core.now();
    const round: Round = {
      round_id: this.round?.round_id ?? randomUUID(),
      ...fields,
      updated_at: at,
      updated_by: by,
    };
    this.#core.store.writeJson(ROUND, { format: 1, round });
    this.#core.store.appendLine(HISTORY, { round, by, at } satisfies HistoryLine);
    this.round = round;
    return round;
  }

  /** Newest first, at most 50: when, who, and which fields changed, in words. */
  history(): { at: string; by: Staff; changed: string[] }[] {
    const lines = this.#core.store
      .readLines<HistoryLine>(HISTORY)
      .filter((line) => line && typeof line.at === "string" && line.round);
    const rows = lines.map((line, index) => ({
      at: line.at,
      by: line.by,
      changed: roundChanges(index > 0 ? (lines[index - 1]?.round ?? null) : null, line.round),
    }));
    return rows.reverse().slice(0, HISTORY_ROWS);
  }
}
