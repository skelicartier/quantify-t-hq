import Link from "next/link";
import type { ReactNode } from "react";

import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input } from "@/components/ui/field";
import { RecordSection } from "@/components/ui/record-shell";
import { StatusPill } from "@/components/ui/status-pill";
import { Timestamp } from "@/components/ui/timestamp";
import { requireStaff } from "@/lib/access/core";
import { HqApiRequestError, HqApiUnavailableError } from "@/lib/api/core";
import {
  SEARCH_KINDS,
  readRecent,
  readSearch,
  type RecentlyViewed,
  type SearchKind,
  type SearchPage,
} from "@/lib/api/search";
import { formatNumber } from "@/lib/format";
import { requestNow } from "@/lib/request-time";
import { firstSearchValue } from "@/lib/search-params";

export const metadata = { title: "Search" };
export const dynamic = "force-dynamic";

const BASE = "/search";
/** Each kind's first few on the overview; one kind alone shows up to the service's fifty. */
const OVERVIEW = 5;
const ONE_KIND = 50;

type SearchPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function href(q: string, kind = ""): string {
  const query = new URLSearchParams({ q });
  if (kind) query.set("kind", kind);
  return `${BASE}?${query.toString()}`;
}

/** The query's words marked where they appear, so the eye finds why a note matched. */
function marked(text: string, q: string): ReactNode {
  const words = q
    .split(/\s+/)
    .filter((word) => word.length >= 2)
    .map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  if (!words.length) return text;
  const parts = text.split(new RegExp(`(${words.join("|")})`, "gi"));
  return parts.map((part, index) =>
    index % 2 === 1 ? (
      <mark key={index} className="search-mark">
        {part}
      </mark>
    ) : (
      part
    ),
  );
}

export default async function SearchResultsPage({ searchParams }: SearchPageProps) {
  const context = await requireStaff(BASE);
  const now = requestNow();
  const parameters = await searchParams;
  const q = (firstSearchValue(parameters.q) ?? "").trim().replace(/\s+/g, " ").slice(0, 120);
  const requestedKind = firstSearchValue(parameters.kind) ?? "";
  const kind: SearchKind | "" = (SEARCH_KINDS as readonly string[]).includes(requestedKind)
    ? (requestedKind as SearchKind)
    : "";
  let page: SearchPage | null = null;
  let recent: RecentlyViewed | null = null;
  let failed = false;
  try {
    if (q.length >= 2)
      page = await readSearch(context.token, q, {
        kind,
        limit: kind ? ONE_KIND : OVERVIEW,
      });
    else recent = await readRecent(context.token);
  } catch (error) {
    if (!(error instanceof HqApiUnavailableError || error instanceof HqApiRequestError))
      throw error;
    failed = true;
  }
  const found = page?.groups.filter((group) => group.count > 0) ?? [];
  const shown = kind ? found.filter((group) => group.kind === kind) : found;

  return (
    <>
      <PageHeader
        eyebrow="Find"
        title="Search"
        description="Every kind of record your role reads, in one place: names and addresses, notes and calls, tasks, meetings, contracts, invoices, quotes and help articles."
      />
      <div className="page-content">
        <form className="search-page__form" action={BASE} method="get" role="search">
          <Field id="search-q" label="Search everything">
            <Input
              id="search-q"
              name="q"
              type="search"
              defaultValue={q}
              minLength={2}
              maxLength={120}
              placeholder="A name, an address, a firm, or words from a note"
            />
          </Field>
          <Button type="submit" variant="primary">
            Search
          </Button>
        </form>

        {failed && (
          <Callout tone="danger" role="alert">
            Search could not be read just now. Nothing is lost; try again in a moment.
          </Callout>
        )}

        {q.length < 2 && recent !== null && (
          <RecordSection id="search-recent" title="Recently viewed">
            {recent.recent.length === 0 ? (
              <EmptyState
                compact
                title="Nothing opened lately"
                description={`The records you open are listed here for ${recent.days} days.`}
              />
            ) : (
              <ul className="search-results">
                {recent.recent.map((row) => (
                  <li key={`${row.kind}-${row.id}`} className="search-result">
                    <Link className="search-result__title" href={row.href}>
                      {row.title}
                    </Link>
                    <p className="search-result__meta">
                      {row.label} · opened{" "}
                      <Timestamp value={row.viewed_at} now={now} mode="relative" />
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </RecordSection>
        )}

        {page !== null && (
          <>
            <nav className="search-kinds" aria-label="What to show">
              <Link href={href(q)} aria-current={kind === "" ? "page" : undefined}>
                All <span className="num">{formatNumber(page.total)}</span>
              </Link>
              {found.map((group) => (
                <Link
                  key={group.kind}
                  href={href(q, group.kind)}
                  aria-current={kind === group.kind ? "page" : undefined}
                >
                  {group.label}{" "}
                  <span className="num">
                    {formatNumber(group.count)}
                    {group.more ? "+" : ""}
                  </span>
                </Link>
              ))}
            </nav>
            {shown.length === 0 ? (
              <EmptyState
                title={`Nothing matches “${q}”`}
                description="Try fewer words, part of a name, an address, or words a note would use. Archived records are included and marked."
              />
            ) : (
              shown.map((group) => (
                <RecordSection
                  key={group.kind}
                  id={`search-${group.kind}`}
                  title={group.label}
                  actions={
                    !kind && group.count > group.results.length ? (
                      <Link className="text-link" href={href(q, group.kind)}>
                        All {formatNumber(group.count)}
                        {group.more ? "+" : ""}
                      </Link>
                    ) : undefined
                  }
                >
                  <ul className="search-results">
                    {group.results.map((hit) => (
                      <li key={`${hit.kind}-${hit.id}`} className="search-result">
                        <span className="search-result__head">
                          <Link className="search-result__title" href={hit.href}>
                            {marked(hit.title, q)}
                          </Link>
                          {hit.archived && (
                            <StatusPill value="archived" label="Archived" tone="neutral" />
                          )}
                        </span>
                        {hit.subtitle && <p className="search-result__meta">{hit.subtitle}</p>}
                        {hit.snippet && (
                          <p className="search-result__snippet">{marked(hit.snippet, q)}</p>
                        )}
                      </li>
                    ))}
                  </ul>
                  {kind && group.more && (
                    <p className="page-note">
                      The first {formatNumber(group.count)} matches are counted. Add a word to
                      narrow them.
                    </p>
                  )}
                  {kind && !group.more && group.count > group.results.length && (
                    <p className="page-note">
                      The best {formatNumber(group.results.length)} of {formatNumber(group.count)}{" "}
                      are shown. Add a word to narrow them.
                    </p>
                  )}
                </RecordSection>
              ))
            )}
          </>
        )}
      </div>
    </>
  );
}
