import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { DATE_KINDS, REMIND_DAYS, REPEATS } from "@/lib/data/labels";

export type DateFieldValues = {
  title: string;
  kind: string;
  due_on: string;
  repeats: string;
  entity: string;
  handled_by: string;
  remind_days: number;
  notes: string;
  file_id: string | null;
};

export const NEW_DATE: DateFieldValues = {
  title: "",
  kind: "filing",
  due_on: "",
  repeats: "never",
  entity: "The Indian company",
  handled_by: "",
  remind_days: 7,
  notes: "",
  file_id: null,
};

/**
 * The fields of a key date, for "Add a date" and for editing one: what, the kind, the day,
 * how often, for which company, who handles it, when to be reminded, notes, and a file
 * from Files (a filed copy, the challan). The ids carry a prefix so two forms can share
 * a page.
 */
export function DateFields({
  prefix,
  values,
  files,
  filesHere,
}: {
  prefix: string;
  values: DateFieldValues;
  files: readonly { file_id: string; title: string; folder: string }[];
  filesHere: boolean;
}) {
  const id = (name: string) => `${prefix}-${name}`;
  return (
    <>
      <Field id={id("title")} label="What">
        <Input
          id={id("title")}
          name="title"
          required
          maxLength={200}
          defaultValue={values.title}
          placeholder="MGT-7A annual return"
        />
      </Field>
      <Field id={id("kind")} label="Kind">
        <Select id={id("kind")} name="kind" defaultValue={values.kind}>
          {Object.entries(DATE_KINDS).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </Select>
      </Field>
      <Field id={id("due")} label="Due on">
        <Input id={id("due")} name="due_on" type="date" required defaultValue={values.due_on} />
      </Field>
      <Field id={id("repeats")} label="Repeats">
        <Select id={id("repeats")} name="repeats" defaultValue={values.repeats}>
          {Object.entries(REPEATS).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </Select>
      </Field>
      <Field id={id("entity")} label="For which company">
        <Input id={id("entity")} name="entity" maxLength={120} defaultValue={values.entity} />
      </Field>
      <Field id={id("who")} label="Who handles it">
        <Input
          id={id("who")}
          name="handled_by"
          maxLength={120}
          defaultValue={values.handled_by}
          placeholder="The CA"
        />
      </Field>
      <Field id={id("remind")} label="Remind me">
        <Select id={id("remind")} name="remind_days" defaultValue={String(values.remind_days)}>
          {REMIND_DAYS.map((item) => (
            <option key={item.days} value={item.days}>
              {item.label}
            </option>
          ))}
        </Select>
      </Field>
      <Field id={id("notes")} label="Notes">
        <Textarea
          id={id("notes")}
          name="notes"
          rows={3}
          maxLength={4_000}
          defaultValue={values.notes}
        />
      </Field>
      {filesHere ? (
        <Field id={id("file")} label="File">
          <Select id={id("file")} name="file_id" defaultValue={values.file_id ?? ""}>
            <option value="">No file</option>
            {files.map((file) => (
              <option key={file.file_id} value={file.file_id}>
                {file.folder ? `${file.folder} › ${file.title}` : file.title}
              </option>
            ))}
          </Select>
        </Field>
      ) : (
        <p className="field__hint">Files is not set up here, so no file can be attached.</p>
      )}
    </>
  );
}
