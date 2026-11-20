import Link from "next/link";

import { DataTable } from "@/components/ui/data-table";
import { StatusPill } from "@/components/ui/status-pill";
import type { AssuranceSummary, SummaryArea } from "@/lib/data/api/assurance";
import { dayWords } from "@/lib/data/labels-company";
import {
  ATTENTION_WORDS,
  BUYERS_ASK,
  NOT_LOADED_ROW,
  SUMMARY_AREAS,
  SUMMARY_MODULES,
} from "@/lib/data/labels-assurance";
import { CONTROL_SOURCES, CONTROLS_CHECKED, OWNER_LEFT_OUT } from "@/lib/data/labels-controls";

import "@/components/data/security/control-ref.css";

type Row = {
  key: string;
  title: string;
  words: string;
  attention: boolean;
  href: string;
  absent: boolean;
};

/** The rows of one area, in the Summary's module order: each module's lines, or "Not loaded here". */
export function summaryRows(summary: AssuranceSummary, area: SummaryArea): Row[] {
  const lines = summary.areas.find((item) => item.area === area)?.lines ?? [];
  const rows: Row[] = [];
  for (const mod of SUMMARY_MODULES) {
    if (mod.area !== area) continue;
    const absent = summary.absent.find((item) => item.name === mod.name);
    if (absent) {
      rows.push({
        key: `${mod.name}:absent`,
        title: absent.title,
        words: absent.words,
        attention: false,
        href: absent.href,
        absent: true,
      });
      continue;
    }
    for (const line of lines.filter((item) => item.key.startsWith(`${mod.name}:`)))
      rows.push({ ...line, absent: false });
  }
  // A line from a module the list does not name still shows, last.
  for (const line of lines)
    if (!rows.some((row) => row.key === line.key)) rows.push({ ...line, absent: false });
  return rows;
}

/**
 * Assurance › Summary's three tables (ws-notes/security/spec.md §8.6): Systems, Assurance and
 * Buyers, each row what it is, where it stands in a sentence and a link to open it; what wants
 * him carries the pill "Look at this" (words, never colour alone); a module not loaded here is
 * its row "Not loaded here". For an Admin, the Owner-only line under Systems. Then what buyers
 * usually ask for, each with where HQ keeps it.
 */
export function SummaryTables({ summary, owner }: { summary: AssuranceSummary; owner: boolean }) {
  return (
    <>
      {(Object.keys(SUMMARY_AREAS) as SummaryArea[]).map((area) => (
        <section key={area} data-section={`summary-${area}`}>
          <h2 className="hqdata-assurance__heading">{SUMMARY_AREAS[area]}</h2>
          <DataTable
            caption={SUMMARY_AREAS[area]}
            columns={[
              { key: "what", label: "What", width: "24%" },
              { key: "stands", label: "Where it stands" },
              { key: "open", label: <span className="sr-only">Open</span>, width: "10%" },
            ]}
            columnMenu={false}
            scroll={false}
          >
            {summaryRows(summary, area).map((row) => (
              <tr key={row.key} id={`summary-${row.key.replace(/[^a-z0-9-]/gi, "-")}`}>
                <td>
                  <span className="table-title">{row.title}</span>
                </td>
                <td>
                  {row.absent ? (
                    <span className="quiet">{NOT_LOADED_ROW}</span>
                  ) : (
                    <>
                      {row.words}
                      {row.attention && (
                        <span className="hqdata-assurance__attention">
                          <StatusPill value="attention" label={ATTENTION_WORDS} tone="attention" />
                        </span>
                      )}
                    </>
                  )}
                </td>
                <td>
                  <Link className="text-link" href={row.href}>
                    Open
                  </Link>
                </td>
              </tr>
            ))}
          </DataTable>
          {area === "systems" && !owner && <p className="page-note">{OWNER_LEFT_OUT}</p>}
        </section>
      ))}
      <section data-section="summary-buyers-ask">
        <h2 className="hqdata-assurance__heading">What buyers usually ask for</h2>
        <ul className="hqdata-assurance__list">
          {BUYERS_ASK.map((item) => (
            <li key={item.words}>
              {item.words}:{" "}
              <Link className="text-link" href={item.href}>
                {item.where}
              </Link>
            </li>
          ))}
        </ul>
        <p>
          <span className="hqdata-control-ref">
            From a buyers&apos; due-diligence list, page 40.{" "}
            <a
              className="text-link"
              href={CONTROL_SOURCES.ia.url}
              target="_blank"
              rel="noopener noreferrer"
              title={CONTROL_SOURCES.ia.name}
            >
              Source
            </a>
            <span className="hqdata-control-ref__url"> ({CONTROL_SOURCES.ia.url})</span>, checked{" "}
            {dayWords(CONTROLS_CHECKED)}
          </span>
        </p>
      </section>
    </>
  );
}
