import type { Metadata } from "next";

import { reportAccountAction } from "@/app/report/[token]/actions";
import { AuthShell } from "@/components/auth/auth-shell";
import { ReportAccountForm } from "@/components/auth/report-account-form";

export const dynamic = "force-dynamic";

// The link is for the person it was mailed to, not for search engines.
export const metadata: Metadata = {
  title: "Lock my account",
  robots: { index: false, follow: false },
};

type ReportPageProps = { params: Promise<{ token: string }> };

/**
 * Where "this wasn't me" in a security mail lands. Opening it changes nothing — mail
 * scanners open every link — and one press locks the account.
 */
export default async function ReportPage({ params }: ReportPageProps) {
  const { token } = await params;
  return (
    <AuthShell
      title="Wasn't you?"
      description="If you did not do what the mail described, lock your account now. You do not need to sign in."
    >
      <div className="auth-form">
        <ul className="report-effects">
          <li>Every session on your account ends, wherever it is.</li>
          <li>Your password stops working, for you and for anyone who has it.</li>
          <li>A reset link goes to your own address so you can choose a new one.</li>
          <li>The owners are told, so they can see what happened.</li>
        </ul>
      </div>
      <ReportAccountForm action={reportAccountAction} token={token} />
    </AuthShell>
  );
}
