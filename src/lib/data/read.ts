import "server-only";

import { notFound } from "next/navigation";

import { readDataStatus } from "@/lib/data/api/status";
import { DataRequestError, DataUnavailableError } from "@/lib/data/socket";

/**
 * A page's read of Data, turned into one of its states. A failed read is never an empty
 * page: each state has its own component in `src/components/data/data-down.tsx`.
 */

export type DataFailureState =
  "down" | "missing" | "opening" | "restarting" | "stopped" | "refused";

export type DataFailure = {
  ok: false;
  state: DataFailureState;
  /** The service's sentence, shown as it is. */
  message: string;
  /** What Data is doing while opening ("Reading the lead files"), when it says. */
  detail: string;
  progress: { done: number; total: number } | null;
};

export type DataRead<T> = { ok: true; data: T } | DataFailure;

export function isDataError(error: unknown): error is DataRequestError | DataUnavailableError {
  return error instanceof DataRequestError || error instanceof DataUnavailableError;
}

/**
 * Run a read and classify what came back. A record that is not there calls `notFound()`;
 * an error that is not the service's is thrown again and reaches the error page.
 */
export async function dataRead<T>(read: () => Promise<T>): Promise<DataRead<T>> {
  try {
    return { ok: true, data: await read() };
  } catch (error) {
    if (error instanceof DataUnavailableError)
      return { ok: false, state: "down", message: error.message, detail: "", progress: null };
    if (!(error instanceof DataRequestError)) throw error;
    if (error.status === 404 && error.code === "no_such_route")
      return { ok: false, state: "missing", message: error.message, detail: "", progress: null };
    if (error.status === 404 && error.code === "not_found") notFound();
    if (error.code === "data_starting") {
      // The host answers /data/status while the worker opens: ask it how far it has got.
      let detail = "";
      let progress: DataFailure["progress"] = null;
      try {
        const status = await readDataStatus();
        detail = status.data.detail;
        progress = status.data.progress;
      } catch {
        // the sentence alone, then
      }
      return { ok: false, state: "opening", message: error.message, detail, progress };
    }
    if (error.code === "data_restarting")
      return { ok: false, state: "restarting", message: error.message, detail: "", progress: null };
    if (error.code === "data_stopped")
      return { ok: false, state: "stopped", message: error.message, detail: "", progress: null };
    return { ok: false, state: "refused", message: error.message, detail: "", progress: null };
  }
}
