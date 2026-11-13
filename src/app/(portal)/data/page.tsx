import Link from "next/link";

import { DataUnavailable } from "@/components/data/data-down";
import { DueList } from "@/components/data/due-list";
import { LiveRefresh } from "@/components/shell/live-refresh";
import { PageHeader } from "@/components/shell/page-header";
import { Button, ButtonLink } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { DataTable } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { RecordSection } from "@/components/ui/record-shell";
import { Stat, StatGrid } from "@/components/ui/stat";
import { StatusPill } from "@/components/ui/status-pill";
import { Timestamp } from "@/components/ui/timestamp";
import { DATA_ROLE_LINE, requireData } from "@/lib/data/access";
import { readDataOverview, type DataOverview } from "@/lib/data/api/overview";
import {
  FILE_KINDS,
  OUTCOMES,
  WAITLIST_STAGES,
  WAITLIST_STAGE_ORDER,
  labelOf,
  toneOf,
} from "@/lib/data/labels";
import { dataRead } from "@/lib/data/read";
import { formatBytes, formatDate, formatNumber } from "@/lib/format";
import { requestNow } from "@/lib/request-time";

export const metadata = { title: "Data" };
export const dynamic = "force-dynamic";

const ABOUT =
  "What happened today across sending, replies and files, kept on this computer. Sent today counts real messages Mail merge handed to the provider today, not tests; the provider accepting a message is not proof it arrived. A reply counts once you record it here.";

const WEEK_COLUMNS = [
  { key: "day", label: "Day" },
  { key: "sent", label: "Sent", align: "end" as const },
];

const REPLY_COLUMNS = [
  { key: "who", label: "Who" },
  { key: "outcome", label: "Outcome" },
  { key: "received", label: "Received" },
];

const FILE_COLUMNS = [
  { key: "name", label: "Name" },
  { key: "folder", label: "Folder" },
  { key: "changed", label: "Changed" },
];

function tileCount(overview: DataOverview): 2 | 3 | 4 {
  const tiles = 1 + (overview.replies ? 2 : 0) + (overview.follow_ups ? 1 : 0);
  return tiles >= 4 ? 4 : tiles === 3 ? 3 : 2;
}

/**
 * Data: what happened today, and what is owed next, across sending, replies, files and
 * dates, in honest counts. The figures come from this computer's own records: Mail merge's
 * written log for sending, and what was recorded here for the rest. A block whose module
 * is not loaded is absent, never zero.
 */
export default async function DataPage() {
  const { allowed } = await requireData("/data");
  const now = requestNow();
  const read = allowed ? await dataRead(readDataOverview) : null;
  const overview = read?.ok ? read.data : null;
  return (
    <>
      <PageHeader
        title="Data"
        meta={overview ? <LiveRefresh intervalSeconds={60} label="Data" /> : undefined}
        description={ABOUT}
        actions={
          allowed && overview ? (
            <>
              <ButtonLink href="/data/replies?new=1" variant="primary" size="small">
                Record a reply
              </ButtonLink>
              <ButtonLink href="/data/files?add=1" size="small">
                Add files
              </ButtonLink>
            </>
          ) : undefined
        }
      />
      <div className="page-content">
        {!allowed || !read ? (
          <Callout tone="neutral">{DATA_ROLE_LINE}</Callout>
        ) : !read.ok ? (
          <DataUnavailable failure={read} />
        ) : (
          <Overview overview={read.data} now={now} />
        )}
      </div>
    </>
  );
}

function Overview({ overview, now }: { overview: DataOverview; now: number }) {
  const { replies, follow_ups: followUps } = overview;
  return (
    <>
      <StatGrid columns={tileCount(overview)} label="Today">
        <Stat label="Sent today" value={formatNumber(overview.sent_today)} hint="by Mail merge" />
        {replies && (
          <Stat label="Replies today" value={formatNumber(replies.today)} hint="recorded here" />
        )}
        {replies && (
          <Stat
            label="Yes today"
            value={formatNumber(replies.yes_today)}
            hint={`${formatNumber(replies.yes_total)} in all`}
          />
        )}
        {followUps && (
          <Stat
            label="Follow-ups due"
            value={formatNumber(followUps.due)}
            hint={
              followUps.overdue > 0 ? `${formatNumber(followUps.overdue)} overdue` : "none overdue"
            }
            tone={followUps.overdue > 0 ? "danger" : "default"}
          />
        )}
      </StatGrid>

      <RecordSection id="data-due" title="Due">
        <DueList items={overview.due} today={overview.today} />
      </RecordSection>

      <div className="hqdata-two">
        <RecordSection id="data-sending" title="Sending">
          <p className="hqdata-sending">
            {overview.sending ? (
              <>
                Mail merge is sending &ldquo;
                <Link
                  className="text-link"
                  href={`/mail/merge/mailings/${overview.sending.mailing_id}`}
                >
                  {overview.sending.name}
                </Link>
                &rdquo;.
              </>
            ) : (
              "Nothing is sending."
            )}
          </p>
          <div className="hqdata-week">
            <DataTable
              caption="This week"
              columns={WEEK_COLUMNS}
              scroll={false}
              columnMenu={false}
              minWidth={240}
            >
              {overview.week.map((day) => (
                <tr key={day.day}>
                  <td>{formatDate(day.day)}</td>
                  <td className="data-table__num">{formatNumber(day.sent)}</td>
                </tr>
              ))}
            </DataTable>
          </div>
        </RecordSection>

        {replies && (
          <RecordSection id="data-latest-replies" title="Latest replies">
            <div className="hqdata-print-hide">
              <DataTable
                caption="Latest replies"
                columns={REPLY_COLUMNS}
                columnMenu={false}
                minWidth={360}
                isEmpty={replies.latest.length === 0}
                empty={
                  <EmptyState
                    compact
                    title="No replies recorded yet"
                    description="Record one from a lead, or on Replies."
                  />
                }
              >
                {replies.latest.slice(0, 5).map((reply) => (
                  <tr key={reply.reply_id}>
                    <td>
                      <Link className="table-title" href={`/data/leads/${reply.lead_id}`}>
                        {reply.name || reply.email}
                      </Link>
                      <span className="table-sub">{reply.firm || reply.email}</span>
                    </td>
                    <td>
                      <StatusPill
                        value={reply.outcome}
                        label={labelOf(OUTCOMES, reply.outcome)}
                        tone={toneOf(OUTCOMES, reply.outcome)}
                      />
                    </td>
                    <td>
                      <Timestamp value={reply.received_at} now={now} mode="relative" />
                    </td>
                  </tr>
                ))}
              </DataTable>
            </div>
          </RecordSection>
        )}
      </div>

      {overview.recent_files && (
        <div className="hqdata-print-hide">
          <RecordSection id="data-recent-files" title="Recent files">
            <DataTable
              caption="Recent files"
              columns={FILE_COLUMNS}
              columnMenu={false}
              isEmpty={overview.recent_files.length === 0}
              empty={
                <EmptyState
                  compact
                  title="No files yet"
                  description="Add the deck and the company's papers in Files."
                  action={
                    <ButtonLink href="/data/files?add=1" size="small">
                      Add files
                    </ButtonLink>
                  }
                />
              }
            >
              {overview.recent_files.slice(0, 8).map((file) => (
                <tr key={file.file_id}>
                  <td>
                    <Link className="table-title" href={`/data/files/${file.file_id}`}>
                      {file.title}
                    </Link>
                    <span className="table-sub">
                      {labelOf(FILE_KINDS, file.kind)} · {formatBytes(file.bytes)}
                    </span>
                  </td>
                  <td>{file.folder_path}</td>
                  <td>
                    <Timestamp value={file.updated_at} now={now} mode="relative" />
                    <span className="table-sub">by {file.updated_by_name}</span>
                  </td>
                </tr>
              ))}
            </DataTable>
          </RecordSection>
        </div>
      )}

      {overview.waitlist && (
        <div className="hqdata-print-hide">
          <RecordSection id="data-waitlist" title="Waitlist">
            <p className="hqdata-readouts">
              {WAITLIST_STAGE_ORDER.map((stage, index) => {
                const count = overview.waitlist?.find((item) => item.stage === stage)?.count ?? 0;
                return (
                  <span key={stage}>
                    {index > 0 && " · "}
                    <Link href={`/data/waitlist?stage=${stage}`}>
                      {WAITLIST_STAGES[stage].label} {formatNumber(count)}
                    </Link>
                  </span>
                );
              })}
            </p>
          </RecordSection>
        </div>
      )}

      {overview.backup && (
        <div className="hqdata-print-hide">
          <RecordSection id="data-backup" title="Backup">
            <p className="hqdata-sending">
              {overview.backup.last_at ? (
                <>
                  Last backup downloaded{" "}
                  <Timestamp value={overview.backup.last_at} now={now} mode="relative" />.
                </>
              ) : (
                "No backup downloaded yet."
              )}
            </p>
            {overview.backup.no_backup_disk === true && (
              <p className="hqdata-sending">
                This Mac has no backup disk set up, so Data&rsquo;s files exist only here.
              </p>
            )}
            <form method="post" action="/data/backup">
              <Button type="submit" size="small">
                Download a backup
              </Button>
            </form>
          </RecordSection>
        </div>
      )}
    </>
  );
}
