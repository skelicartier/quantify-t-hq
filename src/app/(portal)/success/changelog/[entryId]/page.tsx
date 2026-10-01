import Link from "next/link";
import { notFound } from "next/navigation";

import { entryAction } from "@/app/(portal)/_actions/knowledge";
import { EntryKindPill } from "@/components/help/help-parts";
import { PageHeader } from "@/components/shell/page-header";
import { ActForm } from "@/components/ui/act-form";
import { Callout } from "@/components/ui/callout";
import { Card } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { RecordHeader, RecordSection } from "@/components/ui/record-shell";
import { RowAction } from "@/components/ui/row-action";
import { StatusPill } from "@/components/ui/status-pill";
import { hasCapability, requireStaff } from "@/lib/access/core";
import { HqApiRequestError, HqApiUnavailableError } from "@/lib/api/core";
import { readChangelog, readEntry, type Changelog, type ChangelogEntry } from "@/lib/api/knowledge";
import { formatDate } from "@/lib/format";
import { requestNow } from "@/lib/request-time";

export const metadata = { title: "Changelog entry" };
export const dynamic = "force-dynamic";

type Params = Promise<{ entryId: string }>;

/** One entry: its words, the requests it answers and who asked, and publishing it. */
export default async function EntryPage({ params }: { params: Params }) {
  const { entryId } = await params;
  const context = await requireStaff(`/success/changelog/${entryId}`);
  let entry: ChangelogEntry | null = null;
  let log: Changelog | null = null;
  try {
    [entry, log] = await Promise.all([
      readEntry(context.token, entryId).then((read) => read.entry),
      readChangelog(context.token),
    ]);
  } catch (error) {
    if (error instanceof HqApiRequestError && error.status === 404) notFound();
    if (!(error instanceof HqApiUnavailableError || error instanceof HqApiRequestError))
      throw error;
  }
  if (entry === null || log === null) {
    return (
      <>
        <PageHeader eyebrow="Changelog" title="Entry" />
        <Callout tone="danger" role="alert">
          This entry could not be read just now.
        </Callout>
      </>
    );
  }
  const canWrite = hasCapability(context, "crm:write");
  const hidden = { entry_id: entry.entry_id };
  const linked = new Set(entry.requests.map((item) => item.request_id));
  const choices = log.requests.filter((item) => !linked.has(item.request_id));
  const today = new Date(requestNow()).toISOString().slice(0, 10);
  const published = entry.status === "published";

  return (
    <>
      <RecordHeader
        crumbs={[{ href: "/success/changelog", label: "Changelog" }]}
        title={entry.title}
        status={
          published ? (
            <StatusPill value="published" label="Published" tone="live" />
          ) : (
            <StatusPill value="draft" label="Draft" tone="attention" />
          )
        }
        readouts={[
          { label: "Kind", value: entry.kind_label },
          { label: "Published", value: formatDate(entry.published_on, "Not yet") },
          {
            label: "Answers",
            value: `${entry.requests.length} request${entry.requests.length === 1 ? "" : "s"}`,
          },
        ]}
      />
      <div className="page-content">
        <RecordSection id="words" title="What changed">
          <p>
            <EntryKindPill kind={entry.kind} label={entry.kind_label} />
          </p>
          <p className="prewrap">{entry.body || "Not written yet."}</p>
        </RecordSection>

        <RecordSection id="requests" title="What it answers">
          <DataTable
            caption="The feature requests this entry answers"
            columns={[
              { key: "request", label: "Request" },
              { key: "state", label: "State" },
              { key: "asks", label: "Asked by", align: "end" as const },
              { key: "told", label: "Not yet told", align: "end" as const },
              { key: "act", label: "Action" },
            ]}
            isEmpty={entry.requests.length === 0}
            empty={<p className="muted">It answers no request yet.</p>}
            columnMenu={false}
          >
            {entry.requests.map((item) => (
              <tr key={item.request_id}>
                <td>
                  <Link href={`/success/requests/${item.request_id}`}>{item.title}</Link>
                </td>
                <td>{item.status}</td>
                <td className="data-table__num">{item.asks}</td>
                <td className="data-table__num">
                  {item.not_told > 0 && item.status === "shipped" ? (
                    <Link href={`/success/requests/${item.request_id}`}>
                      {item.not_told} to tell
                    </Link>
                  ) : (
                    item.not_told
                  )}
                </td>
                <td>
                  {canWrite && (
                    <RowAction
                      action={entryAction}
                      fields={{ ...hidden, request_id: item.request_id, action: "unlink" }}
                      buttons={[
                        {
                          label: "Unlink",
                          className: "btn btn--small btn--ghost",
                          ariaLabel: `Unlink ${item.title}`,
                        },
                      ]}
                    />
                  )}
                </td>
              </tr>
            ))}
          </DataTable>
          {canWrite && choices.length > 0 && (
            <ActForm action={entryAction} hidden={hidden} act="link" label="Link it">
              <Field id="link-request" label="Another request it answers">
                <Select id="link-request" name="request_id" defaultValue={choices[0]?.request_id}>
                  {choices.map((item) => (
                    <option key={item.request_id} value={item.request_id}>
                      {item.title}
                    </option>
                  ))}
                </Select>
              </Field>
            </ActForm>
          )}
        </RecordSection>

        {canWrite && (
          <RecordSection id="write" title="Write it">
            <ActForm action={entryAction} hidden={hidden} act="edit" label="Save" tight={false}>
              <Field id="entry-title" label="What changed, in a line">
                <Input id="entry-title" name="title" maxLength={160} defaultValue={entry.title} />
              </Field>
              <Field id="entry-kind" label="Kind">
                <Select id="entry-kind" name="kind" defaultValue={entry.kind}>
                  {log.kinds.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field id="entry-body" label="What it means for the people using it">
                <Textarea
                  id="entry-body"
                  name="body"
                  rows={6}
                  maxLength={20000}
                  defaultValue={entry.body}
                />
              </Field>
            </ActForm>
            <div className="form-grid">
              {!published ? (
                <Card
                  title="Publish it"
                  titleAs="h3"
                  description="On the public changelog from this date; the requests it answers are marked shipped."
                >
                  <ActForm
                    action={entryAction}
                    hidden={hidden}
                    act="publish"
                    label="Publish"
                    primary
                  >
                    <Field id="entry-published" label="Published on">
                      <Input
                        id="entry-published"
                        name="published_on"
                        type="date"
                        max={today}
                        defaultValue={today}
                      />
                    </Field>
                  </ActForm>
                </Card>
              ) : (
                <Card
                  title="Take it down"
                  titleAs="h3"
                  description="Off the public changelog; the requests stay shipped."
                >
                  <ActForm
                    action={entryAction}
                    hidden={hidden}
                    act="unpublish"
                    label="Take it down"
                    danger
                  >
                    <Field id="entry-reason" label="Why">
                      <Input id="entry-reason" name="reason" maxLength={400} />
                    </Field>
                  </ActForm>
                </Card>
              )}
            </div>
          </RecordSection>
        )}
      </div>
    </>
  );
}
