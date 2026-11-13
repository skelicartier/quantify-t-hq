// @vitest-environment node
import { mkdtempSync, rmSync } from "node:fs";
import type { Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { notFound } from "next/navigation";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { MergeEngine } from "../../scripts/mail-merge/engine";
import { createMergeServer } from "../../scripts/mail-merge/server";
import { openBuild, readBuild, startBuild, waitForBuild } from "@/lib/data/api/builds";
import { readDataOverview } from "@/lib/data/api/overview";
import { readDataStatus, restartData } from "@/lib/data/api/status";
import { dataRead } from "@/lib/data/read";
import {
  DataRequestError,
  DataUnavailableError,
  dataAsk,
  dataConfigured,
  dataSendPart,
  ok,
} from "@/lib/data/socket";
import { WALKER, startStack, type Stack } from "./helpers";

/**
 * The portal's Data client and the service, held to one another: every read the portal
 * makes is made here against the real server, host and worker over a socket, and every
 * answer has to pass the portal's own schema.
 */
let stack: Stack;

beforeAll(async () => {
  // The bare core: the modules' own contract tests start stacks with them loaded.
  stack = await startStack({ env: true, modules: [] });
}, 60_000);
afterAll(async () => {
  await stack.stop();
});

async function readBytes(body: AsyncIterable<Buffer>): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of body) chunks.push(chunk);
  return Buffer.concat(chunks);
}

describe("the portal and Data agree", () => {
  it("on the status and the overview", async () => {
    expect(dataConfigured()).toBe(true);
    const status = await readDataStatus();
    expect(status.data).toMatchObject({ state: "ready", crashes: 0, modules: [] });
    expect(status.data.started_at).toMatch(/^\d{4}-/);
    expect(status.sender).toEqual({ sending: null, sent_today: 0 });
    const overview = await readDataOverview();
    expect(overview.today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(overview.sent_today).toBe(0);
    expect(overview.week).toHaveLength(7);
    expect(overview.week.at(-1)?.day).toBe(overview.today);
    expect(overview.sending).toBeNull();
    expect(overview.due).toEqual([]);
    expect(overview.replies).toBeUndefined();
    expect(overview.recent_files).toBeUndefined();
  });

  it("on a build: started, polled, streamed", async () => {
    const started = await startBuild({ kind: "test_zip", by: WALKER, files: 2 });
    expect(started.build).toMatchObject({ kind: "test_zip", name: "Walk files.zip" });
    const ready = await waitForBuild(started.build.build_id, { timeoutMs: 10_000, everyMs: 50 });
    expect(ready.state).toBe("ready");
    expect(ready.progress).toEqual({ done: 2, total: 2 });
    expect(ready.bytes).toBeGreaterThan(0);
    expect((await readBuild(started.build.build_id)).build.state).toBe("ready");
    const opened = await openBuild(started.build.build_id);
    expect(opened).toMatchObject({
      type: "application/zip",
      size: ready.bytes,
      name: "Walk files.zip",
    });
    const bytes = await readBytes(opened.body);
    expect(bytes.length).toBe(ready.bytes);
    expect(bytes.subarray(0, 4).toString("hex")).toBe("504b0304");
  }, 20_000);

  it("on a part of an upload, as raw bytes", async () => {
    const answer = await dataSendPart(
      ok.extend({ received: z_number(), bytes: z_number() }),
      "/data/uploads/up-9/parts/0",
      new Uint8Array(512).fill(1),
    );
    expect(answer).toEqual({ ok: true, received: 0, bytes: 512 });
  });

  it("on a refusal: the service's own sentence reaches the portal as it was said", async () => {
    await expect(startBuild({ kind: "nothing", by: WALKER })).rejects.toMatchObject({
      name: "DataRequestError",
      status: 400,
      code: "invalid",
      message: "No such download.",
    });
    await expect(readBuild("not-there")).rejects.toMatchObject({ status: 404, code: "not_found" });
    await expect(restartData(WALKER)).rejects.toMatchObject({ status: 409, code: "not_stopped" });
    await expect(dataAsk(ok, "GET", "/data/files")).rejects.toMatchObject({
      status: 404,
      code: "module_missing",
    });
    await expect(openBuild("not-there")).rejects.toBeInstanceOf(DataRequestError);
  });

  it("on the page states a read becomes", async () => {
    const fine = await dataRead(readDataStatus);
    expect(fine.ok).toBe(true);
    const refused = await dataRead(() => dataAsk(ok, "POST", "/data/_test/refuse", { by: WALKER }));
    expect(refused).toMatchObject({ ok: false, state: "refused", message: "Refused on purpose." });
    const moduleMissing = await dataRead(() => dataAsk(ok, "GET", "/data/files"));
    expect(moduleMissing).toMatchObject({ ok: false, state: "refused" });
    vi.mocked(notFound).mockClear();
    await dataRead(() => readBuild("not-there"));
    expect(notFound).toHaveBeenCalledTimes(1);
  });

  it("on there being no Data in the service, and no service at all", async () => {
    // A sender without the Data routes: an older service, or one started with HQ_DATA=off.
    const dir = mkdtempSync(join(tmpdir(), "hqmm-"));
    const engine = new MergeEngine({ dir });
    const server: Server = createMergeServer(engine, false);
    const socket = join(dir, "s");
    await new Promise<void>((resolve) => server.listen(socket, resolve));
    const own = process.env.HQ_MAIL_MERGE_SOCKET;
    try {
      process.env.HQ_MAIL_MERGE_SOCKET = socket;
      await expect(readDataStatus()).rejects.toMatchObject({ status: 404, code: "no_such_route" });
      expect(await dataRead(readDataOverview)).toMatchObject({ ok: false, state: "missing" });
      process.env.HQ_MAIL_MERGE_SOCKET = join(dir, "nobody-home");
      await expect(readDataStatus()).rejects.toBeInstanceOf(DataUnavailableError);
      expect(await dataRead(readDataOverview)).toMatchObject({ ok: false, state: "down" });
      delete process.env.HQ_MAIL_MERGE_SOCKET;
      expect(dataConfigured()).toBe(false);
      await expect(readDataOverview()).rejects.toBeInstanceOf(DataUnavailableError);
    } finally {
      process.env.HQ_MAIL_MERGE_SOCKET = own;
      await new Promise((resolve) => server.close(resolve));
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

// zod is imported lazily here so the file reads as the portal's own shapes above.
import { z } from "zod";
const z_number = () => z.number();
