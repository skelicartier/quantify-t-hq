import { dealPlanAction } from "@/app/(portal)/deals/quote-actions";
import { ActForm } from "@/components/ui/act-form";
import { Callout } from "@/components/ui/callout";
import { Field, Input, Select } from "@/components/ui/field";
import { RecordSection } from "@/components/ui/record-shell";
import { RowAction } from "@/components/ui/row-action";
import { StatusPill, type PillTone } from "@/components/ui/status-pill";
import { HqApiRequestError, HqApiUnavailableError } from "@/lib/api/core";
import { readDealPlan, type DealPlan, type PlanStep } from "@/lib/api/quotes";
import { formatDate } from "@/lib/format";

const STATE: Record<PlanStep["state"], { label: string; tone: PillTone }> = {
  open: { label: "Planned", tone: "neutral" },
  due_soon: { label: "This week", tone: "attention" },
  overdue: { label: "Overdue", tone: "danger" },
  done: { label: "Done", tone: "live" },
};

function Who({ step }: { step: PlanStep }) {
  if (step.side === "us") return <>{step.owner_name || "Nobody yet"}</>;
  return <>{step.contact_name || "Their side"}</>;
}

/**
 * The steps both sides take to a signature, each with a date and whose it is, read against
 * the deal's close date: a step of theirs dated after the close says the date is hopeful.
 */
export async function DealPlanSection({ token, dealId }: { token: string; dealId: string }) {
  let plan: DealPlan | null = null;
  try {
    plan = await readDealPlan(token, dealId);
  } catch (error) {
    if (!(error instanceof HqApiUnavailableError || error instanceof HqApiRequestError))
      throw error;
  }
  if (plan === null) {
    return (
      <RecordSection id="deal-plan" title="Action plan">
        <Callout tone="danger" role="alert">
          The plan could not be read just now.
        </Callout>
      </RecordSection>
    );
  }
  const { summary } = plan;
  const hidden = { deal_id: dealId };
  return (
    <>
      <RecordSection id="deal-plan" title="Action plan">
        {summary.total > 0 && (
          <p className="page-note">
            {summary.done} of {summary.total} done
            {summary.overdue > 0 &&
              ` · ${summary.overdue} overdue${summary.their_overdue > 0 ? `, ${summary.their_overdue} of them theirs` : ""}`}
            {summary.close_date &&
              ` · the deal is meant to close ${formatDate(summary.close_date)}`}
          </p>
        )}
        {summary.after_close && (
          <Callout tone="attention" compact>
            A step on their side is dated after the close date. Move the step, or the close date.
          </Callout>
        )}
        {plan.steps.length === 0 ? (
          <div className="stack-form">
            <p className="muted">
              No plan yet. The usual one runs from what the evaluation must show to the kick-off,
              dated back from the close date:
            </p>
            <ol className="plan-template">
              {plan.template.map((step) => (
                <li key={step.title}>
                  {step.title}
                  <span className="quiet">
                    {" "}
                    · {step.side === "us" ? "us" : "them"} ·{" "}
                    {step.days_from_close === 0
                      ? "on the close"
                      : step.days_from_close < 0
                        ? `${-step.days_from_close} days before the close`
                        : `${step.days_from_close} days after`}
                  </span>
                </li>
              ))}
            </ol>
            {plan.can_edit && (
              <ActForm
                action={dealPlanAction}
                hidden={hidden}
                act="template"
                label="Lay in the usual plan"
                primary
              />
            )}
          </div>
        ) : (
          <ol className="plan-steps">
            {plan.steps.map((step, index) => (
              <li key={step.step_id} className="plan-step" data-state={step.state}>
                <div className="plan-step__main">
                  <span className="plan-step__side">{step.side === "us" ? "Us" : "Them"}</span>
                  <span className="plan-step__title">{step.title}</span>
                  <span className="quiet">
                    <Who step={step} />
                    {step.due_on && ` · ${formatDate(step.due_on)}`}
                    {step.done_at && ` · done by ${step.done_by_name || "someone"}`}
                  </span>
                </div>
                <div className="plan-step__side-actions">
                  <StatusPill
                    value={step.state}
                    label={STATE[step.state].label}
                    tone={STATE[step.state].tone}
                  />
                  {plan.can_edit && (
                    <>
                      <RowAction
                        action={dealPlanAction}
                        fields={{ deal_id: dealId, step_id: step.step_id }}
                        className="inline-actions"
                        buttons={[
                          step.done_at
                            ? {
                                label: "Reopen",
                                name: "action",
                                value: "reopen",
                                className: "btn btn--small btn--ghost",
                                ariaLabel: `Reopen ${step.title}`,
                              }
                            : {
                                label: "Done",
                                name: "action",
                                value: "done",
                                className: "btn btn--small",
                                ariaLabel: `Mark ${step.title} done`,
                              },
                          {
                            label: "Remove",
                            name: "action",
                            value: "remove",
                            className: "btn btn--small btn--ghost",
                            ariaLabel: `Remove ${step.title}`,
                          },
                        ]}
                      />
                      <RowAction
                        action={dealPlanAction}
                        fields={{ deal_id: dealId, step_id: step.step_id, action: "move" }}
                        className="inline-actions"
                        buttons={[
                          ...(index > 0
                            ? [
                                {
                                  label: "Up",
                                  name: "direction",
                                  value: "up",
                                  className: "btn btn--small btn--ghost",
                                  ariaLabel: `Move ${step.title} up`,
                                },
                              ]
                            : []),
                          ...(index < plan.steps.length - 1
                            ? [
                                {
                                  label: "Down",
                                  name: "direction",
                                  value: "down",
                                  className: "btn btn--small btn--ghost",
                                  ariaLabel: `Move ${step.title} down`,
                                },
                              ]
                            : []),
                        ]}
                      />
                    </>
                  )}
                </div>
              </li>
            ))}
          </ol>
        )}
      </RecordSection>
      {plan.can_edit && (
        <RecordSection id="deal-plan-add" title="Add a step">
          <ActForm
            action={dealPlanAction}
            hidden={hidden}
            act="add"
            label="Add the step"
            tight={false}
          >
            <Field id="step-title" label="What happens">
              <Input
                id="step-title"
                name="title"
                maxLength={200}
                placeholder="Their security review"
              />
            </Field>
            <div className="form-grid">
              <Field id="step-side" label="Whose step">
                <Select id="step-side" name="side" defaultValue="them">
                  <option value="them">Theirs</option>
                  <option value="us">Ours</option>
                </Select>
              </Field>
              <Field id="step-due" label="By">
                <Input id="step-due" name="due_on" type="date" />
              </Field>
            </div>
            <div className="form-grid">
              <Field id="step-owner" label="Ours: who">
                <Select id="step-owner" name="owner_staff_id" defaultValue="">
                  <option value="">Nobody yet</option>
                  {plan.staff.map((person) => (
                    <option key={person.staff_id} value={person.staff_id}>
                      {person.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field id="step-contact" label="Theirs: who">
                <Input id="step-contact" name="contact_name" maxLength={160} />
              </Field>
            </div>
          </ActForm>
        </RecordSection>
      )}
    </>
  );
}
