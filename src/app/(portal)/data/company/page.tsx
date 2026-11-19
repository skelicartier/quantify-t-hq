import Link from "next/link";

import { CompanyTabs } from "@/components/data/company/company-tabs";
import { DatesFields } from "@/components/data/company/dates-fields";
import {
  BooksFields,
  CertInFields,
  ClassFields,
  IdentityFields,
  RegistrationsFields,
  type ContactOption,
} from "@/components/data/company/fact-fields";
import { DataUnavailable } from "@/components/data/data-down";
import { RuleLineNote } from "@/components/data/duties/rule-line";
import { MailForm } from "@/components/mail/mail-form";
import { PageHeader } from "@/components/shell/page-header";
import { Callout } from "@/components/ui/callout";
import { DataTable } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { KeyValue, KeyValueRow } from "@/components/ui/key-value";
import { Popover } from "@/components/ui/popover";
import { RecordSection } from "@/components/ui/record-shell";
import { Timestamp } from "@/components/ui/timestamp";
import { DATA_ROLE_LINE, requireData } from "@/lib/data/access";
import { readCompany, type CompanyFacts, type CompanyPage } from "@/lib/data/api/company";
import { readContacts } from "@/lib/data/api/contacts";
import { CONTACT_ROLES, labelOf } from "@/lib/data/labels";
import {
  BOOKS_ABOUT,
  BOOKS_ACCESS,
  CERT_IN_EMPTY,
  DPIIT_STATUSES,
  FLAGS,
  FLAG_FACTS,
  FLAG_ORDER,
  NOT_ADVICE,
  STATES,
  rupees,
} from "@/lib/data/labels-company";
import { dataRead } from "@/lib/data/read";
import { formatDate, formatNumber } from "@/lib/format";
import { requestNow } from "@/lib/request-time";

import { saveFactsAction } from "./actions";
import "./company.css";

export const metadata = { title: "Company" };
export const dynamic = "force-dynamic";

const BASE = "/data/company";
const ABOUT =
  "The company's own facts, kept on this computer: its numbers, its dates and how it is classed. Key dates works out the filings from them as suggestions, each to check with your CA or CS. The company particulars under System are not kept yet. This is a record to keep, not legal advice.";

const DECIDES_COLUMNS = [
  { key: "rule", label: "Rule" },
  { key: "worked", label: "Worked out" },
  { key: "from", label: "From" },
];

const CHANGE_COLUMNS = [
  { key: "when", label: "When" },
  { key: "who", label: "Who" },
  { key: "what", label: "What changed" },
];

/**
 * Company › Facts (company spec §6.7.2): the company's numbers, dates, how it is classed and
 * its registrations, each group edited on its own; the checks that compare them, as lines;
 * what the facts decide for Key dates; and every change, naming fields and never values.
 */
export default async function CompanyFactsPage() {
  const { allowed } = await requireData(BASE);
  const now = requestNow();
  const read = allowed ? await dataRead(readCompany) : null;
  const data = read?.ok ? read.data : null;
  const contacts = data?.contacts_here === true ? await dataRead(() => readContacts({})) : null;
  const options: ContactOption[] | null =
    contacts?.ok === true
      ? contacts.data.contacts
          .filter((contact) => !contact.archived)
          .map((contact) => ({
            contact_id: contact.contact_id,
            label: [contact.name, contact.firm, labelOf(CONTACT_ROLES, contact.role)]
              .filter(Boolean)
              .join(" · "),
          }))
      : null;
  return (
    <>
      <PageHeader
        title="Company"
        description={ABOUT}
        meta={
          data ? (
            <span className="quiet">
              {data.facts.incorporated_on
                ? `Incorporated ${formatDate(data.facts.incorporated_on)}`
                : "Facts not filled in"}
            </span>
          ) : undefined
        }
      />
      <div className="page-content">
        {!allowed || !read ? (
          <Callout tone="neutral">{DATA_ROLE_LINE}</Callout>
        ) : !read.ok ? (
          <DataUnavailable failure={read} />
        ) : (
          <Facts page={read.data} now={now} contacts={options} />
        )}
      </div>
    </>
  );
}

const CONFIRM_WHO = {
  CA: "CA",
  CS: "CS",
  lawyer: "lawyer",
  agent: "trademark agent",
  bank: "bank",
} as const;

/** The CERT-In point of contact (ws-notes/duties/spec.md §6.2), with its rule line. */
function CertInSection({ page }: { page: CompanyPage }) {
  const contact = page.facts.cert_in;
  const form = (
    <MailForm action={saveFactsAction} submitLabel="Save" pendingLabel="Saving…">
      <CertInFields
        facts={page.facts}
        today={page.today}
        files={page.files}
        filesHere={page.files_here}
      />
    </MailForm>
  );
  return (
    <RecordSection
      id="company-cert-in"
      title="CERT-In point of contact"
      actions={
        contact.name ? (
          <Popover label="Edit" align="end" width="wide">
            {form}
          </Popover>
        ) : undefined
      }
    >
      {contact.name ? (
        <KeyValue columns={2}>
          <KeyValueRow label="Name">{contact.name}</KeyValueRow>
          <KeyValueRow label="Designation">{known(contact.designation)}</KeyValueRow>
          <KeyValueRow label="Email">{known(contact.email)}</KeyValueRow>
          <KeyValueRow label="Mobile">{known(contact.mobile)}</KeyValueRow>
          <KeyValueRow label="Office phone">{known(contact.office_phone)}</KeyValueRow>
          <KeyValueRow label="Office address">
            {contact.address || "The registered office"}
          </KeyValueRow>
          <KeyValueRow label="Sent to CERT-In on">
            {contact.sent_on ? formatDate(contact.sent_on) : "Not sent"}
          </KeyValueRow>
          <KeyValueRow label="The message as sent">
            {page.cert_in_file ? (
              <Link className="text-link" href={`/data/files/${page.cert_in_file.file_id}`}>
                {page.cert_in_file.title}
              </Link>
            ) : (
              <span className="quiet">None kept</span>
            )}
          </KeyValueRow>
        </KeyValue>
      ) : (
        <EmptyState
          compact
          title="No point of contact"
          description={CERT_IN_EMPTY}
          action={
            <Popover label="Record the point of contact" align="start" width="wide">
              {form}
            </Popover>
          }
        />
      )}
      <p className="page-note hqdata-company__rule">
        <RuleLineNote line={page.rules.cert_in_contact} />{" "}
        <Link className="text-link" href="/data/registers/incidents">
          Log an incident
        </Link>
      </p>
    </RecordSection>
  );
}

function known(value: string | null | undefined, mono = false) {
  if (!value) return <span className="quiet">Not known</span>;
  return mono ? <span className="mono">{value}</span> : value;
}

function DatesForm({
  facts,
  today,
  prefix,
}: {
  facts: CompanyFacts;
  today: string;
  prefix: string;
}) {
  return (
    <MailForm action={saveFactsAction} submitLabel="Save" pendingLabel="Saving…">
      <DatesFields
        prefix={prefix}
        incorporatedOn={facts.incorporated_on}
        firstFyEnd={facts.first_fy_end}
        today={today}
      />
    </MailForm>
  );
}

function Facts({
  page,
  now,
  contacts,
}: {
  page: CompanyPage;
  now: number;
  contacts: readonly ContactOption[] | null;
}) {
  const { facts } = page;
  const state = facts.registered_state
    ? (STATES[facts.registered_state as keyof typeof STATES] ?? facts.registered_state)
    : "";
  const auditorOn = facts.auditor.appointed_on
    ? `Appointed on ${formatDate(facts.auditor.appointed_on)}${
        facts.auditor.appointed_by === "board"
          ? " by the board"
          : facts.auditor.appointed_by === "agm"
            ? " at an AGM"
            : ""
      }`
    : "";
  return (
    <div className="hqdata-company">
      <CompanyTabs current="facts" />
      {page.empty && (
        <EmptyState
          title="No facts recorded yet"
          description="Start with the incorporation day and the first financial year's end: the first AGM and the filings after it are worked out from them."
          action={
            <Popover label="Fill in the dates" variant="primary" align="start" width="wide">
              <DatesForm facts={facts} today={page.today} prefix="company-first" />
            </Popover>
          }
        />
      )}

      <RecordSection
        id="company-identity"
        title="Identity"
        actions={
          <Popover label="Edit" align="end" width="wide">
            <MailForm action={saveFactsAction} submitLabel="Save" pendingLabel="Saving…">
              <IdentityFields facts={facts} />
            </MailForm>
          </Popover>
        }
      >
        <KeyValue columns={2}>
          <KeyValueRow label="Legal name">{known(facts.legal_name)}</KeyValueRow>
          <KeyValueRow label="CIN">{known(facts.cin, true)}</KeyValueRow>
          <KeyValueRow label="PAN">{known(facts.pan, true)}</KeyValueRow>
          <KeyValueRow label="TAN">{known(facts.tan, true)}</KeyValueRow>
          <KeyValueRow label="GSTIN">{known(facts.gstin, true)}</KeyValueRow>
          <KeyValueRow label="Registered in">{known(state)}</KeyValueRow>
          <KeyValueRow label="Registered office">{known(facts.registered_office)}</KeyValueRow>
        </KeyValue>
      </RecordSection>

      <RecordSection
        id="company-dates"
        title="Dates"
        actions={
          <Popover label="Edit" align="end" width="wide">
            <DatesForm facts={facts} today={page.today} prefix="company-dates" />
          </Popover>
        }
      >
        <KeyValue columns={2}>
          <KeyValueRow label="Incorporated on">
            {facts.incorporated_on ? formatDate(facts.incorporated_on) : known("")}
          </KeyValueRow>
          <KeyValueRow label="First financial year ends">
            {facts.first_fy_end ? formatDate(facts.first_fy_end) : known("")}
          </KeyValueRow>
          <KeyValueRow label="Financial year">1 April to 31 March</KeyValueRow>
          <KeyValueRow label="Last AGM held">
            {page.last_agm
              ? `${formatDate(page.last_agm.on)}, ${
                  page.last_agm.from === "meetings" ? "from Meetings" : "typed on Key dates"
                }`
              : "None recorded"}
          </KeyValueRow>
        </KeyValue>
      </RecordSection>

      <RecordSection
        id="company-class"
        title="How the company is classed"
        actions={
          <Popover label="Edit" align="end" width="wide">
            <MailForm action={saveFactsAction} submitLabel="Save" pendingLabel="Saving…">
              <ClassFields facts={facts} />
            </MailForm>
          </Popover>
        }
      >
        <KeyValue columns={2}>
          {FLAG_ORDER.map((flag) => (
            <KeyValueRow key={flag} label={FLAG_FACTS[flag].label}>
              {FLAGS[facts.flags[flag]]}
              <span className="table-sub">{FLAG_FACTS[flag].hint}</span>
            </KeyValueRow>
          ))}
        </KeyValue>
      </RecordSection>

      <RecordSection
        id="company-registrations"
        title="Auditor, bank and registrations"
        actions={
          <Popover label="Edit" align="end" width="wide">
            <MailForm action={saveFactsAction} submitLabel="Save" pendingLabel="Saving…">
              <RegistrationsFields
                facts={facts}
                today={page.today}
                contacts={contacts}
                files={page.files}
                filesHere={page.files_here}
              />
            </MailForm>
          </Popover>
        }
      >
        <KeyValue columns={2}>
          <KeyValueRow label="Auditor">
            {facts.auditor.name || facts.auditor.firm_number ? (
              <>
                {known(facts.auditor.name)}
                {facts.auditor.firm_number && (
                  <span className="table-sub mono">{facts.auditor.firm_number}</span>
                )}
                {auditorOn && <span className="table-sub">{auditorOn}</span>}
              </>
            ) : (
              known("")
            )}
          </KeyValueRow>
          <KeyValueRow label="Authorised dealer bank">
            {facts.bank.name ? (
              <>
                {facts.bank.name}
                {facts.bank.branch && <span className="table-sub">{facts.bank.branch}</span>}
              </>
            ) : (
              known("")
            )}
          </KeyValueRow>
          <KeyValueRow label="FIRMS">
            {facts.firms.registered_on
              ? `Registered on ${formatDate(facts.firms.registered_on)}`
              : "Not registered"}
            {facts.firms.user_note && <span className="table-sub">{facts.firms.user_note}</span>}
          </KeyValueRow>
          <KeyValueRow label="DPIIT certificate">
            {facts.dpiit.number ? (
              <>
                <span className="mono">{facts.dpiit.number}</span>
                {facts.dpiit.recognised_on && (
                  <span className="table-sub">
                    recognised on {formatDate(facts.dpiit.recognised_on)}
                  </span>
                )}
              </>
            ) : (
              known("")
            )}
          </KeyValueRow>
          <KeyValueRow label="DPIIT recognition">
            {DPIIT_STATUSES[facts.dpiit.status]}
            {facts.dpiit.applied_on && (
              <span className="table-sub">Applied on {formatDate(facts.dpiit.applied_on)}</span>
            )}
            {facts.dpiit.valid_until && (
              <span className="table-sub">Valid until {formatDate(facts.dpiit.valid_until)}</span>
            )}
            <span className="table-sub">
              {page.dpiit_file ? (
                <Link className="text-link" href={`/data/files/${page.dpiit_file.file_id}`}>
                  {page.dpiit_file.title}
                </Link>
              ) : (
                "No certificate kept"
              )}
            </span>
          </KeyValueRow>
        </KeyValue>
      </RecordSection>

      <CertInSection page={page} />

      <RecordSection
        id="company-books"
        title="Books of record"
        actions={
          <Popover label="Edit" align="end" width="wide">
            <MailForm action={saveFactsAction} submitLabel="Save" pendingLabel="Saving…">
              <BooksFields facts={facts} today={page.today} contacts={contacts} />
            </MailForm>
          </Popover>
        }
      >
        <p className="page-note">{BOOKS_ABOUT}</p>
        <KeyValue columns={2}>
          <KeyValueRow label="Books software">{known(facts.books.software)}</KeyValueRow>
          <KeyValueRow label="Kept by">{known(facts.books.kept_by)}</KeyValueRow>
          <KeyValueRow label="The CA's access">{BOOKS_ACCESS[facts.books.access]}</KeyValueRow>
          <KeyValueRow label="Books start on">
            {facts.books.started_on ? formatDate(facts.books.started_on) : known("")}
          </KeyValueRow>
          <KeyValueRow label="Provider disclosed to the ROC">
            {FLAGS[facts.books.provider_disclosed]}
          </KeyValueRow>
          <KeyValueRow label="Where it is disclosed">
            {known(facts.books.disclosed_note)}
          </KeyValueRow>
          <KeyValueRow label="Free plan: revenue up to">
            {facts.books.free_revenue_limit === null
              ? "None typed"
              : rupees(facts.books.free_revenue_limit)}
          </KeyValueRow>
          <KeyValueRow label="Free plan: invoices a year">
            {facts.books.free_invoice_limit === null
              ? "None typed"
              : formatNumber(facts.books.free_invoice_limit)}
          </KeyValueRow>
        </KeyValue>
      </RecordSection>

      <RecordSection id="company-checks" title="Checks">
        {page.checks.length === 0 && page.duty_checks.length === 0 ? (
          <p className="page-note">Nothing to check.</p>
        ) : (
          <div className="hqdata-company__checks">
            {page.checks.map((line) => (
              <Callout key={line} tone="attention" compact>
                {line}
              </Callout>
            ))}
            {page.duty_checks.map((line) => (
              <Callout key={line.key} tone="attention" compact>
                <span data-check={line.key}>
                  {line.words}
                  {line.confirm ? ` Confirm with your ${CONFIRM_WHO[line.confirm]}.` : ""}
                </span>
              </Callout>
            ))}
          </div>
        )}
      </RecordSection>

      <RecordSection id="company-decides" title="What these facts decide">
        <DataTable
          caption="What the facts decide"
          columns={DECIDES_COLUMNS}
          columnMenu={false}
          scroll={false}
        >
          {page.decides.map((row) => (
            <tr key={row.rule}>
              <td>
                <span className="table-title">{row.rule}</span>
              </td>
              <td>{row.worked_out}</td>
              <td>{row.from}</td>
            </tr>
          ))}
        </DataTable>
        <p className="page-note">
          <Link className="text-link" href="/data/dates#dates-suggested">
            See the suggestions in Key dates
          </Link>
        </p>
      </RecordSection>

      <RecordSection id="company-changes" title="Changes">
        <DataTable
          caption="Changes to the facts"
          columns={CHANGE_COLUMNS}
          columnMenu={false}
          scroll={false}
          isEmpty={page.changes.length === 0}
          empty={<p className="page-note">No changes yet.</p>}
        >
          {page.changes.map((event) => (
            <tr key={event.event_id}>
              <td>
                <Timestamp value={event.at} now={now} mode="relative" />
              </td>
              <td>{event.by.name}</td>
              <td>{event.detail}</td>
            </tr>
          ))}
        </DataTable>
      </RecordSection>
      <p className="page-note">{NOT_ADVICE}</p>
    </div>
  );
}
