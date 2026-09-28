import Link from "next/link";
import { notFound } from "next/navigation";

import {
  checklistStepAction,
  grantAccessAction,
  revokeAccessAction,
  saveDocumentAction,
  startChecklistAction,
} from "@/app/(portal)/team/actions";
import { confirmSudoAction } from "@/app/(portal)/admin/actions";
import { SudoGate } from "@/components/admin/sudo-gate";
import { PageHeader } from "@/components/shell/page-header";
import {
  DocumentForm,
  GrantAccessForm,
  RevokeAccessForm,
  StartChecklistForm,
} from "@/components/team/team-forms";
import { Callout } from "@/components/ui/callout";
import { Card } from "@/components/ui/card";
import { KeyValue, KeyValueRow } from "@/components/ui/key-value";
import { Popover } from "@/components/ui/popover";
import { RowAction } from "@/components/ui/row-action";
import { StatusPill } from "@/components/ui/status-pill";
import { Timestamp } from "@/components/ui/timestamp";
import { hasCapability, requireStaff } from "@/lib/access/core";
import { kindLabel, roleLabel } from "@/lib/access/role-labels";
import { HqApiRequestError } from "@/lib/api/core";
import { readTeamMember, type TeamMember } from "@/lib/api/team";
import { formatAbsolute, formatDate } from "@/lib/format";
import { DOCUMENT_LABELS } from "@/lib/team/vocabulary";
import { requestNow } from "@/lib/request-time";

export const metadata = { title: "Team member" };
export const dynamic = "force-dynamic";

const MOOD_WORDS = ["", "Rough", "Meh", "Steady", "Good", "Great"];

type TeamMemberPageProps = { params: Promise<{ staffId: string }> };

export default async function TeamMemberPage({ params }: TeamMemberPageProps) {
  const { staffId } = await params;
  const context = await requireStaff(`/team/${staffId}`);
  if (!hasCapability(context, "hr:read")) {
    return (
      <>
        <PageHeader eyebrow="Team" title="Team member" />
        <Callout tone="neutral">Team records are kept by HQ admins.</Callout>
      </>
    );
  }
  const now = requestNow();
  let record: TeamMember;
  try {
    record = await readTeamMember(context.token, staffId);
  } catch (error) {
    if (error instanceof HqApiRequestError && error.status === 404) notFound();
    throw error;
  }
  const { person, documents, access, checklists, checkins, time_off: leave, certificates } = record;
  const canWrite = hasCapability(context, "hr:write");
  const openKinds = ["onboarding", "offboarding"].filter(
    (kind) => !checklists.some((run) => run.kind === kind && !run.completed_at),
  );
  const required = ["nda", "ip_assignment"] as const;

  return (
    <>
      <PageHeader
        eyebrow="Team"
        title={person.display_name || person.email}
        breadcrumbs={[{ label: "Team", href: "/team" }]}
        description={`${roleLabel(person.role)} · ${kindLabel(person.kind)}${person.starts_on ? ` · since ${formatDate(person.starts_on)}` : ""}${person.ends_on ? ` · until ${formatDate(person.ends_on)}` : ""}`}
        meta={
          <>
            {!person.is_active && <StatusPill value="inactive" label="Not active" />}
            {record.documents_ok ? (
              <StatusPill value="signed" label="Documents in" tone="live" />
            ) : (
              <StatusPill value="missing" label="Documents missing" tone="danger" />
            )}
          </>
        }
        actions={
          hasCapability(context, "hq:admin") ? (
            <Link className="btn btn--small" href={`/admin/staff/${person.staff_id}`}>
              Role and sign-in
            </Link>
          ) : undefined
        }
      />
      {!record.documents_ok && (
        <Callout tone="danger" title="Documents before access">
          Their NDA and IP assignment must both be signed or waived before any system access is
          recorded. Record them below.
        </Callout>
      )}
      {canWrite && (
        <SudoGate
          action={confirmSudoAction}
          fresh={context.me.sudo_fresh}
          untilLabel={
            context.me.sudo_until
              ? (formatAbsolute(context.me.sudo_until).split(", ")[1] ?? null)
              : null
          }
          returnPath={`/team/${person.staff_id}`}
          purpose="Recording documents and system access needs a fresh code from your authenticator app."
        />
      )}
      <div className="record-layout">
        <div className="record-layout__main">
          <section className="record-section" aria-labelledby="team-docs">
            <div className="record-section__head">
              <h2 className="record-section__title" id="team-docs">
                Documents
              </h2>
              {canWrite && (
                <Popover label="Record a document" width="wide">
                  <DocumentForm action={saveDocumentAction} staffId={person.staff_id} />
                </Popover>
              )}
            </div>
            <ul className="doc-list">
              {required.map((kind) => {
                const status = record.documents_state[kind];
                const onFile = documents.find((document) => document.kind === kind);
                return (
                  <li key={kind} className={`doc doc--${status}`}>
                    <div className="doc__main">
                      <span className="doc__kind">{DOCUMENT_LABELS[kind]}</span>
                      <span className="doc__meta">
                        {status === "signed"
                          ? `Signed ${formatDate(onFile?.signed_on)}`
                          : status === "waived"
                            ? "Waived"
                            : status === "requested"
                              ? "Requested, not signed"
                              : "Not on file"}
                        {onFile?.reference && ` · ${onFile.reference}`}
                      </span>
                    </div>
                    {canWrite && onFile && status === "requested" && (
                      <Popover label="Mark signed" width="wide">
                        <DocumentForm
                          action={saveDocumentAction}
                          staffId={person.staff_id}
                          existing={onFile}
                        />
                      </Popover>
                    )}
                  </li>
                );
              })}
              {documents
                .filter((document) => !(required as readonly string[]).includes(document.kind))
                .map((document) => (
                  <li key={document.document_id} className={`doc doc--${document.status}`}>
                    <div className="doc__main">
                      <span className="doc__kind">
                        {document.title || DOCUMENT_LABELS[document.kind]}
                      </span>
                      <span className="doc__meta">
                        {document.status === "signed"
                          ? `Signed ${formatDate(document.signed_on)}`
                          : document.status}
                        {document.reference && ` · ${document.reference}`}
                      </span>
                    </div>
                  </li>
                ))}
            </ul>
          </section>

          <section className="record-section" aria-labelledby="team-access">
            <div className="record-section__head">
              <h2 className="record-section__title" id="team-access">
                Access register
              </h2>
              {canWrite && person.is_active && (
                <Popover label="Record access" width="wide">
                  <GrantAccessForm
                    action={grantAccessAction}
                    staffId={person.staff_id}
                    documentsOk={record.documents_ok}
                  />
                </Popover>
              )}
            </div>
            {access.length === 0 ? (
              <p className="timeline-empty">No system access recorded.</p>
            ) : (
              <ul className="access-list">
                {access.map((grant) => (
                  <li
                    key={grant.access_id}
                    className={grant.live ? "access" : "access access--gone"}
                  >
                    <div className="access__main">
                      <span className="access__system">{grant.system}</span>
                      <span className="access__meta">
                        {grant.level || "Access"} · since {formatDate(grant.granted_on)}
                        {grant.revoked_on
                          ? ` · revoked ${formatDate(grant.revoked_on)}`
                          : grant.expires_on
                            ? ` · expires ${formatDate(grant.expires_on)}`
                            : " · no end date"}
                      </span>
                    </div>
                    {grant.expiring_soon && <span className="due due--today">Expiring</span>}
                    {canWrite && grant.live && (
                      <RevokeAccessForm
                        action={revokeAccessAction}
                        staffId={person.staff_id}
                        accessId={grant.access_id}
                        system={grant.system}
                      />
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="record-section" aria-labelledby="team-checkins">
            <h2 className="record-section__title" id="team-checkins">
              Check-ins
            </h2>
            {checkins.length === 0 ? (
              <p className="timeline-empty">No check-ins yet.</p>
            ) : (
              <ol className="checkin-list">
                {checkins.map((checkin) => (
                  <li key={checkin.week} className="checkin">
                    <p className="checkin__head">
                      <span className="mono">{checkin.week}</span>
                      <span className={`mood mood--${checkin.mood}`}>
                        {MOOD_WORDS[checkin.mood]}
                      </span>
                    </p>
                    {checkin.wins && (
                      <p className="checkin__line">
                        <strong>Went well</strong> {checkin.wins}
                      </p>
                    )}
                    {checkin.priorities && (
                      <p className="checkin__line">
                        <strong>Next</strong> {checkin.priorities}
                      </p>
                    )}
                    {checkin.blockers && (
                      <p className="checkin__line checkin__line--blocker">
                        <strong>Blocked</strong> {checkin.blockers}
                      </p>
                    )}
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>
        <aside className="record-layout__side">
          <Card title="Checklists" titleAs="h3">
            {checklists.length === 0 && (
              <p className="side-quiet">No onboarding or offboarding started.</p>
            )}
            {checklists.map((run) => (
              <div key={run.run_id} className="checklist">
                <p className="checklist__head">
                  <strong>{run.kind === "offboarding" ? "Offboarding" : "Onboarding"}</strong>
                  <span className="side-quiet">
                    {run.done}/{run.total}
                    {run.completed_at ? " · done" : ""}
                  </span>
                </p>
                {run.due_at && !run.completed_at && (
                  <p className={run.overdue ? "due due--overdue" : "due due--today"}>
                    Access removal due <Timestamp value={run.due_at} now={now} mode="relative" />
                  </p>
                )}
                <ul className="checklist__steps">
                  {run.steps.map((step) => (
                    <li key={step.position} className={step.done_at ? "task task--done" : "task"}>
                      {canWrite && !run.completed_at ? (
                        <RowAction
                          action={checklistStepAction}
                          className="task__check-form"
                          fields={{
                            staff_id: person.staff_id,
                            run_id: run.run_id,
                            position: String(step.position),
                            done: step.done_at ? "false" : "true",
                          }}
                          buttons={[
                            {
                              label: "",
                              className: "task__check",
                              ariaPressed: Boolean(step.done_at),
                              ariaLabel: step.done_at
                                ? `Undo: ${step.title}`
                                : `Done: ${step.title}`,
                            },
                          ]}
                        />
                      ) : (
                        <span className="task__check task__check--static" aria-hidden="true" />
                      )}
                      <div className="task__main">
                        <p className="task__title">{step.title}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
            {canWrite && (
              <StartChecklistForm
                action={startChecklistAction}
                staffId={person.staff_id}
                kinds={openKinds}
              />
            )}
          </Card>
          <Card title="Time off" titleAs="h3">
            {leave.length === 0 ? (
              <p className="side-quiet">None requested.</p>
            ) : (
              <ul className="side-list">
                {leave.map((request) => (
                  <li key={request.request_id} className="renewal">
                    <span>
                      {formatDate(request.starts_on)}–{formatDate(request.ends_on)} · {request.kind}
                    </span>
                    <span className="side-quiet">{request.status}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card title="Details" titleAs="h3">
            <KeyValue>
              <KeyValueRow label="Work email" mono>
                {person.email}
              </KeyValueRow>
              <KeyValueRow label="Personal email" mono>
                {person.personal_email || "—"}
              </KeyValueRow>
              {certificates.length > 0 && (
                <KeyValueRow label="Certificates">
                  {certificates.map((certificate) => (
                    <Link
                      key={certificate.serial}
                      className="mono"
                      href={`/verify/${certificate.serial}`}
                    >
                      {certificate.serial}
                    </Link>
                  ))}
                </KeyValueRow>
              )}
            </KeyValue>
          </Card>
        </aside>
      </div>
    </>
  );
}
