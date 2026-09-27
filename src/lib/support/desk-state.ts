/** Client-safe state shapes for the desk's forms; a "use server" module may export
 * only async functions, so these live here. */

export type DeskActionState = {
  status: "idle" | "error" | "sent";
  message: string | null;
  /** Set by the action on success; the form keys on it to reset itself. */
  sentAt?: number;
};

export const INITIAL_DESK_STATE: DeskActionState = { status: "idle", message: null };
