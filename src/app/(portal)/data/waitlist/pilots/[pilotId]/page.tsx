import Link from "next/link";
import { notFound } from "next/navigation";

import { DueChip } from "@/components/crm/pills";
import { DataUnavailable } from "@/components/data/data-down";
import { PilotFields } from "@/components/data/pilots/pilot-fields";
import { conversionWords, pilotValues, priceWords } from "@/components/data/pilots/pilot-words";
import { MailForm } from "@/components/mail/mail-form";
import { PageHeader } from "@/components/shell/page-header";
import { Callout } from "@/components/ui/callout";
import { DataTable } from "@/components/ui/data-table";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Popover } from "@/components/ui/popover";
import {
  Properties,
  Property,
  RecordGrid,
  RecordHeader,
  RecordSection,
} from "@/components/ui/record-shell";
import { RowAction } from "@/components/ui/row-action";
import { StatusPill } from "@/components/ui/status-pill";
import { Timestamp } from "@/components/ui/timestamp";
import { DATA_ROLE_LINE, requireData } from "@/lib/data/access";
import { readPilot, type PilotPage } from "@/lib/data/api/pilots";
import { WAITLIST_STAGES, labelOf } from "@/lib/data/labels";
import {
  PILOT_DECISIONS,
  PILOT_OWNERS,
  PILOT_STATES,
  dayWords,
  termWords,
} from "@/lib/data/labels-close";
import { dataRead } from "@/lib/data/read";
import { requestNow } from "@/lib/request-time";

import "@/components/data/closing/closing.css";
import {
  checkInAction,
  criterionResultAction,
  pilotDecisionAction,
  startPilotAction,
  updatePilotAction,
} from "../actions";

export const metadata = { title: "Pilot" };
export const dynamic = "force-dynamic";

const PILOT_ID = /^[A-Za-z0-9-]{1,64}$/;
const MET = { yes: "Yes", no: "No", "": "Not yet" } as const;

const VERBS: Record<string, string> = {
  planned: "Planned",
  edited: "Edited",
  started: "Started",
  check_in: "Check-in",
  result: "Result",
  decision: "Decision",
};

export default async function PilotRecordPage({
  params,
}: {
  params: Promise<{ pilotId: string }>;
}) {
  const { pilotId } = await params;
  const { allowed } = await requireData(`/data/waitlist/pilots/${pilotId}`);
  if (!PILOT_ID.test(pilotId)) notFound();
  const now = requestNow();
  const read = allowed ? await dataRead(() => readPilot(pilotId)) : null;
  if (!allowed || !read || !read.ok)
    return (
      <>
        <PageHeader title="Pilot" />
        <div className="page-content">
          {!allowed || !read ? (
            <Callout tone="neutral">{DATA_ROLE_LINE}</Callout>
          ) : (
            !read.ok && <DataUnavailable failure={read} />
          )}
        </div>
      </>
    );
  return <Pilot page={read.data} now={now} />;
}

function Pilot({ page, now }: { page: PilotPage; now: number }) {
  const { pilot, today } = page;
  const fields = { pilot_id: pilot.pilot_id };
  const firm = page.entry ? (
    <Link className="text-link" href={`/data/waitlist/${page.entry.entry_id}`}>
      {pilot.firm}
    </Link>
  ) : (
    pilot.firm
  );
  return (
    <div className="hqdata-pilot">
      <RecordHeader
        crumbs={[
          { href: "/data/waitlist", label: "Waitlist" },
          { href: "/data/waitlist/pilots", label: "Pilots" },
        ]}
        title={<>Pilot with {firm}</>}
        status={
          <span className="hqdata-pills">
            <StatusPill
              value={pilot.state}
              label={PILOT_STATES[pilot.state].label}
              tone={PILOT_STATES[pilot.state].tone}
            />
            {pilot.decision && (
              <StatusPill
                value={pilot.decision.outcome}
                label={PILOT_DECISIONS[pilot.decision.outcome]}
                tone={pilot.decision.outcome === "go" ? "live" : "neutral"}
              />
            )}
          </span>
        }
        readouts={[
          { label: "Term", value: termWords(pilot.starts_on, pilot.ends_on) },
          {
            label: "Go/no-go",
            value: pilot.go_no_go_on ? (
              <DueChip due={pilot.go_no_go_on} today={today} />
            ) : (
              "None set"
            ),
          },
          {
            label: "Next check-in",
            value: page.next_check_in ? dayWords(page.next_check_in) : "None owed",
          },
        ]}
        actions={
          <>
            <Popover
              label="Edit"
              variant={pilot.state === "planned" ? "primary" : "default"}
              align="end"
              width="wide"
            >
              <MailForm
                action={updatePilotAction}
                fields={fields}
                submitLabel="Save the pilot"
                pendingLabel="Saving…"
                className="stack-form stack-form--tight hqdata-pilot-form"
              >
                <PilotFields prefix="pilot-edit" values={pilotValues(pilot)} />
              </MailForm>
            </Popover>
            {pilot.state === "planned" && (
              <RowAction
                action={startPilotAction}
                fields={fields}
                className="hqdata-inline-action"
                sentLabel="Started."
                buttons={[{ label: "Start the pilot", className: "btn btn--small" }]}
              />
            )}
            {pilot.state === "running" && (
              <Popover label="Log a check-in" variant="primary" align="end" width="wide">
                <MailForm
                  action={checkInAction}
                  fields={fields}
                  submitLabel="Log it"
                  pendingLabel="Logging…"
                  className="stack-form stack-form--tight hqdata-check-in-form"
                >
                  <Field id="check-in-on" label="On">
                    <Input
                      id="check-in-on"
                      name="on"
                      type="date"
                      max={today}
                      defaultValue={today}
                      required
                    />
                  </Field>
                  <Field id="check-in-note" label="What was said">
                    <Textarea id="check-in-note" name="note" rows={4} maxLength={2_000} required />
                  </Field>
                </MailForm>
              </Popover>
            )}
            {pilot.state !== "decided" && (
              <Popover label="Record the decision" align="end" width="wide">
                <MailForm
                  action={pilotDecisionAction}
                  fields={fields}
                  submitLabel="Record it"
                  pendingLabel="Recording…"
                  className="stack-form stack-form--tight hqdata-decision-form"
                >
                  <Field id="decision-outcome" label="Decision">
                    <Select id="decision-outcome" name="outcome" defaultValue="go">
                      <option value="go">Go</option>
                      <option value="no_go">No-go</option>
                      <option value="extend">Extend it</option>
                    </Select>
                  </Field>
                  <Field id="decision-on" label="On">
                    <Input
                      id="decision-on"
                      name="on"
                      type="date"
                      max={today}
                      defaultValue={today}
                      required
                    />
                  </Field>
                  <Field id="decision-note" label="Note">
                    <Textarea id="decision-note" name="note" rows={3} maxLength={2_000} />
                  </Field>
                  <Field
                    id="decision-converts"
                    label="Converts on"
                    hint="For Go: the day it becomes paid, if agreed."
                  >
                    <Input
                      id="decision-converts"
                      name="converts_on"
                      type="date"
                      defaultValue={pilot.conversion?.on ?? ""}
                    />
                  </Field>
                  <Field id="decision-ends" label="New end" hint="For Extend it.">
                    <Input id="decision-ends" name="ends_on" type="date" min={today} />
                  </Field>
                  <Field id="decision-go-no-go" label="New go/no-go day" hint="For Extend it.">
                    <Input id="decision-go-no-go" name="go_no_go_on" type="date" min={today} />
                  </Field>
                </MailForm>
              </Popover>
            )}
          </>
        }
      />
      {page.warnings.length > 0 && (
        <div className="hqdata-pilot__warnings">
          {page.warnings.map((warning) => (
            <Callout key={warning} tone="attention" compact>
              {warning}
            </Callout>
          ))}
        </div>
      )}
      <RecordGrid side={<Side page={page} />}>
        <RecordSection id="pilot-criteria" title="Success criteria">
          <DataTable
            caption="Success criteria"
            columns={[
              { key: "what", label: "What", width: "30%" },
              { key: "target", label: "Target" },
              { key: "result", label: "Result" },
              { key: "met", label: "Met" },
            ]}
            columnMenu={false}
            scroll={false}
          >
            {pilot.criteria.map((criterion) => (
              <tr key={criterion.criterion_id}>
                <td>
                  <span className="table-title">{criterion.what}</span>
                </td>
                <td>{criterion.target || <span className="table-sub">Not set</span>}</td>
                <td>{criterion.result || <span className="table-sub">Not measured yet</span>}</td>
                <td>
                  <span className="hqdata-met">
                    {MET[criterion.met]}
                    <Popover label="Record the result" align="end" width="wide">
                      <MailForm
                        action={criterionResultAction}
                        fields={{ ...fields, criterion_id: criterion.criterion_id }}
                        submitLabel="Record it"
                        pendingLabel="Recording…"
                      >
                        <Field id={`result-${criterion.criterion_id}`} label="Result">
                          <Input
                            id={`result-${criterion.criterion_id}`}
                            name="result"
                            maxLength={200}
                            defaultValue={criterion.result}
                          />
                        </Field>
                        <Field id={`met-${criterion.criterion_id}`} label="Met">
                          <Select
                            id={`met-${criterion.criterion_id}`}
                            name="met"
                            defaultValue={criterion.met}
                          >
                            <option value="yes">Yes</option>
                            <option value="no">No</option>
                            <option value="">Not yet</option>
                          </Select>
                        </Field>
                      </MailForm>
                    </Popover>
                  </span>
                </td>
              </tr>
            ))}
          </DataTable>
        </RecordSection>

        <RecordSection id="pilot-owners" title={`Owners at ${pilot.firm}`}>
          <dl className="hqdata-kv">
            {(Object.keys(PILOT_OWNERS) as (keyof typeof PILOT_OWNERS)[]).map((key) => (
              <div key={key} className="hqdata-kv__row">
                <dt>{PILOT_OWNERS[key]}</dt>
                <dd>{pilot.owners[key] || <span className="hqdata-attention">Not named</span>}</dd>
              </div>
            ))}
          </dl>
        </RecordSection>

        <RecordSection id="pilot-price" title="Price and conversion">
          <p className="hqdata-line">{priceWords(pilot.price)}</p>
          <p className="hqdata-line">{conversionWords(pilot.conversion)}</p>
        </RecordSection>

        <RecordSection id="pilot-check-ins" title="Check-ins">
          <DataTable
            caption="Check-ins"
            columns={[
              { key: "day", label: "Day", width: "16%" },
              { key: "said", label: "What was said" },
              { key: "by", label: "By", width: "18%" },
            ]}
            columnMenu={false}
            isEmpty={pilot.check_ins.length === 0}
            empty={<p className="page-note">No check-ins yet. Log one each week.</p>}
          >
            {[...pilot.check_ins].reverse().map((item) => (
              <tr key={item.check_in_id}>
                <td>{dayWords(item.on)}</td>
                <td>
                  <span className="hqdata-prose">{item.note}</span>
                </td>
                <td>{item.by.name}</td>
              </tr>
            ))}
          </DataTable>
        </RecordSection>

        {page.agreements !== null && (
          <RecordSection id="pilot-agreement" title="Agreement">
            <AgreementLine page={page} />
          </RecordSection>
        )}

        <RecordSection id="pilot-activity" title="Activity">
          {page.events.length === 0 ? (
            <p className="timeline-empty">Nothing has happened yet.</p>
          ) : (
            <ol className="timeline">
              {page.events.map((event) => (
                <li key={event.event_id} className="timeline__item">
                  <span className="timeline__kind">{VERBS[event.verb] ?? "Change"}</span>
                  <div>
                    <p className="timeline__meta">
                      <span className="timeline__actor">{event.by.name}</span>
                      <Timestamp value={event.at} now={now} mode="relative" />
                    </p>
                    {event.detail && <p className="timeline__body">{event.detail}</p>}
                  </div>
                </li>
              ))}
            </ol>
          )}
        </RecordSection>
      </RecordGrid>
    </div>
  );
}

function AgreementLine({ page }: { page: PilotPage }) {
  const signed = (page.agreements ?? []).find(
    (agreement) => agreement.status === "signed" && /pilot/i.test(agreement.type),
  );
  if (signed)
    return (
      <p className="hqdata-line">
        <Link className="text-link" href={signed.href}>
          Pilot agreement signed {signed.signed_on ? dayWords(signed.signed_on) : ""}
        </Link>
      </p>
    );
  return (
    <p className="page-note">
      No pilot agreement recorded.{" "}
      <Link className="text-link" href="/data/company/agreements">
        Add it in Agreements.
      </Link>
    </p>
  );
}

function Side({ page }: { page: PilotPage }) {
  const { pilot } = page;
  return (
    <Properties title="The pilot">
      <Property label="Firm">
        {page.entry ? (
          <Link className="text-link" href={`/data/waitlist/${page.entry.entry_id}`}>
            {page.entry.firm}
          </Link>
        ) : (
          pilot.firm
        )}
      </Property>
      <Property label="Waitlist stage">
        {page.entry ? labelOf(WAITLIST_STAGES, page.entry.stage) : "Not on the waitlist now"}
      </Property>
      <Property label="Criteria">{pilot.criteria_met}</Property>
      <Property label="Price">{priceWords(pilot.price, true)}</Property>
      {pilot.decision && (
        <Property label="Decision">
          {PILOT_DECISIONS[pilot.decision.outcome]} · {dayWords(pilot.decision.on)} ·{" "}
          {pilot.decision.by.name}
          {pilot.decision.note && <span className="table-sub">{pilot.decision.note}</span>}
        </Property>
      )}
      <Property label="Running now">{page.running_line.split(".")[0]}</Property>
    </Properties>
  );
}
