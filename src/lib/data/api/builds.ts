import "server-only";

import { z } from "zod";

import type { Staff } from "@/lib/data/gate";
import { dataAsk, dataOpen, id, ok, type OpenedFile } from "@/lib/data/socket";

/** A file made for one download: started, polled until ready, then streamed. */

export const buildStateSchema = z.enum(["building", "ready", "failed"]);

export const buildSchema = z.object({
  build_id: z.string(),
  kind: z.string(),
  state: buildStateSchema,
  progress: z.object({ done: z.number(), total: z.number() }),
  name: z.string(),
  bytes: z.number().nullable(),
  detail: z.string(),
  created_at: z.string(),
});
export type DataBuild = z.infer<typeof buildSchema>;

const buildAnswer = ok.extend({ build: buildSchema });

export const startBuild = (input: {
  kind: string;
  query?: string;
  folder_id?: string;
  by: Staff;
  attempt?: string;
  [extra: string]: unknown;
}) => dataAsk(buildAnswer, "POST", "/data/builds", input);

export const readBuild = (buildId: string) =>
  dataAsk(buildAnswer, "GET", `/data/builds/${id(buildId)}`);

export const openBuild = (buildId: string, signal?: AbortSignal): Promise<OpenedFile> =>
  dataOpen(`/data/builds/${id(buildId)}/bytes`, signal);

/** The portal's wait: 55 s is the most a route handler gives a build before it sends the browser to the downloads page. */
export const BUILD_WAIT_MS = 55_000;

/** Poll a build until it is ready or failed, or the time is up; the last record comes back. */
export async function waitForBuild(
  buildId: string,
  options: { timeoutMs?: number; everyMs?: number } = {},
): Promise<DataBuild> {
  const until = Date.now() + (options.timeoutMs ?? BUILD_WAIT_MS);
  const every = options.everyMs ?? 500;
  let build = (await readBuild(buildId)).build;
  while (build.state === "building" && Date.now() < until) {
    await new Promise((resolve) => setTimeout(resolve, every));
    build = (await readBuild(buildId)).build;
  }
  return build;
}
