// @vitest-environment node
import { describe, expect, it } from "vitest";

import { CAIQ_ID_WORDS } from "../../scripts/data/questionnaires/limits";
import {
  STOPWORDS,
  caiqIdOf,
  howOf,
  idKey,
  idMatches,
  otherIdOf,
  prepare,
  score,
  stem,
  suggestionsFor,
  tokens,
} from "../../scripts/data/questionnaires/match";

/**
 * Matching (ws-notes/security/spec.md §5.5), pure: every row of the matching table with its
 * score and what is shown, the stopword list and the stemming rules exactly, IDs with case and
 * spaces, and the CAIQ and other ID patterns. Every question is invented.
 */

const TABLE: [string, string, number, "likely" | "possible" | null][] = [
  ["Do you encrypt customer data at rest?", "Is customer data encrypted at rest?", 1000, "likely"],
  [
    "Do you have an incident response plan?",
    "Is there a written incident response plan?",
    750,
    "likely",
  ],
  [
    "Are access rights reviewed and removed when staff leave?",
    "Are access rights removed when someone leaves?",
    571,
    "likely",
  ],
  [
    "Is multi-factor authentication enforced for all users?",
    "Is multi-factor authentication enforced on every account?",
    571,
    "likely",
  ],
  [
    "Is multi-factor authentication enforced for all users?",
    "Is MFA enforced for every user?",
    285,
    null,
  ],
  [
    "Do you perform annual penetration tests?",
    "Is a penetration test done by a third party at least once a year?",
    200,
    null,
  ],
  [
    "Describe your backup policy and frequency.",
    "How often are backups made, and how are restores tested?",
    142,
    null,
  ],
];

describe("matching by words (§5.5)", () => {
  it.each(TABLE)("%s · %s → %i", (theirs, ours, expected, shown) => {
    expect(score(theirs, ours)).toBe(expected);
    expect(score(ours, theirs)).toBe(expected);
    expect(howOf(expected)).toBe(shown);
  });

  it("the first row's tokens", () => {
    expect([...tokens("Do you encrypt customer data at rest?")].sort()).toEqual([
      "customer",
      "data",
      "encrypt",
      "rest",
    ]);
    expect([...tokens("Is customer data encrypted at rest?")].sort()).toEqual([
      "customer",
      "data",
      "encrypt",
      "rest",
    ]);
  });

  it("the stopword list, exactly", () => {
    expect([...STOPWORDS].sort()).toEqual(
      (
        "a an and any all are as at be by can do does for from has have how if in into is it its " +
        "of on or our please describe provide explain so such that the their there these this to was " +
        "we what when where which who will with you your yes no"
      )
        .split(" ")
        .sort(),
    );
    expect(STOPWORDS.size).toBe(54);
  });

  it("the stemming rules, the first that fits", () => {
    expect(stem("policies")).toBe("policy");
    expect(stem("ties")).toBe("tie"); // 4 letters: not "ies", but "s"
    expect(stem("logging")).toBe("logg");
    expect(stem("using")).toBe("using"); // 5 letters: not "ing"; no "s"
    expect(stem("encrypted")).toBe("encrypt");
    expect(stem("used")).toBe("used"); // 4 letters: not "ed"
    expect(stem("tests")).toBe("test");
    expect(stem("access")).toBe("access"); // "ss" stays
    expect(stem("bus")).toBe("bus"); // 3 letters
    expect(stem("series")).toBe("sery");
  });

  it("lower case, & as and, every other run of characters one space", () => {
    expect([...tokens("Back-ups & Restores: TESTED (yearly)?")].sort()).toEqual([
      "back",
      "restore",
      "test",
      "ups",
      "yearly",
    ]);
    expect(score("", "")).toBe(0);
    expect(score("the and of", "is a")).toBe(0);
  });
});

describe("IDs", () => {
  it("by ID: upper case, spaces removed, either list", () => {
    expect(idKey(" a&a - 01.1 ")).toBe("A&A-01.1");
    const prepared = prepare([
      { answer_id: "one", question: "Is data encrypted?", caiq_ids: ["A&A-01.1"], other_ids: [] },
      { answer_id: "two", question: "A plan?", caiq_ids: [], other_ids: ["SIG 4.2"] },
      { answer_id: "three", question: "Another", caiq_ids: ["IAM-02"], other_ids: [] },
    ]);
    expect(idMatches("a&a-01.1", prepared)).toEqual(["one"]);
    expect(idMatches("sig4.2", prepared)).toEqual(["two"]);
    expect(idMatches("", prepared)).toEqual([]);
    const found = suggestionsFor({ qid: " A&A-01.1", text: "Is data encrypted?" }, prepared);
    expect(found[0]).toEqual({ answer_id: "one", score: 1000, how: "id" });
    expect(found.filter((item) => item.answer_id === "one")).toHaveLength(1);
  });

  it("the best three, ID matches first, then by score", () => {
    const prepared = prepare(
      [
        "Is customer data encrypted at rest?",
        "Is customer data encrypted?",
        "Customer data at rest",
        "Customer data",
        "Something else",
      ].map((question, index) => ({
        answer_id: `a${index}`,
        question,
        caiq_ids: [],
        other_ids: [],
      })),
    );
    const found = suggestionsFor(
      { qid: "", text: "Do you encrypt customer data at rest?" },
      prepared,
    );
    // A tie (750) goes to the answer whose question sorts first.
    expect(found.map((item) => item.answer_id)).toEqual(["a0", "a2", "a1"]);
    expect(found.map((item) => item.how)).toEqual(["likely", "likely", "likely"]);
  });

  it("a CAIQ ID as its file writes it (§5.5)", () => {
    expect(caiqIdOf(" a&a-01.1 ")).toBe("A&A-01.1");
    expect(caiqIdOf("IAM-02")).toBe("IAM-02");
    expect(caiqIdOf("A&A-1.1")).toBeNull();
    expect(caiqIdOf("A&A-01.123")).toBeNull();
    expect(caiqIdOf("AB-01.12")).toBe("AB-01.12");
    expect(caiqIdOf("ABCDE-01")).toBeNull();
    expect(CAIQ_ID_WORDS).toBe("Type a CAIQ ID as its file writes it, such as A&A-01.1.");
  });

  it("other IDs, as typed: 40 characters of letters, digits and . _ & # : / -", () => {
    expect(otherIdOf(" SIG-4.2.1 ")).toBe("SIG-4.2.1");
    expect(otherIdOf("Q 12 / B#3:a_b&c")).toBe("Q 12 / B#3:a_b&c");
    expect(otherIdOf("x".repeat(40))).toBe("x".repeat(40));
    expect(otherIdOf("x".repeat(41))).toBeNull();
    expect(otherIdOf("no;semicolons")).toBeNull();
    expect(otherIdOf("")).toBeNull();
  });
});
