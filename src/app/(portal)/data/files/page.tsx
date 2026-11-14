import Link from "next/link";
import type { ReactNode } from "react";

import { DueChip } from "@/components/crm/pills";
import { TagList } from "@/components/crm/prospect-pills";
import { DataUnavailable } from "@/components/data/data-down";
import { FolderNav, FolderSelect, type NavFolder } from "@/components/data/files/folder-nav";
import { AddFilesButton, UploadTray } from "@/components/data/files/upload-tray";
import { MailForm } from "@/components/mail/mail-form";
import { LiveRefresh } from "@/components/shell/live-refresh";
import { PageHeader } from "@/components/shell/page-header";
import { ButtonLink } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { CategoryRow, DataTable, SelectCell, tableIdFor } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input, Select } from "@/components/ui/field";
import { Popover } from "@/components/ui/popover";
import { RowAction } from "@/components/ui/row-action";
import { SelectionBar } from "@/components/ui/selection-bar";
import { Timestamp } from "@/components/ui/timestamp";
import { SegmentedLinks } from "@/components/ui/toolbar";
import { DATA_ROLE_LINE, requireData } from "@/lib/data/access";
import {
  readFiles,
  readFolders,
  type DataFileRow,
  type DataFileView,
  type DataFilesList,
  type DataFolder,
  type FilesQuery,
} from "@/lib/data/api/files";
import { FILE_KINDS, FILE_VIEWS, SHARE_HOW, SHARE_RESULTS } from "@/lib/data/labels";
import { dataRead } from "@/lib/data/read";
import { formatBytes, formatNumber } from "@/lib/format";
import { requestNow } from "@/lib/request-time";

import {
  beginUploadAction,
  bulkFilesAction,
  cancelUploadAction,
  checkFilesAction,
  deleteFolderAction,
  deleteForeverAction,
  emptyTrashAction,
  finishUploadAction,
  moveFolderAction,
  newFolderAction,
  renameFolderAction,
  resolveUploadAction,
  restoreFileAction,
  starFileAction,
  updateFileAction,
  uploadPartAction,
} from "./actions";
import "./files.css";

export const metadata = { title: "Files" };
export const dynamic = "force-dynamic";

const ABOUT =
  "Kept on this computer, in Data's own folder, with every version. Search reads names, tags, notes and the text inside PDFs, CSVs and text files.";

const VIEWS: readonly DataFileView[] = ["folder", "starred", "recent", "review", "trash", "shared"];

type Params = {
  view?: string;
  folder?: string;
  q?: string;
  in?: string;
  tag?: string;
  kind?: string;
  offset?: string;
  add?: string;
};

const UPLOADS = {
  begin: beginUploadAction,
  part: uploadPartAction,
  finish: finishUploadAction,
  resolve: resolveUploadAction,
  cancel: cancelUploadAction,
};

const FILE_COLUMNS = [
  { key: "name", label: "Name", width: "30%" },
  { key: "kind", label: "Kind" },
  { key: "size", label: "Size", align: "end" as const },
  { key: "tags", label: "Tags" },
  { key: "review", label: "Review by" },
  { key: "changed", label: "Changed" },
  { key: "actions", label: "Actions" },
];
const REVIEW_COLUMNS = [
  { key: "name", label: "Name", width: "32%" },
  { key: "review", label: "Review by" },
  { key: "changed", label: "Changed" },
  { key: "actions", label: "Actions" },
];
const TRASH_COLUMNS = [
  { key: "name", label: "Name", width: "30%" },
  { key: "was", label: "Was in" },
  { key: "when", label: "Moved to the trash" },
  { key: "size", label: "Size", align: "end" as const },
  { key: "actions", label: "Actions" },
];
const SHARED_COLUMNS = [
  { key: "file", label: "File", width: "28%" },
  { key: "how", label: "How" },
  { key: "to", label: "To" },
  { key: "by", label: "By" },
  { key: "when", label: "When" },
];

function hrefWith(base: Params, change: Partial<Params>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries({ ...base, ...change }))
    if (value !== undefined && value !== "" && key !== "add") params.set(key, value);
  const query = params.toString();
  return query ? `/data/files?${query}` : "/data/files";
}

/**
 * Files: the company's papers, decks, reports and lead files on this Mac, with every
 * version, notes and review dates, found by name or by the words inside. Folders on the
 * left (a select on a phone), the drop zone and tray, then the open folder's files.
 */
export default async function FilesPage({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams;
  const { allowed } = await requireData("/data/files");
  const now = requestNow();
  const view: DataFileView = (VIEWS as readonly string[]).includes(params.view ?? "")
    ? (params.view as DataFileView)
    : "folder";
  const offset = Math.max(0, Number.parseInt(params.offset ?? "0", 10) || 0);
  const q = (params.q ?? "").trim().slice(0, 200);
  const query: FilesQuery = {
    view,
    ...(params.folder ? { folder: params.folder } : {}),
    ...(q ? { q } : {}),
    ...(params.in ? { in: params.in } : {}),
    ...(params.tag ? { tag: params.tag } : {}),
    ...(params.kind ? { kind: params.kind } : {}),
    ...(offset ? { offset } : {}),
  };
  const read = allowed
    ? await dataRead(async () => {
        const [list, folders] = await Promise.all([readFiles(query), readFolders()]);
        return { list, folders: folders.folders };
      })
    : null;
  const data = read?.ok ? read.data : null;
  const folder = data?.list.folder ?? null;
  const here: Params = {
    ...(view !== "folder" ? { view } : {}),
    ...(folder && params.folder ? { folder: folder.folder_id } : {}),
  };

  return (
    <>
      <PageHeader
        title="Files"
        meta={
          data ? (
            <span className="quiet">
              {formatNumber(data.list.totals.files)}{" "}
              {data.list.totals.files === 1 ? "file" : "files"} ·{" "}
              {formatBytes(data.list.totals.bytes)}
            </span>
          ) : undefined
        }
        description={ABOUT}
        actions={
          data ? (
            <>
              <SegmentedLinks
                label="File views"
                items={VIEWS.map((item) => ({
                  href:
                    item === "folder"
                      ? hrefWith({}, folder && params.folder ? { folder: folder.folder_id } : {})
                      : hrefWith({}, { view: item }),
                  label: tabLabel(item, data.list),
                  current: item === view,
                }))}
              />
              <div className="pagebar__group">
                {view === "folder" && !q ? (
                  <AddFilesButton />
                ) : (
                  <ButtonLink href="/data/files?add=1" variant="primary" size="small">
                    Add files
                  </ButtonLink>
                )}
                <NewFolder folders={data.folders} open={folder} />
                <More folder={folder} folders={data.folders} list={data.list} />
                <ButtonLink href="/data/files/packs" size="small">
                  Data-room packs
                </ButtonLink>
                {view === "trash" && data.list.counts.trash > 0 && (
                  <Popover label="Empty the trash" width="wide">
                    <MailForm
                      action={emptyTrashAction}
                      submitLabel="Delete them forever"
                      pendingLabel="Deleting…"
                      variant="danger"
                    >
                      <Field
                        id="empty-trash-confirm"
                        label={`Type ${formatNumber(data.list.counts.trash)} to delete ${formatNumber(data.list.counts.trash)} ${data.list.counts.trash === 1 ? "file" : "files"} forever`}
                        hint="Their bytes are removed from this Mac unless another file has the same ones. This cannot be undone."
                      >
                        <Input
                          id="empty-trash-confirm"
                          name="confirm"
                          inputMode="numeric"
                          autoComplete="off"
                          required
                        />
                      </Field>
                    </MailForm>
                  </Popover>
                )}
              </div>
            </>
          ) : undefined
        }
      />
      <div className="page-content">
        {!allowed || !read ? (
          <Callout tone="neutral">{DATA_ROLE_LINE}</Callout>
        ) : !read.ok ? (
          <DataUnavailable failure={read} />
        ) : (
          <FilesBody
            list={read.data.list}
            folders={read.data.folders}
            params={params}
            here={here}
            view={view}
            q={q}
            now={now}
          />
        )}
      </div>
    </>
  );
}

function tabLabel(view: DataFileView, list: DataFilesList): string {
  const counts: Partial<Record<DataFileView, number>> = {
    starred: list.counts.starred,
    review: list.counts.review_due,
    trash: list.counts.trash,
    shared: list.counts.shared,
  };
  const count = counts[view];
  return count === undefined ? FILE_VIEWS[view] : `${FILE_VIEWS[view]} ${formatNumber(count)}`;
}

function NewFolder({ folders, open }: { folders: readonly DataFolder[]; open: DataFolder | null }) {
  return (
    <Popover label="New folder">
      <MailForm action={newFolderAction} submitLabel="Make the folder" pendingLabel="Making…">
        <Field id="new-folder-name" label="Name">
          <Input id="new-folder-name" name="name" maxLength={80} required autoComplete="off" />
        </Field>
        <Field id="new-folder-parent" label="Inside">
          <Select
            id="new-folder-parent"
            name="parent_id"
            defaultValue={open && open.depth < 4 ? open.folder_id : ""}
          >
            <option value="">The top of Files</option>
            {folders
              .filter((item) => item.depth < 4)
              .map((item) => (
                <option key={item.folder_id} value={item.folder_id}>
                  {item.path}
                </option>
              ))}
          </Select>
        </Field>
      </MailForm>
    </Popover>
  );
}

function More({
  folder,
  folders,
  list,
}: {
  folder: DataFolder | null;
  folders: readonly DataFolder[];
  list: DataFilesList;
}) {
  const below = (item: DataFolder) =>
    folder !== null &&
    (item.folder_id === folder.folder_id || item.path.startsWith(`${folder.path} › `));
  return (
    <Popover label="More" width="wide">
      <div className="hqdata-more">
        {folder && (
          <a className="btn btn--small" href={`/data/files/zip?folder=${folder.folder_id}`}>
            Download this folder (zip)
          </a>
        )}
        <MailForm
          action={checkFilesAction}
          submitLabel="Check every file"
          pendingLabel="Starting…"
          className="inline-form"
          disabled={list.jobs.checking}
        />
        {folder && (
          <>
            <MailForm
              action={renameFolderAction}
              fields={{ folder_id: folder.folder_id }}
              submitLabel="Rename this folder"
              pendingLabel="Renaming…"
            >
              <Field id="rename-folder" label="Folder name">
                <Input
                  id="rename-folder"
                  name="name"
                  maxLength={80}
                  defaultValue={folder.name}
                  required
                />
              </Field>
            </MailForm>
            <MailForm
              action={moveFolderAction}
              fields={{ folder_id: folder.folder_id }}
              submitLabel="Move this folder"
              pendingLabel="Moving…"
            >
              <Field id="move-folder" label="Put it inside">
                <Select id="move-folder" name="parent_id" defaultValue={folder.parent_id ?? ""}>
                  <option value="">The top of Files</option>
                  {folders
                    .filter((item) => !below(item) && item.depth < 4)
                    .map((item) => (
                      <option key={item.folder_id} value={item.folder_id}>
                        {item.path}
                      </option>
                    ))}
                </Select>
              </Field>
            </MailForm>
            {folder.default_key ? (
              <p className="side-quiet">
                The folders Data starts with can be renamed but not deleted.
              </p>
            ) : (
              <MailForm
                action={deleteFolderAction}
                fields={{ folder_id: folder.folder_id }}
                submitLabel="Delete this folder"
                pendingLabel="Deleting…"
                variant="danger"
              >
                <p className="side-quiet">Only an empty folder can be deleted.</p>
              </MailForm>
            )}
          </>
        )}
      </div>
    </Popover>
  );
}

function FilesBody({
  list,
  folders,
  params,
  here,
  view,
  q,
  now,
}: {
  list: DataFilesList;
  folders: DataFolder[];
  params: Params;
  here: Params;
  view: DataFileView;
  q: string;
  now: number;
}) {
  const folder = list.folder;
  const nav: NavFolder[] = folders.map((item) => ({
    folder_id: item.folder_id,
    name: item.name,
    depth: item.depth,
    files: item.files,
    path: item.path,
  }));
  const current = view === "folder" ? (folder?.folder_id ?? null) : null;
  const within = params.in ? folders.find((item) => item.folder_id === params.in) : undefined;
  return (
    <div className="hqdata-files">
      <aside className="hqdata-files__side">
        <FolderNav folders={nav} current={current} />
      </aside>
      <div className="hqdata-files__main">
        <FolderSelect folders={nav} current={current} />
        <form
          className="merge-search hqdata-search"
          method="get"
          action="/data/files"
          role="search"
        >
          {view !== "folder" && view !== "shared" && (
            <input type="hidden" name="view" value={view} />
          )}
          {folder && <input type="hidden" name="folder" value={folder.folder_id} />}
          {params.in && <input type="hidden" name="in" value={params.in} />}
          <label className="sr-only" htmlFor="files-find">
            Search files
          </label>
          <Input
            id="files-find"
            name="q"
            type="search"
            defaultValue={q}
            placeholder="Name, tag, note or words inside"
          />
          <button type="submit" className="btn btn--small">
            Find
          </button>
          {q && (
            <Link className="btn btn--small btn--ghost" href={hrefWith(here, {})}>
              Clear
            </Link>
          )}
        </form>
        {q && (
          <p className="side-quiet hqdata-find-count" role="status">
            {formatNumber(list.total)} {list.total === 1 ? "file matches" : "files match"} “{q}”
            {within ? ` in ${within.path}` : ""}
            {within ? (
              <>
                {" · "}
                <Link className="text-link" href={hrefWith(here, { q })}>
                  Every folder
                </Link>
              </>
            ) : (
              folder && (
                <>
                  {" · "}
                  <Link className="text-link" href={hrefWith(here, { q, in: folder.folder_id })}>
                    Only in {folder.name}
                  </Link>
                </>
              )
            )}
          </p>
        )}
        <p className="hqdata-print-only">
          {FILE_VIEWS[view]}
          {folder && view === "folder" ? ` · ${folder.path}` : ""}
          {q ? ` · search “${q}”` : ""} · {formatNumber(list.offset + 1)}–
          {formatNumber(Math.min(list.total, list.offset + list.limit))} of{" "}
          {formatNumber(list.total)}
        </p>
        <Jobs list={list} now={now} />
        {view === "folder" && folder && !q && (
          <>
            <nav className="hqdata-crumb" aria-label="Folder path">
              <Link href="/data/files">Files</Link>
              {list.path.map((step) => (
                <span key={step.folder_id}>
                  <span aria-hidden="true"> › </span>
                  <Link href={hrefWith({}, { folder: step.folder_id })}>{step.name}</Link>
                </span>
              ))}
            </nav>
            <UploadTray
              actions={UPLOADS}
              folderId={folder.folder_id}
              folderName={folder.name}
              focus={params.add === "1"}
            />
            {list.subfolders.length > 0 && (
              <ul className="hqdata-subfolders" aria-label="Folders inside">
                {list.subfolders.map((sub) => (
                  <li key={sub.folder_id}>
                    <Link className="table-title" href={hrefWith({}, { folder: sub.folder_id })}>
                      {sub.name}
                    </Link>
                    <span className="table-sub">
                      {formatNumber(sub.files)} {sub.files === 1 ? "file" : "files"}
                      {sub.children > 0 ? ` · ${formatNumber(sub.children)} folders` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
        {view === "shared" ? (
          <SharedTable list={list} now={now} />
        ) : view === "trash" ? (
          <TrashTable list={list} now={now} q={q} />
        ) : view === "review" ? (
          <ReviewTable list={list} now={now} q={q} />
        ) : (
          <FilesTable list={list} folders={folders} view={view} q={q} now={now} />
        )}
        <Paging list={list} params={params} />
      </div>
    </div>
  );
}

function Jobs({ list, now }: { list: DataFilesList; now: number }) {
  const check = list.last_check;
  return (
    <>
      {list.jobs.checking && (
        <p className="side-quiet hqdata-jobs" role="status">
          Checking every file… <LiveRefresh intervalSeconds={5} label="The check" />
        </p>
      )}
      {!list.jobs.checking && check && (
        <p className="side-quiet hqdata-jobs">
          Last checked <Timestamp value={check.at} now={now} /> by {check.by_name}:{" "}
          {formatNumber(check.files)} {check.files === 1 ? "file" : "files"},{" "}
          {check.changed === 0
            ? "every one unchanged."
            : `${formatNumber(check.changed)} changed on disk; their pages say which version.`}
        </p>
      )}
      {list.jobs.reading > 0 && (
        <p className="side-quiet hqdata-jobs">
          Reading the words inside {formatNumber(list.jobs.reading)}{" "}
          {list.jobs.reading === 1 ? "file" : "files"}; search finds them once read.
        </p>
      )}
    </>
  );
}

function NameCell({
  row,
  showFolder,
  q = "",
}: {
  row: DataFileRow;
  showFolder: boolean;
  q?: string;
}) {
  return (
    <td>
      <Link className="table-title" href={`/data/files/${row.file_id}`}>
        {row.title}
      </Link>
      {row.original_name !== row.title && <span className="table-sub">{row.original_name}</span>}
      {showFolder && <span className="table-sub">{row.folder_path}</span>}
      {row.match && row.match.where !== "name" && <MatchLine match={row.match} q={q} />}
    </td>
  );
}

const WHERE: Record<string, string> = {
  tags: "In the tags",
  notes: "In the notes",
  text: "In the text",
};

/** "In the text: “…registered office…”", the words found marked. */
function MatchLine({ match, q }: { match: NonNullable<DataFileRow["match"]>; q: string }) {
  const terms = q
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((term) => term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const pieces =
    terms.length > 0
      ? match.snippet.split(new RegExp(`(${terms.join("|")})`, "gi"))
      : [match.snippet];
  return (
    <span className="table-sub hqdata-snippet">
      {WHERE[match.where]}: “
      {pieces.map((piece, index) => (index % 2 === 1 ? <mark key={index}>{piece}</mark> : piece))}”
    </span>
  );
}

function StarAction({ row }: { row: DataFileRow }) {
  return (
    <RowAction
      action={starFileAction}
      fields={{ file_id: row.file_id, starred: row.starred ? "false" : "true" }}
      className="inline-form"
      buttons={[
        {
          label: row.starred ? "Unstar" : "Star",
          className: "btn btn--small btn--ghost",
          ariaLabel: `${row.starred ? "Unstar" : "Star"} ${row.title}`,
          pendingLabel: "Saving…",
        },
      ]}
    />
  );
}

function Download({ row }: { row: DataFileRow }) {
  return (
    <a
      className="btn btn--small btn--ghost"
      href={`/data/files/${row.file_id}/download`}
      aria-label={`Download ${row.title}`}
    >
      Download
    </a>
  );
}

function emptyFor(view: DataFileView, q: string, list: DataFilesList): ReactNode {
  if (q)
    return (
      <EmptyState
        title="Nothing matches"
        description={`No file has “${q}” in its name, tags, notes or text.`}
      />
    );
  if (view === "folder" && list.totals.files === 0)
    return (
      <EmptyState
        title="Nothing here yet"
        description="Add the deck, the company report and the registration papers. Drop a whole folder to keep its shape."
        action={<AddFilesButton />}
      />
    );
  if (view === "folder")
    return (
      <EmptyState
        compact
        title={
          list.folder?.files === 0 && list.subfolders.length > 0
            ? "No files here, only folders"
            : "This folder is empty"
        }
        description={list.folder?.hint ?? ""}
        action={<AddFilesButton label="Add files to this folder" />}
      />
    );
  if (view === "starred")
    return (
      <EmptyState
        title="Nothing starred yet"
        description="Star a file to keep it here, newest change first."
      />
    );
  return (
    <EmptyState
      title="No files yet"
      description="Files added or changed show here, newest first."
    />
  );
}

function FilesTable({
  list,
  folders,
  view,
  q,
  now,
}: {
  list: DataFilesList;
  folders: readonly DataFolder[];
  view: DataFileView;
  q: string;
  now: number;
}) {
  const caption = "Files";
  const tagChoices = list.tags.map((tag) => ({ value: tag, label: tag }));
  return (
    <>
      <SelectionBar
        tableId={tableIdFor(caption)}
        kind="files"
        noun={["file", "files"]}
        action={bulkFilesAction}
        fields={[
          {
            field: "change",
            label: "Change",
            choices: [
              { value: "star", label: "Star" },
              { value: "unstar", label: "Unstar" },
              { value: "trash", label: "Move to the trash" },
            ],
          },
          {
            field: "move",
            label: "Move to",
            choices: folders.map((item) => ({ value: item.folder_id, label: item.path })),
          },
          ...(tagChoices.length > 0
            ? [
                { field: "tag", label: "Add a tag", choices: tagChoices },
                { field: "untag", label: "Remove a tag", choices: tagChoices },
              ]
            : []),
        ]}
      />
      <DataTable
        caption={caption}
        columns={FILE_COLUMNS}
        selectable
        isEmpty={list.files.length === 0}
        empty={emptyFor(view, q, list)}
      >
        {list.files.map((row) => (
          <tr key={row.file_id}>
            <SelectCell id={row.file_id} label={row.title} />
            <NameCell row={row} showFolder={view !== "folder" || q !== ""} q={q} />
            <td className="nowrap">{FILE_KINDS[row.kind]}</td>
            <td className="data-table__num">{formatBytes(row.bytes)}</td>
            <td>
              <TagList tags={row.tags} />
            </td>
            <td className="nowrap">
              {row.review_by ? (
                <DueChip due={row.review_by} today={list.today} />
              ) : (
                <span className="table-sub">None set</span>
              )}
            </td>
            <td>
              <Timestamp value={row.updated_at} now={now} />
              <span className="table-sub">by {row.updated_by_name}</span>
            </td>
            <td className="data-table__actions">
              <div className="hqdata-row-acts">
                <Download row={row} />
                <StarAction row={row} />
              </div>
            </td>
          </tr>
        ))}
      </DataTable>
    </>
  );
}

function ReviewTable({ list, now, q }: { list: DataFilesList; now: number; q: string }) {
  const overdue = list.files.filter((row) => (row.review_by ?? "") < list.today);
  const next = list.files.filter((row) => (row.review_by ?? "") >= list.today);
  const rows = (group: DataFileRow[]) =>
    group.map((row) => (
      <tr key={row.file_id}>
        <NameCell row={row} showFolder />
        <td className="nowrap">
          {row.review_by && <DueChip due={row.review_by} today={list.today} />}
        </td>
        <td>
          <Timestamp value={row.updated_at} now={now} />
          <span className="table-sub">by {row.updated_by_name}</span>
        </td>
        <td className="data-table__actions">
          <div className="hqdata-row-acts">
            <Popover label="Reviewed" align="end">
              <MailForm
                action={updateFileAction}
                fields={{ file_id: row.file_id }}
                submitLabel="Save the date"
                pendingLabel="Saving…"
              >
                <Field id={`review-${row.file_id}`} label="Next review on">
                  <Input id={`review-${row.file_id}`} name="review_by" type="date" required />
                </Field>
              </MailForm>
            </Popover>
            <ButtonLink href={`/data/files/${row.file_id}?version=1`} size="small" variant="ghost">
              Upload a new version
            </ButtonLink>
          </div>
        </td>
      </tr>
    ));
  return (
    <DataTable
      caption="Review due"
      columns={REVIEW_COLUMNS}
      isEmpty={list.files.length === 0}
      empty={
        q ? (
          emptyFor("review", q, list)
        ) : (
          <EmptyState
            title="No reviews due"
            description="Files whose review date is past or within 30 days show here, overdue first."
          />
        )
      }
    >
      {overdue.length > 0 && <CategoryRow label="Overdue" span={REVIEW_COLUMNS.length} />}
      {rows(overdue)}
      {next.length > 0 && <CategoryRow label="Next 30 days" span={REVIEW_COLUMNS.length} />}
      {rows(next)}
    </DataTable>
  );
}

function TrashTable({ list, now, q }: { list: DataFilesList; now: number; q: string }) {
  return (
    <>
      {list.counts.trash > 0 && (
        <p className="side-quiet">
          {formatNumber(list.counts.trash)} {list.counts.trash === 1 ? "file" : "files"} ·{" "}
          {formatBytes(list.totals.trash_bytes)}. Nothing leaves the trash by itself.
        </p>
      )}
      <DataTable
        caption="Trash"
        columns={TRASH_COLUMNS}
        isEmpty={list.files.length === 0}
        empty={
          q ? (
            emptyFor("trash", q, list)
          ) : (
            <EmptyState
              title="The trash is empty"
              description="Files moved to the trash stay here until you delete them forever."
            />
          )
        }
      >
        {list.files.map((row) => (
          <tr key={row.file_id}>
            <td>
              <Link className="table-title" href={`/data/files/${row.file_id}`}>
                {row.title}
              </Link>
              {row.original_name !== row.title && (
                <span className="table-sub">{row.original_name}</span>
              )}
            </td>
            <td>{row.was_in}</td>
            <td>
              <Timestamp value={row.trashed_at} now={now} />
              <span className="table-sub">by {row.trashed_by_name}</span>
            </td>
            <td className="data-table__num">{formatBytes(row.bytes)}</td>
            <td className="data-table__actions">
              <div className="hqdata-row-acts">
                <RowAction
                  action={restoreFileAction}
                  fields={{ file_id: row.file_id }}
                  className="inline-form"
                  buttons={[
                    {
                      label: "Restore",
                      className: "btn btn--small",
                      ariaLabel: `Restore ${row.title}`,
                      pendingLabel: "Restoring…",
                    },
                  ]}
                />
                <Popover label="Delete forever" align="end">
                  <p className="hqdata-confirm__title">Delete “{row.title}” forever</p>
                  <p className="side-quiet">
                    Its bytes are removed from this Mac unless another file has the same ones. This
                    cannot be undone.
                  </p>
                  <MailForm
                    action={deleteForeverAction}
                    fields={{ file_id: row.file_id }}
                    submitLabel="Delete forever"
                    pendingLabel="Deleting…"
                    variant="danger"
                  />
                </Popover>
              </div>
            </td>
          </tr>
        ))}
      </DataTable>
    </>
  );
}

function SharedTable({ list, now }: { list: DataFilesList; now: number }) {
  return (
    <DataTable
      caption="Shared by me"
      columns={SHARED_COLUMNS}
      isEmpty={list.shares.length === 0}
      empty={<EmptyState title="Nothing shared yet." description="Share a file from its page." />}
    >
      {list.shares.map((share) => (
        <tr key={share.share_id}>
          <td>
            {share.file_here ? (
              <Link className="table-title" href={`/data/files/${share.file_id}`}>
                {share.title}
              </Link>
            ) : (
              <span className="table-title">{share.title}</span>
            )}
            <span className="table-sub">
              Version {formatNumber(share.version_n)}
              {share.file_here ? "" : " · deleted since"}
            </span>
          </td>
          <td className="nowrap">
            {SHARE_HOW[share.how]}
            {share.result !== "sent" && (
              <span className="table-sub">{SHARE_RESULTS[share.result]}</span>
            )}
          </td>
          <td className="hqdata-to">
            {share.to.length > 0 ? (
              share.to.join(", ")
            ) : (
              <span className="table-sub">Chosen on the device</span>
            )}
          </td>
          <td>{share.by_name}</td>
          <td>
            <Timestamp value={share.at} now={now} />
          </td>
        </tr>
      ))}
    </DataTable>
  );
}

function Paging({ list, params }: { list: DataFilesList; params: Params }) {
  if (list.total <= list.limit) return null;
  const first = list.offset + 1;
  const last = Math.min(list.total, list.offset + list.limit);
  const previous = Math.max(0, list.offset - list.limit);
  const next = list.offset + list.limit;
  const base: Params = { ...params };
  delete base.add;
  return (
    <nav className="pagination" aria-label="Pages">
      <span className="pagination__summary">
        {formatNumber(first)}–{formatNumber(last)} of {formatNumber(list.total)}
      </span>
      {list.offset > 0 && (
        <ButtonLink
          size="small"
          href={hrefWith(base, { offset: previous ? String(previous) : "" })}
        >
          Previous
        </ButtonLink>
      )}
      {next < list.total && (
        <ButtonLink size="small" href={hrefWith(base, { offset: String(next) })}>
          Next
        </ButtonLink>
      )}
    </nav>
  );
}
