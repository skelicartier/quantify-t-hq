"use client";

import Link from "next/link";
import { useActionState, useRef, useSyncExternalStore } from "react";

import { LinkingForm } from "@/components/data/leads/linking-form";
import { AttemptField } from "@/components/ui/attempt-field";
import { DataTable } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input, Select } from "@/components/ui/field";
import { Popover } from "@/components/ui/popover";
import { StatusPill } from "@/components/ui/status-pill";
import { INITIAL_ACTION_STATE, type ActionState } from "@/lib/forms/action-state";
import { COLLEAGUE_ROLES, LEAD_STATUSES, labelOf, toneOf } from "@/lib/data/labels";

type Action = (previous: ActionState, formData: FormData) => Promise<ActionState>;

export type ColleagueRow = {
  lead_id: string;
  email: string;
  name: string;
  title: string;
  status: string;
  status_detail: string;
  batches: string[];
  badges: string[];
  role: string;
  on_page: boolean;
};

const subscribe = () => () => {};
const onClient = () => true;
const onServer = () => false;

const COLUMNS = [
  { key: "person", label: "Person", width: "28%" },
  { key: "title", label: "Title" },
  { key: "status", label: "Status" },
  { key: "lists", label: "On Mail merge lists" },
  { key: "role", label: "Role" },
];

/** One colleague's role: a select that saves when changed (a button does it without scripts). */
function RoleForm({
  action,
  entryId,
  email,
  name,
  role,
}: {
  action: Action;
  entryId: string;
  email: string;
  name: string;
  role: string;
}) {
  const [state, formAction, isPending] = useActionState(action, INITIAL_ACTION_STATE);
  const scripted = useSyncExternalStore(subscribe, onClient, onServer);
  const form = useRef<HTMLFormElement>(null);
  return (
    <form ref={form} className="hqdata-role" action={formAction}>
      <AttemptField state={state} />
      <input type="hidden" name="entry_id" value={entryId} />
      <input type="hidden" name="email" value={email} />
      <select
        className="select select--small"
        name="role"
        defaultValue={role}
        aria-label={`Role of ${name}`}
        disabled={isPending}
        onChange={() => form.current?.requestSubmit()}
      >
        {Object.entries(COLLEAGUE_ROLES).map(([key, label]) => (
          <option key={key} value={key}>
            {label}
          </option>
        ))}
      </select>
      {!scripted && (
        <button className="btn btn--small" type="submit">
          Set
        </button>
      )}
      {state.status === "error" && state.message && (
        <span className="hqdata-role__said" role="alert">
          {state.message}
        </span>
      )}
      {state.status === "sent" && (
        <span className="hqdata-role__said" role="status">
          Saved
        </span>
      )}
    </form>
  );
}

/**
 * Colleagues at the firm (spec §2.6.3): every lead at its domain with their status and
 * the Mail merge lists they are on, plus anyone added by hand, each with a role. Free mail
 * is not grouped, so there only the people added by hand show.
 */
export function Colleagues({
  entryId,
  people,
  freeMail,
  domain,
  setRole,
  addColleague,
}: {
  entryId: string;
  people: readonly ColleagueRow[];
  freeMail: boolean;
  domain: string;
  setRole: Action;
  addColleague: Action;
}) {
  return (
    <>
      <div className="hqdata-section-tools">
        {freeMail && (
          <p className="page-note">
            Free-mail addresses are not grouped by firm; add colleagues by hand.
          </p>
        )}
        <Popover label="Add a colleague" width="wide" align="start">
          <LinkingForm
            action={addColleague}
            fields={{ entry_id: entryId }}
            submitLabel="Add them"
            pendingLabel="Adding…"
          >
            <Field
              id="colleague-email"
              label="Their address"
              hint="Someone new becomes a lead, marked “Copied on a yes”."
            >
              <Input
                id="colleague-email"
                name="email"
                type="email"
                required
                maxLength={254}
                autoComplete="off"
                aria-describedby="colleague-email-hint"
              />
            </Field>
            <div className="form-grid">
              <Field id="colleague-name" label="Name">
                <Input id="colleague-name" name="name" maxLength={120} autoComplete="off" />
              </Field>
              <Field id="colleague-title" label="Title">
                <Input id="colleague-title" name="title" maxLength={200} />
              </Field>
            </div>
            <Field id="colleague-role" label="Role">
              <Select id="colleague-role" name="role" defaultValue="not_set">
                {Object.entries(COLLEAGUE_ROLES).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </Select>
            </Field>
          </LinkingForm>
        </Popover>
      </div>
      <DataTable
        caption="Colleagues"
        columns={COLUMNS}
        columnMenu={false}
        isEmpty={people.length === 0}
        empty={
          <EmptyState
            compact
            title="Nobody else on file"
            description={
              freeMail
                ? "Add the people they work with by hand."
                : `No other lead has an address at ${domain}.`
            }
          />
        }
      >
        {people.map((person) => (
          <tr key={person.email}>
            <td>
              <Link className="table-title" href={`/data/leads/${person.lead_id}`}>
                {person.name || person.email}
              </Link>
              <span className="table-sub mono prospect-email">{person.email}</span>
              {person.badges.length > 0 && (
                <span className="table-sub">{person.badges.join(" · ")}</span>
              )}
            </td>
            <td>{person.title || <span className="table-sub">Not given</span>}</td>
            <td>
              <StatusPill
                value={person.status}
                label={labelOf(LEAD_STATUSES, person.status)}
                tone={toneOf(LEAD_STATUSES, person.status)}
              />
              {person.status_detail && <span className="table-sub">{person.status_detail}</span>}
            </td>
            <td>
              {person.batches.length ? (
                person.batches.join(", ")
              ) : (
                <span className="table-sub">None</span>
              )}
            </td>
            <td>
              <RoleForm
                action={setRole}
                entryId={entryId}
                email={person.email}
                name={person.name || person.email}
                role={person.role}
              />
            </td>
          </tr>
        ))}
      </DataTable>
    </>
  );
}
