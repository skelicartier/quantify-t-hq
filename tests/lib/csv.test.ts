import { describe, expect, it } from "vitest";

import { applyMapping, guessMapping, parseCsv } from "@/lib/crm/csv";

describe("parseCsv", () => {
  it("reads quoted commas, doubled quotes, CRLF and a byte-order mark", () => {
    const text =
      '﻿Name,Domain,Notes\r\n"Meridian, Inc.",meridian.example,"Said ""soon"""\r\nHalcyon,,Two\nlines\r\n';
    const table = parseCsv(text);
    expect(table.header).toEqual(["Name", "Domain", "Notes"]);
    expect(table.rows).toEqual([
      ["Meridian, Inc.", "meridian.example", 'Said "soon"'],
      ["Halcyon", "", "Two"],
      ["lines"],
    ]);
  });

  it("keeps a newline inside a quoted field and ignores blank lines", () => {
    const table = parseCsv('a,b\n"line one\nline two",x\n\n,\n');
    expect(table.rows).toEqual([["line one\nline two", "x"]]);
  });

  it("guesses the mapping from common headers and applies it", () => {
    const table = parseCsv("Company Name,Website,Country\nAcme Ltd,acme.example,UK\n");
    const fields = [
      { key: "name", aliases: ["company", "company name", "firm"] },
      { key: "domain", aliases: ["website", "web", "url"] },
      { key: "country", aliases: [] },
      { key: "notes", aliases: ["comments"] },
    ];
    const mapping = guessMapping(table.header, fields);
    expect(mapping).toEqual({ name: "Company Name", domain: "Website", country: "Country" });
    expect(applyMapping(table, mapping)).toEqual([
      { name: "Acme Ltd", domain: "acme.example", country: "UK" },
    ]);
  });
});
