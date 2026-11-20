// @vitest-environment node
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import {
  COLUMNS_CUT_WORDS,
  ENCRYPTED_WORDS,
  ENTRIES_WORDS,
  METHOD_WORDS,
  NOT_XLSX_WORDS,
  OLD_XLS_WORDS,
  PART_TOO_LARGE_WORDS,
  ZIP64_WORDS,
} from "../../scripts/data/questionnaires/limits";
import { DECLARES_ENTITIES, decodeEntities, scanXml } from "../../scripts/data/questionnaires/xml";
import {
  XlsxRefused,
  cellRef,
  columnIndex,
  columnLetters,
  readXlsx,
  targetPath,
} from "../../scripts/data/questionnaires/xlsx-read";
import {
  XLSX_ENTRIES,
  sheetNameOf,
  writeXlsx,
  xmlSafe,
} from "../../scripts/data/questionnaires/xlsx-write";
import { zipOf, type ZipPart } from "./questionnaires-kit";

/**
 * The XLSX reader and writer written here (ws-notes/security/spec.md §9.3, §5.5), pure: a
 * workbook written and read back; a workbook built in the test with deflated entries, shared
 * strings, rich runs, `_x000D_`, a boolean, an error, a number, a formula's cached value, a
 * cell without `r` and two sheets; and every refusal. Every question is invented.
 */

const dir = mkdtempSync(join(tmpdir(), "hqx-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const NS = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"';
const RNS = 'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';

function workbookParts(
  sheets: { name: string; xml: string }[],
  shared: string | null,
  method = 8,
): ZipPart[] {
  const parts: ZipPart[] = [
    { name: "[Content_Types].xml", data: "<Types/>", method },
    {
      name: "xl/workbook.xml",
      data: `<?xml version="1.0"?><workbook ${NS} ${RNS}><sheets>${sheets
        .map(
          (sheet, index) =>
            `<sheet name="${sheet.name}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`,
        )
        .join("")}</sheets></workbook>`,
      method,
    },
    {
      name: "xl/_rels/workbook.xml.rels",
      data: `<Relationships>${sheets
        .map(
          (_sheet, index) =>
            `<Relationship Id="rId${index + 1}" Type="x/worksheet" Target="${index === 1 ? "/xl/" : ""}worksheets/sheet${index + 1}.xml"/>`,
        )
        .join("")}</Relationships>`,
      method,
    },
    ...sheets.map((sheet, index) => ({
      name: `xl/worksheets/sheet${index + 1}.xml`,
      data: sheet.xml,
      method,
    })),
  ];
  if (shared !== null) parts.push({ name: "xl/sharedStrings.xml", data: shared, method });
  return parts;
}

const sheet = (rows: string) =>
  `<?xml version="1.0"?><worksheet ${NS}><sheetData>${rows}</sheetData></worksheet>`;

/** The invented workbook of §9.8: every kind of cell the reader takes, deflated, on two sheets. */
function inventedWorkbook(method = 8): Uint8Array {
  const shared =
    `<sst ${NS} count="5" uniqueCount="5">` +
    "<si><t>ID</t></si>" +
    "<si><t>Question</t></si>" +
    '<si><r><rPr><b/></rPr><t xml:space="preserve">Do you encrypt </t></r><r><t>data at rest?</t></r><rPh><t>PHONETIC</t></rPh></si>' +
    "<si><t>Line one_x000D_\nLine two</t></si>" +
    "<si><t>Fish &amp; chips &lt;3 &#x263A; &#65;</t></si>" +
    "</sst>";
  const first = sheet(
    '<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="inlineStr"><is><t>Answer</t></is></c></row>' +
      '<row r="2"><c r="A2" t="str"><v>A&amp;A-01.1</v></c><c r="B2" t="s"><v>2</v></c><c r="C2" t="b"><v>1</v></c></row>' +
      '<row r="3"><c r="A3"><v>1.5</v></c><c r="B3" t="s"><v>3</v></c><c r="C3" t="e"><v>#N/A</v></c></row>' +
      '<row r="5"><c r="A5" t="b"><v>0</v></c><c r="B5"><f>SUM(1,2)</f><v>3</v></c><c><v>45000</v></c><c t="s"><v>4</v></c></row>' +
      '<row><c t="inlineStr"><is><r><t>Rich </t></r><r><t>inline</t></r></is></c></row>',
  );
  const second = sheet('<row r="1"><c r="A1" t="inlineStr"><is><t>Other sheet</t></is></c></row>');
  return zipOf(
    workbookParts(
      [
        { name: "Questions", xml: first },
        { name: "Notes", xml: second },
      ],
      shared,
      method,
    ),
  );
}

const refusal = (read: () => unknown): string => {
  try {
    read();
  } catch (error) {
    if (error instanceof XlsxRefused) return error.words;
    throw error;
  }
  return "";
};

describe("cells and columns (§5.5)", () => {
  it("column letters to an index, and back", () => {
    expect(["A", "Z", "AA", "AZ", "BA", "BH"].map(columnIndex)).toEqual([0, 25, 26, 51, 52, 59]);
    expect([0, 25, 26, 51, 52, 59].map(columnLetters)).toEqual(["A", "Z", "AA", "AZ", "BA", "BH"]);
    expect(cellRef("B3")).toEqual({ column: 1, row: 3 });
    expect(cellRef("$AA$10")).toEqual({ column: 26, row: 10 });
    expect(cellRef("3B")).toBeNull();
  });

  it("a relationship's target is relative to xl/ unless it starts at the root", () => {
    expect(targetPath("worksheets/sheet1.xml")).toBe("xl/worksheets/sheet1.xml");
    expect(targetPath("/xl/worksheets/sheet2.xml")).toBe("xl/worksheets/sheet2.xml");
    expect(targetPath("../xl/worksheets/sheet3.xml")).toBe("xl/worksheets/sheet3.xml");
    expect(targetPath("../../etc/passwd")).toBeNull();
  });

  it("only the five named entities and numeric references are decoded", () => {
    expect(decodeEntities("&amp; &lt; &gt; &quot; &apos; &#65; &#x42; &nbsp;")).toBe(
      "& < > \" ' A B &nbsp;",
    );
  });
});

describe("reading a workbook built in the test", () => {
  it("every kind of cell, deflated, on the first of two sheets", () => {
    const read = readXlsx(inventedWorkbook());
    expect(read.sheets).toEqual([
      { name: "Questions", rows: 6 },
      { name: "Notes", rows: 1 },
    ]);
    expect(read.sheet.name).toBe("Questions");
    expect(read.sheet.rows).toEqual([
      ["ID", "Question", "Answer"],
      ["A&A-01.1", "Do you encrypt data at rest?", "TRUE"],
      ["1.5", "Line one\nLine two", "#N/A"],
      [],
      ["FALSE", "3", "45000", "Fish & chips <3 ☺ A"],
      ["Rich inline"],
    ]);
    expect(read.sheet.columns_cut).toBe(false);
  });

  it("the same workbook stored reads the same; the second sheet by its name", () => {
    expect(readXlsx(inventedWorkbook(0)).sheet.rows).toEqual(
      readXlsx(inventedWorkbook()).sheet.rows,
    );
    expect(readXlsx(inventedWorkbook(), { sheet: "Notes" }).sheet.rows).toEqual([["Other sheet"]]);
    expect(refusal(() => readXlsx(inventedWorkbook(), { sheet: "Nope" }))).toBe(
      "That sheet is not in this workbook.",
    );
  });

  it("at most 60 columns and 5,000 rows; a long cell is cut", () => {
    const wide = sheet(
      `<row r="1"><c r="A1" t="inlineStr"><is><t>Question</t></is></c><c r="BH1" t="inlineStr"><is><t>Last read</t></is></c><c r="BI1" t="inlineStr"><is><t>Not read</t></is></c></row>` +
        `<row r="2"><c r="A2" t="inlineStr"><is><t>${"x".repeat(40)}</t></is></c></row>` +
        `<row r="5001"><c r="A5001" t="inlineStr"><is><t>Too far</t></is></c></row>`,
    );
    const read = readXlsx(zipOf(workbookParts([{ name: "Wide", xml: wide }], null)), {
      limits: { cell_chars: 30 },
    });
    expect(read.sheet.rows[0]).toHaveLength(60);
    expect(read.sheet.rows[0]![59]).toBe("Last read");
    expect(read.sheet.columns_cut).toBe(true);
    expect(read.sheet.rows_cut).toBe(true);
    expect(read.sheet.rows).toHaveLength(2);
    expect(read.sheet.rows[1]![0]).toBe(`${"x".repeat(30)} …`);
    expect(COLUMNS_CUT_WORDS).toBe("Columns after BH are not read.");
  });

  it("a part that is not opened is never read: a macro project packed oddly is not looked at", () => {
    const parts = workbookParts([{ name: "Q", xml: sheet("") }], null);
    parts.push({ name: "xl/vbaProject.bin", data: "not a real project", method: 8 });
    parts.push({ name: "../outside.xml", data: "<x/>", method: 0 });
    parts.push({ name: "/root.xml", data: "<x/>", method: 0 });
    expect(readXlsx(zipOf(parts)).sheets).toEqual([{ name: "Q", rows: 0 }]);
  });
});

describe("refusals", () => {
  it("an old .xls or a password-protected workbook (the compound-file header)", () => {
    const cfb = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0, 0, 0, 0]);
    expect(refusal(() => readXlsx(cfb))).toBe(OLD_XLS_WORDS);
    expect(OLD_XLS_WORDS).toBe(
      "This is an older .xls file or a password-protected one. Save it as .xlsx or CSV without a password, then import that.",
    );
  });

  it("anything that is not a zip, and a zip that is not a workbook", () => {
    expect(refusal(() => readXlsx(new TextEncoder().encode("ID,Question\n1,Hello\n")))).toBe(
      NOT_XLSX_WORDS,
    );
    expect(refusal(() => readXlsx(zipOf([{ name: "a.txt", data: "hello" }])))).toBe(NOT_XLSX_WORDS);
    expect(NOT_XLSX_WORDS).toContain("Save it as .xlsx or CSV.");
  });

  it("a part that declares a document type or an entity", () => {
    const bomb = sheet(
      '<row r="1"><c r="A1" t="inlineStr"><is><t>&lol;</t></is></c></row>',
    ).replace(
      '<?xml version="1.0"?>',
      '<?xml version="1.0"?><!DOCTYPE lolz [<!ENTITY lol "lol">]>',
    );
    expect(refusal(() => readXlsx(zipOf(workbookParts([{ name: "Q", xml: bomb }], null))))).toBe(
      DECLARES_ENTITIES,
    );
    expect(DECLARES_ENTITIES).toBe(
      "This workbook declares its own entities, which HQ does not read.",
    );
    expect(() => scanXml("<a><!ENTITY x 'y'></a>", () => undefined)).toThrow(DECLARES_ENTITIES);
  });

  it("Zip64 sizes, an encrypted entry, method 12", () => {
    const base = workbookParts([{ name: "Q", xml: sheet("") }], null);
    const swap = (change: Partial<ZipPart>) =>
      zipOf(base.map((part) => (part.name === "xl/workbook.xml" ? { ...part, ...change } : part)));
    expect(refusal(() => readXlsx(swap({ zip64: true })))).toBe(ZIP64_WORDS);
    expect(refusal(() => readXlsx(swap({ flags: 1 })))).toBe(ENCRYPTED_WORDS);
    expect(refusal(() => readXlsx(swap({ method: 12 })))).toBe(METHOD_WORDS);
  });

  it("an entry inflating past 16 MiB, and 2,001 entries", () => {
    const big = new Uint8Array(16 * 1024 * 1024 + 1).fill(0x20);
    const huge = sheet("").replace("<sheetData>", `<sheetData>${new TextDecoder().decode(big)}`);
    const parts = workbookParts([{ name: "Q", xml: huge }], null);
    const zip = zipOf(parts);
    expect(zip.length).toBeLessThan(200_000);
    expect(refusal(() => readXlsx(zip))).toBe(PART_TOO_LARGE_WORDS);
    const many = workbookParts([{ name: "Q", xml: sheet("") }], null);
    for (let n = many.length; n < 2_001; n += 1)
      many.push({ name: `xl/extra/${n}.xml`, data: "<x/>", method: 0 });
    expect(many).toHaveLength(2_001);
    expect(refusal(() => readXlsx(zipOf(many)))).toBe(ENTRIES_WORDS);
    expect(readXlsx(zipOf(many.slice(0, 2_000))).sheets).toHaveLength(1);
  });
});

describe("the writer", () => {
  it("writes a workbook that reads back cell for cell, stored, six entries in order", async () => {
    const path = join(dir, "round.xlsx");
    const rows = [
      ["Question ID", "Question", "Answer", "Comment"],
      ["A&A-01.1", 'Is "customer" data <encrypted> & kept?', "Yes", "Line one\nLine two"],
      ["01.1", "=SUM(A1:A2)", "", "Literal _x000D_ stays"],
      ["", "", "", ""],
      ["IAM-02", "Tab\tkept", "No", ""],
    ];
    await writeXlsx(path, { sheet: "Walk sheet", rows, wide: [1, 2, 3] });
    const bytes = new Uint8Array(readFileSync(path));
    const read = readXlsx(bytes);
    expect(read.sheets).toEqual([{ name: "Walk sheet", rows: 5 }]);
    expect(read.sheet.rows).toEqual([
      rows[0],
      rows[1],
      ["01.1", "=SUM(A1:A2)", "", "Literal _x000D_ stays"],
      [],
      ["IAM-02", "Tab\tkept", "No"],
    ]);
    const text = new TextDecoder("latin1").decode(bytes);
    let at = 0;
    for (const name of XLSX_ENTRIES) {
      const found = text.indexOf(name, at);
      expect(found).toBeGreaterThan(-1);
      at = found;
    }
    // Inline strings only: no formula, no number, no shared strings.
    expect(text).not.toContain("<f>");
    expect(text).not.toContain("<v>");
    expect(text).not.toContain("sharedStrings");
    expect(text).toContain('width="60"');
    expect(text).toContain('width="18"');
    expect(text).toContain('wrapText="1"');
  });

  it("drops what XML 1.0 forbids", async () => {
    expect(xmlSafe("a\u0000b\u0008c\u000bd\u000ce\u001ff￾g￿h\ud800i\udc00j\tk\nl")).toBe(
      "abcdefghij\tk\nl",
    );
    expect(xmlSafe("emoji 😀 kept")).toBe("emoji 😀 kept");
    const path = join(dir, "forbidden.xlsx");
    await writeXlsx(path, { sheet: "Q", rows: [["bad\u0001 cell\u0000"]], wide: [] });
    expect(readXlsx(new Uint8Array(readFileSync(path))).sheet.rows).toEqual([["bad cell"]]);
  });

  it("the sheet-name rule: 31 characters at most, none of []:*?/\\", () => {
    expect(sheetNameOf("Walk Capital questions")).toBe("Walk Capital questions");
    expect(sheetNameOf("x".repeat(31))).toBe("x".repeat(31));
    expect(sheetNameOf("x".repeat(32))).toBe("Questionnaire");
    for (const bad of ["a[b", "a]b", "a:b", "a*b", "a?b", "a/b", "a\\b", "", null])
      expect(sheetNameOf(bad)).toBe("Questionnaire");
  });
});
