import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/field";
import type { LogRow, ToolOption } from "@/lib/data/api/logs";
import { FLAGS } from "@/lib/data/labels-company";
import { LOG_KINDS, notLoaded } from "@/lib/data/labels-controls";
import { LOG_PLACES, TIME_SOURCES } from "@/lib/data/labels-devices";

/**
 * The forms of Systems › Logs and time (ws-notes/security/spec.md §7.6): a system (a tool from
 * Systems, or "Something else" and a name), what it logs, where, for how long, whether in India,
 * its clock; and a look. Nothing here is a password.
 */

const PLACE_CHOICES = ["", "india", "outside", "not_known"] as const;
const TIME_CHOICES = ["", "nic", "npl", "cloud", "other", "not_known"] as const;

export function LogFields({
  prefix,
  values,
  tools,
  toolsLoaded,
}: {
  prefix: string;
  values: LogRow | null;
  tools: readonly ToolOption[];
  toolsLoaded: boolean;
}) {
  return (
    <>
      {toolsLoaded ? (
        <div className="hqdata-devices__pair">
          <Field id={`${prefix}-tool`} label="System">
            <Select id={`${prefix}-tool`} name="tool_id" defaultValue={values?.tool_id ?? ""}>
              <option value="">Something else</option>
              {tools.map((tool) => (
                <option key={tool.tool_id} value={tool.tool_id}>
                  {tool.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field id={`${prefix}-name`} label="Its name, for something else">
            <Input
              id={`${prefix}-name`}
              name="name"
              maxLength={120}
              defaultValue={values && !values.tool_id ? values.name : ""}
            />
          </Field>
        </div>
      ) : (
        <Field id={`${prefix}-name`} label="System" hint={notLoaded("Tools")}>
          <Input
            id={`${prefix}-name`}
            name="name"
            required
            maxLength={120}
            defaultValue={values?.name ?? ""}
          />
        </Field>
      )}
      <fieldset className="hqdata-copy">
        <legend>What it logs</legend>
        {Object.entries(LOG_KINDS).map(([key, label]) => (
          <Checkbox
            key={key}
            id={`${prefix}-kind-${key}`}
            name="kinds"
            value={key}
            label={label}
            defaultChecked={values?.kinds.includes(key as LogRow["kinds"][number]) ?? false}
          />
        ))}
      </fieldset>
      <Field
        id={`${prefix}-where`}
        label="Where they go"
        hint="Such as the cloud's log store, then a bucket."
      >
        <Input
          id={`${prefix}-where`}
          name="where"
          maxLength={200}
          defaultValue={values?.where ?? ""}
        />
      </Field>
      <div className="hqdata-devices__pair">
        <Field id={`${prefix}-kept`} label="Kept for, in days">
          <Input
            id={`${prefix}-kept`}
            name="retention_days"
            type="number"
            min={0}
            max={36500}
            step={1}
            inputMode="numeric"
            defaultValue={values?.retention_days ?? ""}
          />
        </Field>
        <Field id={`${prefix}-place`} label="Kept in India">
          <Select id={`${prefix}-place`} name="place" defaultValue={values?.place ?? ""}>
            {PLACE_CHOICES.map((key) => (
              <option key={key || "unset"} value={key}>
                {LOG_PLACES[key]}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <Field id={`${prefix}-region`} label="Region">
        <Input
          id={`${prefix}-region`}
          name="region"
          maxLength={200}
          defaultValue={values?.region ?? ""}
        />
      </Field>
      <div className="hqdata-devices__pair">
        <Field id={`${prefix}-time`} label="Time source">
          <Select id={`${prefix}-time`} name="time_source" defaultValue={values?.time_source ?? ""}>
            {TIME_CHOICES.map((key) => (
              <option key={key || "unset"} value={key}>
                {TIME_SOURCES[key]}
              </option>
            ))}
          </Select>
        </Field>
        <Field id={`${prefix}-detail`} label="Server or service">
          <Input
            id={`${prefix}-detail`}
            name="time_detail"
            maxLength={200}
            spellCheck={false}
            autoCapitalize="none"
            defaultValue={values?.time_detail ?? ""}
          />
        </Field>
      </div>
      <Field id={`${prefix}-zone`} label="The time zone is kept with each time">
        <Select
          id={`${prefix}-zone`}
          name="zone_recorded"
          defaultValue={values?.zone_recorded ?? ""}
        >
          {(["", "yes", "no"] as const).map((key) => (
            <option key={key || "unknown"} value={key}>
              {FLAGS[key]}
            </option>
          ))}
        </Select>
      </Field>
      <Field id={`${prefix}-notes`} label="Notes">
        <Textarea
          id={`${prefix}-notes`}
          name="notes"
          rows={2}
          maxLength={2000}
          defaultValue={values?.notes ?? ""}
        />
      </Field>
    </>
  );
}

export function LookFields({ prefix, today }: { prefix: string; today: string }) {
  return (
    <>
      <div className="hqdata-devices__pair">
        <Field id={`${prefix}-on`} label="On">
          <Input id={`${prefix}-on`} name="on" type="date" max={today} defaultValue={today} />
        </Field>
        <Field id={`${prefix}-by`} label="Looked at by">
          <Input id={`${prefix}-by`} name="by_name" required maxLength={120} />
        </Field>
      </div>
      <Field
        id={`${prefix}-note`}
        label="What was looked at"
        hint="That the logs are arriving and kept as long as recorded, and that the clock is right."
      >
        <Textarea id={`${prefix}-note`} name="note" rows={3} maxLength={1000} />
      </Field>
    </>
  );
}
