import Link from "next/link";

import { actOnOnboardingAction, startOnboardingAction } from "@/app/(portal)/success/actions";
import { StartOnboardingForm } from "@/components/success/success-forms";
import { SuccessTabs } from "@/components/success/success-tabs";
import { PageHeader } from "@/components/shell/page-header";
import { ActForm } from "@/components/ui/act-form";
import { Callout } from "@/components/ui/callout";
import { Card, Section } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/field";
import { Popover } from "@/components/ui/popover";
import { StatusPill } from "@/components/ui/status-pill";
import { hasCapability, requireStaff } from "@/lib/access/core";
import { HqApiRequestError, HqApiUnavailableError } from "@/lib/api/core";
import { readOnboardings, type Onboardings } from "@/lib/api/success";
import { formatDate } from "@/lib/format";

export const metadata = { title: "Onboarding" };
export const dynamic = "force-dynamic";

const STATUS: Record<string, { label: string; tone: "live" | "attention" | "danger" | "neutral" }> =
  {
    active: { label: "Onboarding", tone: "attention" },
    live: { label: "Live", tone: "live" },
    stalled: { label: "Stalled", tone: "danger" },
    cancelled: { label: "Cancelled", tone: "neutral" },
  };

function days(value: number | null): string {
  return value === null ? "—" : `${value} day${value === 1 ? "" : "s"}`;
}

/**
 * Each new customer's way in: contract start, kickoff, first sign-in and live (80 % of the
 * seats they pay for signed in), with the steps between. Each firm's own durations, never
 * a median of ten.
 */
export default async function OnboardingPage() {
  const context = await requireStaff("/success/onboarding");
  let page: Onboardings | null = null;
  try {
    page = await readOnboardings(context.token);
  } catch (error) {
    if (!(error instanceof HqApiUnavailableError || error instanceof HqApiRequestError))
      throw error;
  }
  const canWrite = hasCapability(context, "crm:write");
  const today = new Date().toISOString().slice(0, 10);

  return (
    <>
      <PageHeader
        eyebrow="CRM"
        title="Onboarding"
        description="Contract start, kickoff, first sign-in and live — each firm's own dates and the days between. HQ suggests when the evidence says a firm is live; a person confirms it."
        actions={
          <>
            <SuccessTabs current="/success/onboarding" />
            {canWrite && page && page.not_started.length > 0 && (
              <Popover label="Start an onboarding" variant="primary" width="wide">
                <StartOnboardingForm
                  action={startOnboardingAction}
                  companies={page.not_started.map((item) => ({
                    id: item.company_id,
                    name: item.company_name,
                    starts_on: item.starts_on,
                  }))}
                />
              </Popover>
            )}
          </>
        }
      />
      {page === null ? (
        <Callout tone="danger" role="alert">
          The onboardings could not be read just now.
        </Callout>
      ) : (
        <div className="page-content">
          {page.not_started.length > 0 && (
            <Callout tone="attention" compact>
              {page.not_started.length} customer{page.not_started.length === 1 ? "" : "s"} who
              started in the last four months {page.not_started.length === 1 ? "has" : "have"} no
              onboarding: {page.not_started.map((item) => item.company_name).join(", ")}.
            </Callout>
          )}
          <Section id="onboardings" title="Onboardings">
            {page.onboardings.length === 0 ? (
              <p className="muted">None started yet.</p>
            ) : (
              <div className="onboarding-list">
                {page.onboardings.map((row) => (
                  <Card
                    key={row.id}
                    title={row.company.name}
                    titleAs="h3"
                    description={`${row.owner?.name || "No owner"} · ${row.steps_done} of ${row.steps.length} steps done · ${row.usage.active_30d} of ${row.usage.seats_paid} paid seats signed in within 30 days`}
                  >
                    <div className="onboarding-head">
                      <StatusPill
                        value={row.status}
                        label={STATUS[row.status]?.label ?? row.status}
                        tone={STATUS[row.status]?.tone ?? "neutral"}
                      />
                      <Link href={`/companies/${row.company.id}?tab=success`}>Open the firm</Link>
                    </div>
                    <ol className="milestones">
                      <li className="milestones__item">
                        <span className="milestones__label">Contract start</span>
                        <span>{formatDate(row.starts_on, "—")}</span>
                      </li>
                      <li className="milestones__item">
                        <span className="milestones__label">Kickoff</span>
                        <span>
                          {formatDate(row.kickoff_on, "Not yet")}
                          <span className="quiet"> · {days(row.durations.to_kickoff)}</span>
                        </span>
                      </li>
                      <li className="milestones__item">
                        <span className="milestones__label">First sign-in</span>
                        <span>
                          {formatDate(row.first_sign_in_on, "Not yet")}
                          <span className="quiet"> · {days(row.durations.to_first_sign_in)}</span>
                        </span>
                      </li>
                      <li className="milestones__item">
                        <span className="milestones__label">Live</span>
                        <span>
                          {formatDate(
                            row.live_on,
                            row.target_live_on
                              ? `Aim ${formatDate(row.target_live_on)}`
                              : "Not yet",
                          )}
                          <span className="quiet"> · {days(row.durations.to_live)}</span>
                        </span>
                      </li>
                    </ol>
                    {row.durations.total !== null && (
                      <p className="field__hint">Start to live: {days(row.durations.total)}.</p>
                    )}
                    {row.suggest === "live" && (
                      <Callout tone="success" compact>
                        80 % of the paid seats signed in within 30 days. Mark it live if the firm
                        agrees.
                      </Callout>
                    )}
                    {row.suggest === "first_sign_in" && (
                      <Callout tone="neutral" compact>
                        Someone at the firm has signed in ({formatDate(row.usage.last_sign_in)}).
                        Record the first sign-in.
                      </Callout>
                    )}
                    <ul className="step-list">
                      {row.steps.map((step) => (
                        <li key={step.id} className="step-list__item">
                          <span
                            className={
                              step.done_on
                                ? "step-list__title step-list__title--done"
                                : "step-list__title"
                            }
                          >
                            {step.title}
                          </span>
                          <span className="quiet">
                            {step.done_on
                              ? `done ${formatDate(step.done_on)}`
                              : step.due_on
                                ? `due ${formatDate(step.due_on)}`
                                : ""}
                          </span>
                          {canWrite && row.status !== "cancelled" && (
                            <ActForm
                              action={actOnOnboardingAction}
                              hidden={{ onboarding_id: row.id, step_id: step.id }}
                              act={step.done_on ? "step_undone" : "step_done"}
                              label={step.done_on ? "Reopen" : "Done"}
                            />
                          )}
                        </li>
                      ))}
                    </ul>
                    {canWrite && (row.status === "active" || row.status === "stalled") && (
                      <details className="disclosure">
                        <summary>Record the dates</summary>
                        <ActForm
                          action={actOnOnboardingAction}
                          hidden={{ onboarding_id: row.id }}
                          act="dates"
                          label="Save the dates"
                          tight={false}
                        >
                          <div className="form-grid">
                            <Field id={`kickoff-${row.id}`} label="Kickoff held on">
                              <Input
                                id={`kickoff-${row.id}`}
                                name="kickoff_on"
                                type="date"
                                defaultValue={row.kickoff_on ?? ""}
                                max={today}
                              />
                            </Field>
                            <Field id={`first-${row.id}`} label="First sign-in on">
                              <Input
                                id={`first-${row.id}`}
                                name="first_sign_in_on"
                                type="date"
                                defaultValue={row.first_sign_in_on ?? ""}
                                max={today}
                              />
                            </Field>
                            <Field
                              id={`live-${row.id}`}
                              label="Live on"
                              hint="80 % of paid seats signed in."
                            >
                              <Input
                                id={`live-${row.id}`}
                                name="live_on"
                                type="date"
                                defaultValue={row.live_on ?? ""}
                                max={today}
                              />
                            </Field>
                            <Field id={`target-${row.id}`} label="Aim to be live by">
                              <Input
                                id={`target-${row.id}`}
                                name="target_live_on"
                                type="date"
                                defaultValue={row.target_live_on ?? ""}
                              />
                            </Field>
                          </div>
                        </ActForm>
                        <div className="inline-actions">
                          <ActForm
                            action={actOnOnboardingAction}
                            hidden={{
                              onboarding_id: row.id,
                              status: row.status === "stalled" ? "active" : "stalled",
                            }}
                            act="status"
                            label={row.status === "stalled" ? "Back on track" : "Mark stalled"}
                          />
                        </div>
                      </details>
                    )}
                  </Card>
                ))}
              </div>
            )}
          </Section>
        </div>
      )}
    </>
  );
}
