import Link from "next/link";
import { notFound } from "next/navigation";

import { DataUnavailable } from "@/components/data/data-down";
import { AssuranceTabs } from "@/components/data/assurance/assurance-tabs";
import { FindingFields } from "@/components/data/findings/finding-fields";
import { CopyFields } from "@/components/data/meetings/copy-fields";
import { ControlRefNote, PracticeNote } from "@/components/data/security/control-ref";
import { MailForm } from "@/components/mail/mail-form";
import { PageHeader } from "@/components/shell/page-header";
import { Callout } from "@/components/ui/callout";
import { Field, Input, Textarea } from "@/components/ui/field";
import { Popover } from "@/components/ui/popover";
import {
  Properties,
  Property,
  RecordGrid,
  RecordHeader,
  RecordSection,
} from "@/components/ui/record-shell";
import { RowAction } from "@/components/ui/row-action";
import { StatusPill } from "@/components/ui/status-pill";
import { Timestamp } from "@/components/ui/timestamp";
import { DATA_ROLE_LINE, requireData } from "@/lib/data/access";
import { readFinding, type FindingPage } from "@/lib/data/api/findings";
import { dayWords } from "@/lib/data/labels-company";
import { FINDING_STATUSES, HOST_STATES, NO_PROFILES } from "@/lib/data/labels-assurance";
import { NOT_ADVICE, type PracticeKey } from "@/lib/data/labels-controls";
import { dataRead } from "@/lib/data/read";
import { requestNow } from "@/lib/request-time";

import {
  acceptFindingAction,
  dismissFindingAction,
  findingFixedAction,
  moveFindingAction,
  reopenFindingAction,
  updateFindingAction,
} from "../../actions";
import "../../assurance.css";

export const metadata = { title: "Finding" };
export const dynamic = "force-dynamic";

const BASE = "/data/assurance/findings";
const ID = /^[A-Za-z0-9-]{1,64}$/;

const EVENT_WORDS: Record<string, string> = {
  added: "Added",
  imported: "Imported",
  changed: "Changed",
  fixed: "Fixed",
  accepted: "Risk accepted",
  dismissed: "Dismissed",
  reopened: "Reopened",
  open: "Open",
  "day moved": "Day moved",
  "day moved back": "Day moved back",
  "severity changed": "Severity changed",
};

export default async function FindingRecordPage({
  params,
}: {
  params: Promise<{ findingId: string }>;
}) {
  const { findingId } = await params;
  const { allowed } = await requireData(`${BASE}/${findingId}`);
  if (!ID.test(findingId)) notFound();
  const now = requestNow();
  const read = allowed ? await dataRead(() => readFinding(findingId)) : null;
  if (!allowed || !read || !read.ok)
    return (
      <>
        <PageHeader title="Finding" />
        <div className="page-content">
          {!allowed || !read ? (
            <Callout tone="neutral">{DATA_ROLE_LINE}</Callout>
          ) : (
            !read.ok && <DataUnavailable failure={read} />
          )}
        </div>
      </>
    );
  return <FindingRecord page={read.data} now={now} />;
}

function FindingRecord({ page, now }: { page: FindingPage; now: number }) {
  const { finding, today } = page;
  const status = FINDING_STATUSES[finding.status];
  const fields = { finding_id: finding.finding_id };
  return (
    <>
      <RecordHeader
        crumbs={[
          { href: "/data/assurance", label: "Assurance" },
          { href: BASE, label: "Pen tests and findings" },
        ]}
        title={finding.title}
        status={<StatusPill value={finding.status} label={status.label} tone={status.tone} />}
        readouts={[
          { label: "Severity", value: finding.severity_words },
          { label: "Found", value: dayWords(finding.found_on) },
          { label: "Fix by", value: dayWords(finding.fix.fix_by) },
        ]}
        actions={
          <Popover label="Edit" align="start" width="wide">
            <MailForm
              action={updateFindingAction}
              fields={fields}
              submitLabel="Save"
              pendingLabel="Saving…"
            >
              <FindingFields
                prefix="finding-edit"
                today={today}
                penTests={page.pen_tests}
                imported={finding.source === "dependabot"}
                values={finding}
              />
            </MailForm>
          </Popover>
        }
      />
      <RecordGrid side={<Side page={page} />}>
        <AssuranceTabs current="findings" />
        <div className="hqdata-assurance">
          <FixBy page={page} />
          {finding.dependabot && (
            <RecordSection id="finding-alert" title="The dependency alert">
              <dl className="hqdata-assurance__holds">
                <dt>Package</dt>
                <dd>
                  {finding.dependabot.package} ({finding.dependabot.ecosystem})
                </dd>
                <dt>Advisory</dt>
                <dd className="mono">
                  {finding.dependabot.ghsa_id}
                  {finding.dependabot.cve_id ? ` · ${finding.dependabot.cve_id}` : ""}
                </dd>
                <dt>Where</dt>
                <dd>
                  {finding.dependabot.repo}
                  {finding.dependabot.manifest_path ? `, ${finding.dependabot.manifest_path}` : ""}
                </dd>
                <dt>Affected</dt>
                <dd>{finding.dependabot.vulnerable_range || "Not given"}</dd>
                <dt>Fixed in</dt>
                <dd>{finding.dependabot.patched ?? "No fixed version yet"}</dd>
                <dt>On the code host</dt>
                <dd>
                  {HOST_STATES[finding.dependabot.state]}.{" "}
                  <span className="hqdata-control-ref">
                    <a
                      className="text-link"
                      href={finding.dependabot.html_url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      The alert
                    </a>
                    <span className="hqdata-control-ref__url">
                      {" "}
                      ({finding.dependabot.html_url})
                    </span>
                  </span>
                </dd>
              </dl>
            </RecordSection>
          )}
          <RecordSection id="finding-description" title="What it is">
            <p className="hqdata-assurance__prose">{finding.description || "Not written."}</p>
          </RecordSection>
          <RecordSection id="finding-evidence" title="Evidence">
            <p className="hqdata-assurance__prose">{finding.evidence || "None recorded."}</p>
            {page.evidence_file && (
              <p>
                <Link className="text-link" href={`/data/files/${page.evidence_file.file_id}`}>
                  {page.evidence_file.title}
                </Link>
              </p>
            )}
          </RecordSection>
          <RecordSection id="finding-activity" title="Activity">
            {page.events.length === 0 ? (
              <p className="timeline-empty">Nothing has happened yet.</p>
            ) : (
              <ol className="timeline">
                {page.events.map((event) => (
                  <li key={event.event_id} className="timeline__item">
                    <span className="timeline__kind">{EVENT_WORDS[event.verb] ?? event.verb}</span>
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

const PRACTICE_OF: Record<string, PracticeKey> = {
  critical: "fix_critical",
  high: "fix_high",
  medium: "fix_medium",
  low: "fix_low",
};

/** The fix-by block, first on a phone: the day, why, and what can be done with it. */
function FixBy({ page }: { page: FindingPage }) {
  const { finding, today } = page;
  const fix = finding.fix;
  const fields = { finding_id: finding.finding_id };
  const open = finding.status === "open";
  return (
    <RecordSection id="finding-fix-by" title="Fix by">
      <p>
        <strong className={fix.state === "overdue" ? "hqdata-assurance__late" : undefined}>
          {fix.words}.
        </strong>
      </p>
      {fix.lines.map((line) => (
        <p key={line}>{line}</p>
      ))}
      {fix.because && (
        <p>
          <ControlRefNote refs={[fix.because.regime === "dora" ? "dora_30" : "cscrf"]} />
        </p>
      )}
      {!fix.own && (
        <p>
          <PracticeNote practice={PRACTICE_OF[finding.severity] ?? "fix_medium"} />
        </p>
      )}
      {page.in_force === null && <p className="page-note">{NO_PROFILES}</p>}
      {finding.decision && (
        <p>
          {finding.status === "accepted" ? "Accepted" : "Dismissed"} by{" "}
          {finding.decision.decided_by} on {dayWords(finding.decision.on)}: {finding.decision.why}
        </p>
      )}
      <div className="hqdata-assurance__acts">
        {open && (
          <>
            {fix.own ? (
              <RowAction
                action={moveFindingAction}
                fields={{ ...fields, undo: "1" }}
                buttons={[
                  { label: "Back to the worked-out day", className: "btn btn--small btn--ghost" },
                ]}
                className="hqdata-assurance__inline"
              />
            ) : (
              <Popover label="Move the day" align="start" width="wide">
                <MailForm
                  action={moveFindingAction}
                  fields={fields}
                  submitLabel="Move it"
                  pendingLabel="Saving…"
                >
                  <Field id="move-on" label="Fix by">
                    <Input id="move-on" name="on" type="date" min={finding.found_on} required />
                  </Field>
                  <Field
                    id="move-why"
                    label="Why it moves"
                    hint="10 to 300 characters. The finding says so."
                  >
                    <Textarea
                      id="move-why"
                      name="why"
                      rows={2}
                      minLength={10}
                      maxLength={300}
                      required
                    />
                  </Field>
                </MailForm>
              </Popover>
            )}
            <Popover label="Mark fixed" align="start" width="wide">
              <MailForm
                action={findingFixedAction}
                fields={fields}
                submitLabel="Mark fixed"
                pendingLabel="Saving…"
              >
                <Field id="fixed-on" label="Fixed on">
                  <Input
                    id="fixed-on"
                    name="on"
                    type="date"
                    min={finding.found_on}
                    max={today}
                    defaultValue={today}
                    required
                  />
                </Field>
                <Field id="fixed-evidence" label="How the fix was checked">
                  <Textarea
                    id="fixed-evidence"
                    name="evidence"
                    rows={2}
                    defaultValue={finding.evidence}
                    maxLength={4000}
                  />
                </Field>
                <CopyFields
                  prefix="fixed"
                  label="Evidence"
                  files={page.files}
                  filesHere={page.files_here}
                  folder="Security › Findings"
                />
              </MailForm>
            </Popover>
            <Popover label="Accept the risk" align="start" width="wide">
              <MailForm
                action={acceptFindingAction}
                fields={fields}
                submitLabel="Accept the risk"
                pendingLabel="Saving…"
              >
                <Field
                  id="accept-why"
                  label="Why the risk is accepted"
                  hint="10 to 500 characters."
                >
                  <Textarea
                    id="accept-why"
                    name="why"
                    rows={3}
                    minLength={10}
                    maxLength={500}
                    required
                  />
                </Field>
                <div className="hqdata-assurance__pair">
                  <Field id="accept-by" label="Decided by">
                    <Input id="accept-by" name="decided_by" maxLength={120} required />
                  </Field>
                  <Field id="accept-on" label="On">
                    <Input
                      id="accept-on"
                      name="on"
                      type="date"
                      max={today}
                      defaultValue={today}
                      required
                    />
                  </Field>
                </div>
              </MailForm>
            </Popover>
            <Popover label="Dismiss" align="start" width="wide">
              <MailForm
                action={dismissFindingAction}
                fields={fields}
                submitLabel="Dismiss it"
                pendingLabel="Saving…"
              >
                <Field
                  id="dismiss-why"
                  label="Why it is dismissed"
                  hint="10 to 500 characters. It stays in the register."
                >
                  <Textarea
                    id="dismiss-why"
                    name="why"
                    rows={2}
                    minLength={10}
                    maxLength={500}
                    required
                  />
                </Field>
              </MailForm>
            </Popover>
          </>
        )}
        {!open && (
          <RowAction
            action={reopenFindingAction}
            fields={fields}
            buttons={[{ label: "Reopen", className: "btn btn--small" }]}
            className="hqdata-assurance__inline"
          />
        )}
      </div>
    </RecordSection>
  );
}

function Side({ page }: { page: FindingPage }) {
  const { finding } = page;
  return (
    <Properties title="The finding">
      <Property label="Severity">{finding.severity_words}</Property>
      <Property label="Source">{finding.source_words}</Property>
      <Property label="Pen test">
        {page.pen_test ? (
          <Link className="text-link" href={page.pen_test.href}>
            {page.pen_test.tester}
          </Link>
        ) : (
          "None"
        )}
      </Property>
      <Property label="Found">{dayWords(finding.found_on)}</Property>
      <Property label="Owner">{finding.owner || "Not recorded"}</Property>
      <Property label="Fixed">{finding.fixed_on ? dayWords(finding.fixed_on) : "Not yet"}</Property>
    </Properties>
  );
}
