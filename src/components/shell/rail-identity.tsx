"use client";

import { LogOut, Moon, ShieldCheck, Sun } from "lucide-react";
import Link from "next/link";

import type { ShellIdentity } from "@/components/shell/shell-types";
import { useHqTheme } from "@/components/shell/theme-scope";
import { roleLabel } from "@/lib/access/role-labels";

type RailIdentityProps = {
  identity: ShellIdentity;
  signOutAction: () => Promise<void>;
  collapsed: boolean;
};

/**
 * Who is signed in, as a menu: theme, My security, sign out. A native `<details>`, so
 * it works before hydration and closes on Escape like any disclosure.
 */
export function RailIdentity({ identity, signOutAction, collapsed }: RailIdentityProps) {
  const { theme, setTheme } = useHqTheme();
  return (
    <details className="rail__identity">
      <summary title={collapsed ? identity.displayName : undefined}>
        <span className="avatar avatar--small" aria-hidden="true">
          {identity.initials}
        </span>
        <span className="rail__identity-text">
          <span className="rail__identity-name">{identity.displayName}</span>
          <span className="rail__identity-role">
            {roleLabel(identity.role)}
            {identity.environment && identity.environment !== "production"
              ? ` · ${identity.environment}`
              : ""}
          </span>
        </span>
      </summary>
      <div className="rail__menu" role="menu">
        <p className="rail__menu-email">{identity.email}</p>
        <button
          type="button"
          role="menuitem"
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
        >
          {theme === "dark" ? (
            <Sun size={14} strokeWidth={1.8} aria-hidden="true" />
          ) : (
            <Moon size={14} strokeWidth={1.8} aria-hidden="true" />
          )}
          {theme === "dark" ? "Light theme" : "Dark theme"}
        </button>
        <Link href="/me/security" role="menuitem">
          <ShieldCheck size={14} strokeWidth={1.8} aria-hidden="true" />
          My security
        </Link>
        <form action={signOutAction}>
          <button type="submit" role="menuitem">
            <LogOut size={14} strokeWidth={1.8} aria-hidden="true" />
            Sign out
          </button>
        </form>
      </div>
    </details>
  );
}
