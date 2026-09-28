"use client";

import { Keyboard } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { BrandMark } from "@/components/brand/brand-mark";
import { MobileNavToggle } from "@/components/shell/mobile-nav-toggle";
import { NAV_GROUPS } from "@/components/shell/nav-links";
import { openShortcuts } from "@/components/shell/palette-bus";
import { SidebarClock } from "@/components/shell/sidebar-clock";
import { ThemeToggle } from "@/components/shell/theme-toggle";

type Crumb = { href: string; label: string };

/** The section and page a path sits under, from the navigation table; records add their own name in the page bar. */
function crumbsFor(pathname: string): Crumb[] {
  for (const group of NAV_GROUPS) {
    for (const link of group.links) {
      const match =
        pathname === link.href || (link.activePrefix && pathname.startsWith(link.activePrefix));
      if (match) {
        const crumbs: Crumb[] = [{ href: link.href, label: link.label }];
        if (pathname !== link.href) {
          const tail = pathname.slice(link.href.length).split("/").filter(Boolean);
          const leaf = tail[0] ?? "";
          if (
            leaf &&
            !/^[0-9a-f-]{20,}$/i.test(leaf) &&
            !/^sup_/.test(leaf) &&
            !/^QT-/.test(leaf)
          ) {
            crumbs.push({
              href: pathname,
              label: leaf.replace(/-/g, " ").replace(/^\w/, (c) => c.toUpperCase()),
            });
          }
        }
        return [{ href: "/home", label: group.label }, ...crumbs];
      }
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
