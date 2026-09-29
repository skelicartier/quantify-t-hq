import "server-only";

import { HqApiRequestError, HqApiUnavailableError } from "@/lib/api/core";
import { readCompanies, readLeads, readPeople } from "@/lib/api/crm";

export type PickOption = { id: string; name: string; sub: string };

async function orEmpty<T>(read: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await read();
  } catch (error) {
    if (error instanceof HqApiUnavailableError || error instanceof HqApiRequestError)
      return fallback;
    throw error;
  }
}

/** Every company, person and lead as a pick-list row: the audience picker's choices. */
export async function audienceOptions(token: string): Promise<{
  companies: PickOption[];
  people: PickOption[];
  leads: PickOption[];
}> {
  const [companies, people, leads] = await Promise.all([
    orEmpty(async () => (await readCompanies(token)).companies, []),
    orEmpty(async () => (await readPeople(token)).people, []),
    orEmpty(async () => (await readLeads(token)).leads, []),
  ]);
  return {
    companies: companies.map((row) => ({
      id: row.company_id,
      name: row.name,
      sub: [row.domain, `${row.people_count} ${row.people_count === 1 ? "person" : "people"}`]
        .filter(Boolean)
        .join(" · "),
    })),
    people: people
      .filter((row) => row.email)
      .map((row) => ({
        id: row.person_id,
        name: row.full_name,
        sub: [row.email, (row as { company_name?: string }).company_name]
          .filter(Boolean)
          .join(" · "),
      })),
    leads: leads
      .filter((row) => row.email && !row.anonymised_at)
      .map((row) => ({
        id: row.lead_id,
        name: row.full_name,
        sub: [row.email, row.company_name, row.stage].filter(Boolean).join(" · "),
      })),
  };
}
