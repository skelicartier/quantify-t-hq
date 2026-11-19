/**
 * OFX and QFX from a bank (ws-notes/duties/spec.md §9.3): versions 1.x (SGML, tags without
 * closing tags) and 2.x (XML), read by tag rather than by a full grammar. Pure and never
 * throws. Every `<STMTTRN>` up to its `</STMTTRN>` or the next `<STMTTRN>` is one line:
 * `DTPOSTED` (its first eight digits are the day; time and zone are ignored), `TRNAMT` (a
 * signed decimal with a dot or a comma; negative is money out), `NAME` and `MEMO` joined as
 * the narration, `CHECKNUM` or `REFNUM` or `FITID` as the reference. `CURDEF` must be the
 * account's currency; `DTSTART` and `DTEND` are the days covered; `LEDGERBAL`'s `BALAMT` is
 * the closing balance. Credit-card files (`CCSTMTRS`) read the same way.
 */

import { minorOf } from "../../../src/lib/data/labels-duties";
import {
  NOT_A_STATEMENT_WORDS,
  NO_LINES_WORDS,
  TOO_MANY_LINES_WORDS,
  currencyName,
} from "../../../src/lib/data/labels-statements";
import { isDay } from "../guard";
import { decode } from "../text";
import { NARRATION_MAX, REFERENCE_MAX, STATEMENT_MAX_LINES } from "./limits";
import { oldestFirst, refusalOf } from "./parse-csv";
import type { Parsed, ReadLine } from "./types";

/** Whether the bytes are an OFX file, by its header or its root tag. */
export function looksLikeOfx(bytes: Uint8Array, name = ""): boolean {
  if (/\.(ofx|qfx)$/i.test(name)) return true;
  const head = decode(bytes.subarray(0, 4_096));
  return /OFXHEADER|<OFX>/i.test(head);
}

const decodeEntities = (value: string) =>
  value
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'")
    .replace(/&amp;/gi, "&");

/** The value of the first `<TAG>` in a block: up to the next tag or the end of the line. */
function tagValue(block: string, tag: string): string | null {
  const match = new RegExp(`<${tag}>([^<\\r\\n]*)`, "i").exec(block);
  if (!match) return null;
  const value = decodeEntities(match[1]!.trim());
  return value === "" ? null : value;
}

/** "20261031120000[+5.5:IST]" → "2026-10-31". */
function dayOf(value: string | null): string | null {
  const digits = /^(\d{4})(\d{2})(\d{2})/.exec(value ?? "");
  if (!digits) return null;
  const day = `${digits[1]}-${digits[2]}-${digits[3]}`;
  return isDay(day) ? day : null;
}

/** "-1234.56", "1234,5", "+20000" → a signed amount in minor units, or null. */
export function signedMinor(value: string | null): number | null {
  const text = (value ?? "").replace(/\s+/g, "");
  const match = /^([+-]?)(\d{1,13})(?:[.,](\d{1,2}))?$/.exec(text);
  if (!match) return null;
  const minor = minorOf(`${match[2]}${match[3] === undefined ? "" : `.${match[3]}`}`);
  if (minor === null) return null;
  return match[1] === "-" ? -minor : minor;
}

const tidy = (value: string, limit: number) => value.replace(/\s+/g, " ").trim().slice(0, limit);

export function parseOfx(
  bytes: Uint8Array,
  options: { name?: string; currency?: string } = {},
): Parsed {
  try {
    const refusal = refusalOf(bytes, options.name ?? "");
    if (refusal) return { ok: false, words: refusal };
    const text = decode(bytes).replace(/^﻿/, "");
    if (!/<OFX>/i.test(text) || !/<(STMTRS|CCSTMTRS)>/i.test(text))
      return { ok: false, words: NOT_A_STATEMENT_WORDS };
    const currency = tagValue(text, "CURDEF")?.toUpperCase() ?? null;
    if (currency && options.currency && currency !== options.currency)
      return {
        ok: false,
        words: `This file is in ${currency}; the account is in ${currencyName(options.currency)}.`,
      };
    const list = /<BANKTRANLIST>([\s\S]*?)(?:<\/BANKTRANLIST>|$)/i.exec(text)?.[1] ?? text;
    const from = dayOf(tagValue(list, "DTSTART"));
    const to = dayOf(tagValue(list, "DTEND"));
    const ledger =
      /<LEDGERBAL>([\s\S]*?)(?:<\/LEDGERBAL>|<AVAILBAL>|<\/STMTRS>|<\/CCSTMTRS>|$)/i.exec(
        text,
      )?.[1];
    const closing = ledger ? signedMinor(tagValue(ledger, "BALAMT")) : null;
    const blocks = text.split(/<STMTTRN>/i).slice(1);
    const lines: ReadLine[] = [];
    let ignored = 0;
    for (const [index, raw] of blocks.entries()) {
      const block = raw.split(/<\/STMTTRN>/i)[0] ?? "";
      const posted = dayOf(tagValue(block, "DTPOSTED"));
      const amount = signedMinor(tagValue(block, "TRNAMT"));
      if (!posted || amount === null || amount === 0) {
        ignored += 1;
        continue;
      }
      const narration = [tagValue(block, "NAME"), tagValue(block, "MEMO")]
        .filter((part): part is string => part !== null)
        .join(" ");
      const reference =
        tagValue(block, "CHECKNUM") ?? tagValue(block, "REFNUM") ?? tagValue(block, "FITID") ?? "";
      lines.push({
        row: index + 1,
        posted_on: posted,
        direction: amount < 0 ? "debit" : "credit",
        amount_minor: Math.abs(amount),
        balance_minor: null,
        narration: tidy(narration, NARRATION_MAX),
        reference: tidy(reference, REFERENCE_MAX),
      });
      if (lines.length > STATEMENT_MAX_LINES) return { ok: false, words: TOO_MANY_LINES_WORDS };
    }
    if (lines.length === 0) return { ok: false, words: NO_LINES_WORDS };
    return {
      ok: true,
      source: "ofx",
      lines: oldestFirst(lines),
      ignored_rows: ignored,
      mapping: null,
      header: [],
      day_first_chosen: false,
      from,
      to,
      closing_minor: closing,
      currency,
    };
  } catch {
    return { ok: false, words: NOT_A_STATEMENT_WORDS };
  }
}
