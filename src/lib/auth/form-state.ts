/**
 * The state shapes the auth forms share. Client-safe on purpose: this module may
 * import nothing that touches the server, because the "use client" form components
 * render from it.
 */

export type AuthFormState = {
  status: "idle" | "error";
  message: string | null;
};

export const INITIAL_AUTH_STATE: AuthFormState = { status: "idle", message: null };

export type EnrollmentState =
  | { step: "begin"; message: string | null }
  | { step: "show-secret"; secret: string; otpauthUri: string; message: string | null }
  | { step: "done"; recoveryCodes: string[]; next: string };

export const INITIAL_ENROLLMENT_STATE: EnrollmentState = { step: "begin", message: null };
