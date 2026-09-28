import type { ReactNode } from "react";

import { signOutAction } from "@/app/login/actions";
import { setHqTheme } from "@/app/(portal)/actions";
import { HqShell } from "@/components/shell/hq-shell";
import { requireStaff } from "@/lib/access/core";
import { DEV_PERSONAS, devAutologinPersona } from "@/lib/auth/dev-bypass";
import { readHqTheme } from "@/lib/dal/theme";

export const dynamic = "force-dynamic";

function initialsOf(displayName: string, email: string): string {
  const source = displayName.trim() || email;
  const parts = source.split(/[\s.@_-]+/).filter(Boolean);
  const first = parts[0]?.[0] ?? "?";
  const second = parts[1]?.[0] ?? "";
  return `${first}${second}`.toUpperCase();
}

export default async function PortalLayout({ children }: Readonly<{ children: ReactNode }>) {
  const { me } = await requireStaff("/home");
  const theme = await readHqTheme();
  return (
    <HqShell
      identity={{
        email: me.staff.email,
        displayName: me.staff.display_name || me.staff.email,
        initials: initialsOf(me.staff.display_name, me.staff.email),
        role: me.role,
        environment: me.environment,
        devPersonas: devAutologinPersona() ? DEV_PERSONAS : undefined,
      }}
      capabilities={me.capabilities}
      signOutAction={signOutAction}
      theme={theme}
      themeAction={setHqTheme}
    >
      {children}
    </HqShell>
  );
}
