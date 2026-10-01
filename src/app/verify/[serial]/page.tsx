import type { Metadata } from "next";

import { Wordmark } from "@/components/brand/wordmark";
import { AuthLegal } from "@/components/auth/auth-shell";
import { HqApiRequestError, HqApiUnavailableError } from "@/lib/api/core";
import { verifyCertificate, type PublicCertificate } from "@/lib/api/team";
import { formatDate } from "@/lib/format";

export const dynamic = "force-dynamic";

// A verification page is for whoever holds the serial, not for search engines.
export const metadata: Metadata = {
  title: "Certificate check",
  robots: { index: false, follow: false },
};

type VerifyPageProps = { params: Promise<{ serial: string }> };

const SERIAL = /^QT-\d{4}-\d{4}-[A-Z2-9]{6}$/;

/**
 * The public side of a certificate: anyone with the full serial can confirm who it was
 * issued to, for what and when — and whether it still stands. Nothing else is shown,
 * and a serial without its check code finds nothing.
 */
export default async function VerifyPage({ params }: VerifyPageProps) {
  // The router has already decoded the segment; decoding again turned a literal
  // percent sign into a thrown URIError and the public page into an error screen.
  const serial = (await params).serial.trim().toUpperCase();
  let certificate: PublicCertificate | null = null;
  let problem: "not-found" | "busy" | "unavailable" | null = null;
  if (!SERIAL.test(serial)) {
    problem = "not-found";
  } else {
    try {
      certificate = (await verifyCertificate(serial)).certificate;
    } catch (error) {
      if (error instanceof HqApiRequestError) {
        problem = error.status === 429 ? "busy" : "not-found";
      } else if (error instanceof HqApiUnavailableError) {
        problem = "unavailable";
      } else {
        throw error;
      }
    }
  }

  return (
    <main className="auth" id="main-content">
      <section className="auth__panel verify" aria-labelledby="verify-heading">
        <div className="auth__brand">
          <a
            className="auth__wordmark"
            href="https://www.quantifyterminal.com"
            aria-label="Quantify Terminal"
          >
            <Wordmark size="large" />
          </a>
        </div>
        <div className="auth__header">
          <p className="eyebrow">Certificate check</p>
          <h1 className="auth__title" id="verify-heading">
            {certificate
              ? certificate.valid
                ? "This certificate is valid"
                : "This certificate has been revoked"
              : problem === "busy"
                ? "Too many checks"
                : problem === "unavailable"
                  ? "Checking is unavailable"
                  : "No certificate found"}
          </h1>
          <p className="auth__desc">
            {certificate
              ? certificate.valid
                ? "Issued by Quantify Terminal and not revoked."
                : `Quantify Terminal revoked it on ${formatDate(certificate.revoked_on)}. It should not be relied on.`
              : problem === "busy"
                ? "Wait a few minutes before checking again."
                : problem === "unavailable"
                  ? "The check could not be completed just now. Try again shortly."
                  : "No certificate matches this serial. Check it was copied in full, including the last six characters."}
          </p>
        </div>
        {certificate && (
          <dl className={certificate.valid ? "verify__card" : "verify__card verify__card--revoked"}>
            <div>
              <dt>Awarded to</dt>
              <dd className="verify__name">{certificate.recipient_name}</dd>
            </div>
            <div>
              <dt>For</dt>
              <dd>{certificate.title}</dd>
            </div>
            <div>
              <dt>Period</dt>
              <dd>
                {formatDate(certificate.starts_on)} to {formatDate(certificate.ends_on)}
              </dd>
            </div>
            {certificate.summary && (
              <div>
                <dt>Work</dt>
                <dd>{certificate.summary}</dd>
              </div>
            )}
            <div>
              <dt>Issued</dt>
              <dd>{formatDate(certificate.issued_on)}</dd>
            </div>
            <div>
              <dt>Serial</dt>
              <dd className="mono">{certificate.serial}</dd>
            </div>
          </dl>
        )}
      </section>
      <AuthLegal />
    </main>
  );
}
