"use client";

import { useActionState } from "react";

import { useTimeZone } from "@/components/shell/time-zone-context";
import { Button } from "@/components/ui/button";
import { FormFeedback } from "@/components/ui/form-feedback";
import { Field, Input, Select } from "@/components/ui/field";
import { AttemptField } from "@/components/ui/attempt-field";
import { INITIAL_DESK_STATE, type DeskActionState } from "@/lib/support/desk-state";
import type { Ticket } from "@/lib/api/tickets";
import { wallClockInZone } from "@/lib/time-zone";

type Teammate = { staff_id: string; display_name: string };

type TicketControlsProps = {
  ticket: Ticket;
  action: (previous: DeskActionState, formData: FormData) => Promise<DeskActionState>;
  /** Empty for desk staff without the directory; they still get assign-to-me. */
  teammates: readonly Teammate[];
  self: Teammate;
};

export function TicketControls({ ticket, action, teammates, self }: TicketControlsProps) {
  const [state, formAction, isPending] = useActionState(action, INITIAL_DESK_STATE);
  const zone = useTimeZone();
  const options = teammates.length > 0 ? teammates : [self];
  return (
    <form className="stack-form" action={formAction}>
      <AttemptField state={state} />
      <input type="hidden" name="ticket_id" value={ticket.id} />
      <Field id="ticket-status" label="Status">
        <Select id="ticket-status" name="status" defaultValue={ticket.status} disabled={isPending}>
          <option value="open">Needs an answer</option>
          <option value="pending">Waiting on customer</option>
          <option value="resolved">Resolved</option>
        </Select>
      </Field>
      <Field id="ticket-priority" label="Priority">
        <Select
          id="ticket-priority"
          name="priority"
          defaultValue={ticket.priority}
          disabled={isPending}
        >
          <option value="low">Low</option>
          <option value="normal">Normal</option>
          <option value="high">High</option>
          <option value="urgent">Urgent</option>
        </Select>
      </Field>
      <Field
        id="ticket-assignee"
        label="Assignee"
        hint={teammates.length === 0 ? "You can take it or return it to the queue." : null}
      >
        <Select
          id="ticket-assignee"
          name="assignee_staff_id"
          defaultValue={ticket.assignee_staff_id}
          disabled={isPending}
        >
          <option value="">Unassigned</option>
          {options.map((teammate) => (
            <option key={teammate.staff_id} value={teammate.staff_id}>
              {teammate.display_name}
              {teammate.staff_id === self.staff_id ? " (me)" : ""}
            </option>
          ))}
        </Select>
      </Field>
      <Field id="ticket-tags" label="Tags" hint="Comma-separated; lower-cased on save.">
        <Input
          id="ticket-tags"
          name="tags"
          defaultValue={ticket.tags.join(", ")}
          maxLength={400}
          disabled={isPending}
        />
      </Field>
      <Field
        id="ticket-snooze"
        label="Snooze until"
        hint="In your time zone. Pauses the reply timer; when the snooze ends it starts again from then. A customer reply ends it early. Clear the field to wake it."
      >
        <Input
          id="ticket-snooze"
          name="snoozed_until"
          type="datetime-local"
          defaultValue={
            ticket.snoozed && ticket.snoozed_until
              ? wallClockInZone(new Date(ticket.snoozed_until), zone)
              : ""
          }
          disabled={isPending}
        />
      </Field>
      <Field id="ticket-issue" label="Linked issue" hint="A tracker URL; the loop closes here.">
        <Input
          id="ticket-issue"
          name="linked_issue_url"
          type="url"
          defaultValue={ticket.linked_issue_url}
          placeholder="https://github.com/…"
          maxLength={400}
          disabled={isPending}
        />
      </Field>
      <Button type="submit" disabled={isPending}>
        {isPending ? "Applying…" : "Apply changes"}
      </Button>
      <FormFeedback state={state} sentLabel="Changes applied." />
    </form>
  );
}
