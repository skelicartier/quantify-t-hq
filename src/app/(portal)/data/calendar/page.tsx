import { DataUnavailable } from "@/components/data/data-down";
import { CalendarLink } from "@/components/data/calendar/calendar-link";
import { MailForm } from "@/components/mail/mail-form";
import { PageHeader } from "@/components/shell/page-header";
import { buttonClass } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { DataTable } from "@/components/ui/data-table";
import { RecordSection } from "@/components/ui/record-shell";
import { DATA_ROLE_LINE, requireData } from "@/lib/data/access";
import { readCalendar, type CalendarPage } from "@/lib/data/api/calendar";
import { AGENDA_SOURCE_LABELS, CALENDAR_DETAIL } from "@/lib/data/labels";
import { dataRead } from "@/lib/data/read";
import { formatNumber } from "@/lib/format";
import { requestNow } from "@/lib/request-time";

import { calendarDetailAction, makeCalendarLinkAction, turnCalendarOffAction } from "./actions";
import "./calendar.css";

export const metadata = { title: "Calendar" };
export const dynamic = "force-dynamic";

const BASE = "/data/calendar";
const ABOUT =
  "What HQ owes you, in the calendar on this Mac: key dates, next steps with investors and waitlist firms, offer deadlines, follow-ups, file reviews and actions from notes. Your calendar reads it from this computer each time it refreshes; nothing goes to another computer.";

const SOURCE_COLUMNS = [
  { key: "source", label: "Source" },
  { key: "items", label: "Items" },
];

export default async function CalendarFeedPage() {
  const { allowed } = await requireData(BASE);
  const now = requestNow();
  const read = allowed ? await dataRead(() => readCalendar()) : null;
  return (
    <>
      <PageHeader title="Calendar" description={ABOUT} />
      <div className="page-content hqdata-calendar">
        {!allowed || !read ? (
          <Callout tone="neutral">{DATA_ROLE_LINE}</Callout>
        ) : !read.ok ? (
          <DataUnavailable failure={read} />
        ) : (
          <Calendar page={read.data} now={now} />
        )}
      </div>
    </>
  );
}

function Calendar({ page, now }: { page: CalendarPage; now: number }) {
  const { feed } = page;
  return (
    <>
      <RecordSection id="calendar-link" title="The link">
        <CalendarLink
          feed={{
            on: feed.on,
            made_at: feed.made_at,
            made_by_name: feed.made_by?.name ?? "",
            last_read_at: feed.last_read_at,
          }}
          now={now}
          make={makeCalendarLinkAction}
          off={turnCalendarOffAction}
        />
      </RecordSection>

      <RecordSection id="calendar-subscribe" title="Subscribe on this Mac">
        <ol className="hqdata-calendar-steps">
          <li>Copy the link above, or press “Open in Calendar”.</li>
          <li>
            In Calendar, choose File › New Calendar Subscription…, paste the link and press
            Subscribe.
          </li>
          <li>
            Set Location to “On My Mac”, not iCloud. iCloud would try to read it from Apple&rsquo;s
            computers, which cannot reach this one, and would keep a copy there.
          </li>
          <li>Set Auto-refresh to every hour. Keep alerts on to be reminded as each date asks.</li>
        </ol>
        <p className="page-note">
          The link works on this Mac while HQ is running. Anyone who has it can read these titles,
          so keep it to yourself, and make a new one if it has been seen.
        </p>
      </RecordSection>

      <RecordSection id="calendar-detail" title="What the events say">
        <MailForm action={calendarDetailAction} submitLabel="Save" pendingLabel="Saving…">
          <fieldset className="fieldset">
            <legend className="sr-only">What the events say</legend>
            {(["full", "plain"] as const).map((key) => (
              <label key={key} className="checkbox">
                <input
                  type="radio"
                  name="detail"
                  value={key}
                  defaultChecked={feed.detail === key}
                />
                <span className="checkbox__label">{CALENDAR_DETAIL[key]}</span>
              </label>
            ))}
          </fieldset>
        </MailForm>
      </RecordSection>

      <RecordSection id="calendar-sources" title="What goes in">
        <DataTable caption="Calendar sources" columns={SOURCE_COLUMNS} columnMenu={false}>
          {page.sources.map((source) => (
            <tr key={source.name}>
              <td>{AGENDA_SOURCE_LABELS[source.name]}</td>
              <td className="num">
                {source.here ? (
                  formatNumber(source.items)
                ) : (
                  <span className="table-sub">Not loaded here</span>
                )}
              </td>
            </tr>
          ))}
        </DataTable>
        <p className="page-note">
          {formatNumber(page.items)} {page.items === 1 ? "item" : "items"} in all, overdue ones on
          today, up to 400 days ahead.
        </p>
      </RecordSection>

      <RecordSection id="calendar-file" title="A file instead">
        <p className="page-note">
          A snapshot of today&rsquo;s list, to open on a phone or another computer. It does not
          update.
        </p>
        <p>
          <a className={buttonClass({ size: "small" })} href={`${BASE}/download`}>
            Download a calendar file (.ics)
          </a>
        </p>
      </RecordSection>
    </>
  );
}
