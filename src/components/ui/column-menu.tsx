"use client";

import { useSyncExternalStore } from "react";

import { buttonClass } from "@/components/ui/button";

/**
 * Which columns a table shows, chosen by the person and kept on their device. The first
 * column names the row and is always shown; the rest can be put away and brought back.
 * Hiding is a stylesheet rule on the table's own id, so nothing is re-rendered and a
 * hidden column is hidden whole — never cut.
 */

export type MenuColumn = { key: string; label: string };

const EVENT = "hq-columns-change";

function storageKey(tableId: string): string {
  return `hq-columns:${tableId}`;
}

function readHidden(tableId: string): string {
  try {
    return window.localStorage.getItem(storageKey(tableId)) ?? "";
  } catch {
    return "";
  }
}

function writeHidden(tableId: string, keys: readonly string[]) {
  try {
    if (keys.length) window.localStorage.setItem(storageKey(tableId), keys.join(","));
    else window.localStorage.removeItem(storageKey(tableId));
  } catch {
    // A per-device convenience: without storage the choice lasts for the page.
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

export function ColumnMenu({
  tableId,
  columns,
}: {
  tableId: string;
  columns: readonly MenuColumn[];
}) {
  const stored = useSyncExternalStore(
    subscribe,
    () => readHidden(tableId),
    () => "",
  );
  const known = new Set(columns.map((column) => column.key));
  const hidden = new Set(
    stored
      .split(",")
      .filter(Boolean)
      .filter((key) => known.has(key)),
  );
  const [first, ...rest] = columns;
  const toggle = (key: string) => {
    const next = new Set(hidden);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    writeHidden(tableId, [...next]);
  };
  const rules = columns
    .map((column, index) => (hidden.has(column.key) ? index + 1 : 0))
    .filter((position) => position > 0)
    .map(
      (position) =>
        `#${tableId} th:nth-child(${position}), #${tableId} td:nth-child(${position}) { display: none; }`,
    )
    .join("\n");
  const shown = columns.length - hidden.size;

  return (
    <details className="popover popover--end colmenu">
      <summary
        className={buttonClass({ variant: "ghost", size: "small", className: "popover__trigger" })}
        aria-label={`Columns: ${shown} of ${columns.length} shown`}
      >
        Columns
        {hidden.size > 0 && (
          <span className="colmenu__count" aria-hidden="true">
            {shown}/{columns.length}
          </span>
        )}
      </summary>
      <div className="popover__panel popover__panel--narrow colmenu__panel">
        <p className="colmenu__hint">The columns this table shows. Kept on this device.</p>
        <ul className="colmenu__list">
          {first && (
            <li className="colmenu__item colmenu__item--fixed">
              <span>{first.label}</span>
              <span className="quiet">Always shown</span>
            </li>
          )}
          {rest.map((column) => (
            <li key={column.key} className="colmenu__item">
              <label>
                <input
                  type="checkbox"
                  checked={!hidden.has(column.key)}
                  onChange={() => toggle(column.key)}
                />
                <span>{column.label}</span>
              </label>
            </li>
          ))}
        </ul>
        {hidden.size > 0 && (
          <button
            type="button"
            className={buttonClass({ size: "small" })}
            onClick={() => writeHidden(tableId, [])}
          >
            Show every column
          </button>
        )}
      </div>
      {rules && <style>{rules}</style>}
    </details>
  );
}
