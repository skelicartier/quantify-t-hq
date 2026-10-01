import type { Metadata } from "next";

import { Wordmark } from "@/components/brand/wordmark";
import { StatusPill, type PillTone } from "@/components/ui/status-pill";
import { HqApiRequestError, HqApiUnavailableError } from "@/lib/api/core";
import { readPublicChangelog, type PublicChangelog } from "@/lib/api/knowledge";
import { formatDate } from "@/lib/format";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Quantify Terminal changelog",
  description: "What changed in Quantify Terminal, newest first.",
};

const TONE: Record<string, PillTone> = { new: "live", improved: "attention", fixed: "neutral" };

/** What changed, as the world may read it: published entries, newest first. */
export default async function PublicChangelogPage() {
  let log: PublicChangelog | null = null;
  try {
    log = await readPublicChangelog();
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
        <span className="status-public__title">Changelog</span>
      </header>
      {log === null ? (
        <div className="status-banner status-banner--degraded">
          <strong>The changelog could not be read just now.</strong>
          <span>That is a problem with this page. Try again shortly.</span>
        </div>
      ) : log.entries.length === 0 ? (
        <p className="field__hint">Nothing published yet.</p>
      ) : (
        log.entries.map((entry, index) => (
          <section
            key={`${entry.published_on}-${index}`}
            className="status-public__section"
            aria-labelledby={`entry-${index}`}
          >
            <p className="field__hint">
              {formatDate(entry.published_on)} ·{" "}
              <StatusPill
                value={entry.kind}
                label={entry.kind_label}
                tone={TONE[entry.kind] ?? "neutral"}
              />
            </p>
            <h2 id={`entry-${index}`}>{entry.title}</h2>
            <p className="prewrap">{entry.body}</p>
          </section>
        ))
      )}
    </main>
  );
}
