import Link from "next/link";
import { notFound } from "next/navigation";

import { reviewSupplierAction, tierSupplierAction } from "@/app/(portal)/trust/actions";
import { EventTimeline } from "@/components/privacy/event-timeline";
import { PageHeader } from "@/components/shell/page-header";
import { TRUST_EVENT_LABELS, TrustPill } from "@/components/trust/trust-parts";
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
import { hasCapability, requireStaff } from "@/lib/access/core";
import { HqApiRequestError, HqApiUnavailableError } from "@/lib/api/core";
import { readSupplier, type SupplierDetail } from "@/lib/api/trust";
import { formatDate } from "@/lib/format";
import { requestNow } from "@/lib/request-time";

export const metadata = { title: "Supplier" };
export const dynamic = "force-dynamic";

const REVIEW_COLUMNS = [
  { key: "when", label: "Reviewed" },
  { key: "who", label: "By" },
  { key: "outcome", label: "Outcome" },
  { key: "evidence", label: "Evidence" },
  { key: "notes", label: "Notes" },
];

type Params = Promise<{ subprocessorId: string }>;

/** One supplier: its tier, every review with its evidence, and the next one due. */
export default async function SupplierPage({ params }: { params: Params }) {
  const { subprocessorId } = await params;
  const context = await requireStaff(`/trust/suppliers/${subprocessorId}`);
  if (!hasCapability(context, "audit:read")) {
    return (
      <>
        <PageHeader title="Supplier" />
        <Callout tone="neutral">The trust registers are kept by Admins and Owners.</Callout>
      </>
    );
  }
  let detail: SupplierDetail | null = null;
  try {
    detail = await readSupplier(context.token, subprocessorId);
  } catch (error) {
    if (error instanceof HqApiRequestError && error.status === 404) notFound();
    if (!(error instanceof HqApiUnavailableError || error instanceof HqApiRequestError))
      throw error;
  }
  if (detail === null) {
    return (
      <>
        <PageHeader title="Supplier" />
        <Callout tone="danger" role="alert">
          This supplier could not be read just now.
        </Callout>
      </>
    );
  }
  const now = requestNow();
  const today = new Date(now).toISOString().slice(0, 10);
  const { supplier } = detail;
  const canWrite = hasCapability(context, "hq:admin");
  const hidden = { subprocessor_id: supplier.subprocessor_id };

  return (
    <>
      <RecordHeader
        crumbs={[
          { href: "/trust", label: "Trust" },
          { href: "/trust/suppliers", label: "Suppliers" },
        ]}
        title={supplier.legal_name}
        status={<TrustPill state={supplier.state} />}
        readouts={[
          { label: "Tier", value: supplier.tier.charAt(0).toUpperCase() + supplier.tier.slice(1) },
          { label: "Last review", value: formatDate(supplier.last_reviewed_on, "Never") },
          {
            label: "Next due",
            value: supplier.state === "due" ? "Now" : formatDate(supplier.next_due, "—"),
          },
        ]}
      />
      {supplier.state === "due" && (
        <Callout tone="attention" compact>
          {supplier.reason}.
        </Callout>
      )}
      <RecordGrid
        side={
          <Properties title="What it does">
            <Property label="Service">{supplier.service || "—"}</Property>
            <Property label="Purpose">{detail.purpose || "—"}</Property>
            <Property label="Whose data">{detail.data_categories || "—"}</Property>
            <Property label="Where">{detail.locations || "—"}</Property>
            <Property label="DPA signed">{formatDate(detail.dpa_signed_on, "—")}</Property>
            <Property label="On the register">
              <Link href={`/privacy/subprocessors/${supplier.subprocessor_id}`}>
                Sub-processor record
              </Link>
            </Property>
          </Properties>
        }
      >
        <RecordSection id="reviews" title="Reviews">
          <DataTable
            caption="Reviews of this supplier, newest first"
            columns={REVIEW_COLUMNS}
            isEmpty={detail.reviews.length === 0}
            empty={<p className="muted">Never reviewed.</p>}
          >
            {detail.reviews.map((review) => (
              <tr key={review.review_id}>
                <td>{formatDate(review.reviewed_on, "—")}</td>
                <td>{review.reviewer_name}</td>
                <td>
                  <TrustPill state={review.outcome} />
                </td>
                <td>{review.evidence}</td>
                <td>{review.notes || "—"}</td>
              </tr>
            ))}
          </DataTable>
        </RecordSection>

        {canWrite && (
          <RecordSection id="work" title="Work it">
            <div className="form-grid">
              <Card
                title="Record a review"
                titleAs="h3"
                description="Name what you looked at. Concerns or worse raise a finding with a deadline."
              >
                <ActForm
                  action={reviewSupplierAction}
                  hidden={hidden}
                  act="review"
                  label="Record the review"
                  primary
                >
                  <div className="form-grid">
                    <Field id="review-on" label="Reviewed on">
                      <Input
                        id="review-on"
                        name="reviewed_on"
                        type="date"
                        defaultValue={today}
                        max={today}
                      />
                    </Field>
                    <Field id="review-outcome" label="Outcome">
                      <Select id="review-outcome" name="outcome" defaultValue="satisfactory">
                        {detail.outcomes.map((item) => (
                          <option key={item.value} value={item.value}>
                            {item.label}
                          </option>
                        ))}
                      </Select>
                    </Field>
                  </div>
                  <Field id="review-evidence" label="Evidence you looked at">
                    <Input
                      id="review-evidence"
                      name="evidence"
                      maxLength={1000}
                      placeholder="Their assurance report, certificate or test letter"
                    />
                  </Field>
                  <Field id="review-notes" label="Notes">
                    <Textarea id="review-notes" name="notes" rows={2} maxLength={2000} />
                  </Field>
                  <fieldset className="fieldset">
                    <legend>If there are concerns: the finding to fix</legend>
                    <Field id="review-finding" label="What has to be fixed">
                      <Input id="review-finding" name="finding_title" maxLength={200} />
                    </Field>
                    <Field id="review-finding-severity" label="Severity">
                      <Select
                        id="review-finding-severity"
                        name="finding_severity"
                        defaultValue="medium"
                      >
                        {detail.severities.map((severity) => (
                          <option key={severity} value={severity}>
                            {severity.charAt(0).toUpperCase() + severity.slice(1)}
                          </option>
                        ))}
                      </Select>
                    </Field>
                  </fieldset>
                </ActForm>
              </Card>
              <Card
                title="Change the tier"
                titleAs="h3"
                description={`Now ${supplier.tier_label.toLowerCase()}: reviewed every ${supplier.every_months} months.`}
              >
                <ActForm
                  action={tierSupplierAction}
                  hidden={hidden}
                  act="tier"
                  label="Change the tier"
                >
                  <Field id="tier-value" label="Tier">
                    <Select id="tier-value" name="tier" defaultValue={supplier.tier}>
                      {detail.tiers.map((item) => (
                        <option key={item.value} value={item.value}>
                          {item.label}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field id="tier-reason" label="Why">
                    <Textarea
                      id="tier-reason"
                      name="reason"
                      rows={2}
                      maxLength={400}
                      placeholder="What it holds, what depends on it"
                    />
                  </Field>
                </ActForm>
              </Card>
            </div>
          </RecordSection>
        )}

        <RecordSection id="timeline" title="Timeline">
          <EventTimeline events={detail.events} labels={TRUST_EVENT_LABELS} now={now} />
        </RecordSection>
      </RecordGrid>
    </>
  );
}
