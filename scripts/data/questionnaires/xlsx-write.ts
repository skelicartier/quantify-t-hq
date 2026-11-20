/**
 * A fresh one-sheet workbook (ws-notes/security/spec.md §9.3), stored through the sender's own
 * `ZipWriter`, which every spreadsheet opens. Every cell is an inline string, never a formula
 * or a number, so nothing in it runs and "01.1" stays "01.1". Characters XML 1.0 forbids are
 * dropped; `&`, `<`, `>` and `"` are escaped; text that reads like OOXML's own `_xHHHH_`
 * escape is escaped in turn, so it reads back as written.
 */

import { ZipWriter } from "../zip";
import { columnLetters } from "./xlsx-read";

/** Excel's own rule for a sheet's name: 31 characters at most, none of `[]:*?/\`. */
export function sheetNameOf(name: string | null | undefined): string {
  const given = (name ?? "").trim();
  if (!given || given.length > 31 || /[[\]:*?/\\]/.test(given)) return "Questionnaire";
  return given;
}

/** Drops what XML 1.0 forbids: U+0000–U+0008, U+000B, U+000C, U+000E–U+001F, U+FFFE, U+FFFF, lone surrogates. */
export function xmlSafe(text: string): string {
  let out = "";
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = text.charCodeAt(index + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        out += text[index]! + text[index + 1]!;
        index += 1;
      }
      continue;
    }
    if (code >= 0xdc00 && code <= 0xdfff) continue;
    if (code <= 0x08 || code === 0x0b || code === 0x0c || (code >= 0x0e && code <= 0x1f)) continue;
    if (code === 0xfffe || code === 0xffff) continue;
    out += text[index]!;
  }
  return out;
}

/** Text as an XML value: the forbidden characters dropped, then `&`, `<`, `>` and `"` escaped. */
export function xmlText(text: string): string {
  return xmlSafe(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** A cell's text: one kind of line break, and `_xHHHH_` escaped so a reader keeps it as typed. */
function cellText(text: string): string {
  return xmlText(text.replace(/\r\n?/g, "\n").replace(/_(x[0-9A-Fa-f]{4}_)/g, "_x005F_$1"));
}

const HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
const MAIN = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const PKG_REL = "http://schemas.openxmlformats.org/package/2006/relationships";

const CONTENT_TYPES =
  `${HEAD}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
  '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
  '<Default Extension="xml" ContentType="application/xml"/>' +
  '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
  '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
  '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
  "</Types>";

const ROOT_RELS =
  `${HEAD}<Relationships xmlns="${PKG_REL}">` +
  `<Relationship Id="rId1" Type="${REL}/officeDocument" Target="xl/workbook.xml"/>` +
  "</Relationships>";

const WORKBOOK_RELS =
  `${HEAD}<Relationships xmlns="${PKG_REL}">` +
  `<Relationship Id="rId1" Type="${REL}/worksheet" Target="worksheets/sheet1.xml"/>` +
  `<Relationship Id="rId2" Type="${REL}/styles" Target="styles.xml"/>` +
  "</Relationships>";

/** One font, the two fills every workbook needs, one border, and two cell formats: plain and wrapped. */
const STYLES =
  `${HEAD}<styleSheet xmlns="${MAIN}">` +
  '<fonts count="1"><font><sz val="11"/><name val="Calibri"/><family val="2"/></font></fonts>' +
  '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>' +
  '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
  '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
  '<cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
  '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf></cellXfs>' +
  '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
  "</styleSheet>";

const workbookOf = (sheet: string) =>
  `${HEAD}<workbook xmlns="${MAIN}" xmlns:r="${REL}"><sheets>` +
  `<sheet name="${xmlText(sheet)}" sheetId="1" r:id="rId1"/></sheets></workbook>`;

export type WorkbookInput = {
  sheet: string | null;
  rows: readonly (readonly string[])[];
  /** Columns 60 wide whose text wraps (the question, the answer, the comment); the others are 18. */
  wide: readonly number[];
};

/** The sheet's XML: a width for every column, then every non-empty cell as an inline string. */
export function sheetXml(input: WorkbookInput): string {
  const width = Math.max(1, ...input.rows.map((row) => row.length));
  const wide = new Set(input.wide);
  const cols = Array.from({ length: width }, (_, index) => {
    const n = index + 1;
    return `<col min="${n}" max="${n}" width="${wide.has(index) ? 60 : 18}" customWidth="1"/>`;
  }).join("");
  const body = input.rows
    .map((row, index) => {
      const r = index + 1;
      const cells = row
        .map((value, column) => {
          if (!value) return "";
          const style = wide.has(column) ? ' s="1"' : "";
          return `<c r="${columnLetters(column)}${r}" t="inlineStr"${style}><is><t xml:space="preserve">${cellText(value)}</t></is></c>`;
        })
        .join("");
      return `<row r="${r}">${cells}</row>`;
    })
    .join("");
  return `${HEAD}<worksheet xmlns="${MAIN}"><cols>${cols}</cols><sheetData>${body}</sheetData></worksheet>`;
}

/** Write the workbook at `path`: these six entries, in this order, stored. */
export async function writeXlsx(
  path: string,
  input: WorkbookInput,
  at = new Date(),
): Promise<void> {
  const zip = new ZipWriter(path, at);
  const bytes = (text: string) => new TextEncoder().encode(text);
  try {
    await zip.addBytes("[Content_Types].xml", bytes(CONTENT_TYPES));
    await zip.addBytes("_rels/.rels", bytes(ROOT_RELS));
    await zip.addBytes("xl/workbook.xml", bytes(workbookOf(sheetNameOf(input.sheet))));
    await zip.addBytes("xl/_rels/workbook.xml.rels", bytes(WORKBOOK_RELS));
    await zip.addBytes("xl/styles.xml", bytes(STYLES));
    await zip.addBytes("xl/worksheets/sheet1.xml", bytes(sheetXml(input)));
    await zip.finish();
  } catch (error) {
    await zip.abort();
    throw error;
  }
}

/** The six entries' names, in the order they are written. */
export const XLSX_ENTRIES = [
  "[Content_Types].xml",
  "_rels/.rels",
  "xl/workbook.xml",
  "xl/_rels/workbook.xml.rels",
  "xl/styles.xml",
  "xl/worksheets/sheet1.xml",
] as const;
