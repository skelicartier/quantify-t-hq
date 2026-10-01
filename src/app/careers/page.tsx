import type { Metadata } from "next";

import { Wordmark } from "@/components/brand/wordmark";
import { applyAction } from "@/app/careers/actions";
import { ApplyForm } from "@/components/hiring/apply-form";
import { HqApiRequestError, HqApiUnavailableError } from "@/lib/api/core";
import { readPublicCareers, type PublicCareers } from "@/lib/api/hiring";
import { formatDate } from "@/lib/format";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Quantify Terminal careers",
  description: "The roles Quantify Terminal is hiring for, and how to apply.",
};

/** The roles we are hiring for, each with its own short application. */
export default async function CareersPage() {
  let page: PublicCareers | null = null;
  try {
    page = await readPublicCareers();
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
          <Wordmark size="large" />
        </a>
        <span className="status-public__title">Careers</span>
      </header>
      {page === null ? (
        <div className="status-banner status-banner--degraded">
          <strong>The roles could not be read just now.</strong>
          <span>That is a problem with this page. Try again shortly.</span>
        </div>
      ) : page.roles.length === 0 ? (
        <p className="field__hint">No roles are open right now.</p>
      ) : (
        page.roles.map((role) => (
          <section
            key={role.opening_id}
            className="status-public__section"
            aria-labelledby={`role-${role.opening_id}`}
          >
            <h2 id={`role-${role.opening_id}`}>{role.title}</h2>
            <p className="field__hint">
              {[role.team, role.kind_label, role.location].filter(Boolean).join(" · ")}
              {role.closes_on && ` · applications close ${formatDate(role.closes_on)}`}
            </p>
            {role.description && <p className="prewrap">{role.description}</p>}
            <details className="disclosure">
              <summary>Apply for this role</summary>
              <ApplyForm action={applyAction} openingId={role.opening_id} title={role.title} />
            </details>
          </section>
        ))
      )}
    </main>
  );
}
