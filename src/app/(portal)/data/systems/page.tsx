import Link from "next/link";

import { DataUnavailable } from "@/components/data/data-down";
import { ControlRefNote, PracticeNote } from "@/components/data/security/control-ref";
import { SystemsTabs } from "@/components/data/systems/systems-tabs";
import { ToolFields } from "@/components/data/tools/tool-fields";
import { MailForm } from "@/components/mail/mail-form";
import { PageHeader } from "@/components/shell/page-header";
import { Callout } from "@/components/ui/callout";
import { DataTable } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input } from "@/components/ui/field";
import { Popover } from "@/components/ui/popover";
import { RowAction } from "@/components/ui/row-action";
import { SegmentedLinks } from "@/components/ui/toolbar";
import { DATA_ROLE_LINE, requireData } from "@/lib/data/access";
import { readTools, type ToolRow, type ToolsPage } from "@/lib/data/api/tools";
import { dayWords } from "@/lib/data/labels-company";
import { NOT_ADVICE, countWords } from "@/lib/data/labels-controls";
import {
  DATA_CLASSES,
  SIGN_IN,
  TOOLS_EMPTY,
  TOOL_CATEGORIES,
  TOOL_VIEWS,
  TWO_STEP,
  type ToolView,
} from "@/lib/data/labels-systems";
import { dataRead } from "@/lib/data/read";
import { firstSearchValue } from "@/lib/search-params";

import { addToolAction, keepSubprocessorsAction, setupAction } from "./actions";
import "./systems.css";

export const metadata = { title: "Tools" };
export const dynamic = "force-dynamic";

const BASE = "/data/systems";
const ABOUT = `Every tool the company signs in to: who owns it, how it is signed in to, what data it holds, what it costs and when it renews, and how to leave it. Buyers ask for the sub-processors among them. ${NOT_ADVICE}`;

type Params = Record<string, string | string[] | undefined>;

export default async function ToolsRegisterPage({
  searchParams,
}: {
  searchParams: Promise<Params>;
}) {
  const { allowed } = await requireData(BASE);
  const parameters = await searchParams;
  const asked = firstSearchValue(parameters.view) ?? "";
  const view: ToolView = Object.prototype.hasOwnProperty.call(TOOL_VIEWS, asked)
    ? (asked as ToolView)
    : "in_use";
  const read = allowed ? await dataRead(() => readTools(view)) : null;
  const data = read?.ok ? read.data : null;
  return (
    <>
      <PageHeader
        title="Tools"
        description={ABOUT}
        meta={
          data ? (
            <span className="quiet">
              {countWords(data.counts.in_use + data.counts.trial + data.counts.ending, "tool")} in
              use
            </span>
          ) : undefined
        }
        actions={
          data ? (
            <>
              <Secondary page={data} />
              <Popover label="Add a tool" variant="primary" align="end" width="wide">
                <MailForm
                  action={addToolAction}
                  submitLabel="Add the tool"
                  pendingLabel="Adding…"
                  className="stack-form stack-form--tight"
                >
                  <ToolFields prefix="tool-new" values={null} />
                </MailForm>
              </Popover>
            </>
          ) : undefined
        }
      />
      <div className="page-content">
        <SystemsTabs current="tools" />
        {!allowed || !read ? (
          <Callout tone="neutral">{DATA_ROLE_LINE}</Callout>
        ) : !read.ok ? (
          <DataUnavailable failure={read} />
        ) : (
          <div className="hqdata-systems">
            <p className="page-note">
              <ControlRefNote refs={["a5_9", "a5_23"]} />
            </p>
            <ToolsList page={read.data} />
            <p className="page-note">{NOT_ADVICE}</p>
          </div>
        )}
      </div>
    </>
  );
}

function Checks({ lines }: { lines: readonly string[] }) {
  return (
    <>
      {lines.map((line, index) => (
        <span key={`${index}-${line}`} className="hqdata-systems__check">
          {line}
        </span>
      ))}
    </>
  );
}

function Secondary({ page }: { page: ToolsPage }) {
  const listed = page.subprocessors.length;
  return (
    <div className="hqdata-systems__links">
      {page.counts.in_use + page.counts.trial + page.counts.ending + page.counts.retired > 0 && (
        <a className="text-link" href={`${BASE}/export`}>
          Download the list
        </a>
      )}
      <Popover label="Sub-processor list" align="end" width="wide">
        <div className="stack-form stack-form--tight" data-section="tools-subprocessors">
          <p className="page-note">
            {listed === 0
              ? "No tool is marked as a sub-processor yet. Mark one on its page."
              : `${countWords(listed, "service")}: ${page.subprocessors.map((item) => item.name).join(", ")}.`}
          </p>
          <p className="page-note">
            <ControlRefNote refs={["a5_19", "a5_20", "a5_21", "a5_22"]} />
          </p>
          {listed > 0 && (
            <>
              <a className="text-link" href={`${BASE}/subprocessors`}>
                Download
              </a>
              {page.files_here ? (
                <RowAction
                  action={keepSubprocessorsAction}
                  fields={{}}
                  buttons={[
                    {
                      label: "Keep a copy in Files",
                      className: "btn btn--small",
                      pendingLabel: "Keeping…",
                    },
                  ]}
                  sentLabel="Kept in Files."
                />
              ) : (
                <p className="field__hint">Files is not set up here, so no copy can be kept.</p>
              )}
              {page.kept && (
                <p className="page-note">
                  Kept in Files as{" "}
                  <Link className="text-link" href={`/data/files/${page.kept.file_id}`}>
                    {page.kept.title}
                  </Link>
                  .
                </p>
              )}
            </>
          )}
        </div>
      </Popover>
      <Popover label="How often each is looked at" align="end">
        <MailForm action={setupAction} submitLabel="Save" pendingLabel="Saving…">
          <p className="page-note">
            <PracticeNote
              practice="tool_review"
              {...(page.review_months !== null ? { amount: page.review_months } : {})}
            />
          </p>
          <Field
            id="tools-review-months"
            label="Months between looks"
            hint="Leave it empty for HQ's default."
          >
            <Input
              id="tools-review-months"
              name="review_months"
              inputMode="numeric"
              maxLength={2}
              defaultValue={page.review_months === null ? "" : String(page.review_months)}
            />
          </Field>
        </MailForm>
      </Popover>
    </div>
  );
}

function renewalCell(tool: ToolRow) {
  if (tool.retired) return <span className="quiet">—</span>;
  if (tool.next.renewal)
    return <span className="nowrap">Cancel by {dayWords(tool.next.renewal.cancel_by)}</span>;
  return <span className="quiet">{tool.billing === "free" ? "Free" : "None"}</span>;
}

function ToolsList({ page }: { page: ToolsPage }) {
  const total = page.counts.in_use + page.counts.trial + page.counts.ending + page.counts.retired;
  const counts: Record<ToolView, number> = {
    in_use: page.counts.in_use,
    trial: page.counts.trial,
    ending: page.counts.ending,
    retired: page.counts.retired,
    all: total,
  };
  return (
    <section data-section="tools-list">
      <div className="hqdata-systems__tools">
        <SegmentedLinks
          label="Which tools"
          items={(Object.keys(TOOL_VIEWS) as ToolView[]).map((key) => ({
            href: key === "in_use" ? BASE : `${BASE}?view=${key}`,
            label: `${TOOL_VIEWS[key]} ${counts[key].toLocaleString("en-GB")}`,
            current: page.view === key,
          }))}
        />
      </div>
      <p className="hqdata-print-only">{TOOL_VIEWS[page.view]}</p>
      <DataTable
        caption="Tools"
        columns={[
          { key: "tool", label: "Tool", width: "22%" },
          { key: "category", label: "Category" },
          { key: "owner", label: "Owner" },
          { key: "sign-in", label: "Sign-in" },
          { key: "two-step", label: "Two-step" },
          { key: "holds", label: "Holds" },
          { key: "accounts", label: "Accounts" },
          { key: "renewal", label: "Renewal" },
          { key: "looked", label: "Looked at" },
        ]}
        columnMenu={false}
        isEmpty={page.tools.length === 0}
        empty={
          total === 0 ? (
            <EmptyState compact title="No tools" description={TOOLS_EMPTY} />
          ) : (
            <EmptyState
              compact
              title={`No tools under ${TOOL_VIEWS[page.view]}`}
              description="See the others under All."
            />
          )
        }
      >
        {page.tools.map((tool) => (
          <tr
            key={tool.tool_id}
            id={`tool-${tool.tool_id}`}
            className={tool.retired ? "hqdata-systems__gone" : undefined}
          >
            <td>
              <Link className="table-title" href={tool.href}>
                {tool.name}
              </Link>
              {tool.what && <span className="table-sub">{tool.what}</span>}
              {tool.retired && (
                <span className="table-sub">
                  Retired {dayWords(tool.retired.on)}: {tool.retired.why}
                </span>
              )}
              <Checks lines={tool.checks} />
            </td>
            <td>{TOOL_CATEGORIES[tool.category]}</td>
            <td>{tool.business_owner || <span className="quiet">—</span>}</td>
            <td>{SIGN_IN[tool.sign_in]}</td>
            <td>{TWO_STEP[tool.mfa]}</td>
            <td>
              {tool.holds.length === 0 ? (
                <span className="quiet">Nothing marked</span>
              ) : (
                tool.holds.map((key) => DATA_CLASSES[key]).join(", ")
              )}
            </td>
            <td className="nowrap">
              {tool.seats === null
                ? countWords(tool.accounts_open, "account")
                : `${tool.accounts_open.toLocaleString("en-GB")} on ${countWords(tool.seats, "seat")}`}
            </td>
            <td>{renewalCell(tool)}</td>
            <td className="nowrap">{dayWords(tool.looked_on)}</td>
          </tr>
        ))}
      </DataTable>
    </section>
  );
}
