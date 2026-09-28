import type { Metadata } from "next";

import { AuthLegal } from "@/components/auth/auth-shell";
import { BrandMark } from "@/components/brand/brand-mark";
import { ButtonLink } from "@/components/ui/button";

export const metadata: Metadata = { title: "Page not found" };

export default function NotFound() {
  return (
    <main className="auth auth--console" id="main-content">
      <section className="auth__panel" aria-labelledby="not-found-heading">
        <div className="auth__brand">
          <BrandMark />
        </div>
        <div className="auth__header">
          <h1 className="auth__title" id="not-found-heading">
            We couldn&apos;t find that page
          </h1>
          <p className="auth__desc">
            The link may be out of date, or the page may have moved. Home and the admin pages are
            still where they were.
          </p>
        </div>
        <div className="auth-form">
          <ButtonLink href="/home" variant="primary" block>
            Go to Home
          </ButtonLink>
          <ButtonLink href="/login" block>
            Sign in
          </ButtonLink>
        </div>
      </section>
      <AuthLegal />
    </main>
  );
}
