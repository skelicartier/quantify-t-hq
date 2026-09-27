export const HQ_THEMES = ["dark", "light"] as const;

export type HqTheme = (typeof HQ_THEMES)[number];

export const DEFAULT_HQ_THEME: HqTheme = "dark";

/** Device-level preference for the signed-in console; the sign-in pages are always dark. */
export const HQ_THEME_COOKIE = "hq-theme";

export const HQ_THEME_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

export function isHqTheme(value: unknown): value is HqTheme {
  return typeof value === "string" && (HQ_THEMES as readonly string[]).includes(value);
}

export function parseHqTheme(value: unknown): HqTheme {
  return isHqTheme(value) ? value : DEFAULT_HQ_THEME;
}
