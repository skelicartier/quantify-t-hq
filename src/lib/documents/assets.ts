import "server-only";

import { readFile } from "node:fs/promises";
import { join } from "node:path";

/**
 * The typefaces and the mark every PDF carries, read once per server instance. The
 * fonts are static instances of the portal's faces (Space Grotesk, JetBrains Mono) and
 * the wordmark's (Poppins), cut to Latin, currency and punctuation — SIL OFL, licences
 * beside them in `assets/pdf-fonts`. `next.config.ts` traces the folder into the export
 * route so a deployment carries it.
 */
export type DocumentAssets = {
  text: Uint8Array;
  textBold: Uint8Array;
  mono: Uint8Array;
  monoBold: Uint8Array;
  wordmark: Uint8Array;
  wordmarkDot: Uint8Array;
  mark: Uint8Array;
};

let cached: Promise<DocumentAssets> | null = null;

export function loadDocumentAssets(): Promise<DocumentAssets> {
  if (!cached) {
    const fonts = join(process.cwd(), "assets", "pdf-fonts");
    const read = async (path: string) => new Uint8Array(await readFile(path));
    cached = Promise.all([
      read(join(fonts, "SpaceGrotesk-Regular.ttf")),
      read(join(fonts, "SpaceGrotesk-SemiBold.ttf")),
      read(join(fonts, "JetBrainsMono-Regular.ttf")),
      read(join(fonts, "JetBrainsMono-SemiBold.ttf")),
      read(join(fonts, "Poppins-SemiBold.ttf")),
      read(join(fonts, "Poppins-Bold.ttf")),
      read(join(process.cwd(), "public", "brand", "mark-light.png")),
    ]).then(([text, textBold, mono, monoBold, wordmark, wordmarkDot, mark]) => ({
      text,
      textBold,
      mono,
      monoBold,
      wordmark,
      wordmarkDot,
      mark,
    }));
    // A failed read is not remembered: the next export tries again.
    cached.catch(() => {
      cached = null;
    });
  }
  return cached;
}
