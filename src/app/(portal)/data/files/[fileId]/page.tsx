import Link from "next/link";
import { notFound } from "next/navigation";

import { DueChip } from "@/components/crm/pills";
import { TagList } from "@/components/crm/prospect-pills";
import { DataUnavailable } from "@/components/data/data-down";
import { FilePreview } from "@/components/data/files/file-preview";
import { SendByEmailForm, ShareSheetButton } from "@/components/data/files/share-sheet-button";
import { VersionUpload } from "@/components/data/files/upload-tray";
import { MailForm } from "@/components/mail/mail-form";
import { LiveRefresh } from "@/components/shell/live-refresh";
import { PageHeader } from "@/components/shell/page-header";
import { Callout } from "@/components/ui/callout";
import { DataTable } from "@/components/ui/data-table";
import { Field, Input, Select } from "@/components/ui/field";
import { InlineField } from "@/components/ui/inline-field";
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
import { DATA_ROLE_LINE, requireData } from "@/lib/data/access";
import { readFile, type DataFileDetail, type DataVersion } from "@/lib/data/api/files";
import { FILE_KINDS, TEXT_STATES } from "@/lib/data/labels";
import { dataRead } from "@/lib/data/read";
import { formatBytes, formatDate, formatNumber } from "@/lib/format";
import { requestNow } from "@/lib/request-time";

import {
  beginUploadAction,
  cancelUploadAction,
  finishUploadAction,
  logShareAction,
  makeCurrentAction,
  resolveUploadAction,
  restoreFileAction,
  shareEmailAction,
  starFileAction,
  trashFileAction,
  updateFileAction,
  uploadPartAction,
} from "../actions";
import "../files.css";

export const metadata = { title: "File" };
export const dynamic = "force-dynamic";

const ID = /^[A-Za-z0-9-]{1,64}$/;
const SHOWN = new Set(["pdf", "image"]);

const UPLOADS = {
  begin: beginUploadAction,
  part: uploadPartAction,
  finish: finishUploadAction,
  resolve: resolveUploadAction,
  cancel: cancelUploadAction,
};

const VERSION_COLUMNS = [
  { key: "version", label: "Version" },
  { key: "added", label: "Added" },
  { key: "size", label: "Size", align: "end" as const },
  { key: "note", label: "What changed" },
  { key: "fingerprint", label: "Fingerprint" },
  { key: "actions", label: "Actions" },
];

/**
 * One file: what it is, every version, what happened to it and who did it, its details to
 * edit where they sit, and the ways to share it from this Mac.
 */
export default async function FilePage({
  params,
  searchParams,
}: {
  params: Promise<{ fileId: string }>;
  searchParams: Promise<{ version?: string }>;
}) {
  const { fileId } = await params;
  const query = await searchParams;
  if (!ID.test(fileId)) notFound();
  const { allowed } = await requireData(`/data/files/${fileId}`);
  const now = requestNow();
  const read = allowed ? await dataRead(() => readFile(fileId)) : null;
  if (!allowed || !read || !read.ok)
    return (
      <>
        <PageHeader title="File" />
        <div className="page-content">
          {!allowed || !read ? (
            <Callout tone="neutral">{DATA_ROLE_LINE}</Callout>
          ) : (
            !read.ok && <DataUnavailable failure={read} />
          )}
        </div>
      </>
    );
  const file = read.data.file;
  return <FileRecord file={file} now={now} openVersion={query.version === "1"} />;
}

function FileRecord({
  file,
  now,
  openVersion,
}: {
  file: DataFileDetail;
  now: number;
  openVersion: boolean;
}) {
  const current =
    file.versions.find((version) => version.version_id === file.current) ?? file.versions.at(-1)!;
  const base = `/data/files/${file.file_id}`;
  const today = file.today;
  const inline = { action: updateFileAction, idName: "file_id", id: file.file_id };
  const reading = current.text === "pending" || current.text === "reading";
  const shown = SHOWN.has(current.kind);
  return (
    <>
      <RecordHeader
        crumbs={[
          { href: "/data/files", label: "Files" },
          ...file.path.map((folder) => ({
            href: `/data/files?folder=${folder.folder_id}`,
            label: folder.name,
          })),
        ]}
        title={file.title}
        favourite={{ href: base, label: file.title, kind: "File" }}
        status={
          <>
            <StatusPill value={current.kind} label={FILE_KINDS[current.kind]} tone="neutral" />
            {file.starred && <StatusPill value="starred" label="Starred" tone="attention" />}
            {file.review_by && <DueChip due={file.review_by} today={today} />}
            {file.trashed && <StatusPill value="trashed" label="In the trash" tone="danger" />}
          </>
        }
        readouts={[
          { label: "Size", value: formatBytes(current.bytes) },
          {
            label: "Version",
            value: `${formatNumber(current.n)} of ${formatNumber(file.versions.length)}`,
          },
          { label: "Added", value: <Timestamp value={file.created_at} now={now} /> },
          { label: "Changed", value: <Timestamp value={file.updated_at} now={now} /> },
        ]}
        actions={
          <>
            <a className="btn btn--small btn--primary" href={`${base}/download`}>
              Download
            </a>
            {shown && (
              <a
                className="btn btn--small"
                href={`${base}/view?log=open`}
                target="_blank"
                rel="noopener"
              >
                Open
              </a>
            )}
            {!file.trashed && (
              <Popover label="Upload a new version" width="wide" defaultOpen={openVersion}>
                <VersionUpload actions={UPLOADS} fileId={file.file_id} folderId={file.folder_id} />
              </Popover>
            )}
            <Popover label="Move">
              <MailForm
                action={updateFileAction}
                fields={{ file_id: file.file_id }}
                submitLabel="Move it"
                pendingLabel="Moving…"
              >
                <Field id="move-file" label="Folder">
                  <Select id="move-file" name="folder_id" defaultValue={file.folder_id}>
                    {file.folders.map((folder) => (
                      <option key={folder.folder_id} value={folder.folder_id}>
                        {folder.path}
                      </option>
                    ))}
                  </Select>
                </Field>
              </MailForm>
            </Popover>
            <Popover label="Rename">
              <MailForm
                action={updateFileAction}
                fields={{ file_id: file.file_id }}
                submitLabel="Rename"
                pendingLabel="Renaming…"
              >
                <Field id="rename-file" label="Name">
                  <Input
                    id="rename-file"
                    name="title"
                    maxLength={200}
                    defaultValue={file.title}
                    required
                  />
                </Field>
              </MailForm>
            </Popover>
            <RowAction
              action={starFileAction}
              fields={{ file_id: file.file_id, starred: file.starred ? "false" : "true" }}
              className="inline-form"
              buttons={[
                {
                  label: file.starred ? "Unstar" : "Star",
                  className: "btn btn--small",
                  ariaLabel: `${file.starred ? "Unstar" : "Star"} ${file.title}`,
                  pendingLabel: "Saving…",
                },
              ]}
            />
            {!file.trashed && (
              <Popover label="Move to the trash">
                <p className="side-quiet">
                  It stays in the trash until you delete it forever; restore it from there at any
                  time.
                </p>
                <MailForm
                  action={trashFileAction}
                  fields={{ file_id: file.file_id }}
                  submitLabel="Move to the trash"
                  pendingLabel="Moving…"
                  variant="danger"
                />
              </Popover>
            )}
          </>
        }
      />
      {reading && <LiveRefresh intervalSeconds={10} label="The file" />}
      {file.trashed && (
        <Callout tone="attention" compact>
          In the trash since {formatDate(file.trashed.at)}.
          <RowAction
            action={restoreFileAction}
            fields={{ file_id: file.file_id }}
            className="inline-form"
            buttons={[
              { label: "Restore", className: "btn btn--small", pendingLabel: "Restoring…" },
            ]}
          />
        </Callout>
      )}
      <RecordGrid
        side={
          <Properties title="Details">
            <InlineField
              {...inline}
              name="title"
              label="Name"
              value={file.title}
              display={file.title}
            />
            <InlineField
              {...inline}
              name="folder_id"
              label="Folder"
              type="select"
              value={file.folder_id}
              options={file.folders.map((folder) => ({
                value: folder.folder_id,
                label: folder.path,
              }))}
              display={file.folder_path}
            />
            <InlineField
              {...inline}
              name="tags"
              label="Tags"
              value={file.tags.join(", ")}
              placeholder="comma between tags"
              display={<TagList tags={file.tags} />}
            />
            <InlineField
              {...inline}
              name="notes"
              label="Notes"
              type="textarea"
              value={file.notes}
              display={file.notes || <span className="side-quiet">None set</span>}
            />
            <InlineField
              {...inline}
              name="review_by"
              label="Review by"
              type="date"
              value={file.review_by ?? ""}
              display={
                file.review_by ? (
                  <DueChip due={file.review_by} today={today} />
                ) : (
                  <span className="side-quiet">None set</span>
                )
              }
            />
            <Property label="Original name">{current.original_name}</Property>
            <Property label="Came from">{file.came_from || "Added on its own"}</Property>
            <Property label="Kind">{FILE_KINDS[current.kind]}</Property>
            {current.kind === "pdf" && (
              <Property label="Pages">
                {current.pages === null ? "Not counted yet" : formatNumber(current.pages)}
              </Property>
            )}
            {current.kind === "csv" && (
              <Property label="Rows and columns">
                {current.rows === null || current.columns === null
                  ? "Not counted yet"
                  : `${formatNumber(current.rows)} rows · ${formatNumber(current.columns)} columns`}
              </Property>
            )}
            <Property label="Text">{TEXT_STATES[current.text]}</Property>
            <Property label="Fingerprint" mono>
              <span className="hqdata-fingerprint" title={current.sha256}>
                {current.sha256.slice(0, 12)}
              </span>
            </Property>
            <Property label="Used for">
              {file.used_for.length === 0 ? (
                <span className="side-quiet">Nothing here uses it yet.</span>
              ) : (
                <ul className="hqdata-used">
                  {file.used_for.map((use) => (
                    <li key={`${use.href}:${use.label}`}>
                      <Link className="text-link" href={use.href}>
                        {use.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Property>
          </Properties>
        }
      >
        <RecordSection id="file-preview" title="Preview">
          <FilePreview
            fileId={file.file_id}
            title={file.title}
            preview={file.preview}
            version={current}
          />
        </RecordSection>
        {!file.trashed && (
          <RecordSection id="file-send" title="Send by email">
            <SendByEmailForm
              fileId={file.file_id}
              title={file.title}
              size={current.bytes}
              maxBytes={file.share_max_bytes}
              fromName={file.sender.from_name}
              fromEmail={file.sender.from_email}
              action={shareEmailAction}
            />
            <ShareSheetButton
              fileId={file.file_id}
              name={shareName(file.title, current)}
              type={current.mime}
              title={file.title}
              logAction={logShareAction}
            />
          </RecordSection>
        )}
        <RecordSection id="file-versions" title="Versions">
          <DataTable caption="Versions" columns={VERSION_COLUMNS} columnMenu={false} scroll={false}>
            {[...file.versions].reverse().map((version) => (
              <VersionRow key={version.version_id} version={version} file={file} now={now} />
            ))}
          </DataTable>
        </RecordSection>
        <RecordSection id="file-activity" title="Activity">
          {file.activity.length === 0 ? (
            <p className="side-quiet">Nothing has happened to it yet.</p>
          ) : (
            <ul className="hqdata-activity">
              {file.activity.map((line, index) => (
                <li key={`${line.at}-${index}`}>
                  <span>
                    <strong>{line.verb}</strong>
                    {line.detail && <span className="table-sub">{line.detail}</span>}
                  </span>
                  <span className="table-sub">
                    {line.by.name} · <Timestamp value={line.at} now={now} />
                  </span>
                </li>
              ))}
            </ul>
          )}
        </RecordSection>
      </RecordGrid>
    </>
  );
}

/** The name a shared file travels under: the title, with the original's extension. */
function shareName(title: string, version: DataVersion): string {
  const extension = version.original_name.includes(".")
    ? version.original_name.split(".").pop()
    : "";
  if (!extension || title.toLowerCase().endsWith(`.${extension.toLowerCase()}`)) return title;
  return `${title}.${extension}`;
}

function VersionRow({
  version,
  file,
  now,
}: {
  version: DataVersion;
  file: DataFileDetail;
  now: number;
}) {
  const base = `/data/files/${file.file_id}`;
  const isCurrent = version.version_id === file.current;
  return (
    <tr>
      <td className="nowrap">
        {formatNumber(version.n)}
        {isCurrent && <span className="table-sub">Current</span>}
      </td>
      <td>
        <Timestamp value={version.added_at} now={now} />
        <span className="table-sub">by {version.added_by.name}</span>
      </td>
      <td className="data-table__num">{formatBytes(version.bytes)}</td>
      <td>{version.note || <span className="table-sub">Not given</span>}</td>
      <td>
        <span className="hqdata-fingerprint" title={version.sha256}>
          {version.sha256.slice(0, 12)}
        </span>
      </td>
      <td className="data-table__actions">
        <div className="hqdata-row-acts">
          {SHOWN.has(version.kind) && (
            <a
              className="btn btn--small btn--ghost"
              href={`${base}/view?version=${version.n}&log=open`}
              target="_blank"
              rel="noopener"
              aria-label={`Open version ${version.n}`}
            >
              Open
            </a>
          )}
          <a
            className="btn btn--small btn--ghost"
            href={`${base}/download?version=${version.n}`}
            aria-label={`Download version ${version.n}`}
          >
            Download
          </a>
          {!isCurrent && (
            <RowAction
              action={makeCurrentAction}
              fields={{ file_id: file.file_id, version_id: version.version_id }}
              className="inline-form"
              buttons={[
                {
                  label: "Make this current",
                  className: "btn btn--small",
                  ariaLabel: `Make version ${version.n} current`,
                  pendingLabel: "Saving…",
                },
              ]}
            />
          )}
        </div>
      </td>
    </tr>
  );
}
