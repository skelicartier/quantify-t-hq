/**
 * Checks that compare the facts (ws-notes/company/spec.md §6.3): each a sentence shown under
 * "Checks", never a refusal, so a typo is caught and a real oddity is still saved. Pure.
 */

import { daysBetween } from "../days";
import { DPIIT_STATUSES, FLAGS, STATES, dayWords } from "../../../src/lib/data/labels-company";
import type { DutyCheck, Facts } from "./types";

const ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";

/**
 * The GSTIN's check character for its first 14: over the alphabet 0–9A–Z (values 0–35),
 * each value times 1 at an even place and 2 at an odd one, `floor(p ÷ 36) + p mod 36`
 * summed, and the check is `(36 − sum mod 36) mod 36`. "" when the text is not 14 of them.
 */
export function gstinCheck(first14: string): string {
  if (first14.length !== 14) return "";
  let sum = 0;
  for (let index = 0; index < 14; index += 1) {
    const value = ALPHABET.indexOf(first14[index]!);
    if (value < 0) return "";
    const product = value * (index % 2 === 0 ? 1 : 2);
    sum += Math.floor(product / 36) + (product % 36);
  }
  return ALPHABET[(36 - (sum % 36)) % 36]!;
}

const flagWords = (flag: string): string => (flag === "no" ? FLAGS.no : FLAGS[""]);

/** Every check the facts fail, in the order of §6.3; [] for facts that agree. */
export function checksOf(facts: Facts): string[] {
  const lines: string[] = [];
  if (facts.flags.subsidiary === "yes" && facts.flags.small === "yes")
    lines.push("A subsidiary cannot be a small company. Check both answers with your CS.");
  if (facts.pan && facts.pan[3] !== "C")
    lines.push("For a company the PAN's fourth letter is C. Check the PAN.");
  if (facts.gstin) {
    if (facts.pan && facts.gstin.slice(2, 12) !== facts.pan)
      lines.push("The GSTIN's middle ten characters are not the company's PAN. Check both.");
    if (facts.gstin.slice(14) !== gstinCheck(facts.gstin.slice(0, 14)))
      lines.push(
        "The GSTIN's last character does not match the rest. Check it against the certificate.",
      );
    if (facts.flags.gst_registered !== "yes")
      lines.push(
        `There is a GSTIN, but Registered for GST says ${flagWords(facts.flags.gst_registered)}.`,
      );
  }
  if (facts.cin && facts.incorporated_on) {
    const year = facts.cin.slice(8, 12);
    const incorporated = facts.incorporated_on.slice(0, 4);
    if (year !== incorporated)
      lines.push(
        `The CIN's year is ${year}, but the company was incorporated in ${incorporated}. Check both.`,
      );
  }
  if (facts.cin && facts.registered_state) {
    const code = facts.cin.slice(6, 8);
    if (code !== facts.registered_state) {
      const state = STATES[facts.registered_state as keyof typeof STATES] ?? facts.registered_state;
      lines.push(`The CIN's state code is ${code}, but the registered state is ${state}.`);
    }
  }
  if (facts.dpiit.number && facts.flags.startup !== "yes")
    lines.push(
      `There is a DPIIT number, but DPIIT-recognised startup says ${flagWords(facts.flags.startup)}.`,
    );
  return lines;
}

/**
 * The duties batch's check lines (ws-notes/duties/spec.md §6.2): the CERT-In point of
 * contact, the books of record and DPIIT, each a sentence with who to confirm it with.
 * Never a refusal. `today` is this Mac's day.
 */
export function dutyChecksOf(facts: Facts, today: string): DutyCheck[] {
  const lines: DutyCheck[] = [];
  const contact = facts.cert_in;
  if (!contact.name || !contact.sent_on)
    lines.push({
      key: "cert-in-none",
      words: "No point of contact is recorded as sent to CERT-In. Every company keeps one current.",
      confirm: "lawyer",
    });
  if (contact.sent_on && daysBetween(contact.sent_on, today) > 365)
    lines.push({
      key: "cert-in-old",
      words: `The point of contact was last sent on ${dayWords(contact.sent_on)}. Check it is still current.`,
      confirm: null,
    });
  if (contact.name && (!contact.email || !contact.mobile)) {
    const missing = [!contact.email ? "email" : "", !contact.mobile ? "mobile" : ""].filter(
      Boolean,
    );
    lines.push({
      key: "cert-in-incomplete",
      words: `The point of contact has no ${missing.join(" or ")}.`,
      confirm: null,
    });
  }
  if (!facts.books.software)
    lines.push({
      key: "books-none",
      words:
        "Which software keeps the books is not recorded. HQ is not the books: your CA keeps them.",
      confirm: "CA",
    });
  else if (facts.books.provider_disclosed !== "yes")
    lines.push({
      key: "books-undisclosed",
      words: "The books software's provider is not recorded as disclosed to the ROC.",
      confirm: "CS",
    });
  const flag = facts.flags.startup;
  const status = facts.dpiit.status;
  if (
    (flag === "yes" && (status === "not_applied" || status === "applied")) ||
    (flag === "no" && status === "recognised")
  )
    lines.push({
      key: "dpiit-mismatch",
      words: `Recognised startup is ${FLAGS[flag]} but the DPIIT status is ${DPIIT_STATUSES[status]}.`,
      confirm: null,
    });
  return lines;
}
