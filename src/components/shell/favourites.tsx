"use client";

import { Star } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSyncExternalStore } from "react";

import { syncPreference } from "@/lib/prefs/sync";

/**
 * Favourites: the records a person keeps returning to, pinned at the top of the rail.
 * Private to the person, and kept with their account like their other display
 * preferences, so a favourite pinned on the laptop is there on the phone: the device's
 * copy is the fast path, mirrored to the account and brought back by the hydrator.
 */

export type Favourite = { href: string; label: string; kind: string };

const KEY = "hq-favourites";
const EVENT = "hq-favourites-change";
const LIMIT = 12;

function readRaw(): string {
  try {
    return window.localStorage.getItem(KEY) ?? "[]";
  } catch {
    return "[]";
  }
}

function parse(raw: string): Favourite[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (entry): entry is Favourite =>
          typeof entry === "object" &&
          entry !== null &&
          typeof (entry as Favourite).href === "string" &&
          typeof (entry as Favourite).label === "string" &&
          typeof (entry as Favourite).kind === "string",
      )
      .slice(0, LIMIT);
  } catch {
    return [];
  }
}

/** The list as the account keeps it: a preference holds 2,000 characters at most. */
function forAccount(favourites: readonly Favourite[]): string {
  const kept = favourites.map((entry) => ({ ...entry, label: entry.label.slice(0, 80) }));
  let text = JSON.stringify(kept);
  while (text.length > 2000 && kept.length) {
    kept.pop();
    text = JSON.stringify(kept);
  }
  return text;
}

function write(favourites: readonly Favourite[]) {
  const text = JSON.stringify(favourites);
  try {
    window.localStorage.setItem(KEY, text);
  } catch {
    // Without storage the star lasts for the page.
  }
  window.dispatchEvent(new Event(EVENT));
  syncPreference(KEY, forAccount(favourites));
}

function subscribe(onChange: () => void) {
  window.addEventListener(EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

function useFavourites(): Favourite[] {
  const raw = useSyncExternalStore(subscribe, readRaw, () => "[]");
  return parse(raw);
}

/** The star in a record's head: pinned, or not. */
export function FavouriteStar({ href, label, kind }: Favourite) {
  const favourites = useFavourites();
  const pinned = favourites.some((entry) => entry.href === href);
  const toggle = () => {
    if (pinned) write(favourites.filter((entry) => entry.href !== href));
    else
      write(
        [{ href, label, kind }, ...favourites.filter((entry) => entry.href !== href)].slice(
          0,
          LIMIT,
        ),
      );
  };
  return (
    <button
      type="button"
      className={pinned ? "fav-star fav-star--on" : "fav-star"}
      onClick={toggle}
      aria-pressed={pinned}
      aria-label={pinned ? `Unpin ${label} from favourites` : `Pin ${label} to favourites`}
      title={pinned ? "Pinned to your favourites" : "Pin to your favourites"}
    >
      <Star size={15} strokeWidth={1.8} aria-hidden="true" />
    </button>
  );
}

/** The rail group listing pinned records; nothing when there are none. */
export function RailFavourites({ collapsed }: { collapsed: boolean }) {
  const favourites = useFavourites();
  const pathname = usePathname();
  if (favourites.length === 0) return null;
  return (
    <nav className="rail__group rail__group--favourites" aria-label="Favourites">
      <p className="rail__group-label">Favourites</p>
      <ul>
        {favourites.map((entry) => (
          <li key={entry.href}>
            <Link
              href={entry.href}
              aria-current={pathname === entry.href ? "page" : undefined}
              title={collapsed ? entry.label : `${entry.label} · ${entry.kind}`}
            >
              <Star size={16} strokeWidth={1.8} aria-hidden="true" />
              <span className="rail__link-label">{entry.label}</span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
