/**
 * Where the records behind a data health count are shown in full. The service names a
 * list and its filters; this is the one place that knows which page each list is, so a
 * page move is one edit here rather than a link that quietly lands on an empty view.
 */

export type HealthView = {
  list: string;
  conditions?: readonly string[] | undefined;
  reason?: string | undefined;
};

export function viewHref(view: HealthView): string {
  const params = new URLSearchParams();
  for (const condition of view.conditions ?? []) params.append("f", condition);
  const query = params.toString();
  switch (view.list) {
    case "prospects":
      return `/leads/prospects${query ? `?${query}` : ""}`;
    case "companies":
      return `/companies${query ? `?${query}` : ""}`;
    case "lead_duplicates":
      return `/leads/duplicates${view.reason ? `?reason=${encodeURIComponent(view.reason)}` : ""}`;
    case "crm_duplicates":
      return "/companies/duplicates";
    case "fields":
      return "/admin/fields";
    default:
      return "/data-health";
  }
}

/** A record a check carries, as a link; a value (a country as typed) is not a record. */
export function sampleHref(kind: string, id: string): string | null {
  if (kind === "lead") return `/leads/${id}`;
  if (kind === "company") return `/companies/${id}`;
  if (kind === "person") return `/people/${id}`;
  if (kind === "field") return "/admin/fields";
  return null;
}

/** The tidy-ups, in the words the page uses for them. */
export const TIDY_UPS: Record<
  string,
  { title: string; done: string; field: Record<string, string> }
> = {
  name_case: {
    title: "Names in capitals or all lower case",
    done: "names written the ordinary way",
    field: { full_name: "Name", first_name: "First name", last_name: "Last name" },
  },
  country: {
    title: "Countries written another way",
    done: "countries written one way",
    field: { country: "Country" },
  },
};
