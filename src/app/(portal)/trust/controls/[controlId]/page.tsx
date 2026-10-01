import Link from "next/link";
import { notFound } from "next/navigation";

import { controlAction } from "@/app/(portal)/trust/controls/actions";
import { PageHeader } from "@/components/shell/page-header";
import { ActForm } from "@/components/ui/act-form";
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
import { RowAction } from "@/components/ui/row-action";
import { StatusPill, type PillTone } from "@/components/ui/status-pill";
import { hasCapability, requireStaff } from "@/lib/access/core";
import { HqApiRequestError, HqApiUnavailableError } from "@/lib/api/core";
import {
  LINK_TYPES,
  readControl,
  readControls,
  type ControlBoard,
  type ControlRead,
} from "@/lib/api/controls";
import { formatDate } from "@/lib/format";
import { requestNow } from "@/lib/request-time";

export const metadata = { title: "Control" };
export const dynamic = "force-dynamic";

const TYPE_LABELS: Record<(typeof LINK_TYPES)[number], string> = {
  risk: "Risk",
  finding: "Finding",
  change: "Change",
  continuity_test: "Continuity test",
  answer: "Answer",
  processing: "Processing record",
};
const STATE_TONE: Record<string, PillTone> = {
  operating: "live",
  draft: "attention",
  retired: "neutral",
};

type Params = Promise<{ controlId: string }>;

/** One control: what it is, the evidence that it ran, the registers that show it working. */
export default async function ControlPage({ params }: { params: Params }) {
  const { controlId } = await params;
  const context = await requireStaff(`/trust/controls/${controlId}`);
  if (!hasCapability(context, "audit:read")) {
    return (
      <>
        <PageHeader eyebrow="Trust" title="Control" />
        <Callout tone="neutral">The control map is read by Admins and Owners.</Callout>
      </>
    );
  }
  let read: ControlRead | null = null;
  let board: ControlBoard | null = null;
  try {
    [read, board] = await Promise.all([
      readControl(context.token, controlId),
      readControls(context.token),
    ]);
  } catch (error) {
    if (error instanceof HqApiRequestError && error.status === 404) notFound();
    if (!(error instanceof HqApiUnavailableError || error instanceof HqApiRequestError))
      throw error;
  }
  if (read === null || board === null) {
    return (
      <>
        <PageHeader eyebrow="Trust" title="Control" />
        <Callout tone="danger" role="alert">
          This control could not be read just now.
        </Callout>
      </>
    );
  }
  const { control, link_choices: choices } = read;
  const canWrite = hasCapability(context, "hq:admin");
  const hidden = { control_id: control.control_id };
  const today = new Date(requestNow()).toISOString().slice(0, 10);
  const linked = new Set(control.linked.map((link) => `${link.record_type}:${link.record_id}`));

  return (
    <>
      <RecordHeader
        crumbs={[{ href: "/trust/controls", label: "Controls" }]}
        title={`${control.ref} · ${control.title}`}
        status={
          control.evidence_due ? (
            <StatusPill value="due" label="Evidence due" tone="attention" />
          ) : (
            <StatusPill
              value={control.state}
              label={control.state_label}
              tone={STATE_TONE[control.state] ?? "neutral"}
            />
          )
        }
        readouts={[
          { label: "Cadence", value: control.frequency_label },
          { label: "Last evidence", value: formatDate(control.last_evidence_on, "None") },
          { label: "Next due", value: formatDate(control.evidence_due_on, "—") },
        ]}
      />
      {control.evidence_due && (
        <Callout tone="attention" compact>
          {control.last_evidence_on
            ? `The newest evidence is from ${formatDate(control.last_evidence_on)}; it was due again on ${formatDate(control.evidence_due_on)}.`
            : "Operating with no evidence yet: record what shows it ran."}
        </Callout>
      )}
      <RecordGrid
        side={
          <Properties title="Control">
            <Property label="Area">{control.domain_label}</Property>
            <Property label="Owner">{control.owner_name || "Nobody"}</Property>
            <Property label="Operating since">{formatDate(control.operating_since, "—")}</Property>
            <Property label="Answers">{control.frameworks.join(" · ") || "—"}</Property>
          </Properties>
        }
      >
        <RecordSection id="what" title="What it is">
          <p className="prewrap">{control.description || "No description yet."}</p>
        </RecordSection>

        <RecordSection id="evidence" title="Evidence">
          <DataTable
            caption="Evidence that this control ran, newest first"
            columns={[
              { key: "what", label: "What" },
              { key: "period", label: "Covers" },
              { key: "where", label: "Kept at" },
              { key: "when", label: "Collected" },
              { key: "who", label: "By" },
            ]}
            isEmpty={control.evidence.length === 0}
            empty={<p className="muted">No evidence yet.</p>}
            columnMenu={false}
          >
            {control.evidence.map((item) => (
              <tr key={item.evidence_id}>
                <td>
                  {item.title}
                  {item.note && <span className="quiet"> · {item.note}</span>}
                </td>
                <td>
                  {item.period_start || item.period_end
                    ? `${formatDate(item.period_start, "…")} to ${formatDate(item.period_end, "…")}`
                    : "—"}
                </td>
                <td>{item.reference}</td>
                <td>{formatDate(item.collected_on)}</td>
                <td>{item.collected_by_name || "—"}</td>
              </tr>
            ))}
          </DataTable>
          {canWrite && control.state !== "retired" && (
            <details className="disclosure">
              <summary>Record evidence</summary>
              <ActForm
                action={controlAction}
                hidden={hidden}
                act="evidence"
                label="Record it"
                primary
                tight={false}
              >
                <Field id="evidence-title" label="What was collected">
                  <Input
                    id="evidence-title"
                    name="evidence_title"
                    maxLength={200}
                    placeholder="Q3 access review sign-off"
                  />
                </Field>
                <Field id="evidence-reference" label="Where it is kept">
                  <Input
                    id="evidence-reference"
                    name="reference"
                    maxLength={400}
                    placeholder="Drive: /audit/2026-Q3"
                  />
                </Field>
                <div className="form-grid">
                  <Field id="evidence-start" label="Covers from">
                    <Input id="evidence-start" name="period_start" type="date" />
                  </Field>
                  <Field id="evidence-end" label="Covers to">
                    <Input id="evidence-end" name="period_end" type="date" />
                  </Field>
                </div>
                <div className="form-grid">
                  <Field id="evidence-collected" label="Collected on">
                    <Input
                      id="evidence-collected"
                      name="collected_on"
                      type="date"
                      max={today}
                      defaultValue={today}
                    />
                  </Field>
                  <Field id="evidence-note" label="Note">
                    <Input id="evidence-note" name="note" maxLength={1000} />
                  </Field>
                </div>
              </ActForm>
            </details>
          )}
        </RecordSection>

        <RecordSection id="linked" title="Shown working by">
          <DataTable
            caption="Register records that show this control working"
            columns={[
              { key: "type", label: "Register" },
              { key: "record", label: "Record" },
              { key: "act", label: "Action" },
            ]}
            isEmpty={control.linked.length === 0}
            empty={<p className="muted">Nothing linked yet.</p>}
            columnMenu={false}
          >
            {control.linked.map((link) => (
              <tr key={link.link_id}>
                <td>{TYPE_LABELS[link.record_type]}</td>
                <td>
                  <Link href={link.path}>{link.label || link.record_id}</Link>
                </td>
                <td>
                  {canWrite && (
                    <RowAction
                      action={controlAction}
                      fields={{ ...hidden, link_id: link.link_id, action: "unlink" }}
                      buttons={[
                        {
                          label: "Unlink",
                          className: "btn btn--small btn--ghost",
                          ariaLabel: `Unlink ${link.label || link.record_id}`,
                        },
                      ]}
                    />
                  )}
                </td>
              </tr>
            ))}
          </DataTable>
          {canWrite && (
            <ActForm action={controlAction} hidden={hidden} act="link" label="Link it">
              <Field id="link-record" label="A register record that shows it working">
                <Select id="link-record" name="record" defaultValue="">
                  <option value="" disabled>
                    Choose one
                  </option>
                  {LINK_TYPES.map((type) => (
                    <optgroup key={type} label={TYPE_LABELS[type]}>
                      {choices[type]
                        .filter((item) => !linked.has(`${type}:${item.record_id}`))
                        .map((item) => (
                          <option key={item.record_id} value={`${type}:${item.record_id}`}>
                            {item.label}
                          </option>
                        ))}
                    </optgroup>
                  ))}
                </Select>
              </Field>
            </ActForm>
          )}
        </RecordSection>

        {canWrite && (
          <RecordSection id="keep" title="Keep it">
            <div className="form-grid">
              {control.state === "draft" && (
                <Card
                  title="Start operating it"
                  titleAs="h3"
                  description="Its evidence is then due on its cadence. It needs an owner."
                >
                  <ActForm
                    action={controlAction}
                    hidden={hidden}
                    act="operate"
                    label="It is operating"
                    primary
                  />
                </Card>
              )}
              {control.state !== "retired" ? (
                <Card
                  title="Retire it"
                  titleAs="h3"
                  description="Kept on the map, with its evidence."
                >
                  <ActForm
                    action={controlAction}
                    hidden={hidden}
                    act="retire"
                    label="Retire"
                    danger
                  >
                    <Field id="retire-reason" label="Why it stops">
                      <Input id="retire-reason" name="reason" maxLength={400} />
                    </Field>
                  </ActForm>
                </Card>
              ) : (
                <Card title="Bring it back" titleAs="h3" description="Back to being designed.">
                  <ActForm action={controlAction} hidden={hidden} act="restore" label="Restore" />
                </Card>
              )}
            </div>
            <details className="disclosure">
              <summary>Change the control</summary>
              <ActForm action={controlAction} hidden={hidden} act="edit" label="Save" tight={false}>
                <Field id="edit-title" label="What it does">
                  <Input
                    id="edit-title"
                    name="title"
                    maxLength={200}
                    defaultValue={control.title}
                  />
                </Field>
                <Field id="edit-description" label="How it is done">
                  <Textarea
                    id="edit-description"
                    name="description"
                    rows={4}
                    maxLength={4000}
                    defaultValue={control.description}
                  />
                </Field>
                <div className="form-grid">
                  <Field id="edit-domain" label="Area">
                    <Select id="edit-domain" name="domain" defaultValue={control.domain}>
                      {board.domains.map((item) => (
                        <option key={item.value} value={item.value}>
                          {item.label}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field id="edit-frequency" label="Cadence">
                    <Select id="edit-frequency" name="frequency" defaultValue={control.frequency}>
                      {board.frequencies.map((item) => (
                        <option key={item.value} value={item.value}>
                          {item.label}
                        </option>
                      ))}
                    </Select>
                  </Field>
                </div>
                <Field id="edit-owner" label="Owner">
                  <Select
                    id="edit-owner"
                    name="owner_staff_id"
                    defaultValue={control.owner_staff_id ?? ""}
                  >
                    <option value="">Nobody yet</option>
                    {board.staff.map((person) => (
                      <option key={person.staff_id} value={person.staff_id}>
                        {person.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field
                  id="edit-frameworks"
                  label="Framework clauses it answers"
                  hint="Comma-separated."
                >
                  <Textarea
                    id="edit-frameworks"
                    name="frameworks"
                    rows={2}
                    maxLength={1000}
                    defaultValue={control.frameworks.join(", ")}
                  />
                </Field>
              </ActForm>
            </details>
          </RecordSection>
        )}
      </RecordGrid>
    </>
  );
}
