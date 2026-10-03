import "server-only";

import { z } from "zod";

import { fetchHqJson, postHqJson } from "@/lib/api/core";

const okEnvelope = z.object({ ok: z.literal(true) });

/** A first-party sign of interest on a lead, a person or a company, with what it rests on. */
export const signalSchema = z.object({
  signal_id: z.string(),
  kind: z.string(),
  kind_label: z.string(),
  subject_type: z.string(),
  subject_id: z.string(),
  subject_label: z.string(),
  link_path: z.string(),
  evidence: z.string(),
  observed_at: z.string().nullable(),
  days_ago: z.number().nullable(),
  /** "open", "acted" or "dismissed": a closed sign never reopens. */
  state: z.string(),
  decided_by_name: z.string(),
  decided_at: z.string().nullable(),
  note: z.string(),
});
export type Signal = z.infer<typeof signalSchema>;

const signalsSchema = okEnvelope.extend({
  signals: z.array(signalSchema),
  counts: z.object({ open: z.number(), by_kind: z.record(z.string(), z.number()) }),
  kinds: z.array(z.object({ kind: z.string(), label: z.string() })),
  lookback_days: z.number(),
  swept_at: z.string().nullable(),
});
export type SignalList = z.infer<typeof signalsSchema>;

export function readSignals(token: string, query: { state?: string; kind?: string } = {}) {
  const filtered: Record<string, string> = {};
  for (const [name, value] of Object.entries(query)) if (value) filtered[name] = value;
  return fetchHqJson("hq/signals", signalsSchema, { token, query: filtered });
}

export function decideSignal(
  token: string,
  signalId: string,
  state: "acted" | "dismissed",
  note: string,
) {
  return postHqJson(`hq/signals/${signalId}/decide`, okEnvelope.extend({ signal: signalSchema }), {
    token,
    body: { state, note },
  });
}
