"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";

import { HQ_THEME_COOKIE, HQ_THEME_MAX_AGE_SECONDS, parseHqTheme } from "@/lib/theme";
import { requireSameOriginServerAction } from "@/lib/security/action-origin";

export async function setHqTheme(formData: FormData): Promise<void> {
  await requireSameOriginServerAction();
  const theme = parseHqTheme(formData.get("theme"));
  const store = await cookies();
  store.set(HQ_THEME_COOKIE, theme, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: HQ_THEME_MAX_AGE_SECONDS,
  });
  revalidatePath("/", "layout");
}
