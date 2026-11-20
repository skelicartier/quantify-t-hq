import Link from "next/link";
import { notFound } from "next/navigation";

import { DataUnavailable } from "@/components/data/data-down";
import { CopyFields } from "@/components/data/meetings/copy-fields";
import { DutyRef } from "@/components/data/profiles/duty-ref";
import { ControlRefNote } from "@/components/data/security/control-ref";
import { MailForm } from "@/components/mail/mail-form";
import { PageHeader } from "@/components/shell/page-header";
import { buttonClass } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { DataTable } from "@/components/ui/data-table";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/field";
import { Popover } from "@/components/ui/popover";
import { RecordSection } from "@/components/ui/record-shell";
import { Timestamp } from "@/components/ui/timestamp";
import { DATA_ROLE_LINE, requireData } from "@/lib/data/access";
import { readEntryProfile, type EntryProfile, type ProfileDetail } from "@/lib/data/api/profiles";
import { FLAGS, dayWords } from "@/lib/data/labels-company";
import { NOT_ADVICE } from "@/lib/data/labels-controls";
import {
  CRITICAL_ONLY,
  DUTY_STATE_WORDS,
  NOTHING_CHANGES,
  REGIME_WORDS,
  SEBI_CATEGORY_WORDS,
  profileEmpty,
} from "@/lib/data/labels-questionnaires";
import { dataRead } from "@/lib/data/read";
import { requestNow } from "@/lib/request-time";

import {
  addDutyAction,
  saveDutyAction,
  startProfileAction,
  updateProfileAction,
  withdrawDutyAction,
} from "./actions";
import "@/components/data/closing/closing.css";
import "@/components/data/questionnaires/questionnaires.css";

export const metadata = { title: "Regulatory profile" };
export const dynamic = "force-dynamic";

const ID = /^[A-Za-z0-9-]{1,64}$/;
const ABOUT = `Which rules a regulated buyer works under, and the duties its contract passes to you. Only a duty you mark as in the contract, on a profile that applies by today, changes anything in HQ: a finding's fix-by day. ${NOT_ADVICE}`;

const COLUMNS = [
  { key: "duty", label: "Duty", width: "32%" },
  { key: "from", label: "From" },
  { key: "state", label: "In the contract" },
  { key: "agreement", label: "Agreement" },
  { key: "note", label: "Note" },
];

const VERBS: Record<string, string> = {
  started: "Started",
  edited: "Edited",
  "duty added": "Duty added",
  "duty withdrawn": "Duty withdrawn",
  duty: "Duty",
};

export default async function ProfilePage({ params }: { params: Promise<{ entryId: string }> }) {
  const { entryId } = await params;
  const { allowed } = await requireData(`/data/waitlist/${entryId}/profile`);
  if (!ID.test(entryId)) notFound();
  const read = allowed ? await dataRead(() => readEntryProfile(entryId)) : null;
  if (read?.ok && !read.data.entry) notFound();
  const firm = read?.ok ? (read.data.entry?.firm ?? "The firm") : "The firm";
  return (
    <>
      <PageHeader
        title={`${firm}: regulatory profile`}
        description={ABOUT}
        actions={
          <Link
            className={buttonClass({ size: "small", variant: "ghost" })}
            href={`/data/waitlist/${entryId}`}
          >
            Back to {firm}
          </Link>
        }
      />
      <div className="page-content">
        {!allowed || !read ? (
          <Callout tone="neutral">{DATA_ROLE_LINE}</Callout>
        ) : !read.ok ? (
          <DataUnavailable failure={read} />
        ) : (
          <Profile page={read.data} entryId={entryId} firm={firm} now={requestNow()} />
        )}
      </div>
    </>
  );
}

function Profile({
  page,
  entryId,
  firm,
  now,
}: {
  page: EntryProfile;
  entryId: string;
  firm: string;
  now: number;
}) {
  const profile = page.profile;
  if (!profile)
    return (
      <div className="hqdata-profile">
        <p className="page-note">{NOT_ADVICE}</p>
        <RecordSection id="profile-start" title="The rules they work under">
          <p className="page-note">{profileEmpty(firm)}</p>
          <MailForm
            action={startProfileAction}
            fields={{ entry_id: entryId }}
            submitLabel="Start the profile"
            pendingLabel="Starting…"
            variant="primary"
            className="hqdata-inline-action"
          />
        </RecordSection>
      </div>
    );
  const fields = { entry_id: entryId, profile_id: profile.profile_id };
  const flowdowns = new Map(page.flowdowns.map((item) => [item.key, item]));
  const titles = new Map((page.agreements ?? []).map((item) => [item.agreement_id, item]));
  const onProfile = new Set(
    profile.duties.filter((duty) => !duty.withdrawn).map((duty) => duty.key),
  );
  const addable = page.flowdowns.filter((item) => !onProfile.has(item.key));
  return (
    <div className="hqdata-profile">
      <p className="page-note">{NOT_ADVICE}</p>
      <RecordSection
        id="profile-rules"
        title="The rules they work under"
        actions={
          <Popover label="Edit the rules" align="end" width="wide">
            <RulesForm profile={profile} fields={fields} />
          </Popover>
        }
      >
        <dl className="hqdata-kv">
          <div className="hqdata-kv__row">
            <dt>{REGIME_WORDS.sebi}</dt>
            <dd>
              {profile.regimes.sebi
                ? profile.regimes.sebi.category
                  ? `Yes, ${SEBI_CATEGORY_WORDS[profile.regimes.sebi.category]}`
                  : "Yes, category not given"
                : "No"}
            </dd>
          </div>
          <div className="hqdata-kv__row">
            <dt>{REGIME_WORDS.dora}</dt>
            <dd>
              {profile.regimes.dora
                ? `Yes. The service supports a critical or important function: ${FLAGS[profile.regimes.dora.critical_function]}`
                : "No"}
            </dd>
          </div>
          <div className="hqdata-kv__row">
            <dt>{REGIME_WORDS.uk}</dt>
            <dd>
              {profile.regimes.uk
                ? `Yes${profile.regimes.uk.note ? `: ${profile.regimes.uk.note}` : ""}`
                : "No"}
            </dd>
          </div>
          <div className="hqdata-kv__row">
            <dt>{REGIME_WORDS.other}</dt>
            <dd>{profile.regimes.other || "None"}</dd>
          </div>
          <div className="hqdata-kv__row">
            <dt>Applies from</dt>
            <dd>{profile.applies_from ? dayWords(profile.applies_from) : profile.applies_words}</dd>
          </div>
        </dl>
        {profile.notes && <p className="hqdata-prose">{profile.notes}</p>}
      </RecordSection>

      <RecordSection
        id="profile-duties"
        title="Duties their contract passes to you"
        actions={
          <Popover label="Add a duty" align="end" width="wide">
            <MailForm
              action={addDutyAction}
              fields={fields}
              submitLabel="Add the duty"
              pendingLabel="Adding…"
            >
              <Field id="duty-key" label="From the list" hint="Or write your own below.">
                <Select id="duty-key" name="key" defaultValue="">
                  <option value="">None chosen</option>
                  {addable.map((item) => (
                    <option key={item.key} value={item.key}>
                      {item.ref}: {item.words}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field id="duty-words" label="In your own words" hint="3 to 300 characters.">
                <Input id="duty-words" name="words" maxLength={300} />
              </Field>
            </MailForm>
          </Popover>
        }
      >
        <p className="page-note">
          <ControlRefNote refs={["cscrf", "dora_30"]} />
        </p>
        <DataTable
          caption="Duties"
          columns={COLUMNS}
          scroll={false}
          columnMenu={false}
          isEmpty={profile.duties.length === 0}
          empty={
            <p className="page-note">
              No duties yet. Tick the rules they work under to add the duties those rules commonly
              pass down, or add your own.
            </p>
          }
        >
          {profile.duties.map((duty) => {
            const agreement = duty.agreement_id ? titles.get(duty.agreement_id) : undefined;
            const prefix = `duty-${duty.duty_id}`;
            return (
              <tr key={duty.duty_id} id={prefix}>
                <td>
                  <span className={`hqdata-duty ${duty.withdrawn ? "hqdata-duty__withdrawn" : ""}`}>
                    <span className="hqdata-duty__words">{duty.shown}</span>
                    {duty.critical_only && <span className="table-sub">{CRITICAL_ONLY}</span>}
                    {duty.withdrawn && (
                      <span className="table-sub">
                        Withdrawn {dayWords(duty.withdrawn.on)}
                        {duty.withdrawn.why ? `: ${duty.withdrawn.why}` : ""}
                      </span>
                    )}
                  </span>
                </td>
                <td>
                  {duty.ref ? (
                    <>
                      {duty.ref}
                      <span className="table-sub">
                        <DutyRef
                          duty={duty}
                          flowdown={duty.key ? (flowdowns.get(duty.key) ?? null) : null}
                        />
                      </span>
                    </>
                  ) : (
                    <span className="table-sub">Your own words</span>
                  )}
                </td>
                <td>
                  <span
                    className={
                      duty.state === "" && !duty.withdrawn ? "hqdata-attention" : undefined
                    }
                  >
                    {duty.withdrawn ? "Withdrawn" : DUTY_STATE_WORDS[duty.state]}
                  </span>
                  {!duty.withdrawn && (
                    <details className="hqdata-disclose">
                      <summary
                        className={buttonClass({ size: "small" })}
                        aria-label={`Change: ${duty.shown}`}
                      >
                        Change
                      </summary>
                      <div className="hqdata-disclose__panel">
                        <MailForm
                          action={saveDutyAction}
                          fields={{ ...fields, duty_id: duty.duty_id }}
                          submitLabel="Save"
                          pendingLabel="Saving…"
                        >
                          <Field id={`${prefix}-state`} label="In the contract">
                            <Select id={`${prefix}-state`} name="state" defaultValue={duty.state}>
                              <option value="in_contract">{DUTY_STATE_WORDS.in_contract}</option>
                              <option value="not_in_contract">
                                {DUTY_STATE_WORDS.not_in_contract}
                              </option>
                              <option value="">{DUTY_STATE_WORDS[""]}</option>
                            </Select>
                          </Field>
                          {page.agreements !== null ? (
                            <Field id={`${prefix}-agreement`} label="The agreement">
                              <Select
                                id={`${prefix}-agreement`}
                                name="agreement_id"
                                defaultValue={duty.agreement_id ?? ""}
                              >
                                <option value="">None chosen</option>
                                {(page.agreements ?? []).map((item) => (
                                  <option key={item.agreement_id} value={item.agreement_id}>
                                    {item.title}
                                  </option>
                                ))}
                              </Select>
                            </Field>
                          ) : (
                            <p className="field__hint">
                              The agreements register is not loaded here.
                            </p>
                          )}
                          <Field
                            id={`${prefix}-note`}
                            label="Note"
                            hint="The clause, say. 500 characters at most."
                          >
                            <Input
                              id={`${prefix}-note`}
                              name="note"
                              maxLength={500}
                              defaultValue={duty.note}
                            />
                          </Field>
                          <CopyFields
                            prefix={prefix}
                            label="Their contract"
                            files={page.files}
                            filesHere={page.files_here}
                            folder="06 Contracts and NDAs"
                          />
                        </MailForm>
                      </div>
                    </details>
                  )}
                </td>
                <td>
                  {agreement ? (
                    <Link className="text-link" href={agreement.href}>
                      {agreement.title}
                    </Link>
                  ) : (
                    <span className="table-sub">None</span>
                  )}
                  {duty.file_id && (
                    <Link className="table-sub text-link" href={`/data/files/${duty.file_id}`}>
                      Their contract in Files
                    </Link>
                  )}
                </td>
                <td>
                  {duty.note ? (
                    <span className="hqdata-prose">{duty.note}</span>
                  ) : (
                    <span className="table-sub">None</span>
                  )}
                  {duty.withdrawn ? (
                    duty.key && (
                      <MailForm
                        action={addDutyAction}
                        fields={{ ...fields, key: duty.key }}
                        submitLabel="Add it again"
                        pendingLabel="Adding…"
                        className="hqdata-inline-action"
                      />
                    )
                  ) : (
                    <details className="hqdata-disclose">
                      <summary
                        className={buttonClass({ size: "small", variant: "ghost" })}
                        aria-label={`Withdraw: ${duty.shown}`}
                      >
                        Withdraw
                      </summary>
                      <div className="hqdata-disclose__panel">
                        <MailForm
                          action={withdrawDutyAction}
                          fields={{ ...fields, duty_id: duty.duty_id }}
                          submitLabel="Withdraw it"
                          pendingLabel="Withdrawing…"
                        >
                          <Field
                            id={`${prefix}-why`}
                            label="Why"
                            hint="It does not apply to them, say."
                          >
                            <Input id={`${prefix}-why`} name="why" maxLength={300} />
                          </Field>
                        </MailForm>
                      </div>
                    </details>
                  )}
                </td>
              </tr>
            );
          })}
        </DataTable>
      </RecordSection>

      <RecordSection id="profile-effects" title="What this changes in HQ">
        {profile.effects.length === 0 ? (
          <p className="page-note">{NOTHING_CHANGES}</p>
        ) : (
          <>
            <ul className="hqdata-effects">
              {profile.effects.map((words) => (
                <li key={words}>{words}</li>
              ))}
            </ul>
            <p className="page-note">
              {profile.in_force && profile.applies_from
                ? `In force from ${dayWords(profile.applies_from)}.`
                : profile.applies_words}
            </p>
          </>
        )}
      </RecordSection>

      <RecordSection id="profile-activity" title="Activity">
        {page.events.length === 0 ? (
          <p className="page-note">Nothing yet.</p>
        ) : (
          <ul className="hqdata-evidence">
            {page.events.map((event) => (
              <li key={event.event_id} className="hqdata-evidence__item">
                {VERBS[event.verb] ?? event.verb}
                {event.detail ? ` · ${event.detail}` : ""} · {event.by.name} ·{" "}
                <Timestamp value={event.at} now={now} />
              </li>
            ))}
          </ul>
        )}
      </RecordSection>
    </div>
  );
}

/** The rules and the day: ticking a regime adds its duties, each once, unchecked. */
function RulesForm({
  profile,
  fields,
}: {
  profile: ProfileDetail;
  fields: Record<string, string>;
}) {
  return (
    <MailForm
      action={updateProfileAction}
      fields={fields}
      submitLabel="Save"
      pendingLabel="Saving…"
    >
      <fieldset className="hqdata-regimes">
        <legend>The rules they work under</legend>
        <Checkbox
          id="rules-sebi"
          name="sebi"
          label={REGIME_WORDS.sebi}
          defaultChecked={profile.regimes.sebi !== null}
        />
        <Field id="rules-sebi-category" label="SEBI CSCRF category">
          <Select
            id="rules-sebi-category"
            name="sebi_category"
            defaultValue={profile.regimes.sebi?.category ?? ""}
          >
            {Object.entries(SEBI_CATEGORY_WORDS).map(([key, words]) => (
              <option key={key} value={key}>
                {key === "" ? "Not given" : words.charAt(0).toUpperCase() + words.slice(1)}
              </option>
            ))}
          </Select>
        </Field>
        <Checkbox
          id="rules-dora"
          name="dora"
          label={REGIME_WORDS.dora}
          defaultChecked={profile.regimes.dora !== null}
        />
        <Field
          id="rules-dora-critical"
          label="The service supports a critical or important function"
        >
          <Select
            id="rules-dora-critical"
            name="dora_critical"
            defaultValue={profile.regimes.dora?.critical_function ?? ""}
          >
            <option value="">{FLAGS[""]}</option>
            <option value="yes">{FLAGS.yes}</option>
            <option value="no">{FLAGS.no}</option>
          </Select>
        </Field>
        <Checkbox
          id="rules-uk"
          name="uk"
          label={REGIME_WORDS.uk}
          defaultChecked={profile.regimes.uk !== null}
        />
        <Field id="rules-uk-note" label="UK note">
          <Input
            id="rules-uk-note"
            name="uk_note"
            maxLength={300}
            defaultValue={profile.regimes.uk?.note ?? ""}
          />
        </Field>
        <Field id="rules-other" label="Other rules" hint="300 characters at most.">
          <Input
            id="rules-other"
            name="other"
            maxLength={300}
            defaultValue={profile.regimes.other}
          />
        </Field>
      </fieldset>
      <Field
        id="rules-applies"
        label="Applies from"
        hint="The day the contract starts. Until then nothing is in force."
      >
        <Input
          id="rules-applies"
          name="applies_from"
          type="date"
          defaultValue={profile.applies_from ?? ""}
        />
      </Field>
      <Field id="rules-notes" label="Notes">
        <Textarea
          id="rules-notes"
          name="notes"
          rows={3}
          maxLength={2000}
          defaultValue={profile.notes}
        />
      </Field>
    </MailForm>
  );
}
