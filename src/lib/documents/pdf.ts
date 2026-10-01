import "server-only";

import * as fontkitModule from "@pdf-lib/fontkit";
import { PDFDocument, rgb, type PDFFont, type PDFImage, type PDFPage, type RGB } from "pdf-lib";

import type { Letterhead } from "@/lib/api/company";
import type { DocumentAssets } from "@/lib/documents/assets";
import { displayCell, isNumericType, stampLabel, type Cell } from "@/lib/documents/cells";
import type { SheetColumn } from "@/lib/documents/xlsx";

// The ES build exports the kit as its default; the typings describe the namespace.
const fontkit =
  (fontkitModule as unknown as { default?: typeof fontkitModule }).default ?? fontkitModule;

export type TablePdfInput = {
  title: string;
  columns: readonly SheetColumn[];
  rows: readonly (readonly Cell[])[];
  letterhead: Letterhead;
  exportedBy: string;
  generatedAt: string;
  reason: string;
};

const INK = rgb(0.067, 0.067, 0.067);
const GREY = rgb(0.36, 0.36, 0.36);
const RULE = rgb(0.85, 0.85, 0.85);
const BRAND_DOT = rgb(0x98 / 255, 0x10 / 255, 0xfa / 255);

const A4 = { width: 595.28, height: 841.89 };
const MARGIN = { x: 36, top: 36, bottom: 56 };
const PAD_X = 4;
const PAD_Y = 3.5;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Face = { pdf: PDFFont; kit: ReturnType<typeof fontkitModule.create> };
type Run = { face: Face; text: string };

/**
 * Text with a fallback face: a character the first face lacks is drawn in the second
 * (the monospace figures have no rupee sign; Space Grotesk does), and one neither has is
 * drawn as "?" and counted, so the document can say so rather than print a box.
 */
class Typesetter {
  missing = 0;

  constructor(private readonly fallback: Face) {}

  runs(text: string, face: Face): Run[] {
    const runs: Run[] = [];
    for (const char of text) {
      const code = char.codePointAt(0) ?? 63;
      let use = face;
      let drawn = char;
      if (!face.kit.hasGlyphForCodePoint(code)) {
        if (this.fallback.kit.hasGlyphForCodePoint(code)) use = this.fallback;
        else {
          drawn = "?";
          this.missing += 1;
        }
      }
      const last = runs[runs.length - 1];
      if (last && last.face === use) last.text += drawn;
      else runs.push({ face: use, text: drawn });
    }
    return runs;
  }

  width(text: string, face: Face, size: number): number {
    let total = 0;
    for (const char of text) {
      const code = char.codePointAt(0) ?? 63;
      const use = face.kit.hasGlyphForCodePoint(code)
        ? face
        : this.fallback.kit.hasGlyphForCodePoint(code)
          ? this.fallback
          : face;
      total += use.pdf.widthOfTextAtSize(
        use === face && !face.kit.hasGlyphForCodePoint(code) ? "?" : char,
        size,
      );
    }
    return total;
  }

  draw(
    page: PDFPage,
    text: string,
    x: number,
    y: number,
    face: Face,
    size: number,
    color: RGB,
  ): void {
    let cursor = x;
    for (const run of this.runs(text, face)) {
      page.drawText(run.text, { x: cursor, y, size, font: run.face.pdf, color });
      cursor += run.face.pdf.widthOfTextAtSize(run.text, size);
    }
  }

  /** Lines that fit a width: words kept whole where they fit, broken where one cannot. */
  wrap(text: string, face: Face, size: number, width: number): string[] {
    const lines: string[] = [];
    for (const paragraph of text.replace(/\r/g, "").split("\n")) {
      let line = "";
      for (const word of paragraph.split(/ +/)) {
        const candidate = line ? `${line} ${word}` : word;
        if (this.width(candidate, face, size) <= width) {
          line = candidate;
          continue;
        }
        if (line) lines.push(line);
        if (this.width(word, face, size) <= width) {
          line = word;
          continue;
        }
        // A word wider than the column: broken by characters, never cut off.
        let piece = "";
        for (const char of word) {
          if (piece && this.width(piece + char, face, size) > width) {
            lines.push(piece);
            piece = char;
          } else piece += char;
        }
        line = piece;
      }
      lines.push(line);
    }
    return lines.length > 0 ? lines : [""];
  }
}

type Faces = { text: Face; bold: Face; mono: Face; monoBold: Face; mark: Face; markDot: Face };

function footerIdentity(head: Letterhead): string {
  return [head.name, head.name_note, head.liability, head.numbers, head.address, head.contact]
    .filter(Boolean)
    .join(" · ");
}

/** The wordmark: "quantify terminal" in Poppins 600, the full stop in 700 and the brand purple. */
function drawWordmark(page: PDFPage, faces: Faces, x: number, y: number, size: number): number {
  const word = "quantify terminal";
  page.drawText(word, { x, y, size, font: faces.mark.pdf, color: INK });
  const width = faces.mark.pdf.widthOfTextAtSize(word, size);
  page.drawText(".", { x: x + width, y, size, font: faces.markDot.pdf, color: BRAND_DOT });
  return width + faces.markDot.pdf.widthOfTextAtSize(".", size);
}

type Layout = { widths: number[]; size: number; natural: number };

function layoutColumns(
  set: Typesetter,
  faces: Faces,
  columns: readonly SheetColumn[],
  cells: string[][],
  available: number,
): Layout {
  let first = 0;
  for (const size of [7.5, 6.8, 6.2]) {
    const monoSize = size - 0.5;
    const natural = columns.map((column, index) => {
      const numeric =
        isNumericType(column.type) || column.type === "date" || column.type === "datetime";
      const face = numeric ? faces.mono : faces.text;
      let widest = set.width(column.label, faces.bold, size);
      for (const row of cells.slice(0, 400)) {
        const text = row[index] ?? "";
        for (const line of text.split("\n"))
          widest = Math.max(widest, set.width(line, face, numeric ? monoSize : size));
      }
      return Math.min(widest, numeric ? 140 : 230) + PAD_X * 2;
    });
    const minimum = columns.map((column, index) => {
      const numeric =
        isNumericType(column.type) || column.type === "date" || column.type === "datetime";
      if (numeric) return natural[index]!;
      // A column is never narrower than its longest word (up to a point), so "demo_done"
      // is not broken in two while a long name still wraps between its words.
      let longestWord = Math.max(
        ...column.label.split(" ").map((word) => set.width(word, faces.bold, size)),
        0,
      );
      for (const row of cells.slice(0, 400)) {
        for (const word of (row[index] ?? "").split(/\s+/))
          longestWord = Math.max(longestWord, set.width(word, faces.text, size));
      }
      return Math.max(44, Math.min(longestWord, 96) + PAD_X * 2);
    });
    const total = natural.reduce((sum, width) => sum + width, 0);
    if (!first) first = total;
    if (total <= available) {
      const textIndexes = columns
        .map((column, index) => (column.type === "text" ? index : -1))
        .filter((i) => i >= 0);
      const spread = textIndexes.length > 0 ? textIndexes : columns.map((_, index) => index);
      const extra = (available - total) / Math.max(spread.length, 1);
      return {
        widths: natural.map((width, index) => (spread.includes(index) ? width + extra : width)),
        size,
        natural: first,
      };
    }
    const minTotal = minimum.reduce((sum, width) => sum + width, 0);
    if (minTotal <= available) {
      // Fixed-width figures keep their width; prose shares what is left, in proportion.
      const flexible = columns.map((_, index) => natural[index]! > minimum[index]!);
      const fixed = natural.reduce((sum, width, index) => sum + (flexible[index] ? 0 : width), 0);
      const flexNatural = natural.reduce(
        (sum, width, index) => sum + (flexible[index] ? width : 0),
        0,
      );
      let room = available - fixed;
      const widths = natural.map((width, index) => (flexible[index] ? 0 : width));
      // Give each flexible column its share, never below its minimum.
      const order = columns.map((_, index) => index).filter((index) => flexible[index]);
      let remainingNatural = flexNatural;
      for (const index of order.sort(
        (a, b) => minimum[b]! / natural[b]! - minimum[a]! / natural[a]!,
      )) {
        const share = Math.max(minimum[index]!, (room * natural[index]!) / remainingNatural);
        widths[index] = share;
        room -= share;
        remainingNatural -= natural[index]!;
      }
      return { widths, size, natural: first };
    }
  }
  // Too many columns for the page even at the smallest size: equal shares, everything wraps.
  return { widths: columns.map(() => available / columns.length), size: 6.2, natural: first };
}

/** A PDF of an export's records on the company's letterhead, every page numbered and footed. */
export async function buildTablePdf(
  input: TablePdfInput,
  assets: DocumentAssets,
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const face = async (bytes: Uint8Array): Promise<Face> => ({
    pdf: await doc.embedFont(bytes, { subset: true }),
    kit: fontkit.create(bytes),
  });
  const faces: Faces = {
    text: await face(assets.text),
    bold: await face(assets.textBold),
    mono: await face(assets.mono),
    monoBold: await face(assets.monoBold),
    mark: await face(assets.wordmark),
    markDot: await face(assets.wordmarkDot),
  };
  const mark: PDFImage = await doc.embedPng(assets.mark);
  const set = new Typesetter(faces.text);
  const head = input.letterhead;

  // A column of record IDs is for machines: a reader gets nothing from it and it wraps into
  // four lines. The PDF leaves it out and says so; the CSV and Excel files keep it.
  const kept = input.columns
    .map((column, index) => ({ column, index }))
    .filter(({ index }) => {
      const values = input.rows
        .map((row) => row[index])
        .filter((value) => value !== null && value !== "");
      return !(
        values.length > 0 && values.every((value) => typeof value === "string" && UUID.test(value))
      );
    });
  const idsLeftOut = kept.length < input.columns.length;
  input = {
    ...input,
    columns: kept.map(({ column }) => column),
    rows: input.rows.map((row) => kept.map(({ index }) => row[index] ?? null)),
  };
  const cells = input.rows.map((row) =>
    input.columns.map((column, index) => displayCell(row[index] ?? null, column.type)),
  );
  const portraitWidth = A4.width - MARGIN.x * 2;
  const trial = layoutColumns(set, faces, input.columns, cells, portraitWidth);
  // Wide tables turn the page: more than a portrait page's width of unwrapped figures and words.
  const landscape = input.columns.length >= 5 && trial.natural > portraitWidth * 1.1;
  const pageSize: [number, number] = landscape ? [A4.height, A4.width] : [A4.width, A4.height];
  const available = pageSize[0] - MARGIN.x * 2;
  const { widths, size } = landscape
    ? layoutColumns(set, faces, input.columns, cells, available)
    : trial;
  const monoSize = size - 0.5;
  const leading = size * 1.32;

  const pages: PDFPage[] = [];
  let page!: PDFPage;
  let y = 0;
  const right = () => pageSize[0] - MARGIN.x;

  const drawHeaderRow = () => {
    const lines = input.columns.map((column, index) =>
      set.wrap(column.label, faces.bold, size, widths[index]! - PAD_X * 2),
    );
    const height = Math.max(...lines.map((item) => item.length)) * leading + PAD_Y * 2;
    let x = MARGIN.x;
    input.columns.forEach((column, index) => {
      const numeric = isNumericType(column.type);
      lines[index]!.forEach((line, lineIndex) => {
        const textWidth = set.width(line, faces.bold, size);
        const at = numeric ? x + widths[index]! - PAD_X - textWidth : x + PAD_X;
        set.draw(
          page,
          line,
          at,
          y - PAD_Y - size - lineIndex * leading + 1.5,
          faces.bold,
          size,
          INK,
        );
      });
      x += widths[index]!;
    });
    y -= height;
    page.drawLine({
      start: { x: MARGIN.x, y },
      end: { x: right(), y },
      thickness: 0.8,
      color: INK,
    });
  };

  const newPage = () => {
    page = doc.addPage(pageSize);
    pages.push(page);
    y = pageSize[1] - MARGIN.top;
    if (pages.length > 1) {
      drawWordmark(page, faces, MARGIN.x, y - 9, 9);
      const label = `${input.title}, continued`;
      set.draw(
        page,
        label,
        right() - set.width(label, faces.text, 7.5),
        y - 8.5,
        faces.text,
        7.5,
        GREY,
      );
      y -= 18;
      page.drawLine({
        start: { x: MARGIN.x, y },
        end: { x: right(), y },
        thickness: 0.4,
        color: RULE,
      });
      y -= 8;
      drawHeaderRow();
    }
  };

  // -- the first page: the letterhead, the title and what the file is ------------------
  newPage();
  page.drawImage(mark, { x: MARGIN.x, y: y - 28, width: 28, height: 28 });
  drawWordmark(page, faces, MARGIN.x + 36, y - 19, 15);
  const block: Array<{ text: string; face: Face; size: number; color: RGB }> = [];
  block.push({ text: head.name, face: faces.bold, size: 8.5, color: INK });
  for (const text of [
    head.name_note,
    head.former_name,
    head.liability,
    head.numbers,
    head.address,
    head.contact,
  ]) {
    if (text) block.push({ text, face: faces.text, size: 7.2, color: GREY });
  }
  let blockY = y - 8;
  const blockWidth = Math.min(280, available * 0.48);
  for (const line of block) {
    for (const piece of set.wrap(line.text, line.face, line.size, blockWidth)) {
      set.draw(
        page,
        piece,
        right() - set.width(piece, line.face, line.size),
        blockY,
        line.face,
        line.size,
        line.color,
      );
      blockY -= line.size * 1.35;
    }
  }
  y = Math.min(y - 36, blockY - 2);
  page.drawLine({ start: { x: MARGIN.x, y }, end: { x: right(), y }, thickness: 0.4, color: RULE });
  y -= 26;
  set.draw(page, input.title, MARGIN.x, y, faces.bold, 17, INK);
  y -= 15;
  const count = `${input.rows.length.toLocaleString("en-GB")} ${input.rows.length === 1 ? "record" : "records"}`;
  const meta = [
    `${count} · exported by ${input.exportedBy} on ${stampLabel(input.generatedAt)}. Times are UTC.`,
    `What it is for: ${input.reason}`,
  ];
  if (idsLeftOut) meta.push("Record IDs are in this export's CSV and Excel files, not in the PDF.");
  if (head.trading_as) meta.push(head.trading_as);
  for (const text of meta) {
    for (const piece of set.wrap(text, faces.text, 8, available)) {
      set.draw(page, piece, MARGIN.x, y, faces.text, 8, GREY);
      y -= 11;
    }
  }
  y -= 8;
  drawHeaderRow();

  // -- the records -----------------------------------------------------------------------
  const floor = MARGIN.bottom + 6;
  if (cells.length === 0) {
    y -= leading + PAD_Y;
    set.draw(page, "No records.", MARGIN.x + PAD_X, y, faces.text, size, GREY);
  }
  for (const row of cells) {
    const wrapped = input.columns.map((column, index) => {
      const numeric =
        isNumericType(column.type) || column.type === "date" || column.type === "datetime";
      return set.wrap(
        row[index] ?? "",
        numeric ? faces.mono : faces.text,
        numeric ? monoSize : size,
        widths[index]! - PAD_X * 2,
      );
    });
    const total = Math.max(...wrapped.map((lines) => lines.length));
    let done = 0;
    // A row that fits a fresh page is never split; a longer one continues across pages.
    if (
      y - (total * leading + PAD_Y * 2) < floor &&
      total * leading + PAD_Y * 2 < pageSize[1] - MARGIN.top - floor - 60
    ) {
      newPage();
    }
    while (done < total) {
      let fits = Math.floor((y - floor - PAD_Y * 2) / leading);
      if (fits < 1) {
        newPage();
        fits = Math.floor((y - floor - PAD_Y * 2) / leading);
      }
      const take = Math.min(fits, total - done);
      let x = MARGIN.x;
      input.columns.forEach((column, index) => {
        const numeric = isNumericType(column.type);
        const mono = numeric || column.type === "date" || column.type === "datetime";
        const lineFace = mono ? faces.mono : faces.text;
        const lineSize = mono ? monoSize : size;
        wrapped[index]!.slice(done, done + take).forEach((line, lineIndex) => {
          const width = set.width(line, lineFace, lineSize);
          const at = numeric ? x + widths[index]! - PAD_X - width : x + PAD_X;
          set.draw(
            page,
            line,
            at,
            y - PAD_Y - size - lineIndex * leading + 1.5,
            lineFace,
            lineSize,
            INK,
          );
        });
        x += widths[index]!;
      });
      y -= take * leading + PAD_Y * 2;
      done += take;
      page.drawLine({
        start: { x: MARGIN.x, y },
        end: { x: right(), y },
        thickness: 0.35,
        color: RULE,
      });
    }
  }
  if (set.missing > 0) {
    y -= 14;
    if (y < floor) newPage();
    const note = `${set.missing} ${set.missing === 1 ? "character is" : "characters are"} not in this document's typeface and show as “?”; the CSV and Excel files carry ${set.missing === 1 ? "it" : "them"} exactly.`;
    for (const piece of set.wrap(note, faces.text, 7.5, available)) {
      set.draw(page, piece, MARGIN.x, y, faces.text, 7.5, GREY);
      y -= 10;
    }
  }

  // -- every page's foot: who issued it, and where it sits in the document -------------------
  const identity = footerIdentity(head);
  const note =
    head.note ||
    "Made in Quantify Terminal HQ for the purpose above and recorded in its audit log.";
  pages.forEach((each, index) => {
    const width = each.getWidth();
    each.drawLine({
      start: { x: MARGIN.x, y: 44 },
      end: { x: width - MARGIN.x, y: 44 },
      thickness: 0.4,
      color: RULE,
    });
    let footY = 34;
    for (const piece of set.wrap(identity, faces.text, 6.5, width - MARGIN.x * 2).slice(0, 2)) {
      set.draw(each, piece, MARGIN.x, footY, faces.text, 6.5, GREY);
      footY -= 8.5;
    }
    const pageLabel = `Page ${index + 1} of ${pages.length}`;
    const labelWidth = set.width(pageLabel, faces.mono, 6.5);
    const noteLines = set.wrap(note, faces.text, 6.5, width - MARGIN.x * 2 - labelWidth - 16);
    set.draw(each, noteLines[0] ?? "", MARGIN.x, footY - 1, faces.text, 6.5, GREY);
    set.draw(each, pageLabel, width - MARGIN.x - labelWidth, footY - 1, faces.mono, 6.5, GREY);
  });

  doc.setTitle(input.title);
  doc.setAuthor(head.name);
  doc.setSubject(input.reason);
  doc.setCreator("Quantify Terminal HQ");
  doc.setProducer("Quantify Terminal HQ");
  doc.setLanguage("en-GB");
  const made = new Date(Date.parse(input.generatedAt) || Date.now());
  doc.setCreationDate(made);
  doc.setModificationDate(made);
  return doc.save();
}
