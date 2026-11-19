// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  DATE_FORMATS,
  amountCell,
  chooseDelimiter,
  parseDelimited,
  readDate,
  splitRecords,
} from "../../scripts/data/statements/parse-csv";
import { looksLikeOfx, parseOfx } from "../../scripts/data/statements/parse-ofx";
import type { DateFormat, Parsed } from "../../scripts/data/statements/types";
import {
  DECIMAL_COMMA_WORDS,
  PDF_WORDS,
  TOO_MANY_LINES_WORDS,
  XLS_WORDS,
} from "@/lib/data/labels-statements";

/**
 * The two statement parsers (ws-notes/duties/spec.md §9.3), each fed files made here from
 * invented lines: never a bank's real file. Walk Bank, WALK- references, ··0000.
 */

const bytes = (text: string) => new TextEncoder().encode(text);
const ok = (parsed: Parsed) => {
  if (!parsed.ok) throw new Error(`refused: ${parsed.words}`);
  return parsed;
};

describe("delimited text", () => {
  it("reads a comma file after a three-line preamble, and counts a totals row as not a transaction", () => {
    const file = [
      "Walk Bank statement",
      "Account: Walk Bank current ··0000",
      "Period: 01/10/2026 to 31/10/2026",
      "Txn Date,Value Date,Narration,Chq./Ref.No.,Withdrawal Amt.,Deposit Amt.,Closing Balance",
      '01/10/2026,01/10/2026,NEFT WALK LEGAL LLP WALK-INV-0007,WALK-UTR-0007,"11,800.00",,"13,88,200.00"',
      '05/10/2026,05/10/2026,WALK FUND SUBSCRIPTION,WALK-REF-0101,,"20,000.00","14,08,200.00"',
      '31/10/2026,31/10/2026,NEFT WALK INTERN ONE STIPEND,WALK-UTR-0015,"15,000.00",,"13,93,200.00"',
      ',,Totals,,"26,800.00","20,000.00",',
    ].join("\r\n");
    const parsed = ok(parseDelimited(bytes(file), { name: "walk.csv" }));
    expect(parsed.mapping).toMatchObject({
      delimiter: ",",
      header_row: 3,
      date: 0,
      date_format: "DD/MM/YYYY",
      narration: 2,
      reference: 3,
      amount: { style: "two_columns", debit: 4, credit: 5 },
      balance: 6,
    });
    expect(parsed.ignored_rows).toBe(1);
    expect(parsed.lines).toHaveLength(3);
    expect(parsed.lines[0]).toEqual({
      row: 5,
      posted_on: "2026-10-01",
      direction: "debit",
      amount_minor: 1_180_000,
      balance_minor: 138_820_000,
      narration: "NEFT WALK LEGAL LLP WALK-INV-0007",
      reference: "WALK-UTR-0007",
    });
    expect(parsed.lines[1]).toMatchObject({ direction: "credit", amount_minor: 2_000_000 });
    // 31/10 reads only day first, so nothing had to be chosen.
    expect(parsed.day_first_chosen).toBe(false);
  });

  it("refuses a semicolon file with decimal commas, with the sentence", () => {
    const file = [
      "Date;Description;Reference;Debit;Credit;Balance",
      "01-10-2026;WALK SUPPLIER;WALK-REF-1;1.234,56;;10.000,00",
      "02-10-2026;WALK CUSTOMER;WALK-REF-2;;500,00;10.500,00",
    ].join("\n");
    expect(chooseDelimiter(file)).toBe(";");
    const parsed = parseDelimited(bytes(file), { name: "walk.csv" });
    expect(parsed).toEqual({ ok: false, words: DECIMAL_COMMA_WORDS });
    expect(DECIMAL_COMMA_WORDS).toBe("Amounts must use a dot for paise.");
  });

  it("reads a tab file whose second column says DR or CR", () => {
    const file = [
      "Date\tDescription\tReference\tAmount\tDr/Cr\tBalance",
      "2026-10-02\tWALK HOSTING\tWALK-REF-0201\t2,500.00\tDR\t97,500.00",
      "2026-10-03\tWALK CUSTOMER\tWALK-REF-0202\t10,000.00\tCR\t1,07,500.00",
    ].join("\n");
    const parsed = ok(parseDelimited(bytes(file), { name: "walk.tsv" }));
    expect(parsed.mapping?.delimiter).toBe("\t");
    expect(parsed.mapping?.amount).toEqual({ style: "marker", column: 3, marker: 4 });
    expect(parsed.mapping?.date_format).toBe("YYYY-MM-DD");
    expect(
      parsed.lines.map((line) => [line.direction, line.amount_minor, line.balance_minor]),
    ).toEqual([
      ["debit", 250_000, 9_750_000],
      ["credit", 1_000_000, 10_750_000],
    ]);
  });

  it("reads quoted fields holding commas, line breaks and doubled quotes", () => {
    expect(splitRecords('a,"b, c","say ""hi""\nthere"\r\nd,e,f', ",")).toEqual([
      ["a", "b, c", 'say "hi"\nthere'],
      ["d", "e", "f"],
    ]);
    const file = [
      "Date,Particulars,Ref,Amount,Balance",
      '15/10/2026,"WALK STUDIO, ""DESIGN"" FEE",WALK-REF-0301,-4500.00,95500.00',
      '16/10/2026,"WALK REFUND, PART",WALK-REF-0302,(500.00),95000.00',
    ].join("\n");
    const parsed = ok(parseDelimited(bytes(file), { name: "walk.csv" }));
    expect(parsed.lines[0]?.narration).toBe('WALK STUDIO, "DESIGN" FEE');
    expect(parsed.lines[0]?.direction).toBe("debit");
    expect(parsed.lines[1]).toMatchObject({ direction: "debit", amount_minor: 50_000 });
  });

  it("reads UTF-16 with its mark", () => {
    const text = "Date,Narration,Debit,Credit,Balance\n01/11/2026,WALK RENT ₹,1000.00,,9000.00\n";
    const body = Buffer.from(text, "utf16le");
    const file = new Uint8Array([0xff, 0xfe, ...body]);
    const parsed = ok(parseDelimited(file, { name: "walk.csv" }));
    expect(parsed.lines[0]).toMatchObject({ narration: "WALK RENT ₹", amount_minor: 100_000 });
  });

  it("reads each date format, and day first wins over month first", () => {
    const cells: Record<DateFormat, string> = {
      "DD/MM/YYYY": "05/10/2026",
      "DD-MM-YYYY": "05-10-2026",
      "DD/MM/YY": "05/10/26",
      "DD-MMM-YYYY": "05-Oct-2026",
      "DD MMM YYYY": "05 Oct 2026",
      "YYYY-MM-DD": "2026-10-05",
      "MM/DD/YYYY": "10/05/2026",
    };
    for (const format of DATE_FORMATS) expect(readDate(cells[format], format)).toBe("2026-10-05");
    expect(readDate("31/02/2026", "DD/MM/YYYY")).toBeNull();
    for (const format of DATE_FORMATS.filter((item) => item !== "MM/DD/YYYY")) {
      const file = `Date,Narration,Amount\n${cells[format]},WALK ONE,-10.00\n`;
      const parsed = ok(parseDelimited(bytes(file), { name: "walk.csv" }));
      expect(parsed.lines[0]?.posted_on).toBe("2026-10-05");
    }
    const american = ok(
      parseDelimited(bytes("Date,Narration,Amount\n10/25/2026,WALK ONE,-10.00\n"), {
        name: "a.csv",
      }),
    );
    expect(american.mapping?.date_format).toBe("MM/DD/YYYY");
    expect(american.day_first_chosen).toBe(false);
    const either = ok(
      parseDelimited(bytes("Date,Narration,Amount\n10/05/2026,WALK ONE,-10.00\n"), {
        name: "b.csv",
      }),
    );
    expect(either.mapping?.date_format).toBe("DD/MM/YYYY");
    expect(either.day_first_chosen).toBe(true);
    expect(either.lines[0]?.posted_on).toBe("2026-05-10");
  });

  it("reads amounts with rupee signs, brackets and a trailing Dr or Cr, and never a decimal comma", () => {
    expect(amountCell("₹ 1,180.50")).toEqual({
      kind: "value",
      minor: 118_050,
      negative: false,
      marker: null,
    });
    expect(amountCell("Rs. 25,00,000")).toMatchObject({ kind: "value", minor: 250_000_000 });
    expect(amountCell("(500.00)")).toMatchObject({ negative: true, minor: 50_000 });
    expect(amountCell("1,000.00 Dr")).toMatchObject({ marker: "dr", minor: 100_000 });
    expect(amountCell("1234,56")).toEqual({ kind: "comma" });
    expect(amountCell("")).toEqual({ kind: "empty" });
    expect(amountCell("twelve")).toEqual({ kind: "bad" });
  });

  it("refuses a row with a date and no amount, by its row number", () => {
    const file = "Date,Narration,Debit,Credit\n01/10/2026,WALK ONE,,\n";
    expect(parseDelimited(bytes(file), { name: "walk.csv" })).toEqual({
      ok: false,
      words: "Row 2 has a date and no amount.",
    });
  });

  it("refuses 20,001 lines with the sentence", () => {
    const rows = ["Date,Narration,Amount"];
    for (let index = 0; index < 20_001; index += 1) rows.push(`01/10/2026,WALK ${index},-1.00`);
    expect(parseDelimited(bytes(rows.join("\n")), { name: "walk.csv" })).toEqual({
      ok: false,
      words: TOO_MANY_LINES_WORDS,
    });
  });

  it("refuses an .xlsx and a PDF by their first bytes, with the page's sentences", () => {
    const xlsx = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x06, 0x00]);
    expect(parseDelimited(xlsx, { name: "statement.csv" })).toEqual({
      ok: false,
      words: XLS_WORDS,
    });
    expect(XLS_WORDS).toBe(
      "Save it as CSV from the bank's site or from the spreadsheet, then import that.",
    );
    const pdf = bytes("%PDF-1.7\n");
    expect(parseDelimited(pdf, { name: "statement" })).toEqual({ ok: false, words: PDF_WORDS });
    expect(parseOfx(xlsx, { name: "x.ofx" })).toEqual({ ok: false, words: XLS_WORDS });
  });
});

describe("OFX and QFX", () => {
  const sgml = [
    "OFXHEADER:100",
    "DATA:OFXSGML",
    "VERSION:102",
    "",
    "<OFX>",
    "<BANKMSGSRSV1><STMTTRNRS><STMTRS>",
    "<CURDEF>INR",
    "<BANKACCTFROM><ACCTID>XXXX0000</BANKACCTFROM>",
    "<BANKTRANLIST>",
    "<DTSTART>20261001",
    "<DTEND>20261031",
    "<STMTTRN>",
    "<TRNTYPE>DEBIT",
    "<DTPOSTED>20261020120000[+5.5:IST]",
    "<TRNAMT>-11800.00",
    "<FITID>WALK-FIT-0001",
    "<NAME>NEFT WALK LEGAL LLP",
    "<MEMO>WALK-INV-0007 &amp; fees",
    "<STMTTRN>",
    "<TRNTYPE>CREDIT",
    "<DTPOSTED>20261025",
    "<TRNAMT>20000,00",
    "<REFNUM>WALK-REF-0002",
    "<NAME>WALK FUND SUBSCRIPTION",
    "</BANKTRANLIST>",
    "<LEDGERBAL><BALAMT>1200000.00<DTASOF>20261031</LEDGERBAL>",
    "</STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>",
  ].join("\n");

  it("reads OFX 1.x without closing tags", () => {
    expect(looksLikeOfx(bytes(sgml))).toBe(true);
    const parsed = ok(parseOfx(bytes(sgml), { name: "walk.ofx", currency: "INR" }));
    expect(parsed).toMatchObject({
      source: "ofx",
      from: "2026-10-01",
      to: "2026-10-31",
      closing_minor: 120_000_000,
      currency: "INR",
    });
    expect(parsed.lines).toEqual([
      {
        row: 1,
        posted_on: "2026-10-20",
        direction: "debit",
        amount_minor: 1_180_000,
        balance_minor: null,
        narration: "NEFT WALK LEGAL LLP WALK-INV-0007 & fees",
        reference: "WALK-FIT-0001",
      },
      {
        row: 2,
        posted_on: "2026-10-25",
        direction: "credit",
        amount_minor: 2_000_000,
        balance_minor: null,
        narration: "WALK FUND SUBSCRIPTION",
        reference: "WALK-REF-0002",
      },
    ]);
  });

  it("reads OFX 2.x, and a credit card's file the same way", () => {
    const xml = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<?OFX OFXHEADER="200" VERSION="220"?>',
      "<OFX><CREDITCARDMSGSRSV1><CCSTMTTRNRS><CCSTMTRS>",
      "<CURDEF>INR</CURDEF>",
      "<BANKTRANLIST><DTSTART>20261101</DTSTART><DTEND>20261130</DTEND>",
      "<STMTTRN><TRNTYPE>DEBIT</TRNTYPE><DTPOSTED>20261103</DTPOSTED><TRNAMT>-2500.50</TRNAMT>",
      "<FITID>WALK-FIT-0003</FITID><CHECKNUM>WALK-CHQ-3</CHECKNUM><NAME>WALK HOSTING</NAME></STMTTRN>",
      "</BANKTRANLIST>",
      "<LEDGERBAL><BALAMT>-2500.50</BALAMT><DTASOF>20261130</DTASOF></LEDGERBAL>",
      "</CCSTMTRS></CCSTMTTRNRS></CREDITCARDMSGSRSV1></OFX>",
    ].join("");
    const parsed = ok(parseOfx(bytes(xml), { name: "card.qfx", currency: "INR" }));
    expect(parsed.lines).toEqual([
      {
        row: 1,
        posted_on: "2026-11-03",
        direction: "debit",
        amount_minor: 250_050,
        balance_minor: null,
        narration: "WALK HOSTING",
        reference: "WALK-CHQ-3",
      },
    ]);
    expect(parsed.closing_minor).toBe(-250_050);
  });

  it("refuses a file in another currency than the account's", () => {
    expect(
      parseOfx(bytes(sgml.replace("<CURDEF>INR", "<CURDEF>USD")), { currency: "INR" }),
    ).toEqual({ ok: false, words: "This file is in USD; the account is in rupees." });
  });
});
