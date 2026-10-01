import { Letterhead, letterheadIdentity } from "@/components/documents/letterhead";
import { PrintStamp } from "@/components/documents/print-stamp";
import type { Letterhead as LetterheadData } from "@/lib/api/company";

/** A CSS string literal: quotes and backslashes escaped, no line breaks, no way out of the style element. */
export function cssString(value: string): string {
  const escaped = value
    .replace(/[\r\n]+/g, " ")
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/</g, "\\3c ");
  return `"${escaped}"`;
}

type PrintFrameProps = { head: LetterheadData; printedBy: string };

/**
 * What a printed page carries that the screen does not: the letterhead and who printed
 * it over the first page, and in every page's foot the company's particulars and the
 * page number. Hidden on screen; the print style in globals.css lays the rest out.
 */
export function PrintFrame({ head, printedBy }: PrintFrameProps) {
  const identity = letterheadIdentity(head) || head.brand;
  const margin = `@media print {
  @page {
    @bottom-left { content: ${cssString(identity)}; }
  }
}`;
  return (
    <>
      <style>{margin}</style>
      <div className="print-head" aria-hidden="true">
        <Letterhead head={head} />
        <p className="print-head__stamp">
          <PrintStamp printedBy={printedBy} />
          {head.note ? ` · ${head.note}` : ""}
        </p>
      </div>
    </>
  );
}
