import Link from "next/link";

import { createEntryAction } from "@/app/(portal)/_actions/knowledge";
import { EntryKindPill } from "@/components/help/help-parts";
import { SuccessTabs } from "@/components/success/success-tabs";
import { PageHeader } from "@/components/shell/page-header";
import { ActForm } from "@/components/ui/act-form";
import { Callout } from "@/components/ui/callout";
import { Section } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { Field, Input, Select } from "@/components/ui/field";
import { Popover } from "@/components/ui/popover";
import { StatusPill } from "@/components/ui/status-pill";
import { requireStaff } from "@/lib/access/core";
import { HqApiRequestError, HqApiUnavailableError } from "@/lib/api/core";
import { readChangelog, type Changelog } from "@/lib/api/knowledge";
import { formatDate } from "@/lib/format";

export const metadata = { title: "Changelog" };
export const dynamic = "force-dynamic";

const COLUMNS = [
  { key: "entry", label: "Entry" },
  { key: "kind", label: "Kind" },
  { key: "state", label: "State" },
  { key: "requests", label: "Answers" },
  { key: "told", label: "Askers not yet told", align: "end" as const },
];

/**
 * What changed, tied to what customers asked for. Publishing an entry ships the requests it
 * answers; the people who asked are told from each request.
 */
export default async function ChangelogPage() {
  const context = await requireStaff("/success/changelog");
  let log: Changelog | null = null;
  try {
    log = await readChangelog(context.token);
  } catch (error) {
    if (!(error instanceof HqApiUnavailableError || error instanceof HqApiRequestError))
      throw error;
  }
  return (
    <>
      <PageHeader
        eyebrow="Customer success"
        title="Changelog"
        description="What changed, and which requests it answers. Publishing an entry puts it on the public changelog and marks what it answers shipped; telling the people who asked is done from each request."
        actions={
          <>
            <SuccessTabs current="/success/changelog" />
            {log?.can_write && (
              <Popover label="Write an entry" variant="primary" width="wide">
                <ActForm
                  action={createEntryAction}
                  hidden={{}}
                  act="create"
                  label="Start it"
                  primary
                  tight={false}
                >
                  <Field id="entry-title" label="What changed, in a line">
                    <Input
                      id="entry-title"
                      name="title"
                      maxLength={160}
                      placeholder="Credit curves"
                    />
                  </Field>
                  <div className="form-grid">
                    <Field id="entry-kind" label="Kind">
                      <Select id="entry-kind" name="kind" defaultValue="new">
                        {log.kinds.map((item) => (
                          <option key={item.value} value={item.value}>
                            {item.label}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <Field id="entry-request" label="The request it answers">
                      <Select id="entry-request" name="request_id" defaultValue="">
                        <option value="">None</option>
                        {log.requests
                          .filter((item) => item.status !== "shipped")
                          .map((item) => (
                            <option key={item.request_id} value={item.request_id}>
                              {item.title}
                            </option>
                          ))}
                      </Select>
                    </Field>
                  </div>
                </ActForm>
              </Popover>
            )}
          </>
        }
      />
      {log === null ? (
        <Callout tone="danger" role="alert">
          The changelog could not be read just now.
        </Callout>
      ) : (
        <div className="page-content">
          <p className="page-note">
            Published entries are public at <Link href="/changelog">/changelog</Link>.
          </p>
          <Section id="entries" title="Entries">
            <DataTable
              caption="Changelog entries, drafts first, then the newest published"
              columns={COLUMNS}
              isEmpty={log.entries.length === 0}
              empty={<p className="muted">No entries yet.</p>}
            >
              {log.entries.map((entry) => (
                <tr key={entry.entry_id}>
                  <td>
                    <Link href={`/success/changelog/${entry.entry_id}`}>{entry.title}</Link>
                  </td>
                  <td>
                    <EntryKindPill kind={entry.kind} label={entry.kind_label} />
                  </td>
                  <td>
                    {entry.status === "published" ? (
                      <StatusPill
                        value="published"
                        label={`Published ${formatDate(entry.published_on)}`}
                        tone="live"
                      />
                    ) : (
                      <StatusPill value="draft" label="Draft" tone="attention" />
                    )}
                  </td>
                  <td>{entry.requests.map((item) => item.title).join(" · ") || "—"}</td>
                  <td className="data-table__num">
                    {entry.requests.reduce((total, item) => total + item.not_told, 0)}
                  </td>
                </tr>
              ))}
            </DataTable>
          </Section>
        </div>
      )}
    </>
  );
}
