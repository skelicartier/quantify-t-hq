import Link from "next/link";

import { DueChip } from "@/components/crm/pills";
import { DataUnavailable } from "@/components/data/data-down";
import { LinkingForm } from "@/components/data/leads/linking-form";
import { MailForm } from "@/components/mail/mail-form";
import { PageHeader } from "@/components/shell/page-header";
import { Button, ButtonLink } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { DataTable } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input, Textarea } from "@/components/ui/field";
import { Popover } from "@/components/ui/popover";
import { RecordSection } from "@/components/ui/record-shell";
import { StatusPill } from "@/components/ui/status-pill";
import { SegmentedLinks } from "@/components/ui/toolbar";
import { DATA_ROLE_LINE, requireData } from "@/lib/data/access";
import {
  readWaitlist,
  type EntryRow,
  type Stage,
  type StageCounts,
  type WaitlistPage as Page,
} from "@/lib/data/api/waitlist";
import { WAITLIST_STAGES, WAITLIST_STAGE_ORDER } from "@/lib/data/labels";
import { dataRead } from "@/lib/data/read";
import { formatDate, formatNumber } from "@/lib/format";
import { boundedInteger, firstSearchValue } from "@/lib/search-params";

import { addFirmAction, importWaitlistAction } from "./actions";
import "./waitlist.css";

export const metadata = { title: "Waitlist" };
export const dynamic = "force-dynamic";

const BASE = "/data/waitlist";
const PAGE_SIZE = 100;
const ABOUT =
  "A firm joins when someone there replies yes in writing, or tells you on a call. Each firm counts once, however many of its people said yes.";

const COLUMNS = [
  { key: "firm", label: "Firm", width: "18%" },
  { key: "contact", label: "Contact" },
  { key: "stage", label: "Stage" },
  { key: "next", label: "Next step", width: "18%" },
  { key: "joined", label: "Joined" },
  { key: "how", label: "How they joined" },
  { key: "colleagues", label: "Colleagues" },
];

type Params = Record<string, string | string[] | undefined>;

const isStage = (value: string): value is Stage =>
  (WAITLIST_STAGE_ORDER as readonly string[]).includes(value);

export default async function WaitlistPage({ searchParams }: { searchParams: Promise<Params> }) {
  const { allowed } = await requireData(BASE);
  const parameters = await searchParams;
  const rawStage = firstSearchValue(parameters.stage) ?? "";
  const stage = isStage(rawStage) ? rawStage : "";
  const q = (firstSearchValue(parameters.q) ?? "").slice(0, 200);
  const view = firstSearchValue(parameters.view) === "stage" ? "stage" : "table";
  const offset = boundedInteger(firstSearchValue(parameters.offset), 0, 200_000);
  const read = allowed
    ? await dataRead(async () => {
        const page = await readWaitlist({ stage, q, offset: view === "stage" ? 0 : offset });
        // Grouped by stage, each stage is read on its own, so a long Joined never hides Pilot.
        const byStage =
          view === "stage"
            ? await Promise.all(
                WAITLIST_STAGE_ORDER.map(async (key) => ({
                  stage: key,
                  page: await readWaitlist({ stage: key, q }),
                })),
              )
            : [];
        return { page, byStage };
      })
    : null;
  const data = read?.ok ? read.data : null;
  return (
    <>
      <PageHeader
        title="Waitlist"
        description={ABOUT}
        meta={
          data ? (
            <span className="quiet">
              {formatNumber(data.page.firms)} {data.page.firms === 1 ? "firm" : "firms"}
            </span>
          ) : undefined
        }
        actions={data ? <Actions today={data.page.today} /> : undefined}
      />
      <div className="page-content">
        {!allowed || !read ? (
          <Callout tone="neutral">{DATA_ROLE_LINE}</Callout>
        ) : !read.ok ? (
          <DataUnavailable failure={read} />
        ) : (
          <Waitlist
            page={read.data.page}
            byStage={read.data.byStage}
            stage={stage}
            q={q}
            view={view}
          />
        )}
      </div>
    </>
  );
}

function Actions({ today }: { today: string }) {
  return (
    <>
      <Popover label="Add a firm" width="wide">
        <LinkingForm action={addFirmAction} submitLabel="Add the firm" pendingLabel="Adding…">
          <p className="field__hint">For a yes that came another way: on a call, in person.</p>
          <Field id="firm-email" label="Their address">
            <Input id="firm-email" name="email" type="email" required maxLength={254} />
          </Field>
          <div className="form-grid">
            <Field id="firm-name" label="Firm">
              <Input id="firm-name" name="firm" maxLength={200} />
            </Field>
            <Field id="firm-joined" label="Joined on">
              <Input
                id="firm-joined"
                name="joined_on"
                type="date"
                max={today}
                defaultValue={today}
              />
            </Field>
          </div>
          <Field
            id="firm-how"
            label="How they joined"
            hint="Shown on the investor page: leave names out."
          >
            <Input
              id="firm-how"
              name="how_joined"
              maxLength={200}
              placeholder="Said yes on a call"
              aria-describedby="firm-how-hint"
            />
          </Field>
          <Field
            id="firm-proof"
            label="Proof"
            hint="What they said, as near their words as you can."
          >
            <Textarea
              id="firm-proof"
              name="quote"
              rows={3}
              maxLength={4_000}
              aria-describedby="firm-proof-hint"
            />
          </Field>
        </LinkingForm>
      </Popover>
      <ButtonLink href={`${BASE}/pilots`} size="small">
        Pilots
      </ButtonLink>
      <ButtonLink href={`${BASE}/diligence`} size="small">
        Diligence
      </ButtonLink>
      <ButtonLink href={`${BASE}/for-investors`} size="small">
        For investors
      </ButtonLink>
      <Popover label="Download" width="narrow">
        <form className="stack-form stack-form--tight" method="get" action={`${BASE}/export`}>
          <fieldset className="fieldset">
            <legend className="fieldset__legend">What to download</legend>
            <label className="checkbox">
              <input type="radio" name="kind" value="every" defaultChecked />
              <span className="checkbox__label">Every field (CSV)</span>
            </label>
            <label className="checkbox">
              <input type="radio" name="kind" value="investors" />
              <span className="checkbox__label">For investors (CSV)</span>
            </label>
          </fieldset>
          <div className="form-actions">
            <Button type="submit" size="small">
              Download
            </Button>
          </div>
        </form>
      </Popover>
      <Popover label="More" width="wide">
        <div className="hqdata-waitlist-more">
          <section>
            <h3>Bring in the old waitlist file</h3>
            <MailForm
              action={importWaitlistAction}
              submitLabel="Bring it in"
              pendingLabel="Bringing it in…"
            >
              <p className="field__hint">
                The CSV with the columns joined_on, full_name, title, company, firm_type, city,
                country, email, how_joined, proof, status, notes. Each row becomes a firm at Joined;
                a firm already here is skipped.
              </p>
              <Field id="old-file" label="The file">
                <Input id="old-file" name="file" type="file" accept=".csv,text/csv" required />
              </Field>
            </MailForm>
          </section>
        </div>
      </Popover>
    </>
  );
}

function listHref(
  change: { stage?: string; q?: string; view?: string; offset?: number },
  current: {
    stage: string;
    q: string;
    view: string;
  },
): string {
  const params = new URLSearchParams();
  const stage = change.stage ?? current.stage;
  const q = change.q ?? current.q;
  const view = change.view ?? current.view;
  if (stage) params.set("stage", stage);
  if (q) params.set("q", q);
  if (view === "stage") params.set("view", "stage");
  if (change.offset) params.set("offset", String(change.offset));
  const rendered = params.toString();
  return `${BASE}${rendered ? `?${rendered}` : ""}`;
}

function Rows({ entries, today }: { entries: readonly EntryRow[]; today: string }) {
  return (
    <>
      {entries.map((entry) => (
        <tr key={entry.entry_id}>
          <td>
            <Link className="table-title" href={`${BASE}/${entry.entry_id}`}>
              {entry.firm}
            </Link>
            <span className="table-sub">{entry.free_mail ? "Free mail" : entry.domain}</span>
          </td>
          <td>
            {entry.contact.lead_id ? (
              <Link className="text-link" href={`/data/leads/${entry.contact.lead_id}`}>
                {entry.contact.name || entry.contact.email}
              </Link>
            ) : (
              entry.contact.name || entry.contact.email
            )}
            <span className="table-sub">{entry.contact.title || "Title not given"}</span>
          </td>
          <td className="nowrap">
            <StatusPill
              value={entry.stage}
              label={WAITLIST_STAGES[entry.stage].label}
              tone={WAITLIST_STAGES[entry.stage].tone}
            />
            <span className="table-sub">since {formatDate(entry.stage_since)}</span>
          </td>
          <td>
            {entry.next_step ? (
              <>
                {entry.next_step}
                <span className="table-sub">
                  <DueChip due={entry.next_step_on} today={today} />
                </span>
              </>
            ) : (
              <span className="table-sub">None set</span>
            )}
          </td>
          <td className="nowrap">{formatDate(entry.joined_on)}</td>
          <td>{entry.how_joined || <span className="table-sub">Not given</span>}</td>
          <td>
            {formatNumber(entry.colleagues.on_file)} on file ·{" "}
            {formatNumber(entry.colleagues.not_written)} not written to
          </td>
        </tr>
      ))}
    </>
  );
}

function stageTabs(
  counts: StageCounts & { all: number },
  current: { stage: string; q: string; view: string },
) {
  return [
    {
      href: listHref({ stage: "" }, current),
      label: `All ${formatNumber(counts.all)}`,
      current: !current.stage,
    },
    ...WAITLIST_STAGE_ORDER.map((key) => ({
      href: listHref({ stage: key }, current),
      label: `${WAITLIST_STAGES[key].label} ${formatNumber(counts[key])}`,
      current: current.stage === key,
    })),
  ];
}

function Waitlist({
  page,
  byStage,
  stage,
  q,
  view,
}: {
  page: Page;
  byStage: { stage: Stage; page: Page }[];
  stage: string;
  q: string;
  view: "table" | "stage";
}) {
  const current = { stage, q, view };
  const narrowed = Boolean(stage || q);
  const empty =
    page.firms === 0 ? (
      <EmptyState
        title="No firm on the waitlist yet"
        description="A firm joins when someone there replies yes: record it on Replies or from the lead."
        action={
          <ButtonLink href="/data/replies?new=1" size="small">
            Record a reply
          </ButtonLink>
        }
      />
    ) : (
      <EmptyState
        compact
        title="Nothing matches"
        description="No firm matches. Try fewer words, or All."
      />
    );
  const last = page.offset + page.entries.length;
  const filters = [
    stage ? `Stage: ${WAITLIST_STAGES[stage as Stage].label}` : "Every stage",
    q ? `Search: “${q}”` : "",
    view === "table" && page.total > 0
      ? `${formatNumber(page.offset + 1)}–${formatNumber(last)} of ${formatNumber(page.total)}`
      : "",
  ].filter(Boolean);
  return (
    <>
      <div className="filter-strip hqdata-waitlist-tools">
        <SegmentedLinks label="Stage" items={stageTabs(page.counts, current)} />
        <SegmentedLinks
          label="View"
          items={[
            {
              href: listHref({ view: "table" }, current),
              label: "Table",
              current: view === "table",
            },
            {
              href: listHref({ view: "stage" }, current),
              label: "By stage",
              current: view === "stage",
            },
          ]}
        />
        <form className="filter-strip__search merge-search" action={BASE} role="search">
          {stage && <input type="hidden" name="stage" value={stage} />}
          {view === "stage" && <input type="hidden" name="view" value="stage" />}
          <label className="sr-only" htmlFor="waitlist-q">
            Search the waitlist
          </label>
          <input
            id="waitlist-q"
            className="input input--small"
            name="q"
            type="search"
            maxLength={200}
            defaultValue={q}
            placeholder="Firm, person, domain or place"
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
      </div>
      <p className="hqdata-print-only">{filters.join(" · ")}</p>

      {view === "table" ? (
        <>
          <DataTable
            caption="Waitlist"
            columns={COLUMNS}
            isEmpty={page.entries.length === 0}
            empty={empty}
          >
            <Rows entries={page.entries} today={page.today} />
          </DataTable>
          {page.total > PAGE_SIZE && (
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
                <ButtonLink
                  size="small"
                  href={listHref({ offset: page.offset + PAGE_SIZE }, current)}
                >
                  Next
                </ButtonLink>
              )}
            </nav>
          )}
        </>
      ) : page.firms === 0 || (narrowed && byStage.every((group) => group.page.total === 0)) ? (
        empty
      ) : (
        <div className="hqdata-stages">
          {byStage
            .filter((group) => !stage || group.stage === stage)
            .map((group) => (
              <RecordSection
                key={group.stage}
                id={`waitlist-stage-${group.stage.replace(/_/g, "-")}`}
                title={`${WAITLIST_STAGES[group.stage].label} · ${formatNumber(group.page.total)}`}
              >
                {group.page.total === 0 ? (
                  <p className="page-note">
                    No firm is at {WAITLIST_STAGES[group.stage].label} now.
                  </p>
                ) : (
                  <DataTable
                    caption={`Waitlist: ${WAITLIST_STAGES[group.stage].label}`}
                    columns={COLUMNS}
                    columnMenu={false}
                  >
                    <Rows entries={group.page.entries} today={group.page.today} />
                  </DataTable>
                )}
                {group.page.total > group.page.entries.length && (
                  <p className="page-note">
                    The first {formatNumber(group.page.entries.length)} of{" "}
                    {formatNumber(group.page.total)}.{" "}
                    <Link
                      className="text-link"
                      href={listHref({ stage: group.stage, view: "table" }, current)}
                    >
                      See them all
                    </Link>
                  </p>
                )}
              </RecordSection>
            ))}
        </div>
      )}
    </>
  );
}
