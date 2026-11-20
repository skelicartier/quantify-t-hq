import Link from "next/link";

import { DataUnavailable } from "@/components/data/data-down";
import { LogFields } from "@/components/data/logs/log-fields";
import { CertInAsks, LogLines } from "@/components/data/logs/log-lines";
import { PracticeNote } from "@/components/data/security/control-ref";
import { SystemsTabs } from "@/components/data/systems/systems-tabs";
import { MailForm } from "@/components/mail/mail-form";
import { PageHeader } from "@/components/shell/page-header";
import { Callout } from "@/components/ui/callout";
import { DataTable } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input } from "@/components/ui/field";
import { Popover } from "@/components/ui/popover";
import { StatusPill } from "@/components/ui/status-pill";
import { DATA_ROLE_LINE, requireData } from "@/lib/data/access";
import { readLogs, type LogRow, type LogsPage } from "@/lib/data/api/logs";
import { dayWords } from "@/lib/data/labels-company";
import { LOG_KINDS, NOT_ADVICE, countWords, notLoaded } from "@/lib/data/labels-controls";
import { LOGS_ABOUT, LOGS_EMPTY, LOG_PLACES, TIME_SOURCES } from "@/lib/data/labels-devices";
import { dataRead } from "@/lib/data/read";

import { addLogAction, saveLogsSetupAction } from "./actions";
import "@/components/data/devices/devices.css";
import "@/components/data/logs/logs.css";

export const metadata = { title: "Logs and time" };
export const dynamic = "force-dynamic";

const BASE = "/data/systems/logs";

export default async function LogsRegisterPage() {
  const { allowed } = await requireData(BASE);
  const read = allowed ? await dataRead(readLogs) : null;
  const data = read?.ok ? read.data : null;
  return (
    <>
      <PageHeader
        title="Logs and time"
        description={`${LOGS_ABOUT} ${NOT_ADVICE}`}
        meta={
          data ? (
            <span className="quiet">{countWords(data.counts.systems, "system")}</span>
          ) : undefined
        }
        actions={data ? <HeaderActions page={data} /> : undefined}
      />
      <div className="page-content">
        <SystemsTabs current="logs" />
        {!allowed || !read ? (
          <Callout tone="neutral">{DATA_ROLE_LINE}</Callout>
        ) : !read.ok ? (
          <DataUnavailable failure={read} />
        ) : (
          <Register page={read.data} />
        )}
      </div>
    </>
  );
}

function HeaderActions({ page }: { page: LogsPage }) {
  return (
    <>
      <Popover label="Settings" align="end">
        <MailForm action={saveLogsSetupAction} submitLabel="Save" pendingLabel="Saving…">
          <Field id="logs-setup-months" label="Look at each system every … months">
            <Input
              id="logs-setup-months"
              name="check_months"
              type="number"
              min={1}
              max={12}
              step={1}
              inputMode="numeric"
              defaultValue={page.setup.check_months ?? ""}
            />
          </Field>
          <p className="field__hint">
            <PracticeNote
              practice="log_check"
              {...(page.setup.check_months !== null ? { amount: page.setup.check_months } : {})}
            />
          </p>
        </MailForm>
      </Popover>
      {page.systems.length > 0 && (
        <a className="btn btn--small" href={`${BASE}/export`}>
          Download
        </a>
      )}
      <Popover label="Add a system" variant="primary" align="end" width="wide">
        <MailForm
          action={addLogAction}
          submitLabel="Add the system"
          pendingLabel="Adding…"
          className="stack-form stack-form--tight"
        >
          <LogFields
            prefix="log-new"
            values={null}
            tools={page.tools}
            toolsLoaded={page.tools_loaded}
          />
        </MailForm>
      </Popover>
    </>
  );
}

const keptWords = (row: LogRow) =>
  row.retention_days === null ? "Not recorded" : countWords(row.retention_days, "day");

function lookedCell(row: LogRow) {
  if (row.retired) return <span className="quiet">Retired {dayWords(row.retired.on)}</span>;
  return (
    <>
      <span className="nowrap">
        {row.last_look ? dayWords(row.last_look.on) : `Added ${dayWords(row.added_on)}`}
      </span>
      {row.next_look && <span className="table-sub">Next by {dayWords(row.next_look)}</span>}
      {row.overdue && (
        <span className="table-sub">
          <StatusPill value="overdue" label="Overdue" tone="danger" />
        </span>
      )}
    </>
  );
}

function Register({ page }: { page: LogsPage }) {
  return (
    <div className="hqdata-devices">
      <p className="page-note">{NOT_ADVICE}</p>
      <CertInAsks rules={page.rules} readings={page.readings} />
      <section data-section="logs-register">
        <p>
          <PracticeNote
            practice="log_check"
            {...(page.setup.check_months !== null ? { amount: page.setup.check_months } : {})}
          />
        </p>
        {!page.tools_loaded && <p className="page-note">{notLoaded("Tools")}</p>}
        <DataTable
          caption="Logs and time"
          minWidth={1000}
          columns={[
            { key: "system", label: "System", width: "22%" },
            { key: "kinds", label: "What it logs" },
            { key: "where", label: "Where" },
            { key: "kept", label: "Kept" },
            { key: "india", label: "In India" },
            { key: "time", label: "Time source" },
            { key: "looked", label: "Looked at" },
          ]}
          columnMenu={false}
          isEmpty={page.systems.length === 0}
          empty={<EmptyState compact title="No systems" description={LOGS_EMPTY} />}
        >
          {page.systems.map((row) => (
            <tr
              key={row.log_id}
              id={`log-${row.log_id}`}
              className={row.retired ? "hqdata-devices__gone" : undefined}
            >
              <td>
                <Link className="table-title" href={row.href}>
                  {row.name}
                </Link>
                {row.tool && <span className="table-sub">A tool in Systems</span>}
                <LogLines lines={row.lines} rules={page.rules} readings={page.readings} />
              </td>
              <td>
                {row.kinds.length === 0 ? (
                  <span className="quiet">Not recorded</span>
                ) : (
                  row.kinds.map((kind) => LOG_KINDS[kind]).join(", ")
                )}
              </td>
              <td>{row.where || <span className="quiet">Not recorded</span>}</td>
              <td>{keptWords(row)}</td>
              <td>
                {LOG_PLACES[row.place]}
                {row.region && <span className="table-sub">{row.region}</span>}
              </td>
              <td>
                {TIME_SOURCES[row.time_source]}
                {row.time_detail && <span className="table-sub mono">{row.time_detail}</span>}
              </td>
              <td>{lookedCell(row)}</td>
            </tr>
          ))}
        </DataTable>
      </section>
    </div>
  );
}
