"use client";

import { Keyboard } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { BrandMark } from "@/components/brand/brand-mark";
import { DensityToggle } from "@/components/shell/density-toggle";
import { MobileNavToggle } from "@/components/shell/mobile-nav-toggle";
import { NAV_GROUPS } from "@/components/shell/nav-links";
import { openShortcuts } from "@/components/shell/palette-bus";
import { SidebarClock } from "@/components/shell/sidebar-clock";
import { ThemeToggle } from "@/components/shell/theme-toggle";

type Crumb = { href: string; label: string };

/** Path words whose title case is not their spelling. */
const LEAF_LABELS: Record<string, string> = { mrr: "MRR", sla: "SLA", api: "API" };

/** The section and page a path sits under, from the navigation table; records add their own name in the page bar. */
function crumbsFor(pathname: string): Crumb[] {
  for (const group of NAV_GROUPS) {
    for (const link of group.links) {
      const byPrefix = Boolean(link.activePrefix && pathname.startsWith(link.activePrefix));
      if (pathname !== link.href && !byPrefix) continue;
      const crumbs: Crumb[] = [{ href: link.href, label: link.label }];
      // The leaf is the first word after the part of the path the link owns — its
      // active prefix when that is what matched, never the link's own longer href
      // (slicing "/admin/settings" by the length of "/admin/staff" once read "ngs").
      const owned = byPrefix && link.activePrefix ? link.activePrefix : link.href;
      const tail = pathname.slice(owned.length).split("/").filter(Boolean);
      const leaf = tail[0] ?? "";
      const isRecordId = /^[0-9a-f-]{20,}$/i.test(leaf) || /^sup_/.test(leaf) || /^QT-/.test(leaf);
      if (leaf && !isRecordId && `${owned}/${leaf}` !== link.href) {
        crumbs.push({
          href: `${owned}/${leaf}`,
          label:
            LEAF_LABELS[leaf] ?? leaf.replace(/-/g, " ").replace(/^\w/, (c) => c.toUpperCase()),
        });
      }
      return [{ href: "/home", label: group.label }, ...crumbs];
    }
  }
  return [];
}

/**
 * The 44px bar over the work surface: where you are, and the few controls that apply
 * everywhere. On phones it carries the brand and the menu button instead.
 */
export function ContextBar() {
  const pathname = usePathname();
  const crumbs = crumbsFor(pathname);
  return (
    <div className="cbar">
      <div className="cbar__lead">
        <MobileNavToggle />
        <BrandMark compact href="/home" />
        {crumbs.length > 0 && (
          <nav className="cbar__crumbs" aria-label="Breadcrumb">
            {crumbs.map((crumb, index) => (
              <span key={`${crumb.href}-${index}`} className="cbar__crumb">
                {index > 0 && (
                  <span className="cbar__sep" aria-hidden="true">
                    ›
                  </span>
                )}
                {index === crumbs.length - 1 ? (
                  <span aria-current="page">{crumb.label}</span>
                ) : index === 0 ? (
                  <span>{crumb.label}</span>
                ) : (
                  <Link href={crumb.href}>{crumb.label}</Link>
                )}
              </span>
            ))}
          </nav>
        )}
      </div>
      <div className="cbar__tools">
        <span className="cbar__status">
          <span className="cbar__dot" aria-hidden="true" />
          <SidebarClock />
        </span>
        <DensityToggle />
        <ThemeToggle />
        <button
          type="button"
          className="cbar__icon"
          onClick={() => openShortcuts()}
          title="Keyboard shortcuts (?)"
        >
          <Keyboard size={14} strokeWidth={1.8} aria-hidden="true" />
          <span className="sr-only">Keyboard shortcuts</span>
        </button>
      </div>
    </div>
  );
}
