import Link from "next/link";

/**
 * A backup's check lines (ws-notes/security/spec.md §7.5). A partial restore's line ends
 * "Record it as a finding.", which links to Assurance › Pen tests and findings: in a copy
 * without Assurance the link leads to the not-found page, and the words still stand.
 */

const FINDING = "Record it as a finding.";
const FINDINGS_PAGE = "/data/assurance/findings";

export function BackupLines({ lines }: { lines: readonly string[] }) {
  if (lines.length === 0) return null;
  return (
    <ul className="hqdata-devices__lines" aria-label="What to look at">
      {lines.map((line) =>
        line.endsWith(FINDING) ? (
          <li key={line}>
            {line.slice(0, -FINDING.length)}
            <Link className="text-link" href={FINDINGS_PAGE}>
              {FINDING.slice(0, -1)}
            </Link>
            .
          </li>
        ) : (
          <li key={line}>{line}</li>
        ),
      )}
    </ul>
  );
}
