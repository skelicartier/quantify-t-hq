"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import type { NavLink } from "@/components/shell/nav-links";

type SidebarNavProps = {
  label: string;
  links: readonly NavLink[];
};

export function SidebarNav({ label, links }: SidebarNavProps) {
  const pathname = usePathname();
  return (
    <nav className="sidebar-nav" aria-label={label}>
      <ul>
        {links.map(({ href, label: text, icon: Icon, activePrefix }) => {
          const current =
            pathname === href || (activePrefix ? pathname.startsWith(activePrefix) : false);
          return (
            <li key={href}>
              <Link href={href} aria-current={current ? "page" : undefined}>
                <Icon size={16} strokeWidth={1.8} aria-hidden="true" />
                <span>{text}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
