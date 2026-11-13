/**
 * Every Mail merge list row All leads has seen, kept in Data (`leads/seen-lists.json`), as
 * the lead files' snapshots are: a list deleted in Mail merge, or a person taken off one,
 * never takes a lead out of the index. The lead keeps the fields it had when last seen,
 * its notes, tags, edits and replies, and that batch reads as gone.
 *
 * The file is rewritten only when a list brings something new (a row, a changed value, a
 * new name), so a build where nothing moved writes nothing.
 */

import type { ListRow } from "../../mail-merge/lists";
import type { SenderList } from "../sender-files";
import type { DataStore } from "../store";

const FILE = "leads/seen-lists.json";

type SeenRow = { id: string; name: string; values: Record<string, string> };
type SeenList = { name: string; created_at: string; rows: Record<string, SeenRow> };
type Stored = { format: 1; lists: Record<string, SeenList> };

/** What Data remembers of one list that Mail merge no longer holds, whole or in part. */
export type GoneRows = {
  list_id: string;
  name: string;
  /** True when the whole list is gone from Mail merge, not only some of its rows. */
  deleted: boolean;
  created_at: string;
  rows: ListRow[];
};

function filled(values: Readonly<Record<string, string>> | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(values ?? {}))
    if (typeof value === "string" && value.trim()) out[key] = value;
  return out;
}

function same(a: Readonly<Record<string, string>>, b: Readonly<Record<string, string>>): boolean {
  const keys = Object.keys(a);
  if (keys.length !== Object.keys(b).length) return false;
  return keys.every((key) => a[key] === b[key]);
}

export class SeenLists {
  readonly #store: DataStore;
  readonly #log: (line: string) => void;
  readonly #lists: Record<string, SeenList>;
  /** A change that could not be written yet (a full disk): tried again at the next build. */
  #unsaved = false;

  constructor(store: DataStore, log: (line: string) => void) {
    this.#store = store;
    this.#log = log;
    const stored = store.readJson<Stored | null>(FILE, null);
    const lists: Record<string, SeenList> = {};
    if (stored?.format === 1 && stored.lists && typeof stored.lists === "object")
      for (const [id, list] of Object.entries(stored.lists))
        if (list && typeof list.name === "string" && list.rows && typeof list.rows === "object")
          lists[id] = {
            ...list,
            created_at: typeof list.created_at === "string" ? list.created_at : "",
          };
    this.#lists = lists;
  }

  /**
   * Remember what the lists hold now, and answer the rows remembered that they no longer
   * hold, oldest list first (so a newer list's values still win in the build).
   */
  update(lists: readonly SenderList[]): GoneRows[] {
    let changed = false;
    const here = new Map<string, Set<string>>();
    for (const list of lists) {
      let seen = this.#lists[list.id];
      if (!seen) {
        seen = { name: list.name, created_at: String(list.created_at ?? ""), rows: {} };
        this.#lists[list.id] = seen;
        changed = true;
      } else if (seen.name !== list.name) {
        seen.name = list.name;
        changed = true;
      }
      const emails = new Set<string>();
      for (const row of list.rows) {
        if (typeof row?.email !== "string" || !row.email) continue;
        emails.add(row.email);
        const values = filled(row.values);
        const name = typeof row.name === "string" ? row.name : "";
        const before = seen.rows[row.email];
        if (
          !before ||
          before.id !== row.id ||
          before.name !== name ||
          !same(before.values, values)
        ) {
          seen.rows[row.email] = { id: row.id, name, values };
          changed = true;
        }
      }
      here.set(list.id, emails);
    }
    if (changed || this.#unsaved) {
      try {
        this.#store.writeJson(FILE, { format: 1, lists: this.#lists } satisfies Stored);
        this.#unsaved = false;
      } catch (error) {
        // Still held in memory, so this start loses nothing; the next build writes it.
        this.#unsaved = true;
        this.#log(
          `the list rows seen could not be kept: ${error instanceof Error ? error.name : "error"}`,
        );
      }
    }
    const gone: GoneRows[] = [];
    for (const [list_id, seen] of Object.entries(this.#lists)) {
      const live = here.get(list_id);
      const rows: ListRow[] = [];
      for (const [email, row] of Object.entries(seen.rows))
        if (!live?.has(email)) rows.push({ id: row.id, email, name: row.name, values: row.values });
      if (rows.length > 0)
        gone.push({ list_id, name: seen.name, deleted: !live, created_at: seen.created_at, rows });
    }
    return gone.sort((a, b) => a.created_at.localeCompare(b.created_at));
  }

  /** A remembered row, for the lead's page: the list's name and the values it last had. */
  row(listId: string, email: string): { list: string; values: Record<string, string> } | null {
    const list = this.#lists[listId];
    const row = list?.rows[email];
    return list && row ? { list: list.name, values: row.values } : null;
  }
}
