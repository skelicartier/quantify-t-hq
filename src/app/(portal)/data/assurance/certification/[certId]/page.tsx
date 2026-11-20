import Link from "next/link";
import { notFound } from "next/navigation";

import { DataUnavailable } from "@/components/data/data-down";
import { CertificationFields } from "@/components/data/assurance/assurance-fields";
import { AssuranceTabs } from "@/components/data/assurance/assurance-tabs";
import { CopyFields } from "@/components/data/meetings/copy-fields";
import { PracticeNote } from "@/components/data/security/control-ref";
import { MailForm } from "@/components/mail/mail-form";
import { PageHeader } from "@/components/shell/page-header";
import { Callout } from "@/components/ui/callout";
import { DataTable } from "@/components/ui/data-table";
import { Field, Input, Textarea } from "@/components/ui/field";
import { Popover } from "@/components/ui/popover";
import {
  Properties,
  Property,
  RecordGrid,
  RecordHeader,
  RecordSection,
} from "@/components/ui/record-shell";
import { StatusPill } from "@/components/ui/status-pill";
import { Timestamp } from "@/components/ui/timestamp";
import { DATA_ROLE_LINE, requireData } from "@/lib/data/access";
import { readCertification, type CertificationPage } from "@/lib/data/api/assurance";
import { dayWords } from "@/lib/data/labels-company";
import { CERT_STATUSES, SOC2_REPORTS } from "@/lib/data/labels-assurance";
import { NOT_ADVICE } from "@/lib/data/labels-controls";
import { dataRead } from "@/lib/data/read";
import { requestNow } from "@/lib/request-time";

import { surveillanceAction, updateCertificationAction } from "../../actions";
import "../../assurance.css";

export const metadata = { title: "Certification" };
export const dynamic = "force-dynamic";

const BASE = "/data/assurance/certification";
const ID = /^[A-Za-z0-9-]{1,64}$/;

export default async function CertificationRecordPage({
  params,
}: {
  params: Promise<{ certId: string }>;
}) {
  const { certId } = await params;
  const { allowed } = await requireData(`${BASE}/${certId}`);
  if (!ID.test(certId)) notFound();
  const now = requestNow();
  const read = allowed ? await dataRead(() => readCertification(certId)) : null;
  if (!allowed || !read || !read.ok)
    return (
      <>
        <PageHeader title="Certification" />
        <div className="page-content">
          {!allowed || !read ? (
            <Callout tone="neutral">{DATA_ROLE_LINE}</Callout>
          ) : (
            !read.ok && <DataUnavailable failure={read} />
          )}
        </div>
      </>
    );
  return <CertificationRecord page={read.data} now={now} />;
}

function CertificationRecord({ page, now }: { page: CertificationPage; now: number }) {
  const cert = page.certification;
  const status = CERT_STATUSES[cert.status];
  const fields = { cert_id: cert.cert_id };
  const audits = [
    { key: "stage1", title: "Stage 1 audit", on: cert.stage1_on, held: null as string | null },
    { key: "stage2", title: "Stage 2 audit", on: cert.stage2_on, held: null as string | null },
    ...([1, 2] as const).map((n) => {
      const typed = cert.surveillance.find((item) => item.n === n);
      const worked = cert.days.find((day) => day.key === (n === 1 ? "s1" : "s2"));
      return {
        key: `s${n}`,
        title: `Surveillance audit ${n}`,
        on: typed?.due_on ?? worked?.on ?? null,
        held: typed?.held_on ?? null,
      };
    }),
  ];
  return (
    <>
      <RecordHeader
        crumbs={[
          { href: "/data/assurance", label: "Assurance" },
          { href: BASE, label: "Certification" },
        ]}
        title={cert.standard_words}
        status={<StatusPill value={cert.status} label={status.label} tone={status.tone} />}
        readouts={[
          { label: "Body", value: cert.body || "Not chosen" },
          { label: "Expires", value: cert.expiry ? dayWords(cert.expiry) : "Not worked out" },
          { label: "Next audit", value: cert.next_audit ? dayWords(cert.next_audit.on) : "None" },
        ]}
        actions={
          <Popover label="Edit" align="start" width="wide">
            <MailForm
              action={updateCertificationAction}
              fields={fields}
              submitLabel="Save"
              pendingLabel="Saving…"
            >
              <CertificationFields prefix="cert-edit" today={page.today} values={cert} />
              <CopyFields
                prefix="cert-edit"
                label="The certificate"
                files={page.files}
                filesHere={page.files_here}
                folder="Security › Certification"
              />
            </MailForm>
          </Popover>
        }
      />
      <RecordGrid side={<Side page={page} />}>
        <AssuranceTabs current="certification" />
        <div className="hqdata-assurance">
          <RecordSection id="cert-audits" title="Audits">
            <p>{cert.words}</p>
            <p>
              <PracticeNote practice="surveillance" /> <PracticeNote practice="certificate_life" />
            </p>
            <DataTable
              caption="Audits"
              columns={[
                { key: "audit", label: "Audit", width: "30%" },
                { key: "on", label: "Due" },
                { key: "held", label: "Held" },
                { key: "record", label: <span className="sr-only">Record</span> },
              ]}
              columnMenu={false}
              scroll={false}
            >
              {audits.map((audit) => (
                <tr key={audit.key} id={`audit-${audit.key}`}>
                  <td>{audit.title}</td>
                  <td className="nowrap">
                    {audit.on ? dayWords(audit.on) : <span className="quiet">—</span>}
                  </td>
                  <td className="nowrap">
                    {audit.held ? dayWords(audit.held) : <span className="quiet">Not yet</span>}
                  </td>
                  <td>
                    {(audit.key === "s1" || audit.key === "s2") && (
                      <Popover label="Record it" align="end" width="wide">
                        <MailForm
                          action={surveillanceAction}
                          fields={{ ...fields, n: audit.key === "s1" ? "1" : "2" }}
                          submitLabel="Save"
                          pendingLabel="Saving…"
                        >
                          <div className="hqdata-assurance__pair">
                            <Field id={`${audit.key}-due`} label="Due, as the body set it">
                              <Input
                                id={`${audit.key}-due`}
                                name="due_on"
                                type="date"
                                defaultValue={audit.on ?? ""}
                              />
                            </Field>
                            <Field id={`${audit.key}-held`} label="Held on">
                              <Input
                                id={`${audit.key}-held`}
                                name="held_on"
                                type="date"
                                max={page.today}
                                defaultValue={audit.held ?? ""}
                              />
                            </Field>
                          </div>
                          <Field id={`${audit.key}-outcome`} label="Outcome">
                            <Textarea
                              id={`${audit.key}-outcome`}
                              name="outcome"
                              rows={2}
                              maxLength={1000}
                            />
                          </Field>
                          <CopyFields
                            prefix={audit.key}
                            label="The audit report"
                            files={page.files}
                            filesHere={page.files_here}
                            folder="Security › Certification"
                          />
                        </MailForm>
                      </Popover>
                    )}
                  </td>
                </tr>
              ))}
            </DataTable>
          </RecordSection>
          <RecordSection id="cert-scope" title="Scope">
            <p className="hqdata-assurance__prose">{cert.scope || "Not recorded."}</p>
          </RecordSection>
          <RecordSection id="cert-activity" title="Activity">
            {page.events.length === 0 ? (
              <p className="timeline-empty">Nothing has happened yet.</p>
            ) : (
              <ol className="timeline">
                {page.events.map((event) => (
                  <li key={event.event_id} className="timeline__item">
                    <span className="timeline__kind">
                      {event.verb.charAt(0).toUpperCase() + event.verb.slice(1)}
                    </span>
                    <div>
                      <p className="timeline__meta">
                        <span className="timeline__actor">{event.by.name}</span>
                        <Timestamp value={event.at} now={now} mode="relative" />
                      </p>
                      {event.detail && <p className="timeline__body">{event.detail}</p>}
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </RecordSection>
          <p className="page-note">{NOT_ADVICE}</p>
        </div>
      </RecordGrid>
    </>
  );
}

function Side({ page }: { page: CertificationPage }) {
  const cert = page.certification;
  return (
    <Properties title="The certification">
      <Property label="Standard">{cert.standard_words}</Property>
      <Property label="Body">{cert.body || "Not chosen"}</Property>
      <Property label="Accredited by">
        {cert.accredited_by || "Not recorded"}
        {cert.accreditation_checked_on
          ? `, checked ${dayWords(cert.accreditation_checked_on)}`
          : ""}
      </Property>
      <Property label="Consultant">{cert.consultant || "None"}</Property>
      <Property label="Certificate" mono>
        {cert.certificate_number || "Not issued"}
      </Property>
      <Property label="Issued">{cert.issued_on ? dayWords(cert.issued_on) : "Not yet"}</Property>
      <Property label="File">
        {cert.certificate_file ? (
          <Link className="text-link" href={`/data/files/${cert.certificate_file.file_id}`}>
            {cert.certificate_file.title}
          </Link>
        ) : (
          "None attached"
        )}
      </Property>
      {cert.report && (
        <Property label="SOC 2 report">
          {SOC2_REPORTS[cert.report.kind]}
          {cert.report.from ? `, ${dayWords(cert.report.from)} to ${dayWords(cert.report.to)}` : ""}
        </Property>
      )}
      <Property label="Notes">{cert.notes || "None"}</Property>
    </Properties>
  );
}
