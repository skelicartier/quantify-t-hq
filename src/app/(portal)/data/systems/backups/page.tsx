import Link from "next/link";

import { DataUnavailable } from "@/components/data/data-down";
import { BackupFields } from "@/components/data/recovery/backup-fields";
import { BackupLines } from "@/components/data/recovery/backup-lines";
import { ControlRefNote, PracticeNote } from "@/components/data/security/control-ref";
import { SystemsTabs } from "@/components/data/systems/systems-tabs";
import { MailForm } from "@/components/mail/mail-form";
import { PageHeader } from "@/components/shell/page-header";
import { Callout } from "@/components/ui/callout";
import { DataTable } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { Popover } from "@/components/ui/popover";
import { StatusPill } from "@/components/ui/status-pill";
import { DATA_ROLE_LINE, requireData } from "@/lib/data/access";
import { readBackups, type BackupRow, type BackupsPage } from "@/lib/data/api/recovery";
import { FLAGS, dayWords } from "@/lib/data/labels-company";
import { NOT_ADVICE, countWords } from "@/lib/data/labels-controls";
import {
  BACKUPS_ABOUT,
  BACKUPS_EMPTY,
  DATA_BACKUP,
  HOW_OFTEN,
  OUTCOMES,
} from "@/lib/data/labels-devices";
import { dataRead } from "@/lib/data/read";

import { addBackupAction } from "./actions";
import "@/components/data/devices/devices.css";

export const metadata = { title: "Backups" };
export const dynamic = "force-dynamic";

const BASE = "/data/systems/backups";
const MAKE_ONE = "/data#data-backup";

export default async function BackupsRegisterPage() {
  const { allowed } = await requireData(BASE);
  const read = allowed ? await dataRead(readBackups) : null;
  const data = read?.ok ? read.data : null;
  return (
    <>
      <PageHeader
        title="Backups"
        description={`${BACKUPS_ABOUT} ${NOT_ADVICE}`}
        meta={
          data ? (
            <span className="quiet">{countWords(data.counts.backups, "backup")}</span>
          ) : undefined
        }
        actions={
          data ? (
            <>
              {data.backups.length > 0 && (
                <a className="btn btn--small" href={`${BASE}/export`}>
                  Download
                </a>
              )}
              <Popover label="Add a backup" variant="primary" align="end" width="wide">
                <MailForm
                  action={addBackupAction}
                  submitLabel="Add the backup"
                  pendingLabel="Adding…"
                  className="stack-form stack-form--tight"
                >
                  <BackupFields
                    prefix="backup-new"
                    values={null}
                    tools={data.tools}
                    toolsLoaded={data.tools_loaded}
                    dataListed={data.data_listed}
                  />
                </MailForm>
              </Popover>
            </>
          ) : undefined
        }
      />
      <div className="page-content">
        <SystemsTabs current="backups" />
        {!allowed || !read ? (
          <Callout tone="neutral">{DATA_ROLE_LINE}</Callout>
        ) : !read.ok ? (
          <DataUnavailable failure={read} />
        ) : (
          <Inventory page={read.data} />
        )}
      </div>
    </>
  );
}

function testCells(row: BackupRow) {
  const test = row.last_test;
  return (
    <>
      <td>
        {test ? (
          <span className="nowrap">{dayWords(test.on)}</span>
        ) : (
          <span className="quiet">Never</span>
        )}
      </td>
      <td>{row.last_minutes ?? <span className="quiet">Not recorded</span>}</td>
      <td>{test ? OUTCOMES[test.outcome] : <span className="quiet">None yet</span>}</td>
      <td>
        {row.retired ? (
          <span className="quiet">{row.words}</span>
        ) : (
          <>
            <span className="nowrap">{dayWords(row.next_test)}</span>
            {!row.tested_in_time && <span className="table-sub">{row.words}</span>}
          </>
        )}
      </td>
    </>
  );
}

/** Words as a sentence: a full stop unless they end in one. */
const sentence = (words: string) => (words.endsWith(".") ? words : `${words}.`);

function DataRow({ page }: { page: BackupsPage }) {
  const words = page.data_backup?.words ?? DATA_BACKUP.never;
  return (
    <tr id="backup-data" className="hqdata-backups__data">
      <td>
        <span className="table-title">{DATA_BACKUP.name}</span>
        <span className="table-sub">
          <Link className="text-link" href={MAKE_ONE}>
            Make one
          </Link>
        </span>
      </td>
      <td>{DATA_BACKUP.what}</td>
      <td>{DATA_BACKUP.how}</td>
      <td>{words}</td>
      <td>
        <span className="quiet">Not recorded</span>
      </td>
      <td>
        <span className="quiet">Never</span>
      </td>
      <td>
        <span className="quiet">Not recorded</span>
      </td>
      <td>
        <span className="quiet">None yet</span>
      </td>
      <td>
        <span className="quiet">Add it to record a restore</span>
      </td>
    </tr>
  );
}

function Inventory({ page }: { page: BackupsPage }) {
  const listed = page.backups;
  const showData = page.data_backup !== null && !page.data_listed;
  return (
    <div className="hqdata-devices">
      <p className="page-note">{NOT_ADVICE}</p>
      <section data-section="backups-inventory">
        <p>
          <ControlRefNote refs={["a8_13"]} />
        </p>
        <p>
          <PracticeNote practice="restore_test" />
        </p>
        <DataTable
          caption="Backups"
          minWidth={1100}
          columns={[
            { key: "backup", label: "Backup", width: "18%" },
            { key: "what", label: "What" },
            { key: "often", label: "How often" },
            { key: "where", label: "Where" },
            { key: "away", label: "Away from the system" },
            { key: "last", label: "Last restore test" },
            { key: "long", label: "How long" },
            { key: "outcome", label: "Outcome" },
            { key: "next", label: "Next test" },
          ]}
          columnMenu={false}
          isEmpty={listed.length === 0 && !showData}
          empty={<EmptyState compact title="No backups" description={BACKUPS_EMPTY} />}
        >
          {showData && <DataRow page={page} />}
          {listed.map((row) => (
            <tr
              key={row.backup_id}
              id={`backup-${row.backup_id}`}
              className={row.retired ? "hqdata-devices__gone" : undefined}
            >
              <td>
                <Link className="table-title" href={row.href}>
                  {row.name}
                </Link>
                {row.kind === "hq_data" && (
                  <span className="table-sub">
                    {sentence(row.downloaded ?? "")}{" "}
                    <Link className="text-link" href={MAKE_ONE}>
                      Make one
                    </Link>
                  </span>
                )}
                {row.due && !row.retired && (
                  <span className="table-sub">
                    <StatusPill value="due" label="Restore test due" tone="attention" />
                  </span>
                )}
                <BackupLines lines={row.lines} />
              </td>
              <td>{row.what || <span className="quiet">Not recorded</span>}</td>
              <td>{HOW_OFTEN[row.how_often]}</td>
              <td>{row.where || <span className="quiet">Not recorded</span>}</td>
              <td>{FLAGS[row.off_system]}</td>
              {testCells(row)}
            </tr>
          ))}
        </DataTable>
        {listed.length === 0 && showData && <p className="page-note">{BACKUPS_EMPTY}</p>}
      </section>
    </div>
  );
}
