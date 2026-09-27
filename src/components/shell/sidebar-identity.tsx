import type { ShellIdentity } from "@/components/shell/shell-types";
import { EnvBadge, RoleBadge } from "@/components/ui/badge";

type SidebarIdentityProps = {
  identity: ShellIdentity;
  signOutAction: () => Promise<void>;
};

export function SidebarIdentity({ identity, signOutAction }: SidebarIdentityProps) {
  return (
    <div className="identity">
      <div className="identity__person">
        <span className="avatar" aria-hidden="true">
          {identity.initials}
        </span>
        <span>
          <span className="identity__name">{identity.displayName}</span>
          <span className="identity__email">{identity.email}</span>
        </span>
      </div>
      <div className="identity__badges">
        <RoleBadge role={identity.role} />
        <EnvBadge environment={identity.environment} />
      </div>
      <div className="identity__actions">
        <form action={signOutAction}>
          <button className="btn btn--small btn--ghost" type="submit">
            Sign out
          </button>
        </form>
      </div>
    </div>
  );
}
