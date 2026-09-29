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
      "/u/dTEBfb56jBDzRbafTujEGst",
      "/u/dTEBfb56jBDzRbafTujEGst/one-click",
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
      "/u",
      "/mail",
      "/mail/campaigns",
    ]) {
      expect(isPublicPath(path)).toBe(false);
    }
  });

  it("sanitizes the return path against open redirects", () => {
    expect(sanitizeNextPath("/deals/abc")).toBe("/deals/abc");
    expect(sanitizeNextPath("https://evil.example")).toBe("/home");
    expect(sanitizeNextPath("//evil.example")).toBe("/home");
    // What a URL parser makes of these is another origin, whatever they look like.
    expect(sanitizeNextPath("/\\evil.example")).toBe("/home");
    expect(sanitizeNextPath("/\t//evil.example")).toBe("/home");
    expect(sanitizeNextPath("/\n/\\evil.example")).toBe("/home");
    expect(sanitizeNextPath("/%09/evil.example")).toBe("/%09/evil.example");
    expect(sanitizeNextPath("/deals?view=table#x")).toBe("/deals?view=table");
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
