import { cancelLeadJobAction } from "@/app/(portal)/leads/actions";
import { LiveRefresh } from "@/components/shell/live-refresh";
import { Callout } from "@/components/ui/callout";
import { Meter } from "@/components/ui/meter";
import { RowAction } from "@/components/ui/row-action";
import { Timestamp } from "@/components/ui/timestamp";
import type { LeadJob } from "@/lib/api/crm";
import { LEAD_STAGE_LABELS } from "@/lib/crm/vocabulary";
import { formatNumber } from "@/lib/format";

function words(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String) : [];
}

/** What a change sets, in words: "adding the tag wave 2 and giving them to Asha". */
export function describeLeadChange(
  set: Record<string, unknown>,
  ownerName: (staffId: string) => string,
): string {
  const parts: string[] = [];
  const added = words(set.tags_add);
  const removed = words(set.tags_remove);
  if (added.length)
    parts.push(`adding ${added.length === 1 ? "the tag" : "the tags"} ${added.join(", ")}`);
  if (removed.length)
    parts.push(`removing ${removed.length === 1 ? "the tag" : "the tags"} ${removed.join(", ")}`);
  if (typeof set.owner_staff_id === "string")
    parts.push(
      set.owner_staff_id
        ? `giving them to ${ownerName(set.owner_staff_id) || "a colleague"}`
        : "taking their owner off",
    );
  if (typeof set.stage === "string")
    parts.push(
      `moving them to ${(LEAD_STAGE_LABELS as Record<string, string>)[set.stage] ?? set.stage}`,
    );
  if (typeof set.verified_state === "string")
    parts.push(
      set.verified_state ? `marking them ${set.verified_state}` : "marking them unchecked",
    );
  if (typeof set.nurture_until === "string")
    parts.push(
      set.nurture_until ? `setting them aside until ${set.nurture_until}` : "bringing them back",
    );
  if (set.standardise === "name_case") parts.push("writing names in capitals the ordinary way");
  if (set.standardise === "country") parts.push("writing each country one way");
  return parts.join(" and ") || "a change";
}

function sentence(text: string): string {
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}`;
}

/**
 * A change to a whole view that runs in the background: how far it has got, kept current
 * while the page is open, and the way to stop it. The last one to end, for an hour after.
 */
export function LeadJobsBanner({
  jobs,
  ended,
  now,
  canWrite,
  ownerName,
}: {
  jobs: readonly LeadJob[];
  ended: readonly LeadJob[];
  now: number;
  canWrite: boolean;
  ownerName: (staffId: string) => string;
}) {
  if (jobs.length === 0 && ended.length === 0) return null;
  return (
    <div className="lead-jobs">
      {jobs.map((job) => (
        <Callout
          key={job.job_id}
          tone="attention"
          role="status"
          title={`Changing ${formatNumber(job.matched)} leads in the background`}
        >
          <p className="lead-jobs__line">
            {sentence(describeLeadChange(job.set, ownerName))}: {formatNumber(job.processed)} of{" "}
            {formatNumber(job.matched)} done
            {job.last_error
              ? `. The last slice stopped (${job.last_error}); it is tried again.`
              : "."}
          </p>
          <Meter
            label={`${formatNumber(job.processed)} of ${formatNumber(job.matched)} done`}
            value={job.processed}
            limit={job.matched}
            tone="attention"
          />
          <div className="lead-jobs__actions">
            <LiveRefresh intervalSeconds={10} label="The change in the background" />
            {canWrite && (
              <RowAction
                action={cancelLeadJobAction}
                fields={{ job_id: job.job_id }}
                buttons={[
                  {
                    label: "Stop it here",
                    className: "btn btn--small btn--ghost",
                    ariaLabel: "Stop the change where it is",
                  },
                ]}
              />
            )}
          </div>
        </Callout>
      ))}
      {ended.slice(0, 1).map((job) => (
        <Callout
          key={job.job_id}
          tone={job.state === "done" ? "success" : "neutral"}
          role="status"
          compact
        >
          {job.state === "done" ? "Finished" : "Stopped"}: {describeLeadChange(job.set, ownerName)}{" "}
          — {formatNumber(job.changed)} changed
          {job.unchanged ? `, ${formatNumber(job.unchanged)} already so` : ""}
          {job.skipped ? `, ${formatNumber(job.skipped)} could not change` : ""}
          {job.state !== "done"
            ? `, ${formatNumber(job.matched - job.processed)} left as they were`
            : ""}{" "}
          <Timestamp value={job.finished_at} now={now} mode="relative" />.
        </Callout>
      ))}
    </div>
  );
}
