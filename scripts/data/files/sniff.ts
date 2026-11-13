/**
 * What a stored file is, decided from its first bytes and never from the browser's type or
 * the extension alone: the extension only tells a CSV from other text and Word from Excel
 * inside a zip. What a file is decides how it is ever served: only a PDF and the four
 * picture formats may be shown in a page; everything else is handed over as a download.
 */

import type { FileKind } from "../../../src/lib/data/labels";
import { looksLikeText } from "../text";

export type Sniffed = { kind: FileKind; mime: string };

/** The types a browser may be handed to show inline; every other file is a download. */
export const INLINE_MIMES: ReadonlySet<string> = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
]);

const OFFICE: Record<string, Sniffed> = {
  docx: {
    kind: "word",
    mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  },
  xlsx: {
    kind: "excel",
    mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  },
  pptx: {
    kind: "slides",
    mime: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  },
};

function startsWith(bytes: Uint8Array, prefix: readonly number[], at = 0): boolean {
  if (bytes.length < at + prefix.length) return false;
  return prefix.every((byte, index) => bytes[at + index] === byte);
}

const ascii = (text: string): number[] => [...text].map((char) => char.charCodeAt(0));

export function extensionOf(name: string): string {
  const base = name.split("/").pop() ?? name;
  const dot = base.lastIndexOf(".");
  return dot > 0 ? base.slice(dot + 1).toLowerCase() : "";
}

/** The start of a text file, as lower-case text with any byte-order mark and blank space taken off. */
function textStart(head: Uint8Array): string {
  let text: string;
  if (head[0] === 0xff && head[1] === 0xfe) text = new TextDecoder("utf-16le").decode(head);
  else if (head[0] === 0xfe && head[1] === 0xff) text = new TextDecoder("utf-16be").decode(head);
  else text = new TextDecoder("utf-8").decode(head.subarray(0, 512));
  return text.replace(/^﻿/, "").trimStart().slice(0, 32).toLowerCase();
}

/**
 * The kind and type of a file from its first bytes (at least the first 8 KB when it has
 * them) and its name. HTML named `.pdf` is a web page, never a PDF.
 */
export function sniff(head: Uint8Array, name: string): Sniffed {
  if (startsWith(head, ascii("%PDF-"))) return { kind: "pdf", mime: "application/pdf" };
  if (startsWith(head, [0x89, 0x50, 0x4e, 0x47])) return { kind: "image", mime: "image/png" };
  if (startsWith(head, [0xff, 0xd8, 0xff])) return { kind: "image", mime: "image/jpeg" };
  if (startsWith(head, ascii("GIF8"))) return { kind: "image", mime: "image/gif" };
  if (startsWith(head, ascii("RIFF")) && startsWith(head, ascii("WEBP"), 8))
    return { kind: "image", mime: "image/webp" };
  const extension = extensionOf(name);
  if (startsWith(head, [0x50, 0x4b, 0x03, 0x04]))
    return OFFICE[extension] ?? { kind: "zip", mime: "application/zip" };
  if (head.length > 0 && looksLikeText(head)) {
    const start = textStart(head);
    if (start.startsWith("<!doctype html") || start.startsWith("<html"))
      return { kind: "web", mime: "text/html" };
    if (start.startsWith("<svg")) return { kind: "web", mime: "image/svg+xml" };
    if (start.startsWith("<?xml")) return { kind: "web", mime: "application/xml" };
    if (extension === "csv") return { kind: "csv", mime: "text/csv" };
    if (extension === "tsv") return { kind: "csv", mime: "text/tab-separated-values" };
    return { kind: "text", mime: "text/plain" };
  }
  return { kind: "other", mime: "application/octet-stream" };
}

/** How the bytes of a stored file are handed over: shown only when they are on the allow-list. */
export function servedType(mime: string): string {
  return INLINE_MIMES.has(mime) ? mime : "application/octet-stream";
}
