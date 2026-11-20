/**
 * The Owner's links of accounts to people in the people ledger (ws-notes/security/spec.md §2
 * rules 1–2, §3.5, §6.2). OWNER-ONLY. Kept apart from the records, in `data/tools/owner/`
 * (`links.json`: `{ format: 1, accounts: Record<account_id, person_id> }`; `events.jsonl`:
 * "linked" or "unlinked" and the account id, nothing else), which a backup an Admin makes
 * leaves out (`OWNER_FOLDERS`). The person's name, state and last day are read from the
 * ledger's own `people-roster` at request time and never written here or anywhere else.
 */

import type { DataCore } from "../core";

const FOLDER = "tools/owner";
const LINKS = `${FOLDER}/links.json`;
const EVENTS = `${FOLDER}/events.jsonl`;

export class OwnerLinks {
  readonly #core: DataCore;
  readonly #links = new Map<string, string>();

  constructor(core: DataCore) {
    this.#core = core;
    core.store.ensureDir(FOLDER);
    const stored = core.store.readJson<{ accounts?: unknown }>(LINKS, {});
    const accounts =
      stored.accounts && typeof stored.accounts === "object" && !Array.isArray(stored.accounts)
        ? (stored.accounts as Record<string, unknown>)
        : {};
    for (const [accountId, personId] of Object.entries(accounts))
      if (typeof personId === "string" && personId) this.#links.set(accountId, personId);
  }

  #save(): void {
    this.#core.store.writeJson(LINKS, {
      format: 1,
      accounts: Object.fromEntries(
        [...this.#links.entries()].sort(([a], [b]) => a.localeCompare(b)),
      ),
    });
  }

  /** The person an account is linked to, or null. */
  personOf(accountId: string): string | null {
    return this.#links.get(accountId) ?? null;
  }

  /** The accounts linked to a person. */
  accountsOf(personId: string): string[] {
    return [...this.#links.entries()]
      .filter(([, id]) => id === personId)
      .map(([accountId]) => accountId);
  }

  /** Links (or, with null, unlinks) an account; the event holds the verb and the account id only. */
  link(accountId: string, personId: string | null): boolean {
    const before = this.#links.get(accountId) ?? null;
    if (personId === before) return personId !== null;
    if (personId) this.#links.set(accountId, personId);
    else this.#links.delete(accountId);
    this.#save();
    this.#core.store.appendLine(EVENTS, {
      verb: personId ? "linked" : "unlinked",
      account_id: accountId,
      at: this.#core.now(),
    });
    return personId !== null;
  }
}
