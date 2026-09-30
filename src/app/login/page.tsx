import { login } from "@/app/login/actions";
import { AuthShell } from "@/components/auth/auth-shell";
import { CredentialForm } from "@/components/auth/credential-form";
import { redirect } from "next/navigation";

import { Callout } from "@/components/ui/callout";
import { devAutologinPersona } from "@/lib/auth/dev-bypass";
import { sanitizeNextPath } from "@/lib/auth/route-policy";

export const metadata = { title: "Sign in" };
export const dynamic = "force-dynamic";

const NOTICES: Record<string, { tone: "neutral" | "success" | "attention"; text: string }> = {
  "step-expired": {
    tone: "attention",
    text: "That sign-in step expired. Start again with your password.",
  },
  "password-updated": {
    tone: "success",
    text: "Your password was updated. Sign in with the new password.",
  },
  unavailable: {
    tone: "attention",
    text: "The service could not be reached just now. Sign in again to continue.",
  },
};

type LoginPageProps = {
  searchParams: Promise<{
    next?: string | string[];
    notice?: string | string[];
    form?: string | string[];
    ticket?: string | string[];
  }>;
};

/** The shape of the ticket in a reset's one-time link; anything else is ignored. */
const TICKET_SHAPE = /^hqe_[A-Za-z0-9_-]{20,80}$/;

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const parameters = await searchParams;
  const requested = Array.isArray(parameters.next) ? parameters.next[0] : parameters.next;
  const noticeKey = Array.isArray(parameters.notice) ? parameters.notice[0] : parameters.notice;
  const nextPath = sanitizeNextPath(requested);
  const notice = noticeKey ? NOTICES[noticeKey] : undefined;
  const rawTicket = Array.isArray(parameters.ticket) ? parameters.ticket[0] : parameters.ticket;
  const ticket = rawTicket && TICKET_SHAPE.test(rawTicket) ? rawTicket : "";
  // Development only: with the demo sign-in on, the form is skipped unless asked for
  // (`?form=1`, as the harness and scripts do), a notice has something to say, or a
  // reset link brought a ticket.
  if (devAutologinPersona() && !noticeKey && !parameters.form && !ticket) {
    redirect(`/dev/signin?next=${encodeURIComponent(nextPath)}`);
  }
  return (
    <AuthShell
      title="Sign in to HQ"
      description="Staff access only. A password and an authenticator code, every time."
    >
      {notice && (
        <div className="auth-form">
          <Callout tone={notice.tone} compact>
            {notice.text}
          </Callout>
        </div>
      )}
      {ticket && (
        <div className="auth-form">
          <Callout tone="neutral" compact>
            Your authenticator was reset. Sign in with your password, then set up a new
            authenticator. This link works once, within a day of the reset.
          </Callout>
        </div>
      )}
      <CredentialForm action={login} nextPath={nextPath} enrolTicket={ticket} />
    </AuthShell>
  );
}
