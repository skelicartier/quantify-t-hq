import Link from "next/link";
import { notFound } from "next/navigation";

import { DataUnavailable } from "@/components/data/data-down";
import { CheckLines, LatestCheck } from "@/components/data/devices/device-checks";
import { AckFields, CheckFields, DeviceFields } from "@/components/data/devices/device-fields";
import { CopyFields } from "@/components/data/meetings/copy-fields";
import { ControlRefNote, PracticeNote } from "@/components/data/security/control-ref";
import { SystemsTabs } from "@/components/data/systems/systems-tabs";
import { MailForm } from "@/components/mail/mail-form";
import { PageHeader } from "@/components/shell/page-header";
import { Callout } from "@/components/ui/callout";
import { DataTable } from "@/components/ui/data-table";
import { Field, Input, Select } from "@/components/ui/field";
import { Popover } from "@/components/ui/popover";
import {
  Properties,
  Property,
  RecordGrid,
  RecordHeader,
  RecordSection,
} from "@/components/ui/record-shell";
import { RowAction } from "@/components/ui/row-action";
import { StatusPill } from "@/components/ui/status-pill";
import { Timestamp } from "@/components/ui/timestamp";
import { DATA_ROLE_LINE, requireData } from "@/lib/data/access";
import { readDevice, type DevicePage } from "@/lib/data/api/devices";
import { dayWords } from "@/lib/data/labels-company";
import { NOT_ADVICE, OWNER_LEFT_OUT, countWords } from "@/lib/data/labels-controls";
import {
  ACK_HOW,
  CHECK_FLAGS,
  DEVICE_KINDS,
  DEVICE_PLATFORMS,
  OWNERSHIPS,
} from "@/lib/data/labels-devices";
import { isDataOwner } from "@/lib/data/owner";
import { dataRead } from "@/lib/data/read";
import { requestNow } from "@/lib/request-time";

import {
  linkDeviceAction,
  recordAckAction,
  recordCheckAction,
  retireDeviceAction,
  returnDeviceAction,
  updateDeviceAction,
} from "../actions";
import "@/components/data/devices/devices.css";

export const metadata = { title: "Device" };
export const dynamic = "force-dynamic";

const BASE = "/data/systems/devices";
const DEVICE_ID = /^[A-Za-z0-9-]{1,64}$/;

const EVENT_WORDS: Record<string, string> = {
  added: "Added",
  changed: "Changed",
  returned: "Marked returned",
  retired: "No longer used for work",
  "back in use": "Back in use",
  "self-check recorded": "Self-check recorded",
  "acknowledgement recorded": "Acknowledgement recorded",
  linked: "Linked to a person in the people ledger",
  unlinked: "No longer linked to the people ledger",
};

export default async function DeviceRecordPage({
  params,
}: {
  params: Promise<{ deviceId: string }>;
}) {
  const { deviceId } = await params;
  const { context, allowed } = await requireData(`${BASE}/${deviceId}`);
  if (!DEVICE_ID.test(deviceId)) notFound();
  const owner = allowed && isDataOwner(context);
  const now = requestNow();
  const read = allowed ? await dataRead(() => readDevice(deviceId, owner)) : null;
  if (!allowed || !read || !read.ok)
    return (
      <>
        <PageHeader title="Device" />
        <div className="page-content">
          {!allowed || !read ? (
            <Callout tone="neutral">{DATA_ROLE_LINE}</Callout>
          ) : (
            !read.ok && <DataUnavailable failure={read} />
          )}
        </div>
      </>
    );
  return <DeviceRecord page={read.data} owner={owner} now={now} />;
}

function HeaderActions({ page }: { page: DevicePage }) {
  const { device, today } = page;
  const fields = { device_id: device.device_id };
  return (
    <>
      <Popover label="Edit" align="start" width="wide">
        <MailForm
          action={updateDeviceAction}
          fields={fields}
          submitLabel="Save"
          pendingLabel="Saving…"
          className="stack-form stack-form--tight"
        >
          <DeviceFields prefix="device-edit" values={device} />
        </MailForm>
      </Popover>
      {device.state === "active" && device.ownership === "company" && (
        <Popover label="Mark returned" align="start">
          <MailForm
            action={returnDeviceAction}
            fields={fields}
            submitLabel="Mark returned"
            pendingLabel="Saving…"
          >
            <Field id="device-return-on" label="Returned on">
              <Input id="device-return-on" name="on" type="date" max={today} defaultValue={today} />
            </Field>
          </MailForm>
        </Popover>
      )}
      {device.retired ? (
        <RowAction
          action={retireDeviceAction}
          fields={{ ...fields, undo: "1" }}
          buttons={[{ label: "Back in use", className: "btn btn--small" }]}
        />
      ) : (
        <Popover label="No longer used for work" align="start" width="wide">
          <MailForm
            action={retireDeviceAction}
            fields={fields}
            submitLabel="Record it"
            pendingLabel="Saving…"
            className="stack-form stack-form--tight"
          >
            <Field id="device-retire-on" label="Since">
              <Input id="device-retire-on" name="on" type="date" max={today} defaultValue={today} />
            </Field>
            <Field id="device-retire-why" label="Why">
              <Input id="device-retire-why" name="why" required maxLength={300} />
            </Field>
            <Field
              id="device-retire-removed"
              label="Work accounts signed out and work data removed"
            >
              <Select id="device-retire-removed" name="work_removed" required defaultValue="">
                <option value="">Choose</option>
                <option value="yes">Yes</option>
                <option value="no">No</option>
              </Select>
            </Field>
          </MailForm>
        </Popover>
      )}
    </>
  );
}

function DeviceRecord({ page, owner, now }: { page: DevicePage; owner: boolean; now: number }) {
  const { device } = page;
  const [latest, ...earlier] = device.checks;
  const inUse = device.state === "active";
  const fields = { device_id: device.device_id };
  const events = [...page.events, ...(page.owner?.events ?? [])].sort((a, b) =>
    b.at.localeCompare(a.at),
  );
  return (
    <>
      <RecordHeader
        crumbs={[
          { href: "/data/systems", label: "Systems" },
          { href: BASE, label: "Devices" },
        ]}
        title={device.label}
        status={
          <StatusPill
            value={device.ownership}
            label={OWNERSHIPS[device.ownership]}
            tone="neutral"
          />
        }
        readouts={[
          {
            label: "Last check",
            value: device.last_check ? dayWords(device.last_check.on) : "Not checked yet",
          },
          {
            label: "Next check",
            value: device.next_check
              ? dayWords(device.next_check)
              : device.state === "returned"
                ? "Returned"
                : "Not in use",
          },
          {
            label: "Acknowledged",
            value:
              device.ownership !== "personal"
                ? "Not needed"
                : device.acknowledgement
                  ? `Version ${device.acknowledgement.policy_version}`
                  : "Not yet",
          },
        ]}
        actions={<HeaderActions page={page} />}
      />
      <RecordGrid side={<Side page={page} />}>
        <div className="hqdata-device">
          <div className="hqdata-device__tabs">
            <SystemsTabs current="devices" />
          </div>
          <p className="page-note">{NOT_ADVICE}</p>
          <RecordSection
            id="device-checks"
            title="Self-checks"
            actions={
              inUse ? (
                <Popover label="Record a self-check" variant="primary" align="end" width="wide">
                  <MailForm
                    action={recordCheckAction}
                    fields={fields}
                    submitLabel="Record the check"
                    pendingLabel="Recording…"
                    className="stack-form stack-form--tight"
                  >
                    <CheckFields
                      prefix="device-check"
                      today={page.today}
                      files={page.files}
                      filesHere={page.files_here}
                    />
                  </MailForm>
                </Popover>
              ) : undefined
            }
          >
            <p>
              <ControlRefNote refs={["a8_1", "a6_7"]} />
            </p>
            {device.next_check && (
              <p>
                Next self-check by {dayWords(device.next_check)}.{" "}
                <PracticeNote
                  practice="device_check"
                  {...(page.setup.check_months !== null ? { amount: page.setup.check_months } : {})}
                />
              </p>
            )}
            <CheckLines lines={device.device_lines.filter((line) => line !== device.ack_line)} />
            <LatestCheck
              check={latest ?? null}
              lines={device.check_lines}
              files={latest?.files ?? []}
            />
            {earlier.length > 0 && (
              <DataTable
                caption="Earlier self-checks"
                columns={[
                  { key: "on", label: "On" },
                  { key: "by", label: "By" },
                  { key: "encryption", label: "Encryption" },
                  { key: "lock", label: "Screen lock" },
                  { key: "os", label: "System version" },
                  { key: "updates", label: "Updates" },
                  { key: "screenshots", label: "Screenshots" },
                ]}
                columnMenu={false}
              >
                {earlier.map((check) => (
                  <tr key={check.check_id}>
                    <td className="nowrap">{dayWords(check.on)}</td>
                    <td>{check.by_name}</td>
                    <td>{CHECK_FLAGS[check.encryption]}</td>
                    <td>
                      {check.screen_lock_minutes === null
                        ? "Not known"
                        : countWords(check.screen_lock_minutes, "minute")}
                    </td>
                    <td>{check.os_version || "Not known"}</td>
                    <td>{CHECK_FLAGS[check.updates_automatic]}</td>
                    <td>
                      {check.files.length === 0
                        ? "None"
                        : check.files.map((file, index) => (
                            <span key={file.file_id}>
                              {index > 0 && " · "}
                              <Link className="text-link" href={`/data/files/${file.file_id}`}>
                                {file.title}
                              </Link>
                            </span>
                          ))}
                    </td>
                  </tr>
                ))}
              </DataTable>
            )}
          </RecordSection>
          {device.ownership === "personal" && <Acknowledgement page={page} />}
          {owner && page.owner ? (
            <Ledger page={page} />
          ) : (
            !owner && <p className="page-note hqdata-devices__left-out">{OWNER_LEFT_OUT}</p>
          )}
          <RecordSection id="device-activity" title="Activity">
            {events.length === 0 ? (
              <p className="timeline-empty">Nothing has happened yet.</p>
            ) : (
              <ol className="timeline">
                {events.map((event) => (
                  <li key={event.event_id} className="timeline__item">
                    <span className="timeline__kind">{EVENT_WORDS[event.verb] ?? event.verb}</span>
                    <div>
                      <p className="timeline__meta">
                        <span className="timeline__actor">{event.by.name}</span>
                        <Timestamp value={event.at} now={now} mode="relative" />
                      </p>
                      {event.detail && <p className="timeline__body">{event.detail}</p>}
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </RecordSection>
        </div>
      </RecordGrid>
    </>
  );
}

function Acknowledgement({ page }: { page: DevicePage }) {
  const { device } = page;
  const lines = device.ack_line ? [device.ack_line] : [];
  return (
    <RecordSection
      id="device-acknowledgement"
      title="Acknowledgement"
      actions={
        device.state === "active" ? (
          <Popover label="Record an acknowledgement" align="end" width="wide">
            <MailForm
              action={recordAckAction}
              fields={{ device_id: device.device_id }}
              submitLabel="Record it"
              pendingLabel="Recording…"
              className="stack-form stack-form--tight"
            >
              <AckFields
                prefix="device-ack"
                today={page.today}
                files={page.files}
                policyFileId={page.policy?.file_id ?? null}
              />
              <CopyFields
                prefix="device-ack-copy"
                label="The signed copy"
                files={page.files}
                filesHere={page.files_here}
                folder="Security › Devices"
              />
            </MailForm>
          </Popover>
        ) : undefined
      }
    >
      <p>
        {page.policy ? (
          <>
            The personal devices policy:{" "}
            <Link className="text-link" href={`/data/files/${page.policy.file_id}`}>
              {page.policy.title}
            </Link>
            , version {page.policy.version}.
          </>
        ) : (
          <span className="hqdata-devices__attention">{page.policy_line}</span>
        )}
      </p>
      <CheckLines lines={lines} />
      <DataTable
        caption="Acknowledgements"
        columns={[
          { key: "on", label: "On" },
          { key: "policy", label: "Policy" },
          { key: "version", label: "Version" },
          { key: "how", label: "How" },
          { key: "by", label: "Given by" },
          { key: "copy", label: "Copy" },
        ]}
        columnMenu={false}
        isEmpty={device.acknowledgements.length === 0}
        empty={<p className="page-note">No acknowledgement recorded.</p>}
      >
        {device.acknowledgements.map((ack) => (
          <tr key={ack.ack_id}>
            <td className="nowrap">{dayWords(ack.on)}</td>
            <td>{ack.policy_title}</td>
            <td>Version {ack.policy_version}</td>
            <td>{ACK_HOW[ack.how]}</td>
            <td>{ack.by_name}</td>
            <td>
              {ack.copy ? (
                <Link className="text-link" href={`/data/files/${ack.copy.file_id}`}>
                  {ack.copy.title}
                </Link>
              ) : (
                <span className="quiet">None kept</span>
              )}
            </td>
          </tr>
        ))}
      </DataTable>
    </RecordSection>
  );
}

/** Owner only: the link to a person in the people ledger, and what is owed when they leave. */
function Ledger({ page }: { page: DevicePage }) {
  const part = page.owner!;
  const { device } = page;
  return (
    <RecordSection id="device-ledger" title="In the people ledger">
      {part.person ? (
        <p>
          Linked to{" "}
          <Link className="text-link" href={part.person.href}>
            {part.person.name}
          </Link>
          .
        </p>
      ) : (
        <p className="page-note">Not linked to anyone in the people ledger.</p>
      )}
      {part.owed && (
        <p className={part.owed.done ? undefined : "hqdata-devices__attention"}>
          {part.owed.done
            ? "Nothing is owed: it was returned, or work data was removed."
            : device.ownership === "company"
              ? `Owed back by ${dayWords(part.owed.by)}. ${part.owed.words}.`
              : `Work data off it by ${dayWords(part.owed.by)}. ${part.owed.words}.`}
        </p>
      )}
      {part.people_loaded ? (
        <MailForm
          action={linkDeviceAction}
          fields={{ device_id: device.device_id }}
          submitLabel="Save the link"
          pendingLabel="Saving…"
          className="stack-form stack-form--tight"
        >
          <Field id="device-person" label="Person">
            <Select id="device-person" name="person_id" defaultValue={part.person?.person_id ?? ""}>
              <option value="">Nobody</option>
              {part.people.map((person) => (
                <option key={person.person_id} value={person.person_id}>
                  {person.name}
                </option>
              ))}
            </Select>
          </Field>
        </MailForm>
      ) : (
        <p className="page-note">The people ledger is not loaded here.</p>
      )}
    </RecordSection>
  );
}

function Side({ page }: { page: DevicePage }) {
  const { device } = page;
  return (
    <Properties title="Device">
      <Property label="Holder">{device.holder}</Property>
      <Property label="Kind">{DEVICE_KINDS[device.kind]}</Property>
      <Property label="Company or personal">{OWNERSHIPS[device.ownership]}</Property>
      <Property label="Model">{device.model || "Not recorded"}</Property>
      <Property label="Serial" mono>
        {device.serial || "Not recorded"}
      </Property>
      <Property label="System">{DEVICE_PLATFORMS[device.platform]}</Property>
      {device.ownership === "company" && (
        <Property label="Issued">{dayWords(device.issued_on) || "Not recorded"}</Property>
      )}
      {device.returned_on && <Property label="Returned">{dayWords(device.returned_on)}</Property>}
      {device.retired && (
        <Property label="No longer used for work">
          {dayWords(device.retired.on)}: {device.retired.why}. Work data removed:{" "}
          {CHECK_FLAGS[device.retired.work_removed]}.
        </Property>
      )}
      {device.notes && <Property label="Notes">{device.notes}</Property>}
    </Properties>
  );
}
