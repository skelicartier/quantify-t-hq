import Link from "next/link";

import { CompanyTabs } from "@/components/data/company/company-tabs";
import { DatesFields } from "@/components/data/company/dates-fields";
import {
  ClassFields,
  IdentityFields,
  RegistrationsFields,
  type ContactOption,
} from "@/components/data/company/fact-fields";
import { DataUnavailable } from "@/components/data/data-down";
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
import { FLAGS, FLAG_FACTS, FLAG_ORDER, NOT_ADVICE, STATES } from "@/lib/data/labels-company";
import { dataRead } from "@/lib/data/read";
import { formatDate } from "@/lib/format";
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
              <RegistrationsFields facts={facts} today={page.today} contacts={contacts} />
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
        </KeyValue>
      </RecordSection>

      <RecordSection id="company-checks" title="Checks">
        {page.checks.length === 0 ? (
          <p className="page-note">Nothing to check.</p>
        ) : (
          <div className="hqdata-company__checks">
            {page.checks.map((line) => (
              <Callout key={line} tone="attention" compact>
                {line}
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
