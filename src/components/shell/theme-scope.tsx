"use client";

import { Suspense, createContext, startTransition, useContext, useOptimistic } from "react";
import type { ReactNode } from "react";

import { RouteProgress } from "@/components/shell/route-progress";

import { DEFAULT_HQ_THEME } from "@/lib/theme";
import type { HqTheme } from "@/lib/theme";

type ThemeContextValue = {
  theme: HqTheme;
  setTheme: (theme: HqTheme) => void;
};

const ThemeContext = createContext<ThemeContextValue>({
  theme: DEFAULT_HQ_THEME,
  setTheme: () => undefined,
});

type ThemeScopeProps = {
  section: string;
  theme: HqTheme;
  /** Persists the choice; the frame flips optimistically and settles on the server value. */
  action?: ((formData: FormData) => Promise<void>) | undefined;
  children: ReactNode;
};

/**
 * The `.shell` element with the theme attribute the stylesheet keys on. Only the console
 * lives inside it — the sign-in pages sit outside and stay dark.
 */
export function ThemeScope({ section, theme, action, children }: ThemeScopeProps) {
  const [optimisticTheme, showTheme] = useOptimistic(theme);

  function setTheme(next: HqTheme) {
    startTransition(async () => {
      showTheme(next);
      if (!action) return;
      const formData = new FormData();
      formData.set("theme", next);
      await action(formData);
    });
  }

  return (
    <ThemeContext.Provider value={{ theme: optimisticTheme, setTheme }}>
      <div className="shell" data-section={section} data-theme={optimisticTheme}>
        <Suspense fallback={null}>
          <RouteProgress />
        </Suspense>
        {children}
      </div>
    </ThemeContext.Provider>
  );
}

export function useHqTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}
