import Link from "next/link";
import { notFound } from "next/navigation";

import { applicantAction, scorecardAction } from "@/app/(portal)/hiring/actions";
import { StagePill } from "@/components/hiring/hiring-parts";
import { PageHeader } from "@/components/shell/page-header";
import { ActForm } from "@/components/ui/act-form";
import { Callout } from "@/components/ui/callout";
import { Card } from "@/components/ui/card";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/field";
import {
  Properties,
  Property,
  RecordGrid,
  RecordHeader,
  RecordSection,
} from "@/components/ui/record-shell";
import { requireStaff } from "@/lib/access/core";
import { HqApiRequestError, HqApiUnavailableError } from "@/lib/api/core";
import { OPEN_STAGES, readApplicant, type ApplicantRead } from "@/lib/api/hiring";
import { formatAbsolute, formatDate } from "@/lib/format";
import { requestNow } from "@/lib/request-time";

export const metadata = { title: "Applicant" };
export const dynamic = "force-dynamic";

type Params = Promise<{ applicantId: string }>;

/**
 * One applicant: what they sent, where they stand, every move with who made it, and the
 * scorecards — blind until your own is in.
 */
export default async function ApplicantPage({ params }: { params: Params }) {
  const { applicantId } = await params;
  const context = await requireStaff(`/hiring/applicants/${applicantId}`);
  let read: ApplicantRead | null = null;
  try {
    read = await readApplicant(context.token, applicantId);
  } catch (error) {
    if (error instanceof HqApiRequestError && error.status === 404) notFound();
    if (!(error instanceof HqApiUnavailableError || error instanceof HqApiRequestError))
      throw error;
  }
  if (read === null) {
    return (
      <>
        <PageHeader eyebrow="Hiring" title="Applicant" />
        <Callout tone="danger" role="alert">
          This applicant could not be read just now.
        </Callout>
      </>
    );
  }
  const { applicant } = read;
  const hidden = { applicant_id: applicant.applicant_id };
  const canScore = (applicant.interviewing || applicant.can_write) && !applicant.anonymised;
  const scoreStage =
    (OPEN_STAGES as readonly string[]).includes(applicant.stage) && applicant.stage !== "applied"
      ? applicant.stage
      : "screen";
  const today = new Date(requestNow()).toISOString().slice(0, 10);
  const named = new Set(applicant.interviewers.map((item) => item.staff_id));
  const stageName = Object.fromEntries(read.stages.map((item) => [item.value, item.label]));
  const said = (stage: string) => stageName[stage] ?? stage;

  return (
    <>
      <RecordHeader
        crumbs={[
          { href: "/hiring", label: "Hiring" },
          {
            href: `/hiring/openings/${applicant.opening_id}`,
            label: applicant.opening_title || "Role",
          },
        ]}
        title={applicant.full_name}
        status={<StagePill stage={applicant.stage} label={applicant.stage_label} />}
        readouts={[
          { label: "Days in stage", value: String(applicant.days_in_stage) },
          { label: "Scorecards", value: String(applicant.scorecards) },
          { label: "Forgotten on", value: formatDate(applicant.forget_on, "—") },
        ]}
      />
      {applicant.anonymised && (
        <Callout tone="neutral" compact>
          Erased: past the date they agreed to be kept until. The stages and reasons stay; who they
          were does not.
        </Callout>
      )}
      {applicant.stage === "rejected" && (
        <Callout tone="neutral" compact>
          Rejected: {applicant.decision_reason_label}
          {applicant.decision_note ? `. ${applicant.decision_note}` : "."}
        </Callout>
      )}
      <RecordGrid
        side={
          <Properties title="Applicant">
            <Property label="Email">{applicant.email || "—"}</Property>
            <Property label="From">{applicant.source_label}</Property>
            {applicant.referred_by && (
              <Property label="Referred by">{applicant.referred_by}</Property>
            )}
            <Property label="Links">{applicant.links || "—"}</Property>
            <Property label="Interviewers">
              {applicant.interviewers.map((item) => item.name).join(", ") || "Nobody yet"}
            </Property>
            <Property label="Kept until">
              {formatDate(applicant.keep_until, "Six months after the decision")}
            </Property>
          </Properties>
        }
      >
        {applicant.cover_note && (
          <RecordSection id="note" title="What they wrote">
            <p className="prewrap">{applicant.cover_note}</p>
          </RecordSection>
        )}

        <RecordSection id="scorecards" title="Scorecards">
          {applicant.scorecards_hidden > 0 && (
            <Callout tone="neutral" compact>
              {applicant.scorecards_hidden} scorecard
              {applicant.scorecards_hidden === 1 ? " is" : "s are"} in. You see them once yours is:
              the first opinion should not set yours.
            </Callout>
          )}
          {applicant.scorecard_views.length === 0 && applicant.scorecards_hidden === 0 && (
            <p className="muted">No scorecards yet.</p>
          )}
          <div className="form-grid">
            {applicant.scorecard_views.map((card, index) => (
              <Card
                key={`${card.interviewer_name}-${card.stage}-${index}`}
                title={`${card.interviewer_name}${card.mine ? " (you)" : ""} · ${card.recommendation_label}`}
                titleAs="h3"
                description={`${card.stage.charAt(0).toUpperCase()}${card.stage.slice(1)} · ${formatAbsolute(card.submitted_at, "—")}`}
              >
                <ul className="plain-list">
                  {read.criteria.map((criterion) => (
                    <li key={criterion.value}>
                      {criterion.label}: <strong>{card.scores[criterion.value] ?? "—"}</strong> of 4
                    </li>
                  ))}
                </ul>
                {card.notes && <p className="prewrap">{card.notes}</p>}
              </Card>
            ))}
          </div>
          {canScore && (
            <details
              className="disclosure"
              open={applicant.interviewing && applicant.scorecards_hidden > 0}
            >
              <summary>Write your scorecard</summary>
              <ActForm
                action={scorecardAction}
                hidden={{ ...hidden, stage: scoreStage }}
                act="score"
                label="Hand it in"
                primary
                tight={false}
              >
                <Field id="card-recommendation" label="Your recommendation">
                  <Select id="card-recommendation" name="recommendation" defaultValue="yes">
                    {read.recommendations.map((item) => (
                      <option key={item.value} value={item.value}>
                        {item.label}
                      </option>
                    ))}
                  </Select>
                </Field>
                <div className="form-grid">
                  {read.criteria.map((criterion) => (
                    <Field
                      key={criterion.value}
                      id={`score-${criterion.value}`}
                      label={`${criterion.label} (1 to 4)`}
                    >
                      <Select
                        id={`score-${criterion.value}`}
                        name={`score_${criterion.value}`}
                        defaultValue="3"
                      >
                        {["1", "2", "3", "4"].map((value) => (
                          <option key={value} value={value}>
                            {value}
                          </option>
                        ))}
                      </Select>
                    </Field>
                  ))}
                </div>
                <Field id="card-notes" label="What you saw" hint="Evidence, not adjectives.">
                  <Textarea id="card-notes" name="notes" rows={4} maxLength={4000} />
                </Field>
              </ActForm>
            </details>
          )}
        </RecordSection>

        <RecordSection id="history" title="What happened">
          <ol className="event-timeline">
            {applicant.events.map((event, index) => (
              <li key={`${event.at}-${index}`} className="event-timeline__row">
                <span className="event-timeline__kind">
                  {event.kind === "stage"
                    ? event.from_stage
                      ? `${said(event.from_stage)} to ${said(event.to_stage)}`
                      : `Came in: ${said(event.to_stage)}`
                    : "Note"}
                </span>
                <span className="event-timeline__detail">
                  {event.note || "—"}
                  <span className="quiet">
                    {" "}
                    · {event.staff_name} · {formatAbsolute(event.at, "—")}
                  </span>
                </span>
              </li>
            ))}
          </ol>
        </RecordSection>

        {applicant.can_write && !applicant.anonymised && (
          <RecordSection id="decide" title="Move it on">
            <div className="form-grid">
              <Card
                title="Move to a stage"
                titleAs="h3"
                description="A rejection needs a reason from the list."
              >
                <ActForm action={applicantAction} hidden={hidden} act="move" label="Move">
                  <Field id="move-stage" label="To">
                    <Select id="move-stage" name="to_stage" defaultValue="">
                      <option value="" disabled>
                        Choose a stage
                      </option>
                      {read.stages
                        .filter((item) => item.value !== applicant.stage)
                        .map((item) => (
                          <option key={item.value} value={item.value}>
                            {item.label}
                          </option>
                        ))}
                    </Select>
                  </Field>
                  <Field id="move-reason" label="If rejected, why">
                    <Select id="move-reason" name="reason" defaultValue="">
                      <option value="">Not a rejection</option>
                      {read.reasons.map((item) => (
                        <option key={item.value} value={item.value}>
                          {item.label}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field id="move-note" label="Note">
                    <Input id="move-note" name="note" maxLength={1000} />
                  </Field>
                </ActForm>
              </Card>
              <Card
                title="Interviewers"
                titleAs="h3"
                description="Anyone added is told, and can read this applicant and score them."
              >
                <ActForm
                  action={applicantAction}
                  hidden={hidden}
                  act="interviewers"
                  label="Set interviewers"
                >
                  <fieldset className="checkbox-group">
                    <legend>Who interviews</legend>
                    {read.staff.map((person) => (
                      <Checkbox
                        key={person.staff_id}
                        id={`interviewer-${person.staff_id}`}
                        name="staff_ids"
                        value={person.staff_id}
                        label={person.name}
                        defaultChecked={named.has(person.staff_id)}
                      />
                    ))}
                  </fieldset>
                </ActForm>
              </Card>
            </div>
            <div className="form-grid">
              <Card title="Write a note" titleAs="h3">
                <ActForm action={applicantAction} hidden={hidden} act="note" label="Add the note">
                  <Field id="note-text" label="Note">
                    <Textarea id="note-text" name="note" rows={3} maxLength={2000} />
                  </Field>
                </ActForm>
              </Card>
              <Card
                title="Keep them longer"
                titleAs="h3"
                description="Only when they asked to be considered for later roles."
              >
                <ActForm
                  action={applicantAction}
                  hidden={hidden}
                  act="keep"
                  label="Keep until then"
                >
                  <Field id="keep-until" label="Until">
                    <Input id="keep-until" name="keep_until" type="date" min={today} />
                  </Field>
                  <Field id="keep-evidence" label="Where they said yes">
                    <Input id="keep-evidence" name="evidence" maxLength={400} />
                  </Field>
                </ActForm>
              </Card>
            </div>
          </RecordSection>
        )}
        <p className="page-note">
          <Link href={`/hiring/openings/${applicant.opening_id}`}>
            Back to {applicant.opening_title || "the role"}
          </Link>
        </p>
      </RecordGrid>
    </>
  );
}
