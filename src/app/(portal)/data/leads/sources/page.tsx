import Link from "next/link";

import { DataUnavailable } from "@/components/data/data-down";
import { MailForm } from "@/components/mail/mail-form";
import { LiveRefresh } from "@/components/shell/live-refresh";
import { PageHeader } from "@/components/shell/page-header";
import { ButtonLink, buttonClass } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { DataTable } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input, Select } from "@/components/ui/field";
import { Popover } from "@/components/ui/popover";
import { RecordSection } from "@/components/ui/record-shell";
import { StatusPill } from "@/components/ui/status-pill";
import { Timestamp } from "@/components/ui/timestamp";
import { DATA_ROLE_LINE, requireData } from "@/lib/data/access";
import {
  readLeadSources,
  readSourceLeftOut,
  readSourceRemovePreview,
  type LeadSource,
  type SourcesPage,
} from "@/lib/data/api/leads";
import { SOURCE_ROLES } from "@/lib/data/labels";
import { dataRead } from "@/lib/data/read";
import { formatNumber } from "@/lib/format";
import { requestNow } from "@/lib/request-time";

import { addSourceAction, readAgainAction, removeSourceAction } from "../actions";
import "../leads.css";

export const metadata = { title: "Lead sources" };
export const dynamic = "force-dynamic";

const ABOUT =
  "Files whose rows are leads. Mail merge lists are read on their own. A file stays a source once added, so no lead it brought in is lost; upload a new version of it in Files to update it.";

const COLUMNS = [
  { key: "source", label: "Source", width: "26%" },
  { key: "holds", label: "Holds" },
  { key: "rows", label: "Rows", align: "end" as const },
  { key: "leads", label: "Leads from it", align: "end" as const },
  { key: "left", label: "Left out", align: "end" as const },
  { key: "read", label: "Read" },
  { key: "state", label: "State" },
  { key: "actions", label: "Change" },
];

const LEFT_COLUMNS = [
  { key: "line", label: "Line", align: "end" as const },
  { key: "why", label: "Why" },
  { key: "value", label: "Value" },
];

type Preview = { only_here: number; with_data: number };
type LeftOut = { rows: { line: number; reason: string; value: string }[]; total: number };

export default async function LeadSourcesPage() {
  const { allowed } = await requireData("/data/leads/sources");
  const now = requestNow();
  const read = allowed ? await dataRead(readLeadSources) : null;
  const page = read?.ok ? read.data : null;
  const previews = new Map<string, Preview>();
  const leftOut = new Map<string, LeftOut>();
  if (page)
    await Promise.all(
      page.sources.map(async (source) => {
        try {
          previews.set(source.source_id, await readSourceRemovePreview(source.source_id));
          if ((source.read?.left_out_total ?? 0) > 0)
            leftOut.set(source.source_id, await readSourceLeftOut(source.source_id));
        } catch {
          // the row still shows; its preview waits for the next read
        }
      }),
    );
  return (
    <>
      <PageHeader
        title="Lead sources"
        description={ABOUT}
        meta={page?.reading ? <LiveRefresh intervalSeconds={5} label="Lead sources" /> : undefined}
        actions={
          page ? (
            <div className="pagebar__group">
              <Popover label="Add a source" variant="primary" width="wide">
                <AddSource page={page} />
              </Popover>
              <MailForm
                action={readAgainAction}
                submitLabel="Read everything again"
                pendingLabel="Starting…"
                className="inline-form"
              />
            </div>
          ) : undefined
        }
      />
      <div className="page-content">
        {!allowed || !read ? (
          <Callout tone="neutral">{DATA_ROLE_LINE}</Callout>
        ) : !read.ok ? (
          <DataUnavailable failure={read} />
        ) : (
          <Sources page={read.data} now={now} previews={previews} leftOut={leftOut} />
        )}
      </div>
    </>
  );
}

function AddSource({ page }: { page: SourcesPage }) {
  const used = new Set(page.sources.map((source) => source.file_id));
  const files = page.csv_files.filter((file) => !used.has(file.file_id));
  if (!page.files)
    return (
      <p className="page-note">
        Files is not set up here yet, so there is no file to choose. Mail merge lists are read on
        their own.
      </p>
    );
  if (files.length === 0)
    return (
      <p className="page-note">
        No CSV file in Files is free to add. Put the lead files in Files (11 Leads, lists and
        outreach) first.
      </p>
    );
  return (
    <MailForm action={addSourceAction} submitLabel="Use this file" pendingLabel="Adding…">
      <Field id="source-file" label="File">
        <Select id="source-file" name="file_id" required defaultValue="">
          <option value="" disabled>
            Choose a CSV…
          </option>
          {files.map((file) => (
            <option key={file.file_id} value={file.file_id}>
              {file.title} ({file.folder_path})
            </option>
          ))}
        </Select>
      </Field>
      <fieldset className="fieldset">
        <legend className="fieldset__legend">What it holds</legend>
        <label className="checkbox">
          <input type="radio" name="role" value="leads" defaultChecked />
          <span className="checkbox__label">{SOURCE_ROLES.leads}</span>
        </label>
        <label className="checkbox">
          <input type="radio" name="role" value="held_back" />
          <span className="checkbox__label">{SOURCE_ROLES.held_back}</span>
        </label>
      </fieldset>
      <Field
        id="source-reason"
        label="Why they are held back"
        hint="Only for people held back. Mail merge leaves them out until you say otherwise."
      >
        <Input
          id="source-reason"
          name="reason"
          maxLength={200}
          placeholder="Not a buyer"
          aria-describedby="source-reason-hint"
        />
      </Field>
    </MailForm>
  );
}

function stateOf(source: LeadSource): {
  label: string;
  tone: "live" | "danger" | "attention" | "neutral";
} {
  switch (source.state) {
    case "waiting":
      return { label: "Waiting", tone: "neutral" };
    case "reading":
      return {
        label: source.progress
          ? `Reading: ${formatNumber(source.progress.done)} of ${formatNumber(source.progress.total)}`
          : "Reading",
        tone: "attention",
      };
    case "read":
      return { label: "Read", tone: "live" };
    case "failed":
      return { label: `Could not be read: ${source.detail}`, tone: "danger" };
  }
}

function Sources({
  page,
  now,
  previews,
  leftOut,
}: {
  page: SourcesPage;
  now: number;
  previews: ReadonlyMap<string, Preview>;
  leftOut: ReadonlyMap<string, LeftOut>;
}) {
  return (
    <>
      <DataTable caption="Lead sources" columns={COLUMNS} columnMenu={false}>
        <tr>
          <td>
            <span className="table-title">Mail merge lists</span>
            <span className="table-sub">
              {formatNumber(page.merge.lists)} {page.merge.lists === 1 ? "list" : "lists"} ·{" "}
              {formatNumber(page.merge.rows)} rows · read{" "}
              <Timestamp value={page.merge.read_at} now={now} mode="relative" />
            </span>
          </td>
          <td>Leads</td>
          <td className="data-table__num">{formatNumber(page.merge.rows)}</td>
          <td className="data-table__num">
            <span className="table-sub">Read on their own</span>
          </td>
          <td className="data-table__num">
            <span className="table-sub">In Mail merge</span>
          </td>
          <td>
            <Timestamp value={page.merge.read_at} now={now} mode="relative" />
          </td>
          <td>
            <StatusPill value="read" label="Read" tone="live" />
          </td>
          <td>
            <ButtonLink href="/mail/merge" size="small" variant="ghost">
              Open Mail merge
            </ButtonLink>
          </td>
        </tr>
        {page.sources.map((source) => {
          const state = stateOf(source);
          const preview = previews.get(source.source_id);
          return (
            <tr key={source.source_id}>
              <td>
                <span className="table-title">{source.title}</span>
                <span className="table-sub">
                  {source.in_files
                    ? `${source.folder_path}${source.trashed ? " · in the trash" : ""}`
                    : "No longer in Files; its leads are kept"}
                  {source.role === "held_back" && ` · ${source.reason}`}
                </span>
              </td>
              <td>{SOURCE_ROLES[source.role]}</td>
              <td className="data-table__num">{formatNumber(source.read?.rows ?? 0)}</td>
              <td className="data-table__num">
                <Link className="text-link" href={`/data/leads?source=${source.source_id}`}>
                  {formatNumber(source.read?.leads ?? 0)}
                </Link>
              </td>
              <td className="data-table__num">
                {(source.read?.left_out_total ?? 0) > 0 ? (
                  <a className="text-link" href={`#left-out-${source.source_id}`}>
                    {formatNumber(source.read?.left_out_total ?? 0)}
                  </a>
                ) : (
                  formatNumber(0)
                )}
              </td>
              <td>
                {source.read ? (
                  <>
                    <Timestamp value={source.read.at} now={now} mode="relative" />
                    <span className="table-sub">version {source.read.version_n}</span>
                  </>
                ) : (
                  <span className="table-sub">Not yet</span>
                )}
              </td>
              <td>
                <StatusPill value={source.state} label={state.label} tone={state.tone} />
              </td>
              <td>
                <Popover label="Stop using this file" align="end" width="wide">
                  {preview && preview.with_data > 0 ? (
                    <p className="page-note">
                      {formatNumber(preview.with_data)} of the leads only this file brings have
                      replies, notes or edits; they cannot leave. Upload a corrected version
                      instead.
                    </p>
                  ) : (
                    <MailForm
                      action={removeSourceAction}
                      fields={{ source_id: source.source_id }}
                      submitLabel="Stop using this file"
                      pendingLabel="Stopping…"
                      variant="danger"
                    >
                      <p className="page-note">
                        {formatNumber(preview?.only_here ?? 0)}{" "}
                        {preview?.only_here === 1 ? "lead came" : "leads came"} only from this file.
                        None of them has a reply, note or edit, so they leave All leads.
                      </p>
                    </MailForm>
                  )}
                </Popover>
              </td>
            </tr>
          );
        })}
      </DataTable>
      {page.sources.length === 0 && (
        <EmptyState
          title="No lead files yet"
          description="Put all_leads.csv and new_leads.csv in Files (11 Leads, lists and outreach), then add each here. People held back go in as “People held back”, with why."
        />
      )}
      {page.sources
        .filter((source) => leftOut.has(source.source_id))
        .map((source) => {
          const rows = leftOut.get(source.source_id)!;
          return (
            <RecordSection
              key={source.source_id}
              id={`left-out-${source.source_id}`}
              title={`Left out of ${source.title}`}
              actions={
                <a
                  className={buttonClass({ size: "small" })}
                  href={`/data/leads/export?view=left_out&source=${source.source_id}`}
                >
                  Download the rows left out (CSV)
                </a>
              }
            >
              <p className="page-note">
                The first {formatNumber(Math.min(200, rows.total))} of {formatNumber(rows.total)}{" "}
                rows left out, with why.
              </p>
              <DataTable
                caption={`Rows left out of ${source.title}`}
                columns={LEFT_COLUMNS}
                columnMenu={false}
              >
                {rows.rows.map((row) => (
                  <tr key={`${row.line}-${row.reason}`}>
                    <td className="data-table__num">{formatNumber(row.line)}</td>
                    <td>{row.reason}</td>
                    <td className="mono">
                      {row.value || <span className="table-sub">Empty</span>}
                    </td>
                  </tr>
                ))}
              </DataTable>
            </RecordSection>
          );
        })}
    </>
  );
}
