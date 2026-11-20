import { MailForm } from "@/components/mail/mail-form";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Popover } from "@/components/ui/popover";
import { RowAction } from "@/components/ui/row-action";
import type { ActionState } from "@/lib/forms/action-state";

type Action = (previous: ActionState, formData: FormData) => Promise<ActionState>;

export type PolicyActionsRow = {
  key: string;
  own: boolean;
  title: string;
  file_id: string | null;
  owner: string;
  approved_by: string;
  approved_on: string | null;
  note: string;
  not_needed: { why: string; on: string } | null;
};

export type FileOption = { file_id: string; title: string; folder: string };

/**
 * A policy's three acts (ws-notes/security/spec.md §8.6): "Link a document" (a picker over
 * Files), "Details" (owner, who approved it and when, a note; the title for his own) and
 * "Not needed" with why, or "Needed again". Each a popover with one form.
 */
export function PolicyActions({
  row,
  files,
  filesHere,
  today,
  actions,
}: {
  row: PolicyActionsRow;
  files: readonly FileOption[];
  filesHere: boolean;
  today: string;
  actions: { link: Action; details: Action; notNeeded: Action };
}) {
  const prefix = `policy-${row.key}`;
  const fields = { key: row.key };
  return (
    <div className="hqdata-assurance__acts">
      {filesHere ? (
        <Popover label={row.file_id ? "Change the document" : "Link a document"} align="start">
          <MailForm
            action={actions.link}
            fields={fields}
            submitLabel="Link it"
            pendingLabel="Linking…"
          >
            <Field id={`${prefix}-file`} label="From Files">
              <Select id={`${prefix}-file`} name="file_id" defaultValue={row.file_id ?? ""}>
                <option value="">None</option>
                {files.map((file) => (
                  <option key={file.file_id} value={file.file_id}>
                    {file.folder ? `${file.folder} › ${file.title}` : file.title}
                  </option>
                ))}
              </Select>
            </Field>
            <p className="field__hint">
              Give the document a review date in Files: that date is the policy&apos;s next review.
            </p>
          </MailForm>
        </Popover>
      ) : (
        <span className="table-sub">Files is not set up here.</span>
      )}
      <Popover label="Details" align="start" width="wide">
        <MailForm
          action={actions.details}
          fields={fields}
          submitLabel="Save"
          pendingLabel="Saving…"
        >
          {row.own && (
            <Field id={`${prefix}-title`} label="Title">
              <Input
                id={`${prefix}-title`}
                name="title"
                defaultValue={row.title}
                minLength={3}
                maxLength={120}
                required
              />
            </Field>
          )}
          <Field id={`${prefix}-owner`} label="Owner">
            <Input id={`${prefix}-owner`} name="owner" defaultValue={row.owner} maxLength={120} />
          </Field>
          <div className="hqdata-assurance__pair">
            <Field id={`${prefix}-approved-by`} label="Approved by">
              <Input
                id={`${prefix}-approved-by`}
                name="approved_by"
                defaultValue={row.approved_by}
                maxLength={120}
              />
            </Field>
            <Field id={`${prefix}-approved-on`} label="Approved on">
              <Input
                id={`${prefix}-approved-on`}
                name="approved_on"
                type="date"
                max={today}
                defaultValue={row.approved_on ?? ""}
              />
            </Field>
          </div>
          <Field id={`${prefix}-note`} label="Note">
            <Textarea
              id={`${prefix}-note`}
              name="note"
              rows={3}
              defaultValue={row.note}
              maxLength={4000}
            />
          </Field>
        </MailForm>
      </Popover>
      {row.not_needed ? (
        <RowAction
          action={actions.notNeeded}
          fields={{ ...fields, undo: "1" }}
          buttons={[{ label: "Needed again", className: "btn btn--small btn--ghost" }]}
          className="hqdata-assurance__inline"
        />
      ) : (
        <Popover label="Not needed" align="start" width="wide">
          <MailForm
            action={actions.notNeeded}
            fields={fields}
            submitLabel="Mark not needed"
            pendingLabel="Saving…"
          >
            <Field id={`${prefix}-why`} label="Why it is not needed" hint="10 to 300 characters.">
              <Textarea
                id={`${prefix}-why`}
                name="why"
                rows={2}
                minLength={10}
                maxLength={300}
                required
              />
            </Field>
          </MailForm>
        </Popover>
      )}
    </div>
  );
}
