import Link from "next/link";

import { DataUnavailable } from "@/components/data/data-down";
import { AssuranceTabs } from "@/components/data/assurance/assurance-tabs";
import { AlertsImport } from "@/components/data/findings/alerts-import";
import { FindingFields, PenTestFields } from "@/components/data/findings/finding-fields";
import { WindowsSettings } from "@/components/data/findings/windows-settings";
import { CopyFields } from "@/components/data/meetings/copy-fields";
import { ControlRefNote, PracticeNote } from "@/components/data/security/control-ref";
import { MailForm } from "@/components/mail/mail-form";
import { PageHeader } from "@/components/shell/page-header";
import { Callout } from "@/components/ui/callout";
import { DataTable } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { Popover } from "@/components/ui/popover";
import { StatusPill } from "@/components/ui/status-pill";
import { SegmentedLinks } from "@/components/ui/toolbar";
import { DATA_ROLE_LINE, requireData } from "@/lib/data/access";
import { readFindings, type FindingsPage } from "@/lib/data/api/findings";
import { dayWords } from "@/lib/data/labels-company";
import {
  FINDINGS_EMPTY,
  FINDING_SOURCES,
  FINDING_SOURCE_KEYS,
  FINDING_STATUSES,
  NO_PROFILES,
  PEN_TESTS_EMPTY,
  shortensWords,
} from "@/lib/data/labels-assurance";
import { NOT_ADVICE } from "@/lib/data/labels-controls";
import { dataRead } from "@/lib/data/read";
import { formatNumber } from "@/lib/format";
import { firstSearchValue } from "@/lib/search-params";

import {
  addFindingAction,
  addPenTestAction,
  findingsSetupAction,
  importAlertsAction,
  previewAlertsAction,
} from "../actions";
import "../assurance.css";

export const metadata = { title: "Pen tests and findings" };
export const dynamic = "force-dynamic";

const BASE = "/data/assurance/findings";
const ABOUT = `Each penetration test and what it found, every finding with the day it is to be fixed by, and the code host's dependency alerts, imported from a file you save. ${NOT_ADVICE}`;

type Params = Record<string, string | string[] | undefined>;

export default async function FindingsPage({ searchParams }: { searchParams: Promise<Params> }) {
  const { allowed } = await requireData(BASE);
  const parameters = await searchParams;
  const view = firstSearchValue(parameters.view) === "all" ? "all" : "open";
  const asked = firstSearchValue(parameters.source) ?? "";
  const source = (FINDING_SOURCE_KEYS as readonly string[]).includes(asked) ? asked : "";
  const read = allowed ? await dataRead(() => readFindings(view, source)) : null;
  const data = read?.ok ? read.data : null;
  return (
    <>
      <PageHeader
        title="Pen tests and findings"
        description={ABOUT}
        meta={
          data ? (
            <span className="quiet">
              {formatNumber(data.counts.open)} open
              {data.counts.overdue > 0 ? ` · ${formatNumber(data.counts.overdue)} overdue` : ""}
            </span>
          ) : undefined
        }
        actions={data ? <Actions page={data} /> : undefined}
      />
      <div className="page-content">
        <AssuranceTabs current="findings" />
        {!allowed || !read ? (
          <Callout tone="neutral">{DATA_ROLE_LINE}</Callout>
        ) : !read.ok ? (
          <DataUnavailable failure={read} />
        ) : (
          <div className="hqdata-assurance">
            <p>
              <ControlRefNote refs={["a8_8", "a8_29", "a5_35"]} />
            </p>
            <PenTests page={read.data} />
            <Findings page={read.data} />
            <p className="page-note">{NOT_ADVICE}</p>
          </div>
        )}
      </div>
    </>
  );
}

function Actions({ page }: { page: FindingsPage }) {
  return (
    <>
      <Popover label="Record a pen test" align="end" width="wide">
        <MailForm action={addPenTestAction} submitLabel="Record it" pendingLabel="Recording…">
          <PenTestFields
            prefix="pen-test-new"
            today={page.today}
            values={{
              tester: "",
              kind: "third_party",
              empanelled: "",
              scope: "",
              started_on: null,
              report_on: null,
              notes: "",
            }}
          />
          <CopyFields
            prefix="pen-test-new"
            label="The report"
            files={page.files}
            filesHere={page.files_here}
            folder="Security › Pen tests"
          />
        </MailForm>
      </Popover>
      <Popover label="Add a finding" align="end" width="wide">
        <MailForm action={addFindingAction} submitLabel="Add it" pendingLabel="Adding…">
          <FindingFields
            prefix="finding-new"
            today={page.today}
            penTests={page.pen_tests}
            values={{
              title: "",
              severity: "medium",
              source: "self",
              found_on: page.today,
              pen_test_id: null,
              owner: "",
              description: "",
              evidence: "",
            }}
          />
        </MailForm>
      </Popover>
      <Popover label="Import dependency alerts" align="end" width="wide">
        <AlertsImport preview={previewAlertsAction} importAction={importAlertsAction} />
      </Popover>
    </>
  );
}

function PenTests({ page }: { page: FindingsPage }) {
  const next = page.pen_test;
  return (
    <section data-section="findings-pen-tests">
      <h2 className="hqdata-assurance__heading">Pen tests</h2>
      <p>
        {next.next_on ? (
          <>
            Next penetration test due{" "}
            <span className={next.next_on < page.today ? "hqdata-assurance__late" : undefined}>
              {dayWords(next.next_on)}
            </span>
            . {next.why}.{" "}
          </>
        ) : (
          `${next.why} `
        )}
        <PracticeNote practice="pen_test" {...(next.yours ? { amount: next.months } : {})} />
      </p>
      <DataTable
        caption="Pen tests"
        columns={[
          { key: "tester", label: "Tester", width: "22%" },
          { key: "kind", label: "Kind" },
          { key: "empanelled", label: "Empanelled" },
          { key: "scope", label: "Scope", width: "22%" },
          { key: "report", label: "Report" },
          { key: "retest", label: "Retest" },
          { key: "findings", label: "Findings" },
        ]}
        columnMenu={false}
        scroll={false}
        isEmpty={page.pen_tests.length === 0}
        empty={<EmptyState compact title="No pen tests" description={PEN_TESTS_EMPTY} />}
      >
        {page.pen_tests.map((test) => (
          <tr key={test.pen_test_id} id={`pen-test-${test.pen_test_id}`}>
            <td>
              <Link className="table-title" href={test.href}>
                {test.tester}
              </Link>
              {test.checks.map((check) => (
                <span key={check} className="hqdata-assurance__check">
                  {check}
                </span>
              ))}
            </td>
            <td>{test.kind_words}</td>
            <td>{test.empanelled_words}</td>
            <td>{test.scope || <span className="quiet">Not recorded</span>}</td>
            <td className="nowrap">
              {test.report_on ? dayWords(test.report_on) : <span className="quiet">Not yet</span>}
              {test.report_file && (
                <span className="table-sub">
                  <Link className="text-link" href={`/data/files/${test.report_file.file_id}`}>
                    {test.report_file.title}
                  </Link>
                </span>
              )}
            </td>
            <td className="nowrap">
              {test.retest.done_on ? (
                `Done ${dayWords(test.retest.done_on)}`
              ) : test.retest.planned_on ? (
                `Planned ${dayWords(test.retest.planned_on)}`
              ) : (
                <span className="quiet">None</span>
              )}
            </td>
            <td className="nowrap">
              {test.findings.all === 0
                ? "None"
                : `${formatNumber(test.findings.open)} open of ${formatNumber(test.findings.all)}`}
            </td>
          </tr>
        ))}
      </DataTable>
    </section>
  );
}

function Findings({ page }: { page: FindingsPage }) {
  const empty = page.counts.all === 0;
  const query = (view: string, source: string) => {
    const params = new URLSearchParams();
    if (view === "all") params.set("view", "all");
    if (source) params.set("source", source);
    const text = params.toString();
    return `${BASE}${text ? `?${text}` : ""}`;
  };
  const shortens = page.in_force ? shortensWords(page.in_force) : "";
  return (
    <section data-section="findings-list">
      <h2 className="hqdata-assurance__heading">Findings</h2>
      <WindowsSettings
        windows={page.windows}
        penTest={{ months: page.pen_test.months, yours: page.pen_test.yours }}
        action={findingsSetupAction}
      />
      <p className="page-note">{page.in_force === null ? NO_PROFILES : shortens}</p>
      {page.last_import && (
        <p className="page-note">
          Dependency alerts last imported {dayWords(page.last_import.on)}:{" "}
          {page.last_import.counts.alerts} read, {page.last_import.counts.new} new.
        </p>
      )}
      <div className="hqdata-assurance__tools">
        <SegmentedLinks
          label="Findings"
          items={[
            { href: query("open", page.source), label: "Open", current: page.view === "open" },
            { href: query("all", page.source), label: "All", current: page.view === "all" },
          ]}
        />
        <SegmentedLinks
          label="Where they came from"
          items={[
            { href: query(page.view, ""), label: "Every source", current: page.source === "" },
            ...FINDING_SOURCE_KEYS.map((key) => ({
              href: query(page.view, key),
              label: FINDING_SOURCES[key],
              current: page.source === key,
            })),
          ]}
        />
        {!empty && (
          <div className="hqdata-assurance__links">
            <a className="text-link" href={`${BASE}/export`}>
              Download as CSV
            </a>
          </div>
        )}
      </div>
      <DataTable
        caption="Findings"
        columns={[
          { key: "finding", label: "Finding", width: "34%" },
          { key: "severity", label: "Severity" },
          { key: "source", label: "Source" },
          { key: "found", label: "Found" },
          { key: "fix-by", label: "Fix by" },
          { key: "status", label: "Status" },
        ]}
        columnMenu={false}
        scroll={false}
        isEmpty={page.findings.length === 0}
        empty={
          empty ? (
            <EmptyState compact title="No findings" description={FINDINGS_EMPTY} />
          ) : (
            <EmptyState
              compact
              title="None here"
              description="Nothing open from this source. See them all under All."
            />
          )
        }
      >
        {page.findings.map((row) => {
          const status = FINDING_STATUSES[row.status];
          return (
            <tr key={row.finding_id} id={`finding-${row.finding_id}`}>
              <td>
                <Link className="table-title" href={row.href}>
                  {row.title}
                </Link>
                {row.fix.lines.map((line) => (
                  <span key={line} className="table-sub">
                    {line}
                  </span>
                ))}
              </td>
              <td>{row.severity_words}</td>
              <td>
                {row.source_words}
                {row.pen_test_tester && <span className="table-sub">{row.pen_test_tester}</span>}
              </td>
              <td className="nowrap">{dayWords(row.found_on)}</td>
              <td className={row.fix.state === "overdue" ? "hqdata-assurance__late" : undefined}>
                {row.fix.words}
              </td>
              <td>
                <StatusPill value={row.status} label={status.label} tone={status.tone} />
              </td>
            </tr>
          );
        })}
      </DataTable>
    </section>
  );
}
