import "server-only";

import { Resolver } from "node:dns/promises";

/**
 * Where an address's mail lives, read from its domain's mail servers (its MX records), so
 * a person types their address and is sent to the sign-in that fits it — without being
 * asked to pick a brand.
 *
 * Two hosts sign in through their own consent screen. Every other host signs in by its
 * outgoing server and an app password; for the team's own host those servers are known
 * well enough to fill in, and for any other the person types them.
 */

export type KnownServers = {
  smtp_host: string;
  smtp_port: number;
  imap_host: string;
  imap_port: number;
};

export type MailHost =
  | { kind: "google" }
  | { kind: "microsoft" }
  | { kind: "server"; exchange: string; servers: KnownServers | null }
  /** The domain lists no mail servers, or does not exist. */
  | { kind: "none" }
  /** The lookup itself failed; nothing is known either way. */
  | { kind: "unknown" };

const GOOGLE = /(^|\.)(google\.com|googlemail\.com)$/;
const MICROSOFT = /(^|\.)outlook\.com$/;
/** An organisation's mailbox at this host signs in at `smtppro.` / `imappro.` in its region. */
const ZOHO = /^mx\d*\.(zoho\.(?:com|eu|in|com\.au|jp|sa)|zohocloud\.ca)$/;

/** The host behind a domain's mail servers, most preferred first. */
export function classifyExchanges(exchanges: readonly string[]): MailHost {
  const names = exchanges
    .map((name) => name.trim().replace(/\.$/, "").toLowerCase())
    .filter(Boolean);
  if (names.length === 0) return { kind: "none" };
  if (names.some((name) => GOOGLE.test(name))) return { kind: "google" };
  if (names.some((name) => MICROSOFT.test(name))) return { kind: "microsoft" };
  for (const name of names) {
    const zoho = ZOHO.exec(name);
    if (zoho) {
      return {
        kind: "server",
        exchange: name,
        servers: {
          smtp_host: `smtppro.${zoho[1]}`,
          smtp_port: 465,
          imap_host: `imappro.${zoho[1]}`,
          imap_port: 993,
        },
      };
    }
  }
  return { kind: "server", exchange: names[0]!, servers: null };
}

/** The big consumer mailboxes: where their mail lives is known without asking DNS. */
const KNOWN_HOSTS: Record<string, MailHost> = {
  "gmail.com": { kind: "google" },
  "googlemail.com": { kind: "google" },
  "outlook.com": { kind: "microsoft" },
  "hotmail.com": { kind: "microsoft" },
  "live.com": { kind: "microsoft" },
  "msn.com": { kind: "microsoft" },
};

/**
 * How long a lookup may take in all. The resolver's own timeout is per server and per
 * try, so a network that has gone quiet could hold "Connect" for twenty seconds; past
 * this the host is "unknown" and the person is sent to the server form instead.
 */
export const LOOKUP_DEADLINE_MS = 4_000;

function withDeadline<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(Object.assign(new Error("lookup timed out"), { code: "ETIMEOUT" })),
      ms,
    );
  });
  return Promise.race([work, late]).finally(() => clearTimeout(timer));
}

async function lookupMx(domain: string): Promise<string[]> {
  const resolver = new Resolver({ timeout: 3000, tries: 2 });
  const records = await resolver.resolveMx(domain);
  return [...records]
    .sort((left, right) => left.priority - right.priority)
    .map((record) => record.exchange);
}

export function domainOf(address: string): string {
  const at = address.lastIndexOf("@");
  return at < 0
    ? ""
    : address
        .slice(at + 1)
        .trim()
        .toLowerCase();
}

export async function mailHostOf(
  address: string,
  lookup: (domain: string) => Promise<string[]> = lookupMx,
  deadlineMs = LOOKUP_DEADLINE_MS,
): Promise<MailHost> {
  const domain = domainOf(address);
  if (!domain) return { kind: "none" };
  const known = KNOWN_HOSTS[domain];
  if (known) return known;
  try {
    return classifyExchanges(await withDeadline(lookup(domain), deadlineMs));
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? error.code : "";
    if (code === "ENODATA" || code === "ENOTFOUND") return { kind: "none" };
    return { kind: "unknown" };
  }
}
