import { ControlRefNote } from "@/components/data/security/control-ref";
import type { DutyView, FlowdownView } from "@/lib/data/api/profiles";
import { dayWords } from "@/lib/data/labels-company";

import "@/components/data/security/control-ref.css";

/**
 * Where a duty from the list comes from (ws-notes/security/spec.md §9.5): SEBI CSCRF's and
 * DORA's control references with their sources; the UK ones with the source they were read in,
 * as `ControlRefNote` prints one. His own duties print nothing.
 */
export function DutyRef({ duty, flowdown }: { duty: DutyView; flowdown: FlowdownView | null }) {
  if (duty.regime === "sebi") return <ControlRefNote refs={["cscrf"]} />;
  if (duty.regime === "dora") return <ControlRefNote refs={["dora_30"]} />;
  const sources = flowdown?.sources ?? [];
  if (duty.regime !== "uk" || !flowdown || sources.length === 0) return null;
  return (
    <span className="hqdata-control-ref">
      {sources.map((source, index) => (
        <span key={source.url}>
          {index > 0 && " · "}
          <a
            className="text-link"
            href={source.url}
            target="_blank"
            rel="noopener noreferrer"
            title={source.name}
          >
            Source
          </a>
          <span className="hqdata-control-ref__url"> ({source.url})</span>
        </span>
      ))}
      {`, checked ${dayWords(flowdown.verified_on)}`}
    </span>
  );
}
