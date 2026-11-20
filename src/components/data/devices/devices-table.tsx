import Link from "next/link";

import { DataTable } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusPill } from "@/components/ui/status-pill";
import type { DeviceRow, DevicesPage } from "@/lib/data/api/devices";
import { dayWords } from "@/lib/data/labels-company";
import { OWNER_LEFT_OUT, countWords } from "@/lib/data/labels-controls";
import { CHECK_FLAGS, DEVICES_EMPTY, DEVICE_KINDS, OWNERSHIPS } from "@/lib/data/labels-devices";

import { CheckLines } from "./device-checks";

/**
 * The devices register (ws-notes/security/spec.md §7.6): every device with its last check, what
 * it found and the next one. For the Owner two more columns, "In the people ledger" and "Owed
 * by"; for an Admin neither, and the line `OWNER_LEFT_OUT` above the table instead.
 */

function lastCheckCell(row: DeviceRow) {
  if (!row.last_check) return <span className="quiet">Not checked yet</span>;
  return <span className="nowrap">{dayWords(row.last_check.on)}</span>;
}

function lockCell(row: DeviceRow) {
  const minutes = row.last_check?.screen_lock_minutes ?? null;
  if (!row.last_check) return <span className="quiet">Not checked yet</span>;
  return minutes === null ? (
    <span className="quiet">Not known</span>
  ) : (
    countWords(minutes, "minute")
  );
}

function ackCell(row: DeviceRow) {
  if (row.ownership !== "personal") return <span className="quiet">Not needed</span>;
  if (!row.acknowledgement) return <span className="hqdata-devices__attention">Not yet</span>;
  const given = `Version ${row.acknowledgement.policy_version}, ${dayWords(row.acknowledgement.on)}`;
  return row.ack_state === "moved" ? (
    <>
      {given}
      <span className="table-sub hqdata-devices__attention">The policy has moved on</span>
    </>
  ) : (
    given
  );
}

function nextCell(row: DeviceRow) {
  if (row.state === "returned")
    return <span className="quiet">Returned {dayWords(row.returned_on)}</span>;
  if (row.state === "retired")
    return <span className="quiet">No longer used since {dayWords(row.retired?.on)}</span>;
  return (
    <>
      <span className="nowrap">{dayWords(row.next_check)}</span>
      {row.overdue && (
        <span className="table-sub">
          <StatusPill value="overdue" label="Overdue" tone="danger" />
        </span>
      )}
    </>
  );
}

export function DevicesTable({ page, owner }: { page: DevicesPage; owner: boolean }) {
  const columns = [
    { key: "device", label: "Device", width: "18%" },
    { key: "holder", label: "Holder" },
    { key: "ownership", label: "Company or personal" },
    { key: "last", label: "Last check" },
    { key: "encryption", label: "Encryption" },
    { key: "lock", label: "Screen lock" },
    { key: "ack", label: "Acknowledged" },
    { key: "next", label: "Next check" },
    ...(owner
      ? [
          { key: "person", label: "In the people ledger" },
          { key: "owed", label: "Owed by" },
        ]
      : []),
  ];
  return (
    <>
      {!owner && <p className="page-note hqdata-devices__left-out">{OWNER_LEFT_OUT}</p>}
      <DataTable
        caption="Devices"
        minWidth={1100}
        columns={columns}
        columnMenu={false}
        isEmpty={page.devices.length === 0}
        empty={
          <EmptyState
            compact
            title={page.counts.active === 0 && page.view === "active" ? "No devices" : "None here"}
            description={
              page.counts.active === 0 && page.view === "active"
                ? DEVICES_EMPTY
                : "No device in this view."
            }
          />
        }
      >
        {page.devices.map((row) => (
          <tr
            key={row.device_id}
            id={`device-${row.device_id}`}
            className={row.state === "active" ? undefined : "hqdata-devices__gone"}
          >
            <td>
              <Link className="table-title" href={row.href}>
                {row.label}
              </Link>
              <span className="table-sub">
                {DEVICE_KINDS[row.kind]}
                {row.serial ? ` · ${row.serial}` : ""}
              </span>
              <CheckLines lines={[...row.check_lines, ...row.device_lines]} />
            </td>
            <td>{row.holder}</td>
            <td>{OWNERSHIPS[row.ownership]}</td>
            <td>{lastCheckCell(row)}</td>
            <td>
              {row.last_check ? (
                CHECK_FLAGS[row.last_check.encryption]
              ) : (
                <span className="quiet">Not checked yet</span>
              )}
            </td>
            <td>{lockCell(row)}</td>
            <td>{ackCell(row)}</td>
            <td>{nextCell(row)}</td>
            {owner && (
              <td>
                {row.person ? (
                  <Link className="text-link" href={row.person.href}>
                    {row.person.name}
                  </Link>
                ) : (
                  <span className="quiet">Not linked</span>
                )}
              </td>
            )}
            {owner && (
              <td>
                {row.owed ? (
                  row.owed.done ? (
                    <span className="quiet">Done</span>
                  ) : (
                    <>
                      <span className="nowrap">{dayWords(row.owed.by)}</span>
                      <span className="table-sub">{row.owed.words}</span>
                    </>
                  )
                ) : (
                  <span className="quiet">Nothing owed</span>
                )}
              </td>
            )}
          </tr>
        ))}
      </DataTable>
    </>
  );
}
