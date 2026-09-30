import "server-only";

import { z } from "zod";

import { fetchHqJson, postHqJson } from "@/lib/api/core";

const okEnvelope = z.object({ ok: z.literal(true) });
const option = z.object({ value: z.string(), label: z.string() });

export const STATE_TONES: Record<string, "live" | "attention" | "danger" | "neutral"> = {
  operational: "live",
  maintenance: "neutral",
  degraded: "attention",
  partial: "danger",
  major: "danger",
};

const updateSchema = z.object({
  id: z.string(),
  status: z.string(),
  status_label: z.string(),
  body: z.string(),
  posted_at: z.string().nullable(),
  /** Staff views only. */
  posted_by: z.string().optional(),
  mailed: z.number().optional(),
});
export type StatusUpdate = z.infer<typeof updateSchema>;

export const statusIncidentSchema = z.object({
  id: z.string(),
  title: z.string(),
  status: z.string(),
  status_label: z.string(),
  impact: z.string(),
  started_at: z.string().nullable(),
  resolved_at: z.string().nullable(),
  components: z.array(
    z.object({ id: z.string(), name: z.string(), impact: z.string(), impact_label: z.string() }),
  ),
  updates: z.array(updateSchema),
});
export type StatusIncident = z.infer<typeof statusIncidentSchema>;

const componentSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  position: z.number(),
  state: z.string(),
  state_label: z.string(),
  bars: z.array(z.object({ day: z.string(), state: z.string(), incidents: z.number() })),
});
export type StatusComponent = z.infer<typeof componentSchema>;

const maintenanceSchema = z.object({
  id: z.string(),
  title: z.string(),
  body: z.string(),
  starts_at: z.string().nullable(),
  ends_at: z.string().nullable(),
  state: z.string(),
  components: z.array(z.object({ id: z.string(), name: z.string() })),
});
export type StatusMaintenance = z.infer<typeof maintenanceSchema>;

const pageSchema = okEnvelope.extend({
  overall: z.string(),
  overall_label: z.string(),
  components: z.array(componentSchema),
  open_incidents: z.array(statusIncidentSchema),
  recent_incidents: z.array(statusIncidentSchema),
  maintenance: z.array(maintenanceSchema),
  bars_note: z.string(),
});
export type StatusPage = z.infer<typeof pageSchema>;

const boardSchema = pageSchema.extend({
  history: z.array(statusIncidentSchema),
  subscribers: z.object({ confirmed: z.number(), waiting: z.number(), stopped: z.number() }),
  mail_ready: z.boolean(),
  impacts: z.array(option),
  statuses: z.array(option),
  public_url: z.string(),
});
export type StatusBoard = z.infer<typeof boardSchema>;

export function readStatusBoard(token: string) {
  return fetchHqJson("hq/status", boardSchema, { token });
}

const incidentDetailSchema = okEnvelope.extend({
  incident: statusIncidentSchema,
  affected: z.object({
    searched: z.boolean(),
    firms: z.array(
      z.object({
        company_id: z.string(),
        company_name: z.string(),
        tickets: z.array(z.object({ id: z.string(), subject: z.string() })),
      }),
    ),
  }),
  components: z.array(z.object({ id: z.string(), name: z.string() })),
  impacts: z.array(option),
  statuses: z.array(option),
  mail_ready: z.boolean(),
});
export type StatusIncidentDetail = z.infer<typeof incidentDetailSchema>;

export function readStatusIncident(token: string, incidentId: string) {
  return fetchHqJson(`hq/status/incidents/${incidentId}`, incidentDetailSchema, { token });
}

export function addComponent(token: string, body: Record<string, string>) {
  return postHqJson(
    "hq/status/components/create",
    okEnvelope.extend({ component_id: z.string() }),
    { token, body },
  );
}

export function updateComponent(token: string, componentId: string, body: Record<string, unknown>) {
  return postHqJson(
    `hq/status/components/${componentId}/update`,
    okEnvelope.extend({ updated: z.literal(true) }),
    { token, body },
  );
}

export function openStatusIncident(token: string, body: Record<string, unknown>) {
  return postHqJson(
    "hq/status/incidents/create",
    okEnvelope.extend({ incident_id: z.string(), mailed: z.number() }),
    { token, body },
  );
}

export function postStatusUpdate(token: string, incidentId: string, body: Record<string, unknown>) {
  return postHqJson(
    `hq/status/incidents/${incidentId}/update`,
    okEnvelope.extend({ status: z.string(), mailed: z.number() }),
    { token, body },
  );
}

export function scheduleMaintenance(token: string, body: Record<string, unknown>) {
  return postHqJson(
    "hq/status/maintenance/create",
    okEnvelope.extend({ maintenance_id: z.string(), mailed: z.number() }),
    { token, body },
  );
}

export function cancelMaintenance(token: string, maintenanceId: string) {
  return postHqJson(
    `hq/status/maintenance/${maintenanceId}/cancel`,
    okEnvelope.extend({ cancelled: z.literal(true) }),
    { token, body: {} },
  );
}

// --- the public side: no session --------------------------------------------------------------

export function readPublicStatus() {
  return fetchHqJson("public/status", pageSchema);
}

export function subscribeToStatus(body: Record<string, string>) {
  return postHqJson("public/status/subscribe", okEnvelope.extend({ received: z.literal(true) }), {
    body,
  });
}

export function confirmStatusSubscription(token: string) {
  const safe = encodeURIComponent(token);
  return postHqJson(
    `public/status/confirm/${safe}`,
    okEnvelope.extend({ confirmed: z.literal(true) }),
    { body: {} },
  );
}

export function stopStatusSubscription(token: string) {
  const safe = encodeURIComponent(token);
  return postHqJson(`public/status/stop/${safe}`, okEnvelope.extend({ stopped: z.literal(true) }), {
    body: {},
  });
}
