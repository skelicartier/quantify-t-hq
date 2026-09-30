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
import { readProcessing, type ProcessingRecord } from "@/lib/api/trust";
import { formatDate } from "@/lib/format";

export const metadata = { title: "Record of processing" };
export const dynamic = "force-dynamic";

const COLUMNS = [
  { key: "activity", label: "Activity" },
  { key: "purpose", label: "Why" },
  { key: "basis", label: "Lawful basis" },
  { key: "subjects", label: "Whose data" },
  { key: "categories", label: "Which data" },
  { key: "recipients", label: "Shared with" },
  { key: "retention", label: "Kept for" },
  { key: "reviewed", label: "Reviewed" },
];

type SearchParams = Promise<{ show?: string }>;

/**
 * The record of processing activities (UK GDPR Art 30): each use of personal data with
 * its purpose, lawful basis, whose data and which, who receives it and how long it is
 * kept. The privacy desk keeps it and looks at each line again every year.
 */
export default async function ProcessingPage({ searchParams }: { searchParams: SearchParams }) {
  const { show = "" } = await searchParams;
  const context = await requireStaff("/trust/processing");
  if (!hasCapability(context, "privacy:read")) {
    return (
      <>
        <PageHeader title="Record of processing" />
        <Callout tone="neutral">
          The record of processing is kept by Support, Admins and Owners.
        </Callout>
      </>
    );
  }
  const canWrite = hasCapability(context, "privacy:write");
  let record: ProcessingRecord | null = null;
  try {
    record = await readProcessing(context.token, show);
  } catch (error) {
    if (!(error instanceof HqApiUnavailableError || error instanceof HqApiRequestError))
      throw error;
  }

  return (
    <>
      <PageHeader
        title="Record of processing"
        description="What a regulator asks for first: every use of personal data, why, on what lawful basis, whose and which data, who receives it and how long it is kept. Each line is looked at again every year."
        actions={
          <>
            <TrustTabs context={context} current="/trust/processing" />
            {canWrite && record && (
              <Popover label="Add an activity" variant="primary" width="wide">
                <ActForm
                  action={createTrustRecordAction}
                  hidden={{ register: "processing" }}
                  act="create"
                  label="Add to the record"
                  primary
                  tight={false}
                >
                  <div className="form-grid">
                    <Field id="pa-name" label="Activity">
                      <Input
                        id="pa-name"
                        name="name"
                        maxLength={160}
                        placeholder="Support tickets"
                        required
                      />
                    </Field>
                    <Field id="pa-basis" label="Lawful basis">
                      <Select id="pa-basis" name="lawful_basis" defaultValue="contract">
                        {record.bases.map((item) => (
                          <option key={item.value} value={item.value}>
                            {item.label}
                          </option>
                        ))}
                      </Select>
                    </Field>
                  </div>
                  <Field id="pa-purpose" label="Why the data is used">
                    <Textarea id="pa-purpose" name="purpose" rows={2} maxLength={1000} />
                  </Field>
                  <div className="form-grid">
                    <Field id="pa-subjects" label="Whose data">
                      <Input
                        id="pa-subjects"
                        name="data_subjects"
                        maxLength={400}
                        placeholder="Customers' staff"
                      />
                    </Field>
                    <Field id="pa-categories" label="Which data">
                      <Input
                        id="pa-categories"
                        name="data_categories"
                        maxLength={400}
                        placeholder="Names, work email"
                      />
                    </Field>
                  </div>
                  <div className="form-grid">
                    <Field id="pa-recipients" label="Shared with">
                      <Input id="pa-recipients" name="recipients" maxLength={400} />
                    </Field>
                    <Field id="pa-transfers" label="Sent abroad, and the safeguard">
                      <Input id="pa-transfers" name="transfers" maxLength={400} />
                    </Field>
                  </div>
                  <Field id="pa-retention" label="How long it is kept">
                    <Input id="pa-retention" name="retention" maxLength={400} />
                  </Field>
                  <Field id="pa-security" label="How it is protected">
                    <Textarea id="pa-security" name="security_measures" rows={2} maxLength={1000} />
                  </Field>
                  <Field id="pa-owner" label="Owner">
                    <Select id="pa-owner" name="owner_staff_id" defaultValue="">
                      <option value="">Nobody yet</option>
                      {record.staff.map((person) => (
                        <option key={person.staff_id} value={person.staff_id}>
                          {person.name}
                        </option>
                      ))}
                    </Select>
                  </Field>
                </ActForm>
              </Popover>
            )}
          </>
        }
      />
      {record === null ? (
        <Callout tone="danger" role="alert">
          The record of processing could not be read just now.
        </Callout>
      ) : (
        <div className="page-content">
          <Section
            id="record"
            title={
              record.owed
                ? `${record.owed} not reviewed this year`
                : "Every line reviewed this year"
            }
            actions={
              <SegmentedLinks
                label="Which activities"
                items={[
                  {
                    href: "/trust/processing",
                    label: "Current",
                    current: record.show === "current",
                  },
                  {
                    href: "/trust/processing?show=archived",
                    label: "Stopped",
                    current: record.show === "archived",
                  },
                ]}
              />
            }
          >
            <DataTable
              caption="Processing activities"
              columns={COLUMNS}
              isEmpty={record.activities.length === 0}
              empty={<p className="muted">No activities here.</p>}
            >
              {record.activities.map((activity) => (
                <tr key={activity.activity_id}>
                  <td>
                    <Link href={`/trust/processing/${activity.activity_id}`}>{activity.name}</Link>
                  </td>
                  <td>{activity.purpose}</td>
                  <td>{activity.lawful_basis_label}</td>
                  <td>{activity.data_subjects}</td>
                  <td>{activity.data_categories}</td>
                  <td>{activity.recipients || "—"}</td>
                  <td>{activity.retention}</td>
                  <td>
                    {activity.review_owed ? (
                      <TrustPill state="due" />
                    ) : (
                      formatDate(activity.reviewed_at, "—")
                    )}
                  </td>
                </tr>
              ))}
            </DataTable>
          </Section>
        </div>
      )}
    </>
  );
}
