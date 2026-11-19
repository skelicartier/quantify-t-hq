import Link from "next/link";

import { DataUnavailable } from "@/components/data/data-down";
import { RuleLineNote } from "@/components/data/duties/rule-line";
import { IncidentFields } from "@/components/data/incidents/incident-fields";
import { RegistersTabs } from "@/components/data/registers/registers-tabs";
import { MailForm } from "@/components/mail/mail-form";
import { PageHeader } from "@/components/shell/page-header";
import { ButtonLink } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { DataTable } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Select } from "@/components/ui/field";
import { Popover } from "@/components/ui/popover";
import { RowAction } from "@/components/ui/row-action";
import { StatusPill } from "@/components/ui/status-pill";
import { SegmentedLinks } from "@/components/ui/toolbar";
import { DATA_ROLE_LINE, requireData } from "@/lib/data/access";
import {
  readIncidents,
  readRunbooks,
  type IncidentRow,
  type IncidentsPage,
  type RunbooksPage,
} from "@/lib/data/api/incidents";
import { istParts, istWords } from "@/lib/data/labels-duties";
import {
  CERT_IN_REACH,
  INCIDENTS_EMPTY,
  INCIDENT_STATUSES,
  NO_RULE_BOOK,
  REGISTER_ABOUT,
  RUNBOOKS_LINE,
} from "@/lib/data/labels-security";
import { dataRead } from "@/lib/data/read";
import { formatNumber } from "@/lib/format";
import { firstSearchValue } from "@/lib/search-params";

import { logIncidentAction, setRunbookAction } from "./actions";
import "../registers.css";

export const metadata = { title: "Incidents" };
export const dynamic = "force-dynamic";

const BASE = "/data/registers/incidents";
const ABOUT = `Each incident with the minute it was noticed, in India time: a listed one is reported to CERT-In within 6 hours, and the report is recorded here, never sent from here. ${REGISTER_ABOUT}`;

type Params = Record<string, string | string[] | undefined>;

export default async function IncidentsPage({ searchParams }: { searchParams: Promise<Params> }) {
  const { allowed } = await requireData(BASE);
  const parameters = await searchParams;
  const view = firstSearchValue(parameters.view) === "all" ? "all" : "open";
  const runbooks = firstSearchValue(parameters.runbooks) === "1";
  const read = allowed ? await dataRead(() => readIncidents(view)) : null;
  const books = allowed && runbooks ? await dataRead(readRunbooks) : null;
  const data = read?.ok ? read.data : null;
  return (
    <>
      <PageHeader
        title="Incidents"
        description={ABOUT}
        meta={
          data ? (
            <span className="quiet">
              {formatNumber(data.counts.open)} open
              {data.counts.report_due > 0
                ? ` · ${formatNumber(data.counts.report_due)} to report`
                : ""}
            </span>
          ) : undefined
        }
        actions={
          data ? (
            <Popover label="Log an incident" variant="primary" align="end" width="wide">
              <MailForm
                action={logIncidentAction}
                submitLabel="Log it"
                pendingLabel="Logging…"
                className="stack-form stack-form--tight"
              >
                <IncidentFields
                  prefix="incident-new"
                  today={data.today}
                  values={{
                    title: "",
                    kind: "",
                    severity: "medium",
                    personal_data: false,
                    summary: "",
                    systems: "",
                    actions: "",
                    aware_day: data.today,
                    aware_time: istParts(data.now).time,
                  }}
                />
              </MailForm>
            </Popover>
          ) : undefined
        }
      />
      <div className="page-content">
        <RegistersTabs current="incidents" />
        {!allowed || !read ? (
          <Callout tone="neutral">{DATA_ROLE_LINE}</Callout>
        ) : !read.ok ? (
          <DataUnavailable failure={read} />
        ) : (
          <div className="hqdata-incidents">
            <WrongNow page={read.data} />
            {runbooks ? (
              books?.ok ? (
                <Runbooks page={books.data} />
              ) : (
                books && !books.ok && <DataUnavailable failure={books} />
              )
            ) : (
              <IncidentsList page={read.data} />
            )}
            <p className="page-note">{REGISTER_ABOUT}</p>
          </div>
        )}
      </div>
    </>
  );
}

/** "If something is wrong now": where to report, who is the contact, the rule. */
function WrongNow({ page }: { page: IncidentsPage }) {
  return (
    <section className="hqdata-registers__now" data-section="incidents-now">
      <h2 className="hqdata-registers__heading">If something is wrong now</h2>
      <p>{CERT_IN_REACH}</p>
      <p>
        {page.contact ? (
          `Your point of contact: ${page.contact.name}${page.contact.designation ? `, ${page.contact.designation}` : ""}.`
        ) : (
          <>
            No point of contact is recorded.{" "}
            <Link className="text-link" href="/data/company#company-cert-in">
              Add one on the Company record.
            </Link>
          </>
        )}
      </p>
      <p>
        {page.rule ? (
          <RuleLineNote line={page.rule} />
        ) : (
          <span className="hqdata-rule-line">{NO_RULE_BOOK}</span>
        )}
      </p>
    </section>
  );
}

/** The CERT-In cell: when it is due, when it went, or why no clock runs. */
function certInCell(row: Pick<IncidentRow, "cert_in" | "reported_at">): string {
  const clock = row.cert_in;
  if (clock.state === "due") return `Report by ${clock.report_by_words}`;
  if (clock.state === "overdue") return `Overdue since ${clock.report_by_words}`;
  if (clock.state === "reported") return `Reported ${clock.sent_words}`;
  if (clock.state === "not_listed") return "Not on the list";
  if (clock.state === "not_reportable") return "Not reportable";
  return row.reported_at ? `Reported ${istWords(row.reported_at)}` : "Not worked out";
}

function IncidentsList({ page }: { page: IncidentsPage }) {
  const empty = page.counts.all === 0;
  return (
    <section data-section="incidents-list">
      <div className="hqdata-registers__tools">
        <SegmentedLinks
          label="Incidents"
          items={[
            {
              href: BASE,
              label: `Open ${formatNumber(page.counts.open)}`,
              current: page.view === "open",
            },
            {
              href: `${BASE}?view=all`,
              label: `All ${formatNumber(page.counts.all)}`,
              current: page.view === "all",
            },
          ]}
        />
        <div className="hqdata-registers__links">
          <Link className="text-link" href={`${BASE}?runbooks=1`}>
            Runbooks
          </Link>
          {!empty && (
            <a className="text-link" href={`${BASE}/export`}>
              Download as CSV
            </a>
          )}
        </div>
      </div>
      <p className="hqdata-print-only">
        {page.view === "all" ? "Every incident" : "Open incidents"}
      </p>
      <DataTable
        caption="Incidents"
        columns={[
          { key: "reference", label: "Reference" },
          { key: "what", label: "What happened", width: "28%" },
          { key: "kind", label: "Kind" },
          { key: "noticed", label: "Noticed" },
          { key: "cert-in", label: "CERT-In" },
          { key: "status", label: "Status" },
        ]}
        columnMenu={false}
        isEmpty={page.incidents.length === 0}
        empty={
          empty ? (
            <EmptyState compact title="No incidents" description={INCIDENTS_EMPTY} />
          ) : (
            <EmptyState
              compact
              title="No open incidents"
              description="Every incident is closed. See them under All."
            />
          )
        }
      >
        {page.incidents.map((row) => {
          const status = INCIDENT_STATUSES[row.status];
          return (
            <tr key={row.incident_id} id={`incident-${row.incident_id}`}>
              <td className="mono nowrap">
                <Link className="text-link" href={`${BASE}/${row.incident_id}`}>
                  {row.reference}
                </Link>
              </td>
              <td>
                <Link className="table-title" href={`${BASE}/${row.incident_id}`}>
                  {row.title}
                </Link>
              </td>
              <td>{row.kind_label}</td>
              <td className="nowrap">{row.aware_words}</td>
              <td
                className={row.cert_in.state === "overdue" ? "hqdata-registers__late" : undefined}
              >
                {certInCell(row)}
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

function Runbooks({ page }: { page: RunbooksPage }) {
  return (
    <section data-section="incidents-runbooks">
      <div className="hqdata-registers__tools">
        <h2 className="hqdata-registers__heading">Runbooks</h2>
        <ButtonLink href={BASE} size="small" variant="ghost">
          Back to the incidents
        </ButtonLink>
      </div>
      <p className="page-note">{RUNBOOKS_LINE}</p>
      <DataTable
        caption="Runbooks"
        columns={[
          { key: "kind", label: "Kind", width: "45%" },
          { key: "runbook", label: "Runbook" },
        ]}
        columnMenu={false}
      >
        {page.runbooks.map((row) => (
          <tr key={row.kind} id={`runbook-${row.kind}`}>
            <td>{row.label}</td>
            <td>
              {row.file ? (
                <Link className="text-link" href={`/data/files/${row.file.file_id}`}>
                  {row.file.title}
                </Link>
              ) : (
                <span className="quiet">None chosen</span>
              )}
              {page.files_here ? (
                <Popover label="Choose a file" align="end">
                  <MailForm
                    action={setRunbookAction}
                    fields={{ kind: row.kind }}
                    submitLabel="Save"
                    pendingLabel="Saving…"
                  >
                    <Field id={`runbook-${row.kind}-file`} label="From Files">
                      <Select
                        id={`runbook-${row.kind}-file`}
                        name="file_id"
                        defaultValue={row.file?.file_id ?? ""}
                      >
                        <option value="">None</option>
                        {page.files.map((file) => (
                          <option key={file.file_id} value={file.file_id}>
                            {file.folder ? `${file.folder} › ${file.title}` : file.title}
                          </option>
                        ))}
                      </Select>
                    </Field>
                  </MailForm>
                </Popover>
              ) : (
                <span className="table-sub">Files is not set up here.</span>
              )}
              {row.file && (
                <RowAction
                  action={setRunbookAction}
                  fields={{ kind: row.kind, file_id: "" }}
                  buttons={[{ label: "Clear", className: "btn btn--small btn--ghost" }]}
                  className="hqdata-registers__inline"
                  sentLabel="Cleared."
                />
              )}
            </td>
          </tr>
        ))}
      </DataTable>
    </section>
  );
}
