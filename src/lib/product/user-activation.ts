export type AdminUserActivationState = {
  status: "idle" | "success" | "error";
  message: string;
};

export const INITIAL_ADMIN_USER_ACTIVATION_STATE: AdminUserActivationState = {
  status: "idle",
  message: "",
};
