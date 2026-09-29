"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";

/**
 * Saved views: a name for a combination of filters, sort and view that a person keeps
 * coming back to. A view is nothing but the list's URL query, so sharing one is sharing
 * a link; the names live on this device only. The built-in filter strips stay the way to
 * browse; this row is for the combinations they cannot express in one click.
 */

type SavedView = { name: string; query: string };

const EVENT = "hq-views-change";

function storageKey(listKey: string): string {
  return `hq-views:${listKey}`;
}

function readViews(listKey: string): string {
  try {
    return window.localStorage.getItem(storageKey(listKey)) ?? "[]";
  } catch {
    return "[]";
  }
}

function parseViews(raw: string): SavedView[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (entry): entry is SavedView =>
          typeof entry === "object" &&
          entry !== null &&
          typeof (entry as SavedView).name === "string" &&
          typeof (entry as SavedView).query === "string",
      )
      .slice(0, 20);
  } catch {
    return [];
  }
}

function writeViews(listKey: string, views: readonly SavedView[]) {
  try {
    if (views.length) window.localStorage.setItem(storageKey(listKey), JSON.stringify(views));
    else window.localStorage.removeItem(storageKey(listKey));
  } catch {
    // Without storage the view lasts for the page; the URL still works.
  }
  window.dispatchEvent(new Event(EVENT));
}

function subscribe(onChange: () => void) {
  window.addEventListener(EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

/** Query strings compare by their sorted parameters, so `?a=1&b=2` equals `?b=2&a=1`. */
function normalise(query: string): string {
  const params = new URLSearchParams(query);
  return [...params.entries()]
    .filter(([, value]) => value !== "")
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("&");
}

export function ViewTabs({
  listKey,
  basePath,
  currentQuery,
}: {
  listKey: string;
  basePath: string;
  /** The list's current query string, without the leading `?`. */
  currentQuery: string;
}) {
  const raw = useSyncExternalStore(
    subscribe,
    () => readViews(listKey),
    () => "[]",
  );
  const views = parseViews(raw);
  const current = normalise(currentQuery);
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState("");
  const nameRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (naming) nameRef.current?.focus();
  }, [naming]);
  const matches = views.find((view) => normalise(view.query) === current);
  const save = () => {
    const trimmed = name.trim().slice(0, 40);
    if (!trimmed || !current) return;
    const rest = views.filter((view) => view.name !== trimmed);
    writeViews(listKey, [...rest, { name: trimmed, query: current }]);
    setName("");
    setNaming(false);
  };
  const remove = (viewName: string) => {
    writeViews(
      listKey,
      views.filter((view) => view.name !== viewName),
    );
  };

  if (views.length === 0 && !current) return null;

  return (
    <div className="views" aria-label="Saved views">
      {views.length > 0 && (
        <ul className="views__list">
          {views.map((view) => (
            <li key={view.name} className="views__item">
              <Link
                className="views__tab"
                href={view.query ? `${basePath}?${view.query}` : basePath}
                aria-current={matches?.name === view.name ? "page" : undefined}
              >
                {view.name}
              </Link>
              <button
                type="button"
                className="views__remove"
                onClick={() => remove(view.name)}
                aria-label={`Forget the view ${view.name}`}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
      {current && !matches && !naming && (
        <button type="button" className="btn btn--small btn--ghost" onClick={() => setNaming(true)}>
          Save this view
        </button>
      )}
      {naming && (
        <form
          className="views__save"
          onSubmit={(event) => {
            event.preventDefault();
            save();
          }}
        >
          <input
            className="input input--small"
            value={name}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                setNaming(false);
                setName("");
              }
            }}
            placeholder="Name this view"
            maxLength={40}
            aria-label="View name"
            ref={nameRef}
          />
          <button type="submit" className="btn btn--small btn--primary" disabled={!name.trim()}>
            Save
          </button>
          <button
            type="button"
            className="btn btn--small btn--ghost"
            onClick={() => {
              setNaming(false);
              setName("");
            }}
          >
            Cancel
          </button>
        </form>
      )}
      {current && (
        <Link className="views__reset" href={basePath}>
          Reset
        </Link>
      )}
    </div>
  );
}
