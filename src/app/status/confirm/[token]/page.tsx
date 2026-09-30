import type { Metadata } from "next";

import { confirmAction } from "@/app/status/actions";
import { AuthShell } from "@/components/auth/auth-shell";
import { ActForm } from "@/components/ui/act-form";

export const dynamic = "force-dynamic";

// A link for the person it was mailed to, not for search engines.
export const metadata: Metadata = {
  title: "Confirm status updates",
  robots: { index: false, follow: false },
};

type Props = { params: Promise<{ token: string }> };

/** Opening the link changes nothing — mail scanners open every link — and one press does it. */
export default async function StatusLinkPage({ params }: Props) {
  const { token } = await params;
  return (
    <AuthShell
      title="Confirm status updates"
      description="Press below to start getting mail when Quantify Terminal has a problem, and when it is fixed. Opening this page changed nothing."
    >
      <div className="auth-form">
        <ActForm
          action={confirmAction}
          hidden={{ token }}
          act="confirm"
          label="Confirm"
          primary
          tight={false}
        />
        <p className="field__hint">
          <a href="/status">See the status page</a>
        </p>
      </div>
    </AuthShell>
  );
}
