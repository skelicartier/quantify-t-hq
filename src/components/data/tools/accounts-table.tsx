import Link from "next/link";

import {
  closeAccountAction,
  linkAccountAction,
  updateAccountAction,
} from "@/app/(portal)/data/systems/actions";
import { AccountFields } from "@/components/data/tools/tool-fields";
import { MailForm } from "@/components/mail/mail-form";
import { DataTable } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input, Select } from "@/components/ui/field";
import { Popover } from "@/components/ui/popover";
import { RowAction } from "@/components/ui/row-action";
import type { AccountRow, RosterChoice } from "@/lib/data/api/tools";
import { dayWords } from "@/lib/data/labels-company";
import { PERSON_STATES } from "@/lib/data/labels-people";
import { ACCOUNT_KINDS, ACCOUNT_ROLES, ACCOUNT_TWO_STEP } from "@/lib/data/labels-systems";

/**
 * The accounts table of a tool's page and of Systems › Accounts (ws-notes/security/spec.md
 * §6.8): Holder · (Tool) · Kind · Role · Two-step · Opened · Closed, and for the Owner only
 * In the people ledger · Close by with "Link to the people ledger". An Admin's page passes
 * `owner={false}`, and nothing of the ledger is in what it was given to draw.
 */

const day = (value: string | null) =>
  value ? <span className="nowrap">{dayWords(value)}</span> : <span className="quiet">—</span>;

export function AccountsTable({
  accounts,
  owner,
  roster,
  showTool,
  today,
  empty,
  personPage,
}: {
  accounts: readonly AccountRow[];
  owner: boolean;
  /** The Owner's choices for the link; ignored for anyone else. */
  roster: readonly RosterChoice[];
  showTool: boolean;
  today: string;
  empty: string;
  /** On a person's page: refresh it after a link. */
  personPage?: string;
}) {
  return (
    <DataTable
      caption="Accounts"
      columns={[
        { key: "holder", label: "Holder", width: "22%" },
        ...(showTool ? [{ key: "tool", label: "Tool" }] : []),
        { key: "kind", label: "Kind" },
        { key: "role", label: "Role" },
        { key: "mfa", label: "Two-step" },
        { key: "opened", label: "Opened" },
        { key: "closed", label: "Closed" },
        ...(owner
          ? [
              { key: "person", label: "In the people ledger" },
              { key: "close-by", label: "Close by" },
            ]
          : []),
      ]}
      columnMenu={false}
      isEmpty={accounts.length === 0}
      empty={<EmptyState compact title="No accounts" description={empty} />}
    >
      {accounts.map((account) => {
        const fields = { account_id: account.account_id, tool_id: account.tool_id };
        return (
          <tr
            key={account.account_id}
            id={`account-${account.account_id}`}
            className={account.closed_on ? "hqdata-systems__gone" : undefined}
          >
            <td>
              <span className="table-title">{account.holder}</span>
              {account.kind === "shared" && !account.closed_on && (
                <span className="hqdata-systems__check">A shared account.</span>
              )}
              {account.closed_note && <span className="table-sub">{account.closed_note}</span>}
              <div className="hqdata-systems__acts">
                {account.closed_on ? (
                  !account.tool_retired && (
                    <RowAction
                      action={closeAccountAction}
                      fields={{ ...fields, undo: "1" }}
                      buttons={[
                        {
                          label: "Reopen",
                          className: "btn btn--small btn--ghost",
                          pendingLabel: "Saving…",
                        },
                      ]}
                      sentLabel="Reopened."
                    />
                  )
                ) : (
                  <>
                    <Popover label="Close" align="start">
                      <MailForm
                        action={closeAccountAction}
                        fields={fields}
                        submitLabel="Close it"
                        pendingLabel="Saving…"
                      >
                        <Field id={`close-${account.account_id}-on`} label="Closed on">
                          <Input
                            id={`close-${account.account_id}-on`}
                            name="closed_on"
                            type="date"
                            max={today}
                            defaultValue={today}
                          />
                        </Field>
                        <Field
                          id={`close-${account.account_id}-note`}
                          label="Note"
                          hint="Never a password."
                        >
                          <Input
                            id={`close-${account.account_id}-note`}
                            name="note"
                            maxLength={300}
                          />
                        </Field>
                      </MailForm>
                    </Popover>
                    <Popover label="Edit" align="start" width="wide">
                      <MailForm
                        action={updateAccountAction}
                        fields={fields}
                        submitLabel="Save"
                        pendingLabel="Saving…"
                        className="stack-form stack-form--tight"
                      >
                        <AccountFields
                          prefix={`account-${account.account_id}`}
                          values={account}
                          today={today}
                        />
                      </MailForm>
                    </Popover>
                  </>
                )}
                {owner && (
                  <Popover label="Link to the people ledger" align="start">
                    <MailForm
                      action={linkAccountAction}
                      fields={{ ...fields, ...(personPage ? { person_page: personPage } : {}) }}
                      submitLabel="Save the link"
                      pendingLabel="Saving…"
                    >
                      <Field id={`link-${account.account_id}`} label="Person">
                        <Select
                          id={`link-${account.account_id}`}
                          name="person_id"
                          defaultValue={account.person?.person_id ?? ""}
                        >
                          <option value="">Not in the ledger</option>
                          {roster.map((person) => (
                            <option key={person.person_id} value={person.person_id}>
                              {person.name} ({PERSON_STATES[person.state].label})
                            </option>
                          ))}
                        </Select>
                      </Field>
                    </MailForm>
                  </Popover>
                )}
              </div>
            </td>
            {showTool && (
              <td>
                <Link className="text-link" href={account.href}>
                  {account.tool_name}
                </Link>
              </td>
            )}
            <td>{ACCOUNT_KINDS[account.kind]}</td>
            <td>{ACCOUNT_ROLES[account.role]}</td>
            <td>{ACCOUNT_TWO_STEP[account.mfa]}</td>
            <td>{day(account.opened_on)}</td>
            <td>{day(account.closed_on)}</td>
            {owner && (
              <td>
                {account.person ? (
                  <Link className="text-link" href={account.person.href}>
                    {account.person.name}
                  </Link>
                ) : (
                  <span className="quiet">Not linked</span>
                )}
              </td>
            )}
            {owner && (
              <td className={account.close_by?.overdue ? "hqdata-systems__late" : undefined}>
                {account.close_by ? (
                  <span className="nowrap">{account.close_by.words}</span>
                ) : (
                  <span className="quiet">—</span>
                )}
              </td>
            )}
          </tr>
        );
      })}
    </DataTable>
  );
}
