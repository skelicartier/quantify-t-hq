import "server-only";

import { z } from "zod";

import { flagSchema } from "@/lib/data/api/company";
import { staffSchema } from "@/lib/data/api/replies";
import type { Staff } from "@/lib/data/gate";
import type { CopyInput } from "@/lib/data/api/meetings";
import { dataAsk, id, ok } from "@/lib/data/socket";

/**
 * Systems › Devices (ws-notes/security/spec.md §7.4): the register with each device's last
 * self-check, next check and acknowledgement; one device with its checks; the writes; the CSV.
 * `owner` is set only from `context.me.role === "owner"`: it lets the people ledger's link and
 * the owed day in, and an answer asked without it has neither key.
 */

const kindSchema = z.enum(["laptop", "desktop", "phone", "tablet", "other"]);
const ownershipSchema = z.enum(["company", "personal"]);
const platformSchema = z.enum(["mac", "windows", "linux", "ios", "android", "chromeos", "other"]);

export const selfCheckSchema = z.object({
  check_id: z.string(),
  on: z.string(),
  by_name: z.string(),
  encryption: flagSchema,
  screen_lock_minutes: z.number().nullable(),
  os_version: z.string(),
  updates_automatic: flagSchema,
  password_manager: flagSchema,
  malware_protection: z.enum(["yes", "no", "", "not_applicable"]),
  firewall: flagSchema,
  work_data_local: flagSchema,
  evidence_file_ids: z.array(z.string()),
  note: z.string(),
  at: z.string(),
  by: staffSchema,
});
export type SelfCheck = z.infer<typeof selfCheckSchema>;

export const acknowledgementSchema = z.object({
  ack_id: z.string(),
  policy_file_id: z.string(),
  policy_title: z.string(),
  policy_version: z.number(),
  on: z.string(),
  how: z.enum(["signed", "email", "in_person"]),
  copy_file_id: z.string().nullable(),
  by_name: z.string(),
  at: z.string(),
  by: staffSchema,
});
export type Acknowledgement = z.infer<typeof acknowledgementSchema>;

/** The Owner's part of a row: present only in an answer asked with the Owner flag. */
export const ownedPersonSchema = z.object({
  person_id: z.string(),
  name: z.string(),
  state: z.enum(["starting", "engaged", "offboarding", "ended"]),
  last_day: z.string().nullable(),
  href: z.string(),
});
export const owedSchema = z.object({ by: z.string(), words: z.string(), done: z.boolean() });

export const deviceRowSchema = z.object({
  device_id: z.string(),
  holder: z.string(),
  kind: kindSchema,
  ownership: ownershipSchema,
  model: z.string(),
  serial: z.string(),
  platform: platformSchema,
  issued_on: z.string().nullable(),
  returned_on: z.string().nullable(),
  retired: z.object({ on: z.string(), why: z.string(), work_removed: flagSchema }).nullable(),
  notes: z.string(),
  created_at: z.string(),
  created_by: staffSchema,
  updated_at: z.string(),
  updated_by: staffSchema,
  label: z.string(),
  state: z.enum(["active", "returned", "retired"]),
  added_on: z.string(),
  last_check: selfCheckSchema.nullable(),
  checks_count: z.number(),
  next_check: z.string().nullable(),
  checked: z.boolean(),
  overdue: z.boolean(),
  due: z.boolean(),
  acknowledgement: acknowledgementSchema.nullable(),
  ack_state: z.enum(["not_needed", "none", "current", "moved", "unchecked"]),
  ack_due_on: z.string().nullable(),
  ack_line: z.string().nullable(),
  check_lines: z.array(z.string()),
  device_lines: z.array(z.string()),
  href: z.string(),
  person: ownedPersonSchema.nullable().optional(),
  owed: owedSchema.nullable().optional(),
});
export type DeviceRow = z.infer<typeof deviceRowSchema>;

const fileLinkSchema = z.object({ file_id: z.string(), title: z.string() });

export const deviceDetailSchema = deviceRowSchema.extend({
  checks: z.array(selfCheckSchema.extend({ files: z.array(fileLinkSchema) })),
  acknowledgements: z.array(acknowledgementSchema.extend({ copy: fileLinkSchema.nullable() })),
});
export type DeviceDetail = z.infer<typeof deviceDetailSchema>;

export const setupSchema = z.object({
  screen_lock_max: z.number().nullable(),
  check_months: z.number().nullable(),
});
export type DevicesSetup = z.infer<typeof setupSchema>;

export const policyFileSchema = z.object({
  key: z.string(),
  file_id: z.string(),
  title: z.string(),
  version: z.number(),
  href: z.string(),
  version_on: z.string().nullable(),
});

export const devicesPageSchema = ok.extend({
  view: z.enum(["active", "returned", "all"]),
  devices: z.array(deviceRowSchema),
  counts: z.object({
    active: z.number(),
    company: z.number(),
    personal: z.number(),
    checked: z.number(),
    acknowledged_current: z.number(),
    personal_active: z.number(),
  }),
  setup: setupSchema,
  policy: policyFileSchema.nullable(),
  policies_loaded: z.boolean(),
  policy_line: z.string().nullable(),
  files_here: z.boolean(),
  today: z.string(),
});
export type DevicesPage = z.infer<typeof devicesPageSchema>;

const eventSchema = z.object({
  event_id: z.string(),
  verb: z.string(),
  detail: z.string().optional(),
  by: staffSchema,
  at: z.string(),
});

export const devicePageSchema = ok.extend({
  device: deviceDetailSchema,
  events: z.array(eventSchema),
  files_here: z.boolean(),
  files: z.array(z.object({ file_id: z.string(), title: z.string(), folder: z.string() })),
  setup: setupSchema,
  policy: policyFileSchema.nullable(),
  policies_loaded: z.boolean(),
  policy_line: z.string().nullable(),
  today: z.string(),
  owner: z
    .object({
      person: ownedPersonSchema.nullable(),
      owed: owedSchema.nullable(),
      people_loaded: z.boolean(),
      people: z.array(
        z.object({
          person_id: z.string(),
          name: z.string(),
          state: z.enum(["starting", "engaged", "offboarding", "ended"]),
        }),
      ),
      events: z.array(eventSchema),
    })
    .optional(),
});
export type DevicePage = z.infer<typeof devicePageSchema>;

const deviceAnswer = ok.extend({ device: deviceRowSchema });

type Fields = Record<string, string>;
export type Screenshot = { file_id: string } | { name: string; content: string };

/** `owner` only from `context.me.role === "owner"`. */
export const readDevices = (view: string, owner: boolean) => {
  const query = new URLSearchParams();
  if (view !== "active") query.set("view", view);
  if (owner) query.set("owner", "1");
  const text = query.toString();
  return dataAsk(devicesPageSchema, "GET", `/data/devices${text ? `?${text}` : ""}`);
};

export const readDevice = (deviceId: string, owner: boolean) =>
  dataAsk(devicePageSchema, "GET", `/data/devices/${id(deviceId)}${owner ? "?owner=1" : ""}`);

export const exportDevices = (owner: boolean) =>
  dataAsk(
    ok.extend({ name: z.string(), csv: z.string() }),
    "GET",
    `/data/devices/export${owner ? "?owner=1" : ""}`,
  );

export const addDevice = (input: Fields, by: Staff, attempt: string) =>
  dataAsk(deviceAnswer, "POST", "/data/devices", { ...input, by, attempt });

export const updateDevice = (deviceId: string, input: Fields, by: Staff) =>
  dataAsk(deviceAnswer, "POST", `/data/devices/${id(deviceId)}/update`, { ...input, by });

export const returnDevice = (deviceId: string, on: string, by: Staff) =>
  dataAsk(deviceAnswer, "POST", `/data/devices/${id(deviceId)}/return`, { on, by });

export const retireDevice = (
  deviceId: string,
  input: { on: string; why: string; work_removed: string } | { undo: true },
  by: Staff,
) => dataAsk(deviceAnswer, "POST", `/data/devices/${id(deviceId)}/retire`, { ...input, by });

export const recordCheck = (
  deviceId: string,
  input: Fields,
  screenshots: readonly Screenshot[],
  by: Staff,
  attempt: string,
) =>
  dataAsk(deviceAnswer, "POST", `/data/devices/${id(deviceId)}/checks`, {
    ...input,
    screenshots,
    by,
    attempt,
  });

export const recordAcknowledgement = (
  deviceId: string,
  input: Fields,
  copy: CopyInput,
  by: Staff,
  attempt: string,
) =>
  dataAsk(deviceAnswer, "POST", `/data/devices/${id(deviceId)}/acknowledgements`, {
    ...input,
    ...copy,
    by,
    attempt,
  });

/** Owner only: the portal sends `owner: true` only for the Owner. No attempt: no replay is kept. */
export const linkDevice = (deviceId: string, personId: string, by: Staff) =>
  dataAsk(
    ok.extend({ device_id: z.string(), linked: z.boolean() }),
    "POST",
    `/data/devices/${id(deviceId)}/link`,
    { owner: true, person_id: personId, by },
  );

export const saveDevicesSetup = (input: Fields, by: Staff) =>
  dataAsk(ok.extend({ setup: setupSchema }), "POST", "/data/devices/setup", { ...input, by });
