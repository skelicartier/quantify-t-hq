import Link from "next/link";

import { DataUnavailable } from "@/components/data/data-down";
import { DecisionFields } from "@/components/data/decisions/decision-fields";
import { MailForm } from "@/components/mail/mail-form";
import { PageHeader } from "@/components/shell/page-header";
import { ButtonLink } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { DataTable } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Select } from "@/components/ui/field";
import { Popover } from "@/components/ui/popover";
import { StatusPill } from "@/components/ui/status-pill";
import { SegmentedLinks } from "@/components/ui/toolbar";
import { DATA_ROLE_LINE, requireData } from "@/lib/data/access";
import { readDecisions, type DecisionRow, type DecisionsPage } from "@/lib/data/api/notes";
import { DECISION_STATUSES, DECISION_STATUS_ORDER, NOTE_SUBJECTS } from "@/lib/data/labels";
import { dataRead } from "@/lib/data/read";
import { formatDate, formatNumber } from "@/lib/format";
import { boundedInteger, firstSearchValue } from "@/lib/search-params";

import "@/components/data/notes/notes.css";
import { addDecisionAction, supersedeDecisionAction, updateDecisionAction } from "./actions";

export const metadata = { title: "Decisions" };
export const dynamic = "force-dynamic";

const BASE = "/data/decisions";
const PAGE_SIZE = 100;
const ABOUT =
  "What was decided, why, by whom and when, and what replaced it. A decision can come from a note or be written here. Each new intern can read why things are as they are.";

const COLUMNS = [
  { key: "on", label: "Decided on" },
  { key: "decision", label: "Decision", width: "34%" },
  { key: "who", label: "Who decided" },
  { key: "status", label: "Status" },
  { key: "from", label: "From" },
  { key: "replaced", label: "Replaced by" },
  { key: "change", label: "Change", align: "end" as const },
];

type Params = Record<string, string | string[] | undefined>;
type Option = { decision_id: string; title: string };

export default async function DecisionsPage({ searchParams }: { searchParams: Promise<Params> }) {
  const { allowed, context } = await requireData(BASE);
  const parameters = await searchParams;
  const asked = firstSearchValue(parameters.status) ?? "";
  const status = asked in DECISION_STATUSES ? asked : "";
  const q = (firstSearchValue(parameters.q) ?? "").slice(0, 200);
  const offset = boundedInteger(firstSearchValue(parameters.offset), 0, 200_000);
  const open = firstSearchValue(parameters.new) === "1";
  const me = context.me.staff.display_name || context.me.staff.email;
  const read = allowed
    ? await dataRead(async () => {
        const [page, decided] = await Promise.all([
          readDecisions({ status, q, offset }),
          readDecisions({ status: "decided" }),
        ]);
        return { page, decided };
      })
    : null;
  const data = read?.ok ? read.data : null;
  const decided: Option[] =
    data?.decided.decisions.map((item) => ({
      decision_id: item.decision_id,
      title: item.title,
    })) ?? [];
  return (
    <>
      <PageHeader
        title="Decisions"
        description={ABOUT}
        meta={
          data ? (
            <span className="quiet">{formatNumber(data.decided.total)} decided</span>
          ) : undefined
        }
        actions={
          data ? (
            <Popover
              label="Record a decision"
              variant="primary"
              align="end"
              width="wide"
              defaultOpen={open}
            >
              <MailForm
                action={addDecisionAction}
                submitLabel="Record the decision"
                pendingLabel="Recording…"
              >
                <DecisionFields
                  prefix="decision-new"
                  values={{ title: "", why: "", decided_by: me, decided_on: "", status: "decided" }}
                  replaces={decided}
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
          <Decisions page={read.data.page} decided={decided} status={status} q={q} />
        )}
      </div>
    </>
  );
}

function listHref(
  change: { status?: string; q?: string; offset?: number },
  current: { status: string; q: string },
): string {
  const params = new URLSearchParams();
  const status = change.status ?? current.status;
  const q = change.q ?? current.q;
  if (status) params.set("status", status);
  if (q) params.set("q", q);
  if (change.offset) params.set("offset", String(change.offset));
  const rendered = params.toString();
  return `${BASE}${rendered ? `?${rendered}` : ""}`;
}

function Decisions({
  page,
  decided,
  status,
  q,
}: {
  page: DecisionsPage;
  decided: readonly Option[];
  status: string;
  q: string;
}) {
  const current = { status, q };
  const offset = page.offset ?? 0;
  const last = offset + page.decisions.length;
  const nothing = (page.counts.all ?? 0) === 0 && !q;
  return (
    <div className="hqdata-notes">
      <div className="hqdata-notes-tools">
        <SegmentedLinks
          label="Status"
          items={[
            {
              href: listHref({ status: "" }, current),
              label: `All ${formatNumber(page.counts.all ?? 0)}`,
              current: !status,
            },
            ...DECISION_STATUS_ORDER.map((key) => ({
              href: listHref({ status: key }, current),
              label: `${DECISION_STATUSES[key].label} ${formatNumber(page.counts[key] ?? 0)}`,
              current: status === key,
            })),
          ]}
        />
        <form className="filter-strip__search merge-search" action={BASE} role="search">
          {status && <input type="hidden" name="status" value={status} />}
          <label className="sr-only" htmlFor="decisions-q">
            Search decisions
          </label>
          <input
            id="decisions-q"
            className="input input--small"
            name="q"
            type="search"
            maxLength={200}
            defaultValue={q}
            placeholder="Words from the decision or why"
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
      <p className="hqdata-print-only">
        {status
          ? `Status: ${DECISION_STATUSES[status as DecisionRow["status"]].label}`
          : "Every status"}
        {q ? ` · Search: “${q}”` : ""}
      </p>
      <DataTable
        caption="Decisions"
        columns={COLUMNS}
        columnMenu={false}
        scroll={false}
        isEmpty={page.decisions.length === 0}
        empty={
          nothing ? (
            <EmptyState
              compact
              title="No decisions yet"
              description="Record one here, or from a note."
            />
          ) : (
            <EmptyState
              compact
              title="No decision matches"
              description="Try fewer words, or All."
            />
          )
        }
      >
        {page.decisions.map((decision) => (
          <DecisionLine key={decision.decision_id} decision={decision} decided={decided} />
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
              href={listHref({ offset: Math.max(0, offset - PAGE_SIZE) }, current)}
            >
              Previous
            </ButtonLink>
          )}
          {last < page.total && (
            <ButtonLink size="small" href={listHref({ offset: offset + PAGE_SIZE }, current)}>
              Next
            </ButtonLink>
          )}
        </nav>
      )}
    </div>
  );
}

function DecisionLine({
  decision,
  decided,
}: {
  decision: DecisionRow;
  decided: readonly Option[];
}) {
  const label = DECISION_STATUSES[decision.status];
  const short = decision.decision_id.slice(0, 8);
  const others = decided.filter((item) => item.decision_id !== decision.decision_id);
  const from = decision.from_note;
  return (
    <tr id={`decision-${decision.decision_id}`}>
      <td className="nowrap">
        {decision.decided_on ? (
          formatDate(decision.decided_on)
        ) : (
          <span className="table-sub">No day</span>
        )}
      </td>
      <td>
        <span className="table-title">{decision.title}</span>
        {decision.why && (
          <span className="table-sub table-sub--prose" title={decision.why}>
            {decision.why}
          </span>
        )}
      </td>
      <td>{decision.decided_by || <span className="table-sub">Not given</span>}</td>
      <td className="nowrap">
        <StatusPill value={decision.status} label={label.label} tone={label.tone} />
      </td>
      <td>
        {from ? (
          <>
            <Link className="text-link" href={`/data/notes/${from.note_id}`}>
              {decision.from_note_title || "A note"}
            </Link>
            <span className="table-sub">
              {from.subject_name} · {NOTE_SUBJECTS[from.subject.kind]}
            </span>
          </>
        ) : (
          <span className="table-sub">Written here</span>
        )}
      </td>
      <td>
        {decision.superseded_by ? (
          <a className="text-link" href={`#decision-${decision.superseded_by}`}>
            {decision.superseded_by_title || "A later decision"}
          </a>
        ) : (
          <span className="table-sub">—</span>
        )}
      </td>
      <td>
        <div className="hqdata-notes__acts">
          <Popover label="Edit" align="end" width="wide">
            <MailForm
              action={updateDecisionAction}
              fields={{ decision_id: decision.decision_id }}
              submitLabel="Save"
              pendingLabel="Saving…"
            >
              <DecisionFields
                prefix={`decision-${short}`}
                values={{ ...decision, decided_on: decision.decided_on ?? "" }}
              />
            </MailForm>
          </Popover>
          {decision.superseded_by === null && others.length > 0 && (
            <Popover label="Replace it with…" align="end" width="wide">
              <MailForm
                action={supersedeDecisionAction}
                fields={{ decision_id: decision.decision_id }}
                submitLabel="Mark it superseded"
                pendingLabel="Saving…"
              >
                <Field id={`replace-${short}`} label="The decision that replaces it">
                  <Select id={`replace-${short}`} name="by_decision_id" required defaultValue="">
                    <option value="" disabled>
                      Choose a decided decision
                    </option>
                    {others.map((item) => (
                      <option key={item.decision_id} value={item.decision_id}>
                        {item.title}
                      </option>
                    ))}
                  </Select>
                </Field>
                <p className="field__hint">
                  It then reads Superseded, with the newer decision beside it.
                </p>
              </MailForm>
            </Popover>
          )}
        </div>
      </td>
    </tr>
  );
}
