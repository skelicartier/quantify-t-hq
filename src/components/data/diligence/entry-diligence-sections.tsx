import "server-only";

import {
  addTrialAction,
  clearanceAction,
  closeDiligenceAction,
  openDiligenceAction,
  questionnaireAction,
  redlineAction,
  referenceAction,
  sampleAction,
  securityReviewAction,
  trialDecisionAction,
} from "@/app/(portal)/data/waitlist/diligence/actions";
import { DataUnavailable } from "@/components/data/data-down";
import { MailForm } from "@/components/mail/mail-form";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Popover } from "@/components/ui/popover";
import { RecordSection } from "@/components/ui/record-shell";
import { RowAction } from "@/components/ui/row-action";
import { readEntryDiligence, type Diligence, type Trial } from "@/lib/data/api/diligence";
import {
  REDLINE_STATUSES,
  REVIEW_OUTCOMES,
  TRIAL_DECISIONS,
  TRIAL_RENEWAL_LINE,
  dayShort,
  dayWords,
  termWords,
} from "@/lib/data/labels-close";
import { formatNumber } from "@/lib/format";
import { dataRead } from "@/lib/data/read";

import { questionnaireWords, redlineWords, referencesWords, reviewWords } from "./diligence-words";

/**
 * The Diligence and Trials sections on a waitlist firm's page (ws-notes/company/spec.md
 * §9.7.5), from one read: the open diligence's four parts with their forms, or "Open
 * diligence"; each dataset trial in a line with its clearance, sample and decision forms,
 * and the line that trials never renew on their own.
 */

export async function EntryDiligenceSections({
  entry,
  today,
}: {
  entry: { entry_id: string; firm: string };
  today: string;
}) {
  const read = await dataRead(() => readEntryDiligence(entry.entry_id));
  if (!read.ok)
    return (
      <RecordSection id="waitlist-diligence" title="Diligence">
        <DataUnavailable failure={read} />
      </RecordSection>
    );
  const { diligence, trials } = read.data;
  return (
    <>
      <RecordSection id="waitlist-diligence" title="Diligence">
        {diligence ? (
          <>
            <dl className="hqdata-kv">
              <div className="hqdata-kv__row hqdata-kv__row--act">
                <dt>Questionnaire</dt>
                <dd>
                  {questionnaireWords(diligence.questionnaire)}
                  {diligence.questionnaire.questions !== null &&
                    ` · ${formatNumber(diligence.questionnaire.questions)} questions`}
                </dd>
                <dd className="hqdata-kv__act">
                  <Popover label="Questionnaire" align="end" width="wide">
                    <QuestionnaireForm entryId={entry.entry_id} item={diligence} today={today} />
                  </Popover>
                </dd>
              </div>
              <div className="hqdata-kv__row hqdata-kv__row--act">
                <dt>Security review</dt>
                <dd>
                  {reviewWords(diligence.security_review)}
                  {diligence.security_review.note && ` · ${diligence.security_review.note}`}
                </dd>
                <dd className="hqdata-kv__act">
                  <Popover label="Security review" align="end" width="wide">
                    <ReviewForm entryId={entry.entry_id} item={diligence} today={today} />
                  </Popover>
                </dd>
              </div>
              <div className="hqdata-kv__row hqdata-kv__row--act">
                <dt>References</dt>
                <dd>
                  {referencesWords(diligence.references)}
                  {diligence.references.map((reference) => (
                    <span key={reference.reference_id} className="table-sub">
                      {reference.name}
                      {reference.firm ? `, ${reference.firm}` : ""} ·{" "}
                      {reference.consent_on
                        ? `Agreed ${dayShort(reference.consent_on)}`
                        : "No consent yet"}
                      {reference.shared_on ? ` · Shared ${dayShort(reference.shared_on)}` : ""}
                    </span>
                  ))}
                </dd>
                <dd className="hqdata-kv__act">
                  <Popover label="Add a reference" align="end" width="wide">
                    <ReferenceForm entryId={entry.entry_id} item={diligence} today={today} />
                  </Popover>
                </dd>
              </div>
              <div className="hqdata-kv__row hqdata-kv__row--act">
                <dt>Redlines</dt>
                <dd>
                  {redlineWords(diligence.redlines)}
                  {diligence.redlines.map((redline) => (
                    <span key={redline.redline_id} className="table-sub">
                      {redline.document} · round {redline.round} ·{" "}
                      {REDLINE_STATUSES[redline.status].toLowerCase()}
                    </span>
                  ))}
                </dd>
                <dd className="hqdata-kv__act">
                  <Popover label="Add a redline round" align="end" width="wide">
                    <RedlineForm entryId={entry.entry_id} item={diligence} />
                  </Popover>
                </dd>
              </div>
            </dl>
            <RowAction
              action={closeDiligenceAction}
              fields={{ entry_id: entry.entry_id, diligence_id: diligence.diligence_id }}
              className="hqdata-inline-action"
              sentLabel="Closed."
              buttons={[{ label: "Close the diligence", className: "btn btn--small btn--ghost" }]}
            />
          </>
        ) : (
          <div className="hqdata-line">
            <p className="page-note">No diligence open.</p>
            <MailForm
              action={openDiligenceAction}
              fields={{ entry_id: entry.entry_id }}
              submitLabel="Open diligence"
              pendingLabel="Opening…"
              className="hqdata-inline-action"
            />
          </div>
        )}
      </RecordSection>

      <RecordSection
        id="waitlist-trials"
        title="Trials"
        actions={
          <Popover label="Add a dataset trial" align="end" width="wide">
            <MailForm
              action={addTrialAction}
              fields={{ entry_id: entry.entry_id }}
              submitLabel="Add the trial"
              pendingLabel="Adding…"
            >
              <TrialFields prefix={`trial-new-${entry.entry_id}`} />
            </MailForm>
          </Popover>
        }
      >
        {trials.length === 0 ? (
          <p className="page-note">No dataset trials yet.</p>
        ) : (
          <ul className="hqdata-trials">
            {trials.map((trial) => (
              <TrialLine
                key={trial.trial_id}
                trial={trial}
                entryId={entry.entry_id}
                today={today}
              />
            ))}
          </ul>
        )}
        <p className="page-note hqdata-renewal-line">{TRIAL_RENEWAL_LINE}</p>
      </RecordSection>
    </>
  );
}

function TrialLine({ trial, entryId, today }: { trial: Trial; entryId: string; today: string }) {
  const fields = { entry_id: entryId, trial_id: trial.trial_id };
  const prefix = `trial-${trial.trial_id}`;
  return (
    <li className="hqdata-trials__row" id={prefix}>
      <span className="table-title">
        {trial.dataset}
        {trial.dictionary_version ? ` · ${trial.dictionary_version}` : ""}
      </span>
      <span className="hqdata-trials__facts">
        {trial.compliance.cleared_on ? (
          `Cleared ${dayShort(trial.compliance.cleared_on)} by ${trial.compliance.by_name}`
        ) : (
          <span className="hqdata-attention">Not cleared</span>
        )}
        {" · "}
        {trial.sample ? `Sample sent ${dayShort(trial.sample.sent_on)}` : "No sample sent"}
        {" · "}
        {termWords(trial.starts_on, trial.ends_on)}
        {trial.go_no_go_on ? ` · Go/no-go ${dayWords(trial.go_no_go_on)}` : ""}
        {trial.decision ? ` · ${TRIAL_DECISIONS[trial.decision.outcome]}` : ""}
      </span>
      {!trial.decision && (
        <span className="hqdata-actions">
          <Popover label="Clearance" align="end" width="wide">
            <MailForm
              action={clearanceAction}
              fields={fields}
              submitLabel="Record it"
              pendingLabel="Recording…"
            >
              <Field id={`${prefix}-cleared`} label="Cleared on">
                <Input
                  id={`${prefix}-cleared`}
                  name="cleared_on"
                  type="date"
                  max={today}
                  defaultValue={trial.compliance.cleared_on ?? today}
                  required
                />
              </Field>
              <Field id={`${prefix}-by`} label="By, on their compliance team">
                <Input
                  id={`${prefix}-by`}
                  name="by_name"
                  maxLength={120}
                  required
                  defaultValue={trial.compliance.by_name}
                />
              </Field>
            </MailForm>
          </Popover>
          <Popover label="Send a sample" align="end" width="wide">
            <MailForm
              action={sampleAction}
              fields={fields}
              submitLabel="Record it"
              pendingLabel="Recording…"
            >
              <p className="page-note">
                Only after their compliance team has cleared it. A copy is kept in Files.
              </p>
              <Field id={`${prefix}-sent`} label="Sent on">
                <Input
                  id={`${prefix}-sent`}
                  name="sent_on"
                  type="date"
                  max={today}
                  defaultValue={today}
                  required
                />
              </Field>
              <Field id={`${prefix}-file`} label="The sample (at most 3 MB)">
                <Input id={`${prefix}-file`} name="file" type="file" />
              </Field>
            </MailForm>
          </Popover>
          <Popover label="Record the decision" align="end" width="wide">
            <MailForm
              action={trialDecisionAction}
              fields={fields}
              submitLabel="Record it"
              pendingLabel="Recording…"
            >
              <Field id={`${prefix}-outcome`} label="Decision">
                <Select id={`${prefix}-outcome`} name="outcome" defaultValue="go">
                  <option value="go">Go</option>
                  <option value="no_go">No-go</option>
                </Select>
              </Field>
              <Field id={`${prefix}-on`} label="On">
                <Input
                  id={`${prefix}-on`}
                  name="on"
                  type="date"
                  max={today}
                  defaultValue={today}
                  required
                />
              </Field>
              <Field id={`${prefix}-note`} label="Note">
                <Textarea id={`${prefix}-note`} name="note" rows={3} maxLength={2_000} />
              </Field>
            </MailForm>
          </Popover>
        </span>
      )}
    </li>
  );
}

function TrialFields({ prefix }: { prefix: string }) {
  return (
    <>
      <Field id={`${prefix}-dataset`} label="Dataset">
        <Input id={`${prefix}-dataset`} name="dataset" maxLength={120} required />
      </Field>
      <Field id={`${prefix}-version`} label="Data dictionary version">
        <Input id={`${prefix}-version`} name="dictionary_version" maxLength={40} />
      </Field>
      <div className="hqdata-pilot-form__pair">
        <Field id={`${prefix}-starts`} label="First day">
          <Input id={`${prefix}-starts`} name="starts_on" type="date" />
        </Field>
        <Field id={`${prefix}-ends`} label="Last day">
          <Input id={`${prefix}-ends`} name="ends_on" type="date" />
        </Field>
      </div>
      <Field id={`${prefix}-decide`} label="Go/no-go day">
        <Input id={`${prefix}-decide`} name="go_no_go_on" type="date" />
      </Field>
      <p className="page-note">{TRIAL_RENEWAL_LINE}</p>
    </>
  );
}

function QuestionnaireForm({
  entryId,
  item,
  today,
}: {
  entryId: string;
  item: Diligence;
  today: string;
}) {
  const q = item.questionnaire;
  const prefix = `questionnaire-${item.diligence_id}`;
  return (
    <MailForm
      action={questionnaireAction}
      fields={{ entry_id: entryId, diligence_id: item.diligence_id }}
      submitLabel="Save"
      pendingLabel="Saving…"
    >
      <div className="hqdata-pilot-form__pair">
        <Field id={`${prefix}-received`} label="Received on">
          <Input
            id={`${prefix}-received`}
            name="received_on"
            type="date"
            max={today}
            defaultValue={q.received_on ?? today}
          />
        </Field>
        <Field id={`${prefix}-due`} label="Due on">
          <Input id={`${prefix}-due`} name="due_on" type="date" defaultValue={q.due_on ?? ""} />
        </Field>
      </div>
      <div className="hqdata-pilot-form__pair">
        <Field id={`${prefix}-questions`} label="Questions">
          <Input
            id={`${prefix}-questions`}
            name="questions"
            inputMode="numeric"
            maxLength={5}
            defaultValue={q.questions === null ? "" : String(q.questions)}
          />
        </Field>
        <Field id={`${prefix}-answered`} label="Answered on">
          <Input
            id={`${prefix}-answered`}
            name="answered_on"
            type="date"
            max={today}
            defaultValue={q.answered_on ?? ""}
          />
        </Field>
      </div>
      <Field id={`${prefix}-file`} label="Their questionnaire (at most 3 MB)">
        <Input id={`${prefix}-file`} name="file" type="file" />
      </Field>
      <Field id={`${prefix}-answers`} label="Our answers (at most 3 MB)">
        <Input id={`${prefix}-answers`} name="answers_file" type="file" />
      </Field>
    </MailForm>
  );
}

function ReviewForm({ entryId, item, today }: { entryId: string; item: Diligence; today: string }) {
  const review = item.security_review;
  const prefix = `review-${item.diligence_id}`;
  return (
    <MailForm
      action={securityReviewAction}
      fields={{ entry_id: entryId, diligence_id: item.diligence_id }}
      submitLabel="Save"
      pendingLabel="Saving…"
    >
      <div className="hqdata-pilot-form__pair">
        <Field id={`${prefix}-started`} label="Started on">
          <Input
            id={`${prefix}-started`}
            name="started_on"
            type="date"
            max={today}
            defaultValue={review.started_on ?? ""}
          />
        </Field>
        <Field id={`${prefix}-finished`} label="Finished on">
          <Input
            id={`${prefix}-finished`}
            name="finished_on"
            type="date"
            max={today}
            defaultValue={review.finished_on ?? ""}
          />
        </Field>
      </div>
      <Field id={`${prefix}-outcome`} label="Outcome">
        <Select id={`${prefix}-outcome`} name="outcome" defaultValue={review.outcome}>
          {Object.entries(REVIEW_OUTCOMES).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </Select>
      </Field>
      <Field id={`${prefix}-note`} label="Note">
        <Textarea
          id={`${prefix}-note`}
          name="note"
          rows={3}
          maxLength={2_000}
          defaultValue={review.note}
        />
      </Field>
    </MailForm>
  );
}

function ReferenceForm({
  entryId,
  item,
  today,
}: {
  entryId: string;
  item: Diligence;
  today: string;
}) {
  const prefix = `reference-${item.diligence_id}`;
  return (
    <MailForm
      action={referenceAction}
      fields={{ entry_id: entryId, diligence_id: item.diligence_id }}
      submitLabel="Add the reference"
      pendingLabel="Adding…"
    >
      <Field id={`${prefix}-name`} label="Name">
        <Input id={`${prefix}-name`} name="name" maxLength={120} required />
      </Field>
      <div className="hqdata-pilot-form__pair">
        <Field id={`${prefix}-firm`} label="Firm">
          <Input id={`${prefix}-firm`} name="firm" maxLength={120} />
        </Field>
        <Field id={`${prefix}-role`} label="Role">
          <Input id={`${prefix}-role`} name="role" maxLength={120} />
        </Field>
      </div>
      <div className="hqdata-pilot-form__pair">
        <Field
          id={`${prefix}-consent`}
          label="Agreed to be a reference on"
          hint="A reference is shared only once they agree."
        >
          <Input id={`${prefix}-consent`} name="consent_on" type="date" max={today} />
        </Field>
        <Field id={`${prefix}-shared`} label="Shared on">
          <Input id={`${prefix}-shared`} name="shared_on" type="date" max={today} />
        </Field>
      </div>
      <Field id={`${prefix}-outcome`} label="What came of it">
        <Input id={`${prefix}-outcome`} name="outcome" maxLength={400} />
      </Field>
    </MailForm>
  );
}

function RedlineForm({ entryId, item }: { entryId: string; item: Diligence }) {
  const prefix = `redline-${item.diligence_id}`;
  return (
    <MailForm
      action={redlineAction}
      fields={{ entry_id: entryId, diligence_id: item.diligence_id }}
      submitLabel="Add the round"
      pendingLabel="Adding…"
    >
      <Field id={`${prefix}-document`} label="Document">
        <Input
          id={`${prefix}-document`}
          name="document"
          maxLength={200}
          required
          placeholder="Pilot agreement"
        />
      </Field>
      <div className="hqdata-pilot-form__pair">
        <Field id={`${prefix}-round`} label="Round">
          <Input id={`${prefix}-round`} name="round" inputMode="numeric" maxLength={2} />
        </Field>
        <Field id={`${prefix}-status`} label="With">
          <Select id={`${prefix}-status`} name="status" defaultValue="with_them">
            {Object.entries(REDLINE_STATUSES).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <div className="hqdata-pilot-form__pair">
        <Field id={`${prefix}-sent`} label="Sent on">
          <Input id={`${prefix}-sent`} name="sent_on" type="date" />
        </Field>
        <Field id={`${prefix}-received`} label="Received on">
          <Input id={`${prefix}-received`} name="received_on" type="date" />
        </Field>
      </div>
      <Field id={`${prefix}-file`} label="The redline (at most 3 MB)">
        <Input id={`${prefix}-file`} name="file" type="file" />
      </Field>
    </MailForm>
  );
}
