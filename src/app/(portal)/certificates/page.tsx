import Link from "next/link";

import { confirmSudoAction } from "@/app/(portal)/admin/actions";
import { issueCertificateAction, revokeCertificateAction } from "@/app/(portal)/team/actions";
import { SudoGate } from "@/components/admin/sudo-gate";
import { PageHeader } from "@/components/shell/page-header";
import { IssueCertificateForm, RevokeCertificateForm } from "@/components/team/team-forms";
import { Callout } from "@/components/ui/callout";
import { Card } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusPill } from "@/components/ui/status-pill";
import { hasCapability, requireStaff } from "@/lib/access/core";
import { HqApiRequestError, HqApiUnavailableError } from "@/lib/api/core";
import { listStaff } from "@/lib/api/staff";
import { readCertificates, type Certificate } from "@/lib/api/team";
import { isoDay } from "@/lib/crm/dates";
import { formatAbsolute, formatDate } from "@/lib/format";
import { requestNow } from "@/lib/request-time";

export const metadata = { title: "Certificates" };
export const dynamic = "force-dynamic";

const COLUMNS = [
  { key: "serial", label: "Serial" },
  { key: "who", label: "Awarded to" },
  { key: "period", label: "Period" },
  { key: "state", label: "State" },
  { key: "revoke", label: "Revoke" },
];

export default async function CertificatesPage() {
  const context = await requireStaff("/certificates");
  if (!hasCapability(context, "certificates:issue")) {
    return (
      <>
        <PageHeader eyebrow="Team" title="Certificates" />
        <Callout tone="neutral">Certificates are issued by HQ admins.</Callout>
      </>
    );
  }
  const today = isoDay(requestNow());
  let certificates: Certificate[] | null = null;
  try {
    certificates = (await readCertificates(context.token)).certificates;
  } catch (error) {
    if (!(error instanceof HqApiUnavailableError || error instanceof HqApiRequestError))
      throw error;
  }
  let people: { staff_id: string; name: string; starts_on: string; ends_on: string }[] = [];
  try {
    people = (await listStaff(context.token)).staff
      .filter((member) => member.kind === "intern" || member.kind === "contractor")
      .map((member) => ({
        staff_id: member.staff_id,
        name: member.display_name || member.email,
        starts_on: member.starts_on?.slice(0, 10) ?? "",
        ends_on: member.ends_on?.slice(0, 10) ?? "",
      }));
  } catch (error) {
    if (!(error instanceof HqApiUnavailableError || error instanceof HqApiRequestError))
      throw error;
  }
  const fresh = context.me.sudo_fresh;
  const untilLabel = context.me.sudo_until
    ? (formatAbsolute(context.me.sudo_until).split(", ")[1] ?? null)
    : null;

  return (
    <>
      <PageHeader
        eyebrow="Team"
        title="Certificates"
        description="Certificates for time served here. Each serial can be checked by anyone at its public page, and a revocation shows there too."
      />
      <SudoGate
        action={confirmSudoAction}
        fresh={fresh}
        untilLabel={untilLabel}
        returnPath="/certificates"
        purpose="Issuing and revoking certificates needs a fresh code from your authenticator app."
      />
      <div className="record-layout">
        <div className="record-layout__main">
          {certificates === null ? (
            <Callout tone="danger" role="alert">
              Certificates could not be read just now.
            </Callout>
          ) : (
            <DataTable
              caption="Certificates"
              columns={COLUMNS}
              scroll={false}
              isEmpty={certificates.length === 0}
              empty={
                <EmptyState
                  title="None issued yet"
                  description="Issue the first when an internship ends."
                />
              }
            >
              {certificates.map((certificate) => (
                <tr
                  key={certificate.serial}
                  className={certificate.revoked ? "row--muted" : undefined}
                >
                  <td>
                    <Link className="mono" href={`/verify/${certificate.serial}`}>
                      {certificate.serial}
                    </Link>
                    <span className="table-sub">Issued {formatDate(certificate.issued_on)}</span>
                  </td>
                  <td>
                    <span className="table-title">{certificate.recipient_name}</span>
                    <span className="table-sub">{certificate.title}</span>
                  </td>
                  <td>
                    {formatDate(certificate.starts_on)} to {formatDate(certificate.ends_on)}
                  </td>
                  <td>
                    {certificate.revoked ? (
                      <StatusPill value="revoked" label="Revoked" />
                    ) : (
                      <StatusPill value="valid" label="Valid" tone="live" />
                    )}
                  </td>
                  <td>
                    {certificate.revoked ? (
                      <span className="table-sub">{certificate.revoke_reason}</span>
                    ) : (
                      <RevokeCertificateForm
                        action={revokeCertificateAction}
                        serial={certificate.serial}
                        disabled={!fresh}
                      />
                    )}
                  </td>
                </tr>
              ))}
            </DataTable>
          )}
        </div>
        <aside className="record-layout__side">
          <Card title="Issue a certificate" titleAs="h3">
            <IssueCertificateForm
              action={issueCertificateAction}
              people={people}
              today={today}
              disabled={!fresh}
            />
          </Card>
        </aside>
      </div>
    </>
  );
}
