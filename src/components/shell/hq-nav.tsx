"use client";

import { SidebarNav } from "@/components/shell/sidebar-nav";
import { visibleNavGroups } from "@/components/shell/nav-links";

/**
 * The grouped sidebar. A client component on purpose: the group definitions carry
 * icon components, which must never cross the server boundary as props — the server
 * hands over only the capability strings, and the visible set is derived here.
 */
export function HqNav({ capabilities }: { capabilities: readonly string[] }) {
  const groups = visibleNavGroups(capabilities);
  return (
    <div className="sidebar-nav-groups">
      {groups.map((group) => (
        <div className="sidebar-nav-group" key={group.label}>
          <p className="eyebrow sidebar-nav-group__label">{group.label}</p>
          <SidebarNav label={group.label} links={group.links} />
        </div>
      ))}
    </div>
  );
}
