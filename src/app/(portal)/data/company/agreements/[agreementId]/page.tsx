import Link from "next/link";
import { notFound } from "next/navigation";

import { DueChip } from "@/components/crm/pills";
import { AgreementFields } from "@/components/data/agreements/agreement-fields";
import { COPY_FOLDERS, endsWords } from "@/components/data/agreements/words";
import { DataUnavailable } from "@/components/data/data-down";
import { CopyFields } from "@/components/data/meetings/copy-fields";
import { MailForm } from "@/components/mail/mail-form";
import { PageHeader } from "@/components/shell/page-header";
import { Callout } from "@/components/ui/callout";
import { Field, Input, Select } from "@/components/ui/field";
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
import { readAgreement, type AgreementPage } from "@/lib/data/api/agreements";
import {
  AGREEMENT_STATUSES,
  AGREEMENT_TYPES,
  FLAG_WORDS,
  NOT_LEGAL_ADVICE,
  PARTY_KINDS,
  SIGNING,
  countWords,
  dayWords,
  rupees,
} from "@/lib/data/labels-registers";
import { dataRead } from "@/lib/data/read";
import { formatMoneyBy } from "@/lib/format";
import { requestNow } from "@/lib/request-time";

import {
  agreementStatusAction,
  attachAgreementCopyAction,
  noticeGivenAction,
  updateAgreementAction,
} from "../actions";
import "../agreements.css";

export const metadata = { title: "Agreement" };
export const dynamic = "force-dynamic";

const BASE = "/data/company/agreements";
const AGREEMENT_ID = /^[A-Za-z0-9-]{1,64}$/;

const EVENT_WORDS: Record<string, string> = {
  added: "Added",
  changed: "Changed",
  status: "Status",
  "signed copy": "Signed copy attached",
  "signing record": "Signing record attached",
  "notice given": "Notice given",
};

export default async function AgreementRecordPage({
  params,
}: {
  params: Promise<{ agreementId: string }>;
}) {
  const { agreementId } = await params;
  const { allowed } = await requireData(`${BASE}/${agreementId}`);
  if (!AGREEMENT_ID.test(agreementId)) notFound();
  const now = requestNow();
  const read = allowed ? await dataRead(() => readAgreement(agreementId)) : null;
  if (!allowed || !read || !read.ok)
    return (
      <>
        <PageHeader title="Agreement" />
        <div className="page-content">
          {!allowed || !read ? (
            <Callout tone="neutral">{DATA_ROLE_LINE}</Callout>
          ) : (
            !read.ok && <DataUnavailable failure={read} />
          )}
        </div>
      </>
    );
  return <AgreementRecord page={read.data} now={now} />;
}

const months = (count: number | null) =>
  count === null ? null : `${countWords(count)} ${count === 1 ? "month" : "months"}`;

function AgreementRecord({ page, now }: { page: AgreementPage; now: number }) {
  const { agreement, worked, today } = page;
  const status = AGREEMENT_STATUSES[agreement.status];
  const fields = { agreement_id: agreement.agreement_id };
  const given = agreement.renewal.notice_given;
  const notGiven = <span className="quiet">Not given</span>;
  return (
    <>
      <RecordHeader
        crumbs={[
          { href: "/data/company", label: "Company" },
          { href: BASE, label: "Agreements" },
        ]}
        title={agreement.title}
        status={
          <>
            <StatusPill
              value={agreement.type}
              label={AGREEMENT_TYPES[agreement.type]}
              tone="neutral"
            />
            <StatusPill value={agreement.status} label={status.label} tone={status.tone} />
          </>
        }
        readouts={[
          {
            label: "Effective",
            value: agreement.effective_on ? dayWords(agreement.effective_on) : "Not given",
          },
          { label: "Ends or renews", value: endsWords(worked) },
          {
            label: "Notice by",
            value: given
              ? `Given ${dayWords(given.on)}`
              : worked.notice_by
                ? dayWords(worked.notice_by)
                : "—",
          },
        ]}
        actions={
          <>
            <Popover label="Edit" variant="primary" align="start" width="wide">
              <MailForm
                action={updateAgreementAction}
                fields={fields}
                submitLabel="Save"
                pendingLabel="Saving…"
                className="stack-form stack-form--tight hqdata-agreement-form"
              >
                <AgreementFields
                  prefix="agreement-edit"
                  values={agreement}
                  pickers={page.pickers}
                  today={today}
                />
              </MailForm>
            </Popover>
            <Popover label="Change the status" align="start">
              <MailForm
                action={agreementStatusAction}
                fields={fields}
                submitLabel="Save"
                pendingLabel="Saving…"
              >
                <Field id="status-status" label="Status">
                  <Select id="status-status" name="status" defaultValue={agreement.status}>
                    {Object.entries(AGREEMENT_STATUSES).map(([key, item]) => (
                      <option key={key} value={key}>
                        {item.label}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field id="status-on" label="On">
                  <Input id="status-on" name="on" type="date" max={today} defaultValue={today} />
                </Field>
              </MailForm>
            </Popover>
            <Popover
              label={page.signed_file ? "Attach the signing record" : "Attach the signed copy"}
              align="start"
              width="wide"
            >
              <MailForm
                action={attachAgreementCopyAction}
                fields={fields}
                submitLabel="Attach it"
                pendingLabel="Attaching…"
              >
                <Field id="copy-kind" label="Which">
                  <Select
                    id="copy-kind"
                    name="kind"
                    defaultValue={page.signed_file ? "audit_trail" : "signed"}
                  >
                    <option value="signed">The signed copy</option>
                    <option value="audit_trail">The signing record</option>
                  </Select>
                </Field>
                <CopyFields
                  prefix="agreement-copy"
                  label="Copy"
                  files={page.files}
                  filesHere={page.files_here}
                  folder={COPY_FOLDERS}
                />
              </MailForm>
            </Popover>
            {agreement.renewal.auto && (
              <Popover label="Notice given" align="start">
                <MailForm
                  action={noticeGivenAction}
                  fields={fields}
                  submitLabel="Record it"
                  pendingLabel="Saving…"
                >
                  <Field id="notice-on" label="On">
                    <Input
                      id="notice-on"
                      name="on"
                      type="date"
                      max={today}
                      defaultValue={given?.on ?? today}
                    />
                  </Field>
                  <Field id="notice-note" label="Note">
                    <Input id="notice-note" name="note" maxLength={300} />
                  </Field>
                </MailForm>
              </Popover>
            )}
          </>
        }
      />
      <RecordGrid side={<Side page={page} />}>
        <p className="page-note">{NOT_LEGAL_ADVICE}</p>
        <RecordSection id="agreement-terms" title="Terms">
          <dl className="hqdata-terms">
            <dt>Status</dt>
            <dd>
              {status.label}
              {agreement.status_on ? `, ${dayWords(agreement.status_on)}` : ""}
            </dd>
            <dt>Effective</dt>
            <dd>{agreement.effective_on ? dayWords(agreement.effective_on) : notGiven}</dd>
            <dt>Signed</dt>
            <dd>{agreement.signed_on ? dayWords(agreement.signed_on) : notGiven}</dd>
            <dt>Term</dt>
            <dd>
              {agreement.term.ends_on
                ? `Ends ${dayWords(agreement.term.ends_on)}, as the agreement says`
                : agreement.term.months
                  ? `${months(agreement.term.months)}${worked.ends_on ? `: ends ${dayWords(worked.ends_on)}` : ""}`
                  : "Open-ended"}
            </dd>
            <dt>Renewal</dt>
            <dd>
              {agreement.renewal.auto ? (
                <>
                  Renews on its own
                  {worked.renews_on ? ` on ${dayWords(worked.renews_on)}` : ""}
                  {agreement.renewal.months ? `, for ${months(agreement.renewal.months)}` : ""}
                  {agreement.renewal.notice_days
                    ? `; notice ${countWords(agreement.renewal.notice_days)} days before`
                    : ""}
                  .
                  {given ? (
                    <span className="hqdata-terms__line">
                      Notice given {dayWords(given.on)}
                      {given.note ? `: ${given.note}` : ""}. It will not renew on{" "}
                      {worked.renews_on ? dayWords(worked.renews_on) : "its next day"}.
                    </span>
                  ) : (
                    worked.notice_by && (
                      <span className="hqdata-terms__line">
                        Give notice by <DueChip due={worked.notice_by} today={today} />
                      </span>
                    )
                  )}
                  {worked.renewed.map((day) => (
                    <span key={day} className="hqdata-terms__line">
                      Renewed on {dayWords(day)}
                    </span>
                  ))}
                </>
              ) : (
                "Does not renew on its own"
              )}
            </dd>
            <dt>Ending it early</dt>
            <dd>{agreement.terminate_for_convenience || notGiven}</dd>
            <dt>Governing law</dt>
            <dd>{agreement.governing_law || notGiven}</dd>
            <dt>Courts or arbitration</dt>
            <dd>{agreement.forum || notGiven}</dd>
            <dt>Value</dt>
            <dd>
              {agreement.value
                ? agreement.value.currency === "INR"
                  ? rupees(agreement.value.amount)
                  : formatMoneyBy({ USD: agreement.value.amount })
                : notGiven}
            </dd>
            <dt>How it was signed</dt>
            <dd>{SIGNING[agreement.signing]}</dd>
            <dt>Stamp duty</dt>
            <dd>
              {agreement.stamp
                ? [
                    agreement.stamp.state,
                    agreement.stamp.amount !== null ? rupees(agreement.stamp.amount) : "",
                    agreement.stamp.certificate_no,
                  ]
                    .filter(Boolean)
                    .join(" · ")
                : "Not recorded"}
            </dd>
            <dt>Related party or a director’s interest</dt>
            <dd>{agreement.related_party ? "Yes" : "No"}</dd>
            <dt>Covers personal data</dt>
            <dd>{agreement.personal_data ? "Yes" : "No"}</dd>
            <dt>IP clause</dt>
            <dd>{FLAG_WORDS[agreement.ip_clause]}</dd>
            <dt>Confidentiality clause</dt>
            <dd>{FLAG_WORDS[agreement.confidentiality_clause]}</dd>
            <dt>Signed copy</dt>
            <dd>
              {page.signed_file ? (
                <Link className="text-link" href={`/data/files/${page.signed_file.file_id}`}>
                  {page.signed_file.title}
                </Link>
              ) : (
                <span className={agreement.status === "signed" ? "hqdata-attention" : "quiet"}>
                  None attached
                </span>
              )}
            </dd>
            <dt>Signing record</dt>
            <dd>
              {page.audit_file ? (
                <Link className="text-link" href={`/data/files/${page.audit_file.file_id}`}>
                  {page.audit_file.title}
                </Link>
              ) : (
                <span className="quiet">None attached</span>
              )}
            </dd>
            <dt>Owner</dt>
            <dd>{agreement.owner || notGiven}</dd>
            <dt>Review on</dt>
            <dd>
              {agreement.review_on ? (
                dayWords(agreement.review_on)
              ) : (
                <span className="quiet">None set</span>
              )}
            </dd>
            <dt>Notes</dt>
            <dd className="hqdata-terms__notes">
              {agreement.notes || <span className="quiet">None</span>}
            </dd>
          </dl>
        </RecordSection>
        <RecordSection id="agreement-activity" title="Activity">
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
      </RecordGrid>
    </>
  );
}

function Side({ page }: { page: AgreementPage }) {
  return (
    <Properties title="Parties">
      {page.agreement.parties.map((party, index) => {
        const href = page.party_links[index] ?? null;
        return (
          <Property key={`${party.name}-${index}`} label={PARTY_KINDS[party.kind]}>
            {href ? (
              <Link className="text-link" href={href}>
                {party.name}
              </Link>
            ) : (
              party.name
            )}
            {(party.entity || party.country) && (
              <span className="quiet">
                {" "}
                · {[party.entity, party.country].filter(Boolean).join(", ")}
              </span>
            )}
          </Property>
        );
      })}
    </Properties>
  );
}
