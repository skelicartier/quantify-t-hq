import Link from "next/link";

import { DataUnavailable } from "@/components/data/data-down";
import { RuleLineNote } from "@/components/data/duties/rule-line";
import { MarkFields } from "@/components/data/marks/mark-fields";
import { RegistersTabs } from "@/components/data/registers/registers-tabs";
import { MailForm } from "@/components/mail/mail-form";
import { PageHeader } from "@/components/shell/page-header";
import { Callout } from "@/components/ui/callout";
import { DataTable } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { Popover } from "@/components/ui/popover";
import { StatusPill } from "@/components/ui/status-pill";
import { DATA_ROLE_LINE, requireData } from "@/lib/data/access";
import { readMarks, type MarksPage } from "@/lib/data/api/marks";
import { MARKS_EMPTY, NO_RULE_BOOK, REGISTER_ABOUT } from "@/lib/data/labels-security";
import { dataRead } from "@/lib/data/read";
import { formatNumber } from "@/lib/format";

import { addMarkAction } from "./actions";
import "../registers.css";

export const metadata = { title: "Trademarks" };
export const dynamic = "force-dynamic";

const BASE = "/data/registers/marks";
const ABOUT = `Each mark once per class, with the Registry's status and the days its steps give: the reply to an examination report, the opposition window, the renewal. Your trademark agent files them; HQ keeps the dates. ${REGISTER_ABOUT}`;

const DEAD = new Set(["refused", "abandoned", "withdrawn", "removed"]);

export default async function MarksRegisterPage() {
  const { allowed } = await requireData(BASE);
  const read = allowed ? await dataRead(readMarks) : null;
  const data = read?.ok ? read.data : null;
  return (
    <>
      <PageHeader
        title="Trademarks"
        description={ABOUT}
        meta={
          data ? <span className="quiet">{formatNumber(data.counts.live)} live</span> : undefined
        }
        actions={
          data ? (
            <Popover label="Add a mark and class" variant="primary" align="end" width="wide">
              <MailForm
                action={addMarkAction}
                submitLabel="Add the mark"
                pendingLabel="Adding…"
                className="stack-form stack-form--tight"
              >
                <MarkFields prefix="mark-new" values={null} today={data.today} />
              </MailForm>
            </Popover>
          ) : undefined
        }
      />
      <div className="page-content">
        <RegistersTabs current="marks" />
        {!allowed || !read ? (
          <Callout tone="neutral">{DATA_ROLE_LINE}</Callout>
        ) : !read.ok ? (
          <DataUnavailable failure={read} />
        ) : (
          <div className="hqdata-marks">
            <p className="page-note">{REGISTER_ABOUT}</p>
            {!read.data.rules_here && <p className="hqdata-rule-line">{NO_RULE_BOOK}</p>}
            <MarksList page={read.data} />
            <Fee page={read.data} />
          </div>
        )}
      </div>
    </>
  );
}

function MarksList({ page }: { page: MarksPage }) {
  return (
    <section data-section="marks-list">
      {page.counts.all > 0 && (
        <div className="hqdata-registers__links">
          <a className="text-link" href={`${BASE}/export`}>
            Download as CSV
          </a>
        </div>
      )}
      <DataTable
        caption="Trademarks"
        columns={[
          { key: "mark", label: "Mark", width: "26%" },
          { key: "class", label: "Class" },
          { key: "application", label: "Application" },
          { key: "status", label: "Status" },
          { key: "next", label: "Next date" },
          { key: "agent", label: "Agent" },
        ]}
        columnMenu={false}
        isEmpty={page.marks.length === 0}
        empty={<EmptyState compact title="No marks" description={MARKS_EMPTY} />}
      >
        {page.marks.map((mark) => (
          <tr
            key={mark.mark_id}
            id={`mark-${mark.mark_id}`}
            className={DEAD.has(mark.status) ? "hqdata-registers__gone" : undefined}
          >
            <td>
              <Link className="table-title" href={`${BASE}/${mark.mark_id}`}>
                {mark.name}
              </Link>
            </td>
            <td>{mark.class_number}</td>
            <td className="mono">
              {mark.application_number || <span className="quiet">Not filed</span>}
            </td>
            <td>
              <StatusPill
                value={mark.status}
                label={mark.status_label}
                tone={
                  mark.status === "registered"
                    ? "live"
                    : DEAD.has(mark.status)
                      ? "neutral"
                      : mark.status === "objected" || mark.status === "opposed"
                        ? "attention"
                        : "neutral"
                }
              />
            </td>
            <td className="nowrap">
              {mark.next ? (
                <span className={mark.next.on < page.today ? "hqdata-registers__late" : undefined}>
                  {mark.next.words}
                </span>
              ) : (
                "None"
              )}
            </td>
            <td>{mark.agent || <span className="quiet">Not recorded</span>}</td>
          </tr>
        ))}
      </DataTable>
    </section>
  );
}

/** The startup fee: both readings until one is confirmed; nothing is compared before then. */
function Fee({ page }: { page: MarksPage }) {
  const labels = page.fee.readings.map((reading) => reading.label);
  return (
    <section data-section="marks-fee">
      <h2 className="hqdata-registers__heading">The filing fee for a recognised startup</h2>
      <p>
        {page.fee.rule ? (
          <RuleLineNote line={page.fee.rule} />
        ) : (
          <span className="hqdata-rule-line">
            The sources give {labels.join(" and ")}. {NO_RULE_BOOK}
          </span>
        )}
      </p>
      <ul className="hqdata-registers__list">
        {page.fee.readings.map((reading) => (
          <li key={reading.label}>
            <strong>{reading.label}</strong>: {reading.words}
            {reading.sources.map((source) => (
              <span key={source.url}>
                {" "}
                <a className="text-link" href={source.url} rel="noreferrer" target="_blank">
                  Source
                </a>
                <span className="hqdata-print-only"> ({source.url})</span>
              </span>
            ))}
          </li>
        ))}
      </ul>
    </section>
  );
}
