// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  attemptOf,
  clean,
  cleanText,
  guardSecret,
  isDay,
  isRouteId,
  looksSecret,
  normaliseEmail,
  staffOf,
  wholeNumber,
} from "../../scripts/data/guard";
import { Refused } from "../../scripts/mail-merge/engine";

describe("the secret guard", () => {
  it("refuses text shaped like a key", () => {
    for (const text of [
      "my key is xkeysib-0000000000000000000000000000000000000000000000000000000000000000-abcd",
      "XSMTPSIB-abc",
      "token ghp_abcdefghijklmnopqrstuvwxyz0123456789",
      "github_pat_11AAAAAAA0bbbbbbbbbbbbbb",
      "AKIAIOSFODNN7EXAMPLE is the id",
      "sk-abcdefghijklmnopqrstuvwxyz0123",
      "-----BEGIN RSA PRIVATE KEY-----\nMIIE",
      "-----BEGIN PRIVATE KEY-----",
    ])
      expect(looksSecret(text), text).toBe(true);
    expect(() => guardSecret("paste: xkeysib-abc")).toThrow(Refused);
    try {
      cleanText("xkeysib-abc", 100);
    } catch (error) {
      expect(error).toMatchObject({ status: 400, code: "secret" });
      expect((error as Refused).message).toMatch(/password or key/);
    }
  });

  it("leaves phone numbers, long digit runs and addresses alone: no digit heuristics", () => {
    for (const text of [
      "+91 98765 43210",
      "12345678901234567890123456789012",
      "GSTIN 27AAPFU0939F1ZV",
      "sk-short",
      "asha@peak.example said yes",
      "AKIA12345",
      "They asked for a private key in the contract",
    ])
      expect(looksSecret(text), text).toBe(false);
    expect(cleanText("  +91 98765 43210 ", 40)).toBe("+91 98765 43210");
  });
});

describe("clean and the shapes", () => {
  it("trims, cuts and refuses what is not a string", () => {
    expect(clean("  hello world ", 5)).toBe("hello");
    expect(clean(42, 10)).toBe("");
    expect(clean(undefined, 10)).toBe("");
    expect(wholeNumber("12", 0)).toBe(12);
    expect(wholeNumber("twelve", 7)).toBe(7);
    expect(wholeNumber(3.5, 1)).toBe(1);
  });

  it("knows a calendar date, an id and an attempt", () => {
    expect(isDay("2026-11-10")).toBe(true);
    expect(isDay("2026-02-30")).toBe(false);
    expect(isDay("2026-11-1")).toBe(false);
    expect(isDay("10/11/2026")).toBe(false);
    expect(isRouteId("walk-preparing")).toBe(true);
    expect(isRouteId("asha@peak.example")).toBe(false);
    expect(attemptOf({ attempt: "11111111-2222-3333-4444-555555555555" })).toBe(
      "11111111-2222-3333-4444-555555555555",
    );
    expect(attemptOf({ attempt: "AAAAAAAA-2222-3333-4444-555555555555" })).toBe(
      "aaaaaaaa-2222-3333-4444-555555555555",
    );
    expect(attemptOf({ attempt: "run-7" })).toBeNull();
    expect(attemptOf({})).toBeNull();
  });

  it("reads who is making the change, and refuses a body without one", () => {
    expect(staffOf({ by: { staff_id: " s1 ", name: " Asha Rao " } })).toEqual({
      staff_id: "s1",
      name: "Asha Rao",
    });
    expect(() => staffOf({})).toThrow(Refused);
    expect(() => staffOf({ by: { staff_id: "s1" } })).toThrow(/not given/);
    expect(() => staffOf({ by: "s1" })).toThrow(Refused);
  });

  it("normalises addresses the way Mail merge does", () => {
    expect(normaliseEmail(" Asha@Peak.Example ")).toBe("asha@peak.example");
    expect(normaliseEmail("not an address")).toBe("");
  });
});
