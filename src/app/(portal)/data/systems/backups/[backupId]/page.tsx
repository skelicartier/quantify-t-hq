import Link from "next/link";
import { notFound } from "next/navigation";

import { DataUnavailable } from "@/components/data/data-down";
import { CopyFields } from "@/components/data/meetings/copy-fields";
import { BackupFields, RestoreFields } from "@/components/data/recovery/backup-fields";
import { BackupLines } from "@/components/data/recovery/backup-lines";
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
import { readBackup, type BackupPage } from "@/lib/data/api/recovery";
import { FLAGS, dayWords } from "@/lib/data/labels-company";
import { NOT_ADVICE } from "@/lib/data/labels-controls";
import { BACKUP_KINDS, HOW_OFTEN, OUTCOMES } from "@/lib/data/labels-devices";
import { dataRead } from "@/lib/data/read";
import { requestNow } from "@/lib/request-time";

import { recordRestoreAction, retireBackupAction, updateBackupAction } from "../actions";
import "@/components/data/devices/devices.css";

export const metadata = { title: "Backup" };
export const dynamic = "force-dynamic";

const BASE = "/data/systems/backups";
const BACKUP_ID = /^[A-Za-z0-9-]{1,64}$/;

const EVENT_WORDS: Record<string, string> = {
  added: "Added",
  changed: "Changed",
  "restore test recorded": "Restore test recorded",
  retired: "Retired",
};

export default async function BackupRecordPage({
  params,
}: {
  params: Promise<{ backupId: string }>;
}) {
  const { backupId } = await params;
  const { allowed } = await requireData(`${BASE}/${backupId}`);
  if (!BACKUP_ID.test(backupId)) notFound();
  const now = requestNow();
  const read = allowed ? await dataRead(() => readBackup(backupId)) : null;
  if (!allowed || !read || !read.ok)
    return (
      <>
        <PageHeader title="Backup" />
        <div className="page-content">
          {!allowed || !read ? (
            <Callout tone="neutral">{DATA_ROLE_LINE}</Callout>
          ) : (
            !read.ok && <DataUnavailable failure={read} />
          )}
        </div>
      </>
    );
  return <BackupRecord page={read.data} now={now} />;
}

function BackupRecord({ page, now }: { page: BackupPage; now: number }) {
  const { backup } = page;
  const fields = { backup_id: backup.backup_id };
  return (
    <>
      <RecordHeader
        crumbs={[
          { href: "/data/systems", label: "Systems" },
          { href: BASE, label: "Backups" },
        ]}
        title={backup.name}
        status={
          backup.retired ? (
            <StatusPill value="retired" label="Retired" tone="neutral" />
          ) : backup.due ? (
            <StatusPill value="due" label="Restore test due" tone="attention" />
          ) : undefined
        }
        readouts={[
          {
            label: "Last restore test",
            value: backup.last_test ? dayWords(backup.last_test.on) : "Never",
          },
          { label: "How long", value: backup.last_minutes ?? "Not recorded" },
          { label: "Next test", value: backup.next_test ? dayWords(backup.next_test) : "None" },
        ]}
        actions={
          backup.retired ? undefined : (
            <>
              <Popover label="Edit" align="start" width="wide">
                <MailForm
                  action={updateBackupAction}
                  fields={fields}
                  submitLabel="Save"
                  pendingLabel="Saving…"
                  className="stack-form stack-form--tight"
                >
                  <BackupFields
                    prefix="backup-edit"
                    values={backup}
                    tools={page.tools}
                    toolsLoaded={page.tools_loaded}
                    dataListed
                  />
                </MailForm>
              </Popover>
              <Popover label="Retire" align="start">
                <MailForm
                  action={retireBackupAction}
                  fields={fields}
                  submitLabel="Retire it"
                  pendingLabel="Saving…"
                >
                  <Field id="backup-retire-on" label="On">
                    <Input
                      id="backup-retire-on"
                      name="on"
                      type="date"
                      max={page.today}
                      defaultValue={page.today}
                    />
                  </Field>
                  <Field id="backup-retire-why" label="Why">
                    <Input id="backup-retire-why" name="why" required maxLength={300} />
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
            <SystemsTabs current="backups" />
          </div>
          <p className="page-note">{NOT_ADVICE}</p>
          <RecordSection
            id="backup-tests"
            title="Restore tests"
            actions={
              backup.retired ? undefined : (
                <Popover label="Record a restore test" variant="primary" align="end" width="wide">
                  <MailForm
                    action={recordRestoreAction}
                    fields={fields}
                    submitLabel="Record the restore"
                    pendingLabel="Recording…"
                    className="stack-form stack-form--tight"
                  >
                    <RestoreFields prefix="backup-test" today={page.today} />
                    <CopyFields
                      prefix="backup-test-copy"
                      label="A file to keep with it"
                      files={page.files}
                      filesHere={page.files_here}
                      folder="Security › Backups"
                    />
                  </MailForm>
                </Popover>
              )
            }
          >
            <p>
              <ControlRefNote refs={["a8_13"]} />
            </p>
            {backup.next_test && (
              <p>
                {backup.words}.{" "}
                <PracticeNote
                  practice="restore_test"
                  {...(backup.every_months !== 3 ? { amount: backup.every_months } : {})}
                />
              </p>
            )}
            {backup.kind === "hq_data" && backup.downloaded && (
              <p>
                {backup.downloaded.endsWith(".") ? backup.downloaded : `${backup.downloaded}.`}{" "}
                <Link className="text-link" href="/data#data-backup">
                  Make one
                </Link>
              </p>
            )}
            <BackupLines lines={backup.lines} />
            <DataTable
              caption="Restore tests"
              columns={[
                { key: "on", label: "On" },
                { key: "by", label: "By" },
                { key: "long", label: "How long" },
                { key: "outcome", label: "Outcome" },
                { key: "what", label: "What was restored" },
                { key: "file", label: "File" },
              ]}
              columnMenu={false}
              isEmpty={backup.tests.length === 0}
              empty={
                <p className="page-note">
                  Never restore-tested. A backup is only proven by restoring it.
                </p>
              }
            >
              {backup.tests.map((test) => (
                <tr key={test.test_id}>
                  <td className="nowrap">{dayWords(test.on)}</td>
                  <td>{test.by_name}</td>
                  <td>{test.how_long ?? <span className="quiet">Not recorded</span>}</td>
                  <td>
                    {OUTCOMES[test.outcome]}
                    {test.note && <span className="table-sub">{test.note}</span>}
                  </td>
                  <td>{test.what_restored || <span className="quiet">Not written</span>}</td>
                  <td>
                    {test.file ? (
                      <Link className="text-link" href={`/data/files/${test.file.file_id}`}>
                        {test.file.title}
                      </Link>
                    ) : (
                      <span className="quiet">None kept</span>
                    )}
                  </td>
                </tr>
              ))}
            </DataTable>
          </RecordSection>
          <RecordSection id="backup-activity" title="Activity">
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

function Side({ page }: { page: BackupPage }) {
  const { backup } = page;
  return (
    <Properties title="Backup">
      <Property label="Kind">{BACKUP_KINDS[backup.kind]}</Property>
      {backup.tool && (
        <Property label="Tool in Systems">
          <Link className="text-link" href={backup.tool.href}>
            {backup.tool.name}
          </Link>
        </Property>
      )}
      <Property label="What it holds">{backup.what || "Not recorded"}</Property>
      <Property label="How often">{HOW_OFTEN[backup.how_often]}</Property>
      <Property label="Where it is kept">{backup.where || "Not recorded"}</Property>
      <Property label="A copy away from the system">{FLAGS[backup.off_system]}</Property>
      <Property label="A copy nobody can change">{FLAGS[backup.cannot_be_changed]}</Property>
      <Property label="Who looks after it">{backup.owner || "Not recorded"}</Property>
      <Property label="Restore test every">
        {backup.every_months === 1 ? "Month" : `${backup.every_months} months`}
      </Property>
      {backup.retired && (
        <Property label="Retired">
          {dayWords(backup.retired.on)}: {backup.retired.why}
        </Property>
      )}
      {backup.notes && <Property label="Notes">{backup.notes}</Property>}
    </Properties>
  );
}
