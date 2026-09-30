import { saveCustomFieldsAction } from "@/app/(portal)/_actions/fields";
import { CustomFieldInputs } from "@/components/platform/custom-field-inputs";
import { ActForm } from "@/components/ui/act-form";
import { RecordSection } from "@/components/ui/record-shell";

type Value = {
  key: string;
  label: string;
  kind: string;
  options: readonly { value: string; label: string; retired: boolean }[];
  help: string;
  required: boolean;
  sensitive: boolean;
  value: string;
  display: string;
  masked: boolean;
  editable: boolean;
};

function Shown({ field }: { field: Value }) {
  if (field.masked) return <span className="quiet">Hidden: an admin keeps this field</span>;
  if (!field.display) return <span className="quiet">Not set</span>;
  if (field.kind === "url")
    return (
      <a href={field.display} rel="noopener noreferrer nofollow" target="_blank">
        {field.display}
      </a>
    );
  if (field.kind === "email") return <a href={`mailto:${field.display}`}>{field.display}</a>;
  if (field.kind === "long_text") return <span className="prewrap">{field.display}</span>;
  return <>{field.display}</>;
}

/**
 * The fields an admin added to this kind of record: read in place, edited together. A
 * sensitive field shows as hidden to those who cannot read it, and is not on their form.
 */
export function CustomFieldsSection({
  recordType,
  recordId,
  fields,
  canWrite,
}: {
  recordType: "company" | "person" | "deal" | "lead";
  recordId: string;
  fields: readonly Value[];
  canWrite: boolean;
}) {
  if (fields.length === 0) return null;
  const editable = fields.filter((field) => field.editable);
  return (
    <RecordSection id="custom-fields" title="Fields">
      <dl className="props__list">
        {fields.map((field) => (
          <div key={field.key} className="prop">
            <dt className="prop__label">{field.label}</dt>
            <dd className="prop__value">
              <Shown field={field} />
            </dd>
          </div>
        ))}
      </dl>
      {canWrite && editable.length > 0 && (
        <details className="disclosure">
          <summary>Edit the fields</summary>
          <ActForm
            action={saveCustomFieldsAction}
            hidden={{ record_type: recordType, record_id: recordId }}
            act="save"
            label="Save the fields"
            tight={false}
          >
            <CustomFieldInputs
              idPrefix={`cf-${recordType}`}
              fields={editable.map((field) => ({ ...field, value: field.value }))}
            />
          </ActForm>
        </details>
      )}
    </RecordSection>
  );
}
