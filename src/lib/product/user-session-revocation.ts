export type AdminUserSessionRevocationState = {
  status: "idle" | "success" | "error";
  message: string;
};

export const INITIAL_ADMIN_USER_SESSION_REVOCATION_STATE: AdminUserSessionRevocationState = {
  status: "idle",
  message: "",
};
