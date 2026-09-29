/**
 * A small, exact CSV reader for spreadsheet exports: RFC 4180 quoting (doubled quotes
 * inside quoted fields, commas and newlines inside quotes), CRLF or LF, a UTF-8 byte-order
 * mark tolerated, a trailing newline ignored. Nothing is inferred: every cell is text,
 * and the first row is the header.
 */

export type CsvTable = { header: string[]; rows: string[][] };

export function parseCsv(text: string): CsvTable {
  const source = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  let index = 0;
  while (index < source.length) {
    const char = source[index]!;
    if (quoted) {
      if (char === '"') {
        if (source[index + 1] === '"') {
          cell += '"';
          index += 2;
          continue;
        }
        quoted = false;
        index += 1;
        continue;
      }
      cell += char;
      index += 1;
      continue;
    }
    if (char === '"') {
      quoted = true;
      index += 1;
      continue;
    }
    if (char === ",") {
      row.push(cell);
      cell = "";
      index += 1;
      continue;
    }
    if (char === "\r" || char === "\n") {
      row.push(cell);
      cell = "";
      rows.push(row);
      row = [];
      index += char === "\r" && source[index + 1] === "\n" ? 2 : 1;
      continue;
    }
    cell += char;
    index += 1;
  }
  if (cell !== "" || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  const nonEmpty = rows.filter((cells) => cells.some((value) => value.trim() !== ""));
  const [header = [], ...body] = nonEmpty;
  return { header: header.map((name) => name.trim()), rows: body };
}

/**
 * The header a spreadsheet is likely to use for each of our fields, so the mapping form
 * can start with a sensible guess. Case and punctuation are ignored.
 */
export function guessMapping(
  header: readonly string[],
  fields: readonly { key: string; aliases: readonly string[] }[],
): Record<string, string> {
  const normalise = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, "");
  const mapping: Record<string, string> = {};
  for (const field of fields) {
    const wanted = new Set([field.key, ...field.aliases].map(normalise));
    const match = header.find((column) => wanted.has(normalise(column)));
    if (match) mapping[field.key] = match;
  }
  return mapping;
}

/** Rows as objects keyed by OUR field names, per the mapping; unmapped fields absent. */
export function applyMapping(
  table: CsvTable,
  mapping: Readonly<Record<string, string>>,
): Record<string, string>[] {
  const position = new Map(table.header.map((name, index) => [name, index]));
  return table.rows.map((cells) => {
    const record: Record<string, string> = {};
    for (const [field, column] of Object.entries(mapping)) {
      const index = position.get(column);
      if (index === undefined) continue;
      const value = (cells[index] ?? "").trim();
      if (value !== "") record[field] = value;
    }
    return record;
  });
}
