/**
 * The state every record form round-trips through `useActionState`. Client-safe: a
 * "use server" module may export only async functions, so the shape lives here.
 */
export type ActionState = {
  status: "idle" | "error" | "sent";
  message: string | null;
  /** Set on success; a form keys on it to reset its fields. */
  sentAt?: number;
  /**
   * A secret shown exactly once — an intake key at minting. It travels only in the
   * action's response to the person who asked, never into a rendered page.
   */
  secret?: string;
  /**
   * The outcome of the last submission is unknown (the response was lost, or the
   * service said the attempt is still in flight). The form keeps its attempt id so a
   * retry replays rather than repeats; every other outcome mints a fresh one.
   */
  keepAttempt?: boolean;
};

export const INITIAL_ACTION_STATE: ActionState = { status: "idle", message: null };
