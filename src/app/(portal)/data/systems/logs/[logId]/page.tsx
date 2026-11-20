import Link from "next/link";
import { notFound } from "next/navigation";

import { DataUnavailable } from "@/components/data/data-down";
import { LogFields, LookFields } from "@/components/data/logs/log-fields";
import { LogLines } from "@/components/data/logs/log-lines";
import { CopyFields } from "@/components/data/meetings/copy-fields";
import { ControlRefNote, PracticeNote } from "@/components/data/security/control-ref";
import { SystemsTabs } from "@/components/data/systems/systems-tabs";
import { MailForm } from "@/components/mail/mail-form";
import { PageHeader } from "@/components/shell/page-header";
import { Callout } from "@/components/ui/callout";
import { DataTable } from "@/components/ui/data-table";
import { Field, Input } from "@/components/ui/field";
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
import { readLog, type LogPage } from "@/lib/data/api/logs";
import { FLAGS, dayWords } from "@/lib/data/labels-company";
import { LOG_KINDS, NOT_ADVICE, countWords } from "@/lib/data/labels-controls";
import { LOG_PLACES, TIME_SOURCES } from "@/lib/data/labels-devices";
import { dataRead } from "@/lib/data/read";
import { requestNow } from "@/lib/request-time";

import { recordLookAction, retireLogAction, updateLogAction } from "../actions";
import "@/components/data/devices/devices.css";
import "@/components/data/logs/logs.css";

export const metadata = { title: "Logs and time" };
export const dynamic = "force-dynamic";

const BASE = "/data/systems/logs";
const LOG_ID = /^[A-Za-z0-9-]{1,64}$/;

const EVENT_WORDS: Record<string, string> = {
  added: "Added",
  changed: "Changed",
  "looked at": "Looked at",
  retired: "Retired",
};

export default async function LogRecordPage({ params }: { params: Promise<{ logId: string }> }) {
  const { logId } = await params;
  const { allowed } = await requireData(`${BASE}/${logId}`);
  if (!LOG_ID.test(logId)) notFound();
  const now = requestNow();
  const read = allowed ? await dataRead(() => readLog(logId)) : null;
  if (!allowed || !read || !read.ok)
    return (
      <>
        <PageHeader title="Logs and time" />
        <div className="page-content">
          {!allowed || !read ? (
            <Callout tone="neutral">{DATA_ROLE_LINE}</Callout>
          ) : (
            !read.ok && <DataUnavailable failure={read} />
          )}
        </div>
      </>
    );
  return <LogRecord page={read.data} now={now} />;
}

function LogRecord({ page, now }: { page: LogPage; now: number }) {
  const { system } = page;
  const fields = { log_id: system.log_id };
  return (
    <>
      <RecordHeader
        crumbs={[
          { href: "/data/systems", label: "Systems" },
          { href: BASE, label: "Logs and time" },
        ]}
        title={system.name}
        status={
          system.retired ? (
            <StatusPill value="retired" label="Retired" tone="neutral" />
          ) : system.overdue ? (
            <StatusPill value="overdue" label="Look overdue" tone="danger" />
          ) : undefined
        }
        readouts={[
          {
            label: "Kept",
            value:
              system.retention_days === null
                ? "Not recorded"
                : countWords(system.retention_days, "day"),
          },
          { label: "In India", value: LOG_PLACES[system.place] },
          { label: "Time source", value: TIME_SOURCES[system.time_source] },
        ]}
        actions={
          system.retired ? undefined : (
            <>
              <Popover label="Edit" align="start" width="wide">
                <MailForm
                  action={updateLogAction}
                  fields={fields}
                  submitLabel="Save"
                  pendingLabel="Saving…"
                  className="stack-form stack-form--tight"
                >
                  <LogFields
                    prefix="log-edit"
                    values={system}
                    tools={page.tools}
                    toolsLoaded={page.tools_loaded}
                  />
                </MailForm>
              </Popover>
              <Popover label="Retire" align="start">
                <MailForm
                  action={retireLogAction}
                  fields={fields}
                  submitLabel="Retire it"
                  pendingLabel="Saving…"
                >
                  <Field id="log-retire-on" label="On">
                    <Input
                      id="log-retire-on"
                      name="on"
                      type="date"
                      max={page.today}
                      defaultValue={page.today}
                    />
                  </Field>
                  <Field id="log-retire-why" label="Why">
                    <Input id="log-retire-why" name="why" required maxLength={300} />
                  </Field>
                </MailForm>
              </Popover>
            </>
          )
        }
      />
      <RecordGrid side={<Side page={page} />}>
        <div className="hqdata-device">
          <div className="hqdata-device__tabs">
            <SystemsTabs current="logs" />
          </div>
          <p className="page-note">{NOT_ADVICE}</p>
          <RecordSection id="log-checks" title="What its record says">
            <p>
              <ControlRefNote refs={["certin_iv", "certin_i", "a8_15", "a8_17"]} />
            </p>
            {system.lines.length === 0 ? (
              <p className="page-note">Nothing to look at.</p>
            ) : (
              <LogLines lines={system.lines} rules={page.rules} readings={page.readings} />
            )}
          </RecordSection>
          <RecordSection
            id="log-looks"
            title="Looks"
            actions={
              system.retired ? undefined : (
                <Popover label="Record a look" variant="primary" align="end" width="wide">
                  <MailForm
                    action={recordLookAction}
                    fields={fields}
                    submitLabel="Record the look"
                    pendingLabel="Recording…"
                    className="stack-form stack-form--tight"
                  >
                    <LookFields prefix="log-look" today={page.today} />
                    <CopyFields
                      prefix="log-look-copy"
                      label="A file to keep with it"
                      files={page.files}
                      filesHere={page.files_here}
                      folder="Security › Logs"
                    />
                  </MailForm>
                </Popover>
              )
            }
          >
            {system.next_look && (
              <p>
                Next look by {dayWords(system.next_look)}.{" "}
                <PracticeNote
                  practice="log_check"
                  {...(page.setup.check_months !== null ? { amount: page.setup.check_months } : {})}
                />
              </p>
            )}
            <DataTable
              caption="Looks"
              columns={[
                { key: "on", label: "On" },
                { key: "by", label: "By" },
                { key: "note", label: "What was looked at" },
                { key: "file", label: "File" },
              ]}
              columnMenu={false}
              isEmpty={system.checks.length === 0}
              empty={
                <p className="page-note">
                  No look recorded yet. Adding it, on {dayWords(system.added_on)}, counts as the
                  first.
                </p>
              }
            >
              {system.checks.map((look) => (
                <tr key={look.check_id}>
                  <td className="nowrap">{dayWords(look.on)}</td>
                  <td>{look.by_name}</td>
                  <td className="hqdata-devices__prose">{look.note || "Not written"}</td>
                  <td>
                    {look.file ? (
                      <Link className="text-link" href={`/data/files/${look.file.file_id}`}>
                        {look.file.title}
                      </Link>
                    ) : (
                      <span className="quiet">None kept</span>
                    )}
                  </td>
                </tr>
              ))}
            </DataTable>
          </RecordSection>
          <RecordSection id="log-activity" title="Activity">
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

function Side({ page }: { page: LogPage }) {
  const { system } = page;
  return (
    <Properties title="System">
      <Property label="Tool in Systems">
        {system.tool ? (
          <Link className="text-link" href={system.tool.href}>
            {system.tool.name}
          </Link>
        ) : (
          "Something else"
        )}
      </Property>
      <Property label="What it logs">
        {system.kinds.length === 0
          ? "Not recorded"
          : system.kinds.map((kind) => LOG_KINDS[kind]).join(", ")}
      </Property>
      <Property label="Where they go">{system.where || "Not recorded"}</Property>
      <Property label="Region">{system.region || "Not recorded"}</Property>
      <Property label="Server or service" mono>
        {system.time_detail || "Not recorded"}
      </Property>
      <Property label="Time zone kept with each time">{FLAGS[system.zone_recorded]}</Property>
      {system.retired && (
        <Property label="Retired">
          {dayWords(system.retired.on)}: {system.retired.why}
        </Property>
      )}
      {system.notes && <Property label="Notes">{system.notes}</Property>}
    </Properties>
  );
}
