import Link from "next/link";

import { LifecyclePill } from "@/components/crm/pills";
import { Callout } from "@/components/ui/callout";
import { Properties, Property } from "@/components/ui/record-shell";
import { Timestamp } from "@/components/ui/timestamp";
import { HqApiRequestError, HqApiUnavailableError } from "@/lib/api/core";
import { readCompany, readPerson } from "@/lib/api/crm";
import { readDeal } from "@/lib/api/deals";
import { nameFor } from "@/lib/api/staff";

type StaffDirectory = Parameters<typeof nameFor>[0];
import { formatDate, formatMrr, formatMrrBy } from "@/lib/format";

/**
 * A record's key facts beside its list, opened with `p` or a row's peek link and closed
 * with Escape or the ×. It reads the same record the full page would, so nothing here
 * is a second, staler copy; "Open" goes to the record itself.
 */

type PeekKind = "company" | "person" | "deal";

async function readFacts(
  kind: PeekKind,
  id: string,
  token: string,
  names: StaffDirectory | null,
  now: number,
) {
  if (kind === "company") {
    const detail = await readCompany(token, id);
    const { company } = detail;
    return {
      title: company.name,
      href: `/companies/${company.company_id}`,
      status: <LifecyclePill lifecycle={company.lifecycle} />,
      facts: [
        ["Domain", company.domain || "—"],
        ["Type", company.firm_type || "—"],
        ["Country", company.country || "—"],
        ["Owner", company.owner_staff_id ? nameFor(names, company.owner_staff_id) : "Unowned"],
        ["MRR", formatMrrBy(detail.mrr)],
        ["Open deals", String(detail.deals.filter((deal) => deal.status === "open").length)],
        ["People", String(detail.people.length)],
        [
          "Last activity",
          detail.activities[0] ? (
            <Timestamp key="last" value={detail.activities[0].at} now={now} mode="relative" />
          ) : (
            "None"
          ),
        ],
        ["Notes", company.notes || "—"],
      ] as const,
    };
  }
  if (kind === "person") {
    const detail = await readPerson(token, id);
    const { person } = detail;
    return {
      title: person.full_name || person.email || "Unnamed",
      href: `/people/${person.person_id}`,
      status: person.do_not_contact ? (
        <span className="tag tag--conflict">Do not contact</span>
      ) : null,
      facts: [
        ["Email", person.email || "—"],
        ["Title", person.title || "—"],
        [
          "Company",
          detail.company ? (
            <Link key="company" href={`/companies/${detail.company.company_id}`}>
              {detail.company.name}
            </Link>
          ) : (
            "—"
          ),
        ],
        ["Phone", person.phone || "—"],
        [
          "Last contacted",
          <Timestamp
            key="contacted"
            value={person.last_contacted_at}
            now={now}
            mode="relative"
            fallback="Never"
          />,
        ],
        ["Open tasks", String(detail.open_tasks.length)],
        ["Notes", person.notes || "—"],
      ] as const,
    };
  }
  const detail = await readDeal(token, id);
  const { deal } = detail;
  return {
    title: deal.name,
    href: `/deals/${deal.deal_id}`,
    status: <span className="tag">{deal.stage_label}</span>,
    facts: [
      [
        "Company",
        detail.company ? (
          <Link key="company" href={`/companies/${detail.company.company_id}`}>
            {detail.company.name}
          </Link>
        ) : (
          "—"
        ),
      ],
      ["Monthly value", deal.mrr_amount === null ? "—" : formatMrr(deal.mrr_amount, deal.currency)],
      ["Owner", deal.owner_staff_id ? nameFor(names, deal.owner_staff_id) : "Unowned"],
      ["Next step", deal.next_step || "None"],
      ["Next step due", deal.next_step_due ? formatDate(deal.next_step_due) : "—"],
      ["Expected close", deal.expected_close_date ? formatDate(deal.expected_close_date) : "—"],
      ["Days in stage", String(deal.days_in_stage)],
    ] as const,
  };
}

export async function PeekPane({
  kind,
  id,
  token,
  names,
  closeHref,
  now,
}: {
  kind: PeekKind;
  id: string;
  token: string;
  names: StaffDirectory | null;
  /** The list without the peek, for × and Escape. */
  closeHref: string;
  now: number;
}) {
  let facts: Awaited<ReturnType<typeof readFacts>> | null = null;
  let missing = false;
  try {
    facts = await readFacts(kind, id, token, names, now);
  } catch (error) {
    if (error instanceof HqApiRequestError && error.status === 404) missing = true;
    else if (!(error instanceof HqApiUnavailableError || error instanceof HqApiRequestError))
      throw error;
  }
  return (
    <aside className="peek" aria-label="Preview" data-peek-close={closeHref}>
      <div className="peek__head">
        <span className="eyebrow">Preview</span>
        <Link
          className="peek__close"
          href={closeHref}
          aria-label="Close the preview"
          data-peek-close-link=""
        >
          ×
        </Link>
      </div>
      {facts === null ? (
        <Callout tone={missing ? "neutral" : "danger"} compact>
          {missing ? "This record is no longer here." : "The record could not be read just now."}
        </Callout>
      ) : (
        <>
          <h2 className="peek__title">{facts.title}</h2>
          {facts.status && <div className="peek__status">{facts.status}</div>}
          <Properties title="At a glance">
            {facts.facts.map(([label, value]) => (
              <Property key={label} label={label}>
                {value}
              </Property>
            ))}
          </Properties>
          <Link className="btn btn--small btn--primary" href={facts.href}>
            Open
          </Link>
        </>
      )}
    </aside>
  );
}
