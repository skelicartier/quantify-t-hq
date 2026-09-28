import { decideTimeOffAction, requestTimeOffAction } from "@/app/(portal)/team/actions";
import { PageHeader } from "@/components/shell/page-header";
import { TimeOffRequestForm } from "@/components/team/team-forms";
import { Callout } from "@/components/ui/callout";
import { Card } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { StatusPill } from "@/components/ui/status-pill";
import { RowAction } from "@/components/ui/row-action";
import { hasCapability, requireStaff } from "@/lib/access/core";
import { HqApiRequestError, HqApiUnavailableError } from "@/lib/api/core";
import { readTimeOff, type TimeOffPage, type TimeOffRequest } from "@/lib/api/team";
import { isoDay } from "@/lib/crm/dates";
import { formatDate, formatLabel } from "@/lib/format";
import { requestNow } from "@/lib/request-time";

export const metadata = { title: "Time off" };
export const dynamic = "force-dynamic";

const STATUS_TONES: Record<string, "live" | "danger" | "attention" | "neutral"> = {
  approved: "live",
  declined: "danger",
  requested: "attention",
  canceled: "neutral",
};

function span(request: TimeOffRequest): string {
  return request.starts_on === request.ends_on
    ? `${formatDate(request.starts_on)} · 1 day`
    : `${formatDate(request.starts_on)} to ${formatDate(request.ends_on)} · ${request.days} days`;
}

export default async function TimeOffIndexPage() {
  const context = await requireStaff("/time-off");
  const today = isoDay(requestNow());
  let page: TimeOffPage | null = null;
  try {
    page = await readTimeOff(context.token);
  } catch (error) {
    if (!(error instanceof HqApiUnavailableError || error instanceof HqApiRequestError))
      throw error;
  }
  const canDecide = hasCapability(context, "hr:write");

  return (
    <>
      <PageHeader
        eyebrow="Work"
        title="Time off"
        description="Ask for time away; someone other than you says yes."
      />
      {page === null ? (
        <Callout tone="danger" role="alert">
          Time off could not be read just now.
        </Callout>
      ) : (
        <div className="record-layout">
          <div className="record-layout__main">
            {page.pending && (
              <section className="record-section" aria-labelledby="leave-pending">
                <h2 className="record-section__title" id="leave-pending">
                  Waiting for a decision
                </h2>
                {page.pending.length === 0 ? (
                  <p className="timeline-empty">Nothing waiting.</p>
                ) : (
                  <DataTable
                    caption="Requests waiting"
                    scroll={false}
                    columns={[
                      { key: "who", label: "Who" },
                      { key: "when", label: "When" },
                      { key: "kind", label: "Kind" },
                      { key: "decide", label: "Decide" },
                    ]}
                  >
                    {page.pending.map((request) => (
                      <tr key={request.request_id}>
                        <td>
                          <span className="table-title">{request.staff_name}</span>
                          {request.note && <span className="table-sub">{request.note}</span>}
                        </td>
                        <td>{span(request)}</td>
                        <td>{formatLabel(request.kind)}</td>
                        <td>
                          {canDecide && request.staff_id !== context.me.staff.staff_id ? (
                            <RowAction
                              action={decideTimeOffAction}
                              className="inline-form"
                              fields={{ request_id: request.request_id }}
                              buttons={[
                                {
                                  label: "Approve",
                                  className: "btn btn--small btn--primary",
                                  name: "decision",
                                  value: "approved",
                                },
                                {
                                  label: "Decline",
                                  className: "btn btn--small",
                                  name: "decision",
                                  value: "declined",
                                },
                              ]}
                              sentLabel="Decided."
                            />
                          ) : (
                            <span className="table-sub">Someone else decides</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </DataTable>
                )}
              </section>
            )}
            {page.upcoming && page.upcoming.length > 0 && (
              <Card title="Coming up" titleAs="h2">
                <ul className="side-list">
                  {page.upcoming.map((request) => (
                    <li key={request.request_id} className="renewal">
                      <span>
                        <strong>{request.staff_name}</strong> · {span(request)}
                      </span>
                      <span className="side-quiet">{formatLabel(request.kind)}</span>
                    </li>
                  ))}
                </ul>
              </Card>
            )}
            <section className="record-section" aria-labelledby="leave-mine">
              <h2 className="record-section__title" id="leave-mine">
                Your requests
              </h2>
              {page.mine.length === 0 ? (
                <p className="timeline-empty">You have not asked for time off yet.</p>
              ) : (
                <ul className="access-list">
                  {page.mine.map((request) => (
                    <li key={request.request_id} className="access">
                      <div className="access__main">
                        <span className="access__system">{span(request)}</span>
                        <span className="access__meta">
                          {formatLabel(request.kind)}
                          {request.note && ` · ${request.note}`}
                        </span>
                      </div>
                      <StatusPill
                        value={request.status}
                        label={formatLabel(request.status)}
                        tone={STATUS_TONES[request.status] ?? "neutral"}
                      />
                      {(request.status === "requested" || request.status === "approved") &&
                        (request.ends_on ?? "") >= today && (
                          <RowAction
                            action={decideTimeOffAction}
                            fields={{ request_id: request.request_id }}
                            buttons={[
                              {
                                label: "Withdraw",
                                className: "btn btn--small btn--ghost",
                                name: "decision",
                                value: "canceled",
                              },
                            ]}
                            sentLabel="Withdrawn."
                          />
                        )}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
          <aside className="record-layout__side">
            <Card title="Ask for time off" titleAs="h3">
              <TimeOffRequestForm action={requestTimeOffAction} today={today} />
            </Card>
          </aside>
        </div>
      )}
    </>
  );
}
