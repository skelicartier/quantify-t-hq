import Link from "next/link";

import { createFieldAction, updateFieldAction } from "@/app/(portal)/_actions/fields";
import { AdminTabs } from "@/components/admin/admin-tabs";
import { PageHeader } from "@/components/shell/page-header";
import { ActForm } from "@/components/ui/act-form";
import { Callout } from "@/components/ui/callout";
import { Section } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { RowAction } from "@/components/ui/row-action";
import { hasCapability, requireStaff } from "@/lib/access/core";
import { HqApiRequestError, HqApiUnavailableError } from "@/lib/api/core";
import { readFields, type CustomField, type FieldsSettings } from "@/lib/api/fields";

export const metadata = { title: "Fields" };
export const dynamic = "force-dynamic";

const COLUMNS = [
  { key: "order", label: "Order" },
  { key: "field", label: "Field" },
  { key: "key", label: "Key" },
  { key: "kind", label: "Kind" },
  { key: "rules", label: "Rules" },
  { key: "state", label: "State" },
];

function rules(field: CustomField): string {
  const parts = [field.required ? "Required" : "", field.sensitive ? "Sensitive" : ""].filter(
    Boolean,
  );
  return parts.length ? parts.join(", ") : "—";
}

/**
 * What an admin adds to companies, people, deals and leads. A key and a kind are fixed
 * once made, because saved views, filters, exports and automations name them; a field is
 * archived, never deleted, and a choice is retired, never removed.
 */
export default async function FieldsPage() {
  const context = await requireStaff("/admin/fields");
  if (!hasCapability(context, "hq:admin")) {
    return (
      <>
        <PageHeader eyebrow="Admin" title="Fields" />
        <Callout tone="neutral">Fields are kept by HQ owners and admins.</Callout>
      </>
    );
  }
  let settings: FieldsSettings | null = null;
  try {
    settings = await readFields(context.token);
  } catch (error) {
    if (!(error instanceof HqApiUnavailableError || error instanceof HqApiRequestError))
      throw error;
  }

  return (
    <>
      <PageHeader
        eyebrow="Admin"
        title="Fields"
        description="Your own fields on companies, people, deals and leads. Filled in on each record, checked where the record is saved, offered in every list's filters. A sensitive field is shown only to owners and admins, and the audit log records that it changed, never to what."
        actions={<AdminTabs current="/admin/fields" />}
      />
      {settings === null ? (
        <Callout tone="danger" role="alert">
          The fields could not be read just now.
        </Callout>
      ) : (
        <div className="page-content">
          <details className="disclosure">
            <summary>Add a field</summary>
            <ActForm
              action={createFieldAction}
              hidden={{}}
              act="create"
              label="Add the field"
              primary
              tight={false}
            >
              <div className="form-grid">
                <Field id="field-record" label="On">
                  <Select id="field-record" name="record_type" defaultValue="company">
                    {settings.record_types.map((item) => (
                      <option key={item.value} value={item.value}>
                        {item.label}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field id="field-kind" label="Kind" hint="Fixed once the field is made.">
                  <Select id="field-kind" name="kind" defaultValue="text">
                    {settings.kinds.map((item) => (
                      <option key={item.value} value={item.value}>
                        {item.label}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
              <div className="form-grid">
                <Field id="field-label" label="Name">
                  <Input
                    id="field-label"
                    name="label"
                    maxLength={80}
                    required
                    placeholder="Assets under management"
                  />
                </Field>
                <Field
                  id="field-key"
                  label="Key"
                  hint="Left empty, it is made from the name. Fixed once made."
                >
                  <Input
                    id="field-key"
                    name="key"
                    maxLength={40}
                    placeholder="assets_under_management"
                  />
                </Field>
              </div>
              <Field
                id="field-options"
                label="Choices"
                hint="For a list: one per line. Ignored for other kinds."
              >
                <Textarea id="field-options" name="options" rows={3} maxLength={4000} />
              </Field>
              <Field id="field-help" label="Help under the input">
                <Input id="field-help" name="help" maxLength={200} />
              </Field>
              <label className="checkbox">
                <input type="checkbox" name="required" />
                <span className="checkbox__label">
                  Required when a person creates or edits the record
                </span>
              </label>
              <label className="checkbox">
                <input type="checkbox" name="sensitive" />
                <span className="checkbox__label">
                  Sensitive: only owners and admins see or change it
                </span>
              </label>
            </ActForm>
          </details>
          {settings.record_types.map((type) => {
            const fields = settings.fields.filter((field) => field.record_type === type.value);
            const live = fields.filter((field) => !field.archived).length;
            return (
              <Section
                key={type.value}
                id={`fields-${type.value}`}
                title={type.label}
                description={`${live} of ${settings.per_type} fields in use.`}
              >
                <DataTable
                  caption={`Fields on ${type.label.toLowerCase()}`}
                  columns={COLUMNS}
                  isEmpty={fields.length === 0}
                  empty={<p className="muted">No fields of your own yet.</p>}
                  columnMenu={false}
                >
                  {fields.map((field, index) => (
                    <tr key={field.field_id}>
                      <td>
                        {fields.length < 2 ? (
                          "—"
                        ) : (
                          <RowAction
                            action={updateFieldAction}
                            fields={{ field_id: field.field_id }}
                            buttons={[
                              ...(index > 0
                                ? [
                                    {
                                      label: "Up",
                                      name: "action",
                                      value: "up",
                                      className: "btn btn--small btn--ghost",
                                      ariaLabel: `Move ${field.label} up`,
                                    },
                                  ]
                                : []),
                              ...(index < fields.length - 1
                                ? [
                                    {
                                      label: "Down",
                                      name: "action",
                                      value: "down",
                                      className: "btn btn--small btn--ghost",
                                      ariaLabel: `Move ${field.label} down`,
                                    },
                                  ]
                                : []),
                            ]}
                          />
                        )}
                      </td>
                      <td>
                        <Link href={`/admin/fields/${field.field_id}`}>{field.label}</Link>
                        {field.help && <span className="quiet"> · {field.help}</span>}
                      </td>
                      <td className="mono">{field.key}</td>
                      <td>
                        {field.kind_label}
                        {field.options.length > 0 &&
                          `: ${field.options
                            .filter((option) => !option.retired)
                            .map((option) => option.label)
                            .join(", ")}`}
                      </td>
                      <td>{rules(field)}</td>
                      <td>{field.archived ? "Archived" : "In use"}</td>
                    </tr>
                  ))}
                </DataTable>
              </Section>
            );
          })}
        </div>
      )}
    </>
  );
}
