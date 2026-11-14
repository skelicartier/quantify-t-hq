import Link from "next/link";
import { notFound } from "next/navigation";

import { DueChip } from "@/components/crm/pills";
import { DirectorFields } from "@/components/data/company/director-fields";
import { DataUnavailable } from "@/components/data/data-down";
import { MailForm } from "@/components/mail/mail-form";
import { PageHeader } from "@/components/shell/page-header";
import { Callout } from "@/components/ui/callout";
import { DataTable } from "@/components/ui/data-table";
import { Checkbox, Field, Input, Select } from "@/components/ui/field";
import { Popover } from "@/components/ui/popover";
import {
  Properties,
  Property,
  RecordGrid,
  RecordHeader,
  RecordSection,
} from "@/components/ui/record-shell";
import { StatusPill } from "@/components/ui/status-pill";
import { Timestamp } from "@/components/ui/timestamp";
import { DATA_ROLE_LINE, requireData } from "@/lib/data/access";
import { readDirector, type DirectorPage } from "@/lib/data/api/company";
import { DATE_STATES } from "@/lib/data/labels";
import { CONTACT_FIELDS, DESIGNATIONS, NOT_ADVICE } from "@/lib/data/labels-company";
import { dataRead } from "@/lib/data/read";
import { formatDate } from "@/lib/format";
import { requestNow } from "@/lib/request-time";

import {
  ceaseDirectorAction,
  changeFiledAction,
  contactChangeAction,
  kycAction,
  updateDirectorAction,
} from "../../actions";
import "../../company.css";

export const metadata = { title: "Director" };
export const dynamic = "force-dynamic";

const DIRECTOR_ID = /^[A-Za-z0-9-]{1,64}$/;

const CHANGE_COLUMNS = [
  { key: "on", label: "Changed on" },
  { key: "what", label: "What" },
  { key: "from", label: "From" },
  { key: "to", label: "To" },
  { key: "by", label: "File by" },
  { key: "filed", label: "Filed" },
];

const DATE_COLUMNS = [
  { key: "what", label: "What", width: "46%" },
  { key: "due", label: "Due" },
  { key: "state", label: "State" },
];

const STATE_TONES = {
  coming_up: "neutral",
  in_progress: "attention",
  done: "live",
  not_for_us: "neutral",
  taken_back: "neutral",
} as const;

const VERBS: Record<string, string> = {
  added: "Added",
  changed: "Changed",
  ceased: "Ceased",
  "contact change": "Contact change",
  "contact change filed": "Contact change filed",
  "KYC filed": "KYC filed",
};

/**
 * One director (company spec §6.7.4): DIN, DSC and next DIR-3 KYC; the contact changes on
 * the MCA record with the day each must be filed by; this director's Key dates; and what
 * changed, when and by whom.
 */
export default async function DirectorRecordPage({
  params,
}: {
  params: Promise<{ directorId: string }>;
}) {
  const { directorId } = await params;
  const { allowed } = await requireData(`/data/company/directors/${directorId}`);
  if (!DIRECTOR_ID.test(directorId)) notFound();
  const now = requestNow();
  const read = allowed ? await dataRead(() => readDirector(directorId)) : null;
  if (!allowed || !read || !read.ok)
    return (
      <>
        <PageHeader title="Director" />
        <div className="page-content">
          {!allowed || !read ? (
            <Callout tone="neutral">{DATA_ROLE_LINE}</Callout>
          ) : (
            !read.ok && <DataUnavailable failure={read} />
          )}
        </div>
      </>
    );
  return <Director page={read.data} now={now} />;
}

function Director({ page, now }: { page: DirectorPage; now: number }) {
  const { director, today } = page;
  const fields = { director_id: director.director_id };
  const kyc = director.next_kyc;
  return (
    <div className="hqdata-director">
      <RecordHeader
        crumbs={[
          { href: "/data/company", label: "Company" },
          { href: "/data/company/directors", label: "Directors" },
        ]}
        title={director.name}
        status={
          director.ceased_on ? (
            <StatusPill
              value="ceased"
              label={`Ceased ${formatDate(director.ceased_on)}`}
              tone="neutral"
            />
          ) : (
            <StatusPill value="in_office" label="In office" tone="live" />
          )
        }
        readouts={[
          { label: "DIN", value: director.din || "Not allotted yet" },
          {
            label: "DSC expires",
            value: director.dsc.expires_on ? formatDate(director.dsc.expires_on) : "Not recorded",
          },
          {
            label: "Next DIR-3 KYC",
            value: !kyc ? "None" : kyc.due_on ? formatDate(kyc.due_on) : "Ask your CS",
          },
        ]}
        actions={
          <>
            <Popover label="Edit" variant="primary" align="start" width="wide">
              <MailForm
                action={updateDirectorAction}
                fields={fields}
                submitLabel="Save"
                pendingLabel="Saving…"
              >
                <DirectorFields
                  prefix="director-edit"
                  values={director}
                  today={today}
                  adding={false}
                />
              </MailForm>
            </Popover>
            {!director.ceased_on && (
              <>
                <Popover label="Record a contact change" align="start" width="wide">
                  <MailForm
                    action={contactChangeAction}
                    fields={fields}
                    submitLabel="Record the change"
                    pendingLabel="Recording…"
                  >
                    <Field id="change-field" label="What changed">
                      <Select id="change-field" name="field" defaultValue="email">
                        {Object.entries(CONTACT_FIELDS).map(([key, label]) => (
                          <option key={key} value={key}>
                            {label}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <Field id="change-to" label="New value">
                      <Input id="change-to" name="to" required maxLength={400} />
                    </Field>
                    <Field id="change-on" label="Changed on">
                      <Input
                        id="change-on"
                        name="changed_on"
                        type="date"
                        max={today}
                        defaultValue={today}
                        required
                      />
                    </Field>
                    <Checkbox
                      id="change-add-date"
                      name="add_date"
                      label="Add the DIR-3 KYC-Web filing to Key dates (30 days)"
                      defaultChecked
                    />
                  </MailForm>
                </Popover>
                <Popover label="Record a KYC filing" align="start" width="wide">
                  <MailForm
                    action={kycAction}
                    fields={fields}
                    submitLabel="Record it"
                    pendingLabel="Recording…"
                  >
                    <Field id="kyc-on" label="Filed on">
                      <Input
                        id="kyc-on"
                        name="filed_on"
                        type="date"
                        max={today}
                        defaultValue={today}
                        required
                      />
                    </Field>
                    <Field id="kyc-srn" label="SRN">
                      <Input id="kyc-srn" name="srn" className="mono" maxLength={40} />
                    </Field>
                  </MailForm>
                </Popover>
                <Popover label="Mark as ceased" align="start" width="wide">
                  <MailForm
                    action={ceaseDirectorAction}
                    fields={fields}
                    submitLabel="Mark as ceased"
                    pendingLabel="Saving…"
                  >
                    <Field
                      id="ceased-on"
                      label="Ceased on"
                      hint="A director who leaves stays here as a former director. File DIR-12 within 30 days (your CS does it)."
                    >
                      <Input
                        id="ceased-on"
                        name="ceased_on"
                        type="date"
                        max={today}
                        defaultValue={today}
                        required
                      />
                    </Field>
                  </MailForm>
                </Popover>
              </>
            )}
          </>
        }
      />
      <RecordGrid side={<Side page={page} />}>
        <RecordSection id="director-changes" title="Contact changes">
          <DataTable
            caption="Contact changes"
            columns={CHANGE_COLUMNS}
            columnMenu={false}
            isEmpty={page.changes.length === 0}
            empty={<p className="page-note">No contact changes recorded.</p>}
          >
            {page.changes.map((change) => (
              <tr key={change.change_id} id={`change-${change.change_id}`}>
                <td className="nowrap">{formatDate(change.changed_on)}</td>
                <td>{CONTACT_FIELDS[change.field]}</td>
                <td className="hqdata-director__value">
                  {change.from || <span className="quiet">None</span>}
                </td>
                <td className="hqdata-director__value">{change.to}</td>
                <td className="nowrap">
                  {change.filed ? (
                    formatDate(change.file_by)
                  ) : (
                    <DueChip due={change.file_by} today={today} />
                  )}
                </td>
                <td>
                  {change.filed ? (
                    <>
                      Filed
                      <span className="table-sub">
                        {formatDate(change.filed.on)}
                        {change.filed.srn ? ` · SRN ${change.filed.srn}` : ""}
                      </span>
                    </>
                  ) : (
                    <div className="hqdata-company__acts">
                      <Popover label="Record the filing" align="end">
                        <MailForm
                          action={changeFiledAction}
                          fields={{ ...fields, change_id: change.change_id }}
                          submitLabel="Record the filing"
                          pendingLabel="Recording…"
                        >
                          <Field id={`filed-on-${change.change_id}`} label="Filed on">
                            <Input
                              id={`filed-on-${change.change_id}`}
                              name="filed_on"
                              type="date"
                              max={today}
                              defaultValue={today}
                              required
                            />
                          </Field>
                          <Field id={`filed-srn-${change.change_id}`} label="SRN">
                            <Input
                              id={`filed-srn-${change.change_id}`}
                              name="srn"
                              className="mono"
                              maxLength={40}
                            />
                          </Field>
                        </MailForm>
                      </Popover>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </DataTable>
        </RecordSection>

        <RecordSection id="director-key-dates" title="Key dates">
          {!page.key_dates_here ? (
            <p className="page-note">Key dates is not set up here yet.</p>
          ) : (
            <DataTable
              caption="This director's key dates"
              columns={DATE_COLUMNS}
              columnMenu={false}
              isEmpty={page.key_dates.length === 0}
              empty={
                <p className="page-note">
                  None yet. Add this director&rsquo;s DSC and DIR-3 KYC from the suggestions in{" "}
                  <Link className="text-link" href="/data/dates#dates-suggested">
                    Key dates
                  </Link>
                  .
                </p>
              }
            >
              {page.key_dates.map((date) => (
                <tr key={date.date_id}>
                  <td>
                    <Link className="table-title" href={date.href}>
                      {date.title}
                    </Link>
                  </td>
                  <td className="nowrap">
                    {date.state === "coming_up" || date.state === "in_progress" ? (
                      <DueChip due={date.due_on} today={today} />
                    ) : (
                      formatDate(date.due_on)
                    )}
                  </td>
                  <td>
                    <StatusPill
                      value={date.state}
                      label={DATE_STATES[date.state]}
                      tone={STATE_TONES[date.state]}
                    />
                    {date.evidence.srn && (
                      <span className="table-sub">SRN {date.evidence.srn}</span>
                    )}
                  </td>
                </tr>
              ))}
            </DataTable>
          )}
        </RecordSection>

        <RecordSection id="director-activity" title="Activity">
          {page.events.length === 0 ? (
            <p className="timeline-empty">Nothing has happened yet.</p>
          ) : (
            <ol className="timeline">
              {page.events.map((event) => (
                <li key={event.event_id} className="timeline__item">
                  <span className="timeline__kind">{VERBS[event.verb] ?? "Change"}</span>
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
        <p className="page-note">{NOT_ADVICE}</p>
      </RecordGrid>
    </div>
  );
}

function Side({ page }: { page: DirectorPage }) {
  const { director } = page;
  const none = <span className="quiet">Not recorded</span>;
  return (
    <Properties title="Details">
      <Property label="Name">{director.name}</Property>
      <Property label="DIN" mono={Boolean(director.din)}>
        {director.din || "Not allotted yet"}
      </Property>
      <Property label="DIN allotted on">
        {director.din_allotted_on ? formatDate(director.din_allotted_on) : none}
      </Property>
      <Property label="Designation">{DESIGNATIONS[director.designation]}</Property>
      <Property label="Founder">{director.is_founder ? "Yes" : "No"}</Property>
      <Property label="Appointed on">
        {director.appointed_on ? formatDate(director.appointed_on) : none}
      </Property>
      {director.ceased_on && (
        <Property label="Ceased on">{formatDate(director.ceased_on)}</Property>
      )}
      <Property label="DSC expires on">
        {director.dsc.expires_on ? formatDate(director.dsc.expires_on) : none}
      </Property>
      <Property label="Where the DSC is kept">{director.dsc.kept || none}</Property>
      <Property label="Last DIR-3 KYC">
        {director.kyc.last_filed_on ? (
          <>
            {formatDate(director.kyc.last_filed_on)}
            {director.kyc.srn && <span className="table-sub">SRN {director.kyc.srn}</span>}
          </>
        ) : (
          none
        )}
      </Property>
      <Property label="Email on the MCA record">
        {director.mca.email ? (
          <a className="text-link hqdata-director__value" href={`mailto:${director.mca.email}`}>
            {director.mca.email}
          </a>
        ) : (
          none
        )}
      </Property>
      <Property label="Mobile on the MCA record">
        {director.mca.mobile ? (
          <a className="text-link" href={`tel:${director.mca.mobile.replace(/[^+0-9]/g, "")}`}>
            {director.mca.mobile}
          </a>
        ) : (
          none
        )}
      </Property>
      <Property label="Address on the MCA record">
        <span className="hqdata-director__value">{director.mca.address || none}</span>
      </Property>
    </Properties>
  );
}
