import { Field, Input, Select } from "@/components/ui/field";

export type FileOption = { file_id: string; title: string; folder: string };

/**
 * "Choose from Files" or "Or attach it here" (3 MB at most): the copy a register keeps in
 * Files. Without Files the form says so in one sentence and keeps nothing.
 */
export function CopyFields({
  prefix,
  label,
  files,
  filesHere,
  folder,
}: {
  prefix: string;
  label: string;
  files: readonly FileOption[];
  filesHere: boolean;
  /** Where an attached copy goes, as the hint says it. */
  folder: string;
}) {
  if (!filesHere)
    return <p className="field__hint">Files is not set up here, so no copy can be kept.</p>;
  return (
    <fieldset className="hqdata-copy">
      <legend>{label}</legend>
      <Field id={`${prefix}-file-id`} label="Choose from Files">
        <Select id={`${prefix}-file-id`} name="file_id" defaultValue="">
          <option value="">None chosen</option>
          {files.map((file) => (
            <option key={file.file_id} value={file.file_id}>
              {file.folder ? `${file.folder} › ${file.title}` : file.title}
            </option>
          ))}
        </Select>
      </Field>
      <Field
        id={`${prefix}-file`}
        label="Or attach it here"
        hint={`3 MB at most. It goes into ${folder}, in Files.`}
      >
        <Input id={`${prefix}-file`} name="file" type="file" />
      </Field>
    </fieldset>
  );
}
