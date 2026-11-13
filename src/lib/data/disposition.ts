/**
 * How a stored file's bytes are handed to the browser. Only a PDF and the four picture
 * formats are ever shown inline, judged from the type the service sniffed from the first
 * bytes; everything else (CSV, text, HTML, SVG, Office files) is a download of plain
 * bytes, and CSV and text are shown escaped in the page instead.
 *
 * The file name follows RFC 6266 and 5987: an ASCII fallback for every browser, then the
 * exact name, percent-encoded, so a header value never carries a control character.
 */

export const INLINE_TYPES: ReadonlySet<string> = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
]);

export type Disposition = "inline" | "attachment";

/** `inline; filename="Resume.pdf"; filename*=UTF-8''R%C3%A9sum%C3%A9.pdf` */
export function contentDisposition(kind: Disposition, name: string): string {
  const exact =
    name
      .replace(/\p{Cc}/gu, "")
      .replace(/[\\/]/g, "_")
      .trim() || "file";
  const ascii =
    exact
      .normalize("NFKD")
      .replace(/\p{M}/gu, "")
      .replace(/[^A-Za-z0-9._ ()-]/g, "_") || "file";
  const encoded = encodeURIComponent(exact).replace(
    /['()*]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `${kind}; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}

/**
 * What a response carries for a file, given the type the service sent and whether the
 * page asked to show it: inline only when asked and on the allow-list.
 */
export function servedAs(
  type: string,
  wanted: Disposition,
): { type: string; disposition: Disposition } {
  const clean = type.split(";")[0]!.trim().toLowerCase();
  if (wanted === "inline" && INLINE_TYPES.has(clean)) return { type: clean, disposition: "inline" };
  return {
    type: INLINE_TYPES.has(clean) ? clean : "application/octet-stream",
    disposition: "attachment",
  };
}
