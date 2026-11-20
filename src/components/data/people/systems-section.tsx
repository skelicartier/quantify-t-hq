import Link from "next/link";
import { Suspense } from "react";

import { linkAccountAction } from "@/app/(portal)/data/systems/actions";
import { RowAction } from "@/components/ui/row-action";
import { DataTable } from "@/components/ui/data-table";
import { RecordSection } from "@/components/ui/record-shell";
import { readPersonSystems, type PersonSystems } from "@/lib/data/api/tools";
import { dayWords } from "@/lib/data/labels-company";
import { notLoaded } from "@/lib/data/labels-controls";
import {
  ACCOUNT_ROLES,
  PERSON_SECTION_APART,
  POSSIBLY_THEIRS,
  personSectionEmpty,
} from "@/lib/data/labels-systems";
import { DataRequestError, DataUnavailableError } from "@/lib/data/socket";

import "@/app/(portal)/data/systems/systems.css";

/**
 * A person's accounts and devices in Systems, on their page in the people ledger
 * (ws-notes/security/spec.md §6.8). The page is the Owner's only, so the section asks
 * `GET /data/tools/for-person/:id?owner=1`: the accounts linked to them with each close-by
 * day, the devices U2's module links to them (or a line when it is not loaded), and the open
 * accounts not linked to anyone whose holder is their name or address, each with "Link".
 * Printed, the tables print and no button does.
 */
export function SystemsSection({ personId }: { personId: string }) {
  // Its own read, behind a boundary: the rest of the person's page never waits on it.
  return (
    <Suspense
      fallback={
        <section className="rsection" aria-label="Systems">
          <p className="page-note">Reading Systems…</p>
        </section>
      }
    >
      <SystemsSectionRead personId={personId} />
    </Suspense>
  );
}

async function SystemsSectionRead({ personId }: { personId: string }) {
  let answer: PersonSystems | "missing" | "failed";
  try {
    answer = await readPersonSystems(personId);
  } catch (error) {
    if (
      error instanceof DataRequestError &&
      error.status === 404 &&
      error.code === "module_missing"
    )
      answer = "missing";
    else if (error instanceof DataRequestError || error instanceof DataUnavailableError)
      answer = "failed";
    else throw error;
  }
  return <SystemsSectionView personId={personId} answer={answer} />;
}

/** The section as drawn from an answer: what a test renders without the service. */
export function SystemsSectionView({
  personId,
  answer,
}: {
  personId: string;
  answer: PersonSystems | "missing" | "failed";
}) {
  return (
    <RecordSection id="person-systems" title="Systems">
      {answer === "missing" ? (
        <p className="page-note">{notLoaded("Systems")}</p>
      ) : answer === "failed" ? (
        <p className="page-note">Systems could not be read just now.</p>
      ) : (
        <Body personId={personId} answer={answer} />
      )}
    </RecordSection>
  );
}

function Body({ personId, answer }: { personId: string; answer: PersonSystems }) {
  const devices = answer.devices;
  const nothing = answer.accounts.length === 0 && (devices === null || devices.length === 0);
  return (
    <>
      <p className="page-note">{PERSON_SECTION_APART}</p>
      {nothing ? (
        <p className="page-note">
          {personSectionEmpty(answer.name)}{" "}
          <Link className="text-link" href="/data/systems/accounts">
            Systems › Accounts
          </Link>
        </p>
      ) : (
        answer.accounts.length > 0 && (
          <DataTable
            caption="Accounts in Systems"
            columns={[
              { key: "tool", label: "Tool" },
              { key: "account", label: "Account" },
              { key: "role", label: "Role" },
              { key: "close-by", label: "Close by" },
              { key: "closed", label: "Closed" },
            ]}
            columnMenu={false}
          >
            {answer.accounts.map((account) => (
              <tr key={account.account_id}>
                <td>
                  <Link className="text-link" href={account.href}>
                    {account.tool_name}
                  </Link>
                </td>
                <td>{account.holder}</td>
                <td>{ACCOUNT_ROLES[account.role]}</td>
                <td className={account.close_by?.overdue ? "hqdata-systems__late" : undefined}>
                  {account.close_by && !account.closed_on ? (
                    <span className="nowrap">{account.close_by.words}</span>
                  ) : (
                    <span className="quiet">—</span>
                  )}
                </td>
                <td>
                  {account.closed_on ? (
                    <span className="nowrap">{dayWords(account.closed_on)}</span>
                  ) : (
                    <span className="quiet">Open</span>
                  )}
                </td>
              </tr>
            ))}
          </DataTable>
        )
      )}
      {devices === null ? (
        <p className="page-note">{notLoaded("Devices")}</p>
      ) : (
        devices.length > 0 && (
          <DataTable
            caption="Devices in Systems"
            columns={[
              { key: "device", label: "Device" },
              { key: "ownership", label: "Company or personal" },
              { key: "by", label: "Owed by" },
              { key: "done", label: "Done" },
            ]}
            columnMenu={false}
          >
            {devices.map((device) => (
              <tr key={device.device_id}>
                <td>
                  <Link className="text-link" href={device.href}>
                    {device.label}
                  </Link>
                </td>
                <td>{device.ownership === "company" ? "Company" : "Personal"}</td>
                <td>
                  {device.by ? (
                    <span className="nowrap">{dayWords(device.by)}</span>
                  ) : (
                    <span className="quiet">—</span>
                  )}
                </td>
                <td>{device.done ? "Done" : "Not yet"}</td>
              </tr>
            ))}
          </DataTable>
        )
      )}
      {answer.possible.length > 0 && (
        <section className="hqdata-systems__possible" aria-label="Possibly theirs">
          <p className="page-note">{POSSIBLY_THEIRS}:</p>
          <ul className="hqdata-systems__list">
            {answer.possible.map((account) => (
              <li key={account.account_id}>
                {account.tool_name}: {account.holder}
                <RowAction
                  action={linkAccountAction}
                  fields={{
                    account_id: account.account_id,
                    tool_id: account.tool_id,
                    person_id: personId,
                    person_page: personId,
                  }}
                  buttons={[
                    {
                      label: "Link",
                      className: "btn btn--small btn--ghost",
                      ariaLabel: `Link ${account.tool_name}: ${account.holder}`,
                      pendingLabel: "Linking…",
                    },
                  ]}
                  className="hqdata-systems__inline"
                  sentLabel="Linked."
                />
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
