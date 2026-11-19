import Link from "next/link";
import { notFound } from "next/navigation";

import { DataUnavailable } from "@/components/data/data-down";
import { RuleLineNote } from "@/components/data/duties/rule-line";
import { IncidentClock } from "@/components/data/incidents/incident-clock";
import {
  IncidentFields,
  MomentFields,
  ReportFields,
} from "@/components/data/incidents/incident-fields";
import { CopyFields } from "@/components/data/meetings/copy-fields";
import { MailForm } from "@/components/mail/mail-form";
import { PageHeader } from "@/components/shell/page-header";
import { Callout } from "@/components/ui/callout";
import { DataTable } from "@/components/ui/data-table";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Popover } from "@/components/ui/popover";
import {
  Properties,
  Property,
  RecordGrid,
  RecordHeader,
  RecordSection,
} from "@/components/ui/record-shell";
import { RowAction } from "@/components/ui/row-action";
import { StatusPill } from "@/components/ui/status-pill";
import { Timestamp } from "@/components/ui/timestamp";
import { DATA_ROLE_LINE, requireData } from "@/lib/data/access";
import { readIncident, type IncidentPage } from "@/lib/data/api/incidents";
import { dayWords } from "@/lib/data/labels-company";
import { istParts, istWords, minutesBetween } from "@/lib/data/labels-duties";
import {
  INCIDENT_SEVERITIES,
  INCIDENT_STATUSES,
  NO_RULE_BOOK,
  REGISTER_ABOUT,
  REPORT_CHANNELS,
  REPORT_GIVES,
} from "@/lib/data/labels-security";
import { dataRead } from "@/lib/data/read";
import { requestNow } from "@/lib/request-time";

import {
  addCustomerAction,
  boardReportAction,
  certInReportAction,
  customerToldAction,
  incidentStatusAction,
  notReportableAction,
  updateIncidentAction,
  withdrawCustomerAction,
} from "../actions";
import "../../registers.css";

export const metadata = { title: "Incident" };
export const dynamic = "force-dynamic";

const BASE = "/data/registers/incidents";
const INCIDENT_ID = /^[A-Za-z0-9-]{1,64}$/;

const EVENT_WORDS: Record<string, string> = {
  logged: "Logged",
  changed: "Changed",
  contained: "Contained",
  resolved: "Resolved",
  closed: "Closed",
  reopened: "Reopened",
  "reported to CERT-In": "Report to CERT-In recorded",
  "not reportable": "Recorded as not reportable",
  "not reportable taken back": "Not reportable taken back",
  "reported to the Board": "Report to the Board recorded",
  "customer added": "Customer added",
  "customer told": "Customer told",
  "customer withdrawn": "Customer withdrawn",
};

export default async function IncidentRecordPage({
  params,
}: {
  params: Promise<{ incidentId: string }>;
}) {
  const { incidentId } = await params;
  const { allowed } = await requireData(`${BASE}/${incidentId}`);
  if (!INCIDENT_ID.test(incidentId)) notFound();
  const now = requestNow();
  const read = allowed ? await dataRead(() => readIncident(incidentId)) : null;
  if (!allowed || !read || !read.ok)
    return (
      <>
        <PageHeader title="Incident" />
        <div className="page-content">
          {!allowed || !read ? (
            <Callout tone="neutral">{DATA_ROLE_LINE}</Callout>
          ) : (
            !read.ok && <DataUnavailable failure={read} />
          )}
        </div>
      </>
    );
  return <IncidentRecord page={read.data} now={now} />;
}

/** The rule's hours, from the deadline it gave: "6 hours". */
function hoursBetween(from: string, to: string): string {
  const hours = Math.round(minutesBetween(from, to) / 60);
  return `${hours} ${hours === 1 ? "hour" : "hours"}`;
}

function StatusActions({ page }: { page: IncidentPage }) {
  const { incident, today, now } = page;
  const fields = { incident_id: incident.incident_id };
  const time = istParts(now).time;
  const move = (to: "contained" | "resolved" | "closed", label: string) => (
    <Popover key={to} label={label} align="start">
      <MailForm
        action={incidentStatusAction}
        fields={{ ...fields, to }}
        submitLabel={label}
        pendingLabel="Saving…"
      >
        <MomentFields
          prefix={`status-${to}`}
          dayName="day"
          timeName="time"
          dayLabel="On"
          timeLabel="At, India time"
          day={today}
          time={time}
          max={today}
        />
      </MailForm>
    </Popover>
  );
  const reopen = (
    <RowAction
      key="reopen"
      action={incidentStatusAction}
      fields={{ ...fields, to: "open" }}
      buttons={[{ label: "Reopen", className: "btn btn--small" }]}
      className="hqdata-registers__inline"
    />
  );
  if (incident.status === "open")
    return [
      move("contained", "Mark contained"),
      move("resolved", "Mark resolved"),
      move("closed", "Close"),
    ];
  if (incident.status === "contained")
    return [move("resolved", "Mark resolved"), move("closed", "Close")];
  if (incident.status === "resolved") return [move("closed", "Close"), reopen];
  return [reopen];
}

function IncidentRecord({ page, now }: { page: IncidentPage; now: number }) {
  const { incident } = page;
  const status = INCIDENT_STATUSES[incident.status];
  const fields = { incident_id: incident.incident_id };
  const aware = istParts(incident.aware_at);
  const occurred = incident.occurred_at ? istParts(incident.occurred_at) : null;
  return (
    <>
      <RecordHeader
        crumbs={[
          { href: "/data/registers", label: "Registers" },
          { href: BASE, label: "Incidents" },
        ]}
        title={`${incident.reference} ${incident.title}`}
        status={<StatusPill value={incident.status} label={status.label} tone={status.tone} />}
        readouts={[
          { label: "Reference", value: incident.reference },
          { label: "Noticed", value: istWords(incident.aware_at) },
          { label: "Severity", value: INCIDENT_SEVERITIES[incident.severity] },
        ]}
        actions={
          <>
            {incident.status !== "closed" && (
              <Popover label="Edit" variant="primary" align="start" width="wide">
                <MailForm
                  action={updateIncidentAction}
                  fields={fields}
                  submitLabel="Save"
                  pendingLabel="Saving…"
                  className="stack-form stack-form--tight"
                >
                  <IncidentFields
                    prefix="incident-edit"
                    today={page.today}
                    editing
                    values={{
                      ...incident,
                      aware_day: aware.day,
                      aware_time: aware.time,
                      occurred_day: occurred?.day ?? "",
                      occurred_time: occurred?.time ?? "",
                    }}
                  />
                </MailForm>
              </Popover>
            )}
            <StatusActions page={page} />
          </>
        }
      />
      <RecordGrid side={<Side page={page} />}>
        <div className="hqdata-incident">
          <p className="page-note">{REGISTER_ABOUT}</p>
          <RecordSection id="incident-clocks" title="The clocks">
            <CertIn page={page} />
            <Board page={page} />
            <Customers page={page} />
            <div className="hqdata-registers__block" data-part="report-gives">
              <h3 className="hqdata-registers__subheading">What the report gives</h3>
              <ul className="hqdata-registers__list">
                {REPORT_GIVES.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
              <p className="page-note">A list to work from, not CERT-In&rsquo;s own form.</p>
            </div>
            <div className="hqdata-registers__block" data-part="runbook">
              <h3 className="hqdata-registers__subheading">The runbook for this kind</h3>
              <p>
                {page.runbook ? (
                  <Link className="text-link" href={`/data/files/${page.runbook.file_id}`}>
                    {page.runbook.title}
                  </Link>
                ) : (
                  <>
                    No runbook for this kind yet.{" "}
                    <Link className="text-link" href={`${BASE}?runbooks=1`}>
                      Runbooks
                    </Link>
                  </>
                )}
              </p>
            </div>
          </RecordSection>
          <RecordSection id="incident-systems" title="What is affected">
            <p className="hqdata-registers__prose">
              {incident.systems || <span className="quiet">Not written yet</span>}
            </p>
          </RecordSection>
          <RecordSection id="incident-actions" title="What has been done">
            <p className="hqdata-registers__prose">
              {incident.actions || <span className="quiet">Not written yet</span>}
            </p>
          </RecordSection>
          <RecordSection id="incident-lessons" title="Lessons">
            <p className="hqdata-registers__prose">
              {incident.lessons || <span className="quiet">None written yet</span>}
            </p>
          </RecordSection>
          <RecordSection id="incident-activity" title="Activity">
            {page.events.length === 0 ? (
              <p className="timeline-empty">Nothing has happened yet.</p>
            ) : (
              <ol className="timeline">
                {page.events.map((event) => (
                  <li key={event.event_id} className="timeline__item">
                    <span className="timeline__kind">{EVENT_WORDS[event.verb] ?? event.verb}</span>
                    <div>
                      <p className="timeline__meta">
                        <span className="timeline__actor">{event.by.name}</span>
                        <Timestamp value={event.at} now={now} mode="relative" />
                      </p>
                      {event.detail && <p className="timeline__body">{event.detail}</p>}
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </RecordSection>
        </div>
      </RecordGrid>
    </>
  );
}

function ReportForms({ page, hours }: { page: IncidentPage; hours: number | null }) {
  const fields = { incident_id: page.incident.incident_id };
  return (
    <div className="hqdata-registers__acts">
      <Popover label="Record the report" variant="primary" align="start" width="wide">
        <MailForm
          action={certInReportAction}
          fields={fields}
          submitLabel="Record the report"
          pendingLabel="Recording…"
          className="stack-form stack-form--tight"
        >
          <ReportFields
            prefix="cert-in-report"
            today={page.today}
            time={istParts(page.now).time}
            hours={hours}
          />
          <CopyFields
            prefix="cert-in-report-copy"
            label="The report as sent"
            files={page.files}
            filesHere={page.files_here}
            folder="Security › Incidents"
          />
        </MailForm>
      </Popover>
      <Popover label="Not reportable" align="start" width="wide">
        <MailForm
          action={notReportableAction}
          fields={fields}
          submitLabel="Record it"
          pendingLabel="Saving…"
          className="stack-form stack-form--tight"
        >
          <Field id="not-reportable-why" label="Why it is not reportable">
            <Textarea
              id="not-reportable-why"
              name="why"
              rows={3}
              minLength={10}
              maxLength={500}
              required
            />
          </Field>
          <Field id="not-reportable-who" label="Who decided">
            <Input id="not-reportable-who" name="decided_by" maxLength={120} required />
          </Field>
          <Field id="not-reportable-on" label="On">
            <Input
              id="not-reportable-on"
              name="on"
              type="date"
              max={page.today}
              defaultValue={page.today}
            />
          </Field>
        </MailForm>
      </Popover>
    </div>
  );
}

function CertIn({ page }: { page: IncidentPage }) {
  const { incident } = page;
  const clock = incident.clock.cert_in;
  const report = incident.cert_in.report;
  const open = incident.status !== "closed";
  const hours =
    clock.state === "due" || clock.state === "overdue" || clock.state === "reported"
      ? Math.round(minutesBetween(incident.aware_at, clock.report_by) / 60)
      : null;
  const reportedLine = report ? (
    <p>
      Reported to CERT-In at {istWords(report.sent_at)}{" "}
      {REPORT_CHANNELS[report.channel].toLowerCase()}
      {report.reference ? (
        <>
          , reference <span className="mono">{report.reference}</span>
        </>
      ) : null}
      {clock.state === "reported"
        ? report.late_reason && clock.margin_words.includes("after")
          ? `, ${clock.margin_words}: ${report.late_reason}`
          : `, ${clock.margin_words}.`
        : "."}
      {page.report_file && (
        <>
          {" "}
          <Link className="text-link" href={`/data/files/${page.report_file.file_id}`}>
            The report as sent
          </Link>
        </>
      )}
    </p>
  ) : null;
  return (
    <div className="hqdata-registers__block" data-part="cert-in">
      <h3 className="hqdata-registers__subheading">CERT-In</h3>
      {clock.state === "due" && (
        <>
          <p>
            <strong>Report to CERT-In by {clock.report_by_words}.</strong>{" "}
            <IncidentClock deadline={clock.report_by} now={page.now} />
          </p>
          {open && <ReportForms page={page} hours={hours} />}
        </>
      )}
      {clock.state === "overdue" && (
        <>
          <Callout tone="danger">
            <strong>
              The {hoursBetween(incident.aware_at, clock.report_by)} ended at{" "}
              {clock.report_by_words}
            </strong>
            , <IncidentClock deadline={clock.report_by} now={page.now} />. Report now, and say why
            it is late when you record it.
          </Callout>
          {open && <ReportForms page={page} hours={hours} />}
        </>
      )}
      {clock.state === "reported" && reportedLine}
      {clock.state === "not_listed" && (
        <p>
          This kind is not on CERT-In&rsquo;s list, so the 6-hour clock does not run. Confirm with
          your lawyer if you are unsure.
        </p>
      )}
      {clock.state === "not_reportable" && (
        <>
          <p>
            Recorded as not reportable on {dayWords(clock.on)} by {clock.decided_by}: {clock.why}
          </p>
          {open && (
            <RowAction
              action={notReportableAction}
              fields={{ incident_id: incident.incident_id, undo: "1" }}
              buttons={[{ label: "Take it back", className: "btn btn--small" }]}
              className="hqdata-registers__inline"
            />
          )}
        </>
      )}
      {clock.state === "no_rule" && (
        <>
          <p className="hqdata-rule-line">{NO_RULE_BOOK}</p>
          {reportedLine}
          {open && !report && <ReportForms page={page} hours={null} />}
        </>
      )}
      <p>
        <RuleLineNote line={incident.clock.rules.cert_in} />
      </p>
    </div>
  );
}

function Board({ page }: { page: IncidentPage }) {
  const { incident } = page;
  const clock = incident.clock.board;
  const fields = { incident_id: incident.incident_id };
  return (
    <div className="hqdata-registers__block" data-part="board">
      <h3 className="hqdata-registers__subheading">The Data Protection Board</h3>
      {clock.state === "no_personal_data" && <p>No personal data is involved.</p>}
      {clock.state === "no_rule" && <p className="hqdata-rule-line">{NO_RULE_BOOK}</p>}
      {clock.state === "not_in_force" && (
        <p>
          The Data Protection Board&rsquo;s 72-hour report is not in force until{" "}
          {dayWords(clock.starts_on)}.
        </p>
      )}
      {(clock.state === "due" || clock.state === "overdue") && (
        <>
          <p>
            <strong>
              Detailed report to the Data Protection Board by {clock.report_by_words}.
            </strong>{" "}
            <IncidentClock deadline={clock.report_by} now={page.now} />. The Board and each person
            affected are also told without delay.
          </p>
          {incident.status !== "closed" && (
            <Popover label="Record the Board report" align="start" width="wide">
              <MailForm
                action={boardReportAction}
                fields={fields}
                submitLabel="Record the report"
                pendingLabel="Recording…"
                className="stack-form stack-form--tight"
              >
                <MomentFields
                  prefix="board-sent"
                  dayName="sent_day"
                  timeName="sent_time"
                  dayLabel="Sent on"
                  timeLabel="Sent at, India time"
                  day={page.today}
                  time={istParts(page.now).time}
                  max={page.today}
                />
                <Field id="board-reference" label="The Board's reference">
                  <Input id="board-reference" name="reference" maxLength={80} />
                </Field>
                <CopyFields
                  prefix="board-copy"
                  label="The report as sent"
                  files={page.files}
                  filesHere={page.files_here}
                  folder="Security › Incidents"
                />
              </MailForm>
            </Popover>
          )}
        </>
      )}
      {clock.state === "reported" && incident.board.report && (
        <p>
          Reported to the Data Protection Board at {istWords(incident.board.report.sent_at)},{" "}
          {clock.words}.
          {page.board_file && (
            <>
              {" "}
              <Link className="text-link" href={`/data/files/${page.board_file.file_id}`}>
                The report as sent
              </Link>
            </>
          )}
        </p>
      )}
      {incident.personal_data && (
        <p>
          <RuleLineNote line={incident.clock.rules.board} />
        </p>
      )}
    </div>
  );
}

function Customers({ page }: { page: IncidentPage }) {
  const { incident } = page;
  const fields = { incident_id: incident.incident_id };
  const open = incident.status !== "closed";
  const clockOf = new Map(incident.clock.customers.map((clock) => [clock.row_id, clock]));
  return (
    <div className="hqdata-registers__block" data-part="customers">
      <div className="hqdata-registers__tools">
        <h3 className="hqdata-registers__subheading">Customers</h3>
        {open && (
          <Popover label="Add a customer" align="end" width="wide">
            <MailForm
              action={addCustomerAction}
              fields={fields}
              submitLabel="Add the customer"
              pendingLabel="Adding…"
              className="stack-form stack-form--tight"
            >
              {page.waitlist.length > 0 && (
                <Field id="customer-firm" label="A firm on the waitlist">
                  <Select id="customer-firm" name="waitlist_entry_id" defaultValue="">
                    <option value="">None chosen</option>
                    {page.waitlist.map((entry) => (
                      <option key={entry.entry_id} value={entry.entry_id}>
                        {entry.firm}
                      </option>
                    ))}
                  </Select>
                </Field>
              )}
              <Field id="customer-name" label="Customer">
                <Input id="customer-name" name="name" maxLength={200} />
              </Field>
              <Field
                id="customer-hours"
                label="Hours in the contract"
                hint="The hours their contract gives you to tell them, from noticing it: 1 to 720."
              >
                <Input
                  id="customer-hours"
                  name="hours"
                  inputMode="numeric"
                  required
                  maxLength={3}
                />
              </Field>
            </MailForm>
          </Popover>
        )}
      </div>
      <DataTable
        caption="Customers to tell"
        columns={[
          { key: "customer", label: "Customer" },
          { key: "hours", label: "Hours in the contract" },
          { key: "tell", label: "Tell by" },
          { key: "told", label: "Told" },
        ]}
        columnMenu={false}
        scroll={false}
        isEmpty={incident.customers.length === 0}
        empty={<p className="page-note">No customer to tell is recorded.</p>}
      >
        {incident.customers.map((row) => {
          const clock = clockOf.get(row.row_id);
          return (
            <tr key={row.row_id} className={row.withdrawn ? "hqdata-registers__gone" : undefined}>
              <td>
                {row.name}
                {row.withdrawn && <span className="table-sub">Withdrawn</span>}
              </td>
              <td>{row.hours.toLocaleString("en")}</td>
              <td>
                {clock ? (
                  <>
                    {clock.tell_by_words}
                    {clock.state !== "told" && (
                      <span className="table-sub">
                        <IncidentClock deadline={clock.tell_by} now={page.now} />
                      </span>
                    )}
                  </>
                ) : (
                  "—"
                )}
              </td>
              <td>
                {row.told_at ? (
                  <>
                    {istWords(row.told_at)}
                    {clock && <span className="table-sub">{clock.words}</span>}
                    {row.how && <span className="table-sub">{row.how}</span>}
                  </>
                ) : row.withdrawn ? (
                  <span className="quiet">—</span>
                ) : (
                  open && (
                    <div className="hqdata-registers__acts">
                      <Popover label="Mark as told" align="end">
                        <MailForm
                          action={customerToldAction}
                          fields={{ ...fields, row_id: row.row_id }}
                          submitLabel="Mark as told"
                          pendingLabel="Saving…"
                        >
                          <MomentFields
                            prefix={`told-${row.row_id}`}
                            dayName="day"
                            timeName="time"
                            dayLabel="Told on"
                            timeLabel="At, India time"
                            day={page.today}
                            time={istParts(page.now).time}
                            max={page.today}
                          />
                          <Field id={`told-${row.row_id}-how`} label="How">
                            <Input id={`told-${row.row_id}-how`} name="how" maxLength={200} />
                          </Field>
                        </MailForm>
                      </Popover>
                      <RowAction
                        action={withdrawCustomerAction}
                        fields={{ ...fields, row_id: row.row_id }}
                        buttons={[{ label: "Withdraw", className: "btn btn--small btn--ghost" }]}
                      />
                    </div>
                  )
                )}
              </td>
            </tr>
          );
        })}
      </DataTable>
    </div>
  );
}

function Side({ page }: { page: IncidentPage }) {
  const { incident } = page;
  const when = (value: string | null) => (value ? istWords(value) : "Not yet");
  return (
    <Properties title="The incident">
      <Property label="Kind">{incident.kind_label}</Property>
      <Property label="On CERT-In's list">{incident.listed ? "Yes" : "No"}</Property>
      <Property label="Severity">{INCIDENT_SEVERITIES[incident.severity]}</Property>
      <Property label="Personal data">
        {incident.personal_data ? "Involved" : "Not involved"}
      </Property>
      <Property label="Happened">
        {incident.occurred_at ? istWords(incident.occurred_at) : "Not known"}
      </Property>
      <Property label="Noticed">{istWords(incident.aware_at)}</Property>
      <Property label="Contained">{when(incident.contained_at)}</Property>
      <Property label="Resolved">{when(incident.resolved_at)}</Property>
      <Property label="Closed">{when(incident.closed_at)}</Property>
      <Property label="Point of contact">
        {page.contact ? (
          page.contact.name
        ) : (
          <Link className="text-link" href="/data/company#company-cert-in">
            None recorded
          </Link>
        )}
      </Property>
    </Properties>
  );
}
