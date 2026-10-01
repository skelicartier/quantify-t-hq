import { spreadsheetSerial, type Cell } from "@/lib/documents/cells";
import { zipStored } from "@/lib/documents/zip";
import type { ExportColumnType } from "@/lib/exports";

export type SheetColumn = { key: string; label: string; type: ExportColumnType };

export type WorkbookInput = {
  title: string;
  columns: readonly SheetColumn[];
  rows: readonly (readonly Cell[])[];
  /** The "About this file" sheet: who made it, when, why, for which company. */
  about: ReadonlyArray<readonly [string, string]>;
  author: string;
  company: string;
  generatedAt: string;
};

// Styles, by index into cellXfs below.
const STYLE = {
  text: 0,
  header: 1,
  number: 2,
  money: 3,
  percent: 4,
  date: 5,
  datetime: 6,
  label: 7,
} as const;

const STYLES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="4"><numFmt numFmtId="164" formatCode="#,##0.00"/><numFmt numFmtId="165" formatCode="0.0#&quot;%&quot;"/><numFmt numFmtId="166" formatCode="d mmm yyyy"/><numFmt numFmtId="167" formatCode="d mmm yyyy, hh:mm"/></numFmts>
<fonts count="2"><font><sz val="11"/><name val="Calibri"/><family val="2"/></font><font><b/><sz val="11"/><name val="Calibri"/><family val="2"/></font></fonts>
<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>
<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left/><right/><top/><bottom style="thin"><color rgb="FF000000"/></bottom><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="8">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"><alignment vertical="top" wrapText="1"/></xf>
<xf numFmtId="0" fontId="1" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1"><alignment vertical="top" wrapText="1"/></xf>
<xf numFmtId="3" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"><alignment vertical="top"/></xf>
<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"><alignment vertical="top"/></xf>
<xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"><alignment vertical="top"/></xf>
<xf numFmtId="166" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"><alignment horizontal="left" vertical="top"/></xf>
<xf numFmtId="167" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"><alignment horizontal="left" vertical="top"/></xf>
<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"><alignment vertical="top"/></xf>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

/** Text safe inside XML: escaped, and without the control characters XML 1.0 forbids. */
export function xmlText(value: string): string {
  return value
    .replace(/[^\t\n\r -퟿-�\u{10000}-\u{10FFFF}]/gu, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** A1-style column letters: 0 → A, 25 → Z, 26 → AA. */
export function columnName(index: number): string {
  let name = "";
  let n = index + 1;
  while (n > 0) {
    const rest = (n - 1) % 26;
    name = String.fromCharCode(65 + rest) + name;
    n = Math.floor((n - 1) / 26);
  }
  return name;
}

function inlineString(ref: string, text: string, style: number = STYLE.text): string {
  return `<c r="${ref}" t="inlineStr" s="${style}"><is><t xml:space="preserve">${xmlText(text)}</t></is></c>`;
}

/**
 * One cell. Text is an inline string, never a formula: a value someone typed as
 * `=HYPERLINK(...)` stays text in the spreadsheet, so the CSV's apostrophe is not needed.
 */
function cellXml(ref: string, value: Cell, type: ExportColumnType): string {
  if (value === null || value === "") return "";
  if (typeof value === "boolean") return `<c r="${ref}" t="b"><v>${value ? 1 : 0}</v></c>`;
  if (typeof value === "number" && Number.isFinite(value)) {
    const style =
      type === "money" ? STYLE.money : type === "percent" ? STYLE.percent : STYLE.number;
    return `<c r="${ref}" s="${style}"><v>${value}</v></c>`;
  }
  if ((type === "date" || type === "datetime") && typeof value === "string") {
    const serial = spreadsheetSerial(value, type);
    if (serial !== null) {
      const dateOnly = type === "date" || /^\d{4}-\d{2}-\d{2}$/.test(value);
      return `<c r="${ref}" s="${dateOnly ? STYLE.date : STYLE.datetime}"><v>${serial}</v></c>`;
    }
  }
  return inlineString(ref, String(value));
}

function widthOf(column: SheetColumn, rows: readonly (readonly Cell[])[], index: number): number {
  const fixed = { date: 12, datetime: 18, money: 14, percent: 9, number: 10, bool: 8 } as Record<
    string,
    number
  >;
  let longest = column.label.length;
  for (const row of rows.slice(0, 500)) {
    const value = row[index];
    if (value === null || value === undefined) continue;
    longest = Math.max(longest, String(value).length);
  }
  return Math.min(60, Math.max(fixed[column.type] ?? 8, longest + 2));
}

function sheetName(title: string): string {
  return title.replace(/[[\]:*?/\\]/g, " ").slice(0, 31) || "Records";
}

/** An .xlsx: the records on the first sheet (header frozen, filter on), the file's provenance on the second. */
export function buildWorkbook(input: WorkbookInput): Uint8Array {
  const { columns, rows } = input;
  const lastColumn = columnName(Math.max(columns.length - 1, 0));
  const header = `<row r="1">${columns
    .map((column, index) => inlineString(`${columnName(index)}1`, column.label, STYLE.header))
    .join("")}</row>`;
  const body = rows
    .map((row, rowIndex) => {
      const r = rowIndex + 2;
      const cells = columns
        .map((column, index) =>
          cellXml(`${columnName(index)}${r}`, row[index] ?? null, column.type),
        )
        .join("");
      return `<row r="${r}">${cells}</row>`;
    })
    .join("");
  const cols = columns
    .map(
      (column, index) =>
        `<col min="${index + 1}" max="${index + 1}" width="${widthOf(column, rows, index)}" customWidth="1"/>`,
    )
    .join("");
  const records = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<dimension ref="A1:${lastColumn}${rows.length + 1}"/>
<sheetViews><sheetView workbookViewId="0" tabSelected="1"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
<sheetFormatPr defaultRowHeight="15"/>
<cols>${cols}</cols>
<sheetData>${header}${body}</sheetData>
<autoFilter ref="A1:${lastColumn}${rows.length + 1}"/>
</worksheet>`;

  const aboutRows = input.about
    .map(
      ([label, value], index) =>
        `<row r="${index + 1}">${inlineString(`A${index + 1}`, label, STYLE.label)}${inlineString(
          `B${index + 1}`,
          value,
        )}</row>`,
    )
    .join("");
  const about = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<sheetViews><sheetView workbookViewId="0"/></sheetViews>
<cols><col min="1" max="1" width="22" customWidth="1"/><col min="2" max="2" width="90" customWidth="1"/></cols>
<sheetData>${aboutRows}</sheetData>
</worksheet>`;

  const name = sheetName(input.title);
  const workbook = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets><sheet name="${xmlText(name)}" sheetId="1" r:id="rId1"/><sheet name="About this file" sheetId="2" r:id="rId2"/></sheets>
<definedNames><definedName name="_xlnm._FilterDatabase" localSheetId="0" hidden="1">'${xmlText(
    name.replace(/'/g, "''"),
  )}'!$A$1:$${lastColumn}$${rows.length + 1}</definedName></definedNames>
</workbook>`;
  const workbookRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/>
<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;
  const rootRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`;
  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
<Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
</Types>`;
  const stamp = input.generatedAt.replace(/\.\d+/, "").replace(/\+00:00$/, "Z");
  const core = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
<dc:title>${xmlText(input.title)}</dc:title>
<dc:creator>${xmlText(input.author)}</dc:creator>
<cp:lastModifiedBy>${xmlText(input.author)}</cp:lastModifiedBy>
<dcterms:created xsi:type="dcterms:W3CDTF">${xmlText(stamp)}</dcterms:created>
<dcterms:modified xsi:type="dcterms:W3CDTF">${xmlText(stamp)}</dcterms:modified>
</cp:coreProperties>`;
  const app = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties">
<Application>Quantify Terminal HQ</Application><Company>${xmlText(input.company)}</Company>
</Properties>`;

  const encode = (text: string) => new TextEncoder().encode(text);
  return zipStored([
    { name: "[Content_Types].xml", data: encode(contentTypes) },
    { name: "_rels/.rels", data: encode(rootRels) },
    { name: "docProps/core.xml", data: encode(core) },
    { name: "docProps/app.xml", data: encode(app) },
    { name: "xl/workbook.xml", data: encode(workbook) },
    { name: "xl/_rels/workbook.xml.rels", data: encode(workbookRels) },
    { name: "xl/styles.xml", data: encode(STYLES_XML) },
    { name: "xl/worksheets/sheet1.xml", data: encode(records) },
    { name: "xl/worksheets/sheet2.xml", data: encode(about) },
  ]);
}
