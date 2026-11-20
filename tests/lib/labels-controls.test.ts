import { describe, expect, it } from "vitest";

import * as words from "@/lib/data/labels-controls";
import {
  CONTROL_REFS,
  CONTROLS_CHECKED,
  POLICY_KEYS,
  POLICY_SET,
  PRACTICES,
  countWords,
  everyWords,
  notLoaded,
  ofWords,
  spanOf,
} from "@/lib/data/labels-controls";

/**
 * The shared words of the security batch (ws-notes/security/spec.md §3.2, §5.1): the count and
 * span helpers with §5.1's examples exactly, the sizes, every control reference with a source
 * and the day it was checked, every policy's controls among the references, and no "%" in any
 * word the pages print (a source's address is percent-encoded, and prints only on paper).
 */

describe("the label helpers of §5.1", () => {
  it("ofWords", () => {
    expect(ofWords(38, 200, "answered")).toBe("38 of 200 answered");
    expect(ofWords(1200, 2000, "answered")).toBe("1,200 of 2,000 answered");
    expect(ofWords(0, 0, "answered")).toBe("0 of 0 answered");
  });

  it("countWords", () => {
    expect(countWords(1, "tool")).toBe("1 tool");
    expect(countWords(3, "tool")).toBe("3 tools");
    expect(countWords(2, "policy", "policies")).toBe("2 policies");
    expect(countWords(0, "device")).toBe("0 devices");
  });

  it("spanOf", () => {
    expect(spanOf(7, "days")).toBe("7 days");
    expect(spanOf(1, "months")).toBe("1 month");
    expect(spanOf(12, "months")).toBe("12 months");
    expect(spanOf(1, "days")).toBe("1 day");
  });

  it("everyWords", () => {
    expect(everyWords(1, "months")).toBe("every month");
    expect(everyWords(12, "months")).toBe("every year");
    expect(everyWords(3, "months")).toBe("every 3 months");
    expect(everyWords(1, "days")).toBe("every day");
    expect(everyWords(7, "days")).toBe("every 7 days");
  });

  it("notLoaded", () => {
    expect(notLoaded("Devices")).toBe("Devices is not loaded here.");
  });

  it("the sizes: 32 control references, 11 policies, 13 practices", () => {
    expect(Object.keys(CONTROL_REFS)).toHaveLength(32);
    expect(POLICY_KEYS).toHaveLength(11);
    expect(Object.keys(PRACTICES)).toHaveLength(13);
    expect(new Set(POLICY_KEYS).size).toBe(11);
  });
});

describe("references, practices and policies", () => {
  it("every control reference has a source and was checked on 20 Nov 2026", () => {
    expect(CONTROLS_CHECKED).toBe("2026-11-20");
    for (const [key, ref] of Object.entries(CONTROL_REFS)) {
      expect(ref.key).toBe(key);
      expect(ref.sources.length).toBeGreaterThan(0);
      for (const source of ref.sources) {
        expect(source.name).not.toBe("");
        expect(source.url).toMatch(/^https:\/\//);
      }
      expect(ref.checked).toBe("2026-11-20");
    }
    expect(CONTROL_REFS.a5_18.sources).toHaveLength(2);
  });

  it("every policy's controls are references", () => {
    for (const key of POLICY_KEYS) {
      expect(POLICY_SET[key].controls.length).toBeGreaterThan(0);
      for (const control of POLICY_SET[key].controls) expect(CONTROL_REFS[control]).toBeDefined();
    }
  });

  it("the tool review is HQ's own yearly default, with no source", () => {
    expect(PRACTICES.tool_review).toMatchObject({
      amount: 12,
      unit: "months",
      kind: "every",
      sources: [],
      checked: "2026-11-20",
    });
    expect(PRACTICES.fix_critical.kind).toBe("within");
    expect(PRACTICES.certificate_life.kind).toBe("lasts");
    for (const practice of Object.values(PRACTICES))
      expect(practice.note).not.toMatch(/HQ's default/);
  });

  it("no word a page prints holds a per cent sign", () => {
    const found: string[] = [];
    const walk = (value: unknown, path: string, key: string) => {
      if (typeof value === "string") {
        // A source's address is percent-encoded and prints only on paper; it is not a word.
        if (key !== "url" && value.includes("%")) found.push(path);
        return;
      }
      if (typeof value === "function") {
        const sample = (value as (...args: unknown[]) => unknown)(3, 7, "answered");
        if (typeof sample === "string" && sample.includes("%")) found.push(path);
        return;
      }
      if (value && typeof value === "object")
        for (const [inner, item] of Object.entries(value)) walk(item, `${path}.${inner}`, inner);
    };
    for (const [name, value] of Object.entries(words)) walk(value, name, name);
    expect(found).toEqual([]);
  });
});
