import Link from "next/link";

import {
  createDigestAction,
  previewDigestAction,
  updateDigestAction,
} from "@/app/(portal)/_actions/digests";
import { PageHeader } from "@/components/shell/page-header";
import { ActForm } from "@/components/ui/act-form";
import { Callout } from "@/components/ui/callout";
import { Section } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { Field, Select } from "@/components/ui/field";
import { RowAction } from "@/components/ui/row-action";
import { StatusPill } from "@/components/ui/status-pill";
import { requireStaff } from "@/lib/access/core";
import { HqApiRequestError, HqApiUnavailableError } from "@/lib/api/core";
import { readDigests, type DigestSettings } from "@/lib/api/digests";
import { formatAbsolute } from "@/lib/format";

export const metadata = { title: "My digests" };
export const dynamic = "force-dynamic";

const COLUMNS = [
  { key: "view", label: "View" },
  { key: "list", label: "List" },
  { key: "when", label: "When" },
  { key: "state", label: "State" },
  { key: "last", label: "Last one" },
  { key: "next", label: "Next one" },
  { key: "act", label: "Action" },
];

const HOURS = Array.from({ length: 24 }, (_, hour) => hour);

function ScheduleFields({ settings, prefix }: { settings: DigestSettings; prefix: string }) {
  return (
    <div className="form-grid">
      <Field id={`${prefix}-cadence`} label="How often">
        <Select id={`${prefix}-cadence`} name="cadence" defaultValue="weekdays">
          {settings.cadences.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </Select>
      </Field>
      <Field id={`${prefix}-weekday`} label="Day" hint="For once a week.">
        <Select id={`${prefix}-weekday`} name="weekday" defaultValue="0">
          {settings.weekdays.map((day, index) => (
            <option key={day} value={index}>
              {day}
            </option>
          ))}
        </Select>
      </Field>
      <Field id={`${prefix}-hour`} label="At (UTC)">
        <Select id={`${prefix}-hour`} name="hour_utc" defaultValue="7">
          {HOURS.map((hour) => (
            <option key={hour} value={hour}>
              {String(hour).padStart(2, "0")}:00
            </option>
          ))}
        </Select>
      </Field>
    </div>
  );
}

/**
 * Saved views, mailed: what matches a view on the list, as you would see it on the list,
 * at the time you choose. Nothing is sent when nothing matches, unless you ask for that.
 */
export default async function DigestsPage() {
  const context = await requireStaff("/me/digests");
  let settings: DigestSettings | null = null;
  try {
    settings = await readDigests(context.token);
  } catch (error) {
    if (!(error instanceof HqApiUnavailableError || error instanceof HqApiRequestError))
      throw error;
  }
  const open = settings?.views.filter((view) => !view.subscribed) ?? [];

  return (
    <>
      <PageHeader
        eyebrow="Me"
        title="My digests"
        description="A saved view of Companies, Leads or Deals, mailed to you on a schedule: the rows that match it, read as you — the same filters, the same figures you are allowed to see. Save a view on the list first."
      />
      {settings === null ? (
        <Callout tone="danger" role="alert">
          Your digests could not be read just now.
        </Callout>
      ) : (
        <div className="page-content">
          {!settings.mail_ready && (
            <Callout tone="attention" compact>
              Mail is not set up yet, so digests are kept but none can be sent.
            </Callout>
          )}
          <Section id="digests" title="Your digests">
            <DataTable
              caption="Your digests"
              columns={COLUMNS}
              isEmpty={settings.digests.length === 0}
              empty={<p className="muted">None yet. Add one below.</p>}
              columnMenu={false}
            >
              {settings.digests.map((digest) => (
                <tr key={digest.digest_id}>
                  <td>
                    <Link href={`/${digest.list_key}${digest.query ? `?${digest.query}` : ""}`}>
                      {digest.view_name}
                    </Link>
                  </td>
                  <td>{digest.list_label}</td>
                  <td>
                    {digest.schedule}
                    {digest.send_empty ? " · even when empty" : ""}
                  </td>
                  <td>
                    <StatusPill
                      value={digest.active ? "active" : "paused"}
                      label={digest.active ? "On" : "Paused"}
                      tone={digest.active ? "live" : "neutral"}
                    />
                  </td>
                  <td>
                    {digest.last_sent_at ? formatAbsolute(digest.last_sent_at) : "None yet"}
                    {digest.last_outcome && <span className="quiet"> · {digest.last_outcome}</span>}
                  </td>
                  <td>{digest.active ? formatAbsolute(digest.next_due_at, "—") : "—"}</td>
                  <td>
                    <RowAction
                      action={previewDigestAction}
                      fields={{ digest_id: digest.digest_id }}
                      buttons={[
                        {
                          label: "Send me one now",
                          pendingLabel: "Sending…",
                          className: "btn btn--small",
                          ariaLabel: `Send the digest of ${digest.view_name} now`,
                        },
                      ]}
                    />
                    <RowAction
                      action={updateDigestAction}
                      fields={{ digest_id: digest.digest_id }}
                      buttons={[
                        {
                          label: digest.active ? "Pause" : "Resume",
                          name: "action",
                          value: digest.active ? "pause" : "resume",
                          className: "btn btn--small btn--ghost",
                          ariaLabel: `${digest.active ? "Pause" : "Resume"} the digest of ${digest.view_name}`,
                        },
                        {
                          label: "Remove",
                          name: "action",
                          value: "delete",
                          className: "btn btn--small btn--ghost",
                          ariaLabel: `Remove the digest of ${digest.view_name}`,
                        },
                      ]}
                    />
                  </td>
                </tr>
              ))}
            </DataTable>
          </Section>
          <Section id="add" title="Add a digest">
            {open.length === 0 ? (
              <p className="muted">
                Every view you can open is already a digest. Save a view on{" "}
                <Link href="/companies">Companies</Link>, <Link href="/leads">Leads</Link> or{" "}
                <Link href="/deals">Deals</Link> to mail another.
              </p>
            ) : (
              <ActForm
                action={createDigestAction}
                hidden={{}}
                act="create"
                label="Add the digest"
                primary
                tight={false}
              >
                <Field id="digest-view" label="View">
                  <Select id="digest-view" name="view_id" defaultValue={open[0]?.view_id}>
                    {open.map((view) => (
                      <option key={view.view_id} value={view.view_id}>
                        {view.list_label}: {view.name}
                        {view.shared ? " (shared)" : ""}
                      </option>
                    ))}
                  </Select>
                </Field>
                <ScheduleFields settings={settings} prefix="digest" />
                <label className="checkbox">
                  <input type="checkbox" name="send_empty" />
                  <span className="checkbox__label">Send it even when nothing matches</span>
                </label>
              </ActForm>
            )}
          </Section>
        </div>
      )}
    </>
  );
}
