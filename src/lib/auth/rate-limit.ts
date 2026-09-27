/**
 * Turning the service's rate-limit refusal into something a person can act on.
 *
 * The copy repeats no more than the service disclosed — never which bucket ran out,
 * because "too many attempts for this account" would confirm the account exists. And
 * the wait is rounded UP to whole minutes: telling somebody to come back in a minute
 * when the lock has four left earns them another refusal and teaches them the message
 * is not worth reading.
 */

export function formatRateLimitMessage(retryAfterSeconds?: number): string {
  const seconds =
    typeof retryAfterSeconds === "number" && retryAfterSeconds > 0 ? retryAfterSeconds : null;
  if (seconds === null) return "Too many attempts. Wait a few minutes before trying again.";
  const minutes = Math.max(1, Math.ceil(seconds / 60));
  return minutes === 1
    ? "Too many attempts. Wait about a minute before trying again."
    : `Too many attempts. Wait about ${minutes} minutes before trying again.`;
}
