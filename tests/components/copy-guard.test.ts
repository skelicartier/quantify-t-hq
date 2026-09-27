import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Backend vocabulary never reaches the screen. A person on the desk reads "the
 * service", not "the API"; "your authenticator app", never "TOTP". The guard reads
 * JSX text the way the console's does: string literals inside markup, not
 * identifiers or imports.
 */

const FORBIDDEN = [
  /\bAccount API\b/,
  /\bAzure\b/,
  /\bblob\b/i,
  /\bUUID\b/,
  /\bTOTP\b/,
  /\bidempoten/i,
  /\bcorrelation id\b/i,
  /\bendpoint\b/i,
  /\bpayload\b/i,
  /\bSQL\b/,
];

function* componentFiles(directory: string): Generator<string> {
  for (const name of readdirSync(directory)) {
    const path = join(directory, name);
    if (statSync(path).isDirectory()) {
      yield* componentFiles(path);
    } else if (name.endsWith(".tsx")) {
      yield path;
    }
  }
}

/** The words a person can actually see: JSX text nodes and common copy props. */
function visibleCopy(source: string): string {
  const pieces: string[] = [];
  const textNodes = />([^<>{}]+)</g;
  let match: RegExpExecArray | null;
  while ((match = textNodes.exec(source)) !== null) {
    pieces.push(match[1]!);
  }
  const copyProps =
    /(?:label|title|description|hint|placeholder|emptyLabel|aria-label)=\{?"([^"]+)"/g;
  while ((match = copyProps.exec(source)) !== null) {
    pieces.push(match[1]!);
  }
  return pieces.join("\n");
}

describe("copy guard", () => {
  it("no backend word appears in user-visible copy", () => {
    const roots = [resolve(process.cwd(), "src/app"), resolve(process.cwd(), "src/components")];
    const offences: string[] = [];
    for (const root of roots) {
      for (const file of componentFiles(root)) {
        const copy = visibleCopy(readFileSync(file, "utf8"));
        for (const pattern of FORBIDDEN) {
          const hit = copy.match(pattern);
          if (hit) offences.push(`${file.replace(process.cwd(), ".")}: "${hit[0]}"`);
        }
      }
    }
    expect(offences, offences.join("\n")).toEqual([]);
  });
});
