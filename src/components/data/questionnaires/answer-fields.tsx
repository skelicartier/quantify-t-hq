import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/field";
import type { EvidenceOptionView, LibraryAnswer } from "@/lib/data/api/questionnaires";
import { notLoaded } from "@/lib/data/labels-controls";
import { SHORT_WORDS, SSRM_WORDS, TOPIC_WORDS } from "@/lib/data/labels-questionnaires";

type FileOption = { file_id: string; title: string; folder: string };

/**
 * An approved answer's fields (ws-notes/security/spec.md §9.2, §9.4): his canonical question,
 * the answer, the short answer, the topic, CAIQ IDs (the format only is checked) and other IDs
 * as typed, CAIQ's ownership column, its evidence (records other modules offer, and a file in
 * Files), and its owner. A module that is not loaded is named in one line.
 */
export function AnswerFields({
  prefix,
  answer,
  options,
  absent,
  files,
  filesHere,
}: {
  prefix: string;
  answer: LibraryAnswer | null;
  options: readonly EvidenceOptionView[];
  absent: readonly string[];
  files: readonly FileOption[];
  filesHere: boolean;
}) {
  const chosen = new Set(answer?.evidence ?? []);
  const fileRefs = (answer?.evidence ?? []).filter((ref) => ref.startsWith("file:"));
  const titleOf = (ref: string) =>
    files.find((file) => `file:${file.file_id}` === ref)?.title ?? "A file in Files";
  return (
    <>
      <Field
        id={`${prefix}-question`}
        label="The question"
        hint="As you would ask it: 3 to 500 characters."
      >
        <Textarea
          id={`${prefix}-question`}
          name="question"
          rows={2}
          maxLength={500}
          defaultValue={answer?.question ?? ""}
          required
        />
      </Field>
      <Field id={`${prefix}-answer`} label="The answer" hint="4,000 characters at most.">
        <Textarea
          id={`${prefix}-answer`}
          name="answer"
          rows={4}
          maxLength={4000}
          defaultValue={answer?.answer ?? ""}
          required
        />
      </Field>
      <Field id={`${prefix}-short`} label="Short answer">
        <Select id={`${prefix}-short`} name="short" defaultValue={answer?.short ?? ""}>
          {Object.entries(SHORT_WORDS).map(([key, words]) => (
            <option key={key} value={key}>
              {words || "None"}
            </option>
          ))}
        </Select>
      </Field>
      <Field id={`${prefix}-topic`} label="Topic">
        <Select id={`${prefix}-topic`} name="topic" defaultValue={answer?.topic ?? "other"}>
          {Object.entries(TOPIC_WORDS).map(([key, words]) => (
            <option key={key} value={key}>
              {words}
            </option>
          ))}
        </Select>
      </Field>
      <Field
        id={`${prefix}-caiq`}
        label="CAIQ IDs"
        hint="As its file writes them, such as A&A-01.1; commas between them. 20 at most."
      >
        <Input
          id={`${prefix}-caiq`}
          name="caiq_ids"
          maxLength={1000}
          autoComplete="off"
          defaultValue={answer?.caiq_ids.join(", ") ?? ""}
        />
      </Field>
      <Field
        id={`${prefix}-other`}
        label="Other IDs"
        hint="A SIG ID or a buyer's own, as typed; commas between them. 10 at most."
      >
        <Input
          id={`${prefix}-other`}
          name="other_ids"
          maxLength={1000}
          autoComplete="off"
          defaultValue={answer?.other_ids.join(", ") ?? ""}
        />
      </Field>
      <Field
        id={`${prefix}-ssrm`}
        label="Who owns the control (SSRM)"
        hint="For the CAIQ's ownership column."
      >
        <Select id={`${prefix}-ssrm`} name="ssrm" defaultValue={answer?.ssrm ?? ""}>
          {Object.entries(SSRM_WORDS).map(([key, words]) => (
            <option key={key} value={key}>
              {words || "Not given"}
            </option>
          ))}
        </Select>
      </Field>
      <fieldset className="hqdata-evidence-picks">
        <legend>Evidence</legend>
        {options.length === 0 && fileRefs.length === 0 && (
          <p className="field__hint">No record is offered as evidence here yet.</p>
        )}
        {options.map((option, index) => (
          <Checkbox
            key={option.ref}
            id={`${prefix}-evidence-${index}`}
            name="evidence"
            value={option.ref}
            defaultChecked={chosen.has(option.ref)}
            label={
              option.current ? option.label : `${option.label} (${option.why || "not current"})`
            }
          />
        ))}
        {fileRefs.map((ref, index) => (
          <Checkbox
            key={ref}
            id={`${prefix}-evidence-file-${index}`}
            name="evidence"
            value={ref}
            defaultChecked
            label={titleOf(ref)}
          />
        ))}
        {absent.length > 0 && (
          <p className="field__hint">{absent.map((name) => notLoaded(name)).join(" ")}</p>
        )}
      </fieldset>
      {filesHere ? (
        <Field id={`${prefix}-file`} label="A file in Files as evidence">
          <Select id={`${prefix}-file`} name="evidence_file" defaultValue="">
            <option value="">None chosen</option>
            {files.map((file) => (
              <option key={file.file_id} value={file.file_id}>
                {file.folder ? `${file.folder} › ${file.title}` : file.title}
              </option>
            ))}
          </Select>
        </Field>
      ) : (
        <p className="field__hint">{notLoaded("Files")}</p>
      )}
      <Field id={`${prefix}-owner`} label="Owner" hint="Who keeps this answer true.">
        <Input
          id={`${prefix}-owner`}
          name="owner"
          maxLength={120}
          defaultValue={answer?.owner ?? ""}
        />
      </Field>
    </>
  );
}
