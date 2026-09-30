import Link from "next/link";

import { updateCommitmentsAction } from "@/app/(portal)/privacy/actions";
import { ClockPill, RequestStatusPill } from "@/components/privacy/privacy-pills";
import { CommitmentsForm } from "@/components/privacy/privacy-forms";
import { Callout } from "@/components/ui/callout";
import { Card } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { HqApiRequestError, HqApiUnavailableError } from "@/lib/api/core";
import { readCompanyPrivacy, type CompanyPrivacy as Privacy } from "@/lib/api/privacy";
import { formatDate } from "@/lib/format";

const REQUEST_COLUMNS = [
  { key: "ref", label: "Reference" },
  { key: "kind", label: "Asked for" },
  { key: "who", label: "Who" },
  { key: "clock", label: "Clock" },
  { key: "status", label: "Status" },
];

const NOTICE_COLUMNS = [
  { key: "sub", label: "Sub-processor" },
  { key: "sent", label: "Told" },
  { key: "window", label: "May object until" },
  { key: "objection", label: "Objection" },
];

/**
 * A firm's privacy page: what their contract promises (recorded as it says it, with
 * departures from the standard named), requests from their people, and the sub-processor
 * notices they were sent.
 */
export async function CompanyPrivacy({
  token,
  companyId,
  canWrite,
}: {
  token: string;
  companyId: string;
  canWrite: boolean;
}) {
  let page: Privacy | null = null;
  try {
    page = await readCompanyPrivacy(token, companyId);
  } catch (error) {
    if (!(error instanceof HqApiUnavailableError || error instanceof HqApiRequestError))
      throw error;
  }
  if (page === null) {
    return (
      <Callout tone="danger" role="alert">
        Their privacy record could not be read just now.
      </Callout>
    );
  }
  const { commitments } = page;
  return (
    <div className="page-content">
      {!commitments.recorded ? (
        <Callout tone="attention" compact>
          Nothing recorded yet. Until it is, an incident or a new sub-processor is sent to them on
          the standard terms, and only if a privacy contact is known.
        </Callout>
      ) : commitments.flags.length > 0 ? (
        <Callout tone="attention" compact>
          <strong>Beyond the standard contract</strong>
          <ul className="gap-list">
            {commitments.flags.map((flag) => (
              <li key={flag}>{flag}</li>
            ))}
          </ul>
        </Callout>
      ) : null}
      <Card
        title="What their contract promises"
        titleAs="h3"
        description={
          commitments.updated_at
            ? `Last saved by ${commitments.updated_by || "HQ"}; reviewed ${formatDate(commitments.reviewed_on, "—")}.`
            : "As the signed contract and DPA say it."
        }
      >
        <CommitmentsForm
          action={updateCommitmentsAction}
          companyId={companyId}
          commitments={commitments}
          standard={page.standard}
          disabled={!canWrite}
        />
      </Card>
      <Card title="Requests from their people" titleAs="h3">
        <DataTable
          caption="Privacy requests linked to this firm"
          columns={REQUEST_COLUMNS}
          isEmpty={page.requests.length === 0}
          empty={<p className="muted">None.</p>}
          columnMenu={false}
        >
          {page.requests.map((row) => (
            <tr key={row.id}>
              <td className="mono nowrap">
                <Link href={`/privacy/requests/${row.id}`}>{row.reference}</Link>
              </td>
              <td>{row.kind_label}</td>
              <td>{row.requester_name || row.requester_email || "—"}</td>
              <td>
                <ClockPill clock={row.clock} complaint={row.kind === "complaint"} />
              </td>
              <td>
                <RequestStatusPill status={row.status} />
              </td>
            </tr>
          ))}
        </DataTable>
      </Card>
      <Card title="Sub-processor notices sent to them" titleAs="h3">
        <DataTable
          caption="Sub-processor change notices to this firm"
          columns={NOTICE_COLUMNS}
          isEmpty={page.notices.length === 0}
          empty={<p className="muted">None.</p>}
          columnMenu={false}
        >
          {page.notices.map((row) => (
            <tr key={row.subprocessor_id}>
              <td>
                <Link href={`/privacy/subprocessors/${row.subprocessor_id}`}>{row.legal_name}</Link>
              </td>
              <td>{formatDate(row.sent_on, "—")}</td>
              <td>{formatDate(row.objection_deadline, "—")}</td>
              <td>
                {row.objected_on
                  ? `Objected ${formatDate(row.objected_on)}${row.resolution ? ` · ${row.resolution}` : " · open"}`
                  : "None"}
              </td>
            </tr>
          ))}
        </DataTable>
      </Card>
    </div>
  );
}
