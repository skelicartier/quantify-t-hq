import { MailForm } from "@/components/mail/mail-form";
import { Select } from "@/components/ui/field";
import { PACK_CHECKLIST } from "@/lib/data/labels";
import { TRUST_CHECKLIST } from "@/lib/data/labels-trust";
import type { ActionState } from "@/lib/forms/action-state";

const ALL_LINES: Readonly<Record<string, { label: string }>> = {
  ...PACK_CHECKLIST,
  ...TRUST_CHECKLIST,
};

/**
 * What one file in a pack covers: a line of the pack's own checklist (a data-room pack's or
 * a trust pack's), or "Other". A small form in the row, so the checklist and "What's
 * missing" follow as soon as it is saved.
 */
export function CoverForm({
  action,
  packId,
  itemId,
  n,
  covers,
  lines,
}: {
  action: (previous: ActionState, formData: FormData) => Promise<ActionState>;
  packId: string;
  itemId: string;
  n: number;
  covers: string;
  /** The pack's checklist, in order; a data-room pack's when left out. */
  lines?: readonly { key: string; label: string }[];
}) {
  const id = `pack-covers-${n}`;
  const offered: { key: string; label: string }[] = [
    ...(lines ?? Object.entries(PACK_CHECKLIST).map(([key, line]) => ({ key, label: line.label }))),
  ];
  // A line this pack no longer lists (the Labs lines, once "For Labs too" is off) stays chosen.
  if (covers !== "other" && !offered.some((line) => line.key === covers))
    offered.push({ key: covers, label: ALL_LINES[covers]?.label ?? covers });
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
        {offered.map((line) => (
          <option key={line.key} value={line.key}>
            {line.label}
          </option>
        ))}
        <option value="other">Other</option>
      </Select>
    </MailForm>
  );
}
