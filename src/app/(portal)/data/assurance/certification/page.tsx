import Link from "next/link";

import { DataUnavailable } from "@/components/data/data-down";
import { CertificationFields } from "@/components/data/assurance/assurance-fields";
import { AssuranceTabs } from "@/components/data/assurance/assurance-tabs";
import { CopyFields } from "@/components/data/meetings/copy-fields";
import { PracticeNote } from "@/components/data/security/control-ref";
import { MailForm } from "@/components/mail/mail-form";
import { PageHeader } from "@/components/shell/page-header";
import { Callout } from "@/components/ui/callout";
import { DataTable } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { Popover } from "@/components/ui/popover";
import { StatusPill } from "@/components/ui/status-pill";
import { DATA_ROLE_LINE, requireData } from "@/lib/data/access";
import { readCertifications, type CertificationsPage } from "@/lib/data/api/assurance";
import { dayWords } from "@/lib/data/labels-company";
import {
  CERTIFICATION_ABOUT,
  CERTIFICATION_EMPTY,
  CERT_STATUSES,
} from "@/lib/data/labels-assurance";
import { NOT_ADVICE } from "@/lib/data/labels-controls";
import { dataRead } from "@/lib/data/read";

import { addCertificationAction } from "../actions";
import "../assurance.css";

export const metadata = { title: "Certification" };
export const dynamic = "force-dynamic";

const BASE = "/data/assurance/certification";

/**
 * Assurance › Certification (ws-notes/security/spec.md §8.6): each certification (ISO 27001,
 * SOC 2, something else) with its body and who accredits it, its stage audits, the
 * certificate, when it expires and the next audit.
 */
export default async function CertificationPage() {
  const { allowed } = await requireData(BASE);
  const read = allowed ? await dataRead(readCertifications) : null;
  const data = read?.ok ? read.data : null;
  return (
    <>
      <PageHeader
        title="Certification"
        description={
          <>
            {CERTIFICATION_ABOUT} <PracticeNote practice="certificate_life" />{" "}
            <PracticeNote practice="surveillance" /> {NOT_ADVICE}
          </>
        }
        actions={
          data ? (
            <Popover label="Add a certification" variant="primary" align="end" width="wide">
              <MailForm
                action={addCertificationAction}
                submitLabel="Record it"
                pendingLabel="Recording…"
              >
                <CertificationFields
                  prefix="cert-new"
                  today={data.today}
                  values={{
                    standard: "iso27001",
                    name: "",
                    status: "planning",
                    body: "",
                    accredited_by: "",
                    accreditation_checked_on: null,
                    consultant: "",
                    scope: "",
                    stage1_on: null,
                    stage2_on: null,
                    certificate_number: "",
                    issued_on: null,
                    expires_on: null,
                    report: null,
                    notes: "",
                  }}
                />
                <CopyFields
                  prefix="cert-new"
                  label="The certificate"
                  files={data.files}
                  filesHere={data.files_here}
                  folder="Security › Certification"
                />
              </MailForm>
            </Popover>
          ) : undefined
        }
      />
      <div className="page-content">
        <AssuranceTabs current="certification" />
        {!allowed || !read ? (
          <Callout tone="neutral">{DATA_ROLE_LINE}</Callout>
        ) : !read.ok ? (
          <DataUnavailable failure={read} />
        ) : (
          <div className="hqdata-assurance">
            <Certifications page={read.data} />
            <p className="page-note">
              {CERTIFICATION_ABOUT} <PracticeNote practice="certificate_life" />{" "}
              <PracticeNote practice="surveillance" />
            </p>
            <p className="page-note">{NOT_ADVICE}</p>
          </div>
        )}
      </div>
    </>
  );
}

function Certifications({ page }: { page: CertificationsPage }) {
  return (
    <section data-section="certification-list">
      {page.certifications.length > 0 && (
        <div className="hqdata-assurance__links">
          <a className="text-link" href={`${BASE}/export`}>
            Download as CSV
          </a>
        </div>
      )}
      <DataTable
        caption="Certification"
        columns={[
          { key: "standard", label: "Standard" },
          { key: "status", label: "Status" },
          { key: "body", label: "Body" },
          { key: "accredited", label: "Accredited by" },
          { key: "stage1", label: "Stage 1" },
          { key: "stage2", label: "Stage 2" },
          { key: "certificate", label: "Certificate" },
          { key: "expires", label: "Expires" },
          { key: "next", label: "Next audit" },
        ]}
        columnMenu={false}
        scroll={false}
        isEmpty={page.certifications.length === 0}
        empty={<EmptyState compact title="No certification" description={CERTIFICATION_EMPTY} />}
      >
        {page.certifications.map((cert) => {
          const status = CERT_STATUSES[cert.status];
          return (
            <tr key={cert.cert_id} id={`cert-${cert.cert_id}`}>
              <td>
                <Link className="table-title" href={cert.href}>
                  {cert.standard_words}
                </Link>
                <span className="table-sub">{cert.words}</span>
              </td>
              <td>
                <StatusPill value={cert.status} label={status.label} tone={status.tone} />
              </td>
              <td>{cert.body || <span className="quiet">Not chosen</span>}</td>
              <td>{cert.accredited_by || <span className="quiet">—</span>}</td>
              <td className="nowrap">
                {cert.stage1_on ? dayWords(cert.stage1_on) : <span className="quiet">—</span>}
              </td>
              <td className="nowrap">
                {cert.stage2_on ? dayWords(cert.stage2_on) : <span className="quiet">—</span>}
              </td>
              <td className="mono">
                {cert.certificate_file ? (
                  <Link className="text-link" href={`/data/files/${cert.certificate_file.file_id}`}>
                    {cert.certificate_number || cert.certificate_file.title}
                  </Link>
                ) : (
                  cert.certificate_number || <span className="quiet">—</span>
                )}
              </td>
              <td className="nowrap">
                {cert.expiry ? (
                  <>
                    <span
                      className={cert.expiry < page.today ? "hqdata-assurance__late" : undefined}
                    >
                      {dayWords(cert.expiry)}
                    </span>
                    {!cert.expiry_typed && <span className="table-sub">36 months after issue</span>}
                  </>
                ) : (
                  <span className="quiet">—</span>
                )}
              </td>
              <td>
                {cert.next_audit ? (
                  <>
                    <span className="nowrap">{dayWords(cert.next_audit.on)}</span>
                    <span className="table-sub">{cert.next_audit.title}</span>
                  </>
                ) : (
                  <span className="quiet">None</span>
                )}
              </td>
            </tr>
          );
        })}
      </DataTable>
    </section>
  );
}
