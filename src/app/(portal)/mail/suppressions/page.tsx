import { confirmSudoAction } from "@/app/(portal)/admin/actions";
import { addSuppressionAction, releaseSuppressionAction } from "@/app/(portal)/mail/actions";
import { SudoGate } from "@/components/admin/sudo-gate";
import { MailForm } from "@/components/mail/mail-form";
import { MailTabs } from "@/components/mail/mail-tabs";
import { PageHeader } from "@/components/shell/page-header";
import { Callout } from "@/components/ui/callout";
import { Card } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input } from "@/components/ui/field";
import { Popover } from "@/components/ui/popover";
import { Stat, StatGrid } from "@/components/ui/stat";
import { Timestamp } from "@/components/ui/timestamp";
import { hasCapability, requireStaff } from "@/lib/access/core";
import { HqApiRequestError, HqApiUnavailableError } from "@/lib/api/core";
import { SUPPRESSION_REASON_LABELS, readSuppressions, type MailSuppression } from "@/lib/api/mail";
import { formatAbsolute } from "@/lib/format";
import { requestNow } from "@/lib/request-time";
import { firstSearchValue } from "@/lib/search-params";

export const metadata = { title: "Stop list" };
export const dynamic = "force-dynamic";

const COLUMNS = [
  { key: "address", label: "Address" },
  { key: "reason", label: "Why" },
  { key: "scope", label: "Stops" },
  { key: "source", label: "From" },
  { key: "added", label: "Added" },
  { key: "release", label: "" },
];

function scopeText(row: MailSuppression): string {
  if (row.scope === "topic")
    return row.scope_key === "sales" ? "Sales emails" : `The ${row.scope_key} topic`;
  if (row.scope === "sender") return "One sender";
  return "Everything";
}

function sourceText(source: string): string {
  if (source.startsWith("webhook:")) return "Delivery report";
  if (source.startsWith("reconcile:")) return "Provider's list";
  if (source.startsWith("admin:") || source.startsWith("outcome:") || source.startsWith("manual"))
    return "A colleague";
  if (source === "one_click" || source === "landing_page") return "The recipient";
  return source || "—";
}

/** The service keeps the unsubscribe's mode as its detail; bounce codes stay as the provider wrote them. */
const DETAIL_TEXT: Record<string, string> = {
  one_click: "One-click unsubscribe from their mail app",
  all: "Unsubscribed from everything on the stop page",
  topics: "Turned every topic off",
  sales: "Asked sales to stop",
  "provider unsubscribe": "Unsubscribed through their mailbox",
};

type StopListProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function StopListPage({ searchParams }: StopListProps) {
  const context = await requireStaff("/mail/suppressions");
  const parameters = await searchParams;
  const q = firstSearchValue(parameters.q) ?? "";
  const released = firstSearchValue(parameters.released) === "1";
  const now = requestNow();
  let page: Awaited<ReturnType<typeof readSuppressions>> | null = null;
  try {
    page = await readSuppressions(context.token, { q, released });
  } catch (error) {
    if (!(error instanceof HqApiUnavailableError || error instanceof HqApiRequestError))
      throw error;
  }
  const canWrite = hasCapability(context, "crm:write");
  const isAdmin = hasCapability(context, "hq:admin");
  const fresh = context.me.sudo_fresh;
  const untilLabel = context.me.sudo_until
    ? (formatAbsolute(context.me.sudo_until).split(", ")[1] ?? null)
    : null;
  return (
    <>
      <PageHeader
        eyebrow="Mail"
        title="Stop list"
        description="Addresses nothing is sent to. Bounces, spam complaints and unsubscribes land here by themselves, at once; rows are never deleted, only released with a reason."
        actions={<MailTabs current="/mail/suppressions" />}
      />
      <div className="page-content">
        {page === null ? (
          <Callout tone="danger" role="alert">
            The stop list could not be read just now. This is a read failure, not an empty list.
          </Callout>
        ) : (
          <>
            <StatGrid columns={4} label="Stops by reason">
              <Stat label="Unsubscribed" value={page.by_reason.unsubscribe ?? 0} />
              <Stat
                label="Hard bounces"
                value={
                  (page.by_reason.hard_bounce ?? 0) +
                  (page.by_reason.invalid_address ?? 0) +
                  (page.by_reason.soft_bounce_limit ?? 0)
                }
              />
              <Stat
                label="Spam complaints"
                value={page.by_reason.complaint ?? 0}
                tone={(page.by_reason.complaint ?? 0) > 0 ? "danger" : "default"}
              />
              <Stat
                label="Added by hand"
                value={(page.by_reason.manual ?? 0) + (page.by_reason.provider_blocked ?? 0)}
              />
            </StatGrid>
            <div className="record-layout">
              <div className="record-layout__main">
                <form className="filter-strip" action="/mail/suppressions" role="search">
                  <label className="sr-only" htmlFor="stop-q">
                    Search addresses
                  </label>
                  <input
                    id="stop-q"
                    className="input input--small"
                    name="q"
                    defaultValue={q}
                    placeholder="Address or domain"
                  />
                  <label className="inline-check">
                    <input type="checkbox" name="released" value="1" defaultChecked={released} />{" "}
                    Include released
                  </label>
                  <button className="btn btn--small" type="submit">
                    Filter
                  </button>
                </form>
                <DataTable
                  caption="Stopped addresses"
                  columns={COLUMNS}
                  isEmpty={page.suppressions.length === 0}
                  empty={
                    <EmptyState
                      compact
                      title={q ? "No address matches" : "Nobody is stopped"}
                      description="Bounces, complaints and unsubscribes will appear here the moment they happen."
                    />
                  }
                >
                  {page.suppressions.map((row) => (
                    <tr key={row.suppression_id} className={row.active ? undefined : "row--muted"}>
                      <td>
                        <span className="table-title mono">{row.email}</span>
                        {row.detail && (
                          <span className="table-sub">{DETAIL_TEXT[row.detail] ?? row.detail}</span>
                        )}
                      </td>
                      <td>{SUPPRESSION_REASON_LABELS[row.reason] ?? row.reason}</td>
                      <td>{scopeText(row)}</td>
                      <td className="nowrap">{row.created_by?.name ?? sourceText(row.source)}</td>
                      <td>
                        <Timestamp value={row.created_at} now={now} mode="relative" />
                      </td>
                      <td>
                        {row.active ? (
                          isAdmin && (
                            <Popover label="Release" align="end">
                              <MailForm
                                action={releaseSuppressionAction}
                                fields={{ suppression_id: row.suppression_id }}
                                submitLabel="Release"
                                disabled={!fresh}
                              >
                                <p className="page-note">
                                  {row.reason === "complaint"
                                    ? "Only an owner releases a spam complaint, and only with the recipient's own word."
                                    : "Mail may go to this address again after this."}
                                </p>
                                <Field id={`release-${row.suppression_id}`} label="Why">
                                  <Input
                                    id={`release-${row.suppression_id}`}
                                    name="note"
                                    maxLength={400}
                                    required
                                  />
                                </Field>
                              </MailForm>
                            </Popover>
                          )
                        ) : (
                          <span className="table-sub">
                            Released by {row.released_by?.name ?? "—"}: {row.release_note}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </DataTable>
              </div>
              <aside className="record-layout__side">
                {canWrite && (
                  <Card
                    title="Stop an address"
                    titleAs="h3"
                    description="Someone asked by phone, or the address belongs to a person who left. Everything queued for it is cancelled."
                  >
                    <MailForm action={addSuppressionAction} submitLabel="Stop it">
                      <Field id="stop-email" label="Address">
                        <Input id="stop-email" name="email" type="email" maxLength={254} required />
                      </Field>
                      <Field id="stop-detail" label="Why">
                        <Input id="stop-detail" name="detail" maxLength={400} required />
                      </Field>
                    </MailForm>
                  </Card>
                )}
                {isAdmin && (
                  <SudoGate
                    action={confirmSudoAction}
                    fresh={fresh}
                    untilLabel={untilLabel}
                    returnPath="/mail/suppressions"
                    purpose="Releasing an address needs a fresh code from your authenticator app."
                  />
                )}
              </aside>
            </div>
          </>
        )}
      </div>
    </>
  );
}
