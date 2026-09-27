import { redirect } from "next/navigation";

import { verifyCode, verifyRecoveryCode } from "@/app/login/actions";
import { AuthShell } from "@/components/auth/auth-shell";
import { CodeForm } from "@/components/auth/code-form";
import { sanitizeNextPath } from "@/lib/auth/route-policy";
import { readPendingCookie } from "@/lib/auth/session";

export const metadata = { title: "Enter your code" };
export const dynamic = "force-dynamic";

type VerifyPageProps = {
  searchParams: Promise<{ next?: string | string[]; mode?: string | string[] }>;
};

export default async function VerifyPage({ searchParams }: VerifyPageProps) {
  const pending = await readPendingCookie();
  if (!pending) redirect("/login?notice=step-expired");
  if (pending.kind === "enroll") redirect("/login/enroll");
  const parameters = await searchParams;
  const requested = Array.isArray(parameters.next) ? parameters.next[0] : parameters.next;
  const mode = Array.isArray(parameters.mode) ? parameters.mode[0] : parameters.mode;
  const nextPath = sanitizeNextPath(requested);
  const recovery = mode === "recovery";
  return (
    <AuthShell
      title={recovery ? "Use a recovery code" : "Enter your code"}
      description={
        recovery
          ? "The fallback for a lost device. Each saved code works exactly once."
          : "The password was right. Now the code from your authenticator app."
      }
    >
      <CodeForm
        action={recovery ? verifyRecoveryCode : verifyCode}
        nextPath={nextPath}
        mode={recovery ? "recovery" : "code"}
      />
    </AuthShell>
  );
}
