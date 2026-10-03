import "server-only";

import { Resolver } from "node:dns/promises";

/**
 * What a sending domain publishes, read from DNS and judged against the hosts its
 * mailboxes sign in at: SPF says which servers may send for it, DKIM that its mail was
 * signed, DMARC what a receiver should do when neither holds, and MX where replies and
 * bounces land. Each check says what is missing in words a person can act on; the page
 * never names a host's brand, only the records the host told the team to publish.
 */

export type RecordState = "ok" | "attention" | "missing" | "unknown";
export type RecordCheck = { state: RecordState; detail: string };
export type DomainRecords = {
  spf: RecordCheck;
  dkim: RecordCheck;
  dmarc: RecordCheck;
  mx: RecordCheck;
};

/** The SPF include each host's own setup guide asks for. */
const SPF_INCLUDES: Record<string, string> = {
  google: "_spf.google.com",
  microsoft: "spf.protection.outlook.com",
};
/** DKIM selectors the hosts use by default; another host's is tried among the common ones. */
const DKIM_SELECTORS: Record<string, string[]> = {
  google: ["google"],
  microsoft: ["selector1", "selector2"],
};
const COMMON_SELECTORS = ["default", "dkim", "mail", "zmail", "zoho", "k1", "s1"];

/** smtppro.zoho.in → zoho.in: the region a Zoho mailbox's include names. */
function zohoRegion(host: string): string | null {
  const match = /(?:^|\.)zoho\.((?:com|eu|in|com\.au|jp|sa))$/.exec(host);
  return match ? `zoho.${match[1]}` : host.endsWith("zohocloud.ca") ? "zohocloud.ca" : null;
}

export function expectedIncludes(hosts: readonly string[]): string[] {
  const wanted = new Set<string>();
  for (const host of hosts) {
    const known = SPF_INCLUDES[host];
    if (known) wanted.add(known);
    const zoho = zohoRegion(host);
    if (zoho) wanted.add(zoho);
  }
  return [...wanted];
}

export function selectorsFor(hosts: readonly string[]): string[] {
  const selectors = new Set<string>();
  for (const host of hosts)
    for (const selector of DKIM_SELECTORS[host] ?? []) selectors.add(selector);
  if (hosts.some((host) => !(host in DKIM_SELECTORS)))
    for (const selector of COMMON_SELECTORS) selectors.add(selector);
  return [...selectors];
}

/** SPF: one record, naming every host the domain's mailboxes send through, ending strictly. */
export function judgeSpf(records: readonly string[], hosts: readonly string[]): RecordCheck {
  const spf = records.filter((record) => /^v=spf1(\s|$)/i.test(record.trim()));
  if (spf.length === 0)
    return {
      state: "missing",
      detail: "No SPF record: receivers cannot tell who may send for it.",
    };
  if (spf.length > 1)
    return {
      state: "attention",
      detail: `${spf.length} SPF records; receivers treat more than one as an error. Merge them into one.`,
    };
  const record = spf[0]!.trim();
  // `include:` the host's record, or hand the whole record over with `redirect=`.
  const missing = expectedIncludes(hosts).filter(
    (include) =>
      !new RegExp(`(^|\\s)(include:|redirect=)${include.replace(/\./g, "\\.")}(\\s|$)`, "i").test(
        record,
      ),
  );
  if (missing.length)
    return {
      state: "attention",
      detail: `It does not include ${missing.join(" or ")}, which its mailboxes send through.`,
    };
  if (/(^|\s)[+?]?all(\s|$)/i.test(record) && !/(^|\s)[~-]all(\s|$)/i.test(record))
    return {
      state: "attention",
      detail: "It ends allowing anyone to send; end it with ~all or -all.",
    };
  return { state: "ok", detail: record };
}

/** DMARC: present, with a policy, and somewhere for reports to go. */
export function judgeDmarc(records: readonly string[]): RecordCheck {
  const dmarc = records.find((record) => /^v=DMARC1/i.test(record.trim()));
  if (!dmarc)
    return {
      state: "missing",
      detail: "No DMARC record: publish one, starting at p=none, before the first cold email.",
    };
  const policy = /(?:^|;)\s*p\s*=\s*(none|quarantine|reject)/i.exec(dmarc)?.[1]?.toLowerCase();
  if (!policy) return { state: "attention", detail: "The DMARC record names no policy (p=)." };
  const reports = /(?:^|;)\s*rua\s*=/i.test(dmarc);
  return {
    state: reports ? "ok" : "attention",
    detail: `Policy ${policy}${reports ? ", reports sent" : "; no address for reports (rua=), so nobody sees what fails"}.`,
  };
}

export function judgeDkim(
  found: readonly string[],
  tried: readonly string[],
  hosts: readonly string[],
): RecordCheck {
  if (found.length) return { state: "ok", detail: `Signed: a key under ${found.join(", ")}.` };
  const known = hosts.every((host) => host in DKIM_SELECTORS);
  return known
    ? {
        state: "missing",
        detail: `No DKIM key under ${tried.join(", ")}: turn signing on in the host's settings and publish the key it gives.`,
      }
    : {
        state: "unknown",
        detail: `No key under the usual names (${tried.join(", ")}). The host chose the name: check its DKIM settings.`,
      };
}

const flat = (chunks: string[][]) => chunks.map((chunk) => chunk.join(""));

type Lookup = { records: string[] } | { code: string };

function codeOf(error: unknown): string {
  return error && typeof error === "object" && "code" in error ? String(error.code) : "";
}

const UNKNOWN: RecordCheck = { state: "unknown", detail: "Could not be looked up just now." };
/** All four, when the domain itself is not in DNS. */
export const NO_DOMAIN: RecordCheck = {
  state: "missing",
  detail: "The domain is not in DNS at all: register it and publish its records first.",
};

/**
 * What was read, kept a while: records change when someone edits DNS, not between two
 * page loads, and a page that waits on DNS for every render waits on every action too.
 */
const CACHE = new Map<string, { at: number; value: DomainRecords }>();
const KEEP_MS = 10 * 60 * 1000;
const KEEP_UNKNOWN_MS = 60 * 1000;

/** Read and judge a domain's records, from the cache when they were read lately. */
export async function checkDomain(
  domain: string,
  hosts: readonly string[],
): Promise<DomainRecords> {
  const key = `${domain}|${[...hosts].sort().join(",")}`;
  const kept = CACHE.get(key);
  const now = Date.now();
  if (kept) {
    const unsure = Object.values(kept.value).some((check) => check.state === "unknown");
    if (now - kept.at < (unsure ? KEEP_UNKNOWN_MS : KEEP_MS)) return kept.value;
  }
  const value = await lookUp(domain, hosts);
  CACHE.set(key, { at: now, value });
  if (CACHE.size > 200) CACHE.delete(CACHE.keys().next().value!);
  return value;
}

/**
 * The longest a page waits on DNS. Node's resolver tries every nameserver on every try,
 * so its own timeout is no bound: a slow resolver held each render, and every action's
 * answer with it, for fifteen seconds. Past this, what is not back reads "could not be
 * looked up just now" and is asked again a minute later.
 */
const DEADLINE_MS = 3000;

/** Read and judge a domain's records, everything back within the deadline. */
async function lookUp(domain: string, hosts: readonly string[]): Promise<DomainRecords> {
  const resolver = new Resolver({ timeout: 1500, tries: 1 });
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<Lookup>((resolve) => {
    timer = setTimeout(() => resolve({ code: "ETIMEOUT" }), DEADLINE_MS);
  });
  try {
    return await judgeLookups(domain, hosts, resolver, (lookup) => Promise.race([lookup, late]));
  } finally {
    clearTimeout(timer);
    resolver.cancel();
  }
}

async function judgeLookups(
  domain: string,
  hosts: readonly string[],
  resolver: Resolver,
  inTime: (lookup: Promise<Lookup>) => Promise<Lookup>,
): Promise<DomainRecords> {
  const txt = async (name: string): Promise<Lookup> => {
    try {
      return { records: flat(await resolver.resolveTxt(name)) };
    } catch (error) {
      // No record of that type is an answer; no such name is a different one.
      return codeOf(error) === "ENODATA" ? { records: [] } : { code: codeOf(error) };
    }
  };
  const tried = selectorsFor(hosts);
  const [root, dmarc, mx, ...keys] = await Promise.all([
    inTime(txt(domain)),
    inTime(txt(`_dmarc.${domain}`)),
    inTime(
      resolver.resolveMx(domain).then(
        (records): Lookup => ({ records: records.map((record) => record.exchange) }),
        (error: unknown): Lookup =>
          codeOf(error) === "ENODATA" ? { records: [] } : { code: codeOf(error) },
      ),
    ),
    ...tried.map((selector) => inTime(txt(`${selector}._domainkey.${domain}`))),
  ]);
  if ("code" in root && root.code === "ENOTFOUND" && "code" in mx && mx.code === "ENOTFOUND")
    return { spf: NO_DOMAIN, dkim: NO_DOMAIN, dmarc: NO_DOMAIN, mx: NO_DOMAIN };
  // A name that does not exist under the domain (no DMARC, no key) is "none", not a failure.
  const records = (lookup: Lookup | undefined): string[] | null =>
    !lookup ? null : "records" in lookup ? lookup.records : lookup.code === "ENOTFOUND" ? [] : null;
  const rootRecords = records(root);
  const dmarcRecords = records(dmarc);
  const mxRecords = records(mx);
  const keyRecords = keys.map(records);
  const found = tried.filter((_selector, index) =>
    (keyRecords[index] ?? []).some((record) => /(^|;)\s*(v=DKIM1|k=rsa|p=)/i.test(record)),
  );
  return {
    spf: rootRecords === null ? UNKNOWN : judgeSpf(rootRecords, hosts),
    dmarc: dmarcRecords === null ? UNKNOWN : judgeDmarc(dmarcRecords),
    dkim:
      keyRecords.some((value) => value === null) && found.length === 0
        ? UNKNOWN
        : judgeDkim(found, tried, hosts),
    mx:
      mxRecords === null
        ? UNKNOWN
        : mxRecords.length
          ? { state: "ok", detail: `Mail lands at ${mxRecords[0]}.` }
          : {
              state: "missing",
              detail: "No mail servers: replies and bounces have nowhere to land.",
            },
  };
}
