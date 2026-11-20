import { DataUnavailable } from "@/components/data/data-down";
import { ControlRefNote } from "@/components/data/security/control-ref";
import { SystemsTabs } from "@/components/data/systems/systems-tabs";
import { AccountsTable } from "@/components/data/tools/accounts-table";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Field, Select } from "@/components/ui/field";
import { SegmentedLinks } from "@/components/ui/toolbar";
import { DATA_ROLE_LINE, requireData } from "@/lib/data/access";
import { readAccounts, type AccountsPage } from "@/lib/data/api/tools";
import { NOT_ADVICE, OWNER_LEFT_OUT, countWords } from "@/lib/data/labels-controls";
import {
  ACCOUNTS_ABOUT,
  ACCOUNTS_EMPTY,
  ACCOUNT_VIEWS,
  type AccountView,
} from "@/lib/data/labels-systems";
import { dataRead } from "@/lib/data/read";
import { firstSearchValue } from "@/lib/search-params";

import "../systems.css";

export const metadata = { title: "Accounts" };
export const dynamic = "force-dynamic";

const BASE = "/data/systems/accounts";
const ABOUT = `${ACCOUNTS_ABOUT} ${NOT_ADVICE}`;

type Params = Record<string, string | string[] | undefined>;

export default async function AccountsListPage({
  searchParams,
}: {
  searchParams: Promise<Params>;
}) {
  const { allowed, context } = await requireData(BASE);
  const parameters = await searchParams;
  const asked = firstSearchValue(parameters.view) ?? "";
  const view: AccountView = Object.prototype.hasOwnProperty.call(ACCOUNT_VIEWS, asked)
    ? (asked as AccountView)
    : "open";
  const holder = (firstSearchValue(parameters.holder) ?? "").slice(0, 200);
  // The Owner flag from the role and nothing else.
  const owner = allowed && context.me.role === "owner";
  const read = allowed ? await dataRead(() => readAccounts({ view, holder, owner })) : null;
  const data = read?.ok ? read.data : null;
  return (
    <>
      <PageHeader
        title="Accounts"
        description={ABOUT}
        meta={
          data ? (
            <span className="quiet">{countWords(data.counts.open, "account")} open</span>
          ) : undefined
        }
      />
      <div className="page-content">
        <SystemsTabs current="accounts" />
        {!allowed || !read ? (
          <Callout tone="neutral">{DATA_ROLE_LINE}</Callout>
        ) : !read.ok ? (
          <DataUnavailable failure={read} />
        ) : (
          <div className="hqdata-systems">
            <p className="page-note">
              {ACCOUNTS_ABOUT} <ControlRefNote refs={["a5_18"]} />
            </p>
            {!owner && <p className="page-note">{OWNER_LEFT_OUT}</p>}
            <AccountsList page={read.data} owner={owner} holder={holder} />
            <p className="page-note">{NOT_ADVICE}</p>
          </div>
        )}
      </div>
    </>
  );
}

function AccountsList({
  page,
  owner,
  holder,
}: {
  page: AccountsPage;
  owner: boolean;
  holder: string;
}) {
  const counts: Record<AccountView, number> = {
    open: page.counts.open,
    closed: page.counts.closed,
    all: page.counts.open + page.counts.closed,
  };
  const withHolder = (path: string) =>
    holder ? `${path}${path.includes("?") ? "&" : "?"}holder=${encodeURIComponent(holder)}` : path;
  return (
    <section data-section="accounts-list">
      <div className="hqdata-systems__tools">
        <SegmentedLinks
          label="Which accounts"
          items={(Object.keys(ACCOUNT_VIEWS) as AccountView[]).map((key) => ({
            href: withHolder(key === "open" ? BASE : `${BASE}?view=${key}`),
            label: `${ACCOUNT_VIEWS[key]} ${counts[key].toLocaleString("en-GB")}`,
            current: page.view === key,
          }))}
        />
        <div className="hqdata-systems__links">
          {page.holders.length > 0 && (
            <form method="get" action={BASE} className="hqdata-systems__filter">
              {page.view !== "open" && <input type="hidden" name="view" value={page.view} />}
              <Field id="accounts-holder" label="Holder">
                <Select id="accounts-holder" name="holder" defaultValue={holder}>
                  <option value="">Every holder</option>
                  {page.holders.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Button type="submit" size="small">
                Show
              </Button>
            </form>
          )}
          {counts.all > 0 && (
            <a className="text-link" href={`${BASE}/export`}>
              Download
            </a>
          )}
        </div>
      </div>
      {page.counts.admin_without_mfa > 0 && (
        <p className="hqdata-systems__check">
          {page.counts.admin_without_mfa === 1
            ? "1 admin account without two-step sign-in."
            : `${page.counts.admin_without_mfa.toLocaleString("en-GB")} admin accounts without two-step sign-in.`}
        </p>
      )}
      <p className="hqdata-print-only">
        {ACCOUNT_VIEWS[page.view]} accounts{holder ? ` held by ${holder}` : ""}
      </p>
      <AccountsTable
        accounts={page.accounts}
        owner={owner}
        roster={page.roster ?? []}
        showTool
        today={page.today}
        empty={ACCOUNTS_EMPTY}
      />
    </section>
  );
}
