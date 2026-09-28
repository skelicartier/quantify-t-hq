"use client";

import { Rows3, Rows4 } from "lucide-react";
import { useEffect, useSyncExternalStore } from "react";

const KEY = "hq-density";
const EVENT = "hq-density-change";

function read(): "comfortable" | "compact" {
  try {
    return window.localStorage.getItem(KEY) === "compact" ? "compact" : "comfortable";
  } catch {
    return "comfortable";
  }
}

function subscribe(onChange: () => void) {
  window.addEventListener(EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

/** Row density, per device: comfortable (36px) or compact (31px). */
export function DensityToggle() {
  const density = useSyncExternalStore(subscribe, read, () => "comfortable" as const);
  useEffect(() => {
    document.documentElement.setAttribute("data-density", density);
  }, [density]);
  const next = density === "compact" ? "comfortable" : "compact";
  return (
    <button
      type="button"
      className="cbar__icon"
      aria-pressed={density === "compact"}
      title={density === "compact" ? "Comfortable rows" : "Compact rows"}
      onClick={() => {
        try {
          window.localStorage.setItem(KEY, next);
        } catch {
          // A private window keeps it for the page's lifetime only.
        }
        window.dispatchEvent(new Event(EVENT));
      }}
    >
      {density === "compact" ? (
        <Rows3 size={14} strokeWidth={1.8} aria-hidden="true" />
      ) : (
        <Rows4 size={14} strokeWidth={1.8} aria-hidden="true" />
      )}
      <span className="sr-only">{density === "compact" ? "Comfortable rows" : "Compact rows"}</span>
    </button>
  );
}
