/**
 * Whether the figures on screen come from the demo service on this machine rather than the
 * real one: a development build pointed at a local service. The revenue and finance pages
 * say so, so a screenshot of invented figures cannot pass for the company's own.
 */
export function onDemoService(
  env: { NODE_ENV?: string; HQ_ACCOUNT_API_BASE_URL?: string } = process.env,
): boolean {
  if (env.NODE_ENV === "production") return false;
  try {
    const host = new URL(env.HQ_ACCOUNT_API_BASE_URL ?? "").hostname;
    return host === "127.0.0.1" || host === "localhost" || host === "[::1]";
  } catch {
    return false;
  }
}
