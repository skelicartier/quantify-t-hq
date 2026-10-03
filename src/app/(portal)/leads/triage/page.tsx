import Link from "next/link";

import {
  disqualifyFromTriageAction,
  nurtureLeadAction,
  takeLeadAction,
} from "@/app/(portal)/leads/actions";
import { LeadTabs } from "@/components/crm/lead-tabs";
import { FirstReplyClock, LeadStagePill } from "@/components/crm/pills";
import { TriageKeys } from "@/components/crm/triage-keys";
import { PageHeader } from "@/components/shell/page-header";
import { ActForm } from "@/components/ui/act-form";
import { ButtonLink } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Field, Input, Select } from "@/components/ui/field";
import { KeyValue, KeyValueRow } from "@/components/ui/key-value";
import { RecordSection } from "@/components/ui/record-shell";
import { Stat, StatGrid } from "@/components/ui/stat";
import { Timestamp } from "@/components/ui/timestamp";
import { hasCapability, requireStaff } from "@/lib/access/core";
import { HqApiRequestError, HqApiUnavailableError } from "@/lib/api/core";
import { readLeads, type LeadsPage } from "@/lib/api/crm";
import { readLeadDuplicates } from "@/lib/api/data-quality";
import { directoryOrNull, nameFor } from "@/lib/api/staff";
import { isoDayPlus } from "@/lib/crm/dates";
import { DISQUALIFY_LABELS } from "@/lib/crm/vocabulary";
import { formatNumber } from "@/lib/format";
import { requestNow } from "@/lib/request-time";
import { firstSearchValue } from "@/lib/search-params";

export const metadata = { title: "Triage" };
export const dynamic = "force-dynamic";

const BASE = "/leads/triage";
const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type TriagePageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/** Linear's four verbs for a new lead: take it, merge it, disqualify it, set it aside. */
export default async function TriagePage({ searchParams }: TriagePageProps) {
  const context = await requireStaff(BASE);
  const parameters = await searchParams;
  const skipped = (firstSearchValue(parameters.skip) ?? "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter((value) => GUID.test(value))
    .slice(0, 50);
  const now = requestNow();
  let queue: LeadsPage | null = null;
  try {
    // New leads who wrote in, not set aside: the longest wait first.
    queue = await readLeads(context.token, {
      origin: "inbound",
      stage: "new",
      sort: "triage",
      limit: 100,
      conditions: ["nurturing:is:no"],
    });
  } catch (error) {
    if (!(error instanceof HqApiUnavailableError || error instanceof HqApiRequestError))
      throw error;
  }
  const me = context.me.staff.staff_id;
  const waiting = (queue?.leads ?? []).filter(
    (lead) => !lead.owner_staff_id || lead.owner_staff_id === me,
  );
  const remaining = waiting.filter((lead) => !skipped.includes(lead.lead_id));
  const lead = remaining[0] ?? null;
  let alike = 0;
  if (lead) {
    try {
      alike = (await readLeadDuplicates(context.token, { lead: lead.lead_id })).total;
    } catch (error) {
      if (!(error instanceof HqApiUnavailableError || error instanceof HqApiRequestError))
        throw error;
    }
  }
  const names = await directoryOrNull(context.token);
  const canWrite = hasCapability(context, "crm:write");
  const skipHref = lead ? `${BASE}?skip=${[...skipped, lead.lead_id].join(",")}` : BASE;

  return (
    <>
      <PageHeader
        eyebrow="CRM"
        title="Triage"
        description="New leads who wrote in, one at a time, the longest wait first: take it, mark it a duplicate, disqualify it, or set it aside until a date. Your own and nobody's; a colleague's are theirs."
        actions={<LeadTabs current="/leads" />}
      />
      <div className="page-content">
        {queue === null ? (
          <Callout tone="danger" role="alert">
            The new leads could not be read just now. This is a read failure, not an empty queue.
          </Callout>
        ) : (
          <>
            <StatGrid columns={3} label="The queue">
              <Stat label="To triage" value={formatNumber(waiting.length)} />
              <Stat
                label="Waiting past the hour"
                value={formatNumber(waiting.filter((item) => item.first_reply_overdue).length)}
                tone={waiting.some((item) => item.first_reply_overdue) ? "danger" : "default"}
              />
              <Stat
                label="Dealt with or skipped"
                value={formatNumber(skipped.length)}
                hint="this round"
              />
            </StatGrid>
            {!lead ? (
              <Callout tone="neutral">
                {waiting.length
                  ? "You skipped the rest. "
                  : "Nothing to triage: every new lead who wrote in has an owner or is set aside. "}
                <Link href="/leads">Back to the leads</Link>
                {skipped.length ? (
                  <>
                    {" · "}
                    <Link href={BASE}>Start again</Link>
                  </>
                ) : null}
              </Callout>
            ) : (
              <RecordSection
                id="triage-lead"
                title={lead.full_name || lead.email || "Unnamed lead"}
              >
                {canWrite && <TriageKeys />}
                <div className="triage">
                  <div className="triage__lead">
                    <p className="triage__meta">
                      <LeadStagePill stage={lead.stage} />{" "}
                      <FirstReplyClock
                        firstRepliedAt={lead.first_replied_at}
                        waitingMinutes={lead.waiting_minutes}
                        overdue={lead.first_reply_overdue}
                        targetMinutes={queue.first_reply_target_minutes}
                      />
                    </p>
                    <KeyValue>
                      <KeyValueRow label="Email" mono>
                        {lead.email || "None given"}
                      </KeyValueRow>
                      <KeyValueRow label="Firm">{lead.company_name || "None given"}</KeyValueRow>
                      <KeyValueRow label="Came in">
                        <Timestamp value={lead.created_at} now={now} mode="relative" />
                      </KeyValueRow>
                      <KeyValueRow label="Owner">
                        {lead.owner_staff_id ? nameFor(names, lead.owner_staff_id) : "Nobody yet"}
                      </KeyValueRow>
                    </KeyValue>
                    {lead.message ? (
                      <blockquote className="triage__message">{lead.message}</blockquote>
                    ) : (
                      <p className="table-sub">They left no message.</p>
                    )}
                    <p className="table-sub">
                      <Link href={`/leads/${lead.lead_id}`}>Open the whole record</Link>
                    </p>
                  </div>
                  {canWrite ? (
                    <div className="triage__acts">
                      <ActForm
                        action={takeLeadAction}
                        hidden={{
                          lead_id: lead.lead_id,
                          owner_staff_id: lead.owner_staff_id,
                          skip: skipped.join(","),
                        }}
                        act="take"
                        label={lead.owner_staff_id === me ? "1 · It is mine: next" : "1 · Take it"}
                        primary
                      >
                        <input type="hidden" name="triage" value="take" data-triage-key="1" />
                      </ActForm>
                      {alike > 0 ? (
                        <ButtonLink
                          href={`/leads/duplicates?lead=${lead.lead_id}`}
                          size="small"
                          data-triage-key="2"
                        >
                          2 · Look-alikes ({alike})
                        </ButtonLink>
                      ) : (
                        <p className="table-sub triage__none">2 · No look-alikes found</p>
                      )}
                      <ActForm
                        action={disqualifyFromTriageAction}
                        hidden={{ lead_id: lead.lead_id, skip: skipped.join(",") }}
                        act="disqualify"
                        label="3 · Disqualify"
                      >
                        <Field id="triage-reason" label="Why">
                          <Select
                            id="triage-reason"
                            name="disqualify_reason"
                            defaultValue="not_a_fit"
                            data-triage-key="3"
                          >
                            {Object.entries(DISQUALIFY_LABELS).map(([value, label]) => (
                              <option key={value} value={value}>
                                {label}
                              </option>
                            ))}
                          </Select>
                        </Field>
                      </ActForm>
                      <ActForm
                        action={nurtureLeadAction}
                        hidden={{ lead_id: lead.lead_id, skip: skipped.join(","), from: "triage" }}
                        act="nurture"
                        label="H · Set it aside"
                      >
                        <Field
                          id="triage-until"
                          label="Until"
                          hint="It comes back to you on the day, unread."
                        >
                          <Input
                            id="triage-until"
                            name="until"
                            type="date"
                            defaultValue={isoDayPlus(now, 30)}
                            min={isoDayPlus(now, 1)}
                            required
                            data-triage-key="h"
                          />
                        </Field>
                        <Field id="triage-why" label="In a line">
                          <Input
                            id="triage-why"
                            name="note"
                            maxLength={400}
                            placeholder="Budget opens in January."
                          />
                        </Field>
                      </ActForm>
                      <ButtonLink href={skipHref} size="small" variant="ghost" data-triage-key="j">
                        J · Skip for now
                      </ButtonLink>
                    </div>
                  ) : (
                    <p className="page-note">Your role reads the CRM without writing to it.</p>
                  )}
                </div>
              </RecordSection>
            )}
          </>
        )}
      </div>
    </>
  );
}
