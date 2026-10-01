"use client";

import { Search, X } from "lucide-react";
import { useEffect, useId, useState } from "react";

import { ShortId } from "@/components/ui/short-id";

/** One account chosen as a recipient. `email` and `name` are empty for ids loaded from a saved target. */
export type RecipientAccount = {
  id: string;
  email: string;
  name: string;
  active: boolean;
};

type SearchState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; query: string; accounts: RecipientAccount[]; hasMore: boolean }
  | { status: "error"; query: string; message: string };

type Props = {
  selected: RecipientAccount[];
  onChange: (next: RecipientAccount[]) => void;
  disabled?: boolean;
  /** Prefix for the control ids so two pickers can share a page. */
  idPrefix: string;
  /** Same-origin JSON endpoint answering `?q=` with `{ accounts, has_more }`. */
  searchPath?: string;
};

const SEARCH_PATH = "/product/users/search";
const DEBOUNCE_MS = 220;

function isRecipientAccount(value: unknown): value is RecipientAccount {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.id === "string" &&
    typeof record.email === "string" &&
    typeof record.name === "string" &&
    typeof record.active === "boolean"
  );
}

function accountLabel(account: RecipientAccount): string {
  if (account.name && account.email) return `${account.name} (${account.email})`;
  return account.name || account.email || account.id;
}

/**
 * Search the directory by name or email and pick accounts one by one. The picker owns
 * only the selection; the form that renders it serialises the chosen ids into its
 * payload. Nothing here is a form field, so an accidental submit never posts a search.
 */
export function RecipientPicker({
  selected,
  onChange,
  disabled = false,
  idPrefix,
  searchPath = SEARCH_PATH,
}: Props) {
  const reactId = useId();
  const inputId = `${idPrefix}-search`;
  const resultsId = `${idPrefix}-results-${reactId}`;
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState<SearchState>({ status: "idle" });
  const text = query.trim();
  // Results are shown only for the query they answer; a blank box shows nothing.
  const view: SearchState = !text
    ? { status: "idle" }
    : (search.status === "ready" || search.status === "error") && search.query !== text
      ? { status: "loading" }
      : search;

  useEffect(() => {
    if (!text) return;
    const controller = new AbortController();
    const fail = (message: string) => setSearch({ status: "error", query: text, message });
    const timer = window.setTimeout(async () => {
      setSearch({ status: "loading" });
      try {
        const response = await fetch(`${searchPath}?q=${encodeURIComponent(text)}`, {
          credentials: "same-origin",
          headers: { accept: "application/json" },
          signal: controller.signal,
        });
        const isJson = (response.headers.get("content-type") ?? "").includes("application/json");
        if (response.status === 401 || response.redirected || !isJson) {
          fail("Sign in again to search accounts.");
          return;
        }
        if (response.status === 403) {
          fail("This account cannot search the directory.");
          return;
        }
        if (!response.ok) {
          fail("The directory is unavailable. Try again.");
          return;
        }
        const payload = (await response.json()) as { accounts?: unknown; has_more?: unknown };
        const accounts = Array.isArray(payload.accounts)
          ? payload.accounts.filter(isRecipientAccount)
          : [];
        setSearch({ status: "ready", query: text, accounts, hasMore: payload.has_more === true });
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        fail("The directory is unavailable. Try again.");
      }
    }, DEBOUNCE_MS);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [text, searchPath]);

  const selectedIds = new Set(selected.map((account) => account.id));
  const toggle = (account: RecipientAccount) => {
    if (selectedIds.has(account.id)) {
      onChange(selected.filter((item) => item.id !== account.id));
    } else {
      onChange([...selected, account]);
    }
  };

  return (
    <div className="recipients">
      <div className="field">
        <div className="field__label">
          <label htmlFor={inputId}>Accounts</label>
          {selected.length > 0 && (
            <span className="field__label-note">{selected.length} selected</span>
          )}
        </div>
        {selected.length > 0 && (
          <ul className="chip-list" aria-label="Selected accounts">
            {selected.map((account) => (
              <li key={account.id} className="chip chip--recipient">
                <span className="chip__text">
                  {account.name || account.email ? (
                    accountLabel(account)
                  ) : (
                    <ShortId value={account.id} />
                  )}
                </span>
                <button
                  type="button"
                  className="chip__remove"
                  onClick={() => toggle(account)}
                  disabled={disabled}
                  aria-label={`Remove ${accountLabel(account)}`}
                >
                  <X size={12} aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="recipients__search">
          <Search size={15} className="recipients__search-icon" aria-hidden="true" />
          <input
            id={inputId}
            className="input"
            type="search"
            autoComplete="off"
            placeholder="Name or email"
            value={query}
            disabled={disabled}
            aria-controls={resultsId}
            aria-describedby={`${inputId}-hint`}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <p className="field__hint" id={`${inputId}-hint`}>
          Search the directory and pick the accounts to include.
        </p>
      </div>
      <div id={resultsId} className="recipients__results" aria-live="polite">
        {view.status === "loading" && <p className="recipients__status">Searching…</p>}
        {view.status === "error" && (
          <p className="recipients__status recipients__status--error" role="alert">
            {view.message}
          </p>
        )}
        {view.status === "ready" && view.accounts.length === 0 && (
          <p className="recipients__status">No accounts match.</p>
        )}
        {view.status === "ready" && view.accounts.length > 0 && (
          <ul className="recipients__list" aria-label="Matching accounts">
            {view.accounts.map((account) => {
              const picked = selectedIds.has(account.id);
              return (
                <li key={account.id}>
                  <button
                    type="button"
                    className="recipients__result"
                    aria-pressed={picked}
                    disabled={disabled}
                    onClick={() => toggle(account)}
                  >
                    <span className="recipients__result-text">
                      <span className="recipients__result-name">{account.name || "—"}</span>
                      <span className="recipients__result-email">{account.email}</span>
                    </span>
                    <span className="recipients__result-state">
                      {picked ? "Added" : account.active ? "Add" : "Add · inactive"}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {view.status === "ready" && view.hasMore && (
          <p className="recipients__status">More accounts match. Narrow the search.</p>
        )}
      </div>
    </div>
  );
}
