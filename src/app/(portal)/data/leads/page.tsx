import Link from "next/link";

import { DataUnavailable } from "@/components/data/data-down";
import { LeadBadges, LeadStatus } from "@/components/data/leads/lead-status";
import { LinkingForm } from "@/components/data/leads/linking-form";
import { LiveRefresh } from "@/components/shell/live-refresh";
import { PageHeader } from "@/components/shell/page-header";
import { Button, ButtonLink } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { DataTable, SelectCell, tableIdFor } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input } from "@/components/ui/field";
import { FilterChips, type FilterChip } from "@/components/ui/filter-chips";
import { Popover } from "@/components/ui/popover";
import { SelectionBar } from "@/components/ui/selection-bar";
import { Stat, StatGrid } from "@/components/ui/stat";
import { Timestamp } from "@/components/ui/timestamp";
import { DATA_ROLE_LINE, requireData } from "@/lib/data/access";
import {
  leadsQueryString,
  readLeads,
  type FacetEntry,
  type LeadsPage,
  type LeadsQuery,
} from "@/lib/data/api/leads";
import { LEAD_STATUS_ORDER } from "@/lib/data/labels";
import { dataRead } from "@/lib/data/read";
import { formatNumber } from "@/lib/format";
import { requestNow } from "@/lib/request-time";
import { boundedInteger, firstSearchValue } from "@/lib/search-params";

import { addLeadAction, bulkTagLeadsAction, toMailMergeAction } from "./actions";
import "./leads.css";

export const metadata = { title: "All leads" };
export const dynamic = "force-dynamic";

const BASE = "/data/leads";
const PAGE_SIZE = 100;
const ABOUT =
  "Every address from your lead files and your Mail merge lists, one row each, kept on this computer. A lead's status is the newest thing that happened to them: a reply you recorded, then the stop list, then a send, then a hold. Sent means the provider accepted the message.";

const STATUS_LINKS = [
  ["", "All"],
  ["not_sent", "Not sent yet"],
  ["sent", "Sent"],
  ["replied", "Replied"],
  ["held_back", "Held back"],
  ["stopped", "Stopped"],
] as const;

const REPLY_LINKS = [
  ["yes", "Yes"],
  ["later", "Later"],
  ["no", "No"],
  ["question", "Question"],
  ["wrong_person", "Wrong person"],
] as const;

const SORTS = [
  ["written", "Last written"],
  ["name", "Name"],
  ["firm", "Firm"],
  ["changed", "Status changed"],
] as const;

const FACETS = [
  ["firm_type", "Firm type"],
  ["country", "Country"],
  ["email_kind", "Kind of address"],
  ["batch", "Batch"],
  ["source", "Source"],
  ["tag", "Tag"],
] as const;
type FacetKey = (typeof FACETS)[number][0];

const COLUMNS = [
  { key: "lead", label: "Lead", width: "22%" },
  { key: "firm", label: "Firm", width: "16%" },
  { key: "title", label: "Title" },
  { key: "place", label: "Place" },
  { key: "status", label: "Status", width: "16%" },
  { key: "written", label: "Last written" },
  { key: "batch", label: "Batch" },
];

/** Tags the selection bar always offers, beside the ones already in use. */
const STARTER_TAGS = ["Priority", "Warm"];

type Params = Record<string, string | string[] | undefined>;

const QUERY_KEYS = [
  "q",
  "status",
  "reply",
  "firm_type",
  "country",
  "email_kind",
  "batch",
  "source",
  "tag",
  "domain",
  "sort",
] as const;

function queryFrom(parameters: Params): LeadsQuery {
  const query: LeadsQuery = {};
  for (const key of QUERY_KEYS) {
    const value = (firstSearchValue(parameters[key]) ?? "").slice(0, key === "q" ? 200 : 254);
    if (value) query[key] = value;
  }
  const offset = boundedInteger(firstSearchValue(parameters.offset), 0, 200_000);
  if (offset) query.offset = offset;
  return query;
}

export default async function AllLeadsPage({ searchParams }: { searchParams: Promise<Params> }) {
  const { allowed } = await requireData(BASE);
  const now = requestNow();
  const query = queryFrom(await searchParams);
  const read = allowed ? await dataRead(() => readLeads(query)) : null;
  const page = read?.ok ? read.data : null;
  return (
    <>
      <PageHeader
        title="All leads"
        description={ABOUT}
        meta={
          page ? (
            <span className="quiet">
              {formatNumber(page.all)} {page.all === 1 ? "lead" : "leads"} · read{" "}
              <Timestamp value={page.read_at} now={now} mode="relative" />
              {(page.sending || page.reading) && (
                <LiveRefresh intervalSeconds={30} label="All leads" />
              )}
            </span>
          ) : undefined
        }
        actions={page ? <Actions page={page} query={query} /> : undefined}
      />
      <div className="page-content">
        {!allowed || !read ? (
          <Callout tone="neutral">{DATA_ROLE_LINE}</Callout>
        ) : !read.ok ? (
          <DataUnavailable failure={read} />
        ) : (
          <List page={read.data} query={query} now={now} />
        )}
      </div>
    </>
  );
}

/** The view without its page: what a download or a Mail merge list is made from. */
function viewOf(query: LeadsQuery): LeadsQuery {
  const view: LeadsQuery = {};
  for (const key of QUERY_KEYS) if (query[key]) view[key] = query[key];
  return view;
}

function Actions({ page, query }: { page: LeadsPage; query: LeadsQuery }) {
  const view = viewOf(query);
  return (
    <div className="pagebar__group">
      <Popover label="Add a lead" variant="primary">
        <LinkingForm action={addLeadAction} submitLabel="Add this lead" pendingLabel="Adding…">
          <Field id="lead-email" label="Address">
            <Input
              id="lead-email"
              name="email"
              type="email"
              required
              maxLength={254}
              autoComplete="off"
            />
          </Field>
          <Field id="lead-name" label="Name">
            <Input id="lead-name" name="name" maxLength={120} />
          </Field>
          <Field id="lead-title" label="Title">
            <Input id="lead-title" name="title" maxLength={200} />
          </Field>
          <Field id="lead-firm" label="Firm">
            <Input id="lead-firm" name="firm" maxLength={200} />
          </Field>
          <Field id="lead-firm-type" label="Firm type">
            <Input id="lead-firm-type" name="firm_type" maxLength={200} />
          </Field>
          <div className="form-grid">
            <Field id="lead-country" label="Country">
              <Input id="lead-country" name="country" maxLength={200} />
            </Field>
            <Field id="lead-city" label="City">
              <Input id="lead-city" name="city" maxLength={200} />
            </Field>
          </div>
        </LinkingForm>
      </Popover>
      <Popover label="Download" width="wide">
        <form className="stack-form stack-form--tight" method="get" action={`${BASE}/export`}>
          {Object.entries(view).map(([key, value]) => (
            <input key={key} type="hidden" name={key} value={String(value)} />
          ))}
          <fieldset className="fieldset">
            <legend className="fieldset__legend">What to download</legend>
            <label className="checkbox">
              <input type="radio" name="view" value="this" defaultChecked />
              <span className="checkbox__label">
                This view ({formatNumber(page.total)} {page.total === 1 ? "lead" : "leads"})
              </span>
            </label>
            <label className="checkbox">
              <input type="radio" name="view" value="tracker" />
              <span className="checkbox__label">The old tracker (every lead)</span>
            </label>
          </fieldset>
          <div className="form-actions">
            <Button type="submit" size="small">
              Download
            </Button>
          </div>
        </form>
      </Popover>
      <Popover label="Make a Mail merge list" width="wide">
        <LinkingForm
          action={toMailMergeAction}
          fields={{ query: leadsQueryString(view) }}
          submitLabel="Make the list"
          pendingLabel="Making it…"
        >
          <Field
            id="list-name"
            label="Name for the list"
            hint={`From the ${formatNumber(page.listable)} ${page.listable === 1 ? "lead" : "leads"} in this view who are not on the stop list. Mail merge then writes the message.`}
          >
            <Input
              id="list-name"
              name="name"
              required
              maxLength={120}
              aria-describedby="list-name-hint"
            />
          </Field>
        </LinkingForm>
      </Popover>
      <ButtonLink href={`${BASE}/sources`} size="small">
        Sources
      </ButtonLink>
    </div>
  );
}

function hrefWith(query: LeadsQuery, change: Partial<Record<keyof LeadsQuery, string>>): string {
  const next: LeadsQuery = { ...viewOf(query) };
  for (const [key, value] of Object.entries(change)) {
    const name = key as Exclude<keyof LeadsQuery, "offset">;
    if (value) next[name] = value;
    else delete next[name];
  }
  if ("status" in change && change.status !== "replied") delete next.reply;
  const rendered = leadsQueryString(next);
  return rendered ? `${BASE}?${rendered}` : BASE;
}

function pageHref(query: LeadsQuery, offset: number): string {
  const rendered = leadsQueryString({ ...viewOf(query), ...(offset > 0 ? { offset } : {}) });
  return rendered ? `${BASE}?${rendered}` : BASE;
}

function facetLabel(entries: readonly FacetEntry[], value: string): string {
  return entries.find((entry) => entry.value === value)?.label ?? value;
}

function List({ page, query, now }: { page: LeadsPage; query: LeadsQuery; now: number }) {
  const counts = page.counts.status;
  const everyStatus = LEAD_STATUS_ORDER.reduce((sum, key) => sum + (counts[key] ?? 0), 0);
  const filtered = Boolean(
    query.q || query.status || query.domain || FACETS.some(([key]) => query[key]),
  );
  const chips: FilterChip[] = [
    ...(query.q
      ? [{ key: "q", label: "Search", value: query.q, removeHref: hrefWith(query, { q: "" }) }]
      : []),
    ...(query.status
      ? [
          {
            key: "status",
            label: "Status",
            value: STATUS_LINKS.find(([key]) => key === query.status)?.[1] ?? query.status,
            removeHref: hrefWith(query, { status: "" }),
          },
        ]
      : []),
    ...(query.reply
      ? [
          {
            key: "reply",
            label: "Reply",
            value: REPLY_LINKS.find(([key]) => key === query.reply)?.[1] ?? query.reply,
            removeHref: hrefWith(query, { reply: "" }),
          },
        ]
      : []),
    ...FACETS.filter(([key]) => query[key]).map(([key, label]) => ({
      key,
      label,
      value: facetLabel(page.facets[key], query[key] ?? ""),
      removeHref: hrefWith(query, { [key]: "" }),
    })),
    ...(query.domain
      ? [
          {
            key: "domain",
            label: "Firm",
            value: query.domain,
            removeHref: hrefWith(query, { domain: "" }),
          },
        ]
      : []),
  ];
  const tagsInUse = page.facets.tag.map((entry) => entry.label);
  const addChoices = [...new Set([...tagsInUse, ...STARTER_TAGS])].map((tag) => ({
    value: tag,
    label: tag,
  }));
  const first = page.total === 0 ? 0 : page.offset + 1;
  const last = page.offset + page.leads.length;
  const printLine = [
    ...chips.map((chip) => `${chip.label}: ${chip.value}`),
    `${formatNumber(first)}–${formatNumber(last)} of ${formatNumber(page.total)}`,
  ].join(" · ");

  return (
    <>
      {page.reading && (
        <Callout tone="neutral" role="status" compact>
          Reading the lead files again; this list updates when it is done.
        </Callout>
      )}
      <StatGrid columns={6} label="All leads">
        <Stat label="Leads" value={formatNumber(page.book.leads)} />
        <Stat label="Written to" value={formatNumber(page.book.written)} />
        <Stat label="Not sent yet" value={formatNumber(page.book.not_sent)} />
        <Stat label="Replied" value={formatNumber(page.book.replied)} />
        <Stat label="Held back" value={formatNumber(page.book.held_back)} />
        <Stat label="Stopped" value={formatNumber(page.book.stopped)} />
      </StatGrid>

      <nav className="filter-strip hqdata-status-strip" aria-label="Lead status">
        <span className="eyebrow">Status</span>
        {STATUS_LINKS.map(([key, label]) => (
          <Link
            key={key || "all"}
            href={hrefWith(query, { status: key })}
            aria-current={(query.status ?? "") === key ? "page" : undefined}
          >
            {label} {formatNumber(key === "" ? everyStatus : (counts[key] ?? 0))}
          </Link>
        ))}
        <form className="filter-strip__search" action={BASE} role="search">
          {Object.entries(viewOf(query))
            .filter(([key]) => key !== "q")
            .map(([key, value]) => (
              <input key={key} type="hidden" name={key} value={String(value)} />
            ))}
          <label className="sr-only" htmlFor="leads-q">
            Search leads
          </label>
          <input
            id="leads-q"
            className="input input--small"
            name="q"
            type="search"
            maxLength={200}
            defaultValue={query.q ?? ""}
            placeholder="Name, address, firm, title or place"
          />
          <button className="btn btn--small" type="submit">
            Find
          </button>
        </form>
      </nav>
      {query.status === "replied" && (
        <nav className="filter-strip hqdata-status-strip" aria-label="Reply">
          <span className="eyebrow">Reply</span>
          <Link
            href={hrefWith(query, { reply: "" })}
            aria-current={!query.reply ? "page" : undefined}
          >
            Every reply {formatNumber(counts.replied ?? 0)}
          </Link>
          {REPLY_LINKS.map(([key, label]) => (
            <Link
              key={key}
              href={hrefWith(query, { reply: key })}
              aria-current={query.reply === key ? "page" : undefined}
            >
              {label} {formatNumber(counts[key] ?? 0)}
            </Link>
          ))}
        </nav>
      )}

      <div className="list-tools" aria-label="List tools">
        <form className="hqdata-filters" action={BASE} method="get">
          {(["q", "status", "reply", "domain"] as const)
            .filter((key) => query[key])
            .map((key) => (
              <input key={key} type="hidden" name={key} value={query[key]} />
            ))}
          {FACETS.map(([key, label]) => (
            <FacetSelect
              key={key}
              name={key}
              label={label}
              entries={page.facets[key]}
              chosen={query[key] ?? ""}
            />
          ))}
          <label className="hqdata-filters__field">
            <span>Sort</span>
            <select
              className="select select--small"
              name="sort"
              defaultValue={query.sort ?? "written"}
            >
              {SORTS.map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <Button type="submit" size="small">
            Show
          </Button>
        </form>
      </div>
      <FilterChips chips={chips} clearHref={BASE} />
      <p className="hqdata-print-only">{printLine}</p>

      <SelectionBar
        tableId={tableIdFor("All leads")}
        kind="leads"
        noun={["lead", "leads"]}
        action={bulkTagLeadsAction}
        fields={[
          { field: "add_tag", label: "Add a tag", choices: addChoices },
          ...(tagsInUse.length
            ? [
                {
                  field: "remove_tag",
                  label: "Remove a tag",
                  choices: tagsInUse.map((tag) => ({ value: tag, label: tag })),
                },
              ]
            : []),
        ]}
      />
      <DataTable
        caption="All leads"
        columns={COLUMNS}
        selectable
        isEmpty={page.leads.length === 0}
        empty={
          <EmptyState
            title={filtered ? "Nothing matches" : "No leads yet"}
            description={
              filtered
                ? "No lead matches these filters. Remove one, or try fewer words."
                : "Put your lead files in Files, then add them in Sources. People on Mail merge lists appear here on their own."
            }
            action={
              filtered ? undefined : (
                <ButtonLink href={`${BASE}/sources`} size="small">
                  Sources
                </ButtonLink>
              )
            }
          />
        }
      >
        {page.leads.map((lead) => (
          <tr
            key={lead.lead_id}
            className={lead.status === "no" || lead.status === "stopped" ? "row--muted" : undefined}
          >
            <SelectCell id={lead.lead_id} label={lead.name || lead.email} />
            <td>
              <Link className="table-title" href={`${BASE}/${lead.lead_id}`}>
                {lead.name || lead.email}
              </Link>
              {lead.name && <span className="table-sub mono prospect-email">{lead.email}</span>}
              <LeadBadges badges={lead.badges} />
            </td>
            <td>
              {lead.company || <span className="table-sub">Not given</span>}
              {lead.firm_type && <span className="table-sub">{lead.firm_type}</span>}
            </td>
            <td>{lead.title || <span className="table-sub">Not given</span>}</td>
            <td>
              {[lead.city, lead.country].filter(Boolean).join(", ") || (
                <span className="table-sub">Not given</span>
              )}
            </td>
            <td>
              <LeadStatus status={lead.status} detail={lead.status_detail} />
            </td>
            <td className="nowrap">
              {lead.last_written_at ? (
                <>
                  <Timestamp value={lead.last_written_at} now={now} mode="relative" />
                  <span className="table-sub">{lead.last_mailing}</span>
                </>
              ) : (
                <span className="table-sub">Never</span>
              )}
            </td>
            <td>
              {lead.batches[0] ?? <span className="table-sub">On no list</span>}
              {lead.batches.length > 1 && (
                <span className="table-sub">+{formatNumber(lead.batches.length - 1)} more</span>
              )}
            </td>
          </tr>
        ))}
      </DataTable>
      {page.total > 0 && (
        <nav className="pagination" aria-label="Pagination">
          <span className="toolbar__summary">
            {formatNumber(first)}–{formatNumber(last)} of {formatNumber(page.total)}
          </span>
          {page.offset > 0 && (
            <ButtonLink size="small" href={pageHref(query, Math.max(0, page.offset - PAGE_SIZE))}>
              Previous
            </ButtonLink>
          )}
          {last < page.total && (
            <ButtonLink size="small" href={pageHref(query, page.offset + PAGE_SIZE)}>
              Next
            </ButtonLink>
          )}
        </nav>
      )}
    </>
  );
}

function FacetSelect({
  name,
  label,
  entries,
  chosen,
}: {
  name: FacetKey;
  label: string;
  entries: readonly FacetEntry[];
  chosen: string;
}) {
  const options =
    chosen && !entries.some((entry) => entry.value === chosen)
      ? [...entries, { value: chosen, label: chosen, count: 0 }]
      : entries;
  return (
    <label className="hqdata-filters__field">
      <span>{label}</span>
      <select className="select select--small" name={name} defaultValue={chosen}>
        <option value="">Any</option>
        {options.map((entry) => (
          <option key={entry.value} value={entry.value}>
            {entry.label} ({formatNumber(entry.count)})
          </option>
        ))}
      </select>
    </label>
  );
}
