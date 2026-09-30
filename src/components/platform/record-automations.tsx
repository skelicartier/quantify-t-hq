import { runAutomationAction } from "@/app/(portal)/_actions/automations";
import { RecordSection } from "@/components/ui/record-shell";
import { RowAction } from "@/components/ui/row-action";
import { readRecordAutomations, type RecordAutomations as Data } from "@/lib/api/automations";
import { HqApiRequestError, HqApiUnavailableError } from "@/lib/api/core";
import { formatAbsolute } from "@/lib/format";

const OUTCOME: Record<string, string> = {
  done: "Done",
  failed: "Failed",
  skipped_loop: "Stopped by the loop guard",
};

/**
 * On a record page: the automations with a button for this kind of record, and what
 * automations did to this one lately. Absent when there is neither.
 */
export async function RecordAutomations({
  token,
  recordType,
  recordId,
  returnPath,
}: {
  token: string;
  recordType: "company" | "person" | "deal" | "lead";
  recordId: string;
  returnPath: string;
}) {
  let data: Data | null = null;
  try {
    data = await readRecordAutomations(token, recordType, recordId);
  } catch (error) {
    if (!(error instanceof HqApiUnavailableError || error instanceof HqApiRequestError))
      throw error;
  }
  if (data === null || (data.buttons.length === 0 && data.runs.length === 0)) return null;
  return (
    <RecordSection id={`${recordType}-automations`} title="Automations">
      {data.can_press &&
        data.buttons.map((button) => (
          <RowAction
            key={button.automation_id}
            action={runAutomationAction}
            fields={{
              automation_id: button.automation_id,
              record_id: recordId,
              return_path: returnPath,
            }}
            buttons={[
              {
                label: button.name,
                pendingLabel: "Running…",
                className: "btn btn--small",
                ariaLabel: `Run the automation ${button.name} on this record`,
              },
            ]}
            sentLabel="Ran."
          />
        ))}
      {data.runs.length > 0 && (
        <ul className="side-list">
          {data.runs.slice(0, 5).map((run) => (
            <li key={run.run_id}>
              <span>
                {run.automation_name}: {OUTCOME[run.outcome] ?? run.outcome}
              </span>
              <span className="side-quiet">{formatAbsolute(run.at, "—")}</span>
            </li>
          ))}
        </ul>
      )}
    </RecordSection>
  );
}
