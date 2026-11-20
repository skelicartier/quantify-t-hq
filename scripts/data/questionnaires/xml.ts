/**
 * A small XML tokenizer for the four parts of a workbook HQ reads (ws-notes/security/spec.md
 * §9.3): elements, attributes and text, nothing more. A `<!DOCTYPE` or `<!ENTITY` anywhere
 * refuses the file, so no entity is ever declared or expanded; only the five named entities
 * and numeric character references are decoded. Namespace prefixes are ignored (local names
 * match). Comments, processing instructions and CDATA are passed over or read as text.
 * Pure: no file, no clock.
 */

export class XmlRefused extends Error {
  constructor(readonly words: string) {
    super(words);
    this.name = "XmlRefused";
  }
}

export const DECLARES_ENTITIES = "This workbook declares its own entities, which HQ does not read.";
export const DAMAGED = "This workbook is damaged: a part of it could not be read.";

export type XmlEvent =
  | { type: "open"; name: string; attrs: Readonly<Record<string, string>>; empty: boolean }
  | { type: "close"; name: string }
  | { type: "text"; text: string };

const NAMED: Readonly<Record<string, string>> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
};

/** "x:sheet" → "sheet". */
export function localName(name: string): string {
  const colon = name.indexOf(":");
  return colon >= 0 ? name.slice(colon + 1) : name;
}

function fromCode(code: number): string {
  if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) return "";
  if (code >= 0xd800 && code <= 0xdfff) return "";
  return String.fromCodePoint(code);
}

/** The five named entities and numeric references; anything else stays as written. */
export function decodeEntities(text: string): string {
  if (!text.includes("&")) return text;
  return text.replace(
    /&(#x[0-9a-fA-F]{1,6}|#[0-9]{1,7}|[a-zA-Z]{2,4});/g,
    (whole, body: string) => {
      if (body.startsWith("#x")) return fromCode(Number.parseInt(body.slice(2), 16));
      if (body.startsWith("#")) return fromCode(Number.parseInt(body.slice(1), 10));
      return NAMED[body] ?? whole;
    },
  );
}

/** OOXML's own escape in a string: `_x000D_` is that character; `_x005F_` is an underscore. */
export function ooxmlUnescape(text: string): string {
  if (!text.includes("_x")) return text;
  return text.replace(/_x([0-9A-Fa-f]{4})_/g, (_whole, hex: string) =>
    fromCode(Number.parseInt(hex, 16)),
  );
}

/** Refuses a part that declares a document type or an entity, before anything is read. */
export function refuseDeclarations(text: string): void {
  if (/<!DOCTYPE/i.test(text) || /<!ENTITY/i.test(text)) throw new XmlRefused(DECLARES_ENTITIES);
}

const NAME = /^[A-Za-z_][A-Za-z0-9_.:-]*/;

function attributesOf(source: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const pattern = /([A-Za-z_][A-Za-z0-9_.:-]*)\s*=\s*("([^"]*)"|'([^']*)')/g;
  for (const found of source.matchAll(pattern)) {
    const key = localName(found[1]!);
    if (key in attrs) continue;
    attrs[key] = decodeEntities(found[3] ?? found[4] ?? "");
  }
  return attrs;
}

/**
 * Walk the text, calling `on` for each element opened, closed, and each run of text.
 * `on` answers false to stop early. A part that ends inside a tag is damaged.
 */
export function scanXml(text: string, on: (event: XmlEvent) => boolean | void): void {
  refuseDeclarations(text);
  let at = 0;
  const length = text.length;
  while (at < length) {
    const lt = text.indexOf("<", at);
    if (lt < 0) {
      const rest = text.slice(at);
      if (rest && on({ type: "text", text: decodeEntities(rest) }) === false) return;
      return;
    }
    if (lt > at) {
      if (on({ type: "text", text: decodeEntities(text.slice(at, lt)) }) === false) return;
    }
    if (text.startsWith("<!--", lt)) {
      const end = text.indexOf("-->", lt + 4);
      if (end < 0) throw new XmlRefused(DAMAGED);
      at = end + 3;
      continue;
    }
    if (text.startsWith("<![CDATA[", lt)) {
      const end = text.indexOf("]]>", lt + 9);
      if (end < 0) throw new XmlRefused(DAMAGED);
      if (on({ type: "text", text: text.slice(lt + 9, end) }) === false) return;
      at = end + 3;
      continue;
    }
    if (text.startsWith("<?", lt)) {
      const end = text.indexOf("?>", lt + 2);
      if (end < 0) throw new XmlRefused(DAMAGED);
      at = end + 2;
      continue;
    }
    if (text.startsWith("<!", lt)) {
      // Any other declaration; DOCTYPE and ENTITY were refused above.
      const end = text.indexOf(">", lt + 2);
      if (end < 0) throw new XmlRefused(DAMAGED);
      at = end + 1;
      continue;
    }
    const end = tagEnd(text, lt + 1);
    if (end < 0) throw new XmlRefused(DAMAGED);
    const inside = text.slice(lt + 1, end);
    at = end + 1;
    if (inside.startsWith("/")) {
      const name = NAME.exec(inside.slice(1).trim())?.[0] ?? "";
      if (on({ type: "close", name: localName(name) }) === false) return;
      continue;
    }
    const name = NAME.exec(inside)?.[0];
    if (!name) throw new XmlRefused(DAMAGED);
    const empty = inside.trimEnd().endsWith("/");
    const attrs = attributesOf(
      inside.slice(name.length, empty ? inside.lastIndexOf("/") : undefined),
    );
    if (on({ type: "open", name: localName(name), attrs, empty }) === false) return;
    if (empty && on({ type: "close", name: localName(name) }) === false) return;
  }
}

/** The `>` that ends a tag opened at `from`, skipping quoted attribute values. */
function tagEnd(text: string, from: number): number {
  let quote = "";
  for (let index = from; index < text.length; index += 1) {
    const char = text[index]!;
    if (quote) {
      if (char === quote) quote = "";
      continue;
    }
    if (char === '"' || char === "'") quote = char;
    else if (char === ">") return index;
  }
  return -1;
}
