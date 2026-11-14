// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  AGENDA_SOURCES,
  FORWARD_STAGES,
  RAISE_SERVICES,
  SEARCH_SOURCES,
  agendaService,
  httpsLinkOf,
  mondayOf,
  searchService,
} from "../../scripts/data/raise-contracts";

/**
 * The raise batch's seams (raise spec §3.1): the hand checks every unit may lean on, for
 * the week's Monday and the one kind of link he pastes. Every link is invented.
 */

describe("mondayOf", () => {
  it("gives the Monday of the week a day is in; weeks run Monday to Sunday", () => {
    expect(mondayOf("2026-11-13")).toBe("2026-11-09");
    expect(mondayOf("2026-11-09")).toBe("2026-11-09");
    expect(mondayOf("2026-11-15")).toBe("2026-11-09");
    expect(mondayOf("2026-11-01")).toBe("2026-10-26");
  });
});

describe("httpsLinkOf", () => {
  it("keeps a whole https link", () => {
    expect(httpsLinkOf("https://deck.example/d/abc")).toBe("https://deck.example/d/abc");
    expect(httpsLinkOf("  https://deck.example/d/abc  ")).toBe("https://deck.example/d/abc");
  });

  it("refuses anything else", () => {
    expect(httpsLinkOf("http://deck.example")).toBeNull();
    expect(httpsLinkOf("javascript:alert(1)")).toBeNull();
    expect(httpsLinkOf("https://localhost/x")).toBeNull();
    expect(httpsLinkOf("https://a b.example")).toBeNull();
    expect(httpsLinkOf("https://someone:secret@deck.example/d")).toBeNull();
    expect(httpsLinkOf(`https://deck.example/${"a".repeat(500)}`)).toBeNull();
    expect(httpsLinkOf("")).toBeNull();
    expect(httpsLinkOf(42)).toBeNull();
  });
});

describe("the names", () => {
  it("are the ones every unit provides and reads", () => {
    expect(RAISE_SERVICES.investorsRaise).toBe("investors-raise");
    expect(agendaService("investors")).toBe("agenda:investors");
    expect(searchService("investors")).toBe("search:investors");
    expect(AGENDA_SOURCES).toContain("investors");
    expect(SEARCH_SOURCES).toContain("investors");
    expect(FORWARD_STAGES).toEqual([
      "written",
      "replied",
      "meeting",
      "met",
      "diligence",
      "soft",
      "signed",
      "money_in",
    ]);
  });
});
