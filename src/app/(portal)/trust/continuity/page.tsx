import Link from "next/link";

import { recordContinuityTestAction } from "@/app/(portal)/trust/actions";
import { PageHeader } from "@/components/shell/page-header";
import { TrustPill, TrustTabs } from "@/components/trust/trust-parts";
import { ActForm } from "@/components/ui/act-form";
import { Callout } from "@/components/ui/callout";
import { Section } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Popover } from "@/components/ui/popover";
import { hasCapability, requireStaff } from "@/lib/access/core";
import { HqApiRequestError, HqApiUnavailableError } from "@/lib/api/core";
import { readContinuity, type ContinuityBoard } from "@/lib/api/trust";
import { formatDate } from "@/lib/format";
import { requestNow } from "@/lib/request-time";

export const metadata = { title: "Continuity" };
export const dynamic = "force-dynamic";

const PLAN_COLUMNS = [
  { key: "test", label: "Test" },
  { key: "every", label: "Every", align: "end" as const },
  { key: "last", label: "Last done" },
  { key: "outcome", label: "Outcome" },
  { key: "next", label: "Next due" },
  { key: "state", label: "State" },
];

const TEST_COLUMNS = [
  { key: "when", label: "Done on" },
  { key: "test", label: "Test" },
  { key: "scenario", label: "What was tried" },
  { key: "outcome", label: "Outcome" },
  { key: "time", label: "Recovery (target / took)" },
  { key: "who", label: "Who took part" },
  { key: "findings", label: "Findings raised" },
];

function every(days: number): string {
  if (days >= 360) return "Yearly";
  if (days >= 180) return "Twice a year";
  if (days >= 88) return "Quarterly";
  return `${days} days`;
}

/**
 * Whether the recovery plans work, shown by trying them: a restore from backup every
 * quarter, a failover twice a year, a tabletop and a loss-of-access drill yearly. A test
 * that missed its recovery target did not pass, and what failed becomes a finding.
 */
export default async function ContinuityPage() {
  const context = await requireStaff("/trust/continuity");
  if (!hasCapability(context, "audit:read")) {
    return (
      <>
        <PageHeader title="Continuity" />
        <Callout tone="neutral">The trust registers are kept by Admins and Owners.</Callout>
      </>
    );
  }
  const canWrite = hasCapability(context, "hq:admin");
  let board: ContinuityBoard | null = null;
  try {
    board = await readContinuity(context.token);
  } catch (error) {
    if (!(error instanceof HqApiUnavailableError || error instanceof HqApiRequestError))
      throw error;
  }
  const today = new Date(requestNow()).toISOString().slice(0, 10);

  return (
    <>
      <PageHeader
        title="Continuity tests"
        description="A recovery plan is only known to work once it has been tried. Record each test with what was aimed for and what it took; anything short of a pass raises a finding with a deadline."
        actions={
          <>
            <TrustTabs context={context} current="/trust/continuity" />
            {canWrite && board && (
              <Popover label="Record a test" variant="primary" width="wide">
                <ActForm
                  action={recordContinuityTestAction}
                  hidden={{}}
                  act="create"
                  label="Record the test"
                  primary
                  tight={false}
                >
                  <div className="form-grid">
                    <Field id="test-kind" label="Test">
                      <Select id="test-kind" name="kind" defaultValue="restore">
                        {board.kinds.map((item) => (
                          <option key={item.value} value={item.value}>
                            {item.label}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <Field id="test-on" label="Done on">
                      <Input
                        id="test-on"
                        name="performed_on"
                        type="date"
                        defaultValue={today}
                        max={today}
                      />
                    </Field>
                  </div>
                  <Field id="test-scenario" label="What was tried">
                    <Textarea
                      id="test-scenario"
                      name="scenario"
                      rows={2}
                      maxLength={400}
                      placeholder="Restore last night's backup to a new server and sign in"
                    />
                  </Field>
                  <div className="form-grid">
                    <Field id="test-target" label="Recovery aimed for (minutes)">
                      <Input
                        id="test-target"
                        name="target_minutes"
                        type="number"
                        min={0}
                        max={100000}
                      />
                    </Field>
                    <Field id="test-actual" label="Recovery took (minutes)">
                      <Input
                        id="test-actual"
                        name="actual_minutes"
                        type="number"
                        min={0}
                        max={100000}
                      />
                    </Field>
                  </div>
                  <div className="form-grid">
                    <Field
                      id="test-outcome"
                      label="Outcome"
                      hint="Missing the target is not a pass."
                    >
                      <Select id="test-outcome" name="outcome" defaultValue="passed">
                        {board.outcomes.map((item) => (
                          <option key={item.value} value={item.value}>
                            {item.label}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <Field id="test-who" label="Who took part">
                      <Input id="test-who" name="participants" maxLength={400} />
                    </Field>
                  </div>
                  <Field id="test-notes" label="What happened">
                    <Textarea id="test-notes" name="notes" rows={2} maxLength={2000} />
                  </Field>
                  <fieldset className="fieldset">
                    <legend>If it did not pass: the finding to fix</legend>
                    <Field id="test-finding" label="What has to be fixed">
                      <Input id="test-finding" name="finding_title" maxLength={200} />
                    </Field>
                    <div className="form-grid">
                      <Field id="test-finding-severity" label="Severity">
                        <Select
                          id="test-finding-severity"
                          name="finding_severity"
                          defaultValue="medium"
                        >
                          {board.severities.map((severity) => (
                            <option key={severity} value={severity}>
                              {severity.charAt(0).toUpperCase() + severity.slice(1)}
                            </option>
                          ))}
                        </Select>
                      </Field>
                      <Field id="test-finding-owner" label="Owner">
                        <Select
                          id="test-finding-owner"
                          name="finding_owner_staff_id"
                          defaultValue=""
                        >
                          <option value="">Nobody yet</option>
                          {board.staff.map((person) => (
                            <option key={person.staff_id} value={person.staff_id}>
                              {person.name}
                            </option>
                          ))}
                        </Select>
                      </Field>
                    </div>
                  </fieldset>
                </ActForm>
              </Popover>
            )}
          </>
        }
      />
      {board === null ? (
        <Callout tone="danger" role="alert">
          The continuity tests could not be read just now.
        </Callout>
      ) : (
        <div className="page-content">
          <Section id="plan" title="The plan">
            <DataTable
              caption="Each test, how often, and when the next is due"
              columns={PLAN_COLUMNS}
            >
              {board.plan.map((item) => (
                <tr key={item.kind}>
                  <td>{item.label}</td>
                  <td className="data-table__num">{every(item.every_days)}</td>
                  <td>{formatDate(item.last_performed_on, "Never")}</td>
                  <td>{item.last_outcome ? <TrustPill state={item.last_outcome} /> : "—"}</td>
                  <td>{formatDate(item.next_due, item.state === "due" ? "Now" : "—")}</td>
                  <td>
                    <TrustPill state={item.state} />
                  </td>
                </tr>
              ))}
            </DataTable>
          </Section>
          <Section id="tests" title="Tests done">
            <DataTable
              caption="Continuity tests, newest first"
              columns={TEST_COLUMNS}
              isEmpty={board.tests.length === 0}
              empty={
                <p className="muted">No test recorded yet. Start with a restore from backup.</p>
              }
            >
              {board.tests.map((test) => (
                <tr key={test.test_id}>
                  <td>{formatDate(test.performed_on, "—")}</td>
                  <td>{test.kind_label}</td>
                  <td>{test.scenario}</td>
                  <td>
                    <TrustPill state={test.outcome} />
                  </td>
                  <td className="data-table__num">
                    {test.target_minutes === null && test.actual_minutes === null
                      ? "—"
                      : `${test.target_minutes ?? "—"} / ${test.actual_minutes ?? "—"} min`}
                  </td>
                  <td>{test.participants || "—"}</td>
                  <td>
                    {test.findings.length === 0
                      ? "None"
                      : test.findings.map((finding, index) => (
                          <span key={finding.finding_id}>
                            {index > 0 && ", "}
                            <Link href={`/trust/findings/${finding.finding_id}`}>
                              {finding.title}
                            </Link>
                          </span>
                        ))}
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
