import Link from "next/link";

import { DueChip } from "@/components/crm/pills";
import { DataUnavailable } from "@/components/data/data-down";
import {
  questionnaireWords,
  redlineWords,
  referencesWords,
  reviewWords,
} from "@/components/data/diligence/diligence-words";
import { PageHeader } from "@/components/shell/page-header";
import { Callout } from "@/components/ui/callout";
import { DataTable } from "@/components/ui/data-table";
import { RecordSection } from "@/components/ui/record-shell";
import { StatusPill } from "@/components/ui/status-pill";
import { DATA_ROLE_LINE, requireData } from "@/lib/data/access";
import { readDiligence } from "@/lib/data/api/diligence";
import { TRIAL_DECISIONS, TRIAL_RENEWAL_LINE, dayShort, termWords } from "@/lib/data/labels-close";
import { dataRead } from "@/lib/data/read";
import { formatNumber } from "@/lib/format";

import "@/components/data/closing/closing.css";

export const metadata = { title: "Diligence" };
export const dynamic = "force-dynamic";

const BASE = "/data/waitlist/diligence";
const ABOUT =
  "What buyers ask before they buy: their questionnaire, a security review, references and redlines; and Labs dataset trials. A reference is shared only with their consent, data goes to a trial only after their compliance team clears it, and trials never renew on their own.";

const BUYER_COLUMNS = [
  { key: "firm", label: "Firm", width: "18%" },
  { key: "questionnaire", label: "Questionnaire" },
  { key: "review", label: "Security review" },
  { key: "references", label: "References" },
  { key: "redlines", label: "Redlines" },
  { key: "state", label: "State" },
];

const TRIAL_COLUMNS = [
  { key: "firm", label: "Firm", width: "16%" },
  { key: "dataset", label: "Dataset" },
  { key: "version", label: "Dictionary version" },
  { key: "cleared", label: "Cleared" },
  { key: "sample", label: "Sample" },
  { key: "term", label: "Term" },
  { key: "decide", label: "Go/no-go" },
  { key: "decision", label: "Decision" },
];

export default async function DiligencePage() {
  const { allowed } = await requireData(BASE);
  const read = allowed ? await dataRead(readDiligence) : null;
  const data = read?.ok ? read.data : null;
  return (
    <>
      <PageHeader
        title="Diligence"
        description={ABOUT}
        meta={
          data ? <span className="quiet">{formatNumber(data.counts.open)} open</span> : undefined
        }
      />
      <div className="page-content">
        {!allowed || !read ? (
          <Callout tone="neutral">{DATA_ROLE_LINE}</Callout>
        ) : !read.ok ? (
          <DataUnavailable failure={read} />
        ) : (
          <div className="hqdata-diligence">
            <RecordSection id="diligence-buyers" title="Buyer diligence">
              <DataTable
                caption="Buyer diligence"
                columns={BUYER_COLUMNS}
                isEmpty={read.data.diligence.length === 0}
                empty={
                  <p className="page-note">
                    No buyer diligence yet. Open it from a waitlist firm&rsquo;s page when they send
                    a questionnaire.
                  </p>
                }
              >
                {read.data.diligence.map((item) => (
                  <tr key={item.diligence_id}>
                    <td>
                      <Link
                        className="table-title"
                        href={`/data/waitlist/${item.entry_id}#waitlist-diligence`}
                      >
                        {item.firm}
                      </Link>
                    </td>
                    <td>{questionnaireWords(item.questionnaire)}</td>
                    <td>{reviewWords(item.security_review)}</td>
                    <td>{referencesWords(item.references)}</td>
                    <td>{redlineWords(item.redlines)}</td>
                    <td>
                      <StatusPill
                        value={item.state}
                        label={item.state === "open" ? "Open" : "Closed"}
                        tone={item.state === "open" ? "attention" : "neutral"}
                      />
                    </td>
                  </tr>
                ))}
              </DataTable>
            </RecordSection>
            <RecordSection id="diligence-trials" title="Dataset trials">
              <DataTable
                caption="Dataset trials"
                columns={TRIAL_COLUMNS}
                isEmpty={read.data.trials.length === 0}
                empty={<p className="page-note">No dataset trials yet.</p>}
              >
                {read.data.trials.map((trial) => (
                  <tr key={trial.trial_id}>
                    <td>
                      <Link
                        className="table-title"
                        href={`/data/waitlist/${trial.entry_id}#waitlist-trials`}
                      >
                        {trial.firm}
                      </Link>
                    </td>
                    <td>{trial.dataset}</td>
                    <td>{trial.dictionary_version || <span className="table-sub">None</span>}</td>
                    <td>
                      {trial.compliance.cleared_on ? (
                        `Cleared ${dayShort(trial.compliance.cleared_on)} by ${trial.compliance.by_name}`
                      ) : (
                        <span className="hqdata-attention">Not cleared</span>
                      )}
                    </td>
                    <td>{trial.sample ? `Sent ${dayShort(trial.sample.sent_on)}` : "Not sent"}</td>
                    <td>{termWords(trial.starts_on, trial.ends_on)}</td>
                    <td>
                      {trial.go_no_go_on ? (
                        <DueChip due={trial.go_no_go_on} today={read.data.today} />
                      ) : (
                        <span className="table-sub">None set</span>
                      )}
                    </td>
                    <td>
                      {trial.decision ? (
                        TRIAL_DECISIONS[trial.decision.outcome]
                      ) : (
                        <span className="table-sub">Not yet</span>
                      )}
                    </td>
                  </tr>
                ))}
              </DataTable>
              <p className="page-note hqdata-renewal-line">{TRIAL_RENEWAL_LINE}</p>
            </RecordSection>
          </div>
        )}
      </div>
    </>
  );
}
