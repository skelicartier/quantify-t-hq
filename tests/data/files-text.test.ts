// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { parseCsv } from "@/lib/crm/csv";
import { CsvCounter, headerOf } from "../../scripts/data/files/text-jobs";
import {
  crashingPdf,
  inventedCsv,
  inventedPdf,
  inventedTxt,
  socketCall,
  textRead,
  uploadVia,
} from "../../scripts/data/files/walk-seed";
import { WALKER, startStack, until, type Stack } from "./helpers";

/**
 * The words inside files: a PDF's text through `unpdf` from an invented PDF made with
 * `pdf-lib`, a CSV's rows counted exactly, and a file that crashes the reader marked
 * "Could not be read" after one restart, with no loop.
 */
let stack: Stack;
type Detail = {
  versions: { text: string; pages: number | null; rows: number | null; columns: number | null }[];
  preview: {
    kind: string;
    text?: string;
    table?: { header: string[]; rows: string[][] };
    text_state: string;
  };
};
const detail = async (id: string) =>
  (await socketCall(stack.socket, "GET", `/data/files/${id}`)).body.file as Detail;
const idOf = (reply: { body: Record<string, unknown> }) =>
  (reply.body.file as { file_id: string }).file_id;

beforeAll(async () => {
  stack = await startStack({ modules: ["files"] });
}, 60_000);
afterAll(async () => {
  await stack.stop();
});

describe("counting a CSV", () => {
  it("counts rows exactly as the sender's reader reads them, quotes and blank lines included", () => {
    const samples = [
      "a,b\n1,2\n3,4\n",
      'a,b\r\n"x, y",2\r\n"two\nlines",3\r\n\r\n,\r\n5,6',
      '﻿Name,Note\n"He said ""hi""",1\n\n\n',
      "only,a,header\n",
      "a\rb\rc\r",
    ];
    for (const text of samples) {
      const counter = new CsvCounter();
      const bytes = new TextEncoder().encode(text);
      // Fed in two pieces cut mid-way, as the reader reads a big file.
      counter.push(bytes.subarray(0, 7));
      counter.push(bytes.subarray(7));
      const table = parseCsv(text);
      expect(counter.finish() - 1).toBe(table.rows.length);
      expect(headerOf(text)).toEqual(table.header);
    }
  });
});

describe("reading the words inside", () => {
  it("reads an invented PDF's text with unpdf, page by page", async () => {
    const pdf = await inventedPdf([
      "Walk Fund Private Limited\nThe registered office is at 1 Invented Lane, Mumbai.",
      "Second page: the board met on 1 November 2026.",
    ]);
    const added = await uploadVia(stack.socket, {
      name: "certificate.pdf",
      bytes: pdf,
      by: WALKER,
    });
    expect(await textRead(stack.socket, idOf(added))).toBe("read");
    const file = await detail(idOf(added));
    expect(file.versions[0]).toMatchObject({ text: "read", pages: 2 });
    expect(file.preview.kind).toBe("pdf");
    expect(file.preview.text).toContain("The registered office is at 1 Invented Lane, Mumbai.");
    expect(file.preview.text).toContain("the board met on 1 November 2026");
  }, 30_000);

  it("says a PDF with no words may be a scan", async () => {
    const added = await uploadVia(stack.socket, {
      name: "scan.pdf",
      bytes: await inventedPdf([""]),
      by: WALKER,
    });
    expect(await textRead(stack.socket, idOf(added))).toBe("none");
  }, 30_000);

  it("counts an invented CSV's rows and columns exactly and previews 200 rows", async () => {
    const csv = inventedCsv(450, "count");
    const added = await uploadVia(stack.socket, { name: "people.csv", bytes: csv, by: WALKER });
    expect(await textRead(stack.socket, idOf(added))).toBe("read");
    const file = await detail(idOf(added));
    expect(file.versions[0]).toMatchObject({ rows: 450, columns: 5 });
    expect(parseCsv(new TextDecoder().decode(csv)).rows).toHaveLength(450);
    expect(file.preview.table?.header).toEqual(["Name", "Firm", "Email", "City", "Note"]);
    expect(file.preview.table?.rows).toHaveLength(200);
    expect(file.preview.table?.rows[4]?.[1]).toBe("Walk Fund 5, LLP");
  }, 30_000);

  it("keeps a text file's words as text, a script tag and all", async () => {
    const added = await uploadVia(stack.socket, {
      name: "notes.txt",
      bytes: inventedTxt("t"),
      by: WALKER,
    });
    expect(await textRead(stack.socket, idOf(added))).toBe("read");
    expect((await detail(idOf(added))).preview.text).toContain('<script>alert("not run")</script>');
  }, 30_000);

  it("marks a file that crashed the reader as could not be read after one restart, with no loop", async () => {
    const added = await uploadVia(stack.socket, {
      name: "broken.pdf",
      bytes: await crashingPdf("pill"),
      by: WALKER,
    });
    const id = idOf(added);
    await until(
      async () => {
        const status = await socketCall(stack.socket, "GET", "/data/status");
        const data = status.body.data as { state?: string; crashes?: number } | undefined;
        return data?.state === "ready" && (data.crashes ?? 0) >= 1;
      },
      "the worker to crash once and come back",
      20_000,
    );
    expect(await textRead(stack.socket, id)).toBe("failed");
    await new Promise((resolve) => setTimeout(resolve, 800));
    const status = (await socketCall(stack.socket, "GET", "/data/status")).body.data as {
      crashes: number;
      state: string;
    };
    expect(status).toMatchObject({ state: "ready", crashes: 1 });
    expect((await detail(id)).versions[0]?.text).toBe("failed");
    // The other files are still there, and the file is still found by its name.
    const found = await socketCall(stack.socket, "GET", "/data/files?q=broken");
    expect((found.body.files as { file_id: string }[]).map((row) => row.file_id)).toContain(id);
  }, 40_000);
});
