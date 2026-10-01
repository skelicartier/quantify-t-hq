export type AdminUserRoleState = {
  status: "idle" | "success" | "error";
  message: string;
};

export const INITIAL_ADMIN_USER_ROLE_STATE: AdminUserRoleState = {
  status: "idle",
  message: "",
};
