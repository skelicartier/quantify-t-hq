// @vitest-environment node
import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";

import { proxy } from "@/proxy";
import { NONCE_HEADER, contentSecurityPolicy, newNonce } from "@/lib/security/csp";

function scriptSource(policy: string): string {
  return policy.split("; ").find((part) => part.startsWith("script-src")) ?? "";
}

describe("the per-request content security policy", () => {
  it("runs no inline script: only this request's nonce and what it loads", () => {
    const policy = contentSecurityPolicy("abc123==", { development: false });
    const scripts = scriptSource(policy);
    expect(scripts).toBe("script-src 'self' 'nonce-abc123==' 'strict-dynamic'");
    expect(scripts).not.toContain("unsafe-inline");
    expect(scripts).not.toContain("unsafe-eval");
    expect(policy).toContain("object-src 'none'");
    expect(policy).toContain("base-uri 'self'");
    expect(policy).toContain("frame-ancestors 'none'");
  });

  it("allows eval in development only, for React's server stacks", () => {
    expect(scriptSource(contentSecurityPolicy("n", { development: true }))).toContain(
      "'unsafe-eval'",
    );
  });

  it("mints a different, unguessable nonce each time", () => {
    const seen = new Set(Array.from({ length: 50 }, () => newNonce()));
    expect(seen.size).toBe(50);
    for (const nonce of seen) expect(atob(nonce)).toHaveLength(16);
  });

  it("stamps a public page and a signed-in page with a fresh policy, on the request and the response", () => {
    const first = proxy(new NextRequest("https://hq.quantifyterminal.com/login"));
    const cookie = { headers: { cookie: "hq-session=hq_abc" } };
    const second = proxy(new NextRequest("https://hq.quantifyterminal.com/home", cookie));
    const policies = [first, second].map(
      (response) => response.headers.get("Content-Security-Policy") ?? "",
    );
    for (const policy of policies)
      expect(scriptSource(policy)).toMatch(
        /^script-src 'self' 'nonce-[A-Za-z0-9+/=]+' 'strict-dynamic'/,
      );
    expect(policies[0]).not.toBe(policies[1]);
    // Next reads the nonce from the forwarded request headers to stamp its own scripts.
    expect(first.headers.get("x-middleware-request-" + NONCE_HEADER)).toBeTruthy();
    expect(first.headers.get("x-middleware-request-content-security-policy")).toBe(policies[0]);
  });

  it("sends a signed-out visitor to sign in without rendering anything", () => {
    const response = proxy(new NextRequest("https://hq.quantifyterminal.com/home"));
    expect(response.status).toBe(307);
  });
});
