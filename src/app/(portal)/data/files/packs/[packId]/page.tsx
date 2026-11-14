import Link from "next/link";
import { notFound } from "next/navigation";

import { DataUnavailable } from "@/components/data/data-down";
import { CoverForm } from "@/components/data/packs/cover-form";
import { MailForm } from "@/components/mail/mail-form";
import { PageHeader } from "@/components/shell/page-header";
import { buttonClass } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { DataTable } from "@/components/ui/data-table";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/field";
import { Popover } from "@/components/ui/popover";
import { RecordHeader, RecordSection } from "@/components/ui/record-shell";
import { RowAction } from "@/components/ui/row-action";
import { StatusPill } from "@/components/ui/status-pill";
import { DATA_ROLE_LINE, requireData } from "@/lib/data/access";
import type { DataFileRow } from "@/lib/data/api/files";
import {
  readPack,
  readPackCandidates,
  type DataPackCandidates,
  type DataPackPage,
} from "@/lib/data/api/packs";
import { PACK_NEEDS, PACK_SHARE_HOW, labelOf } from "@/lib/data/labels";
import { dataRead } from "@/lib/data/read";
import { formatBytes, formatDate, formatNumber } from "@/lib/format";
import { firstSearchValue } from "@/lib/search-params";

import {
  addPackItemsAction,
  archivePackAction,
  coverPackItemAction,
  movePackItemAction,
  recordPackShareAction,
  removePackItemAction,
  renamePackAction,
  savePackIndexAction,
} from "../actions";
import "../packs.css";

export const metadata = { title: "Data-room pack" };
export const dynamic = "force-dynamic";

const PACK_ID = /^[A-Za-z0-9-]{1,64}$/;
const SEND_NOTE =
  "HQ does not send the pack. Download the zip and send it from your own mailbox: one attachment over 3 MB would not go through Send by email.";
const LIST_NOTE =
  "From an investor's published list for a company that has not launched: the deck, the team and a roadmap to the next round, then pilot data once there is some.";

const ITEM_COLUMNS = [
  { key: "n", label: "No.", align: "end" as const },
  { key: "file", label: "File", width: "34%" },
  { key: "version", label: "Version", align: "end" as const },
  { key: "size", label: "Size", align: "end" as const },
  { key: "covers", label: "Covers" },
  { key: "order", label: "Order" },
];
const CHECKLIST_COLUMNS = [
  { key: "item", label: "Item" },
  { key: "need", label: "Needed" },
  { key: "why", label: "Why", width: "36%" },
  { key: "in", label: "In the pack" },
];
const SHARE_COLUMNS = [
  { key: "on", label: "On" },
  { key: "firm", label: "Firm", width: "26%" },
  { key: "how", label: "How" },
  { key: "version", label: "Version", align: "end" as const },
  { key: "files", label: "Files", align: "end" as const },
  { key: "by", label: "By" },
];

type Params = Record<string, string | string[] | undefined>;

export default async function PackPage({
  params,
  searchParams,
}: {
  params: Promise<{ packId: string }>;
  searchParams: Promise<Params>;
}) {
  const { packId } = await params;
  const { allowed } = await requireData(`/data/files/packs/${packId}`);
  if (!PACK_ID.test(packId)) notFound();
  const q = (firstSearchValue((await searchParams).q) ?? "").trim().slice(0, 200);
  const read = allowed
    ? await dataRead(async () => {
        const [page, candidates] = await Promise.all([
          readPack(packId),
          readPackCandidates(packId, q),
        ]);
        return { page, candidates };
      })
    : null;
  if (!allowed || !read || !read.ok)
    return (
      <>
        <PageHeader title="Data-room pack" />
        <div className="page-content">
          {!allowed || !read ? (
            <Callout tone="neutral">{DATA_ROLE_LINE}</Callout>
          ) : (
            !read.ok && <DataUnavailable failure={read} />
          )}
        </div>
      </>
    );
  return <Pack page={read.data.page} candidates={read.data.candidates} q={q} />;
}

function Pack({
  page,
  candidates,
  q,
}: {
  page: DataPackPage;
  candidates: DataPackCandidates;
  q: string;
}) {
  const { pack } = page;
  const id = pack.pack_id;
  return (
    <div className="hqdata-pack">
      <RecordHeader
        crumbs={[
          { href: "/data/files", label: "Files" },
          { href: "/data/files/packs", label: "Data-room packs" },
        ]}
        title={pack.name}
        status={
          pack.archived ? (
            <StatusPill value="archived" label="Archived" tone="neutral" />
          ) : undefined
        }
        readouts={[
          { label: "Files", value: formatNumber(page.items.length) },
          {
            label: "Missing",
            value: page.missing.length === 0 ? "Nothing" : formatNumber(page.missing.length),
          },
          { label: "Version", value: formatNumber(pack.version) },
        ]}
        actions={
          <>
            <a
              className={buttonClass({ variant: "primary", size: "small" })}
              href={`/data/files/packs/${id}/zip`}
            >
              Download the zip
            </a>
            <MailForm
              action={savePackIndexAction}
              fields={{ pack_id: id }}
              submitLabel="Save the index in Files"
              pendingLabel="Saving…"
              className="inline-form"
            />
            <Popover label="More" width="wide">
              <div className="hqdata-pack__more">
                <MailForm
                  action={renamePackAction}
                  fields={{ pack_id: id }}
                  submitLabel="Rename"
                  pendingLabel="Renaming…"
                >
                  <Field id="pack-rename" label="Name">
                    <Input
                      id="pack-rename"
                      name="name"
                      defaultValue={pack.name}
                      maxLength={80}
                      required
                      autoComplete="off"
                    />
                  </Field>
                </MailForm>
                <MailForm
                  action={archivePackAction}
                  fields={{ pack_id: id, restore: pack.archived ? "1" : "0" }}
                  submitLabel={pack.archived ? "Restore" : "Archive"}
                  pendingLabel={pack.archived ? "Restoring…" : "Archiving…"}
                  className="inline-form"
                />
              </div>
            </Popover>
          </>
        }
      />
      <Callout tone="neutral" compact>
        {SEND_NOTE}
      </Callout>

      <RecordSection
        id="pack-items"
        title="In the pack"
        actions={<AddFiles packId={id} candidates={candidates} q={q} />}
      >
        <DataTable
          caption="In the pack"
          columns={ITEM_COLUMNS}
          columnMenu={false}
          isEmpty={page.items.length === 0}
          empty={<p className="page-note">Nothing in the pack yet. Add the deck first.</p>}
        >
          {page.items.map((item) => (
            <tr key={item.item_id} id={`pack-item-${item.n}`}>
              <td className="data-table__num">{formatNumber(item.n)}</td>
              <td>
                {item.file ? (
                  <Link className="table-title" href={`/data/files/${item.file.file_id}`}>
                    {item.file.title}
                  </Link>
                ) : (
                  <span className="table-title">A file since deleted</span>
                )}
                {item.file && <span className="table-sub">{item.file.folder_path}</span>}
                {item.warning && <span className="hqdata-pack__warning">{item.warning}</span>}
              </td>
              <td className="data-table__num">
                {item.file ? formatNumber(item.file.current_n) : "None"}
              </td>
              <td className="data-table__num">
                {item.file ? formatBytes(item.file.bytes) : "None"}
              </td>
              <td>
                <CoverForm
                  action={coverPackItemAction}
                  packId={id}
                  itemId={item.item_id}
                  n={item.n}
                  covers={item.covers}
                />
              </td>
              <td>
                <div className="hqdata-pack__order">
                  {(item.n > 1 || item.n < page.items.length) && (
                    <RowAction
                      action={movePackItemAction}
                      fields={{ pack_id: id, item_id: item.item_id, n: String(item.n) }}
                      buttons={[
                        ...(item.n > 1
                          ? [
                              {
                                label: "Up",
                                name: "direction",
                                value: "up",
                                className: buttonClass({ size: "small", variant: "ghost" }),
                                ariaLabel: `Move ${item.n} up`,
                              },
                            ]
                          : []),
                        ...(item.n < page.items.length
                          ? [
                              {
                                label: "Down",
                                name: "direction",
                                value: "down",
                                className: buttonClass({ size: "small", variant: "ghost" }),
                                ariaLabel: `Move ${item.n} down`,
                              },
                            ]
                          : []),
                      ]}
                      className="hqdata-pack__row-form"
                    />
                  )}
                  <RowAction
                    action={removePackItemAction}
                    fields={{ pack_id: id, item_id: item.item_id }}
                    buttons={[
                      {
                        label: "Take out",
                        className: buttonClass({ size: "small", variant: "ghost" }),
                        ariaLabel: `Take ${item.n} out of the pack`,
                      },
                    ]}
                    className="hqdata-pack__row-form"
                  />
                </div>
              </td>
            </tr>
          ))}
        </DataTable>
      </RecordSection>

      <RecordSection id="pack-missing" title="What's missing">
        <DataTable caption="Checklist" columns={CHECKLIST_COLUMNS} columnMenu={false}>
          {page.checklist.map((line) => {
            const titles = line.covered_by.map((n) => {
              const item = page.items.find((entry) => entry.n === n);
              return `${n}. ${item?.file?.title ?? "A file since deleted"}`;
            });
            return (
              <tr key={line.key}>
                <td>{line.label}</td>
                <td>{PACK_NEEDS[line.need]}</td>
                <td>{line.why}</td>
                <td>
                  {titles.length > 0 ? (
                    titles.join(", ")
                  ) : line.need === "if_any" ? (
                    <span className="quiet">When there is some</span>
                  ) : (
                    <strong>Missing</strong>
                  )}
                </td>
              </tr>
            );
          })}
        </DataTable>
        <p className="page-note">{LIST_NOTE}</p>
      </RecordSection>

      <RecordSection id="pack-index" title="The index">
        <pre className="hqdata-pack__index">{page.index_text}</pre>
      </RecordSection>

      <RecordSection
        id="pack-shares"
        title="Shared"
        actions={<RecordShare packId={id} firms={page.firms} today={page.today} />}
      >
        <DataTable
          caption="Shared"
          columns={SHARE_COLUMNS}
          columnMenu={false}
          isEmpty={page.shares.length === 0}
          empty={
            <p className="page-note">
              Not shared yet. When you send it or show it, record it here: the firm, how, and which
              version.
            </p>
          }
        >
          {page.shares.map((share) => (
            <tr key={share.share_id}>
              <td>{formatDate(share.shared_on)}</td>
              <td>
                {share.investor_id ? (
                  <Link className="table-title" href={`/data/investors/${share.investor_id}`}>
                    {share.firm}
                  </Link>
                ) : (
                  <span className="table-title">{share.firm}</span>
                )}
                {share.to.length > 0 && (
                  <span className="table-sub mono">{share.to.join(", ")}</span>
                )}
                {share.note && <span className="table-sub">{share.note}</span>}
              </td>
              <td>{labelOf(PACK_SHARE_HOW, share.how)}</td>
              <td className="data-table__num">{formatNumber(share.version)}</td>
              <td className="data-table__num">{formatNumber(share.files.length)}</td>
              <td>{share.by.name}</td>
            </tr>
          ))}
        </DataTable>
      </RecordSection>
    </div>
  );
}

function CandidateGroup({
  legend,
  rows,
  prefix,
}: {
  legend: string;
  rows: readonly DataFileRow[];
  prefix: string;
}) {
  return (
    <fieldset className="hqdata-pack__group">
      <legend>{legend}</legend>
      {rows.length === 0 ? (
        <p className="page-note">None to add.</p>
      ) : (
        rows.map((row, index) => (
          <Checkbox
            key={row.file_id}
            id={`${prefix}-${index}`}
            name="file_id"
            value={row.file_id}
            label={row.title}
            description={row.folder_path}
          />
        ))
      )}
    </fieldset>
  );
}

function AddFiles({
  packId,
  candidates,
  q,
}: {
  packId: string;
  candidates: DataPackCandidates;
  q: string;
}) {
  return (
    <Popover label="Add files" width="wide" defaultOpen={q !== ""}>
      <div className="hqdata-pack__add">
        <form className="hqdata-pack__search" method="get" role="search">
          <label className="sr-only" htmlFor="pack-candidates-q">
            Search files
          </label>
          <Input
            id="pack-candidates-q"
            name="q"
            defaultValue={q}
            maxLength={200}
            placeholder="Name, tag, note or words inside"
            autoComplete="off"
          />
          <button type="submit" className={buttonClass({ size: "small" })}>
            Find
          </button>
        </form>
        <MailForm
          action={addPackItemsAction}
          fields={{ pack_id: packId }}
          submitLabel="Add them"
          pendingLabel="Adding…"
        >
          <div className="hqdata-pack__groups">
            <CandidateGroup
              legend="10 Fundraising and investors"
              rows={candidates.fundraising}
              prefix="pack-add-fundraising"
            />
            <CandidateGroup
              legend="Other folders"
              rows={candidates.other}
              prefix="pack-add-other"
            />
          </div>
        </MailForm>
      </div>
    </Popover>
  );
}

function RecordShare({
  packId,
  firms,
  today,
}: {
  packId: string;
  firms: DataPackPage["firms"];
  today: string;
}) {
  return (
    <Popover label="Record a share" width="wide">
      <MailForm
        action={recordPackShareAction}
        fields={{ pack_id: packId }}
        submitLabel="Record it"
        pendingLabel="Recording…"
      >
        {firms ? (
          <Field id="pack-share-firm" label="Firm">
            <Select id="pack-share-firm" name="investor_id" required defaultValue="">
              <option value="" disabled>
                Choose a firm
              </option>
              {firms.map((firm) => (
                <option key={firm.investor_id} value={firm.investor_id}>
                  {firm.firm}
                </option>
              ))}
            </Select>
          </Field>
        ) : (
          <Field id="pack-share-firm" label="Firm">
            <Input id="pack-share-firm" name="firm" maxLength={120} required autoComplete="off" />
          </Field>
        )}
        <fieldset className="hqdata-pack__how">
          <legend>How</legend>
          {Object.entries(PACK_SHARE_HOW).map(([key, label], index) => (
            <label key={key} className="hqdata-pack__radio">
              <input type="radio" name="how" value={key} defaultChecked={index === 0} /> {label}
            </label>
          ))}
        </fieldset>
        <Field
          id="pack-share-to"
          label="To"
          hint="Up to ten addresses, separated by commas. Optional."
        >
          <Input id="pack-share-to" name="to" maxLength={4_000} autoComplete="off" />
        </Field>
        <Field id="pack-share-on" label="On">
          <Input
            id="pack-share-on"
            name="shared_on"
            type="date"
            defaultValue={today}
            max={today}
            required
          />
        </Field>
        <Field id="pack-share-note" label="Note">
          <Textarea id="pack-share-note" name="note" rows={2} maxLength={2_000} />
        </Field>
      </MailForm>
    </Popover>
  );
}
