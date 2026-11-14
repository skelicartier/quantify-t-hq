import Link from "next/link";

import { DataUnavailable } from "@/components/data/data-down";
import { MailForm } from "@/components/mail/mail-form";
import { PageHeader } from "@/components/shell/page-header";
import { Callout } from "@/components/ui/callout";
import { DataTable } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input } from "@/components/ui/field";
import { Popover } from "@/components/ui/popover";
import { Timestamp } from "@/components/ui/timestamp";
import { DATA_ROLE_LINE, requireData } from "@/lib/data/access";
import { readPacks, type DataPacksList } from "@/lib/data/api/packs";
import { dataRead } from "@/lib/data/read";
import { formatDate, formatNumber } from "@/lib/format";
import { requestNow } from "@/lib/request-time";
import { firstSearchValue } from "@/lib/search-params";

import { makePackAction } from "./actions";
import "./packs.css";

export const metadata = { title: "Data-room packs" };
export const dynamic = "force-dynamic";

const ABOUT =
  "A numbered set of files to share with an investor after a good first meeting, with what is still missing, a zip with a checksum for every file, and a record of who was given which version. Investors rarely sign NDAs: keep board papers and long projections out until someone asks.";

const COLUMNS = [
  { key: "pack", label: "Pack", width: "28%" },
  { key: "files", label: "Files", align: "end" as const },
  { key: "missing", label: "Missing" },
  { key: "version", label: "Version", align: "end" as const },
  { key: "shared", label: "Last shared" },
  { key: "changed", label: "Changed" },
];

type Params = Record<string, string | string[] | undefined>;

export default async function PacksPage({ searchParams }: { searchParams: Promise<Params> }) {
  const { allowed } = await requireData("/data/files/packs");
  const archived = firstSearchValue((await searchParams).archived) === "1";
  const now = requestNow();
  const read = allowed ? await dataRead(() => readPacks(archived)) : null;
  const data = read?.ok ? read.data : null;
  return (
    <>
      <PageHeader
        title="Data-room packs"
        description={ABOUT}
        meta={
          data ? (
            <span className="quiet">
              {formatNumber(data.packs.length)}{" "}
              {archived ? "archived" : data.packs.length === 1 ? "pack" : "packs"}
            </span>
          ) : undefined
        }
        actions={
          data && !archived ? (
            <Popover label="Make a pack" variant="primary" width="wide">
              <MailForm action={makePackAction} submitLabel="Make it" pendingLabel="Making…">
                <Field id="pack-new-name" label="Name">
                  <Input
                    id="pack-new-name"
                    name="name"
                    defaultValue="Data room"
                    maxLength={80}
                    required
                    autoComplete="off"
                  />
                </Field>
              </MailForm>
            </Popover>
          ) : undefined
        }
      />
      <div className="page-content">
        {!allowed || !read ? (
          <Callout tone="neutral">{DATA_ROLE_LINE}</Callout>
        ) : !read.ok ? (
          <DataUnavailable failure={read} />
        ) : (
          <Packs list={read.data} archived={archived} now={now} />
        )}
      </div>
    </>
  );
}

function Packs({ list, archived, now }: { list: DataPacksList; archived: boolean; now: number }) {
  return (
    <div className="hqdata-packs">
      <DataTable
        caption="Packs"
        columns={COLUMNS}
        columnMenu={false}
        isEmpty={list.packs.length === 0}
        empty={
          archived ? (
            <EmptyState title="No archived packs" compact />
          ) : (
            <EmptyState
              title="No packs yet"
              description="Make one, then add the deck and the team from “10 Fundraising and investors”."
            />
          )
        }
      >
        {list.packs.map((pack) => (
          <tr key={pack.pack_id}>
            <td>
              <Link className="table-title" href={`/data/files/packs/${pack.pack_id}`}>
                {pack.name}
              </Link>
            </td>
            <td className="data-table__num">{formatNumber(pack.files)}</td>
            <td>
              {pack.missing.length === 0
                ? "Nothing missing"
                : `${formatNumber(pack.missing.length)} missing`}
            </td>
            <td className="data-table__num">{formatNumber(pack.version)}</td>
            <td>{pack.last_shared_on ? formatDate(pack.last_shared_on) : "Never"}</td>
            <td>
              <Timestamp value={pack.updated_at} now={now} mode="relative" />
              <span className="table-sub">by {pack.updated_by.name}</span>
            </td>
          </tr>
        ))}
      </DataTable>
      <p className="hqdata-packs__links">
        {archived ? (
          <Link className="text-link" href="/data/files/packs">
            The packs in use
          </Link>
        ) : (
          list.archived_count > 0 && (
            <Link className="text-link" href="/data/files/packs?archived=1">
              Archived packs ({formatNumber(list.archived_count)})
            </Link>
          )
        )}
      </p>
    </div>
  );
}
