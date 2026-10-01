import Link from "next/link";
import { notFound } from "next/navigation";

import { addApplicantAction, updateOpeningAction } from "@/app/(portal)/hiring/actions";
import { StagePill } from "@/components/hiring/hiring-parts";
import { PageHeader } from "@/components/shell/page-header";
import { ActForm } from "@/components/ui/act-form";
import { Callout } from "@/components/ui/callout";
import { DataTable } from "@/components/ui/data-table";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { RecordHeader, RecordSection } from "@/components/ui/record-shell";
import { StatusPill } from "@/components/ui/status-pill";
import { hasCapability, requireStaff } from "@/lib/access/core";
import { HqApiRequestError, HqApiUnavailableError } from "@/lib/api/core";
import { readOpening, type OpeningRead } from "@/lib/api/hiring";
import { formatDate } from "@/lib/format";

export const metadata = { title: "Role" };
export const dynamic = "force-dynamic";

type Params = Promise<{ openingId: string }>;

/** One role: its applicants by stage, adding one by hand, and keeping the role itself. */
export default async function OpeningPage({ params }: { params: Params }) {
  const { openingId } = await params;
  const context = await requireStaff(`/hiring/openings/${openingId}`);
  if (!hasCapability(context, "hr:read")) {
    return (
      <>
        <PageHeader eyebrow="Team" title="Role" />
        <Callout tone="neutral">Hiring is kept by Owners and Admins.</Callout>
      </>
    );
  }
  let read: OpeningRead | null = null;
  try {
    read = await readOpening(context.token, openingId);
  } catch (error) {
    if (error instanceof HqApiRequestError && error.status === 404) notFound();
    if (!(error instanceof HqApiUnavailableError || error instanceof HqApiRequestError))
      throw error;
  }
  if (read === null) {
    return (
      <>
        <PageHeader eyebrow="Team" title="Role" />
        <Callout tone="danger" role="alert">
          This role could not be read just now.
        </Callout>
      </>
    );
  }
  const { opening, applicants } = read;
  const canWrite = hasCapability(context, "hr:write");
  return (
    <>
      <RecordHeader
        crumbs={[{ href: "/hiring", label: "Hiring" }]}
        title={opening.title}
        status={
          <StatusPill
            value={opening.status}
            label={opening.status.charAt(0).toUpperCase() + opening.status.slice(1)}
            tone={opening.status === "open" ? "live" : "neutral"}
          />
        }
        readouts={[
          { label: "In process", value: String(opening.in_process) },
          { label: "Waiting over a week", value: String(opening.waiting_over_a_week) },
          { label: "Hiring manager", value: opening.owner_name || "Nobody" },
        ]}
      />
      <div className="page-content">
        <RecordSection id="applicants" title="Applicants">
          <DataTable
            caption="Applicants for this role, by stage"
            columns={[
              { key: "who", label: "Who" },
              { key: "stage", label: "Stage" },
              { key: "days", label: "Days in stage", align: "end" as const },
              { key: "source", label: "From" },
              { key: "cards", label: "Scorecards", align: "end" as const },
              { key: "forget", label: "Forgotten on" },
            ]}
            isEmpty={applicants.length === 0}
            empty={<p className="muted">Nobody has applied yet.</p>}
          >
            {applicants.map((applicant) => (
              <tr key={applicant.applicant_id}>
                <td>
                  <Link href={`/hiring/applicants/${applicant.applicant_id}`}>
                    {applicant.full_name}
                  </Link>
                </td>
                <td>
                  <StagePill stage={applicant.stage} label={applicant.stage_label} />
                  {applicant.decision_reason_label && (
                    <span className="quiet"> · {applicant.decision_reason_label}</span>
                  )}
                </td>
                <td className="data-table__num">{applicant.days_in_stage}</td>
                <td>{applicant.source_label}</td>
                <td className="data-table__num">{applicant.scorecards}</td>
                <td>{formatDate(applicant.forget_on, "—")}</td>
              </tr>
            ))}
          </DataTable>
          {canWrite && (
            <details className="disclosure">
              <summary>Add an applicant by hand</summary>
              <ActForm
                action={addApplicantAction}
                hidden={{ opening_id: opening.opening_id }}
                act="add"
                label="Add them"
                primary
                tight={false}
              >
                <div className="form-grid">
                  <Field id="applicant-name" label="Name">
                    <Input id="applicant-name" name="full_name" maxLength={160} />
                  </Field>
                  <Field id="applicant-email" label="Email">
                    <Input id="applicant-email" name="email" type="email" maxLength={254} />
                  </Field>
                </div>
                <div className="form-grid">
                  <Field id="applicant-source" label="From">
                    <Select id="applicant-source" name="source" defaultValue="referral">
                      {read.sources
                        .filter((item) => item.value !== "careers")
                        .map((item) => (
                          <option key={item.value} value={item.value}>
                            {item.label}
                          </option>
                        ))}
                    </Select>
                  </Field>
                  <Field id="applicant-referred" label="Referred by">
                    <Input id="applicant-referred" name="referred_by" maxLength={160} />
                  </Field>
                </div>
                <Field id="applicant-links" label="Links" hint="A CV, a portfolio, a profile.">
                  <Input id="applicant-links" name="links" maxLength={1000} />
                </Field>
              </ActForm>
            </details>
          )}
        </RecordSection>

        <RecordSection id="role" title="The role">
          <p className="prewrap">{opening.description || "No description yet."}</p>
          <p className="page-note">
            {opening.team || "No team"} · {opening.kind_label} · {opening.location || "—"} · opened{" "}
            {formatDate(opening.opened_on)}
            {opening.closes_on && ` · closes ${formatDate(opening.closes_on)}`}
          </p>
          {canWrite && (
            <details className="disclosure">
              <summary>Change the role</summary>
              <ActForm
                action={updateOpeningAction}
                hidden={{ opening_id: opening.opening_id }}
                act="update"
                label="Save"
                tight={false}
              >
                <Field id="edit-title" label="Role">
                  <Input
                    id="edit-title"
                    name="title"
                    maxLength={160}
                    defaultValue={opening.title}
                  />
                </Field>
                <div className="form-grid">
                  <Field id="edit-status" label="State">
                    <Select id="edit-status" name="status" defaultValue={opening.status}>
                      <option value="open">Open: on the careers page</option>
                      <option value="paused">Paused</option>
                      <option value="closed">Closed</option>
                    </Select>
                  </Field>
                  <Field id="edit-closes" label="Applications close">
                    <Input
                      id="edit-closes"
                      name="closes_on"
                      type="date"
                      defaultValue={opening.closes_on ?? ""}
                    />
                  </Field>
                </div>
                <Field id="edit-description" label="What the role is">
                  <Textarea
                    id="edit-description"
                    name="description"
                    rows={5}
                    maxLength={20000}
                    defaultValue={read.opening.description}
                  />
                </Field>
              </ActForm>
            </details>
          )}
        </RecordSection>
      </div>
    </>
  );
}
