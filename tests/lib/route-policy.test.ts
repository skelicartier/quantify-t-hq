import { describe, expect, it } from "vitest";

import { buildLoginRedirectUrl, isPublicPath, sanitizeNextPath } from "@/lib/auth/route-policy";

describe("default-deny route policy", () => {
  it("lists the public surface exactly", () => {
    for (const path of [
      "/login",
      "/login/verify",
      "/login/enroll",
      "/forgot-password",
      "/reset-password",
      "/verify/QT-2026-0001",
    ]) {
      expect(isPublicPath(path)).toBe(true);
    }
  });

  it("everything else needs a session", () => {
    for (const path of [
      "/",
      "/home",
      "/admin/staff",
      "/support",
      "/verify",
      "/loginx",
      "/me/security",
    ]) {
      expect(isPublicPath(path)).toBe(false);
    }
  });

  it("sanitizes the return path against open redirects", () => {
    expect(sanitizeNextPath("/deals/abc")).toBe("/deals/abc");
    expect(sanitizeNextPath("https://evil.example")).toBe("/home");
    expect(sanitizeNextPath("//evil.example")).toBe("/home");
    expect(sanitizeNextPath("/login")).toBe("/home");
    expect(sanitizeNextPath("/login/verify?x=1")).toBe("/home");
    expect(sanitizeNextPath("")).toBe("/home");
    expect(sanitizeNextPath(undefined)).toBe("/home");
  });

  it("builds the sign-in redirect with the place to return to", () => {
    const url = buildLoginRedirectUrl(new URL("https://hq.example.test/deals/42?tab=notes"));
    expect(url.pathname).toBe("/login");
    expect(url.searchParams.get("next")).toBe("/deals/42?tab=notes");
  });
});
