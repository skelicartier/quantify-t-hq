import { describe, expect, it } from "vitest";

import { findTerms, matchesTerms, parseShow, rankByNumber, showsMailing } from "@/lib/merge/find";

describe("finding a mailing", () => {
  const names = [
    "Waitlist 18 - US funds 11 of 24",
    "Waitlist 08 - US funds 1 of 24",
    "Waitlist 15 - US funds 8 of 24",
    "Email 1: first pitch",
  ];

  it("needs every word, in any case", () => {
    expect(matchesTerms(["Waitlist 08 - US funds 1 of 24"], findTerms("us FUNDS"))).toBe(true);
    expect(matchesTerms(["Waitlist 08 - US funds 1 of 24"], findTerms("us brokers"))).toBe(false);
    expect(matchesTerms(["anything"], findTerms("   "))).toBe(true);
  });

  it("matches a number to a whole number, leading zeros or not", () => {
    expect(matchesTerms(["Waitlist 08 - US funds 1 of 24"], ["8"])).toBe(true);
    expect(matchesTerms(["Waitlist 08 - US funds 1 of 24"], ["08"])).toBe(true);
    expect(matchesTerms(["Waitlist 18 - US funds 11 of 24"], ["8"])).toBe(false);
  });

  it("looks in every text it is given", () => {
    expect(
      matchesTerms(["Email 1", "Early access for {{short_company}}", "Investors"], ["investors"]),
    ).toBe(true);
  });

  it("puts the mailing whose name starts with the number first, and keeps the rest in order", () => {
    const found = names.filter((name) => matchesTerms([name], ["8"]));
    expect(found).toEqual(["Waitlist 08 - US funds 1 of 24", "Waitlist 15 - US funds 8 of 24"]);
    expect(rankByNumber(names, ["8"], (name) => name)[0]).toBe("Waitlist 08 - US funds 1 of 24");
    expect(rankByNumber(names, ["funds"], (name) => name)).toEqual(names);
  });

  it("shows each state under the right choice", () => {
    expect(showsMailing("draft", "drafts")).toBe(true);
    expect(showsMailing("finished", "drafts")).toBe(false);
    expect(showsMailing("paused", "going")).toBe(true);
    expect(showsMailing("cancelled", "done")).toBe(true);
    expect(showsMailing("sending", "all")).toBe(true);
  });

  it("reads an unknown choice as all", () => {
    expect(parseShow("drafts")).toBe("drafts");
    expect(parseShow("everything")).toBe("all");
    expect(parseShow(undefined)).toBe("all");
  });
});
