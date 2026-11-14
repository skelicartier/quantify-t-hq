/**
 * Checks that compare the facts (ws-notes/company/spec.md §6.3): each a sentence shown under
 * "Checks", never a refusal, so a typo is caught and a real oddity is still saved. Pure.
 */

import { FLAGS, STATES } from "../../../src/lib/data/labels-company";
import type { Facts } from "./types";

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
