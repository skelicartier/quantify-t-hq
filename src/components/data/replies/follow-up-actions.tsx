import { MailForm } from "@/components/mail/mail-form";
import { Field, Input, Textarea } from "@/components/ui/field";
import { Popover } from "@/components/ui/popover";
import { RowAction } from "@/components/ui/row-action";
import type { ActionState } from "@/lib/forms/action-state";

type Action = (previous: ActionState, formData: FormData) => Promise<ActionState>;

/** One open follow-up's acts: done, done with a note, or moved to another day. */
export function FollowUpActions({
  followUpId,
  title,
  dueOn,
  today,
  done,
  move,
}: {
  followUpId: string;
  title: string;
  dueOn: string;
  today: string;
  done: Action;
  move: Action;
}) {
  const fields = { follow_up_id: followUpId };
  return (
    <div className="hqdata-followup-acts">
      <RowAction
        action={done}
        fields={fields}
        buttons={[
          {
            label: "Done",
            className: "btn btn--small",
            ariaLabel: `Done: ${title}`,
            pendingLabel: "Saving…",
          },
        ]}
      />
      <Popover label="Done, with a note" align="end">
        <MailForm action={done} fields={fields} submitLabel="Done" pendingLabel="Saving…">
          <Field id={`note-${followUpId}`} label="Note">
            <Textarea id={`note-${followUpId}`} name="note" rows={3} maxLength={4_000} />
          </Field>
        </MailForm>
      </Popover>
      <Popover label="Move" align="end">
        <MailForm action={move} fields={fields} submitLabel="Move it" pendingLabel="Moving…">
          <Field id={`due-${followUpId}`} label="Due">
            <Input
              id={`due-${followUpId}`}
              name="due_on"
              type="date"
              min={today}
              defaultValue={dueOn < today ? today : dueOn}
              required
            />
          </Field>
        </MailForm>
      </Popover>
    </div>
  );
}
