import { Callout } from "@/components/ui/callout";
import { Timestamp } from "@/components/ui/timestamp";
import { HqApiRequestError, HqApiUnavailableError } from "@/lib/api/core";
import { nameFor, searchAudit, type AuditEvent } from "@/lib/api/staff";
import { LIFECYCLE_LABELS, LOSS_REASON_LABELS, TASK_REPEAT_LABELS } from "@/lib/crm/vocabulary";
import { formatSentence } from "@/lib/format";

/**
 * A record's history: every audited act on it, newest first, with what each update
 * changed — the value before and the value after. Read from the audit log itself, so
 * what the tab shows is exactly what an auditor would be shown. Only a role that may
 * read the audit log sees it.
 */

const FIELD_LABELS: Record<string, string> = {
  owner_staff_id: "Owner",
  assignee_staff_id: "Assignee",
  primary_person_id: "Main contact",
  lifecycle: "Lifecycle",
  firm_type: "Type",
  team_size_band: "Team size",
  country: "Country",
  domain: "Web domain",
  name: "Name",
  full_name: "Name",
  email: "Email",
  title: "Title",
  role_category: "Role",
  phone: "Phone",
  do_not_contact: "Do not contact",
  source_key: "Source",
  notes: "Notes",
  mrr_amount: "Monthly value",
  currency: "Currency",
  seats: "Seats",
  plan_key: "Plan",
  plan_name: "Plan name",
  expected_close_date: "Expected close",
  next_step: "Next step",
  next_step_due: "Next step due",
  stage_key: "Stage",
  status: "Status",
  loss_reason: "Loss reason",
  billing_cadence: "Billed",
  term_months: "Term",
  renews_on: "Renews",
  ends_on: "Ends",
  cancel_reason: "Cancel reason",
  renewal_status: "Renewal expectation",
  renewal_confidence: "Renewal confidence",
  renewal_forecast_mrr: "Renews at",
  renewal_note: "Renewal note",
  customer_since: "Customer since",
  archived_at: "Archived",
  // Tasks, meetings, support conversations and leads.
  due_on: "Due",
  repeat_rule: "Repeats",
  repeat_until: "Repeats until",
  priority: "Priority",
  tags: "Tags",
  snoozed_until: "Snoozed until",
  linked_issue_url: "Linked issue",
  assignee_name: "Assigned to",
  starts_at: "Starts",
  ends_at: "Ends",
  prep_notes: "Prep notes",
  recording_url: "Recording",
  stage: "Stage",
  disqualify_reason: "Disqualified because",
  company_name: "Firm",
  body: "Notes",
};

type Change = { from: string; to: string };
type StaffDirectory = Parameters<typeof nameFor>[0];

function isChange(value: unknown): value is Change {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as Change).from === "string" &&
    typeof (value as Change).to === "string"
  );
}

function valueText(field: string, value: string, names: StaffDirectory | null): string {
  if (value === "") return "—";
  if (field.endsWith("_staff_id")) return nameFor(names, value);
  if (field === "lifecycle") return LIFECYCLE_LABELS[value] ?? value;
  if (field === "loss_reason") return LOSS_REASON_LABELS[value] ?? value;
  if (field === "repeat_rule") return TASK_REPEAT_LABELS[value] ?? value;
  if (value === "True" || value === "true") return "Yes";
  if (value === "False" || value === "false") return "No";
  return value;
}

export async function RecordHistory({
  token,
  entityType,
  entityId,
  names,
  canRead,
  now,
}: {
  token: string;
  entityType: string;
  entityId: string;
  names: StaffDirectory | null;
  canRead: boolean;
  now: number;
}) {
  if (!canRead) {
    return (
      <Callout tone="neutral" compact>
        History is read from the audit log, which your role cannot see.
      </Callout>
    );
  }
  let events: AuditEvent[] | null = null;
  try {
    events = (
      await searchAudit(
        token,
        { entity_type: entityType, entity_id: entityId },
        { limit: 50, offset: 0 },
      )
    ).events;
  } catch (error) {
    if (!(error instanceof HqApiUnavailableError || error instanceof HqApiRequestError))
      throw error;
  }
  if (events === null) {
    return (
      <Callout tone="danger" compact>
        The history could not be read just now — a read failure, not an empty history.
      </Callout>
    );
  }
  if (events.length === 0) {
    return <p className="timeline-empty">Nothing recorded yet.</p>;
  }
  return (
    <ol className="timeline" aria-label="History">
      {events.map((event, index) => {
        const changes = Object.entries(
          (event.detail["changes"] as Record<string, unknown> | undefined) ?? {},
        ).filter((entry): entry is [string, Change] => isChange(entry[1]));
        const actor = event.staff_id
          ? nameFor(names, event.staff_id)
          : event.actor_label || "System";
        return (
          <li key={`${event.occurred_at}-${index}`} className="timeline__item">
            <span className="timeline__kind">
              {formatSentence(event.action.split(".").slice(1).join(" ") || event.action)}
            </span>
            <div className="timeline__main">
              <p className="timeline__meta">
                {actor} · <Timestamp value={event.occurred_at} now={now} mode="relative" />
                {event.reason && ` · ${event.reason}`}
              </p>
              {changes.length > 0 ? (
                <ul className="history-changes">
                  {changes.map(([field, change]) => (
                    <li key={field}>
                      <span className="history-changes__field">
                        {FIELD_LABELS[field] ?? formatSentence(field)}
                      </span>
                      <span className="history-changes__from">
                        {valueText(field, change.from, names)}
                      </span>
                      <span className="history-changes__arrow" aria-hidden="true">
                        →
                      </span>
                      <span className="history-changes__to">
                        {valueText(field, change.to, names)}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                typeof event.detail["fields"] === "object" &&
                Array.isArray(event.detail["fields"]) &&
                (event.detail["fields"] as unknown[]).length > 0 && (
                  <p className="timeline__body">
                    Changed{" "}
                    {(event.detail["fields"] as string[])
                      .map((field) => FIELD_LABELS[field] ?? formatSentence(field))
                      .join(", ")}
                  </p>
                )
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
