import { login } from "@/app/login/actions";
import { AuthShell } from "@/components/auth/auth-shell";
import { CredentialForm } from "@/components/auth/credential-form";
import { Callout } from "@/components/ui/callout";
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
  searchParams: Promise<{ next?: string | string[]; notice?: string | string[] }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const parameters = await searchParams;
  const requested = Array.isArray(parameters.next) ? parameters.next[0] : parameters.next;
  const noticeKey = Array.isArray(parameters.notice) ? parameters.notice[0] : parameters.notice;
  const nextPath = sanitizeNextPath(requested);
  const notice = noticeKey ? NOTICES[noticeKey] : undefined;
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
      <CredentialForm action={login} nextPath={nextPath} />
    </AuthShell>
  );
}
