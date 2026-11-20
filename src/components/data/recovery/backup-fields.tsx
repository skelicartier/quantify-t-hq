import { Field, Input, Select, Textarea } from "@/components/ui/field";
import type { BackupRow } from "@/lib/data/api/recovery";
import { FLAGS } from "@/lib/data/labels-company";
import { HOW_OFTEN, OUTCOMES } from "@/lib/data/labels-devices";

/**
 * The forms of Systems › Backups (ws-notes/security/spec.md §7.6): a backup, and a restore
 * test that records how long it took and what came back. No target field anywhere: a restore
 * is never held against a figure.
 */

type Tool = { tool_id: string; name: string };

function FlagSelect({
  id,
  name,
  label,
  value,
}: {
  id: string;
  name: string;
  label: string;
  value: string;
}) {
  return (
    <Field id={id} label={label}>
      <Select id={id} name={name} defaultValue={value}>
        {(["", "yes", "no"] as const).map((key) => (
          <option key={key || "unknown"} value={key}>
            {FLAGS[key]}
          </option>
        ))}
      </Select>
    </Field>
  );
}

export function BackupFields({
  prefix,
  values,
  tools,
  toolsLoaded,
  dataListed,
}: {
  prefix: string;
  values: BackupRow | null;
  tools: readonly Tool[];
  toolsLoaded: boolean;
  /** Data's own backup is already listed, so it is not offered again. */
  dataListed: boolean;
}) {
  const system = values?.kind !== "hq_data";
  return (
    <>
      {!values && !dataListed && (
        <Field id={`${prefix}-kind`} label="What kind">
          <Select id={`${prefix}-kind`} name="kind" defaultValue="system">
            <option value="system">A system&rsquo;s backup</option>
            <option value="hq_data">Data&rsquo;s own backup, the zip from this Mac</option>
          </Select>
        </Field>
      )}
      {system && toolsLoaded && (
        <Field
          id={`${prefix}-tool`}
          label="The system it backs up"
          hint="A tool in Systems, or leave it for something else."
        >
          <Select id={`${prefix}-tool`} name="tool_id" defaultValue={values?.tool_id ?? ""}>
            <option value="">Something else</option>
            {tools.map((tool) => (
              <option key={tool.tool_id} value={tool.tool_id}>
                {tool.name}
              </option>
            ))}
          </Select>
        </Field>
      )}
      <Field id={`${prefix}-name`} label="Name" hint="Such as the product's database.">
        <Input
          id={`${prefix}-name`}
          name="name"
          maxLength={120}
          defaultValue={values?.name ?? ""}
        />
      </Field>
      <Field id={`${prefix}-what`} label="What it holds">
        <Input
          id={`${prefix}-what`}
          name="what"
          maxLength={200}
          defaultValue={values?.what ?? ""}
        />
      </Field>
      <div className="hqdata-devices__pair">
        <Field id={`${prefix}-often`} label="How often">
          <Select id={`${prefix}-often`} name="how_often" defaultValue={values?.how_often ?? ""}>
            {Object.entries(HOW_OFTEN).map(([key, label]) => (
              <option key={key || "unset"} value={key}>
                {label}
              </option>
            ))}
          </Select>
        </Field>
        <Field id={`${prefix}-every`} label="Restore test every … months">
          <Input
            id={`${prefix}-every`}
            name="every_months"
            type="number"
            min={1}
            max={12}
            step={1}
            inputMode="numeric"
            defaultValue={values?.every_months ?? 3}
          />
        </Field>
      </div>
      <Field id={`${prefix}-where`} label="Where it is kept">
        <Input
          id={`${prefix}-where`}
          name="where"
          maxLength={200}
          defaultValue={values?.where ?? ""}
        />
      </Field>
      <div className="hqdata-devices__pair">
        <FlagSelect
          id={`${prefix}-away`}
          name="off_system"
          label="A copy is kept away from the system"
          value={values?.off_system ?? ""}
        />
        <FlagSelect
          id={`${prefix}-fixed`}
          name="cannot_be_changed"
          label="A copy nobody can change for a while"
          value={values?.cannot_be_changed ?? ""}
        />
      </div>
      <Field id={`${prefix}-owner`} label="Who looks after it">
        <Input
          id={`${prefix}-owner`}
          name="owner"
          maxLength={200}
          defaultValue={values?.owner ?? ""}
        />
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

export function RestoreFields({ prefix, today }: { prefix: string; today: string }) {
  return (
    <>
      <div className="hqdata-devices__pair">
        <Field id={`${prefix}-on`} label="On">
          <Input id={`${prefix}-on`} name="on" type="date" max={today} defaultValue={today} />
        </Field>
        <Field id={`${prefix}-by`} label="Run by">
          <Input id={`${prefix}-by`} name="by_name" required maxLength={120} />
        </Field>
      </div>
      <div className="hqdata-devices__pair">
        <Field id={`${prefix}-minutes`} label="How long it took, in minutes">
          <Input
            id={`${prefix}-minutes`}
            name="minutes"
            type="number"
            min={0}
            max={100000}
            step={1}
            inputMode="numeric"
          />
        </Field>
        <Field id={`${prefix}-outcome`} label="Outcome">
          <Select id={`${prefix}-outcome`} name="outcome" defaultValue="complete">
            {Object.entries(OUTCOMES).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <Field id={`${prefix}-what`} label="What was restored">
        <Input id={`${prefix}-what`} name="what_restored" maxLength={500} />
      </Field>
      <Field id={`${prefix}-note`} label="Note" hint="After a partial restore, what was missing.">
        <Textarea id={`${prefix}-note`} name="note" rows={2} maxLength={1000} />
      </Field>
    </>
  );
}
