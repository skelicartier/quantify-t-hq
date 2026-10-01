import Link from "next/link";
import { notFound } from "next/navigation";

import { referenceAction } from "@/app/(portal)/success/relationship-actions";
import { ReferenceStatePill } from "@/components/success/relationship-parts";
import { PageHeader } from "@/components/shell/page-header";
import { ActForm } from "@/components/ui/act-form";
import { Callout } from "@/components/ui/callout";
import { Card } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { Checkbox, Field, Input, Select } from "@/components/ui/field";
import {
  Properties,
  Property,
  RecordGrid,
  RecordHeader,
  RecordSection,
} from "@/components/ui/record-shell";
import { hasCapability, requireStaff } from "@/lib/access/core";
import { HqApiRequestError, HqApiUnavailableError } from "@/lib/api/core";
import { readDealsBoard } from "@/lib/api/deals";
import { REFERENCE_KINDS, readReference, type ReferenceDetail } from "@/lib/api/relationships";
import { formatDate } from "@/lib/format";
import { requestNow } from "@/lib/request-time";

export const metadata = { title: "Reference" };
export const dynamic = "force-dynamic";

const KIND_LABELS: Record<(typeof REFERENCE_KINDS)[number], string> = {
  call: "Reference calls",
  logo: "Logo on our site and decks",
  quote: "Quoted by name",
  case_study: "A case study",
};

type Params = Promise<{ referenceId: string }>;

/** One firm's consent: what it covers, every use of it, and using, renewing or ending it. */
export default async function ReferencePage({ params }: { params: Params }) {
  const { referenceId } = await params;
  const context = await requireStaff(`/success/references/${referenceId}`);
  let detail: ReferenceDetail | null = null;
  try {
    detail = await readReference(context.token, referenceId);
  } catch (error) {
    if (error instanceof HqApiRequestError && error.status === 404) notFound();
    if (!(error instanceof HqApiUnavailableError || error instanceof HqApiRequestError))
      throw error;
  }
  if (detail === null) {
    return (
      <>
        <PageHeader eyebrow="Customer success" title="Reference" />
        <Callout tone="danger" role="alert">
          This reference could not be read just now.
        </Callout>
      </>
    );
  }
  const { reference, uses } = detail;
  const canWrite = hasCapability(context, "crm:write");
  const usable = reference.state === "active" || reference.state === "expiring";
  let openDeals: Array<{ deal_id: string; name: string; company_name: string }> = [];
  if (canWrite && usable && hasCapability(context, "deals:read")) {
    try {
      openDeals = (await readDealsBoard(context.token, "open")).columns.flatMap((column) =>
        column.deals.map((deal) => ({
          deal_id: deal.deal_id,
          name: deal.name,
          company_name: deal.company_name,
        })),
      );
    } catch (error) {
      if (!(error instanceof HqApiUnavailableError || error instanceof HqApiRequestError))
        throw error;
    }
  }
  const today = new Date(requestNow()).toISOString().slice(0, 10);
  const hidden = { reference_id: reference.reference_id };

  return (
    <>
      <RecordHeader
        crumbs={[
          { href: "/success/references", label: "References" },
          { href: `/companies/${reference.company_id}?tab=success`, label: reference.company_name },
        ]}
        title={reference.person_name || "Someone at the firm"}
        status={<ReferenceStatePill state={reference.state} />}
        readouts={[
          { label: "Until", value: formatDate(reference.expires_on, "—") },
          {
            label: "Calls this quarter",
            value: reference.kinds.includes("call")
              ? `${reference.calls_this_quarter} of ${reference.calls_per_quarter}`
              : "Not agreed",
          },
          { label: "Used", value: `${reference.uses} time${reference.uses === 1 ? "" : "s"}` },
        ]}
      />
      {reference.state === "withdrawn" && (
        <Callout tone="neutral" compact>
          Withdrawn on {formatDate(reference.withdrawn_on)}: {reference.withdrawn_reason}
        </Callout>
      )}
      {reference.state === "expired" && (
        <Callout tone="danger" compact>
          The consent ran out on {formatDate(reference.expires_on)}. Renew it, with where the new
          yes is kept, before it is used again.
        </Callout>
      )}
      {reference.state === "expiring" && (
        <Callout tone="attention" compact>
          The consent runs out on {formatDate(reference.expires_on)}. Ask for it again before then.
        </Callout>
      )}
      <RecordGrid
        side={
          <Properties title="Consent">
            <Property label="Firm">
              <Link href={`/companies/${reference.company_id}?tab=success`}>
                {reference.company_name}
              </Link>
            </Property>
            <Property label="Agreed to">{reference.kind_labels.join(" · ")}</Property>
            <Property label="Limits">{reference.scope || "None given"}</Property>
            <Property label="Agreed on">{formatDate(reference.given_on, "—")}</Property>
            <Property label="Written down in">{reference.evidence}</Property>
            <Property label="Recorded by">{reference.recorded_by_name || "—"}</Property>
          </Properties>
        }
      >
        <RecordSection id="uses" title="Every use">
          <DataTable
            caption="Every use of this consent, newest first"
            columns={[
              { key: "when", label: "When" },
              { key: "what", label: "What" },
              { key: "deal", label: "For" },
              { key: "note", label: "Note" },
              { key: "who", label: "Who" },
            ]}
            isEmpty={uses.length === 0}
            empty={<p className="muted">Not used yet.</p>}
            columnMenu={false}
          >
            {uses.map((use, index) => (
              <tr key={`${use.used_on}-${index}`}>
                <td>{formatDate(use.used_on)}</td>
                <td>{use.kind_label}</td>
                <td>
                  {use.deal_id ? <Link href={`/deals/${use.deal_id}`}>{use.deal_name}</Link> : "—"}
                </td>
                <td>{use.note || "—"}</td>
                <td>{use.staff_name || "—"}</td>
              </tr>
            ))}
          </DataTable>
        </RecordSection>

        {canWrite && (
          <RecordSection id="work" title="Work it">
            <div className="form-grid">
              {usable && (
                <Card
                  title="Record a use"
                  titleAs="h3"
                  description="Only what they agreed to, within their limit."
                >
                  <ActForm
                    action={referenceAction}
                    hidden={hidden}
                    act="use"
                    label="Record the use"
                    primary
                  >
                    <Field id="use-kind" label="What">
                      <Select id="use-kind" name="kind" defaultValue={reference.kinds[0] ?? "call"}>
                        {reference.kinds.map((kind) => (
                          <option key={kind} value={kind}>
                            {KIND_LABELS[kind]}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <Field id="use-deal" label="For which deal">
                      <Select id="use-deal" name="deal_id" defaultValue="">
                        <option value="">No deal</option>
                        {openDeals.map((deal) => (
                          <option key={deal.deal_id} value={deal.deal_id}>
                            {deal.name}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <Field id="use-day" label="On">
                      <Input
                        id="use-day"
                        name="used_on"
                        type="date"
                        max={today}
                        defaultValue={today}
                      />
                    </Field>
                    <Field id="use-note" label="Note">
                      <Input id="use-note" name="note" maxLength={400} />
                    </Field>
                  </ActForm>
                </Card>
              )}
              <Card
                title="Renew it"
                titleAs="h3"
                description="They said yes again: from today, a year unless they said otherwise."
              >
                <ActForm action={referenceAction} hidden={hidden} act="renew" label="Renew">
                  <Field id="renew-evidence" label="Where the new yes is written down">
                    <Input id="renew-evidence" name="evidence" maxLength={400} />
                  </Field>
                </ActForm>
              </Card>
              {reference.state !== "withdrawn" && (
                <Card
                  title="They withdrew"
                  titleAs="h3"
                  description="A logo, quote or case study in use becomes a task to take it down within a week."
                >
                  <ActForm
                    action={referenceAction}
                    hidden={hidden}
                    act="withdraw"
                    label="Record the withdrawal"
                    danger
                  >
                    <Field id="withdraw-reason" label="What they said">
                      <Input id="withdraw-reason" name="reason" maxLength={400} />
                    </Field>
                  </ActForm>
                </Card>
              )}
            </div>
            <details className="disclosure">
              <summary>Change what it covers</summary>
              <ActForm
                action={referenceAction}
                hidden={hidden}
                act="edit"
                label="Save"
                tight={false}
              >
                <fieldset className="checkbox-group">
                  <legend>They agreed to</legend>
                  {REFERENCE_KINDS.map((kind) => (
                    <Checkbox
                      key={kind}
                      id={`edit-kind-${kind}`}
                      name="kinds"
                      value={kind}
                      label={KIND_LABELS[kind]}
                      defaultChecked={reference.kinds.includes(kind)}
                    />
                  ))}
                </fieldset>
                <div className="form-grid">
                  <Field id="edit-calls" label="Calls a quarter at most">
                    <Input
                      id="edit-calls"
                      name="calls_per_quarter"
                      type="number"
                      min={0}
                      max={12}
                      defaultValue={reference.calls_per_quarter}
                    />
                  </Field>
                  <Field id="edit-expires" label="Until">
                    <Input
                      id="edit-expires"
                      name="expires_on"
                      type="date"
                      defaultValue={reference.expires_on ?? ""}
                    />
                  </Field>
                </div>
                <Field id="edit-scope" label="Anything they set as a limit">
                  <Input
                    id="edit-scope"
                    name="scope"
                    maxLength={1000}
                    defaultValue={reference.scope}
                  />
                </Field>
                <Field id="edit-evidence" label="Where the yes is written down">
                  <Input
                    id="edit-evidence"
                    name="evidence"
                    maxLength={400}
                    defaultValue={reference.evidence}
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
