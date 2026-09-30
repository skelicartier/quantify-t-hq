import Link from "next/link";

import { createTrustRecordAction } from "@/app/(portal)/trust/actions";
import { PageHeader } from "@/components/shell/page-header";
import { BandPill, TrustPill, TrustTabs } from "@/components/trust/trust-parts";
import { ActForm } from "@/components/ui/act-form";
import { Callout } from "@/components/ui/callout";
import { Section } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Popover } from "@/components/ui/popover";
import { SegmentedLinks } from "@/components/ui/toolbar";
import { hasCapability, requireStaff } from "@/lib/access/core";
import { HqApiRequestError, HqApiUnavailableError } from "@/lib/api/core";
import { readFindings, type Finding, type FindingRegister } from "@/lib/api/trust";
import { formatDate } from "@/lib/format";
import { requestNow } from "@/lib/request-time";

export const metadata = { title: "Findings" };
export const dynamic = "force-dynamic";

const COLUMNS = [
  { key: "finding", label: "Finding" },
  { key: "source", label: "Found by" },
  { key: "severity", label: "Severity" },
  { key: "owner", label: "Owner" },
  { key: "found", label: "Found" },
  { key: "due", label: "Fix by" },
  { key: "status", label: "Status" },
];

const SHOWS = [
  { key: "open", label: "Open" },
  { key: "closed", label: "Fixed or accepted" },
  { key: "all", label: "Everything" },
] as const;

type SearchParams = Promise<{ show?: string }>;

function left(finding: Finding): string {
  if (finding.days_left === null) return "";
  if (finding.days_left < 0)
    return `${-finding.days_left} day${finding.days_left === -1 ? "" : "s"} late`;
  if (finding.days_left === 0) return "due today";
  return `${finding.days_left} day${finding.days_left === 1 ? "" : "s"} left`;
}

/**
 * What a test, an audit, a customer or our own eyes found wrong, each with the deadline
 * its severity sets from the day it was found — and how it ended: fixed with evidence, or
 * accepted with a reason.
 */
export default async function FindingsPage({ searchParams }: { searchParams: SearchParams }) {
  const { show = "open" } = await searchParams;
  const context = await requireStaff("/trust/findings");
  if (!hasCapability(context, "audit:read")) {
    return (
      <>
        <PageHeader title="Findings" />
        <Callout tone="neutral">The trust registers are kept by Admins and Owners.</Callout>
      </>
    );
  }
  const canWrite = hasCapability(context, "hq:admin");
  let register: FindingRegister | null = null;
  try {
    register = await readFindings(context.token, show);
  } catch (error) {
    if (!(error instanceof HqApiUnavailableError || error instanceof HqApiRequestError))
      throw error;
  }
  const today = new Date(requestNow()).toISOString().slice(0, 10);

  return (
    <>
      <PageHeader
        title="Findings"
        description="Remediation windows from the day a finding is found: critical 7 days, high 30, medium 90, low 180. A fix carries its evidence; accepting one instead is a decision with a reason, and a critical one is the owner's."
        actions={
          <>
            <TrustTabs context={context} current="/trust/findings" />
            {canWrite && register && (
              <Popover label="Record a finding" variant="primary" width="wide">
                <ActForm
                  action={createTrustRecordAction}
                  hidden={{ register: "finding" }}
                  act="create"
                  label="Record the finding"
                  primary
                  tight={false}
                >
                  <Field id="finding-title" label="What is wrong">
                    <Input id="finding-title" name="title" maxLength={200} required />
                  </Field>
                  <div className="form-grid">
                    <Field id="finding-source" label="Found by">
                      <Select id="finding-source" name="source" defaultValue="internal">
                        {register.sources
                          .filter(
                            (item) => item.value !== "continuity" && item.value !== "supplier",
                          )
                          .map((item) => (
                            <option key={item.value} value={item.value}>
                              {item.label}
                            </option>
                          ))}
                      </Select>
                    </Field>
                    <Field
                      id="finding-severity"
                      label="Severity"
                      hint="Sets the deadline from the day it was found."
                    >
                      <Select id="finding-severity" name="severity" defaultValue="medium">
                        {register.severities.map((severity) => (
                          <option key={severity} value={severity}>
                            {severity.charAt(0).toUpperCase() + severity.slice(1)} ·{" "}
                            {register.windows[severity]} days
                          </option>
                        ))}
                      </Select>
                    </Field>
                  </div>
                  <div className="form-grid">
                    <Field id="finding-found" label="Found on">
                      <Input
                        id="finding-found"
                        name="found_on"
                        type="date"
                        defaultValue={today}
                        max={today}
                      />
                    </Field>
                    <Field id="finding-owner" label="Owner">
                      <Select id="finding-owner" name="owner_staff_id" defaultValue="">
                        <option value="">Nobody yet</option>
                        {register.staff.map((person) => (
                          <option key={person.staff_id} value={person.staff_id}>
                            {person.name}
                          </option>
                        ))}
                      </Select>
                    </Field>
                  </div>
                  <Field id="finding-description" label="Detail">
                    <Textarea
                      id="finding-description"
                      name="description"
                      rows={3}
                      maxLength={2000}
                    />
                  </Field>
                </ActForm>
              </Popover>
            )}
          </>
        }
      />
      {register === null ? (
        <Callout tone="danger" role="alert">
          The findings could not be read just now.
        </Callout>
      ) : (
        <div className="page-content">
          <Section
            id="findings"
            title={`${register.open} open${register.overdue ? ` · ${register.overdue} past the deadline` : ""}`}
            actions={
              <SegmentedLinks
                label="Which findings"
                items={SHOWS.map((item) => ({
                  href:
                    item.key === "open" ? "/trust/findings" : `/trust/findings?show=${item.key}`,
                  label: item.label,
                  current: register.show === item.key,
                }))}
              />
            }
          >
            <p className="page-note">
              Open by severity: {register.by_severity.critical ?? 0} critical,{" "}
              {register.by_severity.high ?? 0} high, {register.by_severity.medium ?? 0} medium,{" "}
              {register.by_severity.low ?? 0} low.
            </p>
            <DataTable
              caption="Findings, past the deadline first"
              columns={COLUMNS}
              isEmpty={register.findings.length === 0}
              empty={<p className="muted">Nothing here.</p>}
            >
              {register.findings.map((finding) => (
                <tr key={finding.finding_id}>
                  <td>
                    <Link href={`/trust/findings/${finding.finding_id}`}>{finding.title}</Link>
                  </td>
                  <td>{finding.source_label}</td>
                  <td>
                    <BandPill band={finding.severity} />
                  </td>
                  <td>{finding.owner_name || "Nobody"}</td>
                  <td>{formatDate(finding.found_on, "—")}</td>
                  <td>
                    {finding.status === "fixed"
                      ? `Fixed ${formatDate(finding.fixed_on, "—")}`
                      : finding.status === "accepted"
                        ? "Accepted"
                        : `${formatDate(finding.due_on, "—")} · ${left(finding)}`}{" "}
                    {finding.overdue && <TrustPill state="overdue" />}
                  </td>
                  <td>
                    <TrustPill state={finding.status} />
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
