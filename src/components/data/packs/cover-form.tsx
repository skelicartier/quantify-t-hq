import { MailForm } from "@/components/mail/mail-form";
import { Select } from "@/components/ui/field";
import { PACK_CHECKLIST } from "@/lib/data/labels";
import type { ActionState } from "@/lib/forms/action-state";

/**
 * What one file in a pack covers: a line of the checklist, or "Other". A small form in the
 * row, so the checklist and "What's missing" follow as soon as it is saved.
 */
export function CoverForm({
  action,
  packId,
  itemId,
  n,
  covers,
}: {
  action: (previous: ActionState, formData: FormData) => Promise<ActionState>;
  packId: string;
  itemId: string;
  n: number;
  covers: string;
}) {
  const id = `pack-covers-${n}`;
  return (
    <MailForm
      action={action}
      fields={{ pack_id: packId, item_id: itemId }}
      submitLabel="Save"
      pendingLabel="Saving…"
      className="inline-form hqdata-pack__covers"
    >
      <label className="sr-only" htmlFor={id}>
        What file {n} covers
      </label>
      <Select id={id} name="covers" defaultValue={covers}>
        {Object.entries(PACK_CHECKLIST).map(([key, line]) => (
          <option key={key} value={key}>
            {line.label}
          </option>
        ))}
        <option value="other">Other</option>
      </Select>
    </MailForm>
  );
}
