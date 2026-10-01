import Link from "next/link";

import { recordReferenceAction } from "@/app/(portal)/success/relationship-actions";
import { ReferenceStatePill } from "@/components/success/relationship-parts";
import { ActForm } from "@/components/ui/act-form";
import { Callout } from "@/components/ui/callout";
import { DataTable } from "@/components/ui/data-table";
import { Checkbox, Field, Input, Select } from "@/components/ui/field";
import { Popover } from "@/components/ui/popover";
import { HqApiRequestError, HqApiUnavailableError } from "@/lib/api/core";
import { readReferences, type References } from "@/lib/api/relationships";
import { formatDate } from "@/lib/format";

const COLUMNS = [
  { key: "who", label: "Who" },
  { key: "what", label: "Agreed to" },
  { key: "state", label: "State" },
  { key: "until", label: "Until" },
  { key: "calls", label: "Calls this quarter", align: "end" as const },
];

/** What this firm agreed to be a reference for, and recording a new yes. */
export async function CompanyReferences({
  token,
  companyId,
  people,
  canWrite,
  today,
}: {
  token: string;
  companyId: string;
  people: ReadonlyArray<{ person_id: string; full_name: string }>;
  canWrite: boolean;
  today: string;
}) {
  let list: References | null = null;
  try {
    list = await readReferences(token, { company_id: companyId });
  } catch (error) {
    if (!(error instanceof HqApiUnavailableError || error instanceof HqApiRequestError))
      throw error;
  }
  if (list === null)
    return (
      <Callout tone="danger" role="alert">
        The references could not be read just now.
      </Callout>
    );
  return (
    <div className="stack-form">
      <DataTable
        caption="What this firm agreed to be a reference for"
        columns={COLUMNS}
        isEmpty={list.references.length === 0}
        empty={
          <p className="muted">No consent recorded. Nobody here has agreed to be a reference.</p>
        }
        columnMenu={false}
      >
        {list.references.map((item) => (
          <tr key={item.reference_id}>
            <td>
              <Link href={`/success/references/${item.reference_id}`}>
                {item.person_name || "Someone at the firm"}
              </Link>
            </td>
            <td>{item.kind_labels.join(" · ")}</td>
            <td>
              <ReferenceStatePill state={item.state} />
            </td>
            <td>{formatDate(item.expires_on, "—")}</td>
            <td className="data-table__num">
              {item.kinds.includes("call")
                ? `${item.calls_this_quarter} of ${item.calls_per_quarter}`
                : "—"}
            </td>
          </tr>
        ))}
      </DataTable>
      {canWrite && (
        <Popover label="Record consent" width="wide" align="start">
          <ActForm
            action={recordReferenceAction}
            hidden={{ company_id: companyId }}
            act="record"
            label="Record it"
            primary
            tight={false}
          >
            <fieldset className="checkbox-group">
              <legend>They agreed to</legend>
              {list.kinds.map((kind) => (
                <Checkbox
                  key={kind.value}
                  id={`ref-kind-${kind.value}`}
                  name="kinds"
                  value={kind.value}
                  label={kind.label}
                  defaultChecked={kind.value === "call"}
                />
              ))}
            </fieldset>
            <div className="form-grid">
              <Field id="ref-person" label="Who agreed">
                <Select id="ref-person" name="person_id" defaultValue={people[0]?.person_id ?? ""}>
                  {people.map((person) => (
                    <option key={person.person_id} value={person.person_id}>
                      {person.full_name}
                    </option>
                  ))}
                  <option value="">Someone not on file</option>
                </Select>
              </Field>
              <Field id="ref-contact" label="If not on file, their name">
                <Input id="ref-contact" name="contact_name" maxLength={160} />
              </Field>
            </div>
            <Field
              id="ref-evidence"
              label="Where the yes is written down"
              hint="An email, a signed form."
            >
              <Input id="ref-evidence" name="evidence" maxLength={400} />
            </Field>
            <div className="form-grid">
              <Field id="ref-given" label="Agreed on">
                <Input
                  id="ref-given"
                  name="given_on"
                  type="date"
                  max={today}
                  defaultValue={today}
                />
              </Field>
              <Field id="ref-expires" label="Until" hint="A year unless they said otherwise.">
                <Input id="ref-expires" name="expires_on" type="date" min={today} />
              </Field>
            </div>
            <div className="form-grid">
              <Field id="ref-calls" label="Calls a quarter at most">
                <Input
                  id="ref-calls"
                  name="calls_per_quarter"
                  type="number"
                  min={0}
                  max={12}
                  defaultValue={2}
                />
              </Field>
              <Field id="ref-scope" label="Anything they set as a limit">
                <Input
                  id="ref-scope"
                  name="scope"
                  maxLength={1000}
                  placeholder="Only funds under 50 people"
                />
              </Field>
            </div>
          </ActForm>
        </Popover>
      )}
    </div>
  );
}
