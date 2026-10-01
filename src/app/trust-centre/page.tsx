import type { Metadata } from "next";

import { requestDocumentAction } from "@/app/trust-centre/actions";
import { DocumentRequestForm } from "@/components/trust/document-request-form";
import { HqApiRequestError, HqApiUnavailableError } from "@/lib/api/core";
import { readPublicTrustCentre, type PublicTrustCentre } from "@/lib/api/trust-centre";
import { formatDate } from "@/lib/format";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Quantify Terminal trust centre",
  description:
    "How Quantify Terminal protects your data, who processes it, and the documents available on request.",
};

/**
 * The public trust centre: what the owners have written and reviewed, who processes data
 * for us, and the documents a security review can ask for. No badges, no percentages.
 */
export default async function TrustCentrePage() {
  let page: PublicTrustCentre | null = null;
  try {
    page = await readPublicTrustCentre();
  } catch (error) {
    if (!(error instanceof HqApiUnavailableError || error instanceof HqApiRequestError))
      throw error;
  }
  return (
    <main className="status-public" id="main-content">
      <header className="status-public__header">
        <a
          className="auth__wordmark"
          href="https://www.quantifyterminal.com"
          aria-label="Quantify Terminal"
        >
          <span>Quantify</span>
          <span>Terminal</span>
        </a>
        <span className="status-public__title">Trust centre</span>
      </header>
      {page === null ? (
        <div className="status-banner status-banner--degraded">
          <strong>The trust centre could not be read just now.</strong>
          <span>That is a problem with this page. Try again shortly.</span>
        </div>
      ) : (
        <>
          {page.sections.length === 0 && <p className="field__hint">Nothing published yet.</p>}
          {page.sections.map((section, index) => (
            <section
              key={`${section.title}-${index}`}
              className="status-public__section"
              aria-labelledby={`section-${index}`}
            >
              <h2 id={`section-${index}`}>{section.title}</h2>
              <p className="prewrap">{section.body}</p>
              {section.reviewed_on && (
                <p className="field__hint">Reviewed {formatDate(section.reviewed_on)}.</p>
              )}
            </section>
          ))}
          <section className="status-public__section" aria-labelledby="suppliers-heading">
            <h2 id="suppliers-heading">Who processes data for us</h2>
            {page.subprocessors.length === 0 ? (
              <p className="field__hint">None listed.</p>
            ) : (
              <div className="order-form__scroll">
                <table className="order-form__lines">
                  <caption className="sr-only">Sub-processors in use</caption>
                  <thead>
                    <tr>
                      <th scope="col">Service</th>
                      <th scope="col">What for</th>
                      <th scope="col">Where</th>
                    </tr>
                  </thead>
                  <tbody>
                    {page.subprocessors.map((supplier) => (
                      <tr key={supplier.service}>
                        <td>{supplier.service}</td>
                        <td>{supplier.purpose || "—"}</td>
                        <td>{supplier.locations || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="field__hint">
              See also the{" "}
              <a className="text-link" href="/status">
                status page
              </a>{" "}
              and the{" "}
              <a className="text-link" href="/changelog">
                changelog
              </a>
              .
            </p>
          </section>
          {page.documents.length > 0 && (
            <section className="status-public__section" aria-labelledby="documents-heading">
              <h2 id="documents-heading">Documents on request</h2>
              <ul className="plain-list">
                {page.documents.map((document) => (
                  <li key={document.document_id}>
                    <strong>{document.title}</strong>
                    {document.description && (
                      <span className="field__hint"> · {document.description}</span>
                    )}
                    {document.requires_nda && <span className="field__hint"> · after an NDA</span>}
                  </li>
                ))}
              </ul>
              <DocumentRequestForm action={requestDocumentAction} documents={page.documents} />
            </section>
          )}
        </>
      )}
    </main>
  );
}
