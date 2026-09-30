import type { Metadata } from "next";

import { subscribeAction } from "@/app/status/actions";
import { StatusBars } from "@/components/status/status-bars";
import { SubscribeForm } from "@/components/status/status-forms";
import { StatusPill } from "@/components/ui/status-pill";
import { HqApiRequestError, HqApiUnavailableError } from "@/lib/api/core";
import { STATE_TONES, readPublicStatus, type StatusPage } from "@/lib/api/status";
import { formatAbsolute } from "@/lib/format";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Quantify Terminal status",
  description: "Whether Quantify Terminal is running, and what we are doing when it is not.",
};

/**
 * The public status page: each part of the service and its state now, what we are doing
 * about anything that is wrong, the maintenance ahead, and the last ninety days of
 * reported incidents — reported, not measured, and it says so.
 */
export default async function PublicStatusPage() {
  let page: StatusPage | null = null;
  try {
    page = await readPublicStatus();
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
        <span className="status-public__title">Status</span>
      </header>
      {page === null ? (
        <div className="status-banner status-banner--degraded">
          <strong>The status page could not be read just now.</strong>
          <span>
            That is a problem with this page, not a report about the service. Try again shortly.
          </span>
        </div>
      ) : (
        <>
          <div className={`status-banner status-banner--${page.overall}`} role="status">
            <strong>{page.overall_label}</strong>
          </div>

          {page.open_incidents.map((incident) => (
            <section
              key={incident.id}
              className="status-public__incident"
              aria-labelledby={`incident-${incident.id}`}
            >
              <h2 id={`incident-${incident.id}`}>{incident.title}</h2>
              <ol className="event-timeline">
                {incident.updates.map((update) => (
                  <li key={update.id} className="event-timeline__row">
                    <span className="event-timeline__kind">{update.status_label}</span>
                    <span className="event-timeline__detail">
                      {update.body}
                      <span className="quiet"> · {formatAbsolute(update.posted_at ?? "")}</span>
                    </span>
                  </li>
                ))}
              </ol>
            </section>
          ))}

          {page.maintenance.map((window) => (
            <section
              key={window.id}
              className="status-public__incident"
              aria-labelledby={`maintenance-${window.id}`}
            >
              <h2 id={`maintenance-${window.id}`}>
                {window.state === "in_progress"
                  ? "Maintenance in progress"
                  : "Scheduled maintenance"}
                : {window.title}
              </h2>
              <p className="clock-line">
                {formatAbsolute(window.starts_at ?? "")} – {formatAbsolute(window.ends_at ?? "")} ·{" "}
                {window.components.map((item) => item.name).join(", ")}
              </p>
              {window.body && <p className="field__hint">{window.body}</p>}
            </section>
          ))}

          <section className="status-public__section" aria-labelledby="components-heading">
            <h2 id="components-heading">The service</h2>
            <ul className="status-components">
              {page.components.map((component) => (
                <li key={component.id} className="status-components__item">
                  <div className="status-components__head">
                    <strong>{component.name}</strong>
                    <StatusPill
                      value={component.state}
                      label={component.state_label}
                      tone={STATE_TONES[component.state] ?? "neutral"}
                    />
                  </div>
                  <StatusBars component={component} />
                </li>
              ))}
            </ul>
            <p className="field__hint">{page.bars_note}</p>
          </section>

          {page.recent_incidents.length > 0 && (
            <section className="status-public__section" aria-labelledby="recent-heading">
              <h2 id="recent-heading">Resolved in the last seven days</h2>
              {page.recent_incidents.map((incident) => (
                <div key={incident.id} className="status-public__past">
                  <strong>{incident.title}</strong>
                  <p className="field__hint">
                    {formatAbsolute(incident.started_at ?? "")} –{" "}
                    {formatAbsolute(incident.resolved_at ?? "")}
                  </p>
                  <p className="clock-line">{incident.updates[0]?.body}</p>
                </div>
              ))}
            </section>
          )}

          <section className="status-public__section">
            <SubscribeForm action={subscribeAction} />
          </section>
        </>
      )}
    </main>
  );
}
