import Link from "next/link";

import { DueChip } from "@/components/crm/pills";
import { CompanyTabs } from "@/components/data/company/company-tabs";
import { DirectorFields, NEW_DIRECTOR } from "@/components/data/company/director-fields";
import { DataUnavailable } from "@/components/data/data-down";
import { MailForm } from "@/components/mail/mail-form";
import { PageHeader } from "@/components/shell/page-header";
import { Callout } from "@/components/ui/callout";
import { DataTable } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { Popover } from "@/components/ui/popover";
import { DATA_ROLE_LINE, requireData } from "@/lib/data/access";
import { readDirectors, type DirectorRow, type DirectorsPage } from "@/lib/data/api/company";
import { DESIGNATIONS, NOT_ADVICE } from "@/lib/data/labels-company";
import { dataRead } from "@/lib/data/read";
import { formatDate, formatNumber } from "@/lib/format";

import { addDirectorAction } from "../actions";
import "../company.css";

export const metadata = { title: "Directors" };
export const dynamic = "force-dynamic";

const BASE = "/data/company/directors";
const ABOUT =
  "The company's directors, with their DIN, their signing certificate (DSC) and their director KYC. A change to a director's email, mobile or address on the MCA record is filed within 30 days. This is a record to keep, not legal advice.";

const COLUMNS = [
  { key: "name", label: "Name", width: "24%" },
  { key: "din", label: "DIN" },
  { key: "appointed", label: "Appointed" },
  { key: "dsc", label: "DSC expires" },
  { key: "kyc", label: "Next DIR-3 KYC" },
  { key: "changes", label: "Contact changes to file" },
];

const FORMER_COLUMNS = [
  { key: "name", label: "Name", width: "30%" },
  { key: "din", label: "DIN" },
  { key: "appointed", label: "Appointed" },
  { key: "ceased", label: "Ceased" },
];

/**
 * Company › Directors (company spec §6.7.3): the directors in office, with their DIN, DSC,
 * next DIR-3 KYC and contact changes still to file; and, when any, the former ones, who
 * stay listed with the day they ceased.
 */
export default async function DirectorsPage() {
  const { allowed } = await requireData(BASE);
  const read = allowed ? await dataRead(() => readDirectors(true)) : null;
  const data = read?.ok ? read.data : null;
  return (
    <>
      <PageHeader
        title="Directors"
        description={ABOUT}
        meta={
          data ? (
            <span className="quiet">{formatNumber(data.counts.in_office)} in office</span>
          ) : undefined
        }
        actions={
          data ? (
            <Popover label="Add a director" variant="primary" align="end" width="wide">
              <MailForm
                action={addDirectorAction}
                submitLabel="Add the director"
                pendingLabel="Adding…"
              >
                <DirectorFields
                  prefix="director-new"
                  values={NEW_DIRECTOR}
                  today={data.today}
                  adding
                />
              </MailForm>
            </Popover>
          ) : undefined
        }
      />
      <div className="page-content">
        {!allowed || !read ? (
          <Callout tone="neutral">{DATA_ROLE_LINE}</Callout>
        ) : !read.ok ? (
          <DataUnavailable failure={read} />
        ) : (
          <Directors page={read.data} />
        )}
      </div>
    </>
  );
}

function din(value: string) {
  return value ? (
    <span className="mono">{value}</span>
  ) : (
    <span className="quiet">Not allotted yet</span>
  );
}

function DirectorLink({ director }: { director: DirectorRow }) {
  return (
    <Link className="table-title" href={`${BASE}/${director.director_id}`}>
      {director.name}
    </Link>
  );
}

function Directors({ page }: { page: DirectorsPage }) {
  const current = page.directors.filter((director) => !director.ceased_on);
  const former = page.directors.filter((director) => director.ceased_on);
  return (
    <div className="hqdata-directors">
      <CompanyTabs current="directors" />
      <DataTable
        caption="Directors"
        columns={COLUMNS}
        columnMenu={false}
        isEmpty={current.length === 0}
        empty={
          <EmptyState
            title="No directors recorded yet"
            description="Add each director with their DIN; their DSC and KYC dates follow."
          />
        }
      >
        {current.map((director) => (
          <tr key={director.director_id}>
            <td>
              <DirectorLink director={director} />
              <span className="table-sub">
                {DESIGNATIONS[director.designation]}
                {director.is_founder ? " · Founder" : ""}
              </span>
            </td>
            <td>{din(director.din)}</td>
            <td className="nowrap">
              {director.appointed_on ? formatDate(director.appointed_on) : "Not known"}
            </td>
            <td className="nowrap">
              {!director.dsc.expires_on ? (
                <span className="quiet">Not recorded</span>
              ) : director.dsc_soon ? (
                <DueChip due={director.dsc.expires_on} today={page.today} />
              ) : (
                formatDate(director.dsc.expires_on)
              )}
            </td>
            <td className="nowrap">
              {director.next_kyc?.due_on ? formatDate(director.next_kyc.due_on) : "Ask your CS"}
            </td>
            <td>
              {director.changes_to_file.count === 0
                ? "None"
                : `${formatNumber(director.changes_to_file.count)} to file by ${formatDate(
                    director.changes_to_file.first_by,
                  )}`}
            </td>
          </tr>
        ))}
      </DataTable>
      {former.length > 0 && (
        <DataTable caption="Former directors" columns={FORMER_COLUMNS} columnMenu={false}>
          {former.map((director) => (
            <tr key={director.director_id}>
              <td>
                <DirectorLink director={director} />
              </td>
              <td>{din(director.din)}</td>
              <td className="nowrap">
                {director.appointed_on ? formatDate(director.appointed_on) : "Not known"}
              </td>
              <td className="nowrap">{formatDate(director.ceased_on)}</td>
            </tr>
          ))}
        </DataTable>
      )}
      <p className="page-note">{NOT_ADVICE}</p>
    </div>
  );
}
