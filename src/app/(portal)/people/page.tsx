import Link from "next/link";

import { createPersonAction } from "@/app/(portal)/people/actions";
import { PersonCreateForm } from "@/components/crm/person-forms";
import { PageHeader } from "@/components/shell/page-header";
import { Callout } from "@/components/ui/callout";
import { DataTable } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { Popover } from "@/components/ui/popover";
import { StatusPill } from "@/components/ui/status-pill";
import { Timestamp } from "@/components/ui/timestamp";
import { hasCapability, requireStaff } from "@/lib/access/core";
import { HqApiRequestError, HqApiUnavailableError } from "@/lib/api/core";
import { readCompanies, readPeople } from "@/lib/api/crm";
import { requestNow } from "@/lib/request-time";
import { firstSearchValue } from "@/lib/search-params";

export const metadata = { title: "People" };
export const dynamic = "force-dynamic";

const COLUMNS = [
  { key: "person", label: "Person" },
  { key: "company", label: "Company" },
  { key: "title", label: "Title" },
  { key: "account", label: "Product account" },
  { key: "contacted", label: "Last contacted" },
];

type PeoplePageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function PeoplePage({ searchParams }: PeoplePageProps) {
  const context = await requireStaff("/people");
  const q = firstSearchValue((await searchParams).q) ?? "";
  const now = requestNow();

  let people: Awaited<ReturnType<typeof readPeople>>["people"] | null = null;
  try {
    people = (await readPeople(context.token, q)).people;
  } catch (error) {
    if (!(error instanceof HqApiUnavailableError || error instanceof HqApiRequestError))
      throw error;
  }
  const canWrite = hasCapability(context, "crm:write");
  let companyOptions: { company_id: string; name: string }[] = [];
  if (canWrite) {
    try {
      companyOptions = (await readCompanies(context.token)).companies.map((company) => ({
        company_id: company.company_id,
        name: company.name,
      }));
    } catch (error) {
      if (!(error instanceof HqApiUnavailableError || error instanceof HqApiRequestError))
        throw error;
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="CRM"
        title="People"
        description="One person per address. Leads become people when they are qualified."
        actions={
          canWrite ? (
            <Popover label="Add person" variant="primary">
              <PersonCreateForm action={createPersonAction} companies={companyOptions} />
            </Popover>
          ) : undefined
        }
      />
      {people === null ? (
        <Callout tone="danger" role="alert">
          People could not be read just now. This is a read failure, not an empty list.
        </Callout>
      ) : (
        <>
          <nav className="filter-strip" aria-label="People search">
            <span className="eyebrow">{people.length} on file</span>
            <form className="filter-strip__search" action="/people" role="search">
              <label className="sr-only" htmlFor="people-q">
                Search people
              </label>
              <input
                id="people-q"
                className="input input--small"
                name="q"
                defaultValue={q}
                placeholder="Name or email"
              />
            </form>
          </nav>
          <DataTable
            caption="People"
            columns={COLUMNS}
            isEmpty={people.length === 0}
            empty={
              <EmptyState
                title={q ? "Nothing matches" : "Nobody on file yet"}
                description={
                  q ? `No one matches “${q}”.` : "Qualify a lead or add a person by hand."
                }
              />
            }
          >
            {people.map((person) => (
              <tr key={person.person_id}>
                <td>
                  <Link className="table-title" href={`/people/${person.person_id}`}>
                    {person.full_name || person.email}
                  </Link>
                  <span className="table-sub">{person.email || "No email"}</span>
                </td>
                <td>
                  {person.company_id ? (
                    <Link href={`/companies/${person.company_id}`}>
                      {person.company_name || "Company"}
                    </Link>
                  ) : (
                    <span className="table-sub">None</span>
                  )}
                </td>
                <td>{person.title || <span className="table-sub">—</span>}</td>
                <td>
                  {person.account_user_id ? (
                    <StatusPill value="active" label="Linked" />
                  ) : (
                    <span className="table-sub">None</span>
                  )}
                </td>
                <td>
                  <Timestamp
                    value={person.last_contacted_at}
                    now={now}
                    mode="relative"
                    fallback="Never"
                  />
                </td>
              </tr>
            ))}
          </DataTable>
        </>
      )}
    </>
  );
}
