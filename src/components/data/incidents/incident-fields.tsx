import { Field, Input, Select, Textarea } from "@/components/ui/field";
import {
  INCIDENT_KINDS,
  INCIDENT_KIND_KEYS,
  INCIDENT_SEVERITIES,
  REPORT_CHANNELS,
  isListedKind,
} from "@/lib/data/labels-security";

/**
 * The incident register's forms (ws-notes/duties/spec.md §6.3): logging one (or editing it),
 * a moment in India time (a day and an HH:MM, never this browser's zone), the report to
 * CERT-In as recorded, and why it was not reportable. Server components: the forms post to
 * the area's actions.
 */

export type IncidentValues = {
  title: string;
  kind: string;
  severity: string;
  personal_data: boolean;
  summary: string;
  systems: string;
  actions: string;
  lessons?: string;
  aware_day: string;
  aware_time: string;
  occurred_day?: string;
  occurred_time?: string;
};

/** A day and a minute in India time, each its own field. */
export function MomentFields({
  prefix,
  dayName,
  timeName,
  dayLabel,
  timeLabel,
  day,
  time,
  max,
  required = true,
}: {
  prefix: string;
  dayName: string;
  timeName: string;
  dayLabel: string;
  timeLabel: string;
  day: string;
  time: string;
  max?: string;
  required?: boolean;
}) {
  return (
    <div className="hqdata-registers__pair">
      <Field id={`${prefix}-day`} label={dayLabel}>
        <Input
          id={`${prefix}-day`}
          name={dayName}
          type="date"
          required={required}
          defaultValue={day}
          {...(max ? { max } : {})}
        />
      </Field>
      <Field id={`${prefix}-time`} label={timeLabel}>
        <Input
          id={`${prefix}-time`}
          name={timeName}
          type="time"
          required={required}
          defaultValue={time}
        />
      </Field>
    </div>
  );
}

export function IncidentFields({
  prefix,
  values,
  today,
  editing = false,
}: {
  prefix: string;
  values: IncidentValues;
  today: string;
  editing?: boolean;
}) {
  const listed = INCIDENT_KIND_KEYS.filter(isListedKind);
  return (
    <>
      <Field id={`${prefix}-title`} label="What happened">
        <Input
          id={`${prefix}-title`}
          name="title"
          required
          minLength={3}
          maxLength={200}
          defaultValue={values.title}
        />
      </Field>
      <Field id={`${prefix}-kind`} label="Kind">
        <Select id={`${prefix}-kind`} name="kind" required defaultValue={values.kind}>
          <option value="" disabled>
            Choose the kind
          </option>
          <optgroup label="On CERT-In's list">
            {listed.map((kind) => (
              <option key={kind} value={kind}>
                {INCIDENT_KINDS[kind]}
              </option>
            ))}
          </optgroup>
          <optgroup label="Not on the list">
            <option value="other">{INCIDENT_KINDS.other}</option>
          </optgroup>
        </Select>
      </Field>
      <MomentFields
        prefix={`${prefix}-aware`}
        dayName="aware_day"
        timeName="aware_time"
        dayLabel="Noticed on"
        timeLabel="Noticed at, India time"
        day={values.aware_day}
        time={values.aware_time}
        max={today}
      />
      {editing && (
        <MomentFields
          prefix={`${prefix}-occurred`}
          dayName="occurred_day"
          timeName="occurred_time"
          dayLabel="Happened on"
          timeLabel="Happened at, India time"
          day={values.occurred_day ?? ""}
          time={values.occurred_time ?? ""}
          max={today}
          required={false}
        />
      )}
      <Field id={`${prefix}-severity`} label="Severity">
        <Select id={`${prefix}-severity`} name="severity" defaultValue={values.severity}>
          {Object.entries(INCIDENT_SEVERITIES).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </Select>
      </Field>
      <label className="choice">
        <input type="checkbox" name="personal_data" defaultChecked={values.personal_data} />
        <span>Personal data is involved</span>
      </label>
      <Field id={`${prefix}-systems`} label="What is affected">
        <Textarea
          id={`${prefix}-systems`}
          name="systems"
          rows={3}
          maxLength={4000}
          defaultValue={values.systems}
        />
      </Field>
      <Field id={`${prefix}-actions`} label="What has been done so far">
        <Textarea
          id={`${prefix}-actions`}
          name="actions"
          rows={3}
          maxLength={4000}
          defaultValue={values.actions}
        />
      </Field>
      {editing && (
        <>
          <Field id={`${prefix}-summary`} label="Summary">
            <Textarea
              id={`${prefix}-summary`}
              name="summary"
              rows={3}
              maxLength={4000}
              defaultValue={values.summary}
            />
          </Field>
          <Field id={`${prefix}-lessons`} label="Lessons">
            <Textarea
              id={`${prefix}-lessons`}
              name="lessons"
              rows={3}
              maxLength={4000}
              defaultValue={values.lessons ?? ""}
            />
          </Field>
        </>
      )}
    </>
  );
}

export function ReportFields({
  prefix,
  today,
  time,
  hours,
}: {
  prefix: string;
  today: string;
  time: string;
  /** The rule's hours, for the late-reason hint; null without the rule book. */
  hours: number | null;
}) {
  return (
    <>
      <MomentFields
        prefix={`${prefix}-sent`}
        dayName="sent_day"
        timeName="sent_time"
        dayLabel="Sent on"
        timeLabel="Sent at, India time"
        day={today}
        time={time}
        max={today}
      />
      <Field id={`${prefix}-channel`} label="How">
        <Select id={`${prefix}-channel`} name="channel" defaultValue="email">
          {Object.entries(REPORT_CHANNELS).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </Select>
      </Field>
      <Field id={`${prefix}-reference`} label="CERT-In's reference">
        <Input id={`${prefix}-reference`} name="reference" maxLength={80} />
      </Field>
      <Field id={`${prefix}-sent-by`} label="Sent by">
        <Input id={`${prefix}-sent-by`} name="sent_by" maxLength={120} />
      </Field>
      <Field
        id={`${prefix}-late`}
        label="Why it went late"
        hint={
          hours === null
            ? "Only when it went after the deadline."
            : `Needed when it went after the ${hours} ${hours === 1 ? "hour" : "hours"}, in a line.`
        }
      >
        <Textarea id={`${prefix}-late`} name="late_reason" rows={2} maxLength={500} />
      </Field>
    </>
  );
}
