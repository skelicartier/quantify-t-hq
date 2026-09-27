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
};

export const INITIAL_ACTION_STATE: ActionState = { status: "idle", message: null };
