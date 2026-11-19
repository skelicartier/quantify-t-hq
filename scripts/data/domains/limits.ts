/**
 * Domains and certificates: limits, sentences and the public-hostname check
 * (ws-notes/duties/spec.md §6.5). Module constants, because `guard.ts` is not edited.
 */

import { Refused } from "../../mail-merge/engine";
import { clean } from "../guard";

export const LIMIT = {
  domains: 200,
  hosts: 200,
  signing: 50,
  security_txt: 50,
  text: 120,
  notes: 2_000,
  sends_as: 12,
  sends_as_item: 80,
  lead_min: 7,
  lead_max: 180,
  lead_default: 45,
  hostname: 253,
  why: 300,
  contact: 254,
  /** The last handshakes kept per host when the module loads. */
  probes_kept: 50,
  /** Failed handshakes in a row that put a host in Due. */
  failed_in_a_row: 3,
  search: 200,
} as const;

/** The handshake: port 443, eight seconds at most, once a day by itself. */
export const PROBE = {
  timeout_ms: 8_000,
  first_after_ms: 60_000,
  every_ms: 6 * 60 * 60 * 1000,
  stale_ms: 24 * 60 * 60 * 1000,
} as const;

/** A PIN or a password written into a field that might attract one: refused. */
export const PIN = /\b(pin|password|passcode)\b\s*[:=-]?\s*\S/i;

export const SAY = {
  hostname: "Type a public hostname, such as www.example.com.",
  domainTaken: "That domain is already here.",
  hostTaken: "That hostname is already here.",
  purpose: "Choose what the domain is for from the list.",
  flag: "Choose Yes, No or Not known.",
  dmarc: "Choose the DMARC stage from the list.",
  platform: "Choose Mac, Windows or Other.",
  pin: "Write where it is kept, never its PIN or password.",
  notADay: "That is not a day.",
  future: "That day is in the future.",
  expires: "Give the day it expires.",
  issuedAfter: "It cannot expire before it was issued.",
  publishedAfter: "It cannot expire before it was published.",
  lead: "Type the days before expiry as a whole number from 7 to 180.",
  name: "Give it a name.",
  sendsAs: "List at most 12 services, each at most 80 characters.",
  policy: "Paste the policy's https link, or leave it empty.",
  why: "Say why in a few words.",
  released: "That domain is released already.",
  retired: "That is retired already.",
  replaced: "That certificate is marked as replaced already.",
  domain: "That domain is not here.",
  host: "That hostname is not here.",
  signing: "That signing certificate is not here.",
  txt: "That security.txt record is not here.",
  noProber: "Checking is off in this copy.",
  checking: "A check of every hostname is already running.",
  nothingToCheck: "No hostname to check.",
} as const;

export const tooMany = (count: number): string =>
  `Data holds ${count.toLocaleString("en")} at most.`;

const LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const PRIVATE_ENDINGS = [".local", ".internal", ".lan", ".home.arpa", ".test", ".localhost"];

/**
 * A public DNS name, lower case: labels of letters, digits and hyphens, at least one dot, at
 * most 253 characters, not an IP address, not localhost and not a private ending. `.example`
 * is allowed (the walk's names, which never resolve). Throws the page's sentence.
 */
export function publicHostname(value: unknown): string {
  const text = clean(value, 300).trim().toLowerCase().replace(/\.$/, "");
  const labels = text.split(".");
  const ok =
    text.length > 0 &&
    text.length <= LIMIT.hostname &&
    labels.length >= 2 &&
    labels.every((label) => LABEL.test(label)) &&
    !/^\d+$/.test(labels[labels.length - 1] ?? "") &&
    text !== "localhost" &&
    !PRIVATE_ENDINGS.some((ending) => text.endsWith(ending));
  if (!ok) throw new Refused(400, "invalid", SAY.hostname);
  return text;
}
