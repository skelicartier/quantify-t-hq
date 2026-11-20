import { Field, Input, Select, Textarea } from "@/components/ui/field";
import type { FileOption } from "@/components/data/meetings/copy-fields";
import type { DeviceRow } from "@/lib/data/api/devices";
import {
  ACK_HOW,
  CHECK_FLAGS,
  CHECK_QUESTIONS,
  DEVICE_CHECK_HINT,
  DEVICE_KINDS,
  DEVICE_PLATFORMS,
  OWNERSHIPS,
} from "@/lib/data/labels-devices";

/**
 * The forms of Systems › Devices (ws-notes/security/spec.md §7.6): a device, a self-check with
 * the fields of `SelfCheck` in order, and an acknowledgement of the personal devices policy. A
 * field that might attract a password says where it is kept, never the password.
 */

function FlagSelect({
  id,
  name,
  label,
  hint,
  withNotApplicable = false,
}: {
  id: string;
  name: string;
  label: string;
  hint?: string;
  withNotApplicable?: boolean;
}) {
  const keys = withNotApplicable
    ? (["", "yes", "no", "not_applicable"] as const)
    : (["", "yes", "no"] as const);
  return (
    <Field id={id} label={label} {...(hint ? { hint } : {})}>
      <Select id={id} name={name} defaultValue="">
        {keys.map((key) => (
          <option key={key || "unknown"} value={key}>
            {CHECK_FLAGS[key]}
          </option>
        ))}
      </Select>
    </Field>
  );
}

export function DeviceFields({ prefix, values }: { prefix: string; values: DeviceRow | null }) {
  return (
    <>
      <Field
        id={`${prefix}-holder`}
        label="Holder"
        hint="Who has it, as you know them. Never a password."
      >
        <Input
          id={`${prefix}-holder`}
          name="holder"
          required
          maxLength={200}
          defaultValue={values?.holder ?? ""}
        />
      </Field>
      <div className="hqdata-devices__pair">
        <Field id={`${prefix}-kind`} label="Kind">
          <Select id={`${prefix}-kind`} name="kind" defaultValue={values?.kind ?? "laptop"}>
            {Object.entries(DEVICE_KINDS).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </Select>
        </Field>
        <Field id={`${prefix}-ownership`} label="Company or personal">
          <Select
            id={`${prefix}-ownership`}
            name="ownership"
            defaultValue={values?.ownership ?? "company"}
          >
            {Object.entries(OWNERSHIPS).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <Field id={`${prefix}-model`} label="Model">
        <Input
          id={`${prefix}-model`}
          name="model"
          maxLength={120}
          defaultValue={values?.model ?? ""}
        />
      </Field>
      <div className="hqdata-devices__pair">
        <Field id={`${prefix}-serial`} label="Serial">
          <Input
            id={`${prefix}-serial`}
            name="serial"
            maxLength={80}
            spellCheck={false}
            autoCapitalize="none"
            defaultValue={values?.serial ?? ""}
          />
        </Field>
        <Field id={`${prefix}-platform`} label="System">
          <Select
            id={`${prefix}-platform`}
            name="platform"
            defaultValue={values?.platform ?? "mac"}
          >
            {Object.entries(DEVICE_PLATFORMS).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <Field id={`${prefix}-issued`} label="Issued on" hint="A company device only.">
        <Input
          id={`${prefix}-issued`}
          name="issued_on"
          type="date"
          defaultValue={values?.issued_on ?? ""}
        />
      </Field>
      <Field
        id={`${prefix}-notes`}
        label="Notes"
        hint="Where its recovery key is kept, for instance. Never the key or a password."
      >
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

/** "Record a self-check": the fields of `SelfCheck` in order, then the screenshots. */
export function CheckFields({
  prefix,
  today,
  files,
  filesHere,
}: {
  prefix: string;
  today: string;
  files: readonly FileOption[];
  filesHere: boolean;
}) {
  const q = CHECK_QUESTIONS;
  return (
    <>
      <p className="field__hint">{DEVICE_CHECK_HINT}</p>
      <div className="hqdata-devices__pair">
        <Field id={`${prefix}-on`} label="On">
          <Input id={`${prefix}-on`} name="on" type="date" max={today} defaultValue={today} />
        </Field>
        <Field id={`${prefix}-by`} label="Checked by">
          <Input id={`${prefix}-by`} name="by_name" required maxLength={120} />
        </Field>
      </div>
      <FlagSelect
        id={`${prefix}-encryption`}
        name="encryption"
        label={q.encryption.label}
        hint={q.encryption.hint}
      />
      <Field
        id={`${prefix}-lock`}
        label={q.screen_lock_minutes.label}
        hint={q.screen_lock_minutes.hint}
      >
        <Input
          id={`${prefix}-lock`}
          name="screen_lock_minutes"
          type="number"
          min={0}
          max={1440}
          step={1}
          inputMode="numeric"
        />
      </Field>
      <Field id={`${prefix}-os`} label={q.os_version.label} hint={q.os_version.hint}>
        <Input id={`${prefix}-os`} name="os_version" maxLength={60} />
      </Field>
      <FlagSelect
        id={`${prefix}-updates`}
        name="updates_automatic"
        label={q.updates_automatic.label}
        hint={q.updates_automatic.hint}
      />
      <FlagSelect
        id={`${prefix}-passwords`}
        name="password_manager"
        label={q.password_manager.label}
        hint={q.password_manager.hint}
      />
      <FlagSelect
        id={`${prefix}-malware`}
        name="malware_protection"
        label={q.malware_protection.label}
        hint={q.malware_protection.hint}
        withNotApplicable
      />
      <FlagSelect id={`${prefix}-firewall`} name="firewall" label={q.firewall.label} />
      <FlagSelect
        id={`${prefix}-local`}
        name="work_data_local"
        label={q.work_data_local.label}
        hint={q.work_data_local.hint}
      />
      {filesHere ? (
        <fieldset className="hqdata-copy">
          <legend>Screenshots</legend>
          <Field id={`${prefix}-shot-file`} label="Choose from Files">
            <Select id={`${prefix}-shot-file`} name="screenshot_file_id" defaultValue="">
              <option value="">None chosen</option>
              {files.map((file) => (
                <option key={file.file_id} value={file.file_id}>
                  {file.folder ? `${file.folder} › ${file.title}` : file.title}
                </option>
              ))}
            </Select>
          </Field>
          <Field
            id={`${prefix}-shots`}
            label="Or attach them here"
            hint="Pictures or PDFs, 5 at most and 3 MB in all. They go into Security › Devices, in Files."
          >
            <Input
              id={`${prefix}-shots`}
              name="screenshots"
              type="file"
              multiple
              accept="image/png,image/jpeg,image/gif,image/webp,application/pdf"
            />
          </Field>
        </fieldset>
      ) : (
        <p className="field__hint">Files is not set up here, so no screenshot can be kept.</p>
      )}
      <Field id={`${prefix}-note`} label="Note">
        <Textarea id={`${prefix}-note`} name="note" rows={2} maxLength={1000} />
      </Field>
    </>
  );
}

/** "Record an acknowledgement": the policy (pre-filled when Assurance links one), on, how, by whom. */
export function AckFields({
  prefix,
  today,
  files,
  policyFileId,
}: {
  prefix: string;
  today: string;
  files: readonly FileOption[];
  policyFileId: string | null;
}) {
  return (
    <>
      <Field
        id={`${prefix}-policy`}
        label="The personal devices policy"
        hint="The document in Files it was given on. Its current version is recorded with it."
      >
        <Select
          id={`${prefix}-policy`}
          name="policy_file_id"
          required
          defaultValue={policyFileId ?? ""}
        >
          <option value="">Choose a document</option>
          {files.map((file) => (
            <option key={file.file_id} value={file.file_id}>
              {file.folder ? `${file.folder} › ${file.title}` : file.title}
            </option>
          ))}
        </Select>
      </Field>
      <div className="hqdata-devices__pair">
        <Field id={`${prefix}-on`} label="On">
          <Input id={`${prefix}-on`} name="on" type="date" max={today} defaultValue={today} />
        </Field>
        <Field id={`${prefix}-how`} label="How it was given">
          <Select id={`${prefix}-how`} name="how" defaultValue="signed">
            {Object.entries(ACK_HOW).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <Field id={`${prefix}-by`} label="Given by">
        <Input id={`${prefix}-by`} name="by_name" required maxLength={120} />
      </Field>
    </>
  );
}
