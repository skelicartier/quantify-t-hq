import { RecordAutomations } from "@/components/platform/record-automations";
import { CustomFieldsSection } from "@/components/platform/custom-fields-section";
import { RecordMail } from "@/components/mail/record-mail";
import Link from "next/link";
import { RecordComments } from "@/components/platform/comments-section";
import { RecordTemplates } from "@/components/platform/record-templates";
import { notFound } from "next/navigation";

import { logActivityAction } from "@/app/(portal)/_actions/work";
import {
  decideSignalAction,
  convertLeadAction,
  endNurtureAction,
  nurtureLeadAction,
  updateLeadAction,
  updateLeadStageAction,
} from "@/app/(portal)/leads/actions";
import { ActForm } from "@/components/ui/act-form";
import { Field, Input } from "@/components/ui/field";
import { RowAction } from "@/components/ui/row-action";
import { ActivityTimeline } from "@/components/crm/activity-timeline";
import { SignalList } from "@/components/crm/signal-list";
import { ConvertLeadForm, LeadStageForm } from "@/components/crm/lead-forms";
import { LogActivityForm } from "@/components/crm/log-activity-form";
import { FirstReplyClock, LeadStagePill, LifecyclePill } from "@/components/crm/pills";
import { FitPill, TagList } from "@/components/crm/prospect-pills";
import { Callout } from "@/components/ui/callout";
import { Card } from "@/components/ui/card";
import { InlineField } from "@/components/ui/inline-field";
import { KeyValue, KeyValueRow } from "@/components/ui/key-value";
import {
  Properties,
  Property,
  RecordGrid,
  RecordHeader,
  RecordSection,
} from "@/components/ui/record-shell";
import { Timestamp } from "@/components/ui/timestamp";
import { hasCapability, requireStaff } from "@/lib/access/core";
import { RecordFollow } from "@/components/inbox/record-follow";
import { HqApiRequestError, HqApiUnavailableError } from "@/lib/api/core";
import { readCrmSettings, readLead, type CrmSettings, type LeadDetail } from "@/lib/api/crm";
import { directoryOrNull, nameFor } from "@/lib/api/staff";
import { channelLabel, referrerHost, visitTags } from "@/lib/crm/attribution";
import { isoDayPlus } from "@/lib/crm/dates";
import {
  EMAIL_KINDS,
  EMAIL_KIND_LABELS,
  FIT_LABELS,
  VERIFIED_LABELS,
  VERIFIED_STATES,
} from "@/lib/crm/prospects";
import { DISQUALIFY_LABELS, sourceLabel, sourceNamesFrom } from "@/lib/crm/vocabulary";
import { formatDate, formatSentence } from "@/lib/format";
import { requestNow } from "@/lib/request-time";

export const metadata = { title: "Lead" };
export const dynamic = "force-dynamic";

/** Personal mail never anchors a company; mirrors the service's list. */
const PERSONAL_MAIL = new Set([
  "gmail.com",
  "googlemail.com",
  "outlook.com",
  "hotmail.com",
  "live.com",
  "yahoo.com",
  "icloud.com",
  "me.com",
  "proton.me",
  "protonmail.com",
  "gmx.com",
  "aol.com",
  "mail.com",
  "yandex.com",
  "zoho.com",
  "hey.com",
  "pm.me",
]);

function companyDomain(email: string): string {
  const domain = email.toLowerCase().split("@")[1] ?? "";
  return PERSONAL_MAIL.has(domain) ? "" : domain;
}

type LeadPageProps = { params: Promise<{ leadId: string }> };

export default async function LeadPage({ params }: LeadPageProps) {
  const { leadId } = await params;
  const context = await requireStaff(`/leads/${leadId}`);
  const now = requestNow();

  let detail: LeadDetail;
  try {
    detail = await readLead(context.token, leadId);
  } catch (error) {
    if (error instanceof HqApiRequestError && error.status === 404) notFound();
    throw error;
  }
  let settings: CrmSettings | null = null;
  try {
    settings = await readCrmSettings(context.token);
  } catch (error) {
    if (!(error instanceof HqApiUnavailableError || error instanceof HqApiRequestError))
      throw error;
  }
  const names = await directoryOrNull(context.token);

  const { lead, matches, activities } = detail;
  const anonymised = Boolean(lead.anonymised_at);
  // A prospect is someone the team found; nobody is waiting on a reply, so no clock runs.
  const prospect = lead.origin === "prospect";
  // An anonymised lead is kept for the counts only; the service refuses any write to it.
  const canWrite = hasCapability(context, "crm:write") && !anonymised;
  const closed = lead.stage === "qualified" || lead.stage === "disqualified";
  const sourceNames = sourceNamesFrom(settings);
  const stageNames = new Map((settings?.pipeline ?? []).map((stage) => [stage.key, stage.label]));
  const openStages = (settings?.pipeline ?? [])
    .filter((stage) => !stage.outcome)
    .map((stage) => ({ key: stage.key, label: stage.label }));
  // "How did you hear about us?" is shown with the visit beside it, not among the answers.
  const answers = Object.entries(lead.payload).filter(
    ([field, value]) => field !== "heard_from" && typeof value === "string" && value.trim(),
  );
  const tags = visitTags(lead);
  const sentBy = referrerHost(lead.referrer);

  return (
    <>
      <RecordHeader
        crumbs={[
          prospect
            ? { href: "/leads/prospects", label: "Prospects" }
            : { href: "/leads", label: "Leads" },
        ]}
        title={anonymised ? "Anonymised lead" : lead.full_name || lead.email || "Unnamed lead"}
        status={
          <>
            <LeadStagePill stage={lead.stage} />
            {prospect && !anonymised && <FitPill band={lead.fit_band} score={lead.fit_score} />}
            {!closed && !prospect && (
              <FirstReplyClock
                firstRepliedAt={lead.first_replied_at}
                waitingMinutes={lead.waiting_minutes}
                overdue={lead.first_reply_overdue}
                targetMinutes={detail.first_reply_target_minutes ?? 60}
              />
            )}
            {lead.company_name && <span className="quiet">{lead.company_name}</span>}
          </>
        }
        readouts={[
          { label: "Source", value: sourceLabel(lead.source_key, sourceNames) },
          {
            label: prospect ? "Added" : "Received",
            value: <Timestamp value={lead.created_at} now={now} mode="relative" />,
          },
          prospect
            ? { label: "Firm type", value: lead.firm_type || "Not given" }
            : {
                label: "First reply",
                value: (
                  <Timestamp
                    value={lead.first_replied_at}
                    now={now}
                    mode="relative"
                    fallback="Not yet"
                  />
                ),
              },
        ]}
        actions={
          <>
            {!anonymised && (
              <RecordFollow
                token={context.token}
                subjectType="lead"
                subjectId={lead.lead_id}
                label={lead.full_name || lead.email}
                path={`/leads/${lead.lead_id}`}
              />
            )}
            {lead.email && !anonymised && (
              <a className="btn btn--small" href={`mailto:${lead.email}`}>
                Email
              </a>
            )}
          </>
        }
      />
      {anonymised && (
        <Callout tone="neutral" title={`Anonymised on ${formatDate(lead.anonymised_at)}`}>
          The retention rules removed the name, address and message after nobody had touched this
          lead for long enough. Its stage, source and dates stay, so the funnel still adds up.
          Nothing on it can change.
        </Callout>
      )}
      {lead.first_reply_overdue && (
        <Callout tone="danger" title="A first reply is overdue">
          They have waited longer than an hour. Reply, then log it below — logging the email or call
          is what stops the clock.
        </Callout>
      )}
      <RecordGrid
        side={
          <>
            {canWrite && (
              <RecordSection id="lead-templates" title="Tasks from a template">
                <RecordTemplates
                  token={context.token}
                  appliesTo="lead"
                  subjectId={lead.lead_id}
                  returnPath={`/leads/${lead.lead_id}`}
                />
              </RecordSection>
            )}
            <RecordSection id="lead-mail" title="Outreach">
              <RecordMail
                token={context.token}
                kind="lead"
                contactId={lead.lead_id}
                email={anonymised ? "" : lead.email}
                returnPath={`/leads/${lead.lead_id}`}
                canWrite={canWrite}
                now={now}
                full={false}
              />
            </RecordSection>
            <Properties title="Details">
              <InlineField
                action={updateLeadAction}
                idName="lead_id"
                id={lead.lead_id}
                name="owner_staff_id"
                label="Owner"
                type="select"
                value={lead.owner_staff_id}
                options={[
                  { value: "", label: "Unowned" },
                  ...[...(names ?? new Map()).values()]
                    .filter((entry) => entry.is_active)
                    .map((entry) => ({ value: entry.staff_id, label: entry.display_name })),
                ]}
                display={lead.owner_staff_id ? nameFor(names, lead.owner_staff_id) : "Unowned"}
                readOnly={!canWrite || names === null}
              />
              {(
                [
                  ["full_name", "Name", "text", lead.full_name],
                  ["email", "Email", "email", lead.email],
                  ["title", "Title", "text", lead.title],
                  ["company_name", "Firm", "text", lead.company_name],
                  ["firm_type", "Firm type", "text", lead.firm_type],
                  ["country", "Country", "text", lead.country],
                  ["city", "City", "text", lead.city],
                  ["phone", "Phone", "text", lead.phone],
                  ["website", "Website", "text", lead.website],
                  ["registration_no", "Registration number", "text", lead.registration_no],
                ] as const
              ).map(([name, label, type, value]) => (
                <InlineField
                  key={name}
                  action={updateLeadAction}
                  idName="lead_id"
                  id={lead.lead_id}
                  name={name}
                  label={label}
                  type={type}
                  value={value}
                  readOnly={!canWrite}
                />
              ))}
              <InlineField
                action={updateLeadAction}
                idName="lead_id"
                id={lead.lead_id}
                name="email_kind"
                label="Kind of address"
                type="select"
                value={lead.email_kind}
                options={[
                  { value: "", label: "Not judged" },
                  ...EMAIL_KINDS.map((kind) => ({ value: kind, label: EMAIL_KIND_LABELS[kind]! })),
                ]}
                display={EMAIL_KIND_LABELS[lead.email_kind] ?? lead.email_kind}
                readOnly={!canWrite}
              />
              <InlineField
                action={updateLeadAction}
                idName="lead_id"
                id={lead.lead_id}
                name="verified_state"
                label="Address verified"
                type="select"
                value={lead.verified_state}
                options={VERIFIED_STATES.map((state) => ({
                  value: state,
                  label: VERIFIED_LABELS[state]!,
                }))}
                display={VERIFIED_LABELS[lead.verified_state] ?? lead.verified_state}
                readOnly={!canWrite}
              />
              <InlineField
                action={updateLeadAction}
                idName="lead_id"
                id={lead.lead_id}
                name="tags"
                label="Tags"
                value={lead.tags.join(", ")}
                display={<TagList tags={lead.tags} />}
                placeholder="wave 1, met at event"
                readOnly={!canWrite}
              />
              <InlineField
                action={updateLeadAction}
                idName="lead_id"
                id={lead.lead_id}
                name="notes"
                label="Notes"
                type="textarea"
                value={lead.notes}
                readOnly={!canWrite}
              />
              <Property label={prospect ? "Added" : "Received"}>
                <Timestamp value={lead.created_at} mode="absolute" />
              </Property>
            </Properties>
            {!anonymised && (prospect || lead.fit_reasons.length > 0) && (
              <Card
                title={`Fit: ${lead.fit_band} · ${FIT_LABELS[lead.fit_band] ?? ""}`}
                titleAs="h3"
                description={`${lead.fit_score} points under the fit rules.`}
              >
                {lead.fit_reasons.length > 0 ? (
                  <ul className="fit-reasons">
                    {lead.fit_reasons.map((reason) => (
                      <li key={reason}>{reason}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="side-quiet">Nothing on this lead scores under the rules.</p>
                )}
                <p className="side-quiet">
                  <Link className="text-link" href="/leads/fit">
                    The fit rules
                  </Link>
                </p>
              </Card>
            )}
            <CustomFieldsSection
              recordType="lead"
              recordId={lead.lead_id}
              fields={detail.custom_fields}
              canWrite={canWrite}
            />
            <RecordAutomations
              token={context.token}
              recordType="lead"
              recordId={lead.lead_id}
              returnPath={`/leads/${lead.lead_id}`}
            />
            {(lead.nurturing ||
              (canWrite && ["new", "attempting", "connected"].includes(lead.stage))) && (
              <Card title={lead.nurturing ? "Set aside" : "Set it aside"} titleAs="h3">
                {lead.nurturing ? (
                  <>
                    <p className="side-quiet" id="lead-nurture">
                      Until {formatDate(lead.nurture_until)}
                      {lead.nurtured_by ? `, by ${nameFor(names, lead.nurtured_by)}` : ""}
                      {lead.nurture_note ? `: ${lead.nurture_note}` : "."} It is off the working
                      lists and the sends until then, and comes back unread on the day.
                    </p>
                    {canWrite && (
                      <RowAction
                        action={endNurtureAction}
                        fields={{ lead_id: lead.lead_id }}
                        buttons={[
                          {
                            label: "Bring it back now",
                            className: "btn btn--small",
                            pendingLabel: "Bringing it back…",
                          },
                        ]}
                      />
                    )}
                  </>
                ) : (
                  <ActForm
                    action={nurtureLeadAction}
                    hidden={{ lead_id: lead.lead_id, from: "record" }}
                    act="nurture"
                    label="Set it aside"
                  >
                    <Field
                      id="lead-nurture-until"
                      label="Until"
                      hint="Off the working lists and the sends till then; back to you, unread, on the day."
                    >
                      <Input
                        id="lead-nurture-until"
                        name="until"
                        type="date"
                        min={isoDayPlus(now, 1)}
                        defaultValue={isoDayPlus(now, 30)}
                        required
                      />
                    </Field>
                    <Field id="lead-nurture-note" label="In a line">
                      <Input
                        id="lead-nurture-note"
                        name="note"
                        maxLength={400}
                        placeholder="Budget opens in January."
                      />
                    </Field>
                  </ActForm>
                )}
                {lead.nurture_returned_at && !lead.nurturing && (
                  <p className="side-quiet">
                    Back from being set aside{" "}
                    <Timestamp value={lead.nurture_returned_at} now={now} mode="relative" />.
                  </p>
                )}
              </Card>
            )}
            {lead.stage === "qualified" && (
              <Card title="Converted" titleAs="h3" important>
                <ul className="side-list">
                  {lead.converted_company_id && (
                    <li>
                      <Link href={`/companies/${lead.converted_company_id}`}>Open the company</Link>
                    </li>
                  )}
                  {lead.converted_person_id && (
                    <li>
                      <Link href={`/people/${lead.converted_person_id}`}>Open the person</Link>
                    </li>
                  )}
                  {lead.converted_deal_id && (
                    <li>
                      <Link href={`/deals/${lead.converted_deal_id}`}>Open the deal</Link>
                    </li>
                  )}
                </ul>
              </Card>
            )}
            {lead.stage === "disqualified" && (
              <Card title="Disqualified" titleAs="h3">
                <p className="side-quiet">
                  {DISQUALIFY_LABELS[lead.disqualify_reason] ?? "No reason recorded"}.
                </p>
                {detail.duplicate_of && (
                  <p className="side-quiet">
                    {detail.duplicate_of.kind === "person"
                      ? "Already in the CRM as "
                      : "Folded into "}
                    {detail.duplicate_of.exists ? (
                      <Link
                        href={
                          detail.duplicate_of.kind === "person"
                            ? `/people/${detail.duplicate_of.id}`
                            : `/leads/${detail.duplicate_of.id}`
                        }
                      >
                        {detail.duplicate_of.label || "the record"}
                      </Link>
                    ) : (
                      "a record that is no longer here"
                    )}
                    . Moving it back to work makes it a lead of its own again.
                  </p>
                )}
              </Card>
            )}
            {!anonymised && (
              <Card title="Already known" titleAs="h3">
                {matches.person === null && matches.company === null ? (
                  <p className="side-quiet">
                    Nobody at HQ matches this address or its domain. Converting creates both.
                  </p>
                ) : (
                  <KeyValue>
                    {matches.person && (
                      <KeyValueRow label="Person">
                        <Link href={`/people/${matches.person.person_id}`}>
                          {matches.person.full_name || matches.person.email}
                        </Link>
                      </KeyValueRow>
                    )}
                    {matches.company && (
                      <KeyValueRow label="Company">
                        <Link href={`/companies/${matches.company.company_id}`}>
                          {matches.company.name}
                        </Link>{" "}
                        <LifecyclePill lifecycle={matches.company.lifecycle} />
                      </KeyValueRow>
                    )}
                  </KeyValue>
                )}
              </Card>
            )}
            {canWrite && !closed && (
              <Card
                title="Qualify"
                titleAs="h3"
                description="Makes the person, the company and, if you want, the deal."
              >
                {settings === null ? (
                  <Callout tone="danger" compact>
                    The pipeline could not be read, so conversion is paused. Nothing is lost.
                  </Callout>
                ) : (
                  <ConvertLeadForm
                    action={convertLeadAction}
                    lead={lead}
                    matchedCompany={matches.company}
                    suggestedDomain={companyDomain(lead.email)}
                    stages={openStages}
                    defaultDue={isoDayPlus(now, 3)}
                  />
                )}
              </Card>
            )}
            {canWrite && lead.stage !== "qualified" && (
              <Card
                title="Stage"
                titleAs="h3"
                description="Logged work moves the stage by itself; this is for corrections."
              >
                <LeadStageForm action={updateLeadStageAction} lead={lead} />
              </Card>
            )}
          </>
        }
      >
        <>
          <Card title={prospect ? "Where this lead came from" : "What they sent"} titleAs="h2">
            {prospect && !anonymised && (
              <KeyValue columns={2}>
                <KeyValueRow label="Published on">
                  {lead.source_url ? (
                    <a
                      className="text-link"
                      href={lead.source_url}
                      target="_blank"
                      rel="noreferrer noopener"
                    >
                      {lead.source_url}
                    </a>
                  ) : (
                    "Not recorded"
                  )}
                </KeyValueRow>
                <KeyValueRow label="Came in with">
                  {detail.import ? (
                    <Link className="text-link" href="/leads/import">
                      {detail.import.label || "An import"}
                    </Link>
                  ) : (
                    "Typed in by hand"
                  )}
                </KeyValueRow>
                <KeyValueRow label="The address">
                  {VERIFIED_LABELS[lead.verified_state] ?? lead.verified_state}
                  {lead.verified_detail && lead.verified_detail !== lead.verified_state && (
                    <>
                      {" · "}the verifier said <span className="mono">{lead.verified_detail}</span>
                    </>
                  )}
                  {lead.verified_at && (
                    <>
                      {" · "}
                      <Timestamp value={lead.verified_at} now={now} mode="relative" />
                    </>
                  )}
                </KeyValueRow>
                <KeyValueRow label="Written to">
                  {lead.emails_sent > 0 ? (
                    <>
                      {lead.emails_sent === 1 ? "Once" : `${lead.emails_sent} times`}
                      {" · "}
                      <Timestamp value={lead.last_emailed_at} now={now} mode="relative" />
                    </>
                  ) : (
                    "Never"
                  )}
                </KeyValueRow>
                <KeyValueRow label="The firm's domain">
                  {lead.firm_domain ? (
                    <>
                      <span className="mono">{lead.firm_domain}</span>
                      {canWrite && (
                        <>
                          {" · "}
                          <Link
                            className="text-link"
                            href={`/mail/suppressions?firm=${encodeURIComponent(lead.firm_domain)}#stop-firm`}
                          >
                            Stop the whole firm
                          </Link>
                        </>
                      )}
                    </>
                  ) : (
                    "A free-mail address: no firm to go by"
                  )}
                </KeyValueRow>
              </KeyValue>
            )}
            {lead.message ? (
              <p className="prose-block">{lead.message}</p>
            ) : (
              !prospect && (
                <p className="side-quiet">
                  {anonymised
                    ? "Removed when the lead was anonymised."
                    : "No message with this lead."}
                </p>
              )
            )}
            {!prospect && !anonymised && (
              <KeyValue columns={2} className="answers">
                <KeyValueRow label="How they heard of us">
                  {lead.heard_from ? (
                    <>
                      &ldquo;{lead.heard_from}&rdquo;
                      <span className="table-sub">{channelLabel(lead.heard_channel)}</span>
                    </>
                  ) : (
                    "They did not say"
                  )}
                </KeyValueRow>
                <KeyValueRow label="What their visit showed">
                  {channelLabel(lead.visit_channel || "direct")}
                  {(tags || sentBy) && (
                    <span className="table-sub">
                      {[tags, sentBy && `from ${sentBy}`].filter(Boolean).join(" · ")}
                    </span>
                  )}
                </KeyValueRow>
              </KeyValue>
            )}
            {answers.length > 0 && (
              <KeyValue columns={2} className="answers">
                {answers.map(([field, value]) => (
                  <KeyValueRow key={field} label={formatSentence(field)}>
                    {String(value)}
                  </KeyValueRow>
                ))}
              </KeyValue>
            )}
          </Card>
          {detail.signals.length > 0 && (
            <RecordSection id="lead-signals" title="Signs of interest">
              <SignalList
                signals={detail.signals}
                now={now}
                action={decideSignalAction}
                canWrite={canWrite}
                returnPath={`/leads/${lead.lead_id}`}
                showSubject={false}
              />
            </RecordSection>
          )}
          <RecordSection id="lead-comments" title="Threads">
            <RecordComments
              token={context.token}
              subjectType="lead"
              subjectId={lead.lead_id}
              returnPath={`/leads/${lead.lead_id}`}
              canWrite={context.me.role !== "intern_readonly"}
            />
          </RecordSection>
          <RecordSection id="lead-activity" title="Activity">
            {canWrite && !closed && (
              <LogActivityForm
                action={logActivityAction}
                links={{ lead_id: lead.lead_id }}
                returnPath={`/leads/${lead.lead_id}`}
                context={prospect ? "prospect" : "lead"}
              />
            )}
            <ActivityTimeline activities={activities} now={now} stageLabels={stageNames} />
          </RecordSection>
        </>
      </RecordGrid>
    </>
  );
}
