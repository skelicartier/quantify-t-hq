import Link from "next/link";

import { DueChip } from "@/components/crm/pills";
import { AgreementFields, NEW_AGREEMENT } from "@/components/data/agreements/agreement-fields";
import { COPY_FOLDERS, endsWords } from "@/components/data/agreements/words";
import { CompanyTabs } from "@/components/data/company/company-tabs";
import { DataUnavailable } from "@/components/data/data-down";
import { MailForm } from "@/components/mail/mail-form";
import { PageHeader } from "@/components/shell/page-header";
import { ButtonLink } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { DataTable } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { Popover } from "@/components/ui/popover";
import { StatusPill } from "@/components/ui/status-pill";
import { SegmentedLinks } from "@/components/ui/toolbar";
import { DATA_ROLE_LINE, requireData } from "@/lib/data/access";
import {
  readAgreements,
  type AgreementRow,
  type AgreementsPage,
  type MustRow,
} from "@/lib/data/api/agreements";
import {
  AGREEMENT_STATUSES,
  AGREEMENT_TYPES,
  MUST_STATES,
  NOT_LEGAL_ADVICE,
  dayShort,
  dayWords,
} from "@/lib/data/labels-registers";
import { dataRead } from "@/lib/data/read";
import { formatNumber } from "@/lib/format";
import { boundedInteger, firstSearchValue } from "@/lib/search-params";

import { addAgreementAction } from "./actions";
import "./agreements.css";

export const metadata = { title: "Agreements" };
export const dynamic = "force-dynamic";

const BASE = "/data/company/agreements";
const PAGE_SIZE = 100;
const ABOUT = `The company's agreements, signed and draft: who they are with, their terms and renewal days, each with its signed copy in Files, and what is missing. The day to give notice before an agreement renews lands in Due. ${NOT_LEGAL_ADVICE}`;

type Params = Record<string, string | string[] | undefined>;
type Filters = { type: string; q: string; ended: boolean };

function listHref(change: Partial<Filters> & { offset?: number }, current: Filters): string {
  const next = { ...current, ...change };
  const params = new URLSearchParams();
  if (next.ended) params.set("ended", "1");
  else if (next.type) params.set("type", next.type);
  if (next.q) params.set("q", next.q);
  if (change.offset) params.set("offset", String(change.offset));
  const rendered = params.toString();
  return `${BASE}${rendered ? `?${rendered}` : ""}`;
}

export default async function AgreementsPage({ searchParams }: { searchParams: Promise<Params> }) {
  const { allowed } = await requireData(BASE);
  const parameters = await searchParams;
  const asked = firstSearchValue(parameters.type) ?? "";
  const filters: Filters = {
    type: asked in AGREEMENT_TYPES ? asked : "",
    q: (firstSearchValue(parameters.q) ?? "").slice(0, 200),
    ended: firstSearchValue(parameters.ended) === "1",
  };
  const offset = boundedInteger(firstSearchValue(parameters.offset), 0, 200_000);
  const read = allowed
    ? await dataRead(() =>
        readAgreements({ type: filters.type, q: filters.q, ended: filters.ended, offset }),
      )
    : null;
  const data = read?.ok ? read.data : null;
  return (
    <>
      <PageHeader
        title="Agreements"
        description={ABOUT}
        meta={data ? <span className="quiet">{formatNumber(data.signed)} signed</span> : undefined}
        actions={
          data ? (
            <Popover label="Add an agreement" variant="primary" align="end" width="wide">
              <MailForm
                action={addAgreementAction}
                submitLabel="Add the agreement"
                pendingLabel="Adding…"
                className="stack-form stack-form--tight hqdata-agreement-form"
              >
                <AgreementFields
                  prefix="agreement-new"
                  values={NEW_AGREEMENT}
                  pickers={data.pickers}
                  today={data.today}
                  copy={{ files: data.files, filesHere: data.files_here, folder: COPY_FOLDERS }}
                />
              </MailForm>
            </Popover>
          ) : undefined
        }
      />
      <div className="page-content">
        <CompanyTabs current="agreements" />
        {!allowed || !read ? (
          <Callout tone="neutral">{DATA_ROLE_LINE}</Callout>
        ) : !read.ok ? (
          <DataUnavailable failure={read} />
        ) : (
          <div className="hqdata-agreements">
            <p className="page-note">{NOT_LEGAL_ADVICE}</p>
            <Missing rows={read.data.missing} />
            <AgreementsList page={read.data} filters={filters} />
          </div>
        )}
      </div>
    </>
  );
}

function Missing({ rows }: { rows: readonly MustRow[] }) {
  return (
    <section className="hqdata-agreements__missing" data-section="agreements-missing">
      <h2 className="hqdata-agreements__heading">What is missing</h2>
      <DataTable
        caption="What is missing"
        columns={[
          { key: "item", label: "Item", width: "22%" },
          { key: "found", label: "What HQ found", width: "30%" },
          { key: "state", label: "State" },
          { key: "why", label: "Why" },
        ]}
        columnMenu={false}
      >
        {rows.map((row) => {
          const state = MUST_STATES[row.state];
          return (
            <tr key={row.key} id={`missing-${row.key}`}>
              <td className="table-title">{row.item}</td>
              <td>
                {row.found}
                {row.missing.length > 0 && (
                  <span className="table-sub">
                    {row.missing.map((item, index) => (
                      <span key={item.href}>
                        {index > 0 ? ", " : ""}
                        <Link className="text-link" href={item.href}>
                          {item.name}
                        </Link>
                      </span>
                    ))}
                  </span>
                )}
              </td>
              <td>
                <StatusPill value={row.state} label={state.label} tone={state.tone} />
              </td>
              <td>
                <span className="hqdata-agreements__why">{row.why}</span>
                {row.source_url && (
                  <>
                    {" "}
                    <a className="text-link" href={row.source_url} rel="noreferrer" target="_blank">
                      Source
                    </a>
                    <span className="hqdata-print-only"> ({row.source_url})</span>
                  </>
                )}
              </td>
            </tr>
          );
        })}
      </DataTable>
    </section>
  );
}

function AgreementsList({ page, filters }: { page: AgreementsPage; filters: Filters }) {
  const types = (Object.keys(AGREEMENT_TYPES) as (keyof typeof AGREEMENT_TYPES)[]).filter(
    (key) => (page.counts[key] ?? 0) > 0 || filters.type === key,
  );
  const last = page.offset + page.agreements.length;
  const any = (page.counts.all ?? 0) + (page.counts.ended ?? 0) > 0;
  return (
    <section className="hqdata-agreements__list" data-section="agreements-list">
      <h2 className="hqdata-agreements__heading">The register</h2>
      <div className="hqdata-agreements-tools">
        <SegmentedLinks
          label="Type"
          items={[
            {
              href: listHref({ type: "", ended: false }, filters),
              label: `All ${formatNumber(page.counts.all ?? 0)}`,
              current: !filters.type && !filters.ended,
            },
            ...types.map((key) => ({
              href: listHref({ type: key, ended: false }, filters),
              label: `${AGREEMENT_TYPES[key]} ${formatNumber(page.counts[key] ?? 0)}`,
              current: !filters.ended && filters.type === key,
            })),
            {
              href: listHref({ type: "", ended: true }, filters),
              label: `Ended ${formatNumber(page.counts.ended ?? 0)}`,
              current: filters.ended,
            },
          ]}
        />
        <form className="filter-strip__search merge-search" action={BASE} role="search">
          {filters.type && <input type="hidden" name="type" value={filters.type} />}
          {filters.ended && <input type="hidden" name="ended" value="1" />}
          <label className="sr-only" htmlFor="agreements-q">
            Search agreements
          </label>
          <input
            id="agreements-q"
            className="input input--small"
            name="q"
            type="search"
            maxLength={200}
            defaultValue={filters.q}
            placeholder="Title, party or words"
          />
          <button className="btn btn--small" type="submit">
            Find
          </button>
          {filters.q && (
            <ButtonLink href={listHref({ q: "" }, filters)} size="small" variant="ghost">
              Clear
            </ButtonLink>
          )}
        </form>
      </div>
      <p className="hqdata-print-only">
        {filters.ended
          ? "Ended agreements"
          : filters.type
            ? `Type: ${AGREEMENT_TYPES[filters.type as keyof typeof AGREEMENT_TYPES]}`
            : "Every type"}
        {filters.q ? ` · Search: “${filters.q}”` : ""}
      </p>
      <DataTable
        caption="Agreements"
        columns={[
          { key: "title", label: "Title", width: "28%" },
          { key: "type", label: "Type" },
          { key: "status", label: "Status" },
          { key: "effective", label: "Effective" },
          { key: "ends", label: "Ends or renews" },
          { key: "notice", label: "Notice by" },
          { key: "copy", label: "Signed copy" },
        ]}
        columnMenu={false}
        isEmpty={page.agreements.length === 0}
        empty={
          any ? (
            <EmptyState
              compact
              title="No agreement matches"
              description="Try fewer words, or All."
            />
          ) : (
            <EmptyState
              compact
              title="No agreements yet"
              description="No agreements recorded yet. Start with the founder's IP assignment and each person's letter."
            />
          )
        }
      >
        {page.agreements.map((agreement) => (
          <AgreementLine key={agreement.agreement_id} agreement={agreement} today={page.today} />
        ))}
      </DataTable>
      {page.total > PAGE_SIZE && (
        <nav className="pagination" aria-label="Pagination">
          <span className="toolbar__summary">
            {formatNumber(page.offset + 1)}–{formatNumber(last)} of {formatNumber(page.total)}
          </span>
          {page.offset > 0 && (
            <ButtonLink
              size="small"
              href={listHref({ offset: Math.max(0, page.offset - PAGE_SIZE) }, filters)}
            >
              Previous
            </ButtonLink>
          )}
          {last < page.total && (
            <ButtonLink size="small" href={listHref({ offset: page.offset + PAGE_SIZE }, filters)}>
              Next
            </ButtonLink>
          )}
        </nav>
      )}
    </section>
  );
}

function AgreementLine({ agreement, today }: { agreement: AgreementRow; today: string }) {
  const status = AGREEMENT_STATUSES[agreement.status];
  const given = agreement.renewal.notice_given;
  return (
    <tr id={`agreement-${agreement.agreement_id}`}>
      <td>
        <Link className="table-title" href={`${BASE}/${agreement.agreement_id}`}>
          {agreement.title}
        </Link>
        <span className="table-sub">
          {agreement.parties.map((party) => party.name).join(" · ")}
        </span>
      </td>
      <td>{AGREEMENT_TYPES[agreement.type]}</td>
      <td>
        <StatusPill value={agreement.status} label={status.label} tone={status.tone} />
      </td>
      <td className="nowrap">
        {agreement.effective_on ? (
          dayWords(agreement.effective_on)
        ) : (
          <span className="quiet">Not given</span>
        )}
      </td>
      <td className="nowrap">{endsWords(agreement)}</td>
      <td className="nowrap">
        {given ? (
          `Given ${dayShort(given.on)}`
        ) : agreement.renewal.auto && agreement.notice_by ? (
          <DueChip due={agreement.notice_by} today={today} />
        ) : (
          "—"
        )}
      </td>
      <td>
        {agreement.signed_file ? (
          <Link className="text-link" href={`/data/files/${agreement.signed_file.file_id}`}>
            Copy
          </Link>
        ) : agreement.status === "signed" ? (
          <span className="hqdata-attention">None</span>
        ) : (
          <span className="quiet">—</span>
        )}
      </td>
    </tr>
  );
}
