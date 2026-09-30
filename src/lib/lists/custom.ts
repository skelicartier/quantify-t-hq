import type { FilterField } from "@/lib/lists/filters";

type Definition = {
  key: string;
  label: string;
  kind: string;
  options: readonly { value: string; label: string; retired: boolean }[];
};

/**
 * A list's custom fields as filter-builder fields, keyed `custom.<key>`. Lists carry what
 * a person reads (a choice's label, "Yes"), so a choice filters on its labels.
 */
export function customFilterFields(fields: readonly Definition[]): FilterField[] {
  return fields.map((field) => {
    const key = `custom.${field.key}`;
    if (field.kind === "number") return { key, label: field.label, kind: "number" };
    if (field.kind === "choice")
      return {
        key,
        label: field.label,
        kind: "choice",
        choices: field.options.map((option) => ({ value: option.label, label: option.label })),
      };
    if (field.kind === "checkbox")
      return { key, label: field.label, kind: "choice", choices: [{ value: "Yes", label: "Yes" }] };
    return { key, label: field.label, kind: "text" };
  });
}

/** A row's value for a `custom.<key>` filter field; undefined for any other field. */
export function readCustom(
  custom: Readonly<Record<string, string>> | undefined,
  field: string,
): string | undefined {
  if (!field.startsWith("custom.")) return undefined;
  return custom?.[field.slice("custom.".length)] ?? "";
}
