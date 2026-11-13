// @vitest-environment node
import { describe, expect, it } from "vitest";

import { INLINE_MIMES, servedType, sniff } from "../../scripts/data/files/sniff";
import {
  inventedCsv,
  inventedDocx,
  inventedHtml,
  inventedPdf,
  inventedPng,
  inventedSvg,
  inventedTxt,
} from "../../scripts/data/files/walk-seed";

/** The kind of a file comes from its first bytes; the name only tells CSV from text and Word from zip. */
describe("sniffing a file's kind", () => {
  it("knows a PDF and the four pictures by their first bytes", async () => {
    expect(sniff(await inventedPdf(["x"]), "a.bin")).toEqual({
      kind: "pdf",
      mime: "application/pdf",
    });
    expect(sniff(inventedPng("x"), "a")).toEqual({ kind: "image", mime: "image/png" });
    expect(sniff(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2]), "a.png").mime).toBe("image/jpeg");
    expect(sniff(new TextEncoder().encode("GIF89a...."), "a").mime).toBe("image/gif");
    expect(sniff(new TextEncoder().encode("RIFF\u0010\u0000\u0000\u0000WEBPVP8 "), "a").mime).toBe(
      "image/webp",
    );
  });

  it("calls HTML named .pdf a web page, and SVG and XML web pages too", () => {
    expect(sniff(inventedHtml("x"), "statement.pdf")).toEqual({ kind: "web", mime: "text/html" });
    expect(sniff(new TextEncoder().encode("﻿  <HTML><body>"), "a.txt").kind).toBe("web");
    expect(sniff(inventedSvg("x"), "logo.png")).toEqual({ kind: "web", mime: "image/svg+xml" });
    expect(sniff(new TextEncoder().encode('<?xml version="1.0"?><a/>'), "a.csv").kind).toBe("web");
  });

  it("tells a CSV from text by the name, and other bytes are a file", () => {
    expect(sniff(inventedCsv(3, "x"), "people.csv")).toEqual({ kind: "csv", mime: "text/csv" });
    expect(sniff(inventedCsv(3, "x"), "people.TSV").kind).toBe("csv");
    expect(sniff(inventedCsv(3, "x"), "people.txt")).toEqual({ kind: "text", mime: "text/plain" });
    expect(sniff(inventedTxt("x"), "notes").kind).toBe("text");
    expect(sniff(new Uint8Array([0, 1, 2, 3, 0, 9]), "a.csv")).toEqual({
      kind: "other",
      mime: "application/octet-stream",
    });
  });

  it("reads Office files inside a zip by the name, and a plain zip otherwise", () => {
    const zip = inventedDocx("x");
    expect(sniff(zip, "plan.docx").kind).toBe("word");
    expect(sniff(zip, "plan.xlsx").kind).toBe("excel");
    expect(sniff(zip, "plan.PPTX").kind).toBe("slides");
    expect(sniff(zip, "plan.zip")).toEqual({ kind: "zip", mime: "application/zip" });
    expect(sniff(zip, "plan.pdf").kind).toBe("zip");
  });

  it("hands over only PDFs and pictures as themselves; everything else as plain bytes", () => {
    expect([...INLINE_MIMES].sort()).toEqual([
      "application/pdf",
      "image/gif",
      "image/jpeg",
      "image/png",
      "image/webp",
    ]);
    expect(servedType("application/pdf")).toBe("application/pdf");
    for (const mime of ["text/html", "image/svg+xml", "text/csv", "text/plain", "application/zip"])
      expect(servedType(mime)).toBe("application/octet-stream");
  });
});
