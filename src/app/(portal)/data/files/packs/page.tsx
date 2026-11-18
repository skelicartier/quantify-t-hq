import Link from "next/link";

import { DataUnavailable } from "@/components/data/data-down";
import { MailForm } from "@/components/mail/mail-form";
import { PageHeader } from "@/components/shell/page-header";
import { Callout } from "@/components/ui/callout";
import { DataTable } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { Checkbox, Field, Input } from "@/components/ui/field";
import { Popover } from "@/components/ui/popover";
import { Timestamp } from "@/components/ui/timestamp";
import { SegmentedLinks } from "@/components/ui/toolbar";
import { DATA_ROLE_LINE, requireData } from "@/lib/data/access";
import { readPacks, type DataPacksList, type PackKindValue } from "@/lib/data/api/packs";
import { PACK_KINDS } from "@/lib/data/labels-trust";
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

const TRUST_ABOUT =
  "What a buyer's security and compliance team asks for before they buy: the questionnaire answers, the policies, the audit plan and the rest, with what is still missing, a zip with a checksum for every file, and a record of which firm on the waitlist was given which version. HQ sends nothing.";

const BASE = "/data/files/packs";
const KINDS = [
  { key: "", label: "All" },
  { key: "data_room", label: "Data-room packs" },
  { key: "trust", label: "Trust packs" },
] as const;

const COLUMNS = [
  { key: "pack", label: "Pack", width: "28%" },
  { key: "kind", label: "Kind" },
  { key: "files", label: "Files", align: "end" as const },
  { key: "missing", label: "Missing" },
  { key: "version", label: "Version", align: "end" as const },
  { key: "shared", label: "Last shared" },
  { key: "changed", label: "Changed" },
];

type Params = Record<string, string | string[] | undefined>;

export default async function PacksPage({ searchParams }: { searchParams: Promise<Params> }) {
  const { allowed } = await requireData("/data/files/packs");
  const parameters = await searchParams;
  const archived = firstSearchValue(parameters.archived) === "1";
  const asked = firstSearchValue(parameters.kind) ?? "";
  const kind: PackKindValue | null = asked === "data_room" || asked === "trust" ? asked : null;
  const now = requestNow();
  const read = allowed ? await dataRead(() => readPacks(archived, kind)) : null;
  const data = read?.ok ? read.data : null;
  return (
    <>
      <PageHeader
        title={kind === "trust" ? "Trust packs" : "Data-room packs"}
        description={kind === "trust" ? TRUST_ABOUT : ABOUT}
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
                    defaultValue={kind === "trust" ? "Trust pack" : "Data room"}
                    maxLength={80}
                    required
                    autoComplete="off"
                  />
                </Field>
                <fieldset className="hqdata-pack__how">
                  <legend>Kind</legend>
                  <label className="hqdata-pack__radio">
                    <input
                      type="radio"
                      name="kind"
                      value="data_room"
                      defaultChecked={kind !== "trust"}
                    />{" "}
                    Data-room pack (for investors)
                  </label>
                  <label className="hqdata-pack__radio">
                    <input
                      type="radio"
                      name="kind"
                      value="trust"
                      defaultChecked={kind === "trust"}
                    />{" "}
                    Trust pack (for buyers)
                  </label>
                </fieldset>
                <Checkbox
                  id="pack-new-labs"
                  name="labs"
                  value="1"
                  label="For Labs too"
                  description="Adds provenance, the data dictionary, the MNPI policy and the alternative-data answers. For a trust pack only."
                />
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
          <Packs list={read.data} archived={archived} kind={kind} now={now} />
        )}
      </div>
    </>
  );
}

/** The list's address for a kind, in use or archived. */
function hrefFor(kind: PackKindValue | null | "", archived: boolean): string {
  const params = new URLSearchParams();
  if (kind) params.set("kind", kind);
  if (archived) params.set("archived", "1");
  const rendered = params.toString();
  return rendered ? `${BASE}?${rendered}` : BASE;
}

function Packs({
  list,
  archived,
  kind,
  now,
}: {
  list: DataPacksList;
  archived: boolean;
  kind: PackKindValue | null;
  now: number;
}) {
  return (
    <div className="hqdata-packs">
      <SegmentedLinks
        label="Kind"
        items={KINDS.map((item) => ({
          href: hrefFor(item.key, archived),
          label: item.label,
          current: (kind ?? "") === item.key,
        }))}
      />
      <DataTable
        caption="Packs"
        columns={COLUMNS}
        columnMenu={false}
        isEmpty={list.packs.length === 0}
        empty={
          archived ? (
            <EmptyState title="No archived packs" compact />
          ) : kind === "trust" ? (
            <EmptyState
              title="No trust pack yet"
              description="A trust pack holds what a buyer's security and compliance team asks for: the questionnaire answers, the policies, the audit plan and the rest. Start one, then add files from Files."
            />
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
            <td>
              {PACK_KINDS[pack.kind]}
              {pack.labs && <span className="table-sub">For Labs too</span>}
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
          <Link className="text-link" href={hrefFor(kind, false)}>
            The packs in use
          </Link>
        ) : (
          list.archived_count > 0 && (
            <Link className="text-link" href={hrefFor(kind, true)}>
              Archived packs ({formatNumber(list.archived_count)})
            </Link>
          )
        )}
      </p>
    </div>
  );
}
