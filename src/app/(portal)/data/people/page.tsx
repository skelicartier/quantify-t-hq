import Link from "next/link";

import { DataUnavailable } from "@/components/data/data-down";
import { NEW_PERSON, PersonFields } from "@/components/data/people/person-fields";
import { NO_PEOPLE, PEOPLE_ABOUT, datesWords } from "@/components/data/people/people-words";
import { MailForm } from "@/components/mail/mail-form";
import { PageHeader } from "@/components/shell/page-header";
import { ButtonLink } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { DataTable } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { Popover } from "@/components/ui/popover";
import { StatusPill } from "@/components/ui/status-pill";
import { SegmentedLinks } from "@/components/ui/toolbar";
import { readPeople, type PeopleTabKey, type PersonRow } from "@/lib/data/api/people";
import { ENGAGEMENT_KINDS, PEOPLE_TABS, PERSON_STATES, shortDay } from "@/lib/data/labels-people";
import { notOwnerLine, requireDataOwner } from "@/lib/data/owner";
import { dataRead } from "@/lib/data/read";
import { formatNumber } from "@/lib/format";
import { firstSearchValue } from "@/lib/search-params";

import { addPersonAction } from "./actions";
import "./people.css";

export const metadata = { title: "People" };
export const dynamic = "force-dynamic";

const BASE = "/data/people";
const COLUMNS = [
  { key: "name", label: "Name" },
  { key: "dates", label: "Dates" },
  { key: "mentor", label: "Mentor" },
  { key: "letter", label: "Letter" },
  { key: "next", label: "Next" },
  { key: "access", label: "Access" },
];

type Params = Record<string, string | string[] | undefined>;

export default async function PeoplePage({ searchParams }: { searchParams: Promise<Params> }) {
  const { allowed, context } = await requireDataOwner(BASE);
  const parameters = await searchParams;
  const asked = firstSearchValue(parameters.state) ?? "";
  const tab: PeopleTabKey = asked in PEOPLE_TABS ? (asked as PeopleTabKey) : "all";
  // Nothing is read for anyone but the Owner.
  const read = allowed ? await dataRead(() => readPeople(tab)) : null;
  const data = read?.ok ? read.data : null;
  return (
    <>
      <PageHeader
        title="People"
        description={allowed ? PEOPLE_ABOUT : undefined}
        meta={
          data ? (
            <span className="quiet">{formatNumber(data.counts.engaged)} engaged</span>
          ) : undefined
        }
        actions={
          data ? (
            <>
              <Popover label="Add a person" variant="primary" width="wide" align="end">
                <MailForm
                  action={addPersonAction}
                  submitLabel="Add them"
                  pendingLabel="Adding…"
                  className="stack-form stack-form--tight hqdata-person-form"
                >
                  <PersonFields prefix="person-new" values={NEW_PERSON} />
                </MailForm>
              </Popover>
              <ButtonLink href={`${BASE}/stipends`} size="small">
                Download the stipends (CSV)
              </ButtonLink>
            </>
          ) : undefined
        }
      />
      <div className="page-content">
        {!allowed || !read ? (
          <Callout tone="neutral">{notOwnerLine(context)}</Callout>
        ) : !read.ok ? (
          <DataUnavailable failure={read} />
        ) : (
          <div className="hqdata-people">
            <SegmentedLinks
              label="Which people"
              items={(["engaged", "starting", "ended", "all"] as const).map((key) => ({
                href: key === "all" ? BASE : `${BASE}?state=${key}`,
                label: `${PEOPLE_TABS[key]} ${formatNumber(read.data.counts[key])}`,
                current: tab === key,
              }))}
            />
            <p className="hqdata-print-only">{PEOPLE_TABS[tab]}</p>
            <DataTable
              caption="People"
              columns={COLUMNS}
              columnMenu={false}
              isEmpty={read.data.people.length === 0}
              empty={
                read.data.counts.all > 0 ? (
                  <EmptyState compact title="No one here" description="Try All." />
                ) : (
                  <p className="page-note hqdata-people__empty">{NO_PEOPLE}</p>
                )
              }
            >
              {read.data.people.map((person) => (
                <PersonLine key={person.person_id} person={person} />
              ))}
            </DataTable>
          </div>
        )}
      </div>
    </>
  );
}

function PersonLine({ person }: { person: PersonRow }) {
  const state = PERSON_STATES[person.state];
  return (
    <tr id={`person-${person.person_id}`}>
      <td>
        <Link className="table-title" href={`${BASE}/${person.person_id}`}>
          {person.name}
        </Link>
        <span className="table-sub">
          {ENGAGEMENT_KINDS[person.kind]}
          {person.role_title ? ` · ${person.role_title}` : ""}
          {" · "}
          <StatusPill value={person.state} label={state.label} tone={state.tone} />
        </span>
      </td>
      <td className="nowrap">{datesWords(person.starts_on, person.ends_on)}</td>
      <td>{person.mentor || <span className="quiet">None named</span>}</td>
      <td>
        {person.letter === "signed" && person.letter_on ? (
          `Signed ${shortDay(person.letter_on)}`
        ) : (
          <StatusPill value="missing" label="Missing" tone="attention" />
        )}
      </td>
      <td>{person.next ? `${person.next.what} · ${shortDay(person.next.on)}` : "—"}</td>
      <td>
        {person.access.to_revoke > 0
          ? `${formatNumber(person.access.to_revoke)} to revoke`
          : `${formatNumber(person.access.held)} ${person.access.held === 1 ? "system" : "systems"}`}
      </td>
    </tr>
  );
}
