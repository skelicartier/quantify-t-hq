export type ShellIdentity = {
  email: string;
  displayName: string;
  initials: string;
  role: string;
  environment: string;
  /** Development only: other personas one click away. Empty in a production build. */
  devPersonas?: ReadonlyArray<{ email: string; label: string }> | undefined;
};
