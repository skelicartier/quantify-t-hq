import "server-only";

import Link from "next/link";

import { planPilotAction } from "@/app/(portal)/data/waitlist/pilots/actions";
import { DataUnavailable } from "@/components/data/data-down";
import { MailForm } from "@/components/mail/mail-form";
import { Popover } from "@/components/ui/popover";
import { RecordSection } from "@/components/ui/record-shell";
import { StatusPill } from "@/components/ui/status-pill";
import { readEntryPilots } from "@/lib/data/api/pilots";
import { PILOT_STATES, dayWords, termWords } from "@/lib/data/labels-close";
import { formatNumber } from "@/lib/format";
import { dataRead } from "@/lib/data/read";

import { EMPTY_PILOT, PilotFields, type PilotFieldValues } from "./pilot-fields";
import "@/components/data/closing/closing.css";

/**
 * The Pilot section on a waitlist firm's page (ws-notes/company/spec.md §9.7.5): the open
 * pilot in one line, linked; or "Plan a pilot". A firm moved to Pilot before pilots had a
 * record of their own is asked for its criteria and owners, the form filled from the stage.
 */

export type PilotEntry = {
  entry_id: string;
  firm: string;
  stage: string;
  pilot: { starts_on: string | null; ends_on: string | null; success: string } | null;
};

export async function EntryPilotSection({ entry }: { entry: PilotEntry }) {
  const read = await dataRead(() => readEntryPilots(entry.entry_id));
  if (!read.ok)
    return (
      <RecordSection id="waitlist-pilot" title="Pilot">
        <DataUnavailable failure={read} />
      </RecordSection>
    );
  const pilots = read.data.pilots;
  const open = pilots.find((pilot) => pilot.state === "planned" || pilot.state === "running");
  const earlier = pilots.filter((pilot) => pilot !== open).length;
  const fromStage = entry.stage === "pilot" && pilots.length === 0;
  const values: PilotFieldValues =
    fromStage && entry.pilot
      ? {
          ...EMPTY_PILOT,
          starts_on: entry.pilot.starts_on ?? "",
          ends_on: entry.pilot.ends_on ?? "",
          criteria: entry.pilot.success ? [{ what: entry.pilot.success, target: "" }] : [],
        }
      : EMPTY_PILOT;
  const plan = (
    <Popover label="Plan a pilot" variant="primary" align="end" width="wide">
      <MailForm
        action={planPilotAction}
        fields={{ entry_id: entry.entry_id }}
        submitLabel="Plan the pilot"
        pendingLabel="Planning…"
        className="stack-form stack-form--tight hqdata-pilot-form"
      >
        <PilotFields prefix={`plan-${entry.entry_id}`} values={values} />
      </MailForm>
    </Popover>
  );
  return (
    <RecordSection id="waitlist-pilot" title="Pilot" actions={open ? undefined : plan}>
      {open ? (
        <p className="hqdata-line hqdata-entry-pilot">
          <StatusPill
            value={open.state}
            label={PILOT_STATES[open.state].label}
            tone={PILOT_STATES[open.state].tone}
          />{" "}
          <Link className="text-link" href={`/data/waitlist/pilots/${open.pilot_id}`}>
            {termWords(open.starts_on, open.ends_on)}
          </Link>{" "}
          · Criteria {open.criteria_met.toLowerCase()}
          {open.next_check_in ? ` · Next check-in ${dayWords(open.next_check_in)}` : ""}
        </p>
      ) : fromStage ? (
        <p className="page-note">
          This firm moved to Pilot before pilots had their own record. Write its criteria and
          owners.
        </p>
      ) : (
        <p className="page-note">No pilot planned.</p>
      )}
      {earlier > 0 && (
        <p className="hqdata-line">
          <Link className="text-link" href="/data/waitlist/pilots?state=decided">
            Earlier pilots: {formatNumber(earlier)}
          </Link>
        </p>
      )}
    </RecordSection>
  );
}
