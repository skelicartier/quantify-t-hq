import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";

import { cssString } from "@/components/documents/print-frame";
import { FALLBACK_LETTERHEAD } from "@/lib/api/company";
import { loadDocumentAssets } from "@/lib/documents/assets";
import { displayCell, spreadsheetSerial } from "@/lib/documents/cells";
import { buildTablePdf } from "@/lib/documents/pdf";
import { buildWorkbook, columnName, xmlText, type SheetColumn } from "@/lib/documents/xlsx";
import { crc32, zipStored } from "@/lib/documents/zip";
import { canExport, safeReturnPath } from "@/lib/exports";

const COLUMNS: SheetColumn[] = [
  { key: "name", label: "Vendor", type: "text" },
  { key: "amount", label: "Amount", type: "money" },
  { key: "renews_on", label: "Renews", type: "date" },
  { key: "auto", label: "Renews itself", type: "bool" },
  { key: "pct", label: "Discount", type: "percent" },
];
const ROWS = [
  ['=HYPERLINK("http://x")', 1200.5, "2026-11-01", true, 12.5],
  ["Zürich ₹ 中文", null, null, false, null],
];
const text = (bytes: Uint8Array) => new TextDecoder().decode(bytes);

describe("the zip a spreadsheet travels in", () => {
  it("checksums with the standard CRC-32", () => {
    // The check value every CRC-32 implementation publishes for "123456789".
    expect(crc32(new TextEncoder().encode("123456789"))).toBe(0xcbf43926);
  });

  it("stores entries whole, readable by any unzip", () => {
    const zip = zipStored([{ name: "a.txt", data: new TextEncoder().encode("hello") }]);
    const view = new DataView(zip.buffer);
    expect(view.getUint32(0, true)).toBe(0x04034b50);
    expect(view.getUint32(zip.length - 22, true)).toBe(0x06054b50);
    expect(text(zip)).toContain("hello");
  });
});

describe("the spreadsheet", () => {
  const book = text(
    buildWorkbook({
      title: "Vendors",
      columns: COLUMNS,
      rows: ROWS,
      about: [["What it is for", "Board pack"]],
      author: "Owner Example",
      company: "Quantify Terminal",
      generatedAt: "2026-10-01T08:02:11Z",
    }),
  );

  it("keeps a typed formula as text, never a formula", () => {
    expect(book).toContain(
      't="inlineStr" s="0"><is><t xml:space="preserve">=HYPERLINK(&quot;http://x&quot;)',
    );
    expect(book).not.toContain("<f>");
  });

  it("keeps money, flags, percentages and dates as their types", () => {
    expect(book).toContain('<c r="B2" s="3"><v>1200.5</v></c>');
    expect(book).toContain('<c r="D2" t="b"><v>1</v></c>');
    expect(book).toContain('<c r="E2" s="4"><v>12.5</v></c>');
    // 1 November 2026: 46,327 days after 30 December 1899.
    expect(spreadsheetSerial("2026-11-01", "date")).toBe(46327);
    expect(book).toContain('<c r="C2" s="5"><v>46327</v></c>');
    // An empty cell is left out, not written as an empty string.
    expect(book).not.toContain('r="B3"');
  });

  it("freezes the heading, filters every column and says where the file came from", () => {
    expect(book).toContain('state="frozen"');
    expect(book).toContain('<autoFilter ref="A1:E3"/>');
    expect(book).toContain("About this file");
    expect(book).toContain("Board pack");
    expect(book).toContain("Zürich ₹ 中文");
  });

  it("names columns past Z and strips what XML forbids", () => {
    expect([columnName(0), columnName(25), columnName(26), columnName(701)]).toEqual([
      "A",
      "Z",
      "AA",
      "ZZ",
    ]);
    expect(xmlText("a\u0001b<c>&")).toBe("ab&lt;c&gt;&amp;");
  });
});

describe("cells as a document prints them", () => {
  it("spells dates out, keeps times in UTC and groups money", () => {
    expect(displayCell("2026-11-01", "date")).toBe("1 Nov 2026");
    expect(displayCell("2026-10-01T08:02:00Z", "datetime")).toBe("1 Oct 2026, 08:02");
    expect(displayCell(1200.5, "money")).toBe("1,200.50");
    expect(displayCell(12.5, "percent")).toBe("12.5%");
    expect(displayCell(true, "bool")).toBe("Yes");
    expect(displayCell(null, "text")).toBe("");
  });
});

describe("the PDF", () => {
  it("lays the records out on the letterhead, numbered, with its title and purpose", async () => {
    const rows = Array.from({ length: 120 }, (_, index) => [
      `Vendor ${index}`,
      index * 10,
      "2026-11-01",
      index % 2 === 0,
      5,
    ]);
    const bytes = await buildTablePdf(
      {
        title: "Vendors",
        columns: COLUMNS,
        rows,
        letterhead: { ...FALLBACK_LETTERHEAD, address: "Jammu, India" },
        exportedBy: "Owner Example",
        generatedAt: "2026-10-01T08:02:11Z",
        reason: "Board pack",
      },
      await loadDocumentAssets(),
    );
    expect(text(bytes.slice(0, 5))).toBe("%PDF-");
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBeGreaterThan(1);
    expect(doc.getTitle()).toBe("Vendors");
    expect(doc.getSubject()).toBe("Board pack");
    expect(doc.getAuthor()).toBe("Quantify Terminal");
  });
});

describe("the guards around an export", () => {
  it("sends people back only to a path of this portal", () => {
    expect(safeReturnPath("/companies")).toBe("/companies");
    expect(safeReturnPath("//evil.example")).toBe("/reports");
    expect(safeReturnPath("https://evil.example")).toBe("/reports");
    expect(safeReturnPath("/companies?x=1")).toBe("/reports");
    expect(safeReturnPath("/a/../b\\c")).toBe("/reports");
  });

  it("offers an export only with the export capability and the records' own", () => {
    expect(canExport(["crm:export", "crm:read"], "companies")).toBe(true);
    expect(canExport(["crm:export"], "vendors")).toBe(false);
    expect(canExport(["crm:export", "revenue:write"], "vendors")).toBe(true);
    expect(canExport(["revenue:write"], "vendors")).toBe(false);
  });

  it("cannot be talked out of the print style element", () => {
    const literal = cssString('Acme "Ltd" </style><script>x</script>\\');
    expect(literal).not.toContain("<");
    expect(literal.startsWith('"') && literal.endsWith('"')).toBe(true);
    expect(literal).toContain('\\"Ltd\\"');
  });
});
