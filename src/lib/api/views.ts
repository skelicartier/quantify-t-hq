import "server-only";

import { z } from "zod";

import { fetchHqJson, postHqJson } from "@/lib/api/core";

const okEnvelope = z.object({ ok: z.literal(true) });

export const savedViewSchema = z.object({
  view_id: z.string(),
  list_key: z.string(),
  name: z.string(),
  /** The list's query string without the leading `?`. */
  query: z.string(),
  shared: z.boolean(),
  /** 0074: a shared view the team may change (its filters), not only open. */
  team_edits: z.boolean().default(false),
  owner_staff_id: z.string(),
  mine: z.boolean(),
  updated_at: z.string().nullable(),
});
export type SavedView = z.infer<typeof savedViewSchema>;

/** The views this person can open for a list: their own first, then the team's shared ones. */
export function readViews(token: string, listKey: string) {
  return fetchHqJson("hq/views", okEnvelope.extend({ views: z.array(savedViewSchema) }), {
    token,
    query: { list: listKey },
  });
}

export function saveView(token: string, input: Record<string, unknown>) {
  return postHqJson("hq/views/save", okEnvelope.extend({ view: savedViewSchema }), {
    token,
    body: input,
  });
}

export function deleteView(token: string, viewId: string) {
  return postHqJson(`hq/views/${viewId}/delete`, okEnvelope.extend({ deleted: z.boolean() }), {
    token,
    body: {},
  });
}

const preferencesSchema = okEnvelope.extend({ preferences: z.record(z.string(), z.string()) });

/** Every display preference of the signed-in person, keyed as the portal keys them. */
export function readPreferences(token: string) {
  return fetchHqJson("hq/preferences", preferencesSchema, { token });
}

export function setPreference(token: string, key: string, value: string) {
  return postHqJson(
    "hq/preferences/set",
    okEnvelope.extend({ key: z.string(), value: z.string() }),
    { token, body: { key, value } },
  );
}
