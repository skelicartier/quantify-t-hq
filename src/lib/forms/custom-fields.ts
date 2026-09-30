/**
 * The `custom` object a record form sends. Inputs are named `custom.<key>`; a list that
 * allows several choices names each tick `custom.<key>:many`; a yes/no or several-choice
 * field also sends `custom.<key>:present`, so nothing ticked reads as "empty" rather than
 * "not on this form" — an unticked box is otherwise absent from the submission.
 *
 * Keys are lowercase letters, digits and underscores, so the `:` never collides.
 */
export function customFromForm(formData: FormData): Record<string, string | string[]> {
  const values: Record<string, string | string[]> = {};
  const present = new Set<string>();
  for (const [name, raw] of formData.entries()) {
    if (typeof raw !== "string" || !name.startsWith("custom.")) continue;
    const rest = name.slice("custom.".length);
    if (rest.endsWith(":present")) {
      present.add(rest.slice(0, -":present".length));
    } else if (rest.endsWith(":many")) {
      const key = rest.slice(0, -":many".length);
      const list = Array.isArray(values[key]) ? (values[key] as string[]) : [];
      list.push(raw.slice(0, 40));
      values[key] = list;
    } else if (/^[a-z][a-z0-9_]{1,39}$/.test(rest)) {
      values[rest] = raw.slice(0, 2000);
    }
  }
  for (const key of present) if (!(key in values)) values[key] = "";
  return values;
}
