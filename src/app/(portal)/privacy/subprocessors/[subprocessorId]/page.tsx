import Link from "next/link";
import { notFound } from "next/navigation";

import { actOnSubprocessorAction } from "@/app/(portal)/privacy/actions";
import { EventTimeline } from "@/components/privacy/event-timeline";
import { SubprocessorStatusPill } from "@/components/privacy/privacy-pills";
import { ActForm } from "@/components/ui/act-form";
import { PageHeader } from "@/components/shell/page-header";
import { Callout } from "@/components/ui/callout";
import { Card } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import {
  Properties,
  Property,
  RecordGrid,
  RecordHeader,
  RecordSection,
} from "@/components/ui/record-shell";
import { hasCapability, requireStaff } from "@/lib/access/core";
import { HqApiRequestError, HqApiUnavailableError } from "@/lib/api/core";
import { readSubprocessor, type SubprocessorDetail } from "@/lib/api/privacy";
import { formatDate } from "@/lib/format";
import { requestNow } from "@/lib/request-time";

export const metadata = { title: "Sub-processor" };
export const dynamic = "force-dynamic";

const EVENT_LABELS: Record<string, string> = {
  created: "Added",
  update: "Updated",
  send_notices: "Notices mailed",
  record_notice: "Notice recorded",
  objection: "Objection",
  resolve: "Objection settled",
  activate: "Active",
  retire: "Retired",
  note: "Note",
};

const NOTICE_COLUMNS = [
  { key: "customer", label: "Customer" },
  { key: "sent", label: "Told" },
  { key: "to", label: "Sent to" },
  { key: "window", label: "May object until" },
  { key: "objection", label: "Objection" },
];

const RESOLUTIONS: Record<string, string> = {
  withdrawn: "They withdrew it",
  accommodated: "Accommodated",
  terminated: "They ended the service",
};

type Params = Promise<{ subprocessorId: string }>;

/**
 * One sub-processor: what it does with whose data, where, and the change notice — mailed
 * to each customer's privacy contact (or recorded as sent by hand), their objection
 * windows, any objection and how it was settled — and the gate to going live.
 */
export default async function SubprocessorPage({ params }: { params: Params }) {
  const { subprocessorId } = await params;
  const context = await requireStaff(`/privacy/subprocessors/${subprocessorId}`);
  if (!hasCapability(context, "privacy:read")) {
    return (
      <>
        <PageHeader eyebrow="Desk" title="Sub-processor" />
        <Callout tone="neutral">The privacy desk is run by Support, Admins and Owners.</Callout>
      </>
    );
  }
  let detail: SubprocessorDetail | null = null;
  try {
    detail = await readSubprocessor(context.token, subprocessorId);
  } catch (error) {
    if (error instanceof HqApiRequestError && error.status === 404) notFound();
    if (!(error instanceof HqApiUnavailableError || error instanceof HqApiRequestError))
      throw error;
  }
  if (detail === null) {
    return (
      <>
        <PageHeader eyebrow="Sub-processors" title="Sub-processor" />
        <Callout tone="danger" role="alert">
          This sub-processor could not be read just now.
        </Callout>
      </>
    );
  }
  const now = requestNow();
  const { subprocessor: sub } = detail;
  const canWrite = hasCapability(context, "privacy:write") && sub.status !== "retired";
  const hidden = { subprocessor_id: sub.id };
  const changing = sub.status === "proposed" || sub.status === "notice_sent";
  const today = new Date(now).toISOString().slice(0, 10);
  const withContact = detail.unnoticed.filter((item) => item.contact).length;
  const objected = detail.notices.filter((item) => item.objected_on && !item.resolution);

  return (
    <>
      <RecordHeader
        crumbs={[{ href: "/privacy/subprocessors", label: "Sub-processors" }]}
        title={sub.legal_name}
        status={<SubprocessorStatusPill status={sub.status} />}
        readouts={[
          { label: "Customers told", value: sub.notices_sent },
          { label: "Still to tell", value: changing ? sub.customers_unnoticed : "—" },
          { label: "Open objections", value: sub.open_objections },
          {
            label: sub.status === "active" ? "Active since" : "Earliest live",
            value:
              sub.status === "active"
                ? formatDate(sub.activated_on, "—")
                : formatDate(sub.effective_on, "—"),
          },
        ]}
      />
      {sub.status === "notice_sent" && sub.blockers.length > 0 && (
        <Callout tone="attention" compact>
          Not ready to go live: {sub.blockers.join("; ")}.
        </Callout>
      )}
      <RecordGrid
        side={
          <Properties title="What it does">
            <Property label="Service">{sub.service || "—"}</Property>
            <Property label="Purpose">{sub.purpose || "—"}</Property>
            <Property label="Whose data">{sub.data_categories || "—"}</Property>
            <Property label="Where">{sub.locations || "—"}</Property>
            <Property label="Transfer">{sub.transfer_label}</Property>
            <Property label="DPA signed">{formatDate(sub.dpa_signed_on, "—")}</Property>
            {sub.notice_sent_on && (
              <Property label="Notice began">{formatDate(sub.notice_sent_on)}</Property>
            )}
            {sub.retired_on && <Property label="Retired">{formatDate(sub.retired_on)}</Property>}
          </Properties>
        }
      >
        {(changing || detail.notices.length > 0) && (
          <RecordSection id="notices" title="Customers told">
            <DataTable
              caption="Change notices and objections"
              columns={NOTICE_COLUMNS}
              isEmpty={detail.notices.length === 0}
              empty={<p className="muted">Nobody told yet.</p>}
            >
              {detail.notices.map((item) => (
                <tr key={item.company_id}>
                  <td>
                    <Link href={`/companies/${item.company_id}?tab=privacy`}>
                      {item.company_name}
                    </Link>
                  </td>
                  <td>{formatDate(item.sent_on, "—")}</td>
                  <td>{item.sent_to}</td>
                  <td>
                    {formatDate(item.objection_deadline, "—")}
                    {item.window_open && <span className="quiet"> · open</span>}
                  </td>
                  <td>
                    {item.objected_on
                      ? `${formatDate(item.objected_on)}: ${item.objection}${
                          item.resolution
                            ? ` — ${RESOLUTIONS[item.resolution] ?? item.resolution}`
                            : ""
                        }`
                      : "None"}
                  </td>
                </tr>
              ))}
            </DataTable>
          </RecordSection>
        )}

        {canWrite && changing && (
          <RecordSection id="tell" title="Tell the customers">
            {detail.unnoticed.length === 0 ? (
              <p className="muted">Every customer with a contract in force has been told.</p>
            ) : (
              <>
                <p className="page-note">
                  {detail.unnoticed.length} still to tell; {withContact} have a privacy contact on
                  record. Each gets the notice below, with their own objection window.
                </p>
                <div className="form-grid">
                  <Card
                    title="Mail the notice"
                    titleAs="h3"
                    description={
                      detail.mail_ready
                        ? `One message to each privacy contact (${withContact}). The rest are listed so you can add a contact or tell them yourself.`
                        : "Mail is not set up, so nothing can leave HQ. Send it yourself and record each one."
                    }
                  >
                    {withContact === 0 ? (
                      <p className="muted">
                        None of them has a privacy contact on record. Add one on their Privacy tab,
                        or tell them yourself and record it.
                      </p>
                    ) : (
                      <ActForm
                        action={actOnSubprocessorAction}
                        hidden={hidden}
                        act="send_notices"
                        label={`Mail ${withContact} notice${withContact === 1 ? "" : "s"}`}
                        primary
                        disabled={!detail.mail_ready}
                      />
                    )}
                  </Card>
                  <Card
                    title="Told another way"
                    titleAs="h3"
                    description="Sent from your own mailbox or their portal: record where and when. Their window runs from that day."
                  >
                    <ActForm
                      action={actOnSubprocessorAction}
                      hidden={hidden}
                      act="record_notice"
                      label="Record the notice"
                    >
                      <Field id="notice-company" label="Customer">
                        <Select id="notice-company" name="company_id" defaultValue="">
                          <option value="">Choose</option>
                          {detail.unnoticed.map((item) => (
                            <option key={item.company_id} value={item.company_id}>
                              {item.company_name}
                            </option>
                          ))}
                        </Select>
                      </Field>
                      <Field id="notice-to" label="Sent to">
                        <Input id="notice-to" name="sent_to" maxLength={254} />
                      </Field>
                      <Field id="notice-on" label="Sent on">
                        <Input
                          id="notice-on"
                          name="sent_on"
                          type="date"
                          defaultValue={today}
                          max={today}
                        />
                      </Field>
                    </ActForm>
                  </Card>
                </div>
                <DataTable
                  caption="Customers still to tell"
                  columns={[
                    { key: "customer", label: "Customer" },
                    { key: "contact", label: "Privacy contact" },
                    { key: "notice", label: "Notice owed (days)", align: "end" as const },
                    { key: "window", label: "Objection window (days)", align: "end" as const },
                  ]}
                  isEmpty={false}
                  empty={null}
                >
                  {detail.unnoticed.map((item) => (
                    <tr key={item.company_id}>
                      <td>
                        <Link href={`/companies/${item.company_id}?tab=privacy`}>
                          {item.company_name}
                        </Link>
                      </td>
                      <td>{item.contact || "None: add one on their Privacy tab"}</td>
                      <td className="data-table__num">{item.notice_days}</td>
                      <td className="data-table__num">{item.objection_days}</td>
                    </tr>
                  ))}
                </DataTable>
                <details className="disclosure">
                  <summary>The notice they receive</summary>
                  <p className="prewrap">
                    <strong>{detail.draft.subject}</strong>
                    {"\n\n"}
                    {detail.draft.body}
                  </p>
                </details>
              </>
            )}
          </RecordSection>
        )}

        {canWrite && (
          <RecordSection id="work" title="Work it">
            <div className="form-grid">
              {sub.notices_sent > 0 && (
                <Card
                  title="A customer objected"
                  titleAs="h3"
                  description="Record it in their words. It must be settled before this goes live."
                >
                  <ActForm
                    action={actOnSubprocessorAction}
                    hidden={hidden}
                    act="objection"
                    label="Record the objection"
                  >
                    <Field id="objection-company" label="Customer">
                      <Select id="objection-company" name="company_id" defaultValue="">
                        <option value="">Choose</option>
                        {detail.notices.map((item) => (
                          <option key={item.company_id} value={item.company_id}>
                            {item.company_name}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <Field id="objection-text" label="What they object to">
                      <Textarea id="objection-text" name="objection" rows={2} maxLength={2000} />
                    </Field>
                  </ActForm>
                </Card>
              )}
              {objected.length > 0 && (
                <Card title="Settle an objection" titleAs="h3">
                  <ActForm
                    action={actOnSubprocessorAction}
                    hidden={hidden}
                    act="resolve"
                    label="Settle it"
                  >
                    <Field id="resolve-company" label="Customer">
                      <Select id="resolve-company" name="company_id" defaultValue="">
                        <option value="">Choose</option>
                        {objected.map((item) => (
                          <option key={item.company_id} value={item.company_id}>
                            {item.company_name}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <Field id="resolve-how" label="How it ended">
                      <Select id="resolve-how" name="resolution" defaultValue="accommodated">
                        {Object.entries(RESOLUTIONS).map(([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <Field id="resolve-note" label="Note">
                      <Input id="resolve-note" name="note" maxLength={400} />
                    </Field>
                  </ActForm>
                </Card>
              )}
              {changing && (
                <Card
                  title="Go live"
                  titleAs="h3"
                  description={
                    sub.can_activate
                      ? "Every customer told, the notice run, no objection open."
                      : sub.blockers.length
                        ? `Waiting: ${sub.blockers.join("; ")}.`
                        : "Tell the customers first."
                  }
                >
                  <ActForm
                    action={actOnSubprocessorAction}
                    hidden={hidden}
                    act="activate"
                    label="Mark active"
                    primary
                    disabled={!sub.can_activate}
                  />
                </Card>
              )}
              {sub.status === "active" && (
                <Card
                  title="Retire it"
                  titleAs="h3"
                  description="No longer used. Say what happened to the data it held."
                >
                  <ActForm
                    action={actOnSubprocessorAction}
                    hidden={hidden}
                    act="retire"
                    label="Retire"
                    danger
                  >
                    <Field id="retire-reason" label="Why, and the data">
                      <Textarea id="retire-reason" name="reason" rows={2} maxLength={1000} />
                    </Field>
                  </ActForm>
                </Card>
              )}
              <Card title="A note on the timeline" titleAs="h3">
                <ActForm
                  action={actOnSubprocessorAction}
                  hidden={hidden}
                  act="note"
                  label="Add the note"
                >
                  <Field id="sub-note" label="Note">
                    <Textarea id="sub-note" name="note" rows={2} maxLength={2000} />
                  </Field>
                </ActForm>
              </Card>
            </div>
          </RecordSection>
        )}

        <RecordSection id="timeline" title="Timeline">
          <EventTimeline events={detail.events} labels={EVENT_LABELS} now={now} />
        </RecordSection>
      </RecordGrid>
    </>
  );
}
