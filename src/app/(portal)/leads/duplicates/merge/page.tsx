import Link from "next/link";

import { confirmSudoAction } from "@/app/(portal)/admin/actions";
import { mergeLeadsAction } from "@/app/(portal)/leads/actions";
import { SudoGate } from "@/components/admin/sudo-gate";
import { LeadTabs } from "@/components/crm/lead-tabs";
import { LeadStagePill } from "@/components/crm/pills";
import { PageHeader } from "@/components/shell/page-header";
import { ActForm } from "@/components/ui/act-form";
import { ButtonLink } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { KeyValue, KeyValueRow } from "@/components/ui/key-value";
import { RecordSection } from "@/components/ui/record-shell";
import { hasCapability, requireStaff } from "@/lib/access/core";
import { HqApiRequestError, HqApiUnavailableError } from "@/lib/api/core";
import { readMergePreview, type LeadBrief, type MergePreview } from "@/lib/api/data-quality";
import { directoryOrNull, nameFor } from "@/lib/api/staff";
import { LEAD_STAGE_LABELS, sourceLabel } from "@/lib/crm/vocabulary";
import { formatAbsolute, pluralize } from "@/lib/format";
import { firstSearchValue } from "@/lib/search-params";

export const metadata = { title: "Choose what stays" };
export const dynamic = "force-dynamic";

const BASE = "/leads/duplicates";
const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type MergePageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function refusalText(error: HqApiRequestError): string {
  const reasons = Object.values(error.details).filter(
    (value): value is string => typeof value === "string" && value !== "",
  );
  return reasons.length ? `${reasons.join("; ")}.` : "The service refused this merge.";
}

function who(lead: LeadBrief): string {
  return lead.full_name || lead.email || "Unnamed";
}

export default async function MergeLeadsPage({ searchParams }: MergePageProps) {
  const context = await requireStaff(BASE);
  const parameters = await searchParams;
  const keep = (firstSearchValue(parameters.keep) ?? "").toLowerCase();
  const fold = (firstSearchValue(parameters.fold) ?? "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter((value) => GUID.test(value) && value !== keep)
    .slice(0, 9);
  const canWrite = hasCapability(context, "crm:write");
  let preview: MergePreview | null = null;
  let refused: string | null = null;
  if (GUID.test(keep) && fold.length > 0) {
    try {
      preview = await readMergePreview(context.token, keep, fold);
    } catch (error) {
      if (error instanceof HqApiRequestError && error.status === 400) refused = refusalText(error);
      else if (error instanceof HqApiRequestError && error.status === 404)
        refused = "One of these leads is no longer here.";
      else if (!(error instanceof HqApiUnavailableError || error instanceof HqApiRequestError))
        throw error;
    }
  } else {
    refused = "Choose the leads to merge from the duplicates review.";
  }
  const names = preview ? await directoryOrNull(context.token) : null;
  const fresh = context.me.sudo_fresh;
  const untilLabel = context.me.sudo_until
    ? (formatAbsolute(context.me.sudo_until).split(", ")[1] ?? null)
    : null;
  const everyone = preview ? [preview.keep, ...preview.folds] : [];
  const byId = new Map(everyone.map((lead) => [lead.lead_id, lead]));
  const shown = (key: string, value: string) =>
    key === "owner_staff_id"
      ? value
        ? nameFor(names, value, "A colleague")
        : ""
      : key === "source_key"
        ? sourceLabel(value)
        : value;
  const swapHref = (next: string) =>
    `${BASE}/merge?keep=${next}&fold=${everyone
      .map((lead) => lead.lead_id)
      .filter((id) => id !== next)
      .join(",")}`;

  return (
    <>
      <PageHeader
        eyebrow="CRM"
        title="Choose what stays"
        description="The lead that stays keeps its address, its verification and its history; for each field that differs, pick whose value it keeps. Tags are joined, notes appended with where they came from, and the stage is the furthest any of them reached. The others stay as disqualified duplicates that name it, and their activities and tasks move across."
        actions={<LeadTabs current={BASE} />}
      />
      <div className="page-content">
        {canWrite && (
          <SudoGate
            action={confirmSudoAction}
            fresh={fresh}
            untilLabel={untilLabel}
            returnPath={`${BASE}/merge?keep=${keep}&fold=${fold.join(",")}`}
            purpose="Merging leads needs a fresh code from your authenticator app."
          />
        )}
        {refused !== null ? (
          <Callout tone="attention" role="alert">
            {refused} <Link href={BASE}>Back to the duplicates</Link>
          </Callout>
        ) : preview === null ? (
          <Callout tone="danger" role="alert">
            The merge could not be prepared just now. Nothing has changed.
          </Callout>
        ) : (
          <>
            <RecordSection id="merge-keep" title="Which one stays">
              <ul className="dup-records">
                {everyone.map((lead) => (
                  <li key={lead.lead_id} className="dup-record">
                    <div className="dup-record__main">
                      <span>
                        <Link className="table-title" href={`/leads/${lead.lead_id}`}>
                          {who(lead)}
                        </Link>{" "}
                        <LeadStagePill stage={lead.stage} />
                      </span>
                      <span className="table-sub mono">{lead.email || "No address"}</span>
                      <span className="table-sub">
                        {[
                          lead.origin === "inbound" ? "Wrote in" : "Found",
                          lead.verified_state
                            ? `verified ${lead.verified_state}`
                            : "never verified",
                          lead.emails_sent
                            ? `written to ${pluralize(lead.emails_sent, "time")}`
                            : "never written to",
                        ].join(" · ")}
                      </span>
                    </div>
                    {lead.lead_id === preview!.keep.lead_id ? (
                      <span className="dup-record__keep">Stays</span>
                    ) : (
                      <ButtonLink href={swapHref(lead.lead_id)} size="small" variant="ghost">
                        Keep this one instead
                      </ButtonLink>
                    )}
                  </li>
                ))}
              </ul>
            </RecordSection>

            <RecordSection id="merge-fields" title="What it keeps">
              {canWrite ? (
                <ActForm
                  action={mergeLeadsAction}
                  hidden={{
                    keep: preview.keep.lead_id,
                    fold: preview.folds.map((lead) => lead.lead_id).join(","),
                  }}
                  act="merge"
                  label={`Merge ${pluralize(preview.folds.length, "lead")} into ${who(preview.keep)}`}
                  primary
                  tight={false}
                >
                  {preview.fields
                    .filter((field) => field.differs)
                    .map((field) => {
                      const seen = new Set<string>();
                      const options = field.values.filter((entry) => {
                        if (!entry.value || seen.has(entry.value)) return false;
                        seen.add(entry.value);
                        return true;
                      });
                      return (
                        <fieldset key={field.key} className="merge-choice">
                          <legend>{field.label}</legend>
                          {options.map((entry) => (
                            <label key={entry.lead_id} className="merge-choice__option">
                              <input
                                type="radio"
                                name={`choose.${field.key}`}
                                value={entry.lead_id}
                                defaultChecked={entry.lead_id === field.chosen}
                              />
                              <span>
                                {shown(field.key, entry.value)}
                                <span className="table-sub">
                                  {" "}
                                  from {byId.get(entry.lead_id)?.email || "a lead"}
                                </span>
                              </span>
                            </label>
                          ))}
                        </fieldset>
                      );
                    })}
                  <KeyValue>
                    {preview.fields
                      .filter((field) => !field.differs && field.result)
                      .map((field) => (
                        <KeyValueRow key={field.key} label={field.label}>
                          {shown(field.key, field.result)}
                          {field.chosen !== preview!.keep.lead_id && (
                            <span className="table-sub">
                              taken from {byId.get(field.chosen)?.email || "the other record"}
                            </span>
                          )}
                        </KeyValueRow>
                      ))}
                    <KeyValueRow label="Stage">
                      {LEAD_STAGE_LABELS[preview.after.stage] ?? preview.after.stage}
                    </KeyValueRow>
                    <KeyValueRow label="Tags">
                      {preview.after.tags.length ? preview.after.tags.join(", ") : "None"}
                    </KeyValueRow>
                    <KeyValueRow label="Moves across">
                      {pluralize(preview.moves.activities, "activity", "activities")} and{" "}
                      {pluralize(preview.moves.tasks, "task")}
                    </KeyValueRow>
                  </KeyValue>
                  {preview.after.notes && (
                    <div className="merge-notes">
                      <p className="table-sub">Notes after the merge</p>
                      <p className="merge-notes__text">{preview.after.notes}</p>
                    </div>
                  )}
                </ActForm>
              ) : (
                <p className="page-note">Your role reads the CRM without writing to it.</p>
              )}
            </RecordSection>
          </>
        )}
      </div>
    </>
  );
}
