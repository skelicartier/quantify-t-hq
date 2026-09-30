import Link from "next/link";
import { notFound } from "next/navigation";

import { actOnIncidentAction } from "@/app/(portal)/privacy/actions";
import { EventTimeline } from "@/components/privacy/event-timeline";
import {
  IncidentStatusPill,
  RegulatorPill,
  SeverityPill,
  regulatorText,
} from "@/components/privacy/privacy-pills";
import { ActForm } from "@/components/ui/act-form";
import { PageHeader } from "@/components/shell/page-header";
import { Callout } from "@/components/ui/callout";
import { Card } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import {
  Properties,
  Property,
  RecordGrid,
  RecordHeader,
  RecordSection,
} from "@/components/ui/record-shell";
import { hasCapability, requireStaff } from "@/lib/access/core";
import { HqApiRequestError, HqApiUnavailableError } from "@/lib/api/core";
import { readCompanies } from "@/lib/api/crm";
import { readIncident, type IncidentDetail } from "@/lib/api/privacy";
import { formatAbsolute } from "@/lib/format";
import { requestNow } from "@/lib/request-time";

export const metadata = { title: "Incident" };
export const dynamic = "force-dynamic";

const EVENT_LABELS: Record<string, string> = {
  logged: "Logged",
  update: "Updated",
  status: "Status",
  assess: "Assessed",
  regulator: "Regulator told",
  individuals: "People told",
  add_customers: "Customers affected",
  customer_notified: "Customer told",
  lessons: "Lessons",
  note: "Note",
};

const CUSTOMER_COLUMNS = [
  { key: "customer", label: "Customer" },
  { key: "due", label: "Owed notice by" },
  { key: "contact", label: "Privacy contact" },
  { key: "state", label: "Told" },
  { key: "act", label: "Action" },
];

type Params = Promise<{ incidentId: string }>;

function when(value: string | null): string {
  return value ? formatAbsolute(value) : "—";
}

/**
 * One incident and its clocks: the regulator's 72 hours from awareness (a recorded
 * judgement either way), each affected customer's contractual hours, the people affected
 * when the risk is high, and what was learned before it closes.
 */
export default async function IncidentPage({ params }: { params: Params }) {
  const { incidentId } = await params;
  const context = await requireStaff(`/privacy/incidents/${incidentId}`);
  if (!hasCapability(context, "privacy:read")) {
    return (
      <>
        <PageHeader eyebrow="Desk" title="Incident" />
        <Callout tone="neutral">The privacy desk is run by Support, Admins and Owners.</Callout>
      </>
    );
  }
  let detail: IncidentDetail | null = null;
  try {
    detail = await readIncident(context.token, incidentId);
  } catch (error) {
    if (error instanceof HqApiRequestError && error.status === 404) notFound();
    if (!(error instanceof HqApiUnavailableError || error instanceof HqApiRequestError))
      throw error;
  }
  if (detail === null) {
    return (
      <>
        <PageHeader eyebrow="Incidents" title="Incident" />
        <Callout tone="danger" role="alert">
          This incident could not be read just now.
        </Callout>
      </>
    );
  }
  const now = requestNow();
  const { incident } = detail;
  const canWrite = hasCapability(context, "privacy:write") && incident.status !== "closed";
  const hidden = { incident_id: incident.id };
  const listed = new Set(incident.customers.map((item) => item.company_id));
  let companies: Array<{ id: string; name: string }> = [];
  if (canWrite) {
    try {
      companies = (await readCompanies(context.token)).companies
        .filter((row) => !listed.has(row.company_id))
        .map((row) => ({ id: row.company_id, name: row.name }))
        .sort((a, b) => a.name.localeCompare(b.name));
    } catch (error) {
      if (!(error instanceof HqApiUnavailableError || error instanceof HqApiRequestError))
        throw error;
    }
  }
  const regulator = incident.regulator;
  const assessable = incident.personal_data && !incident.risk;

  return (
    <>
      <RecordHeader
        crumbs={[{ href: "/privacy/incidents", label: "Incidents" }]}
        title={`${incident.reference} · ${incident.title}`}
        status={
          <>
            <IncidentStatusPill status={incident.status} />
            <SeverityPill severity={incident.severity} />
            <RegulatorPill regulator={regulator} />
          </>
        }
        readouts={[
          { label: "Detected", value: when(incident.detected_at) },
          { label: "Aware", value: incident.personal_data ? when(incident.aware_at) : "—" },
          {
            label: "Regulator by",
            value: regulator.due_at ? when(regulator.due_at) : "—",
          },
          { label: "Customers owed", value: incident.customers_owed },
        ]}
      />
      {(regulator.state === "unassessed" || regulator.state === "due") && (
        <Callout tone="danger" role="alert" compact>
          {regulator.state === "unassessed"
            ? "Personal data is involved and nobody has recorded whether it must be reported."
            : "Assessed as notifiable and not yet reported."}{" "}
          {regulatorText(regulator)}.
          {regulator.late && " A report after 72 hours must give the reasons for the delay."}
        </Callout>
      )}
      <RecordGrid
        side={
          <>
            <Properties title="Incident">
              <Property label="Kind">{incident.kind_label}</Property>
              <Property label="Personal data">{incident.personal_data ? "Yes" : "No"}</Property>
              {incident.data_categories && (
                <Property label="Whose data">{incident.data_categories}</Property>
              )}
              {incident.subjects_estimate !== null && (
                <Property label="People affected">{incident.subjects_estimate}</Property>
              )}
              {incident.records_estimate !== null && (
                <Property label="Records">{incident.records_estimate}</Property>
              )}
              <Property label="Occurred">{when(incident.occurred_at)}</Property>
              <Property label="Contained">{when(incident.contained_at)}</Property>
              <Property label="Resolved">{when(incident.resolved_at)}</Property>
              <Property label="Lead">{incident.lead?.name || "—"}</Property>
            </Properties>
            {incident.personal_data && (
              <Properties title="Notification">
                <Property label="Assessment">{incident.risk_label}</Property>
                {incident.assessed_by && (
                  <Property label="Assessed by">
                    {incident.assessed_by}
                    <span className="quiet"> · {when(incident.assessed_at)}</span>
                  </Property>
                )}
                <Property label="Regulator">
                  {regulatorText(regulator)}
                  {incident.regulator_reference && (
                    <span className="quiet"> · {incident.regulator_reference}</span>
                  )}
                </Property>
                {incident.late_reason && (
                  <Property label="Why late">{incident.late_reason}</Property>
                )}
                <Property label="People told">{when(incident.individuals_notified_at)}</Property>
              </Properties>
            )}
          </>
        }
      >
        <RecordSection id="summary" title="What we know">
          <p className="prewrap">{incident.summary || "Nothing written yet."}</p>
          {incident.risk_reason && (
            <>
              <h3 className="card__title">Why it was assessed that way</h3>
              <p className="prewrap">{incident.risk_reason}</p>
            </>
          )}
          {incident.lessons && (
            <>
              <h3 className="card__title">What was learned</h3>
              <p className="prewrap">{incident.lessons}</p>
            </>
          )}
        </RecordSection>

        <RecordSection id="customers" title="Customers affected">
          <p className="page-note">
            Each is owed notice within the hours their contract gives, counted from awareness (or
            detection when no personal data is involved). A DORA firm has its own report to make
            within hours of calling it major: send them facts early.
          </p>
          <DataTable
            caption="Affected customers and their notice"
            columns={CUSTOMER_COLUMNS}
            isEmpty={incident.customers.length === 0}
            empty={<p className="muted">No customers listed as affected.</p>}
          >
            {incident.customers.map((item) => (
              <tr key={item.company_id}>
                <td>
                  <Link href={`/companies/${item.company_id}?tab=privacy`}>
                    {item.company_name}
                  </Link>
                  {item.dora && <span className="quiet"> · DORA</span>}
                </td>
                <td>
                  {item.due_at ? when(item.due_at) : "No hours in their contract"}
                  {item.hours_left !== null && item.hours_left >= 0 && (
                    <span className="quiet"> · {Math.round(item.hours_left)}h left</span>
                  )}
                  {item.late && <span className="quiet"> · late</span>}
                </td>
                <td>{item.contact || "None recorded"}</td>
                <td>{item.notified_at ? when(item.notified_at) : "Not yet"}</td>
                <td>
                  {canWrite && !item.notified_at && (
                    <ActForm
                      action={actOnIncidentAction}
                      hidden={{ ...hidden, company_id: item.company_id }}
                      act="customer_notified"
                      label="Told them"
                    />
                  )}
                </td>
              </tr>
            ))}
          </DataTable>
          {canWrite && companies.length > 0 && (
            <ActForm
              action={actOnIncidentAction}
              hidden={hidden}
              act="add_customers"
              label="Add as affected"
              tight={false}
            >
              <fieldset className="pick-list">
                <legend className="field__label">Add customers affected</legend>
                <div className="pick-list__options">
                  {companies.map((company) => (
                    <label key={company.id} className="checkbox">
                      <input type="checkbox" name="company_ids" value={company.id} />
                      <span className="checkbox__label">{company.name}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
            </ActForm>
          )}
        </RecordSection>

        {canWrite && (
          <RecordSection id="work" title="Work it">
            <div className="form-grid">
              {incident.personal_data && (
                <Card
                  title={assessable ? "Assess it" : "Assessment"}
                  titleAs="h3"
                  description="Likely consequences for the people affected decide it. Recorded either way."
                >
                  <ActForm
                    action={actOnIncidentAction}
                    hidden={hidden}
                    act="assess"
                    label={assessable ? "Record the assessment" : "Record a new assessment"}
                    primary={assessable}
                  >
                    <Field id="assess-risk" label="The judgement">
                      <Select id="assess-risk" name="risk" defaultValue={incident.risk || ""}>
                        <option value="">Choose</option>
                        {detail.risks.map((item) => (
                          <option key={item.value} value={item.value}>
                            {item.label}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <Field id="assess-reason" label="Why">
                      <Textarea id="assess-reason" name="reason" rows={3} maxLength={2000} />
                    </Field>
                  </ActForm>
                </Card>
              )}
              {incident.personal_data &&
                (incident.risk === "risk" || incident.risk === "high") &&
                regulator.state !== "notified" && (
                  <Card
                    title="The regulator was told"
                    titleAs="h3"
                    description="Record the report as made. After 72 hours, give the reasons for the delay."
                  >
                    <ActForm
                      action={actOnIncidentAction}
                      hidden={hidden}
                      act="regulator"
                      label="Record the report"
                      primary
                    >
                      <Field id="regulator-at" label="Reported at" hint="Empty: now.">
                        <Input id="regulator-at" name="at" type="datetime-local" />
                      </Field>
                      <Field id="regulator-reference" label="Their reference">
                        <Input id="regulator-reference" name="reference" maxLength={80} />
                      </Field>
                      {regulator.late && (
                        <Field id="regulator-late" label="Why it was late">
                          <Textarea
                            id="regulator-late"
                            name="late_reason"
                            rows={2}
                            maxLength={1000}
                          />
                        </Field>
                      )}
                    </ActForm>
                  </Card>
                )}
              {incident.risk === "high" && !incident.individuals_notified_at && (
                <Card
                  title="The people affected were told"
                  titleAs="h3"
                  description="Without undue delay when the risk to them is high: what happened, what we did, what they should do."
                >
                  <ActForm
                    action={actOnIncidentAction}
                    hidden={hidden}
                    act="individuals"
                    label="Record it"
                  >
                    <Field id="individuals-how" label="How, and what they were told">
                      <Textarea id="individuals-how" name="how" rows={2} maxLength={1000} />
                    </Field>
                  </ActForm>
                </Card>
              )}
              <Card title="Move it on" titleAs="h3">
                <ActForm
                  action={actOnIncidentAction}
                  hidden={hidden}
                  act="status"
                  label="Change status"
                >
                  <Field id="incident-status" label="Now">
                    <Select id="incident-status" name="status" defaultValue="">
                      <option value="">Choose</option>
                      {incident.status === "open" && <option value="contained">Contained</option>}
                      {incident.status !== "resolved" && <option value="resolved">Resolved</option>}
                      <option value="closed">Closed</option>
                    </Select>
                  </Field>
                  <Field id="incident-status-at" label="At" hint="Empty: now.">
                    <Input id="incident-status-at" name="at" type="datetime-local" />
                  </Field>
                </ActForm>
              </Card>
            </div>
            <div className="form-grid">
              <Card
                title="What we know"
                titleAs="h3"
                description="Update the facts as they firm up."
              >
                <ActForm action={actOnIncidentAction} hidden={hidden} act="update" label="Save">
                  <Field id="incident-summary-edit" label="Summary">
                    <Textarea
                      id="incident-summary-edit"
                      name="summary"
                      rows={3}
                      defaultValue={incident.summary}
                      maxLength={4000}
                    />
                  </Field>
                  <div className="form-grid">
                    <Field id="incident-subjects" label="People affected (about)">
                      <Input
                        id="incident-subjects"
                        name="subjects_estimate"
                        inputMode="numeric"
                        defaultValue={incident.subjects_estimate ?? ""}
                      />
                    </Field>
                    <Field id="incident-records" label="Records (about)">
                      <Input
                        id="incident-records"
                        name="records_estimate"
                        inputMode="numeric"
                        defaultValue={incident.records_estimate ?? ""}
                      />
                    </Field>
                  </div>
                  <Field id="incident-categories-edit" label="Whose data, and what kind">
                    <Input
                      id="incident-categories-edit"
                      name="data_categories"
                      defaultValue={incident.data_categories}
                      maxLength={400}
                    />
                  </Field>
                  <label className="checkbox">
                    <input
                      type="checkbox"
                      name="personal_data"
                      defaultChecked={incident.personal_data}
                    />
                    <span className="checkbox__label">Personal data is involved</span>
                  </label>
                </ActForm>
              </Card>
              <Card
                title="Lessons"
                titleAs="h3"
                description="Required before it closes: what was learned, and what changes."
              >
                <ActForm
                  action={actOnIncidentAction}
                  hidden={hidden}
                  act="lessons"
                  label="Save the lessons"
                >
                  <Field id="incident-lessons" label="What was learned">
                    <Textarea
                      id="incident-lessons"
                      name="lessons"
                      rows={3}
                      defaultValue={incident.lessons}
                      maxLength={4000}
                    />
                  </Field>
                </ActForm>
              </Card>
            </div>
            <Card title="A note on the timeline" titleAs="h3">
              <ActForm action={actOnIncidentAction} hidden={hidden} act="note" label="Add the note">
                <Field id="incident-note" label="Note">
                  <Textarea id="incident-note" name="note" rows={2} maxLength={2000} />
                </Field>
              </ActForm>
            </Card>
          </RecordSection>
        )}

        <RecordSection id="timeline" title="Timeline">
          <EventTimeline events={detail.events} labels={EVENT_LABELS} now={now} />
        </RecordSection>
      </RecordGrid>
    </>
  );
}
