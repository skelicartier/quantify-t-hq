import Link from "next/link";

import { CompanyTabs } from "@/components/data/company/company-tabs";
import { DataUnavailable } from "@/components/data/data-down";
import { MeetingFields } from "@/components/data/meetings/meeting-fields";
import { MailForm } from "@/components/mail/mail-form";
import { PageHeader } from "@/components/shell/page-header";
import { ButtonLink } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { DataTable } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { Checkbox, Field, Input, Textarea } from "@/components/ui/field";
import { Popover } from "@/components/ui/popover";
import { StatusPill } from "@/components/ui/status-pill";
import { SegmentedLinks } from "@/components/ui/toolbar";
import { DATA_ROLE_LINE, requireData } from "@/lib/data/access";
import { readMeetings, type MeetingRow, type MeetingsPage } from "@/lib/data/api/meetings";
import {
  MEETING_MODES,
  MEETING_STATES,
  MEETING_TABS,
  NOT_LEGAL_ADVICE,
  dayShort,
  dayWords,
  isGeneral,
} from "@/lib/data/labels-registers";
import { dataRead } from "@/lib/data/read";
import { formatNumber } from "@/lib/format";
import { boundedInteger, firstSearchValue } from "@/lib/search-params";

import { planMeetingAction, recordCircularAction } from "./actions";
import "./meetings.css";

export const metadata = { title: "Meetings" };
export const dynamic = "force-dynamic";

const BASE = "/data/company/meetings";
const PAGE_SIZE = 100;
const ABOUT = `Board meetings, general meetings and resolutions passed by circulation: the notice, who was there, what was resolved and the minutes. The minutes lock once signed. ${NOT_LEGAL_ADVICE}`;

const COLUMNS = [
  { key: "day", label: "Day" },
  { key: "meeting", label: "Meeting", width: "30%" },
  { key: "state", label: "State" },
  { key: "notice", label: "Notice" },
  { key: "quorum", label: "Quorum" },
  { key: "resolutions", label: "Resolutions", align: "end" as const },
  { key: "minutes", label: "Minutes" },
];

type Params = Record<string, string | string[] | undefined>;

export default async function MeetingsPage({ searchParams }: { searchParams: Promise<Params> }) {
  const { allowed } = await requireData(BASE);
  const parameters = await searchParams;
  const asked = firstSearchValue(parameters.kind) ?? "";
  const kind = asked in MEETING_TABS ? asked : "";
  const offset = boundedInteger(firstSearchValue(parameters.offset), 0, 200_000);
  const read = allowed ? await dataRead(() => readMeetings({ kind, offset })) : null;
  const data = read?.ok ? read.data : null;
  const noDirectors = !data?.directors || data.directors.length === 0;
  return (
    <>
      <PageHeader
        title="Meetings"
        description={ABOUT}
        meta={data ? <span className="quiet">{formatNumber(data.held)} held</span> : undefined}
        actions={
          data ? (
            <>
              <Popover label="Plan a meeting" variant="primary" align="end" width="wide">
                <MailForm
                  action={planMeetingAction}
                  submitLabel="Plan it"
                  pendingLabel="Planning…"
                  className="stack-form stack-form--tight hqdata-meeting-form"
                >
                  <MeetingFields prefix="plan" today={data.today} askBoard={noDirectors} />
                </MailForm>
              </Popover>
              <Popover label="Record a resolution by circulation" align="end" width="wide">
                <MailForm
                  action={recordCircularAction}
                  submitLabel="Record it"
                  pendingLabel="Recording…"
                >
                  <Field id="circular-passed" label="Passed on">
                    <Input
                      id="circular-passed"
                      name="passed_on"
                      type="date"
                      required
                      max={data.today}
                      defaultValue={data.today}
                    />
                  </Field>
                  <Field id="circular-title" label="Title">
                    <Input id="circular-title" name="title" required maxLength={200} />
                  </Field>
                  <Field id="circular-text" label="Text">
                    <Textarea id="circular-text" name="text" rows={4} maxLength={8_000} />
                  </Field>
                  <Checkbox
                    id="circular-s179"
                    name="s179_3"
                    label="A matter under section 179(3), such as issuing shares or borrowing"
                    description="These cannot be passed by circulation."
                  />
                </MailForm>
              </Popover>
            </>
          ) : undefined
        }
      />
      <div className="page-content">
        <CompanyTabs current="meetings" />
        {!allowed || !read ? (
          <Callout tone="neutral">{DATA_ROLE_LINE}</Callout>
        ) : !read.ok ? (
          <DataUnavailable failure={read} />
        ) : (
          <MeetingsView page={read.data} kind={kind} />
        )}
      </div>
    </>
  );
}

function MeetingsView({ page, kind }: { page: MeetingsPage; kind: string }) {
  const href = (change: { kind?: string; offset?: number }) => {
    const params = new URLSearchParams();
    const next = change.kind ?? kind;
    if (next) params.set("kind", next);
    if (change.offset) params.set("offset", String(change.offset));
    const rendered = params.toString();
    return `${BASE}${rendered ? `?${rendered}` : ""}`;
  };
  const last = page.offset + page.meetings.length;
  return (
    <div className="hqdata-meetings">
      <p className="page-note">{NOT_LEGAL_ADVICE}</p>
      <SegmentedLinks
        label="Kind"
        items={[
          {
            href: href({ kind: "" }),
            label: `All ${formatNumber(page.counts.all ?? 0)}`,
            current: !kind,
          },
          ...Object.entries(MEETING_TABS).map(([key, label]) => ({
            href: href({ kind: key }),
            label: `${label} ${formatNumber(page.counts[key] ?? 0)}`,
            current: kind === key,
          })),
        ]}
      />
      <p className="hqdata-print-only">
        {kind ? `Kind: ${MEETING_TABS[kind as keyof typeof MEETING_TABS]}` : "Every kind"}
      </p>
      <DataTable
        caption="Meetings"
        columns={COLUMNS}
        columnMenu={false}
        isEmpty={page.meetings.length === 0}
        empty={
          (page.counts.all ?? 0) > 0 ? (
            <EmptyState compact title="None of this kind" description="Try All." />
          ) : (
            <EmptyState
              compact
              title="No meetings yet"
              description="No meetings recorded yet. Plan the next board meeting, or record one already held."
            />
          )
        }
      >
        {page.meetings.map((meeting) => (
          <MeetingLine key={meeting.meeting_id} meeting={meeting} />
        ))}
      </DataTable>
      {page.total > PAGE_SIZE && (
        <nav className="pagination" aria-label="Pagination">
          <span className="toolbar__summary">
            {formatNumber(page.offset + 1)}–{formatNumber(last)} of {formatNumber(page.total)}
          </span>
          {page.offset > 0 && (
            <ButtonLink size="small" href={href({ offset: Math.max(0, page.offset - PAGE_SIZE) })}>
              Previous
            </ButtonLink>
          )}
          {last < page.total && (
            <ButtonLink size="small" href={href({ offset: page.offset + PAGE_SIZE })}>
              Next
            </ButtonLink>
          )}
        </nav>
      )}
    </div>
  );
}

/** "2 of 2 needed", "Not met", "Present", or a dash where there is nothing to count. */
function quorumWords(meeting: MeetingRow): string {
  if (meeting.state !== "held") return "—";
  if (meeting.quorum)
    return meeting.quorum.met
      ? `${formatNumber(meeting.quorum.present)} of ${formatNumber(meeting.quorum.needed)} needed`
      : "Not met";
  if (isGeneral(meeting.kind))
    return meeting.quorum_present === null
      ? "Not recorded"
      : meeting.quorum_present
        ? "Present"
        : "Not present";
  return "—";
}

/** "Draft by 27 Dec", "Comments close 27 Dec", "Sign by 11 Jan", "Signed 8 Jan", or a dash. */
function minutesWords(step: MeetingRow["minutes_step"]): string {
  if (!step) return "—";
  const day = dayShort(step.by);
  if (step.step === "draft") return `Draft by ${day}`;
  if (step.step === "comments") return `Comments close ${day}`;
  if (step.step === "signed") return `Sign by ${day}`;
  return `Signed ${day}`;
}

function MeetingLine({ meeting }: { meeting: MeetingRow }) {
  const day = meeting.held_on ?? meeting.scheduled_on;
  const state = MEETING_STATES[meeting.state];
  const check = meeting.notice_check;
  return (
    <tr
      id={`meeting-${meeting.meeting_id}`}
      className={meeting.state === "cancelled" ? "hqdata-meetings__row--cancelled" : undefined}
    >
      <td className="nowrap">{dayWords(day)}</td>
      <td>
        <Link className="table-title" href={`${BASE}/${meeting.meeting_id}`}>
          {meeting.serial_title}
        </Link>
        <span className="table-sub">
          {[meeting.place, meeting.kind === "circular" ? "" : MEETING_MODES[meeting.mode]]
            .filter(Boolean)
            .join(" · ") || "No place given"}
        </span>
      </td>
      <td>
        <StatusPill value={meeting.state} label={state.label} tone={state.tone} />
      </td>
      <td className={check?.short ? "hqdata-short" : undefined}>{check ? check.words : "—"}</td>
      <td className={meeting.quorum && !meeting.quorum.met ? "hqdata-short" : undefined}>
        {quorumWords(meeting)}
      </td>
      <td className="data-table__num">{formatNumber(meeting.resolutions)}</td>
      <td className="nowrap">{minutesWords(meeting.minutes_step)}</td>
    </tr>
  );
}
