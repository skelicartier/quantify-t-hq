// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { snippetOf, termsOf } from "../../scripts/data/files/search";
import {
  inventedPdf,
  inventedPng,
  socketCall,
  textRead,
  uploadVia,
} from "../../scripts/data/files/walk-seed";
import { WALKER, startStack, type Stack } from "./helpers";

/** Search over names, tags, notes and the words inside, every folder, with snippets. */
let stack: Stack;
type Row = { file_id: string; title: string; match?: { where: string; snippet: string } };
const search = async (query: string, extra = "") =>
  (await socketCall(stack.socket, "GET", `/data/files?q=${encodeURIComponent(query)}${extra}`))
    .body as {
    files: Row[];
    total: number;
  };
const ids: Record<string, string> = {};

beforeAll(async () => {
  stack = await startStack({ modules: ["files"] });
  const folders = (await socketCall(stack.socket, "GET", "/data/folders")).body.folders as {
    folder_id: string;
    default_key: string | null;
  }[];
  const incorporation = folders.find((folder) => folder.default_key === "incorporation")!.folder_id;
  const pdf = await uploadVia(stack.socket, {
    name: "COI scan 2024.pdf",
    folder_id: incorporation,
    bytes: await inventedPdf([
      "Certificate of incorporation\nWalk Fund Private Limited, an invented company.\nIts registered office is at 7 Invented Road, Pune 411001.",
    ]),
    by: WALKER,
  });
  ids.pdf = (pdf.body.file as Row).file_id;
  await textRead(stack.socket, ids.pdf);
  const logo = await uploadVia(stack.socket, {
    name: "logo-dark.png",
    bytes: inventedPng("search"),
    by: WALKER,
  });
  ids.logo = (logo.body.file as Row).file_id;
  await socketCall(stack.socket, "POST", `/data/files/${ids.logo}/update`, {
    json: { tags: "brand, kestrel", notes: "Use on the dark deck cover only.", by: WALKER },
  });
}, 60_000);
afterAll(async () => {
  await stack.stop();
});

describe("searching files", () => {
  it("finds a PDF by the words inside (not its name), in every folder, with a snippet", async () => {
    const found = await search("registered office");
    expect(found.total).toBe(1);
    expect(found.files[0]?.file_id).toBe(ids.pdf);
    expect(found.files[0]?.match?.where).toBe("text");
    expect(found.files[0]?.match?.snippet).toContain("registered office is at 7 Invented Road");
  });

  it("finds by name, tag and note, saying where", async () => {
    expect((await search("logo-dark")).files[0]?.match?.where).toBe("name");
    expect((await search("KESTREL")).files[0]?.match).toEqual({
      where: "tags",
      snippet: "brand, kestrel",
    });
    const note = (await search("deck cover")).files[0]?.match;
    expect(note?.where).toBe("notes");
    expect(note?.snippet).toContain("dark deck cover");
  });

  it("needs every word, and can be kept to one folder", async () => {
    expect((await search("registered nowhere-word")).total).toBe(0);
    expect((await search("walk fund pune")).total).toBe(1);
    const inbox = (
      (await socketCall(stack.socket, "GET", "/data/files")).body.folder as { folder_id: string }
    ).folder_id;
    expect((await search("registered office", `&in=${inbox}`)).total).toBe(0);
  });

  it("makes terms and snippets as the list shows them", () => {
    expect(termsOf("  Registered  “Office” office ")).toEqual(["registered", "office"]);
    const long = `${"a ".repeat(100)}the registered office is here${" b".repeat(100)}`;
    const snippet = snippetOf(long, "registered office", ["registered", "office"]);
    expect(snippet.startsWith("…")).toBe(true);
    expect(snippet.endsWith("…")).toBe(true);
    expect(snippet).toContain("the registered office is here");
  });
});
