import "server-only";

import { z } from "zod";

import { dataAsk, ok } from "@/lib/data/socket";
import type { Staff } from "@/lib/data/gate";

/** Data's own standing, answered by the host even while the worker is down. */

export const dataStateSchema = z.enum(["starting", "ready", "restarting", "stopped"]);
export type DataState = z.infer<typeof dataStateSchema>;

export const moduleStateSchema = z.object({
  name: z.string(),
  state: z.enum(["ready", "failed"]),
  detail: z.string(),
});

export const progressSchema = z.object({ done: z.number(), total: z.number() }).nullable();

export const dataStatusSchema = ok.extend({
  data: z.object({
    state: dataStateSchema,
    detail: z.string(),
    progress: progressSchema,
    started_at: z.string().nullable(),
    crashes: z.number(),
    modules: z.array(moduleStateSchema),
  }),
  sender: z
    .object({
      sending: z.object({ mailing_id: z.string(), name: z.string() }).nullable(),
      sent_today: z.number(),
    })
    .nullable(),
});
export type DataStatus = z.infer<typeof dataStatusSchema>;

export const readDataStatus = () => dataAsk(dataStatusSchema, "GET", "/data/status");

/** Start Data again after it stopped; the host refuses while it runs. */
export const restartData = (by: Staff) =>
  dataAsk(ok.extend({ state: dataStateSchema }), "POST", "/data/restart", { by });
