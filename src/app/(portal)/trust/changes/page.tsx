import Link from "next/link";

import { createTrustRecordAction } from "@/app/(portal)/trust/actions";
import { PageHeader } from "@/components/shell/page-header";
import { TrustPill, TrustTabs } from "@/components/trust/trust-parts";
import { ActForm } from "@/components/ui/act-form";
import { Callout } from "@/components/ui/callout";
import { Section } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Popover } from "@/components/ui/popover";
import { SegmentedLinks } from "@/components/ui/toolbar";
import { hasCapability, requireStaff } from "@/lib/access/core";
import { HqApiRequestError, HqApiUnavailableError } from "@/lib/api/core";
import { readChanges, type ChangeLog } from "@/lib/api/trust";
import { formatAbsolute } from "@/lib/format";

export const metadata = { title: "Changes" };
export const dynamic = "force-dynamic";

const COLUMNS = [
  { key: "when", label: "When" },
  { key: "change", label: "Change" },
  { key: "kind", label: "Kind" },
  { key: "system", label: "Where" },
  { key: "risk", label: "Risk" },
  { key: "approval", label: "Approval" },
  { key: "outcome", label: "Outcome" },
  { key: "by", label: "Recorded by" },
];

type SearchParams = Promise<{ kind?: string; waiting?: string }>;

function href(kind: string, waiting: boolean): string {
  const query = new URLSearchParams();
  if (kind) query.set("kind", kind);
  if (waiting) query.set("waiting", "1");
  const text = query.toString();
  return text ? `/trust/changes?${text}` : "/trust/changes";
}

/**
 * What changed in production, where, how risky and how it is undone — with a high-risk
 * change approved by someone other than the person who recorded it.
 */
export default async function ChangesPage({ searchParams }: { searchParams: SearchParams }) {
  const { kind = "", waiting = "" } = await searchParams;
  const context = await requireStaff("/trust/changes");
  if (!hasCapability(context, "audit:read")) {
    return (
      <>
        <PageHeader title="Changes" />
        <Callout tone="neutral">The trust registers are kept by Admins and Owners.</Callout>
      </>
    );
  }
  const canWrite = hasCapability(context, "hq:admin");
  const onlyWaiting = waiting === "1";
  let log: ChangeLog | null = null;
  try {
    log = await readChanges(context.token, { kind, waiting: onlyWaiting });
  } catch (error) {
    if (!(error instanceof HqApiUnavailableError || error instanceof HqApiRequestError))
      throw error;
  }

  return (
    <>
      <PageHeader
        title="Production changes"
        description="Every release, configuration, database, access and infrastructure change. A medium or high-risk change names its way back; a high-risk one waits for a second person's approval, and one that went ahead without it stays flagged until someone else approves it."
        actions={
          <>
            <TrustTabs context={context} current="/trust/changes" />
            {canWrite && log && (
              <Popover label="Record a change" variant="primary" width="wide">
                <ActForm
                  action={createTrustRecordAction}
                  hidden={{ register: "change" }}
                  act="create"
                  label="Record the change"
                  primary
                  tight={false}
                >
                  <Field id="change-title" label="What changed">
                    <Input id="change-title" name="title" maxLength={200} required />
                  </Field>
                  <div className="form-grid">
                    <Field id="change-kind" label="Kind">
                      <Select id="change-kind" name="kind" defaultValue="deploy">
                        {log.kinds.map((item) => (
                          <option key={item.value} value={item.value}>
                            {item.label}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <Field id="change-system" label="Where">
                      <Input
                        id="change-system"
                        name="system"
                        maxLength={120}
                        placeholder="Account service"
                      />
                    </Field>
                  </div>
                  <div className="form-grid">
                    <Field
                      id="change-risk"
                      label="Risk"
                      hint="High waits for a second person's approval."
                    >
                      <Select id="change-risk" name="risk" defaultValue="low">
                        {log.risks.map((risk) => (
                          <option key={risk} value={risk}>
                            {risk.charAt(0).toUpperCase() + risk.slice(1)}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <Field id="change-outcome" label="State">
                      <Select id="change-outcome" name="outcome" defaultValue="done">
                        {log.outcomes.map((item) => (
                          <option key={item.value} value={item.value}>
                            {item.label}
                          </option>
                        ))}
                      </Select>
                    </Field>
                  </div>
                  <Field
                    id="change-when"
                    label="When"
                    hint="Leave empty for now. A planned change is dated ahead."
                  >
                    <Input id="change-when" name="happened_at" type="datetime-local" />
                  </Field>
                  <Field
                    id="change-rollback"
                    label="How it is undone"
                    hint="Needed for medium and high risk."
                  >
                    <Textarea id="change-rollback" name="rollback_plan" rows={2} maxLength={1000} />
                  </Field>
                  <Field id="change-description" label="Detail">
                    <Textarea
                      id="change-description"
                      name="description"
                      rows={2}
                      maxLength={2000}
                    />
                  </Field>
                  <Field id="change-incident" label="Incident reference">
                    <Input
                      id="change-incident"
                      name="incident_reference"
                      maxLength={64}
                      placeholder="If it caused or fixed one"
                    />
                  </Field>
                </ActForm>
              </Popover>
            )}
          </>
        }
      />
      {log === null ? (
        <Callout tone="danger" role="alert">
          The change log could not be read just now.
        </Callout>
      ) : (
        <div className="page-content">
          {log.waiting > 0 && (
            <Callout tone="attention" compact>
              {log.waiting} high-risk change{log.waiting === 1 ? "" : "s"} without a second
              person&apos;s approval. <Link href={href("", true)}>Show them</Link>
            </Callout>
          )}
          <Section
            id="changes"
            title="The log"
            description={`${log.last_30_days.count} change${log.last_30_days.count === 1 ? "" : "s"} in the last 30 days; ${log.last_30_days.failed} failed or rolled back.`}
            actions={
              <SegmentedLinks
                label="Which changes"
                items={[
                  { href: href(log.kind, false), label: "All", current: !onlyWaiting },
                  { href: href(log.kind, true), label: "Needs approval", current: onlyWaiting },
                ]}
              />
            }
          >
            <form className="filter-strip" action="/trust/changes" role="search">
              <label className="sr-only" htmlFor="changes-kind">
                Kind of change
              </label>
              <select
                id="changes-kind"
                className="input input--small"
                name="kind"
                defaultValue={log.kind}
              >
                <option value="">Every kind</option>
                {log.kinds.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
              {onlyWaiting && <input type="hidden" name="waiting" value="1" />}
              <button className="btn btn--small" type="submit">
                Show
              </button>
            </form>
            <DataTable
              caption="Production changes, newest first"
              columns={COLUMNS}
              isEmpty={log.changes.length === 0}
              empty={<p className="muted">No changes here.</p>}
            >
              {log.changes.map((change) => (
                <tr key={change.change_id}>
                  <td>{formatAbsolute(change.happened_at, "—")}</td>
                  <td>
                    <Link href={`/trust/changes/${change.change_id}`}>{change.title}</Link>
                  </td>
                  <td>{change.kind_label}</td>
                  <td>{change.system}</td>
                  <td>{change.risk.charAt(0).toUpperCase() + change.risk.slice(1)}</td>
                  <td>
                    <TrustPill state={change.approval} />
                  </td>
                  <td>
                    <TrustPill state={change.outcome} />
                  </td>
                  <td>{change.recorded_by_name}</td>
                </tr>
              ))}
            </DataTable>
          </Section>
        </div>
      )}
    </>
  );
}
