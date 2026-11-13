/**
 * One message, written once, made out to each person.
 *
 * A field is a column of the list in braces: `{{first_name}}`, or `{Greeting}` as most
 * mail-merge templates write it. A field with a fallback, `{{first_name|there}}`, uses
 * the words after the bar for anyone whose cell is empty; a field without one leaves
 * that person out of the send rather than writing "Hi ," to them. The body is plain
 * words, as a person writes an email: a blank line starts a paragraph, an address becomes
 * a link, `[words](https://…)` is a link with words, `**words**` is bold. Nothing else is
 * read as anything. What a cell holds is never read as a field: it goes in once, as text.
 */

const FIELD = /\{\{\s*([^{}|]+?)\s*(?:\|([^{}]*))?\}\}|\{([A-Za-z][A-Za-z0-9_ ]{0,40})\}/g;
/** `[link]`, `[Company postal address]`: a blank a draft left to be filled in. */
const BLANK = /\[[^\]\n]{1,80}\](?!\()/g;

/** The list's rule for a column's key: "Fund size (USD)" is `fund_size_usd`. */
export function columnKey(raw: string): string {
  let text = raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40)
    .replace(/_+$/g, "");
  if (/^[0-9]/.test(text)) text = `c_${text}`;
  return text;
}

export type FieldUse = { key: string; fallback: string | null };

/** Every field a text asks for, in the order written, each key once. */
export function fieldsOf(...texts: string[]): FieldUse[] {
  const found = new Map<string, FieldUse>();
  for (const text of texts) {
    for (const match of text.matchAll(FIELD)) {
      const key = columnKey(match[1] ?? match[3] ?? "");
      const fallback = match[2] === undefined ? null : match[2].trim();
      const before = found.get(key);
      // A field is safe for everyone only when every use of it has a fallback.
      if (!before) found.set(key, { key, fallback });
      else if (fallback === null) found.set(key, { key, fallback: null });
    }
  }
  return [...found.values()];
}

/** The blanks a text still has, each once: mailed as they stand they read as a mistake. */
export function blanksIn(...texts: string[]): string[] {
  return [...new Set(texts.flatMap((text) => text.match(BLANK) ?? []))];
}

export type Filled = { text: string; missing: string[] };

/** The text with each field filled from `values`; `missing` names the empty ones. */
export function fill(text: string, values: Readonly<Record<string, string>>): Filled {
  const missing = new Set<string>();
  const filled = text.replace(FIELD, (...found: (string | undefined)[]) => {
    const [, double, fallback, single] = found;
    const key = columnKey(double ?? single ?? "");
    const value = (values[key] ?? "").trim();
    if (value) return value;
    if (fallback !== undefined) return fallback.trim();
    missing.add(key);
    return "";
  });
  return { text: filled, missing: [...missing] };
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const NAMED_LINK = /\[([^\]\n]{1,200})\]\((https?:\/\/[^\s)]{1,2000})\)/g;
const BARE_LINK = /https?:\/\/[^\s<>"']+/g;

/** A line of plain words as HTML: escaped, links linked, `**bold**` bold. */
function lineToHtml(line: string): string {
  const parts: string[] = [];
  let rest = line;
  // Named links first, so the address inside one is not linked a second time.
  while (rest) {
    NAMED_LINK.lastIndex = 0;
    const named = NAMED_LINK.exec(rest);
    if (!named) {
      parts.push(plainToHtml(rest));
      break;
    }
    parts.push(plainToHtml(rest.slice(0, named.index)));
    parts.push(`<a href="${escapeHtml(named[2]!)}">${escapeHtml(named[1]!)}</a>`);
    rest = rest.slice(named.index + named[0].length);
  }
  return parts.join("");
}

function plainToHtml(text: string): string {
  let html = "";
  let index = 0;
  for (const match of text.matchAll(BARE_LINK)) {
    // A full stop or comma after an address ends the sentence, not the address.
    const address = match[0].replace(/[.,;:!?)]+$/, "");
    const start = match.index ?? 0;
    html += boldToHtml(text.slice(index, start));
    html += `<a href="${escapeHtml(address)}">${escapeHtml(address)}</a>`;
    index = start + address.length;
  }
  return html + boldToHtml(text.slice(index));
}

function boldToHtml(text: string): string {
  return escapeHtml(text).replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>");
}

/** The words as the HTML part: paragraphs, line breaks, links. No styling of its own. */
export function wordsToHtml(words: string): string {
  const paragraphs = words
    .replace(/\r\n?/g, "\n")
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
  return paragraphs
    .map((paragraph) => `<p>${paragraph.split("\n").map(lineToHtml).join("<br>\n")}</p>`)
    .join("\n");
}

/** The words as the plain part: a named link reads "words (address)". */
export function wordsToText(words: string): string {
  return words
    .replace(/\r\n?/g, "\n")
    .replace(NAMED_LINK, "$1 ($2)")
    .replace(/\*\*([^*\n]+)\*\*/g, "$1")
    .trim();
}

export type Rendered = {
  subject: string;
  html: string;
  text: string;
  /** Fields this person has nothing for and the message gives no fallback. */
  missing: string[];
};

/** One person's message: subject, both parts, and what could not be filled. */
export function render(
  message: { subject: string; body: string; footer: string },
  values: Readonly<Record<string, string>>,
): Rendered {
  const subject = fill(message.subject, values);
  const body = fill(message.body, values);
  const footer = fill(message.footer, values);
  const words = footer.text.trim() ? `${body.text.trim()}\n\n${footer.text.trim()}` : body.text;
  return {
    // A subject is one line, whatever a cell held.
    subject: subject.text.replace(/\s+/g, " ").trim(),
    html: wordsToHtml(words),
    text: wordsToText(words),
    missing: [...new Set([...subject.missing, ...body.missing, ...footer.missing])],
  };
}
