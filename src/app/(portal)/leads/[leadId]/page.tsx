import { RecordMail } from "@/components/mail/record-mail";
import Link from "next/link";
import { notFound } from "next/navigation";

import { logActivityAction } from "@/app/(portal)/_actions/work";
import {
  convertLeadAction,
  updateLeadAction,
  updateLeadStageAction,
} from "@/app/(portal)/leads/actions";
import { ActivityTimeline } from "@/components/crm/activity-timeline";
import { ConvertLeadForm, LeadStageForm } from "@/components/crm/lead-forms";
import { LogActivityForm } from "@/components/crm/log-activity-form";
import { FirstReplyClock, LeadStagePill, LifecyclePill } from "@/components/crm/pills";
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
import { HqApiRequestError, HqApiUnavailableError } from "@/lib/api/core";
import { readCrmSettings, readLead, type CrmSettings, type LeadDetail } from "@/lib/api/crm";
import { directoryOrNull, nameFor } from "@/lib/api/staff";
import { isoDayPlus } from "@/lib/crm/dates";
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
  // An anonymised lead is kept for the counts only; the service refuses any write to it.
  const canWrite = hasCapability(context, "crm:write") && !anonymised;
  const closed = lead.stage === "qualified" || lead.stage === "disqualified";
  const sourceNames = sourceNamesFrom(settings);
  const stageNames = new Map((settings?.pipeline ?? []).map((stage) => [stage.key, stage.label]));
  const openStages = (settings?.pipeline ?? [])
    .filter((stage) => !stage.outcome)
    .map((stage) => ({ key: stage.key, label: stage.label }));
  const answers = Object.entries(lead.payload).filter(
    ([, value]) => typeof value === "string" && value.trim(),
  );

  return (
    <>
      <RecordHeader
        crumbs={[{ href: "/leads", label: "Leads" }]}
        title={anonymised ? "Anonymised lead" : lead.full_name || lead.email || "Unnamed lead"}
        status={
          <>
            <LeadStagePill stage={lead.stage} />
            {!closed && (
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
            label: "Received",
            value: <Timestamp value={lead.created_at} now={now} mode="relative" />,
          },
          {
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
          lead.email && !anonymised ? (
            <a className="btn btn--small" href={`mailto:${lead.email}`}>
              Email
            </a>
          ) : undefined
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
              <Property label="Email" mono>
                {lead.email || "—"}
              </Property>
              <Property label="Firm">{lead.company_name || "—"}</Property>
              <Property label="Received">
                <Timestamp value={lead.created_at} mode="absolute" />
              </Property>
            </Properties>
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
          <Card title="What they sent" titleAs="h2">
            {lead.message ? (
              <p className="prose-block">{lead.message}</p>
            ) : (
              <p className="side-quiet">
                {anonymised
                  ? "Removed when the lead was anonymised."
                  : "No message with this lead."}
              </p>
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
          <RecordSection id="lead-activity" title="Activity">
            {canWrite && !closed && (
              <LogActivityForm
                action={logActivityAction}
                links={{ lead_id: lead.lead_id }}
                returnPath={`/leads/${lead.lead_id}`}
                context="lead"
              />
            )}
            <ActivityTimeline activities={activities} now={now} stageLabels={stageNames} />
          </RecordSection>
        </>
      </RecordGrid>
    </>
  );
}
