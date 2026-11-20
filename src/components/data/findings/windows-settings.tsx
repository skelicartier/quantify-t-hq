import { PracticeNote } from "@/components/data/security/control-ref";
import { MailForm } from "@/components/mail/mail-form";
import { Field, Input } from "@/components/ui/field";
import { Popover } from "@/components/ui/popover";
import { listWords } from "@/lib/data/labels-assurance";
import {
  PRACTICES,
  SEVERITIES,
  SEVERITY_WORDS,
  type PracticeKey,
  type Severity,
} from "@/lib/data/labels-controls";
import type { ActionState } from "@/lib/forms/action-state";

type Action = (previous: ActionState, formData: FormData) => Promise<ActionState>;
type Window = { days: number; yours: boolean };

const PRACTICE_OF: Readonly<Record<Severity, PracticeKey>> = {
  critical: "fix_critical",
  high: "fix_high",
  medium: "fix_medium",
  low: "fix_low",
};

/**
 * "Fix within 7, 30, 90 and 180 days by severity", read as the fix-by windows' kind reads
 * ("within": a window that runs once from the day a finding is found).
 */
export function windowsLine(windows: Readonly<Record<Severity, Window>>): string {
  const lead = PRACTICES.fix_critical.kind === "within" ? "Fix within" : "Fix every";
  const days = SEVERITIES.map((severity) => String(windows[severity].days));
  const yours = SEVERITIES.some((severity) => windows[severity].yours);
  return `${lead} ${listWords(days)} days by severity${yours ? ", some of them yours" : ""}`;
}

/**
 * The windows line and its "Settings" popover (ws-notes/security/spec.md §8.6): each window
 * with its `PracticeNote` and a field to change it (empty: HQ's default again), and the
 * months between pen tests with theirs.
 */
export function WindowsSettings({
  windows,
  penTest,
  action,
}: {
  windows: Readonly<Record<Severity, Window>>;
  penTest: { months: number; yours: boolean };
  action: Action;
}) {
  return (
    <div className="hqdata-assurance__tools" data-section="findings-windows">
      <p>{windowsLine(windows)}.</p>
      <Popover label="Settings" align="start" width="wide">
        <MailForm action={action} submitLabel="Save" pendingLabel="Saving…">
          {SEVERITIES.map((severity) => (
            <Field
              key={severity}
              id={`window-${severity}`}
              label={`${SEVERITY_WORDS[severity]}: days to fix`}
              hint={
                <PracticeNote
                  practice={PRACTICE_OF[severity]}
                  {...(windows[severity].yours ? { amount: windows[severity].days } : {})}
                />
              }
            >
              <Input
                id={`window-${severity}`}
                name={severity}
                type="number"
                min={1}
                max={365}
                defaultValue={windows[severity].yours ? String(windows[severity].days) : ""}
                placeholder={String(PRACTICES[PRACTICE_OF[severity]].amount)}
              />
            </Field>
          ))}
          <Field
            id="window-pen-test"
            label="Months between pen tests"
            hint={
              <PracticeNote
                practice="pen_test"
                {...(penTest.yours ? { amount: penTest.months } : {})}
              />
            }
          >
            <Input
              id="window-pen-test"
              name="pen_test_months"
              type="number"
              min={1}
              max={24}
              defaultValue={penTest.yours ? String(penTest.months) : ""}
              placeholder={String(PRACTICES.pen_test.amount)}
            />
          </Field>
          <p className="field__hint">Leave a field empty for HQ&apos;s default.</p>
        </MailForm>
      </Popover>
    </div>
  );
}
