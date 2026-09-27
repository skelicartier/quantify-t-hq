import type { ReactNode } from "react";

import { AppBar } from "@/components/shell/app-bar";
import { Footer } from "@/components/shell/footer";
import type { ShellIdentity } from "@/components/shell/shell-types";
import { Sidebar } from "@/components/shell/sidebar";
import { ThemeScope } from "@/components/shell/theme-scope";
import { DEFAULT_HQ_THEME } from "@/lib/theme";
import type { HqTheme } from "@/lib/theme";

type HqShellProps = {
  identity: ShellIdentity;
  nav: ReactNode;
  signOutAction: () => Promise<void>;
  theme?: HqTheme | undefined;
  themeAction?: ((formData: FormData) => Promise<void>) | undefined;
  children: ReactNode;
};

/**
 * The HQ frame: the console's shell with one section instead of two. Synchronous on
 * purpose — the portal layout awaits its data and hands it in as props.
 */
export function HqShell({
  identity,
  nav,
  signOutAction,
  theme = DEFAULT_HQ_THEME,
  themeAction,
  children,
}: HqShellProps) {
  return (
    <ThemeScope section="hq" theme={theme} action={themeAction}>
      <Sidebar identity={identity} nav={nav} signOutAction={signOutAction} />
      <div className="shell__body">
        <AppBar />
        <main className="shell__main" id="main-content" tabIndex={-1}>
          {children}
        </main>
        <Footer />
      </div>
    </ThemeScope>
  );
}
