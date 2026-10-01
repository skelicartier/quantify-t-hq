import type { Letterhead as LetterheadData } from "@/lib/api/company";

/** "quantify terminal." — the wordmark, lowercase, the full stop heavier and in the brand purple. */
export function Wordmark({ size = "default" }: { size?: "default" | "small" }) {
  return (
    <span className={`wordmark wordmark--${size}`} translate="no">
      quantify terminal<span className="wordmark__dot">.</span>
    </span>
  );
}

/**
 * The company's letterhead: the wordmark alone on the left — no symbol beside it on any
 * document — and on the right the particulars the law asks a document to carry, worked
 * out by the service from the company page, so the screen, the printed page and the PDF
 * agree to the letter.
 */
export function Letterhead({ head }: { head: LetterheadData }) {
  const lines = [
    head.name_note,
    head.former_name,
    head.liability,
    head.numbers,
    head.address,
    head.contact,
  ].filter(Boolean);
  return (
    <div className="letterhead">
      <div className="letterhead__brand">
        <Wordmark />
      </div>
      <address className="letterhead__particulars">
        <strong>{head.name}</strong>
        {lines.map((line) => (
          <span key={line}>{line}</span>
        ))}
      </address>
    </div>
  );
}

/** The foot of a document: who issued it, in one line. */
export function letterheadIdentity(head: LetterheadData): string {
  return [head.name, head.name_note, head.liability, head.numbers, head.address, head.contact]
    .filter(Boolean)
    .join(" · ");
}
