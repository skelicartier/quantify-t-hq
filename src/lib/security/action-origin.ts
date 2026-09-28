import "server-only";

import { headers } from "next/headers";

import { beginAttempt } from "@/lib/api/core";

export class SameOriginActionError extends Error {
  constructor() {
    super("Server Action request did not come from the configured portal origin.");
    this.name = "SameOriginActionError";
  }
}

function originFromUrl(value: string | null): string | null {
  if (!value) return null;
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

function configuredPortalOrigin(): string | null {
  try {
    // Use the site URL from environment variable
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
    return originFromUrl(siteUrl || null);
  } catch {
    return null;
  }
}

function requestOrigin(headersList: Headers): string | null {
  return originFromUrl(headersList.get("origin")) ?? originFromUrl(headersList.get("referer"));
}

export async function requireSameOriginServerAction(formData?: FormData): Promise<void> {
  // The form's attempt id (see `AttemptField`) scopes every idempotency key this
  // action mints; a call without a form gets a fresh attempt of its own.
  const attempt = formData?.get("attempt");
  beginAttempt(typeof attempt === "string" ? attempt : null);
  let headersList: Headers;
  try {
    headersList = await headers();
  } catch {
    if (process.env.NODE_ENV !== "production") return;
    throw new SameOriginActionError();
  }

  const expectedOrigin = configuredPortalOrigin();
  const actualOrigin = requestOrigin(headersList);
  if (!expectedOrigin || !actualOrigin) throw new SameOriginActionError();
  if (actualOrigin === expectedOrigin) return;
  // Development only: the browser may say localhost where the config says 127.0.0.1.
  if (
    process.env.NODE_ENV !== "production" &&
    isLoopback(actualOrigin) &&
    isLoopback(expectedOrigin)
  ) {
    return;
  }
  throw new SameOriginActionError();
}

function isLoopback(origin: string): boolean {
  try {
    const host = new URL(origin).hostname;
    return host === "localhost" || host === "127.0.0.1" || host === "[::1]";
  } catch {
    return false;
  }
}
