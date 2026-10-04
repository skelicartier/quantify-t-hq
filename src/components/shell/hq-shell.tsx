import type { ReactNode } from "react";

import { recentlyViewedAction, searchRecordsAction } from "@/app/(portal)/_actions/search";
import { PrintFrame } from "@/components/documents/print-frame";
import { CommandPalette } from "@/components/shell/command-palette";
import { ContextBar } from "@/components/shell/context-bar";
import { Rail } from "@/components/shell/rail";
import type { ShellIdentity } from "@/components/shell/shell-types";
import { PreferencesHydrator } from "@/components/shell/preferences-hydrator";
import { Shortcuts } from "@/components/shell/shortcuts";
import { ThemeScope } from "@/components/shell/theme-scope";
import { DEFAULT_HQ_THEME } from "@/lib/theme";
import type { HqTheme } from "@/lib/theme";
import type { Letterhead } from "@/lib/api/company";

type HqShellProps = {
  identity: ShellIdentity;
  capabilities: readonly string[];
  signOutAction: () => Promise<void>;
  theme?: HqTheme | undefined;
  themeAction?: ((formData: FormData) => Promise<void>) | undefined;
  /** The account's display preferences, brought onto this device on load. */
  preferences?: Readonly<Record<string, string>> | undefined;
  /** Unread inbox rows, for the rail's badge. */
  inboxUnread?: number | undefined;
  /** A live elevation: the role taken and when it ends, shown on every page until then. */
  elevation?: { roleLabel: string; endsLabel: string } | undefined;
  /** The company's letterhead and the reader's name, for every printed page. */
  print?: { letterhead: Letterhead; printedBy: string } | undefined;
  children: ReactNode;
};

/**
 * The frame: an inverted L of rail and context bar around the work surface, plus the
 * two overlays every page shares — the palette and the shortcuts sheet. Synchronous on
 * purpose: the portal layout awaits its data and hands it in as props.
 */
export function HqShell({
  identity,
  capabilities,
  signOutAction,
  theme = DEFAULT_HQ_THEME,
  themeAction,
  preferences,
  inboxUnread,
  elevation,
  print,
  children,
}: HqShellProps) {
  return (
    <ThemeScope section="hq" theme={theme} action={themeAction}>
      {preferences && Object.keys(preferences).length > 0 && (
        <PreferencesHydrator preferences={preferences} />
      )}
      <Rail
        identity={identity}
        capabilities={capabilities}
        signOutAction={signOutAction}
        counts={{ "/inbox": inboxUnread ?? 0 }}
      />
      <div className="shell__body">
        <ContextBar />
        {elevation && (
          <p className="elevation-bar" role="status">
            <strong>Acting as {elevation.roleLabel}</strong> until {elevation.endsLabel}. Everything
            you do meanwhile is marked with it in the audit log.{" "}
            <a href="/me/security#elevation">End it</a>
          </p>
        )}
        <main className="shell__main" id="main-content" tabIndex={-1}>
          {print && <PrintFrame head={print.letterhead} printedBy={print.printedBy} />}
          {children}
        </main>
      </div>
      <CommandPalette
        capabilities={capabilities}
        search={searchRecordsAction}
        recent={recentlyViewedAction}
      />
      <Shortcuts capabilities={capabilities} />
    </ThemeScope>
  );
}
