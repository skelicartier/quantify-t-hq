"use client";

import { useState } from "react";

import { MailForm } from "@/components/mail/mail-form";
import { Field, Input, Select } from "@/components/ui/field";
import {
  INVESTOR_STAGES,
  INVESTOR_STAGE_ORDER,
  PASS_REASONS,
  type InvestorStage,
} from "@/lib/data/labels";
import type { ActionState } from "@/lib/forms/action-state";

type Action = (previous: ActionState, formData: FormData) => Promise<ActionState>;

/** The stages a next step and its day are not asked for (spec §2.7). */
const NO_NEXT_STEP = new Set<InvestorStage>(["money_in", "passed", "do_not_pitch"]);

/**
 * "Move to a stage": the stage, then what that stage asks for. A next step and the day it
 * is due by, unless the firm is at Money in, Passed or Do not pitch; "Until" for Set aside;
 * "Why" for Passed. The fields a stage does not need are hidden, and the service checks
 * the same rules again, so a page drawn without scripts still says what is missing.
 */
export function StageForm({
  action,
  investorId,
  stage,
  nextStep,
  nextStepOn,
  today,
}: {
  action: Action;
  investorId: string;
  stage: InvestorStage;
  nextStep: string;
  nextStepOn: string | null;
  today: string;
}) {
  const [chosen, setChosen] = useState<InvestorStage>(stage);
  const needsStep = !NO_NEXT_STEP.has(chosen);
  const field = (name: string) => `investor-${investorId.slice(0, 8)}-${name}`;
  return (
    <MailForm
      action={action}
      fields={{ investor_id: investorId }}
      submitLabel="Move it"
      pendingLabel="Moving…"
    >
      <Field id={field("stage")} label="Stage">
        <Select
          id={field("stage")}
          name="stage"
          value={chosen}
          onChange={(event) => setChosen(event.target.value as InvestorStage)}
        >
          {INVESTOR_STAGE_ORDER.map((key) => (
            <option key={key} value={key}>
              {INVESTOR_STAGES[key].label}
            </option>
          ))}
        </Select>
      </Field>
      <div hidden={!needsStep} className="stack-form stack-form--tight">
        <Field id={field("next")} label="Next step">
          <Input
            id={field("next")}
            name="next_step"
            maxLength={200}
            defaultValue={nextStep}
            required={needsStep}
            disabled={!needsStep}
          />
        </Field>
        <Field id={field("by")} label="By">
          <Input
            id={field("by")}
            name="next_step_on"
            type="date"
            min={today}
            defaultValue={nextStepOn ?? ""}
            required={needsStep}
            disabled={!needsStep}
          />
        </Field>
      </div>
      <div hidden={chosen !== "set_aside"}>
        <Field id={field("until")} label="Until">
          <Input
            id={field("until")}
            name="set_aside_until"
            type="date"
            min={today}
            required={chosen === "set_aside"}
            disabled={chosen !== "set_aside"}
          />
        </Field>
      </div>
      <div hidden={chosen !== "passed"}>
        <Field id={field("why")} label="Why">
          <Select
            id={field("why")}
            name="passed_reason"
            defaultValue="none_given"
            disabled={chosen !== "passed"}
          >
            {Object.entries(PASS_REASONS).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </Select>
        </Field>
      </div>
    </MailForm>
  );
}
