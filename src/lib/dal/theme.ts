import "server-only";

import { cookies } from "next/headers";

import { HQ_THEME_COOKIE, DEFAULT_HQ_THEME, parseHqTheme } from "@/lib/theme";
import type { HqTheme } from "@/lib/theme";

/** The console theme for this request; dark whenever the cookie is absent or unreadable. */
export async function readHqTheme(): Promise<HqTheme> {
  try {
    const store = await cookies();
    return parseHqTheme(store.get(HQ_THEME_COOKIE)?.value);
  } catch {
    return DEFAULT_HQ_THEME;
  }
}
