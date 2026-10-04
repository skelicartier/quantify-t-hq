import { MailForm } from "@/components/mail/mail-form";
import { Callout } from "@/components/ui/callout";
import { Checkbox, Field, Input, Select } from "@/components/ui/field";
import { RecordSection } from "@/components/ui/record-shell";
import { Timestamp } from "@/components/ui/timestamp";
import type { Handover } from "@/lib/api/team";
import type { ActionState } from "@/lib/forms/action-state";
import { formatNumber } from "@/lib/format";

/**
 * What a person is answerable for, by area, and the one act that hands it to a colleague
 * when they leave. Only work in hand is counted and moved; each kind goes only to a role
 * that works on it, and the answer names what was left for someone else.
 */
export function HandoverSection({
  handover,
  colleagues,
  action,
  now,
}: {
  handover: Handover | null;
  colleagues: readonly { staff_id: string; display_name: string }[];
  /** Needs a fresh code: the page's own gate, above its tabs, asks for one. */
  action: (previous: ActionState, formData: FormData) => Promise<ActionState>;
  /** The request's moment, for the relative time of the last handover. */
  now: number;
}) {
  if (handover === null)
    return (
      <RecordSection id="team-handover" title="Their work">
        <Callout tone="danger" role="alert">
          What they own could not be read just now.
        </Callout>
      </RecordSection>
    );
  const open = handover.items.filter((item) => item.count > 0);
  const areas = [...new Set(open.map((item) => item.area))];
  const first = handover.name.split(" ")[0] || handover.name;
  const last = handover.last;
  return (
    <RecordSection id="team-handover" title="Their work">
      {last && (
        <p className="handover-last">
          Handed over {last.at ? <Timestamp value={last.at} now={now} mode="relative" /> : null}
          {last.by_name ? ` by ${last.by_name}` : ""}: {formatNumber(last.total)}{" "}
          {last.total === 1 ? "item" : "items"} to {last.to_name || "a colleague"}
          {last.sequences_ended
            ? `; ${formatNumber(last.sequences_ended)} ${last.sequences_ended === 1 ? "sequence" : "sequences"} ended`
            : ""}
          .
        </p>
      )}
      {open.length === 0 ? (
        <p className="side-quiet">
          Nothing open is theirs: no records, tasks or registers to hand over.
        </p>
      ) : (
        <>
          <p className="page-note">
            What {first} is answerable for now. When they leave, hand it to one colleague: only work
            in hand moves, and each kind only to someone whose role works on it.
          </p>
          <div className="handover-areas">
            {areas.map((area) => (
              <section key={area} className="handover-area" aria-label={area}>
                <h3 className="handover-area__title">{area}</h3>
                <dl className="handover-list">
                  {open
                    .filter((item) => item.area === area)
                    .map((item) => (
                      <div key={item.key}>
                        <dt>{item.label}</dt>
                        <dd className="num">{formatNumber(item.count)}</dd>
                      </div>
                    ))}
                </dl>
              </section>
            ))}
          </div>
          <MailForm
            action={action}
            fields={{ staff_id: handover.staff_id }}
            submitLabel="Hand it over"
            pendingLabel="Handing over…"
            className="stack-form handover-form"
          >
            <Field id="handover-to" label="Hand it to">
              <Select id="handover-to" name="to_staff_id" required defaultValue="">
                <option value="" disabled>
                  Choose a colleague
                </option>
                {colleagues.map((colleague) => (
                  <option key={colleague.staff_id} value={colleague.staff_id}>
                    {colleague.display_name}
                  </option>
                ))}
              </Select>
            </Field>
            <fieldset className="handover-form__kinds">
              <legend className="field__label">What moves</legend>
              {open.map((item) => (
                <Checkbox
                  key={item.key}
                  id={`handover-${item.key}`}
                  name="keys"
                  value={item.key}
                  defaultChecked
                  label={`${item.label} (${formatNumber(item.count)})`}
                  description={
                    item.needs_words
                      ? `Only to someone who works on ${item.needs_words}.`
                      : undefined
                  }
                />
              ))}
            </fieldset>
            <Field id="handover-reason" label="Why" hint="Kept in the audit log with what moved.">
              <Input
                id="handover-reason"
                name="reason"
                maxLength={400}
                minLength={4}
                required
                placeholder={`${first} leaves on Friday`}
              />
            </Field>
          </MailForm>
        </>
      )}
      <ul className="handover-kept">
        {handover.kept.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
    </RecordSection>
  );
}
