import { notFound } from "next/navigation";

import { updateFieldAction } from "@/app/(portal)/_actions/fields";
import { PageHeader } from "@/components/shell/page-header";
import { ActForm } from "@/components/ui/act-form";
import { Callout } from "@/components/ui/callout";
import { Card } from "@/components/ui/card";
import { Field, Input, Textarea } from "@/components/ui/field";
import {
  Properties,
  Property,
  RecordGrid,
  RecordHeader,
  RecordSection,
} from "@/components/ui/record-shell";
import { hasCapability, requireStaff } from "@/lib/access/core";
import { HqApiRequestError, HqApiUnavailableError } from "@/lib/api/core";
import { readFields, type CustomField } from "@/lib/api/fields";

export const metadata = { title: "Field" };
export const dynamic = "force-dynamic";

const RECORD_LABELS: Record<string, string> = {
  company: "Companies",
  person: "People",
  deal: "Deals",
  lead: "Leads",
};

type Params = Promise<{ fieldId: string }>;

/** One field: its fixed key and kind, what can change, and archiving it. */
export default async function FieldPage({ params }: { params: Params }) {
  const { fieldId } = await params;
  const context = await requireStaff(`/admin/fields/${fieldId}`);
  if (!hasCapability(context, "hq:admin")) {
    return (
      <>
        <PageHeader eyebrow="Admin" title="Field" />
        <Callout tone="neutral">Fields are kept by HQ owners and admins.</Callout>
      </>
    );
  }
  let field: CustomField | null | undefined = null;
  try {
    field = (await readFields(context.token)).fields.find((item) => item.field_id === fieldId);
  } catch (error) {
    if (!(error instanceof HqApiUnavailableError || error instanceof HqApiRequestError))
      throw error;
  }
  if (field === undefined) notFound();
  if (field === null) {
    return (
      <>
        <PageHeader eyebrow="Admin" title="Field" />
        <Callout tone="danger" role="alert">
          This field could not be read just now.
        </Callout>
      </>
    );
  }
  const hidden = { field_id: field.field_id };
  const lists = field.kind === "choice" || field.kind === "multi_choice";
  const retired = field.options.filter((option) => option.retired);

  return (
    <>
      <RecordHeader
        crumbs={[{ href: "/admin/fields", label: "Fields" }]}
        title={field.label}
        readouts={[
          { label: "On", value: RECORD_LABELS[field.record_type] ?? field.record_type },
          { label: "Kind", value: field.kind_label },
          { label: "State", value: field.archived ? "Archived" : "In use" },
        ]}
      />
      <RecordGrid
        side={
          <Properties title="Fixed once made">
            <Property label="Key" mono>
              {field.key}
            </Property>
            <Property label="Kind">{field.kind_label}</Property>
            <Property label="On">{RECORD_LABELS[field.record_type] ?? field.record_type}</Property>
          </Properties>
        }
      >
        {!field.archived && (
          <RecordSection id="change" title="Change it">
            <ActForm
              action={updateFieldAction}
              hidden={hidden}
              act="edit"
              label="Save"
              primary
              tight={false}
            >
              <Field id="edit-label" label="Name">
                <Input id="edit-label" name="label" maxLength={80} defaultValue={field.label} />
              </Field>
              <Field id="edit-help" label="Help under the input">
                <Input id="edit-help" name="help" maxLength={200} defaultValue={field.help} />
              </Field>
              {lists && (
                <Field
                  id="edit-options"
                  label="Choices"
                  hint="One per line as value = Label. A new line needs only a label. A line taken out is retired: the records that carry it keep it, nobody can pick it again."
                >
                  <Textarea
                    id="edit-options"
                    name="options"
                    rows={6}
                    maxLength={4000}
                    defaultValue={field.options
                      .filter((option) => !option.retired)
                      .map((option) => `${option.value} = ${option.label}`)
                      .join("\n")}
                  />
                </Field>
              )}
              <label className="checkbox">
                <input type="checkbox" name="required" defaultChecked={field.required} />
                <span className="checkbox__label">
                  Required when a person creates or edits the record
                </span>
              </label>
              <label className="checkbox">
                <input type="checkbox" name="sensitive" defaultChecked={field.sensitive} />
                <span className="checkbox__label">
                  Sensitive: only owners and admins see or change it
                </span>
              </label>
            </ActForm>
            {retired.length > 0 && (
              <p className="page-note">
                Retired choices, still shown on the records that carry them:{" "}
                {retired.map((option) => `${option.value} = ${option.label}`).join("; ")}. Add a
                line back to offer one again.
              </p>
            )}
          </RecordSection>
        )}
        <RecordSection id="state" title={field.archived ? "Bring it back" : "Archive it"}>
          <Card
            title={field.archived ? "Restore" : "Archive"}
            titleAs="h3"
            description={
              field.archived
                ? "Offered on every record again, with the values it held."
                : "Taken off every form and list. Its values are kept, and its key stays taken."
            }
          >
            <ActForm
              action={updateFieldAction}
              hidden={hidden}
              act={field.archived ? "restore" : "archive"}
              label={field.archived ? "Restore the field" : "Archive the field"}
              danger={!field.archived}
            />
          </Card>
        </RecordSection>
      </RecordGrid>
    </>
  );
}
