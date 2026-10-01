import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { Wordmark } from "@/components/brand/wordmark";
import { HqApiRequestError, HqApiUnavailableError } from "@/lib/api/core";
import { AUDIT_TOKEN, readAuditView, type AuditView } from "@/lib/api/controls";
import { formatAbsolute, formatDate } from "@/lib/format";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Quantify Terminal controls",
  robots: { index: false, follow: false },
};

const TYPE_LABELS: Record<string, string> = {
  risk: "Risk",
  finding: "Finding",
  change: "Change",
  continuity_test: "Continuity test",
  answer: "Answer",
  processing: "Processing record",
};

type Params = Promise<{ token: string }>;

/**
 * An auditor's read of the control map: operating controls, their evidence log and what each
 * links to. The link expires and every view is counted; an unknown or ended link is a 404.
 */
export default async function AuditPage({ params }: { params: Params }) {
  const { token } = await params;
  if (!AUDIT_TOKEN.test(token)) notFound();
  let view: AuditView | null = null;
  try {
    view = await readAuditView(token);
  } catch (error) {
    if (error instanceof HqApiRequestError && error.status === 404) notFound();
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
          <Wordmark size="large" />
        </a>
        <span className="status-public__title">Controls</span>
      </header>
      {view === null ? (
        <div className="status-banner status-banner--degraded">
          <strong>The controls could not be read just now.</strong>
          <span>That is a problem with this page. Try again shortly.</span>
        </div>
      ) : (
        <>
          <p className="field__hint">
            Prepared for {view.label}. Read {formatAbsolute(view.read_at, "now")}; this link closes{" "}
            {formatAbsolute(view.expires_at, "soon")}.
          </p>
          {view.controls.length === 0 && (
            <p className="field__hint">No control is operating yet.</p>
          )}
          {view.controls.map((control) => (
            <section
              key={control.ref}
              className="status-public__section"
              aria-labelledby={`control-${control.ref}`}
            >
              <h2 id={`control-${control.ref}`}>
                {control.ref} · {control.title}
              </h2>
              <p className="field__hint">
                {control.domain_label} · {control.frequency_label} · owned by{" "}
                {control.owner_name || "nobody named"}
                {control.operating_since &&
                  ` · operating since ${formatDate(control.operating_since)}`}
                {control.frameworks.length > 0 && ` · answers ${control.frameworks.join(", ")}`}
              </p>
              {control.description && <p className="prewrap">{control.description}</p>}
              <div className="order-form__scroll">
                <table className="order-form__lines">
                  <caption className="sr-only">Evidence for {control.ref}</caption>
                  <thead>
                    <tr>
                      <th scope="col">Evidence</th>
                      <th scope="col">Covers</th>
                      <th scope="col">Kept at</th>
                      <th scope="col">Collected</th>
                    </tr>
                  </thead>
                  <tbody>
                    {control.evidence.length === 0 && (
                      <tr>
                        <td colSpan={4}>None recorded.</td>
                      </tr>
                    )}
                    {control.evidence.map((item, index) => (
                      <tr key={`${item.collected_on}-${index}`}>
                        <td>{item.title}</td>
                        <td>
                          {item.period_start || item.period_end
                            ? `${formatDate(item.period_start, "…")} to ${formatDate(item.period_end, "…")}`
                            : "—"}
                        </td>
                        <td>{item.reference}</td>
                        <td>{formatDate(item.collected_on)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {control.linked.length > 0 && (
                <p className="field__hint">
                  Shown working by:{" "}
                  {control.linked
                    .map(
                      (link) =>
                        `${TYPE_LABELS[link.record_type] ?? link.record_type}: ${link.label}`,
                    )
                    .join(" · ")}
                </p>
              )}
            </section>
          ))}
        </>
      )}
    </main>
  );
}
