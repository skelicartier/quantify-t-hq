import type { ReactNode } from "react";

import { signOutAction } from "@/app/login/actions";
import { setHqTheme } from "@/app/(portal)/actions";
import { HqShell } from "@/components/shell/hq-shell";
import { roleLabel } from "@/lib/access/role-labels";
import { requireStaff } from "@/lib/access/core";
import { HqApiRequestError, HqApiUnavailableError } from "@/lib/api/core";
import { readPreferences } from "@/lib/api/views";
import { DEV_PERSONAS, devAutologinPersona } from "@/lib/auth/dev-bypass";
import { readHqTheme } from "@/lib/dal/theme";
import { formatAbsolute } from "@/lib/format";

export const dynamic = "force-dynamic";

function initialsOf(displayName: string, email: string): string {
  const source = displayName.trim() || email;
  const parts = source.split(/[\s.@_-]+/).filter(Boolean);
  const first = parts[0]?.[0] ?? "?";
  const second = parts[1]?.[0] ?? "";
  return `${first}${second}`.toUpperCase();
}

export default async function PortalLayout({ children }: Readonly<{ children: ReactNode }>) {
  const { me, token } = await requireStaff("/home");
  const theme = await readHqTheme();
  // The account's display preferences; a failed read leaves the device's own copy alone.
  let preferences: Record<string, string> = {};
  try {
    preferences = (await readPreferences(token)).preferences;
  } catch (error) {
    if (!(error instanceof HqApiUnavailableError || error instanceof HqApiRequestError))
      throw error;
  }
  return (
    <HqShell
      preferences={preferences}
      inboxUnread={me.inbox_unread}
      identity={{
        email: me.staff.email,
        displayName: me.staff.display_name || me.staff.email,
        initials: initialsOf(me.staff.display_name, me.staff.email),
        role: me.role,
        environment: me.environment,
        devPersonas: devAutologinPersona() ? DEV_PERSONAS : undefined,
      }}
      capabilities={me.capabilities}
      elevation={
        me.elevation
          ? {
              roleLabel: roleLabel(me.elevation.role),
              endsLabel: me.elevation.ends_at ? formatAbsolute(me.elevation.ends_at) : "it ends",
            }
          : undefined
      }
      signOutAction={signOutAction}
      theme={theme}
      themeAction={setHqTheme}
    >
      {children}
    </HqShell>
  );
}
