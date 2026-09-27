import type { ReactNode } from "react";

import { BrandMark } from "@/components/brand/brand-mark";
import { SidebarIdentity } from "@/components/shell/sidebar-identity";
import type { ShellIdentity } from "@/components/shell/shell-types";

type SidebarProps = {
  identity: ShellIdentity;
  nav: ReactNode;
  signOutAction: () => Promise<void>;
};

export function Sidebar({ identity, nav, signOutAction }: SidebarProps) {
  return (
    <aside className="sidebar" id="shell-sidebar">
      <BrandMark href="/home" />
      <p className="eyebrow sidebar__section">Headquarters</p>
      {nav}
      <SidebarIdentity identity={identity} signOutAction={signOutAction} />
    </aside>
  );
}
