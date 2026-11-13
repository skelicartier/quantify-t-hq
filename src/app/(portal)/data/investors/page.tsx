import Link from "next/link";

import { DueChip } from "@/components/crm/pills";
import { DataUnavailable } from "@/components/data/data-down";
import { InvestorStagePill, amountWords } from "@/components/data/investors/stage-pill";
import { MailForm } from "@/components/mail/mail-form";
import { PageHeader } from "@/components/shell/page-header";
import { ButtonLink, buttonClass } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { DataTable } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { Checkbox, Field, Select } from "@/components/ui/field";
import { Popover } from "@/components/ui/popover";
import { RecordSection } from "@/components/ui/record-shell";
import { Stat, StatGrid } from "@/components/ui/stat";
import { Timestamp } from "@/components/ui/timestamp";
import { SegmentedLinks } from "@/components/ui/toolbar";
import { DATA_ROLE_LINE, requireData } from "@/lib/data/access";
import {
  readInvestorSetup,
  readInvestors,
  type InvestorMoney,
  type InvestorSetup,
  type InvestorsPage,
} from "@/lib/data/api/investors";
import { INVESTOR_STAGES, INVESTOR_STAGE_ORDER } from "@/lib/data/labels";
import { dataRead } from "@/lib/data/read";
import { formatDate, formatMoneyBy, formatNumber } from "@/lib/format";
import { requestNow } from "@/lib/request-time";
import { boundedInteger, firstSearchValue } from "@/lib/search-params";

import { chooseInvestorListAction } from "./actions";
import "./investors.css";

export const metadata = { title: "Investors" };
export const dynamic = "force-dynamic";

const BASE = "/data/investors";
const PAGE_SIZE = 100;
const ABOUT =
  "The firms on your investor list in Mail merge, one row each. When they were written to comes from Mail merge; amounts are what you record, in their own currency, never added across currencies.";

const COLUMNS = [
  { key: "firm", label: "Firm", width: "20%" },
  { key: "person", label: "Person" },
  { key: "stage", label: "Stage" },
  { key: "written", label: "Last written" },
  { key: "next", label: "Next step", width: "22%" },
  { key: "amount", label: "Amount", align: "end" as const },
];

type Params = Record<string, string | string[] | undefined>;

export default async function InvestorsPage({ searchParams }: { searchParams: Promise<Params> }) {
  const { allowed } = await requireData(BASE);
  const now = requestNow();
  const parameters = await searchParams;
  const stage = firstSearchValue(parameters.stage) ?? "";
  const q = (firstSearchValue(parameters.q) ?? "").slice(0, 200);
  const offset = boundedInteger(firstSearchValue(parameters.offset), 0, 200_000);
  const read = allowed
    ? await dataRead(async () => {
        const [page, setup] = await Promise.all([
          readInvestors({ stage, q, offset }),
          readInvestorSetup(),
        ]);
        return { page, setup };
      })
    : null;
  const data = read?.ok ? read.data : null;
  const chosen = Boolean(data && data.setup.chosen.list_ids.length > 0);
  return (
    <>
      <PageHeader
        title="Investors"
        description={ABOUT}
        meta={
          data && chosen ? (
            <span className="quiet">
              {formatNumber(data.page.readouts.firms)}{" "}
              {data.page.readouts.firms === 1 ? "firm" : "firms"}
            </span>
          ) : undefined
        }
        actions={
          data && chosen ? (
            <>
              <a className={buttonClass({ size: "small" })} href={`${BASE}/export`}>
                Download (CSV)
              </a>
              <Popover label="More" align="end" width="wide">
                <ChangeList setup={data.setup} />
              </Popover>
            </>
          ) : undefined
        }
      />
      <div className="page-content">
        {!allowed || !read ? (
          <Callout tone="neutral">{DATA_ROLE_LINE}</Callout>
        ) : !read.ok ? (
          <DataUnavailable failure={read} />
        ) : !chosen ? (
          <FirstVisit setup={read.data.setup} />
        ) : (
          <Investors page={read.data.page} now={now} stage={stage} q={q} />
        )}
      </div>
    </>
  );
}

/** The first visit: which Mail merge list is the investor list. */
function FirstVisit({ setup }: { setup: InvestorSetup }) {
  if (setup.lists.length === 0)
    return (
      <EmptyState
        title="No lists in Mail merge yet"
        description="Import the investor list in Mail merge first; the firms are grouped here from its rows."
        action={
          <ButtonLink href="/mail/merge" size="small">
            Open Mail merge
          </ButtonLink>
        }
      />
    );
  return (
    <div className="hqdata-investors">
      <RecordSection id="investors-setup" title="Choose the investor list">
        <p className="page-note">
          Each firm on it becomes one row here, grouped by the address&rsquo;s domain. Firms Mail
          merge has written to start at &ldquo;Written to&rdquo;; the rest at &ldquo;Not written to
          yet&rdquo;. You can change the list later under More.
        </p>
        <div className="hqdata-investors__setup">
          <MailForm
            action={chooseInvestorListAction}
            submitLabel="Use this list"
            pendingLabel="Grouping the firms…"
          >
            <Field id="investor-list" label="The investor list">
              <Select id="investor-list" name="list_id" required defaultValue="">
                <option value="" disabled>
                  Choose a Mail merge list
                </option>
                {setup.lists.map((list) => (
                  <option key={list.id} value={list.id}>
                    {list.name} · {formatNumber(list.rows)} {list.rows === 1 ? "person" : "people"}
                  </option>
                ))}
              </Select>
            </Field>
          </MailForm>
        </div>
      </RecordSection>
    </div>
  );
}

/** "More › Change the list": one or more Mail merge lists; what was recorded stays. */
function ChangeList({ setup }: { setup: InvestorSetup }) {
  const chosen = new Set(setup.chosen.list_ids);
  return (
    <div className="hqdata-investors__more">
      <section>
        <h3>The investor list</h3>
        <MailForm
          action={chooseInvestorListAction}
          submitLabel="Use these lists"
          pendingLabel="Grouping the firms…"
        >
          <fieldset className="fieldset hqdata-investors__lists">
            <legend className="fieldset__legend">Mail merge lists</legend>
            {setup.lists.map((list) => (
              <Checkbox
                key={list.id}
                id={`investor-list-${list.id}`}
                name="list_id"
                value={list.id}
                defaultChecked={chosen.has(list.id)}
                label={`${list.name} · ${formatNumber(list.rows)}`}
              />
            ))}
          </fieldset>
          <p className="field__hint">
            A firm you recorded anything on stays, even off the list. The others follow the lists.
          </p>
        </MailForm>
      </section>
    </div>
  );
}

function listHref(
  change: { stage?: string; q?: string; offset?: number },
  current: { stage: string; q: string },
): string {
  const params = new URLSearchParams();
  const stage = change.stage ?? current.stage;
  const q = change.q ?? current.q;
  if (stage) params.set("stage", stage);
  if (q) params.set("q", q);
  if (change.offset) params.set("offset", String(change.offset));
  const rendered = params.toString();
  return `${BASE}${rendered ? `?${rendered}` : ""}`;
}

/** Per currency, the figures that are not nothing: soft, or signed with money in. */
function moneyLine(money: InvestorMoney, part: "soft" | "signed_and_in"): string {
  const values: Record<string, number> = {};
  for (const [currency, sums] of Object.entries(money))
    if (sums[part] > 0) values[currency] = sums[part];
  return Object.keys(values).length ? formatMoneyBy(values) : "None recorded";
}

function Investors({
  page,
  now,
  stage,
  q,
}: {
  page: InvestorsPage;
  now: number;
  stage: string;
  q: string;
}) {
  const current = { stage, q };
  const { readouts, counts, money } = page;
  const today = page.today;
  const last = page.offset + page.investors.length;
  const firms = (count: number) => `${formatNumber(count)} ${count === 1 ? "firm" : "firms"}`;
  return (
    <div className="hqdata-investors">
      <StatGrid columns={6} label="The raise">
        <Stat label="Firms" value={formatNumber(readouts.firms)} hint="on the investor list" />
        <Stat label="Written to" value={formatNumber(readouts.written)} hint="by Mail merge" />
        <Stat label="Replied" value={formatNumber(readouts.replied)} hint="recorded here" />
        <Stat label="Meetings" value={formatNumber(readouts.meetings)} hint="booked or held" />
        <Stat
          label="Soft commits"
          value={<span className="hqdata-money">{moneyLine(money, "soft")}</span>}
          hint={firms(readouts.soft_firms)}
          text
        />
        <Stat
          label="Signed and money in"
          value={<span className="hqdata-money">{moneyLine(money, "signed_and_in")}</span>}
          hint={firms(readouts.signed_firms)}
          text
        />
      </StatGrid>

      <SegmentedLinks
        label="Stage"
        items={[
          {
            href: listHref({ stage: "" }, current),
            label: `All ${formatNumber(counts.all ?? 0)}`,
            current: !stage,
          },
          ...INVESTOR_STAGE_ORDER.map((key) => ({
            href: listHref({ stage: key }, current),
            label: `${INVESTOR_STAGES[key].label} ${formatNumber(counts[key] ?? 0)}`,
            current: stage === key,
          })),
        ]}
      />
      <form className="filter-strip__search merge-search" action={BASE} role="search">
        {stage && <input type="hidden" name="stage" value={stage} />}
        <label className="sr-only" htmlFor="investors-q">
          Search investors
        </label>
        <input
          id="investors-q"
          className="input input--small"
          name="q"
          type="search"
          maxLength={200}
          defaultValue={q}
          placeholder="Firm, person, domain or next step"
        />
        <button className="btn btn--small" type="submit">
          Find
        </button>
        {q && (
          <ButtonLink href={listHref({ q: "" }, current)} size="small" variant="ghost">
            Clear
          </ButtonLink>
        )}
      </form>
      <p className="hqdata-print-only">
        {stage
          ? `Stage: ${INVESTOR_STAGES[stage as keyof typeof INVESTOR_STAGES]?.label ?? stage}`
          : "Every stage"}
        {q ? ` · Search: “${q}”` : ""}
      </p>
      <DataTable
        caption="Investors"
        columns={COLUMNS}
        isEmpty={page.investors.length === 0}
        empty={
          <EmptyState
            compact
            title={q || stage ? "Nothing matches" : "No firms on the list"}
            description={
              q || stage
                ? "No firm matches. Try fewer words, or All."
                : "The chosen list has no rows. Choose another under More."
            }
          />
        }
      >
        {page.investors.map((row) => (
          <tr key={row.investor_id}>
            <td>
              <Link className="table-title" href={`${BASE}/${row.investor_id}`}>
                {row.firm}
              </Link>
              <span className="table-sub">
                {row.free_mail ? "Free mail: a firm of one" : row.domain}
                {!row.on_list && " · Not on the chosen list now"}
              </span>
            </td>
            <td>
              {row.contact ? (
                <>
                  {row.contact.name || row.contact.email}
                  <span className="table-sub">
                    {[
                      row.contact.title,
                      row.people > 1 ? `${formatNumber(row.people - 1)} more` : "",
                    ]
                      .filter(Boolean)
                      .join(" · ") || "No title given"}
                  </span>
                </>
              ) : (
                <span className="table-sub">Nobody on file</span>
              )}
            </td>
            <td className="nowrap">
              <InvestorStagePill stage={row.stage} />
              <span className="table-sub">since {formatDate(row.stage_since)}</span>
            </td>
            <td>
              {row.last_written_at ? (
                <>
                  <Timestamp value={row.last_written_at} now={now} mode="relative" />
                  <span className="table-sub">{row.last_mailing}</span>
                </>
              ) : (
                "Never"
              )}
            </td>
            <td>
              {row.stage === "set_aside" && row.set_aside_until ? (
                <>
                  {row.next_step || "Set aside"}
                  <span className="table-sub">
                    Set aside until {formatDate(row.set_aside_until)}
                  </span>
                </>
              ) : row.next_step ? (
                <>
                  {row.next_step}
                  <span className="table-sub">
                    <DueChip due={row.next_step_on} today={today} />
                  </span>
                </>
              ) : (
                <span className="table-sub">None set</span>
              )}
            </td>
            <td className="data-table__num">
              {amountWords(row.amount)}
              {row.amount && <span className="table-sub">{row.amount.instrument}</span>}
            </td>
          </tr>
        ))}
      </DataTable>
      {page.total > 0 && (
        <nav className="pagination" aria-label="Pagination">
          <span className="toolbar__summary">
            {formatNumber(page.offset + 1)}–{formatNumber(last)} of {formatNumber(page.total)}
          </span>
          {page.offset > 0 && (
            <ButtonLink
              size="small"
              href={listHref({ offset: Math.max(0, page.offset - PAGE_SIZE) }, current)}
            >
              Previous
            </ButtonLink>
          )}
          {last < page.total && (
            <ButtonLink size="small" href={listHref({ offset: page.offset + PAGE_SIZE }, current)}>
              Next
            </ButtonLink>
          )}
        </nav>
      )}
    </div>
  );
}
