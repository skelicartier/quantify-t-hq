import Link from "next/link";

import { completeInvite, completeReset } from "@/app/forgot-password/actions";
import { AuthShell } from "@/components/auth/auth-shell";
import { SingleFieldForm } from "@/components/auth/single-field-form";
import { Callout } from "@/components/ui/callout";

export const metadata = { title: "Set your password" };
export const dynamic = "force-dynamic";

type ResetPageProps = {
  searchParams: Promise<{ token?: string | string[]; invite?: string | string[] }>;
};

/**
 * Two kinds of link land here: a password reset for an existing account, and an
 * invitation for a brand-new one. Both set a password; the invite continues into
 * authenticator enrollment, and neither ever skips the code.
 */
export default async function ResetPasswordPage({ searchParams }: ResetPageProps) {
  const parameters = await searchParams;
  const token = Array.isArray(parameters.token) ? parameters.token[0] : parameters.token;
  const invite = Array.isArray(parameters.invite) ? parameters.invite[0] : parameters.invite;

  if (invite) {
    return (
      <AuthShell
        title="Welcome to HQ"
        description="You have been invited. Choose a password to begin; an authenticator comes next."
      >
        <SingleFieldForm
          action={completeInvite}
          kind="new-password"
          token={invite}
          submitLabel="Set password and continue"
          pendingLabel="Setting up…"
          hint="At least 12 characters. A manager can never see it."
        />
      </AuthShell>
    );
  }

  if (token) {
    return (
      <AuthShell
        title="Choose a new password"
        description="The link works once, for one hour, and dies if the password changes another way."
      >
        <SingleFieldForm
          action={completeReset}
          kind="new-password"
          token={token}
          submitLabel="Update password"
          pendingLabel="Updating…"
          hint="At least 12 characters. Signing in will still ask for your authenticator code."
        />
      </AuthShell>
    );
  }

  return (
    <AuthShell title="This link is incomplete" description="Open the link from your email again.">
      <div className="auth-form">
        <Callout tone="attention" compact>
          The address is missing its token. Copy the full link from the email, or request a fresh
          one.
        </Callout>
        <p className="auth__alt">
          <Link href="/forgot-password">Request a new link</Link>
        </p>
      </div>
    </AuthShell>
  );
}
