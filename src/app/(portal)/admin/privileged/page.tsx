import {
  endElevationAction,
  grantEligibilityAction,
  liftExportQuotaAction,
  markBreakGlassAction,
  recordBreakGlassTestAction,
  revokeEligibilityAction,
} from "@/app/(portal)/admin/privileged/actions";
import { confirmSudoAction } from "@/app/(portal)/admin/actions";
import { AdminTabs } from "@/components/admin/admin-tabs";
import { SudoGate } from "@/components/admin/sudo-gate";
import {
  GrantEligibilityForm,
  LiftQuotaForm,
  MarkBreakGlassForm,
  NoteForm,
} from "@/components/security/privileged-forms";
import { PageHeader } from "@/components/shell/page-header";
import { Callout } from "@/components/ui/callout";
import { Section } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { RowAction } from "@/components/ui/row-action";
import { Stat, StatGrid } from "@/components/ui/stat";
import { StatusPill } from "@/components/ui/status-pill";
import { hasCapability, requireStaff } from "@/lib/access/core";
import { HqApiRequestError, HqApiUnavailableError } from "@/lib/api/core";
import { readPrivileged, type Privileged } from "@/lib/api/privileged";
import { formatAbsolute, formatDate } from "@/lib/format";

export const metadata = { title: "Privileged access" };
export const dynamic = "force-dynamic";

/**
 * Who can do more than their role, and what left HQ: the sealed break-glass accounts and
 * when each was last tested, who may elevate and who has, and every exported file with
 * whether its marker has been seen outside.
 */
export default async function PrivilegedPage() {
  const context = await requireStaff("/admin/privileged");
  if (!hasCapability(context, "hq:admin")) {
    return (
      <>
        <PageHeader eyebrow="Admin" title="Privileged access" />
        <Callout tone="neutral">Privileged access is for HQ owners and admins.</Callout>
      </>
    );
  }
  let data: Privileged | null = null;
  try {
    data = await readPrivileged(context.token);
  } catch (error) {
    if (!(error instanceof HqApiUnavailableError || error instanceof HqApiRequestError))
      throw error;
  }
  const fresh = context.me.sudo_fresh;
  const owner = data?.viewer_is_owner ?? false;
  const canAct = owner && fresh;
  const untilLabel = context.me.sudo_until
    ? (formatAbsolute(context.me.sudo_until).split(", ")[1] ?? null)
    : null;
  const live = (data?.elevations ?? []).filter((row) => row.state === "live");
  const tripped = (data?.exports ?? []).filter((row) => row.tripped_at);
  const due = (data?.break_glass ?? []).filter((row) => row.test_due);
  const markable = (data?.owners ?? []).filter(
    (row) => !row.break_glass && row.staff_id !== context.me.staff.staff_id,
  );

  return (
    <>
      <PageHeader
        eyebrow="Admin"
        title="Privileged access"
        description="The sealed accounts for the day nobody can sign in, who may take a bigger role for a few hours, and every file that left HQ."
        actions={<AdminTabs current="/admin/privileged" />}
      />
      {data === null ? (
        <Callout tone="danger" role="alert">
          Privileged access could not be read just now.
        </Callout>
      ) : (
        <div className="page-content">
          <StatGrid columns={4} label="Privileged access">
            <Stat label="Elevated now" value={live.length} />
            <Stat label="Eligible to elevate" value={data.eligibility.length} />
            <Stat
              label="Break-glass tests due"
              value={due.length}
              tone={due.length ? "danger" : "default"}
              hint={
                data.break_glass.length
                  ? `${data.break_glass.length} sealed ${data.break_glass.length === 1 ? "account" : "accounts"}`
                  : "None marked"
              }
            />
            <Stat
              label="Files seen outside HQ"
              value={tripped.length}
              tone={tripped.length ? "danger" : "default"}
              hint="Last 30 days"
            />
          </StatGrid>
          {owner && (
            <SudoGate
              action={confirmSudoAction}
              fresh={fresh}
              untilLabel={untilLabel}
              returnPath="/admin/privileged"
              purpose="Granting, revoking, marking and lifting need a fresh code from your authenticator app."
            />
          )}
          {!owner && (
            <Callout tone="neutral" compact>
              You can read this page; only owners change it.
            </Callout>
          )}

          <Section
            id="break-glass"
            title="Break-glass accounts"
            description={`An owner account kept sealed for the day nobody else can sign in. Every sign-in on it tells every other owner at once. Test it at least every ${data.test_days} days: sign in with it, then record the test here.`}
          >
            {data.break_glass.length === 0 ? (
              <p className="muted">
                None marked. Without one, losing the owners&rsquo; authenticators locks HQ.
              </p>
            ) : (
              <ul className="ask-list">
                {data.break_glass.map((row) => (
                  <li key={row.staff_id} className="ask-list__item">
                    <div className="ask-list__head">
                      <strong>{row.display_name || row.email}</strong>
                      <StatusPill
                        value={row.test_due ? "due" : "tested"}
                        label={
                          row.days_since_test === null
                            ? "Never tested"
                            : row.test_due
                              ? `Test due: ${row.days_since_test} days`
                              : `Tested ${row.days_since_test} days ago`
                        }
                        tone={row.test_due ? "attention" : "live"}
                      />
                      {!row.has_passkey && (
                        <StatusPill value="no-passkey" label="No passkey" tone="attention" />
                      )}
                    </div>
                    <p className="field__hint">
                      {row.email}
                      {row.last_login_at
                        ? ` · last signed in ${formatAbsolute(row.last_login_at)}`
                        : " · never signed in"}
                      {row.test_note ? ` · last test: “${row.test_note}”` : ""}
                    </p>
                    {!row.has_passkey && (
                      <p className="field__hint">
                        Add a hardware passkey to it: a sealed code alone can be phished.
                      </p>
                    )}
                    {owner && (
                      <div className="form-grid">
                        <NoteForm
                          action={recordBreakGlassTestAction}
                          hidden={{ staff_id: row.staff_id }}
                          id={`glass-test-${row.staff_id.slice(0, 8)}`}
                          name="note"
                          label="Record a test"
                          hint="It must have signed in within the last day."
                          button="Record the test"
                          pending="Recording…"
                          disabled={!canAct}
                        />
                        <NoteForm
                          action={markBreakGlassAction}
                          hidden={{ staff_id: row.staff_id, on: "false" }}
                          id={`glass-off-${row.staff_id.slice(0, 8)}`}
                          name="reason"
                          label="Stop treating it as break-glass"
                          hint="Why. Kept in the audit log."
                          button="Unmark"
                          pending="Unmarking…"
                          disabled={!canAct}
                        />
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {owner && markable.length > 0 && (
              <details className="disclosure">
                <summary>Mark an account</summary>
                <MarkBreakGlassForm
                  action={markBreakGlassAction}
                  owners={markable}
                  disabled={!canAct}
                />
              </details>
            )}
          </Section>

          <Section
            id="elevation"
            title="Elevation"
            description={`Someone eligible takes a bigger role for 1 to ${data.max_hours} hours, with a reason and a fresh code. Owners are mailed, and everything done while elevated is marked in the audit log. Never Owner: that is what the break-glass account is for.`}
          >
            <DataTable
              caption="Who may elevate"
              columns={[
                { key: "who", label: "Who" },
                { key: "role", label: "May take" },
                { key: "hours", label: "Up to" },
                { key: "until", label: "Until" },
                { key: "why", label: "Why" },
                { key: "by", label: "Granted by" },
                ...(owner ? [{ key: "act", label: "Action" }] : []),
              ]}
              isEmpty={data.eligibility.length === 0}
              empty={
                <p className="muted">Nobody is eligible. Everyone works inside their own role.</p>
              }
              columnMenu={false}
            >
              {data.eligibility.map((row) => (
                <tr key={row.eligibility_id}>
                  <td>{row.staff_name}</td>
                  <td>{row.role_label}</td>
                  <td>
                    {row.max_hours} {row.max_hours === 1 ? "hour" : "hours"}
                  </td>
                  <td>{row.eligible_until ? formatDate(row.eligible_until) : "Until revoked"}</td>
                  <td>{row.reason}</td>
                  <td>{row.granted_by_name}</td>
                  {owner && (
                    <td>
                      <RowAction
                        action={revokeEligibilityAction}
                        fields={{ staff_id: row.staff_id, eligibility_id: row.eligibility_id }}
                        buttons={[
                          {
                            label: "Revoke",
                            pendingLabel: "Revoking…",
                            className: "btn btn--small btn--ghost",
                            ariaLabel: `Revoke ${row.staff_name}'s ${row.role_label} eligibility`,
                          },
                        ]}
                      />
                    </td>
                  )}
                </tr>
              ))}
            </DataTable>
            <h3 className="privileged-subhead">Who has elevated, last 30 days</h3>
            <DataTable
              caption="Elevations, last 30 days"
              columns={[
                { key: "who", label: "Who" },
                { key: "role", label: "As" },
                { key: "when", label: "When" },
                { key: "why", label: "Why" },
                { key: "state", label: "State" },
                ...(owner ? [{ key: "act", label: "Action" }] : []),
              ]}
              isEmpty={data.elevations.length === 0}
              empty={<p className="muted">No one has elevated in the last 30 days.</p>}
              columnMenu={false}
            >
              {data.elevations.map((row) => (
                <tr key={row.elevation_id}>
                  <td>{row.staff_name}</td>
                  <td>{row.role_label}</td>
                  <td>
                    {formatAbsolute(row.starts_at ?? "")} –{" "}
                    {formatAbsolute(row.ended_at ?? row.ends_at ?? "")}
                  </td>
                  <td>{row.reason}</td>
                  <td>
                    <StatusPill
                      value={row.state}
                      label={
                        row.state === "live"
                          ? "Live"
                          : row.state === "ended"
                            ? `Ended${row.ended_by_name ? ` by ${row.ended_by_name}` : ""}`
                            : "Ran out"
                      }
                      tone={row.state === "live" ? "attention" : "neutral"}
                    />
                  </td>
                  {owner && (
                    <td>
                      {row.state === "live" && (
                        <RowAction
                          action={endElevationAction}
                          fields={{ elevation_id: row.elevation_id }}
                          buttons={[
                            {
                              label: "End now",
                              pendingLabel: "Ending…",
                              className: "btn btn--small btn--ghost",
                              ariaLabel: `End ${row.staff_name}'s elevation`,
                            },
                          ]}
                        />
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </DataTable>
            {owner && (
              <details className="disclosure">
                <summary>Make someone eligible</summary>
                <GrantEligibilityForm
                  action={grantEligibilityAction}
                  people={data.grantable}
                  roleLabels={data.role_labels}
                  maxHours={data.max_hours}
                  disabled={!canAct}
                />
              </details>
            )}
          </Section>

          <Section
            id="exports"
            title="Exports"
            description={`Every file that left HQ in the last 30 days. Each person may export ${data.quota.rows.toLocaleString("en-GB")} records in any ${data.quota.window_hours} hours; an owner can lift that for a day.`}
          >
            {!data.marker_domain_set && (
              <Callout tone="neutral" compact>
                Exported files carry no marker yet: a marker domain has not been set up. With one,
                each file with addresses gets one address of its own, and if that address ever comes
                back — the website form, the status page, a list import — the file is named.
              </Callout>
            )}
            {tripped.length > 0 && (
              <Callout tone="danger" role="alert" title="Seen outside HQ">
                {tripped.length === 1
                  ? "A file's marker came back. Its row below says through what; the owners were mailed."
                  : `${tripped.length} files' markers came back. Their rows below say through what; the owners were mailed.`}
              </Callout>
            )}
            <DataTable
              caption="Exported files"
              columns={[
                { key: "when", label: "When" },
                { key: "who", label: "Who" },
                { key: "what", label: "What" },
                { key: "rows", label: "Records", align: "end" },
                { key: "why", label: "Why" },
                { key: "marker", label: "Marker" },
              ]}
              isEmpty={data.exports.length === 0}
              empty={<p className="muted">Nothing exported in the last 30 days.</p>}
            >
              {data.exports.map((row) => (
                <tr key={row.export_id}>
                  <td>{formatAbsolute(row.created_at ?? "")}</td>
                  <td>{row.staff_name}</td>
                  <td>{row.kind_label}</td>
                  <td className="num">{row.rows.toLocaleString("en-GB")}</td>
                  <td>{row.reason}</td>
                  <td>
                    {row.tripped_at ? (
                      <StatusPill
                        value="tripped"
                        label={`Seen via ${row.tripped_via}, ${formatDate(row.tripped_at)}`}
                        tone="danger"
                      />
                    ) : row.marked ? (
                      "Carried, not seen"
                    ) : (
                      "None"
                    )}
                  </td>
                </tr>
              ))}
            </DataTable>
            {data.quota.lifts.length > 0 && (
              <>
                <h3 className="privileged-subhead">Limits lifted for today</h3>
                <DataTable
                  caption="Limits lifted today"
                  columns={[
                    { key: "who", label: "Who" },
                    { key: "more", label: "More records", align: "end" },
                    { key: "until", label: "Until" },
                    { key: "why", label: "Why" },
                    { key: "by", label: "By" },
                  ]}
                  isEmpty={false}
                  empty={null}
                  columnMenu={false}
                >
                  {data.quota.lifts.map((row) => (
                    <tr key={`${row.staff_id}-${row.until}`}>
                      <td>{row.staff_name}</td>
                      <td className="num">{row.extra_rows.toLocaleString("en-GB")}</td>
                      <td>{formatAbsolute(row.until ?? "")}</td>
                      <td>{row.reason}</td>
                      <td>{row.granted_by_name}</td>
                    </tr>
                  ))}
                </DataTable>
              </>
            )}
            {owner && (
              <details className="disclosure">
                <summary>Lift a limit</summary>
                <LiftQuotaForm
                  action={liftExportQuotaAction}
                  people={[
                    ...data.grantable.map((row) => ({
                      staff_id: row.staff_id,
                      display_name: row.display_name,
                    })),
                    ...data.owners.map((row) => ({
                      staff_id: row.staff_id,
                      display_name: row.display_name,
                    })),
                  ]}
                  disabled={!canAct}
                />
              </details>
            )}
          </Section>
        </div>
      )}
    </>
  );
}
