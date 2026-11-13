/**
 * Invented files for the walk and the tests: PDFs made with `pdf-lib` (their words include
 * "registered office" and "Walk Fund"), pictures, CSVs of invented people on `.example`
 * domains, a text file with a `<script>` in it, a Word file, a web page. Nothing here is
 * real. Also the upload helper both use: begin, the parts, finish, over the service's socket.
 *
 * The worker never loads this file.
 */

import { request } from "node:http";
import { crc32, deflateSync } from "node:zlib";

import { PDFDocument, StandardFonts } from "pdf-lib";

import type { Staff } from "../protocol";
import { CRASH_MARK } from "./text-jobs";

export const PART = 3_145_728;

/** A PDF of invented words, a page per entry. */
export async function inventedPdf(
  pages: readonly string[],
  title = "Invented",
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(title);
  doc.setCreationDate(new Date("2026-11-01T00:00:00Z"));
  doc.setModificationDate(new Date("2026-11-01T00:00:00Z"));
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (const words of pages) {
    const page = doc.addPage([595, 842]);
    let y = 780;
    for (const line of words.split("\n")) {
      page.drawText(line, { x: 56, y, size: 12, font });
      y -= 18;
    }
  }
  return doc.save();
}

/** A PDF that stops the reader dead (test routes only): the walk's poison pill. */
export async function crashingPdf(tag: string): Promise<Uint8Array> {
  const bytes = await inventedPdf([`A malformed invented paper ${tag}.`]);
  return concat(bytes, new TextEncoder().encode(`\n%${CRASH_MARK} ${tag}\n`));
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  const typed = new TextEncoder().encode(type);
  out.set(typed, 4);
  out.set(data, 8);
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)) >>> 0);
  return out;
}

/** A small striped picture, with the tag written inside it so each one's bytes differ. */
export function inventedPng(tag: string, width = 96, height = 48): Uint8Array {
  const header = new Uint8Array(13);
  const view = new DataView(header.buffer);
  view.setUint32(0, width);
  view.setUint32(4, height);
  header.set([8, 2, 0, 0, 0], 8);
  const seed = [...tag].reduce((sum, char) => (sum * 31 + char.charCodeAt(0)) % 997, 7);
  const raw = new Uint8Array((width * 3 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const row = y * (width * 3 + 1);
    raw[row] = 0;
    for (let x = 0; x < width; x += 1) {
      const band = Math.floor((x + y + seed) / 12) % 2;
      raw[row + 1 + x * 3] = band ? 40 + (seed % 60) : 200;
      raw[row + 2 + x * 3] = band ? 90 : 160 + (seed % 60);
      raw[row + 3 + x * 3] = band ? 160 : 60;
    }
  }
  return concat(
    new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("tEXt", new TextEncoder().encode(`Comment\u0000Invented picture ${tag}`)),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", new Uint8Array()),
  );
}

/** Invented people in a CSV: a quoted comma and a quoted line break, so counting is tested. */
export function inventedCsv(rows: number, tag: string): Uint8Array {
  const lines = ["Name,Firm,Email,City,Note"];
  for (let index = 1; index <= rows; index += 1)
    lines.push(
      [
        `Person ${index} ${tag}`,
        index % 5 === 0 ? `"Walk Fund ${index}, LLP"` : `Walk Fund ${index}`,
        `p${index}.${tag.toLowerCase().replace(/[^a-z0-9]/g, "")}@fund${index}.example`,
        index % 2 ? "Mumbai" : "Pune",
        index % 7 === 0 ? `"Two lines\nof note"` : "",
      ].join(","),
    );
  return new TextEncoder().encode(`${lines.join("\r\n")}\r\n`);
}

export function inventedTxt(tag: string): Uint8Array {
  return new TextEncoder().encode(
    `Notes for the walk ${tag}.\n<script>alert("not run")</script>\nThis line is plain text and must show as text.\n`,
  );
}

export function inventedHtml(tag: string): Uint8Array {
  return new TextEncoder().encode(
    `<!doctype html><html><head><title>Invented ${tag}</title></head><body><script>document.title="ran"</script><p>Invented page.</p></body></html>\n`,
  );
}

export function inventedSvg(tag: string): Uint8Array {
  return new TextEncoder().encode(
    `<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><script>alert(1)</script><desc>${tag}</desc></svg>\n`,
  );
}

/** A stored zip holding the two parts a Word file starts with: enough to be one by its first bytes. */
export function inventedDocx(tag: string): Uint8Array {
  return storedZip([
    ["[Content_Types].xml", `<?xml version="1.0"?><Types><!-- ${tag} --></Types>`],
    ["word/document.xml", `<?xml version="1.0"?><document><body>Invented ${tag}</body></document>`],
  ]);
}

function storedZip(entries: readonly [string, string][]): Uint8Array {
  const parts: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const [name, text] of entries) {
    const nameBytes = new TextEncoder().encode(name);
    const data = new TextEncoder().encode(text);
    const crc = crc32(data) >>> 0;
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, data.length, true);
    local.setUint32(22, data.length, true);
    local.setUint16(26, nameBytes.length, true);
    parts.push(new Uint8Array(local.buffer), nameBytes, data);
    const entry = new DataView(new ArrayBuffer(46));
    entry.setUint32(0, 0x02014b50, true);
    entry.setUint16(4, 20, true);
    entry.setUint16(6, 20, true);
    entry.setUint32(16, crc, true);
    entry.setUint32(20, data.length, true);
    entry.setUint32(24, data.length, true);
    entry.setUint16(28, nameBytes.length, true);
    entry.setUint32(42, offset, true);
    central.push(new Uint8Array(entry.buffer), nameBytes);
    offset += 30 + nameBytes.length + data.length;
  }
  const size = central.reduce((sum, part) => sum + part.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, entries.length, true);
  end.setUint16(10, entries.length, true);
  end.setUint32(12, size, true);
  end.setUint32(16, offset, true);
  return concat(...parts, ...central, new Uint8Array(end.buffer));
}

export function concat(...parts: readonly Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

// ------------------------------------------------------------------ talking to the socket

export type SocketReply = { status: number; body: Record<string, unknown> };

export function socketCall(
  socketPath: string,
  method: "GET" | "POST",
  path: string,
  payload?: { json: unknown } | { bytes: Uint8Array },
): Promise<SocketReply> {
  const body =
    payload === undefined
      ? undefined
      : "json" in payload
        ? Buffer.from(JSON.stringify(payload.json))
        : Buffer.from(payload.bytes);
  return new Promise((resolve, reject) => {
    const outgoing = request(
      {
        socketPath,
        path,
        method,
        headers: body
          ? {
              "content-type":
                payload && "json" in payload ? "application/json" : "application/octet-stream",
              "content-length": body.length,
            }
          : {},
      },
      (response) => {
        const chunks: Buffer[] = [];
        response.on("data", (piece: Buffer) => chunks.push(piece));
        response.on("end", () => {
          let parsed: Record<string, unknown> = {};
          try {
            parsed = JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>;
          } catch {
            parsed = {};
          }
          resolve({ status: response.statusCode ?? 0, body: parsed });
        });
        response.on("error", reject);
      },
    );
    outgoing.on("error", reject);
    if (body) outgoing.write(body);
    outgoing.end();
  });
}

export type UploadInput = {
  name: string;
  bytes: Uint8Array;
  by: Staff;
  folder_id?: string;
  relative_path?: string;
  file_id?: string;
  note?: string;
  pin_file_id?: string;
  /** What to choose when it asks (a duplicate or a name taken). */
  choice?: "version" | "both" | "skip" | "anyway";
};

/** Begin, every part, finish, and the choice when one is asked for: the answer of the last step. */
export async function uploadVia(socketPath: string, input: UploadInput): Promise<SocketReply> {
  const begun = await socketCall(socketPath, "POST", "/data/uploads", {
    json: {
      name: input.name,
      size: input.bytes.length,
      folder_id: input.folder_id ?? "",
      relative_path: input.relative_path ?? input.name,
      ...(input.file_id ? { file_id: input.file_id } : {}),
      ...(input.note ? { note: input.note } : {}),
      ...(input.pin_file_id ? { pin_file_id: input.pin_file_id } : {}),
      by: input.by,
    },
  });
  if (begun.status !== 200) return begun;
  const uploadId = String(begun.body.upload_id);
  const parts = Number(begun.body.parts);
  for (let index = 0; index < parts; index += 1) {
    const part = await socketCall(socketPath, "POST", `/data/uploads/${uploadId}/parts/${index}`, {
      bytes: input.bytes.subarray(index * PART, (index + 1) * PART),
    });
    if (part.status !== 200) return part;
  }
  const finished = await socketCall(socketPath, "POST", `/data/uploads/${uploadId}/finish`, {
    json: { by: input.by },
  });
  const outcome = finished.body.outcome;
  if (input.choice && (outcome === "duplicate" || outcome === "name_taken"))
    return socketCall(socketPath, "POST", `/data/uploads/${uploadId}/resolve`, {
      json: { choice: input.choice, by: input.by },
    });
  return finished;
}

/** Wait until a file's words have been read (or found unreadable). */
export async function textRead(
  socketPath: string,
  fileId: string,
  timeoutMs = 20_000,
): Promise<string> {
  const end = Date.now() + timeoutMs;
  for (;;) {
    const answer = await socketCall(socketPath, "GET", `/data/files/${fileId}`);
    const file = answer.body.file as { preview?: { text_state?: string } } | undefined;
    const state = file?.preview?.text_state ?? "";
    if (!["pending", "reading", ""].includes(state)) return state;
    if (Date.now() > end) return state;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}
