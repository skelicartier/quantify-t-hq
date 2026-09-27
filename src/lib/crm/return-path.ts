/**
 * The page a shared action (log activity, add task) refreshes afterwards. Forms post
 * it as a hidden field, so it is untrusted input: only the portal's own record pages
 * are accepted, and anything else refreshes nothing rather than something unexpected.
 */
const RECORD_PAGE = /^\/(?:home|tasks|leads|companies|people|deals)(?:\/[A-Za-z0-9._-]{1,64})?$/;

export function safeReturnPath(value: string): string | null {
  return RECORD_PAGE.test(value) ? value : null;
}
