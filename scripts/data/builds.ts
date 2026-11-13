/**
 * Builds: a file made for one download (a folder's zip, a CSV of a view, a backup). Made
 * in the worker under `data/tmp/`, offered for ten minutes once ready, then removed; the
 * tmp folder is emptied at every start. Modules register a maker per kind; the portal's
 * route starts one and polls `GET /data/builds/:id` until it is ready, then streams
 * `GET /data/builds/:id/bytes` through the host.
 */

import { randomUUID } from "node:crypto";
import { statSync } from "node:fs";

import { Refused } from "../mail-merge/engine";
import type { DataCore } from "./core";
import { clean, isRouteId, wholeNumber } from "./guard";
import type { SendFile, Staff } from "./protocol";
import { ZipWriter } from "./zip";

export type BuildState = "building" | "ready" | "failed";

export type Build = {
  build_id: string;
  kind: string;
  state: BuildState;
  progress: { done: number; total: number };
  name: string;
  bytes: number | null;
  detail: string;
  created_at: string;
};

/** What a maker is given: where to write, and how to say how far it has got. */
export type BuildHandle = {
  build_id: string;
  /** The file to write; it is sent as it is once the maker returns. */
  path: string;
  setProgress(done: number, total: number): void;
  setName(name: string): void;
};

export type BuildInput = {
  query: string;
  folder_id: string;
  by: Staff;
  /** The whole POST body, for a kind that takes more. */
  body: Record<string, unknown>;
};

/** Makes the file at `handle.path`; answers its download name and content type. */
export type BuildMaker = (
  handle: BuildHandle,
  input: BuildInput,
) => Promise<{ name: string; type?: string }>;

const KEEP_MS = 10 * 60 * 1_000;

type Kept = { build: Build; path: string; type: string; timer: NodeJS.Timeout | null };

export class Builds {
  readonly #core: DataCore;
  readonly #makers = new Map<string, BuildMaker>();
  readonly #builds = new Map<string, Kept>();

  constructor(core: DataCore) {
    this.#core = core;
  }

  /** A module says how a kind of download is made. */
  provide(kind: string, maker: BuildMaker): void {
    this.#makers.set(kind, maker);
  }

  kinds(): string[] {
    return [...this.#makers.keys()];
  }

  /** Start a build; the record comes back at once and the file is made in the background. */
  start(kind: string, input: BuildInput, pinnedId?: string): Build {
    const maker = this.#makers.get(kind);
    if (!maker) throw new Refused(400, "invalid", "No such download.");
    const build_id = pinnedId ?? randomUUID();
    const existing = this.#builds.get(build_id);
    if (existing) {
      if (existing.timer) clearTimeout(existing.timer);
      this.#core.store.remove(`tmp/${build_id}`);
    }
    const build: Build = {
      build_id,
      kind,
      state: "building",
      progress: { done: 0, total: 0 },
      name: "",
      bytes: null,
      detail: "",
      created_at: this.#core.now(),
    };
    const path = this.#core.store.path("tmp", build_id);
    const kept: Kept = { build, path, type: "application/octet-stream", timer: null };
    this.#builds.set(build_id, kept);
    const handle: BuildHandle = {
      build_id,
      path,
      setProgress: (done, total) => {
        build.progress = { done, total };
      },
      setName: (name) => {
        build.name = clean(name, 200) || build.name;
      },
    };
    void maker(handle, input)
      .then((made) => {
        build.name = clean(made.name, 200) || build.name || "download";
        kept.type = made.type ?? kept.type;
        build.bytes = statSync(path).size;
        build.progress = { done: build.progress.total || 1, total: build.progress.total || 1 };
        build.state = "ready";
        kept.timer = setTimeout(() => this.#drop(build_id), KEEP_MS);
        kept.timer.unref();
      })
      .catch((error: unknown) => {
        build.state = "failed";
        build.detail = error instanceof Refused ? error.message : "The download could not be made.";
        this.#core.log(`build ${kind} failed: ${error instanceof Error ? error.name : "error"}`);
        this.#core.store.remove(`tmp/${build_id}`);
        kept.timer = setTimeout(() => this.#drop(build_id), KEEP_MS);
        kept.timer.unref();
      });
    return build;
  }

  #drop(build_id: string): void {
    const kept = this.#builds.get(build_id);
    if (!kept) return;
    this.#builds.delete(build_id);
    try {
      this.#core.store.remove(`tmp/${build_id}`);
    } catch {
      // gone already
    }
  }

  get(build_id: string): Build | null {
    return this.#builds.get(build_id)?.build ?? null;
  }

  /** The ready file for the host to stream; refused while building or after a failure. */
  file(build_id: string): SendFile {
    const kept = this.#builds.get(build_id);
    if (!kept) throw new Refused(404, "not_found", "That download is no longer here.");
    if (kept.build.state === "building")
      throw new Refused(409, "not_ready", "The download is still being made.");
    if (kept.build.state === "failed") throw new Refused(409, "failed", kept.build.detail);
    return {
      path: kept.path,
      size: kept.build.bytes ?? 0,
      type: kept.type,
      name: kept.build.name,
      sha256: "",
      remove_after: false,
    };
  }

  close(): void {
    for (const kept of this.#builds.values()) if (kept.timer) clearTimeout(kept.timer);
  }
}

/** The routes every build goes through, and the stand-in's own test kind. */
export function registerBuilds(core: DataCore): void {
  core.route("POST", "/data/builds", (ctx) => {
    const by = ctx.staff();
    const kind = clean(ctx.body.kind, 40);
    const pinned = core.testRoutes && isRouteId(ctx.body.build_id) ? ctx.body.build_id : undefined;
    const build = core.builds.start(
      kind,
      {
        query: clean(ctx.body.query, 2_000),
        folder_id: clean(ctx.body.folder_id, 64),
        by,
        body: ctx.body,
      },
      pinned,
    );
    return { build };
  });
  core.route("GET", "/data/builds/:id", (ctx) => {
    const build = core.builds.get(ctx.params[0]!);
    if (!build) throw new Refused(404, "not_found", "That download is no longer here.");
    return { build };
  });
  core.stream("GET", "/data/builds/:id/bytes", (ctx) => ({
    file: core.builds.file(ctx.params[0]!),
  }));

  if (core.testRoutes) {
    // A zip of invented text files, as slow as the walk asks, to show the download states.
    core.builds.provide("test_zip", async (handle, input) => {
      const files = Math.min(50, Math.max(1, wholeNumber(input.body.files, 3)));
      const delay = Math.min(86_400_000, Math.max(0, wholeNumber(input.body.delay_ms, 0)));
      handle.setName("Walk files.zip");
      handle.setProgress(0, files);
      const zip = new ZipWriter(handle.path);
      for (let index = 1; index <= files; index += 1) {
        if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
        await zip.addBytes(
          `invented-${index}.txt`,
          new TextEncoder().encode(`Invented file ${index} of ${files}, made for the walk.\n`),
        );
        handle.setProgress(index, files);
      }
      await zip.finish();
      return { name: "Walk files.zip", type: "application/zip" };
    });
  }
}
