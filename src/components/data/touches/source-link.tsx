/**
 * A source, on screen a link reading "Source" (no site is named in the UI); on paper the
 * address is printed after it, as a citation.
 */
export function SourceLink({ href }: { href: string }) {
  return (
    <>
      <a className="text-link" href={href} target="_blank" rel="noreferrer">
        Source
      </a>
      <span className="hqdata-print-only hqdata-source-url">{href}</span>
    </>
  );
}
