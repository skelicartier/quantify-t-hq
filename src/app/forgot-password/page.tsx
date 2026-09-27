import Link from "next/link";

import { requestReset } from "@/app/forgot-password/actions";
import { AuthShell } from "@/components/auth/auth-shell";
import { SingleFieldForm } from "@/components/auth/single-field-form";
import { Callout } from "@/components/ui/callout";

export const metadata = { title: "Reset your sign-in" };
export const dynamic = "force-dynamic";

type ForgotPageProps = { searchParams: Promise<{ sent?: string | string[] }> };

export default async function ForgotPasswordPage({ searchParams }: ForgotPageProps) {
  const parameters = await searchParams;
  const sent = Boolean(Array.isArray(parameters.sent) ? parameters.sent[0] : parameters.sent);
  return (
    <AuthShell
      title="Reset your sign-in"
      description="If the address belongs to a staff account, a reset link is on its way."
    >
      {sent ? (
        <div className="auth-form">
          <Callout tone="success" compact>
            If that address has a staff account, an email with a reset link was sent. The link works
            for one hour.
          </Callout>
          <p className="auth__alt">
            <Link href="/login">Back to sign in</Link>
          </p>
        </div>
      ) : (
        <SingleFieldForm
          action={requestReset}
          kind="email"
          submitLabel="Send the reset link"
          pendingLabel="Sending…"
        />
      )}
    </AuthShell>
  );
}
