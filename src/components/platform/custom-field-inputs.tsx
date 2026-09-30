import { Field, Input, Select, Textarea } from "@/components/ui/field";

type Option = { value: string; label: string; retired: boolean };

export type CustomInputField = {
  key: string;
  label: string;
  kind: string;
  options: readonly Option[];
  help: string;
  required: boolean;
  /** The stored value, when editing; a masked one is never sent back. */
  value?: string;
};

/**
 * One input per custom field, named `custom.<key>` for `customFromForm`. A retired choice
 * is offered only to the record that already carries it, so saving the form keeps it.
 */
export function CustomFieldInputs({
  fields,
  idPrefix,
}: {
  fields: readonly CustomInputField[];
  idPrefix: string;
}) {
  return (
    <>
      {fields.map((field) => {
        const id = `${idPrefix}-${field.key}`;
        const name = `custom.${field.key}`;
        const value = field.value ?? "";
        const label = field.label;
        const note = field.required ? "Required" : undefined;
        const hint = field.help || undefined;
        switch (field.kind) {
          case "long_text":
            return (
              <Field key={field.key} id={id} label={label} note={note} hint={hint}>
                <Textarea id={id} name={name} rows={3} maxLength={2000} defaultValue={value} />
              </Field>
            );
          case "number":
            return (
              <Field key={field.key} id={id} label={label} note={note} hint={hint}>
                <Input
                  id={id}
                  name={name}
                  inputMode="decimal"
                  maxLength={40}
                  defaultValue={value}
                />
              </Field>
            );
          case "date":
            return (
              <Field key={field.key} id={id} label={label} note={note} hint={hint}>
                <Input id={id} name={name} type="date" defaultValue={value} />
              </Field>
            );
          case "url":
            return (
              <Field key={field.key} id={id} label={label} note={note} hint={hint}>
                <Input
                  id={id}
                  name={name}
                  type="url"
                  maxLength={2000}
                  defaultValue={value}
                  placeholder="https://"
                />
              </Field>
            );
          case "email":
            return (
              <Field key={field.key} id={id} label={label} note={note} hint={hint}>
                <Input id={id} name={name} type="email" maxLength={254} defaultValue={value} />
              </Field>
            );
          case "choice":
            return (
              <Field key={field.key} id={id} label={label} note={note} hint={hint}>
                <Select id={id} name={name} defaultValue={value}>
                  <option value="">Not set</option>
                  {field.options
                    .filter((option) => !option.retired || option.value === value)
                    .map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.retired ? `${option.label} (retired)` : option.label}
                      </option>
                    ))}
                </Select>
              </Field>
            );
          case "multi_choice": {
            const picked = new Set(value ? value.split(",") : []);
            return (
              <fieldset key={field.key} className="fieldset">
                <legend>
                  {label}
                  {note && <span className="field__label-note"> {note}</span>}
                </legend>
                <input type="hidden" name={`${name}:present`} value="1" />
                {field.options
                  .filter((option) => !option.retired || picked.has(option.value))
                  .map((option) => (
                    <label key={option.value} className="checkbox">
                      <input
                        type="checkbox"
                        name={`${name}:many`}
                        value={option.value}
                        defaultChecked={picked.has(option.value)}
                      />
                      <span className="checkbox__label">
                        {option.retired ? `${option.label} (retired)` : option.label}
                      </span>
                    </label>
                  ))}
                {hint && <p className="field__hint">{hint}</p>}
              </fieldset>
            );
          }
          case "checkbox":
            return (
              <div key={field.key} className="field">
                <input type="hidden" name={`${name}:present`} value="1" />
                <label className="checkbox">
                  <input
                    type="checkbox"
                    name={name}
                    value="true"
                    defaultChecked={value === "true"}
                  />
                  <span className="checkbox__label">
                    {label}
                    {note && <span className="field__label-note"> {note}</span>}
                  </span>
                </label>
                {hint && <p className="field__hint">{hint}</p>}
              </div>
            );
          default:
            return (
              <Field key={field.key} id={id} label={label} note={note} hint={hint}>
                <Input id={id} name={name} maxLength={200} defaultValue={value} />
              </Field>
            );
        }
      })}
    </>
  );
}
