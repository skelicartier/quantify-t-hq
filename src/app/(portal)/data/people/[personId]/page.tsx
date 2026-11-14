import { notFound } from "next/navigation";

import { DueChip } from "@/components/crm/pills";
import { DataUnavailable } from "@/components/data/data-down";
import {
  AccessFields,
  DocumentFields,
  EvaluationFields,
  PersonFields,
} from "@/components/data/people/person-fields";
import { datesWords } from "@/components/data/people/people-words";
import { SourceLink } from "@/components/data/touches/source-link";
import { MailForm } from "@/components/mail/mail-form";
import { PageHeader } from "@/components/shell/page-header";
import { Callout } from "@/components/ui/callout";
import { DataTable } from "@/components/ui/data-table";
import { Field, Input, Select } from "@/components/ui/field";
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
import {
  readPerson,
  type AccessGrant,
  type PeopleEvent,
  type Person,
  type PersonCopy,
  type PersonPage,
  type StipendPayment,
  type StipendPeriod,
} from "@/lib/data/api/people";
import {
  DOCUMENT_KINDS,
  ENGAGEMENT_KINDS,
  EVALUATIONS,
  EVALUATION_OUTCOMES,
  OFFBOARDING_LINE,
  OFFBOARDING_SOURCE,
  PAYS_ON_WORDS,
  PERSON_STATES,
  STIPEND_CURRENCIES,
  TAX_HINT,
  TAX_LINE,
  periodWords,
  shortDay,
} from "@/lib/data/labels-people";
import { notOwnerLine, requireDataOwner } from "@/lib/data/owner";
import { dataRead } from "@/lib/data/read";
import { formatDate, formatMoneyBy, formatNumber } from "@/lib/format";
import { requestNow } from "@/lib/request-time";

import {
  accessStateAction,
  addDocumentAction,
  cancelOffboardingAction,
  grantAccessAction,
  recordCertificateAction,
  recordEvaluationAction,
  recordPaymentAction,
  startOffboardingAction,
  updatePersonAction,
  withdrawPaymentAction,
} from "../actions";
import "../people.css";

export const metadata = { title: "Person" };
export const dynamic = "force-dynamic";

const PERSON_ID = /^[A-Za-z0-9-]{1,64}$/;

export default async function PersonRecordPage({
  params,
}: {
  params: Promise<{ personId: string }>;
}) {
  const { personId } = await params;
  const { allowed, context } = await requireDataOwner(`/data/people/${personId}`);
  if (!PERSON_ID.test(personId)) notFound();
  const now = requestNow();
  // Nothing is read for anyone but the Owner.
  const read = allowed ? await dataRead(() => readPerson(personId)) : null;
  if (!allowed || !read || !read.ok)
    return (
      <>
        <PageHeader title="Person" />
        <div className="page-content">
          {!allowed || !read ? (
            <Callout tone="neutral">{notOwnerLine(context)}</Callout>
          ) : (
            !read.ok && <DataUnavailable failure={read} />
          )}
        </div>
      </>
    );
  return <PersonRecord page={read.data} now={now} />;
}

const money = (amount: number, currency: string) => formatMoneyBy({ [currency]: amount });

/** A copy kept with the ledger, through the Owner-only route; never a link into Files. */
const copyHref = (person: Person, copy: PersonCopy) =>
  `/data/people/${encodeURIComponent(person.person_id)}/copies/${encodeURIComponent(copy.copy_id)}`;

function stipendTerms(person: Person): string {
  if (!person.stipend) return "No stipend";
  return `${money(person.stipend.amount, person.stipend.currency)} a month, paid ${PAYS_ON_WORDS(person.stipend.pays_on)}`;
}

const EVENT_WORDS: Record<string, string> = {
  added: "Added",
  changed: "Changed",
  "document added": "Document added",
  "evaluation recorded": "Evaluation recorded",
  "evaluation moved": "Evaluation moved",
  "certificate recorded": "Certificate recorded",
  "payment recorded": "Stipend payment recorded",
  "payment withdrawn": "Stipend payment withdrawn",
  "access granted": "Access granted",
  "access revoked": "Access revoked",
  "never had": "Never had it",
  "offboarding started": "Offboarding started",
  "offboarding cancelled": "Offboarding cancelled",
  ended: "Ended",
};

/** Days and months in an event's detail, as the pages print them. */
function eventLine(event: PeopleEvent): string {
  return event.detail
    .replace(/\d{4}-\d{2}-\d{2}/g, (day) => formatDate(day))
    .replace(/\b(\d{4}-(0[1-9]|1[0-2]))\b/g, (period) => periodWords(period));
}

/** "From 15 Dec" or "Until 26 Feb" for a part month; "" for a whole one. */
function partWords(person: Person, period: string): string {
  const parts: string[] = [];
  if (person.starts_on.slice(0, 7) === period && !person.starts_on.endsWith("-01"))
    parts.push(`From ${shortDay(person.starts_on)}`);
  const end = person.offboarding?.last_day ?? person.ends_on;
  if (end && end.slice(0, 7) === period) {
    const [year = 0, month = 0, day = 0] = end.split("-").map(Number);
    const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
    if (day !== last) parts.push(`Until ${shortDay(end)}`);
  }
  return parts.join(" · ");
}

function PersonRecord({ page, now }: { page: PersonPage; now: number }) {
  const { person, today } = page;
  const state = PERSON_STATES[page.state];
  const base = { person_id: person.person_id };
  const final = person.evaluations.final;
  const midpoint = person.evaluations.midpoint;
  const nextWhich = midpoint.held_on === null && final.held_on === null ? "midpoint" : "final";
  const certificateOpen =
    person.kind === "intern" && final.outcome === "completed" && person.certificate === null;
  return (
    <>
      <RecordHeader
        crumbs={[{ href: "/data/people", label: "People" }]}
        title={person.name}
        status={
          <>
            <StatusPill value={person.kind} label={ENGAGEMENT_KINDS[person.kind]} tone="neutral" />
            <StatusPill value={page.state} label={state.label} tone={state.tone} />
          </>
        }
        readouts={[
          { label: "Dates", value: datesWords(person.starts_on, person.ends_on) },
          { label: "Mentor", value: person.mentor || "None named" },
          {
            label: "Next",
            value: page.next ? `${page.next.what} · ${shortDay(page.next.on)}` : "—",
          },
        ]}
        actions={
          <>
            <Popover label="Edit" variant="primary" width="wide" align="start">
              <MailForm
                action={updatePersonAction}
                fields={base}
                submitLabel="Save"
                pendingLabel="Saving…"
                className="stack-form stack-form--tight hqdata-person-form"
              >
                <PersonFields
                  prefix="person-edit"
                  values={{
                    name: person.name,
                    email: person.email,
                    kind: person.kind,
                    role_title: person.role_title,
                    starts_on: person.starts_on,
                    ends_on: person.ends_on ?? "",
                    mentor: person.mentor,
                    brief: person.brief,
                    stipend_amount: person.stipend ? String(person.stipend.amount) : "",
                    stipend_currency: person.stipend?.currency ?? "INR",
                    stipend_pays_on: person.stipend ? String(person.stipend.pays_on) : "month_end",
                    notes: person.notes,
                  }}
                />
              </MailForm>
            </Popover>
            <Popover label="Add a document" width="wide" align="start">
              <MailForm
                action={addDocumentAction}
                fields={base}
                submitLabel="Add the document"
                pendingLabel="Adding…"
                className="stack-form stack-form--tight hqdata-person-form"
              >
                <DocumentFields prefix="document-new" today={today} />
              </MailForm>
            </Popover>
            <Popover label="Record an evaluation" width="wide" align="start">
              <MailForm
                action={recordEvaluationAction}
                fields={base}
                submitLabel="Record it"
                pendingLabel="Recording…"
                className="stack-form stack-form--tight hqdata-person-form"
              >
                <EvaluationFields
                  prefix="evaluation-new"
                  today={today}
                  mentor={person.mentor}
                  which={nextWhich}
                />
              </MailForm>
            </Popover>
            <Popover label="Record a stipend payment" width="wide" align="start">
              <PaymentForm page={page} />
            </Popover>
            <Popover label="Grant access" width="wide" align="start">
              <MailForm
                action={grantAccessAction}
                fields={base}
                submitLabel="Record the access"
                pendingLabel="Recording…"
                className="stack-form stack-form--tight hqdata-person-form"
              >
                <AccessFields prefix="access-new" today={today} />
              </MailForm>
            </Popover>
            {person.ended_on !== null ? null : person.offboarding ? (
              <RowAction
                action={cancelOffboardingAction}
                fields={base}
                buttons={[
                  {
                    label: "Cancel the offboarding",
                    className: "btn btn--small",
                    pendingLabel: "Cancelling…",
                  },
                ]}
              />
            ) : (
              <Popover label="Start offboarding" align="start">
                <MailForm
                  action={startOffboardingAction}
                  fields={base}
                  submitLabel="Start offboarding"
                  pendingLabel="Starting…"
                >
                  <Field id="offboard-last-day" label="Last working day" hint={OFFBOARDING_LINE}>
                    <Input
                      id="offboard-last-day"
                      name="last_day"
                      type="date"
                      required
                      min={person.starts_on}
                      defaultValue={today}
                      aria-describedby="offboard-last-day-hint"
                    />
                  </Field>
                </MailForm>
              </Popover>
            )}
            {certificateOpen && (
              <Popover label="Record the certificate" width="wide" align="start">
                <MailForm
                  action={recordCertificateAction}
                  fields={base}
                  submitLabel="Record the certificate"
                  pendingLabel="Recording…"
                  className="stack-form stack-form--tight hqdata-person-form"
                >
                  <div className="hqdata-person-form__pair">
                    <Field id="certificate-number" label="Number">
                      <Input id="certificate-number" name="number" maxLength={40} required />
                    </Field>
                    <Field id="certificate-issued" label="Issued on">
                      <Input
                        id="certificate-issued"
                        name="issued_on"
                        type="date"
                        max={today}
                        defaultValue={today}
                        required
                      />
                    </Field>
                  </div>
                  <Field
                    id="certificate-file"
                    label="Copy"
                    hint="At most 3 MB, kept with the people ledger, never in Files."
                  >
                    <Input
                      id="certificate-file"
                      name="file"
                      type="file"
                      accept=".pdf,image/*"
                      aria-describedby="certificate-file-hint"
                    />
                  </Field>
                </MailForm>
              </Popover>
            )}
          </>
        }
      />
      {page.warnings.length > 0 && (
        <div className="hqdata-person__warnings">
          {page.warnings.map((warning) => (
            <Callout key={warning} tone="attention" role="status">
              {warning}
            </Callout>
          ))}
        </div>
      )}
      <RecordGrid side={<Side person={person} />}>
        <RecordSection id="person-brief" title="Brief">
          {person.brief ? (
            <p className="hqdata-person__prose">{person.brief}</p>
          ) : (
            <p className="page-note">No brief written yet.</p>
          )}
        </RecordSection>

        <RecordSection id="person-documents" title="Documents">
          <DataTable
            caption="Documents"
            columns={[
              { key: "document", label: "Document" },
              { key: "kind", label: "Kind" },
              { key: "signed", label: "Signed" },
              { key: "covers", label: "Covers" },
              { key: "copy", label: "Copy" },
            ]}
            columnMenu={false}
            isEmpty={person.documents.length === 0}
            empty={
              <p className="page-note">
                No documents yet. Add the signed letter before the first day.
              </p>
            }
          >
            {person.documents.map((document) => (
              <tr key={document.document_id}>
                <td>{document.title}</td>
                <td>{DOCUMENT_KINDS[document.kind]}</td>
                <td className="nowrap">
                  {document.signed_on ? formatDate(document.signed_on) : "Not signed"}
                </td>
                <td>
                  {document.includes_ip && document.includes_confidentiality
                    ? "IP and confidentiality"
                    : document.includes_ip
                      ? "IP"
                      : document.includes_confidentiality
                        ? "Confidentiality"
                        : "—"}
                </td>
                <td>
                  {document.copy ? (
                    <a
                      className="text-link"
                      href={copyHref(person, document.copy)}
                      aria-label={`Download ${document.copy.name}`}
                    >
                      Download
                    </a>
                  ) : (
                    <span className="quiet">None kept</span>
                  )}
                </td>
              </tr>
            ))}
          </DataTable>
        </RecordSection>

        <RecordSection id="person-evaluations" title="Evaluations">
          <DataTable
            caption="Evaluations"
            columns={[
              { key: "which", label: "Which" },
              { key: "due", label: "Due" },
              { key: "held", label: "Held" },
              { key: "by", label: "By" },
              { key: "outcome", label: "Outcome" },
              { key: "summary", label: "Summary", width: "32%" },
            ]}
            columnMenu={false}
          >
            {(["midpoint", "final"] as const).map((which) => {
              const evaluation = person.evaluations[which];
              // A midpoint never held is moot once the final is, and nothing is owed once ended.
              const owed =
                evaluation.held_on === null &&
                page.state !== "ended" &&
                !(which === "midpoint" && final.held_on !== null);
              return (
                <tr key={which} id={`evaluation-${which}`}>
                  <td>{EVALUATIONS[which]}</td>
                  <td className="nowrap">
                    {owed ? (
                      <DueChip due={evaluation.due_on} today={today} />
                    ) : evaluation.due_on ? (
                      formatDate(evaluation.due_on)
                    ) : (
                      "No day"
                    )}
                  </td>
                  <td className="nowrap">
                    {evaluation.held_on
                      ? formatDate(evaluation.held_on)
                      : owed
                        ? "Not yet"
                        : "Not held"}
                  </td>
                  <td>{evaluation.by_name || <span className="quiet">—</span>}</td>
                  <td>
                    {evaluation.outcome ? (
                      EVALUATION_OUTCOMES[evaluation.outcome]
                    ) : (
                      <span className="quiet">Not yet</span>
                    )}
                  </td>
                  <td>
                    {evaluation.summary ? (
                      <span className="table-sub table-sub--prose" title={evaluation.summary}>
                        {evaluation.summary}
                      </span>
                    ) : (
                      <span className="quiet">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </DataTable>
          <p className="field__hint">The final evaluation comes before the certificate.</p>
        </RecordSection>

        <StipendSection page={page} />

        <AccessSection page={page} />

        {person.offboarding && <OffboardingSection page={page} />}

        {person.kind === "intern" && (
          <RecordSection id="person-certificate" title="Certificate">
            {person.certificate ? (
              <p>
                Issued {person.certificate.number} on {formatDate(person.certificate.issued_on)}
                {person.certificate.copy && (
                  <>
                    {" · "}
                    <a className="text-link" href={copyHref(person, person.certificate.copy)}>
                      Download the copy
                    </a>
                  </>
                )}
              </p>
            ) : (
              <p className="page-note">Not issued yet.</p>
            )}
          </RecordSection>
        )}

        <RecordSection id="person-activity" title="Activity">
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
                    {event.detail && <p className="timeline__body">{eventLine(event)}</p>}
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

// ------------------------------------------------------------------ the stipend

function PaymentForm({ page }: { page: PersonPage }) {
  const { person, today } = page;
  const owed = page.periods.filter((period) => period.open);
  const months = page.periods.length > 0 ? page.periods : [];
  const first = owed[0]?.period ?? months[0]?.period ?? today.slice(0, 7);
  return (
    <MailForm
      action={recordPaymentAction}
      fields={{ person_id: person.person_id }}
      submitLabel="Record the payment"
      pendingLabel="Recording…"
      className="stack-form stack-form--tight hqdata-person-form"
    >
      <div className="hqdata-person-form__pair">
        <Field id="payment-period" label="Month">
          <Input
            id="payment-period"
            name="period"
            type="month"
            required
            defaultValue={first}
            min={person.starts_on.slice(0, 7)}
          />
        </Field>
        <Field id="payment-paid" label="Paid on">
          <Input
            id="payment-paid"
            name="paid_on"
            type="date"
            required
            max={today}
            defaultValue={today}
          />
        </Field>
      </div>
      <div className="hqdata-person-form__pair">
        <Field id="payment-amount" label="Amount">
          <Input
            id="payment-amount"
            name="amount"
            inputMode="numeric"
            maxLength={20}
            required
            defaultValue={person.stipend ? String(person.stipend.amount) : ""}
          />
        </Field>
        <Field id="payment-currency" label="Currency">
          <Select
            id="payment-currency"
            name="currency"
            defaultValue={person.stipend?.currency ?? "INR"}
          >
            {Object.entries(STIPEND_CURRENCIES).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <div className="hqdata-person-form__pair">
        <Field id="payment-reference" label="Bank reference" hint="The UTR, never a password.">
          <Input
            id="payment-reference"
            name="reference"
            maxLength={80}
            autoComplete="off"
            aria-describedby="payment-reference-hint"
          />
        </Field>
        <Field id="payment-tds" label="TDS deducted">
          <Input id="payment-tds" name="tds_deducted" inputMode="numeric" maxLength={20} />
        </Field>
      </div>
      <Field id="payment-note" label="Note">
        <Input id="payment-note" name="note" maxLength={500} />
      </Field>
      <p className="field__hint">{TAX_HINT}</p>
    </MailForm>
  );
}

type StipendLine =
  | { key: string; period: StipendPeriod; payment: StipendPayment }
  | { key: string; period: StipendPeriod; payment: null };

function StipendSection({ page }: { page: PersonPage }) {
  const { person, today } = page;
  const lines: StipendLine[] = [];
  for (const period of page.periods) {
    for (const payment of period.paid) lines.push({ key: payment.payment_id, period, payment });
    if (period.open) lines.push({ key: `open-${period.period}`, period, payment: null });
  }
  const totals: Record<string, number> = {};
  for (const payment of person.payments)
    if (payment.withdrawn === null)
      totals[payment.currency] = (totals[payment.currency] ?? 0) + payment.amount;
  const live = person.payments.filter((payment) => payment.withdrawn === null);
  return (
    <RecordSection
      id="person-stipend"
      title="Stipend"
      actions={
        live.length > 0 ? (
          <Popover label="Withdraw an entry" width="wide" align="end">
            <MailForm
              action={withdrawPaymentAction}
              fields={{ person_id: person.person_id }}
              submitLabel="Withdraw the entry"
              pendingLabel="Withdrawing…"
              variant="danger"
            >
              <Field id="withdraw-payment" label="Entry">
                <Select id="withdraw-payment" name="payment_id" required defaultValue="">
                  <option value="" disabled>
                    Choose an entry
                  </option>
                  {live.map((payment) => (
                    <option key={payment.payment_id} value={payment.payment_id}>
                      {`${periodWords(payment.period)} · paid ${formatDate(payment.paid_on)}${payment.reference ? ` · ${payment.reference}` : ""}`}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field id="withdraw-why" label="Why">
                <Input id="withdraw-why" name="why" maxLength={300} required />
              </Field>
              <p className="field__hint">
                The entry stays, struck through, and the month is owed again.
              </p>
            </MailForm>
          </Popover>
        ) : undefined
      }
    >
      <p className="hqdata-person__terms">
        {stipendTerms(person)} <StatusPill value="tax" label={TAX_LINE} tone="neutral" />
      </p>
      <p className="field__hint">{TAX_HINT}</p>
      {lines.length > 0 && (
        <>
          <DataTable
            caption="Stipend"
            columns={[
              { key: "month", label: "Month" },
              { key: "due", label: "Due" },
              { key: "paid", label: "Paid" },
              { key: "amount", label: "Amount", align: "end" as const },
              { key: "tds", label: "TDS deducted", align: "end" as const },
            ]}
            columnMenu={false}
          >
            {lines.map((line) => {
              const part = partWords(person, line.period.period);
              const late =
                line.payment === null && line.period.due_on !== null && line.period.due_on < today;
              const withdrawn = line.payment?.withdrawn ?? null;
              return (
                <tr
                  key={line.key}
                  id={
                    line.payment
                      ? `payment-${line.payment.payment_id}`
                      : `stipend-${line.period.period}-open`
                  }
                  data-period={line.period.period}
                  className={withdrawn ? "hqdata-person__row--withdrawn" : undefined}
                >
                  <td>
                    {periodWords(line.period.period)}
                    {part && <span className="table-sub">{part}</span>}
                  </td>
                  <td className="nowrap">
                    {line.period.due_on ? formatDate(line.period.due_on) : "No day"}
                  </td>
                  <td>
                    {line.payment === null ? (
                      <span className={late ? "hqdata-person__late" : "quiet"}>Not paid</span>
                    ) : (
                      <>
                        <span className={withdrawn ? "hqdata-person__struck" : undefined}>
                          Paid {shortDay(line.payment.paid_on)}
                          {line.payment.reference ? ` · ${line.payment.reference}` : ""}
                        </span>
                        {withdrawn && <span className="table-sub">Withdrawn: {withdrawn.why}</span>}
                        {line.payment.note && (
                          <span className="table-sub">{line.payment.note}</span>
                        )}
                      </>
                    )}
                  </td>
                  <td className="data-table__num">
                    {line.payment ? (
                      <span className={withdrawn ? "hqdata-person__struck" : undefined}>
                        {money(line.payment.amount, line.payment.currency)}
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="data-table__num">
                    {line.payment && line.payment.tds_deducted !== null
                      ? money(line.payment.tds_deducted, line.payment.currency)
                      : "—"}
                  </td>
                </tr>
              );
            })}
          </DataTable>
          <p className="hqdata-person__total">
            Paid in all: {Object.keys(totals).length > 0 ? formatMoneyBy(totals) : "nothing yet"}
          </p>
        </>
      )}
    </RecordSection>
  );
}

// ------------------------------------------------------------------ access and offboarding

function revokedCell(grant: AccessGrant, deadline: string | undefined, today: string) {
  if (grant.revoked_on) return `Revoked ${shortDay(grant.revoked_on)}`;
  if (grant.never_had) return "Never had it";
  if (deadline) return <DueChip due={deadline} today={today} />;
  return <span className="quiet">Held</span>;
}

function AccessSection({ page }: { page: PersonPage }) {
  const { person, today } = page;
  const deadlines = new Map(page.deadlines.map((item) => [item.access_id, item.by]));
  return (
    <RecordSection id="person-access" title="Access">
      <DataTable
        caption="Access"
        columns={[
          { key: "system", label: "System" },
          { key: "level", label: "Level" },
          { key: "critical", label: "Critical" },
          { key: "granted", label: "Granted" },
          { key: "revoked", label: "Revoked" },
          { key: "change", label: "Change", align: "end" as const },
        ]}
        columnMenu={false}
        isEmpty={person.access.length === 0}
        empty={
          <p className="page-note">
            No access recorded. Grant access once the signed letter and IP assignment are in.
          </p>
        }
      >
        {person.access.map((grant) => {
          const open = grant.revoked_on === null && !grant.never_had;
          return (
            <tr key={grant.access_id} id={`access-${grant.access_id}`}>
              <td>
                {grant.system}
                {grant.notes && <span className="table-sub">{grant.notes}</span>}
              </td>
              <td>{grant.level || <span className="quiet">—</span>}</td>
              <td>{grant.critical ? "Yes" : "—"}</td>
              <td className="nowrap">
                {grant.granted_on ? formatDate(grant.granted_on) : "Not known"}
              </td>
              <td className="nowrap">
                {revokedCell(grant, deadlines.get(grant.access_id), today)}
              </td>
              <td className="row-action-cell">
                {open && (
                  <RowAction
                    className="hqdata-person__row-actions"
                    action={accessStateAction}
                    fields={{
                      person_id: person.person_id,
                      access_id: grant.access_id,
                      on: today,
                    }}
                    buttons={[
                      {
                        label: "Revoke",
                        className: "btn btn--small",
                        name: "to",
                        value: "revoke",
                        ariaLabel: `Revoke ${grant.system} today`,
                        pendingLabel: "Revoking…",
                      },
                      {
                        label: "Never had it",
                        className: "btn btn--small btn--ghost",
                        name: "to",
                        value: "never",
                        ariaLabel: `${grant.system}: never had it`,
                      },
                    ]}
                  />
                )}
              </td>
            </tr>
          );
        })}
      </DataTable>
    </RecordSection>
  );
}

function OffboardingSection({ page }: { page: PersonPage }) {
  const { person } = page;
  const lastDay = person.offboarding?.last_day ?? "";
  return (
    <RecordSection id="person-offboarding" title="Offboarding">
      {person.ended_on === null ? (
        <p>
          Last day {formatDate(lastDay)}. Critical systems by {shortDay(plusDays(lastDay, 1))};
          everything else by {shortDay(plusDays(lastDay, 5))}. {formatNumber(page.deadlines.length)}{" "}
          still to revoke.
        </p>
      ) : (
        <p>Every system is revoked or was never held. Ended on {formatDate(person.ended_on)}.</p>
      )}
      <p className="page-note">
        {OFFBOARDING_LINE} <SourceLink href={OFFBOARDING_SOURCE} />
      </p>
    </RecordSection>
  );
}

/** A calendar day plus whole days, never shifted into a zone. */
function plusDays(day: string, count: number): string {
  const [year = 0, month = 0, date = 0] = day.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, date + count)).toISOString().slice(0, 10);
}

function Side({ person }: { person: Person }) {
  return (
    <Properties title="Details">
      <Property label="Name">{person.name}</Property>
      <Property label="Email">
        {person.email ? (
          <a className="text-link" href={`mailto:${person.email}`}>
            {person.email}
          </a>
        ) : (
          <span className="quiet">Not given</span>
        )}
      </Property>
      <Property label="Kind">{ENGAGEMENT_KINDS[person.kind]}</Property>
      <Property label="Role">
        {person.role_title || <span className="quiet">Not given</span>}
      </Property>
      <Property label="First day">{formatDate(person.starts_on)}</Property>
      <Property label="Last day">
        {person.ends_on ? formatDate(person.ends_on) : <span className="quiet">Open-ended</span>}
      </Property>
      <Property label="Mentor">
        {person.mentor || <span className="quiet">None named</span>}
      </Property>
      <Property label="HQ account">
        {person.hq_staff_id ? person.hq_staff_id : <span className="quiet">Not linked yet</span>}
      </Property>
      <Property label="Notes">
        {person.notes ? (
          <span className="hqdata-person__prose">{person.notes}</span>
        ) : (
          <span className="quiet">None</span>
        )}
      </Property>
    </Properties>
  );
}
