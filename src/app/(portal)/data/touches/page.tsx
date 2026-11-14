import Link from "next/link";

import { DataUnavailable } from "@/components/data/data-down";
import { SourceLink } from "@/components/data/touches/source-link";
import { requestsWords } from "@/components/data/touches/touches-section-view";
import { PageHeader } from "@/components/shell/page-header";
import { ButtonLink } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { DataTable } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { RowAction } from "@/components/ui/row-action";
import { Stat, StatGrid } from "@/components/ui/stat";
import { SegmentedLinks } from "@/components/ui/toolbar";
import { DATA_ROLE_LINE, requireData } from "@/lib/data/access";
import { readTouches, type TouchRow, type TouchesPage } from "@/lib/data/api/touches";
import {
  TOUCH_ACCEPT_WARNING,
  TOUCH_CEILING,
  TOUCH_CEILING_WARNING,
  TOUCH_KINDS,
  TOUCH_SOURCES,
  TOUCH_SUBJECTS,
  shortDay,
} from "@/lib/data/labels-people";
import { dataRead } from "@/lib/data/read";
import { formatDate, formatNumber } from "@/lib/format";
import { boundedInteger, firstSearchValue } from "@/lib/search-params";

import "@/components/data/touches/touches.css";
import { touchStateAction } from "./actions";

export const metadata = { title: "Touches" };
export const dynamic = "force-dynamic";

const BASE = "/data/touches";
const PAGE_SIZE = 100;
const ABOUT =
  "Connection requests, messages and calls you make by hand outside email, logged on the lead or the investor firm. Nothing here is automated, and nothing is sent.";

const WEEK_COLUMNS = [
  { key: "week", label: "Week of" },
  { key: "requests", label: "Connection requests", align: "end" as const },
  { key: "accepted", label: "Accepted", align: "end" as const },
  { key: "messages", label: "Messages", align: "end" as const },
  { key: "other", label: "Other", align: "end" as const },
];

const TOUCH_COLUMNS = [
  { key: "day", label: "Day" },
  { key: "with", label: "With" },
  { key: "kind", label: "Kind" },
  { key: "note", label: "Note", width: "34%" },
  { key: "by", label: "By" },
  { key: "change", label: "Change", align: "end" as const },
];

type Params = Record<string, string | string[] | undefined>;
type Filters = { kind: string; subject_kind: string; subject_id: string };

function touchesHref(change: Partial<Filters> & { offset?: number }, current: Filters): string {
  const next = { ...current, ...change };
  const params = new URLSearchParams();
  if (next.subject_kind && next.subject_id) {
    params.set("subject_kind", next.subject_kind);
    params.set("subject_id", next.subject_id);
  }
  if (next.kind) params.set("kind", next.kind);
  if (change.offset) params.set("offset", String(change.offset));
  const rendered = params.toString();
  return `${BASE}${rendered ? `?${rendered}` : ""}`;
}

export default async function TouchesPageView({ searchParams }: { searchParams: Promise<Params> }) {
  const { allowed } = await requireData(BASE);
  const parameters = await searchParams;
  const askedKind = firstSearchValue(parameters.kind) ?? "";
  const subjectKind = firstSearchValue(parameters.subject_kind) ?? "";
  const filters: Filters = {
    kind: askedKind in TOUCH_KINDS ? askedKind : "",
    subject_kind: subjectKind in TOUCH_SUBJECTS ? subjectKind : "",
    subject_id: (firstSearchValue(parameters.subject_id) ?? "").slice(0, 64),
  };
  const offset = boundedInteger(firstSearchValue(parameters.offset), 0, 200_000);
  const read = allowed
    ? await dataRead(() =>
        readTouches({
          kind: filters.kind,
          subject_kind: filters.subject_kind,
          subject_id: filters.subject_kind ? filters.subject_id : "",
          offset,
        }),
      )
    : null;
  const data = read?.ok ? read.data : null;
  const thisWeek = data?.weeks[0];
  const weekTotal = thisWeek
    ? thisWeek.requests + thisWeek.accepted + thisWeek.messages + thisWeek.other
    : 0;
  return (
    <>
      <PageHeader
        title="Touches"
        description={ABOUT}
        meta={data ? <span className="quiet">{formatNumber(weekTotal)} this week</span> : undefined}
      />
      <div className="page-content">
        {!allowed || !read ? (
          <Callout tone="neutral">{DATA_ROLE_LINE}</Callout>
        ) : !read.ok ? (
          <DataUnavailable failure={read} />
        ) : (
          <TouchesBody page={read.data} filters={filters} offset={offset} />
        )}
      </div>
    </>
  );
}

function TouchesBody({
  page,
  filters,
  offset,
}: {
  page: TouchesPage;
  filters: Filters;
  offset: number;
}) {
  const over = page.this_week.requests > TOUCH_CEILING;
  const last = offset + page.touches.length;
  const name = filters.subject_id ? (page.touches[0]?.subject.name ?? "") : "";
  return (
    <div className="hqdata-touches">
      <StatGrid label="Touches" columns={3}>
        <Stat
          label="Connection requests this week"
          value={
            over ? (
              <span className="hqdata-touches__attention">
                {formatNumber(page.this_week.requests)}
              </span>
            ) : (
              formatNumber(page.this_week.requests)
            )
          }
          hint={`since Mon ${shortDay(page.this_week.from)}`}
        />
        <Stat
          label="Accepted in four weeks"
          value={`${formatNumber(page.four_weeks.accepted)} of ${formatNumber(page.four_weeks.requests)}`}
          hint="Requests accepted, of those logged in the last 28 days"
        />
        <Stat label="Messages this week" value={formatNumber(page.this_week.messages)} />
      </StatGrid>

      {page.warnings.length > 0 && (
        <div className="hqdata-touches__warnings">
          {page.warnings.includes(TOUCH_CEILING_WARNING) && (
            <Callout tone="attention" role="status">
              {TOUCH_CEILING_WARNING} <SourceLink href={TOUCH_SOURCES[0]} />
            </Callout>
          )}
          {page.warnings.includes(TOUCH_ACCEPT_WARNING) && (
            <Callout tone="attention" role="status">
              {TOUCH_ACCEPT_WARNING} <SourceLink href={TOUCH_SOURCES[1]} />
            </Callout>
          )}
        </div>
      )}

      <DataTable caption="Touches by week" columns={WEEK_COLUMNS} columnMenu={false}>
        {page.weeks.map((week) => (
          <tr key={week.week_from}>
            <td className="nowrap">{formatDate(week.week_from)}</td>
            <td className="data-table__num">{formatNumber(week.requests)}</td>
            <td className="data-table__num">{formatNumber(week.accepted)}</td>
            <td className="data-table__num">{formatNumber(week.messages)}</td>
            <td className="data-table__num">{formatNumber(week.other)}</td>
          </tr>
        ))}
      </DataTable>

      {filters.subject_id && (
        <p className="page-note">
          {name ? `Touches with ${name} only.` : "Touches with one lead or firm only."}{" "}
          <Link
            className="text-link"
            href={touchesHref({ subject_kind: "", subject_id: "" }, filters)}
          >
            Every touch
          </Link>
        </p>
      )}
      <div className="hqdata-touches-tools">
        <SegmentedLinks
          label="Kind"
          items={[
            {
              href: touchesHref({ kind: "" }, filters),
              label: `All ${formatNumber(page.counts.all ?? 0)}`,
              current: !filters.kind,
            },
            ...Object.entries(TOUCH_KINDS).map(([key, label]) => ({
              href: touchesHref({ kind: key }, filters),
              label: `${label} ${formatNumber(page.counts[key] ?? 0)}`,
              current: filters.kind === key,
            })),
          ]}
        />
      </div>
      <p className="hqdata-print-only">
        {filters.kind ? `Kind: ${TOUCH_KINDS[filters.kind as TouchRow["kind"]]}` : "Every kind"}
        {name ? ` · With ${name}` : ""}
      </p>
      <DataTable
        caption="Touches"
        columns={TOUCH_COLUMNS}
        columnMenu={false}
        isEmpty={page.touches.length === 0}
        empty={
          (page.counts.all ?? 0) > 0 ? (
            <EmptyState compact title="No touch of this kind" description="Try All." />
          ) : (
            <EmptyState
              compact
              title="No touches logged yet"
              description="Log one from a lead's or an investor firm's page."
            />
          )
        }
      >
        {page.touches.map((touch) => (
          <TouchLine key={touch.touch_id} touch={touch} />
        ))}
      </DataTable>
      {page.total > PAGE_SIZE && (
        <nav className="pagination" aria-label="Pagination">
          <span className="toolbar__summary">
            {formatNumber(offset + 1)}–{formatNumber(last)} of {formatNumber(page.total)}
          </span>
          {offset > 0 && (
            <ButtonLink
              size="small"
              href={touchesHref({ offset: Math.max(0, offset - PAGE_SIZE) }, filters)}
            >
              Previous
            </ButtonLink>
          )}
          {last < page.total && (
            <ButtonLink size="small" href={touchesHref({ offset: offset + PAGE_SIZE }, filters)}>
              Next
            </ButtonLink>
          )}
        </nav>
      )}
      <p className="page-note">
        This week: {requestsWords(page.this_week.requests)} logged in all, since Mon{" "}
        {shortDay(page.this_week.from)}.
      </p>
    </div>
  );
}

function TouchLine({ touch }: { touch: TouchRow }) {
  const withdrawn = touch.withdrawn !== null;
  return (
    <tr
      id={`touch-${touch.touch_id}`}
      className={withdrawn ? "hqdata-touches__row--withdrawn" : undefined}
    >
      <td className="nowrap">{formatDate(touch.on)}</td>
      <td>
        <Link className="text-link" href={touch.href}>
          {touch.subject.name}
        </Link>
        <span className="table-sub">{TOUCH_SUBJECTS[touch.subject.kind]}</span>
      </td>
      <td>
        {TOUCH_KINDS[touch.kind]}
        {withdrawn && <span className="table-sub">Withdrawn</span>}
      </td>
      <td>
        {touch.note ? (
          <span className="table-sub table-sub--prose hqdata-touches__note" title={touch.note}>
            {touch.note}
          </span>
        ) : (
          <span className="quiet">No note</span>
        )}
      </td>
      <td>{touch.by.name}</td>
      <td className="row-action-cell">
        <RowAction
          action={touchStateAction}
          fields={{ touch_id: touch.touch_id, to: withdrawn ? "restore" : "withdraw" }}
          buttons={[
            withdrawn
              ? {
                  label: "Restore",
                  className: "btn btn--small",
                  ariaLabel: `Restore the touch on ${formatDate(touch.on)} with ${touch.subject.name}`,
                  pendingLabel: "Restoring…",
                }
              : {
                  label: "Withdraw",
                  className: "btn btn--small btn--ghost",
                  ariaLabel: `Withdraw the touch on ${formatDate(touch.on)} with ${touch.subject.name}`,
                  pendingLabel: "Withdrawing…",
                },
          ]}
        />
      </td>
    </tr>
  );
}
