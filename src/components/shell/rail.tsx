"use client";

import { PanelLeftClose, PanelLeftOpen, Search } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useSyncExternalStore } from "react";

import { BrandMark } from "@/components/brand/brand-mark";
import { visibleNavGroups } from "@/components/shell/nav-links";
import { RailFavourites } from "@/components/shell/favourites";
import { RailIdentity } from "@/components/shell/rail-identity";
import type { ShellIdentity } from "@/components/shell/shell-types";
import { openPalette } from "@/components/shell/palette-bus";

const RAIL_KEY = "hq-rail";
const RAIL_EVENT = "hq-rail-change";

function readCollapsed(): boolean {
  try {
    return window.localStorage.getItem(RAIL_KEY) === "collapsed";
  } catch {
    return false;
  }
}

function subscribe(onChange: () => void) {
  window.addEventListener(RAIL_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(RAIL_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

/** The rail's width preference, per device. Server and hydration render expanded. */
export function useRailCollapsed(): boolean {
  return useSyncExternalStore(subscribe, readCollapsed, () => false);
}

export function setRailCollapsed(collapsed: boolean) {
  try {
    window.localStorage.setItem(RAIL_KEY, collapsed ? "collapsed" : "expanded");
  } catch {
    // A private window keeps the choice for the page's lifetime only.
  }
  window.dispatchEvent(new Event(RAIL_EVENT));
}

type RailProps = {
  identity: ShellIdentity;
  capabilities: readonly string[];
  signOutAction: () => Promise<void>;
  /** A number beside a link (the inbox's unread count), counted as the page rendered. */
  counts?: Readonly<Record<string, number>> | undefined;
};

/**
 * The left rail: brand, the palette button, grouped navigation and the identity menu.
 * Collapses to icons (56px) and remembers that per device; the collapsed state is
 * carried on the shell so the content column can take the width.
 */
export function Rail({ identity, capabilities, signOutAction, counts }: RailProps) {
  const pathname = usePathname();
  const collapsed = useRailCollapsed();
  const groups = visibleNavGroups(capabilities);

  useEffect(() => {
    document.documentElement.toggleAttribute("data-rail-collapsed", collapsed);
  }, [collapsed]);

  return (
    <aside className="rail" id="shell-sidebar" data-collapsed={collapsed || undefined}>
      <div className="rail__head">
        <BrandMark compact={collapsed} href="/home" />
        <button
          type="button"
          className="rail__collapse"
          onClick={() => setRailCollapsed(!collapsed)}
          aria-pressed={collapsed}
          title={collapsed ? "Expand the rail" : "Collapse the rail"}
        >
          {collapsed ? (
            <PanelLeftOpen size={15} strokeWidth={1.8} aria-hidden="true" />
          ) : (
            <PanelLeftClose size={15} strokeWidth={1.8} aria-hidden="true" />
          )}
          <span className="sr-only">{collapsed ? "Expand the rail" : "Collapse the rail"}</span>
        </button>
      </div>

      <button
        type="button"
        className="rail__search"
        onClick={() => openPalette()}
        title="Search and commands"
      >
        <Search size={14} strokeWidth={1.8} aria-hidden="true" />
        <span className="rail__search-label">Search or jump to…</span>
        <kbd className="keycap" aria-hidden="true">
          ⌘K
        </kbd>
        <span className="sr-only">Open search and commands (Command or Control and K)</span>
      </button>

      <div className="rail__groups">
        <RailFavourites collapsed={collapsed} />
        {groups.map((group) => (
          <nav className="rail__group" key={group.label} aria-label={group.label}>
            <p className="rail__group-label">{group.label}</p>
            <ul>
              {group.links.map(({ href, label, icon: Icon, activePrefix, key }) => {
                const current =
                  pathname === href || (activePrefix ? pathname.startsWith(activePrefix) : false);
                return (
                  <li key={href}>
                    <Link
                      href={href}
                      aria-current={current ? "page" : undefined}
                      title={collapsed ? label : undefined}
                    >
                      <Icon size={16} strokeWidth={1.8} aria-hidden="true" />
                      <span className="rail__link-label">{label}</span>
                      {(counts?.[href] ?? 0) > 0 ? (
                        <span className="rail__count">
                          {counts?.[href]}
                          <span className="sr-only"> unread</span>
                        </span>
                      ) : (
                        key && (
                          <kbd className="keycap keycap--quiet" aria-hidden="true">
                            g{key}
                          </kbd>
                        )
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
        ))}
      </div>

      <RailIdentity identity={identity} signOutAction={signOutAction} collapsed={collapsed} />
    </aside>
  );
}
