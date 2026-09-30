import Link from "next/link";
import { notFound } from "next/navigation";

import {
  addOneOnOneAction,
  addTrainingAction,
  checklistStepAction,
  grantAccessAction,
  revokeAccessAction,
  saveAssetAction,
  saveDocumentAction,
  startChecklistAction,
  revealFieldAction,
  toggleActionItemAction,
  updateProfileAction,
} from "@/app/(portal)/team/actions";
import { confirmSudoAction } from "@/app/(portal)/admin/actions";
import { SudoGate } from "@/components/admin/sudo-gate";
import { RevealField } from "@/components/security/reveal-field";
import { PageHeader } from "@/components/shell/page-header";
import {
  Properties,
  Property,
  RecordGrid,
  RecordHeader,
  RecordSection,
  RecordTabs,
  currentTab,
} from "@/components/ui/record-shell";
import {
  DocumentForm,
  GrantAccessForm,
  IssueAssetForm,
  OneOnOneForm,
  ProfileForm,
  ReturnAssetForm,
  RevokeAccessForm,
  StartChecklistForm,
  TrainingForm,
} from "@/components/team/team-forms";
import { Callout } from "@/components/ui/callout";
import { Popover } from "@/components/ui/popover";
import { RowAction } from "@/components/ui/row-action";
import { StatusPill } from "@/components/ui/status-pill";
import { Timestamp } from "@/components/ui/timestamp";
import { hasCapability, requireStaff } from "@/lib/access/core";
import { kindLabel, roleLabel } from "@/lib/access/role-labels";
import { HqApiRequestError, HqApiUnavailableError } from "@/lib/api/core";
import { readTeam, readTeamMember, type TeamMember } from "@/lib/api/team";
import { formatAbsolute, formatDate } from "@/lib/format";
import { DOCUMENT_LABELS } from "@/lib/team/vocabulary";
import { requestNow } from "@/lib/request-time";
import { firstSearchValue } from "@/lib/search-params";

export const metadata = { title: "Team member" };
export const dynamic = "force-dynamic";

const MOOD_WORDS = ["", "Rough", "Meh", "Steady", "Good", "Great"];

const TABS = [
  { key: "overview", label: "Overview" },
  { key: "growth", label: "One-to-ones" },
  { key: "checkins", label: "Check-ins" },
  { key: "time-off", label: "Time off" },
] as const;

function daysWord(days: number): string {
  if (days === 0) return "today";
  if (days < 0) return `${Math.abs(days)} ${Math.abs(days) === 1 ? "day" : "days"} ago`;
  return `in ${days} ${days === 1 ? "day" : "days"}`;
}

type TeamMemberPageProps = {
  params: Promise<{ staffId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function TeamMemberPage({ params, searchParams }: TeamMemberPageProps) {
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
  const {
    person,
    documents,
    access,
    checklists,
    checkins,
    time_off: leave,
    certificates,
    assets,
    training,
    one_on_ones: oneOnOnes,
    policies,
    reminders,
    reports,
  } = record;
  const canWrite = hasCapability(context, "hr:write");
  const isManager = person.manager_id === context.me.staff.staff_id;
  // Colleagues who could be the manager: the directory, minus the person.
  let colleagues: { staff_id: string; display_name: string }[] = [];
  if (canWrite) {
    try {
      colleagues = (await readTeam(context.token)).people
        .filter((member) => member.is_active && member.staff_id !== person.staff_id)
        .map((member) => ({
          staff_id: member.staff_id,
          display_name: member.display_name || member.email,
        }));
    } catch (error) {
      if (!(error instanceof HqApiUnavailableError || error instanceof HqApiRequestError))
        throw error;
    }
  }
  const today = new Date(now).toISOString().slice(0, 10);
  const outstandingPolicies = policies.filter((policy) => policy.outstanding);
  const openKinds = ["onboarding", "offboarding"].filter(
    (kind) => !checklists.some((run) => run.kind === kind && !run.completed_at),
  );
  const required = ["nda", "ip_assignment"] as const;
  const liveAccess = access.filter((grant) => grant.live).length;
  const tabs = [
    TABS[0],
    { ...TABS[1], count: oneOnOnes.length },
    { ...TABS[2], count: checkins.length },
    { ...TABS[3], count: leave.length },
  ];
  const tab = currentTab(firstSearchValue((await searchParams).tab), tabs);
  const base = `/team/${person.staff_id}`;

  const documentsSection = (
    <RecordSection
      id="team-docs"
      title="Documents"
      actions={
        canWrite && (
          <Popover label="Record a document" width="wide">
            <DocumentForm action={saveDocumentAction} staffId={person.staff_id} />
          </Popover>
        )
      }
    >
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
    </RecordSection>
  );

  const accessSection = (
    <RecordSection
      id="team-access"
      title="Access register"
      actions={
        canWrite &&
        person.is_active && (
          <Popover label="Record access" width="wide">
            <GrantAccessForm
              action={grantAccessAction}
              staffId={person.staff_id}
              documentsOk={record.documents_ok}
            />
          </Popover>
        )
      }
    >
      {access.length === 0 ? (
        <p className="timeline-empty">No system access recorded.</p>
      ) : (
        <ul className="access-list">
          {access.map((grant) => (
            <li key={grant.access_id} className={grant.live ? "access" : "access access--gone"}>
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
    </RecordSection>
  );

  const assetsSection = (
    <RecordSection
      id="team-assets"
      title="Issued to them"
      actions={
        canWrite &&
        person.is_active && (
          <Popover label="Issue something" width="wide">
            <IssueAssetForm action={saveAssetAction} staffId={person.staff_id} today={today} />
          </Popover>
        )
      }
    >
      {assets.length === 0 ? (
        <p className="timeline-empty">Nothing issued.</p>
      ) : (
        <ul className="access-list">
          {assets.map((asset) => (
            <li key={asset.asset_id} className={asset.out ? "access" : "access access--gone"}>
              <div className="access__main">
                <span className="access__system">{asset.label}</span>
                <span className="access__meta">
                  {asset.kind}
                  {asset.serial && ` · ${asset.serial}`} · issued {formatDate(asset.issued_on)}
                  {asset.returned_on
                    ? ` · returned ${formatDate(asset.returned_on)}`
                    : " · still out"}
                  {asset.notes && ` · ${asset.notes}`}
                </span>
              </div>
              {canWrite && asset.out && (
                <ReturnAssetForm
                  action={saveAssetAction}
                  staffId={person.staff_id}
                  asset={asset}
                  today={today}
                />
              )}
            </li>
          ))}
        </ul>
      )}
    </RecordSection>
  );

  const trainingSection = (
    <RecordSection
      id="team-training"
      title="Training"
      actions={
        canWrite && (
          <Popover label="Record training" width="wide">
            <TrainingForm action={addTrainingAction} staffId={person.staff_id} />
          </Popover>
        )
      }
    >
      {training.length === 0 ? (
        <p className="timeline-empty">No training recorded.</p>
      ) : (
        <ul className="access-list">
          {training.map((row) => (
            <li key={row.training_id} className={row.expired ? "access access--gone" : "access"}>
              <div className="access__main">
                <span className="access__system">{row.title}</span>
                <span className="access__meta">
                  {row.provider && `${row.provider} · `}completed {formatDate(row.completed_on)}
                  {row.expires_on
                    ? row.expired
                      ? ` · expired ${formatDate(row.expires_on)}`
                      : ` · valid until ${formatDate(row.expires_on)}`
                    : " · does not expire"}
                  {row.reference && ` · ${row.reference}`}
                </span>
              </div>
              {row.expiring_soon && <span className="due due--today">Expiring</span>}
              {row.expired && <span className="due due--overdue">Expired</span>}
            </li>
          ))}
        </ul>
      )}
    </RecordSection>
  );

  const oneOnOnesSection = (
    <RecordSection
      id="team-one-on-ones"
      title="One-to-ones"
      actions={
        (canWrite || isManager) && (
          <Popover label="Record a one-to-one" width="wide">
            <OneOnOneForm
              action={addOneOnOneAction}
              staffId={person.staff_id}
              personName={person.display_name.split(" ")[0] ?? ""}
              today={today}
            />
          </Popover>
        )
      }
    >
      {oneOnOnes.length === 0 ? (
        <p className="timeline-empty">None recorded yet.</p>
      ) : (
        <ol className="checkin-list">
          {oneOnOnes.map((meeting) => (
            <li key={meeting.one_on_one_id} className="checkin">
              <p className="checkin__head">
                <span>{formatDate(meeting.held_on)}</span>
                <span className="side-quiet">with {meeting.held_by_name || "a colleague"}</span>
              </p>
              {meeting.notes_masked ? (
                <p className="checkin__line">
                  <RevealField
                    action={revealFieldAction}
                    staffId={person.staff_id}
                    field="one_on_one_notes"
                    oneOnOneId={meeting.one_on_one_id}
                    masked="Notes hidden: they are for the person and whoever held it."
                    label="Notes"
                    disabled={!context.me.sudo_fresh}
                  />
                </p>
              ) : (
                meeting.notes && <p className="checkin__line">{meeting.notes}</p>
              )}
              {meeting.actions.length > 0 && (
                <ul className="checklist__steps">
                  {meeting.actions.map((item) => (
                    <li key={item.action_id} className={item.done_at ? "task task--done" : "task"}>
                      {canWrite ||
                      isManager ||
                      item.owner_id === context.me.staff.staff_id ||
                      person.staff_id === context.me.staff.staff_id ? (
                        <RowAction
                          action={toggleActionItemAction}
                          className="task__check-form"
                          fields={{
                            staff_id: person.staff_id,
                            action_id: item.action_id,
                            done: item.done_at ? "false" : "true",
                          }}
                          buttons={[
                            {
                              label: "",
                              className: "task__check",
                              ariaPressed: Boolean(item.done_at),
                              ariaLabel: item.done_at
                                ? `Undo: ${item.title}`
                                : `Done: ${item.title}`,
                            },
                          ]}
                        />
                      ) : (
                        <span className="task__check task__check--static" aria-hidden="true" />
                      )}
                      <div className="task__main">
                        <p className="task__title">{item.title}</p>
                        <p className="task__meta">
                          {item.owner_name}
                          {item.due_on && ` · due ${formatDate(item.due_on)}`}
                          {item.overdue && " · overdue"}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ol>
      )}
    </RecordSection>
  );

  const checkinsSection = (
    <RecordSection id="team-checkins" title="Check-ins">
      {checkins.length === 0 ? (
        <p className="timeline-empty">No check-ins yet.</p>
      ) : (
        <ol className="checkin-list">
          {checkins.map((checkin) => (
            <li key={checkin.week} className="checkin">
              <p className="checkin__head">
                <span className="mono">{checkin.week}</span>
                <span className={`mood mood--${checkin.mood}`}>{MOOD_WORDS[checkin.mood]}</span>
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
    </RecordSection>
  );

  const timeOffSection = (
    <RecordSection id="team-time-off" title="Time off">
      {leave.length === 0 ? (
        <p className="timeline-empty">None requested.</p>
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
    </RecordSection>
  );

  return (
    <>
      <RecordHeader
        crumbs={[{ href: "/team", label: "Team" }]}
        title={person.display_name || person.email}
        favourite={{ href: base, label: person.display_name || person.email, kind: "Team" }}
        status={
          <>
            {!person.is_active && <StatusPill value="inactive" label="Not active" />}
            {record.documents_ok ? (
              <StatusPill value="signed" label="Documents in" tone="live" />
            ) : (
              <StatusPill value="missing" label="Documents missing" tone="danger" />
            )}
          </>
        }
        readouts={[
          { label: "Role", value: roleLabel(person.role) },
          { label: "Engagement", value: kindLabel(person.kind) },
          { label: "Since", value: person.starts_on ? formatDate(person.starts_on) : "—" },
          { label: "Live access", value: liveAccess },
          { label: "Issued items out", value: assets.filter((asset) => asset.out).length },
        ]}
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
      {(canWrite || person.masked.length > 0) && (
        <SudoGate
          action={confirmSudoAction}
          fresh={context.me.sudo_fresh}
          untilLabel={
            context.me.sudo_until
              ? (formatAbsolute(context.me.sudo_until).split(", ")[1] ?? null)
              : null
          }
          returnPath={base}
          purpose="Recording documents and system access, and revealing a hidden detail, need a fresh code from your authenticator app."
        />
      )}
      <RecordTabs base={base} tabs={tabs} current={tab} label="Team member sections" />
      <RecordGrid
        side={
          <>
            <Properties title="Details">
              <Property label="Work email" mono>
                {person.email}
              </Property>
              <Property label="Personal email" mono>
                {person.masked.includes("personal_email") ? (
                  <RevealField
                    action={revealFieldAction}
                    staffId={person.staff_id}
                    field="personal_email"
                    masked={person.personal_email}
                    label="Personal email"
                    disabled={!context.me.sudo_fresh}
                  />
                ) : (
                  person.personal_email || "—"
                )}
              </Property>
              <Property label="Role">{roleLabel(person.role)}</Property>
              <Property label="Engagement">{kindLabel(person.kind)}</Property>
              <Property label="Since">
                {person.starts_on ? formatDate(person.starts_on) : "—"}
              </Property>
              <Property label="Until">
                {person.ends_on ? formatDate(person.ends_on) : "Open-ended"}
              </Property>
              <Property label="Status">{person.is_active ? "Active" : "Not active"}</Property>
              <Property label="Reports to">
                {person.manager_id ? (
                  <Link href={`/team/${person.manager_id}`}>
                    {person.manager_name || "A colleague"}
                  </Link>
                ) : (
                  "—"
                )}
              </Property>
              {reports.length > 0 && (
                <Property label="Manages">
                  {reports.map((report, index) => (
                    <span key={report.staff_id}>
                      {index > 0 && ", "}
                      <Link href={`/team/${report.staff_id}`}>{report.display_name}</Link>
                    </span>
                  ))}
                </Property>
              )}
              <Property label="Probation ends">
                {person.probation_ends_on ? formatDate(person.probation_ends_on) : "—"}
              </Property>
              <Property label="Emergency contact">
                {!person.emergency_contact.name ? (
                  "—"
                ) : person.masked.includes("emergency_contact_name") ? (
                  <RevealField
                    action={revealFieldAction}
                    staffId={person.staff_id}
                    field="emergency_contact_name"
                    masked={`${person.emergency_contact.name}${person.emergency_contact.relation ? ` (${person.emergency_contact.relation})` : ""}`}
                    label="Emergency contact"
                    disabled={!context.me.sudo_fresh}
                  />
                ) : (
                  `${person.emergency_contact.name}${person.emergency_contact.relation ? ` (${person.emergency_contact.relation})` : ""}`
                )}
              </Property>
              {person.emergency_contact.phone && (
                <Property label="Their phone" mono>
                  {person.masked.includes("emergency_contact_phone") ? (
                    <RevealField
                      action={revealFieldAction}
                      staffId={person.staff_id}
                      field="emergency_contact_phone"
                      masked={person.emergency_contact.phone}
                      label="Emergency contact's phone"
                      disabled={!context.me.sudo_fresh}
                    />
                  ) : (
                    person.emergency_contact.phone
                  )}
                </Property>
              )}
              <Property label="Certificates">
                {certificates.length === 0
                  ? "None"
                  : certificates.map((certificate) => (
                      <Link
                        key={certificate.serial}
                        className="mono"
                        href={`/verify/${certificate.serial}`}
                      >
                        {certificate.serial}
                      </Link>
                    ))}
              </Property>
            </Properties>
            {record.reveals.length > 0 && (
              <RecordSection id="team-reveals" title="Revealed here">
                <ul className="side-list">
                  {record.reveals.map((item) => (
                    <li key={`${item.at}-${item.field}`} className="renewal">
                      <span>
                        {item.field_label} · {item.by_name || "Someone"}: “{item.reason}”
                      </span>
                      <span className="side-quiet">{item.at ? formatAbsolute(item.at) : ""}</span>
                    </li>
                  ))}
                </ul>
              </RecordSection>
            )}
            {canWrite && (
              <RecordSection id="team-profile" title="Reporting line and contact">
                <ProfileForm
                  action={updateProfileAction}
                  staffId={person.staff_id}
                  person={person}
                  colleagues={colleagues}
                />
              </RecordSection>
            )}
            {reminders.length > 0 && (
              <RecordSection id="team-reminders" title="Coming up">
                <ul className="side-list">
                  {reminders.map((item) => (
                    <li key={`${item.kind}-${item.on}-${item.label}`} className="renewal">
                      <span>
                        {item.label} · {formatDate(item.on)}
                      </span>
                      <span className={item.days <= 7 ? "due due--today" : "side-quiet"}>
                        {daysWord(item.days)}
                      </span>
                    </li>
                  ))}
                </ul>
              </RecordSection>
            )}
            <RecordSection id="team-policies" title="Policies">
              {policies.length === 0 ? (
                <p className="side-quiet">No policies published.</p>
              ) : (
                <ul className="side-list">
                  {policies.map((policy) => (
                    <li key={policy.key} className="renewal">
                      <span>
                        {policy.title} <span className="side-quiet">v{policy.version}</span>
                      </span>
                      {policy.outstanding ? (
                        <StatusPill value="outstanding" label="Not acknowledged" tone="attention" />
                      ) : (
                        <StatusPill value="acknowledged" label="Acknowledged" tone="live" />
                      )}
                    </li>
                  ))}
                </ul>
              )}
              {outstandingPolicies.length > 0 && (
                <p className="side-quiet">
                  {outstandingPolicies.length === 1
                    ? "One policy awaits their acknowledgement; they do it under My security."
                    : `${outstandingPolicies.length} policies await their acknowledgement; they do it under My security.`}
                </p>
              )}
            </RecordSection>
            <RecordSection id="team-checklists" title="Checklists">
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
                  {run.blocked_by_assets > 0 && (
                    <p className="due due--today">
                      {run.blocked_by_assets === 1
                        ? "1 issued item is still out; the return step waits for it."
                        : `${run.blocked_by_assets} issued items are still out; the return step waits for them.`}
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
            </RecordSection>
          </>
        }
      >
        {tab === "overview" && (
          <>
            {documentsSection}
            {accessSection}
            {assetsSection}
            {trainingSection}
          </>
        )}
        {tab === "growth" && oneOnOnesSection}
        {tab === "checkins" && checkinsSection}
        {tab === "time-off" && timeOffSection}
      </RecordGrid>
    </>
  );
}
