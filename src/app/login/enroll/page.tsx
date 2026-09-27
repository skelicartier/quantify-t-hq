import { redirect } from "next/navigation";

import { beginEnrollment, confirmEnrollment } from "@/app/login/actions";
import { AuthShell } from "@/components/auth/auth-shell";
import { EnrollPanel } from "@/components/auth/enroll-panel";
import { sanitizeNextPath } from "@/lib/auth/route-policy";
import { readPendingCookie, readSessionToken } from "@/lib/auth/session";

export const metadata = { title: "Set up your authenticator" };
export const dynamic = "force-dynamic";

type EnrollPageProps = {
  searchParams: Promise<{ next?: string | string[] }>;
};

export default async function EnrollPage({ searchParams }: EnrollPageProps) {
  const pending = await readPendingCookie();
  if (!pending) {
    // Enrollment just finished in another render (the session cookie exists) or the
    // step genuinely expired; go where each of those means.
    const token = await readSessionToken();
    redirect(token ? "/home" : "/login?notice=step-expired");
  }
  if (pending.kind !== "enroll") redirect("/login/verify");
  const parameters = await searchParams;
  const requested = Array.isArray(parameters.next) ? parameters.next[0] : parameters.next;
  return (
    <AuthShell
      title="Set up your authenticator"
      description="One-time setup. After this, signing in is your password plus a six-digit code."
    >
      <EnrollPanel
        beginAction={beginEnrollment}
        confirmAction={confirmEnrollment}
        nextPath={sanitizeNextPath(requested)}
      />
    </AuthShell>
  );
}
