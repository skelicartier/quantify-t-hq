import Link from "next/link";

import { DueChip } from "@/components/crm/pills";
import { DataUnavailable } from "@/components/data/data-down";
import { priceWords } from "@/components/data/pilots/pilot-words";
import { PageHeader } from "@/components/shell/page-header";
import { Callout } from "@/components/ui/callout";
import { DataTable } from "@/components/ui/data-table";
import { StatusPill } from "@/components/ui/status-pill";
import { SegmentedLinks } from "@/components/ui/toolbar";
import { DATA_ROLE_LINE, requireData } from "@/lib/data/access";
import { readPilots, type PilotRow } from "@/lib/data/api/pilots";
import { WAITLIST_STAGES, labelOf } from "@/lib/data/labels";
import {
  PILOTS_AT_ONCE,
  PILOT_OWNERS,
  PILOT_STATES,
  dayShort,
  termWords,
} from "@/lib/data/labels-close";
import { dataRead } from "@/lib/data/read";
import { formatNumber } from "@/lib/format";
import { firstSearchValue } from "@/lib/search-params";

import "@/components/data/closing/closing.css";

export const metadata = { title: "Pilots" };
export const dynamic = "force-dynamic";

const BASE = "/data/waitlist/pilots";
const ABOUT =
  "Pilots with waitlist firms: what success means, who owns it at their end, the price and what it converts to, written down before it starts, with a check-in every week. No benchmark is shown: the widely repeated pilot-to-paid rates have no stated method.";
const EMPTY =
  "No pilots yet. Plan one from a waitlist firm's page, with its criteria written down before it starts.";

const COLUMNS = [
  { key: "firm", label: "Firm", width: "18%" },
  { key: "state", label: "State" },
  { key: "term", label: "Term" },
  { key: "criteria", label: "Criteria" },
  { key: "owners", label: "Owners" },
  { key: "price", label: "Price" },
  { key: "decide", label: "Go/no-go" },
  { key: "check-in", label: "Last check-in" },
];

const TABS = [
  { key: "running", label: "Running" },
  { key: "planned", label: "Planned" },
  { key: "decided", label: "Decided" },
  { key: "", label: "All" },
] as const;

type Params = Record<string, string | string[] | undefined>;

export default async function PilotsPage({ searchParams }: { searchParams: Promise<Params> }) {
  const { allowed } = await requireData(BASE);
  const raw = firstSearchValue((await searchParams).state) ?? "";
  const state = raw === "running" || raw === "planned" || raw === "decided" ? raw : "";
  const read = allowed ? await dataRead(() => readPilots(state)) : null;
  const data = read?.ok ? read.data : null;
  return (
    <>
      <PageHeader
        title="Pilots"
        description={ABOUT}
        meta={
          data ? (
            <span className="quiet">{formatNumber(data.counts.running)} running</span>
          ) : undefined
        }
      />
      <div className="page-content">
        {!allowed || !read ? (
          <Callout tone="neutral">{DATA_ROLE_LINE}</Callout>
        ) : !read.ok ? (
          <DataUnavailable failure={read} />
        ) : (
          <div className="hqdata-pilots">
            <Callout
              tone={read.data.counts.running > PILOTS_AT_ONCE ? "attention" : "neutral"}
              compact
              className="hqdata-pilots__line"
            >
              {read.data.running_line}
            </Callout>
            <SegmentedLinks
              label="State"
              items={TABS.map((tab) => ({
                href: tab.key ? `${BASE}?state=${tab.key}` : BASE,
                label: `${tab.label} ${formatNumber(read.data.counts[tab.key || "all"])}`,
                current: state === tab.key,
              }))}
            />
            <DataTable
              caption="Pilots"
              columns={COLUMNS}
              isEmpty={read.data.pilots.length === 0}
              empty={<p className="page-note hqdata-pilots__empty">{EMPTY}</p>}
            >
              {read.data.pilots.map((pilot) => (
                <PilotLine key={pilot.pilot_id} pilot={pilot} today={read.data.today} />
              ))}
            </DataTable>
          </div>
        )}
      </div>
    </>
  );
}

function PilotLine({ pilot, today }: { pilot: PilotRow; today: string }) {
  const last = pilot.last_check_in;
  const stale = pilot.state === "running" && last !== null && last < addDaysText(today, -7);
  return (
    <tr>
      <td>
        <Link className="table-title" href={`${BASE}/${pilot.pilot_id}`}>
          {pilot.firm}
        </Link>
        <span className="table-sub">
          {pilot.entry_stage
            ? labelOf(WAITLIST_STAGES, pilot.entry_stage)
            : "Not on the waitlist now"}
        </span>
      </td>
      <td>
        <StatusPill
          value={pilot.state}
          label={PILOT_STATES[pilot.state].label}
          tone={PILOT_STATES[pilot.state].tone}
        />
      </td>
      <td>{termWords(pilot.starts_on, pilot.ends_on)}</td>
      <td>{pilot.criteria_met}</td>
      <td>
        {pilot.owners_missing.length === 0 ? (
          "All three named"
        ) : (
          <span className="hqdata-attention">
            Not named:{" "}
            {pilot.owners_missing.map((key) => PILOT_OWNERS[key].toLowerCase()).join(", ")}
          </span>
        )}
      </td>
      <td>{priceWords(pilot.price, true)}</td>
      <td>
        {pilot.go_no_go_on ? (
          <DueChip due={pilot.go_no_go_on} today={today} />
        ) : (
          <span className="table-sub">None set</span>
        )}
      </td>
      <td>
        {last ? (
          <span className={stale ? "hqdata-danger" : undefined}>{dayShort(last)}</span>
        ) : (
          <span className="table-sub">None yet</span>
        )}
      </td>
    </tr>
  );
}

/** A calendar date plus whole days, with no zone involved. */
function addDaysText(day: string, count: number): string {
  const [year = 0, month = 1, date = 1] = day.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, date + count)).toISOString().slice(0, 10);
}
