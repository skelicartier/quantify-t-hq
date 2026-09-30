import { confirmSudoAction } from "@/app/(portal)/admin/actions";
import {
  changePasswordAction,
  forgetDeviceAction,
  regenerateRecoveryCodesAction,
  revokeSessionAction,
} from "@/app/(portal)/me/security/actions";
import { SudoGate } from "@/components/admin/sudo-gate";
import { PageHeader } from "@/components/shell/page-header";
import { PasswordForm } from "@/components/me/password-form";
import { RecoveryCodesForm } from "@/components/me/recovery-codes-form";
import { Card, Section } from "@/components/ui/card";
import { Callout } from "@/components/ui/callout";
import { DataTable } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { RowAction } from "@/components/ui/row-action";
import { StatusPill } from "@/components/ui/status-pill";
import { Timestamp } from "@/components/ui/timestamp";
import { acknowledgePolicyAction } from "@/app/(portal)/team/actions";
import {
  deletePasskeyAction,
  passkeyRegisterOptionsAction,
  registerPasskeyAction,
} from "@/app/(portal)/me/security/actions";
import { listPasskeys, listSessions, type Passkey } from "@/lib/api/auth";
import { AddPasskeyForm } from "@/components/me/passkeys-form";
import { readPolicies, type PolicyState } from "@/lib/api/team";
import { formatDate } from "@/lib/format";
import { HqApiRequestError, HqApiUnavailableError } from "@/lib/api/core";
import { requireStaff } from "@/lib/access/core";
import { formatAbsolute } from "@/lib/format";
import { readMyDevices, type MyDevices } from "@/lib/api/security";
import { currentDeviceHash } from "@/lib/auth/session";
import { SeverityPill } from "@/components/admin/security-pills";
import { endElevationAction } from "@/app/(portal)/admin/privileged/actions";
import { activateElevationAction } from "@/app/(portal)/me/security/actions";
import { TakeElevationForm } from "@/components/security/privileged-forms";
import { readMyElevation, type MyElevation } from "@/lib/api/privileged";

export const metadata = { title: "My security" };
export const dynamic = "force-dynamic";

const DEVICE_COLUMNS = [
  { key: "device", label: "Device" },
  { key: "first", label: "First signed in" },
  { key: "last", label: "Last signed in" },
  { key: "address", label: "Last address" },
  { key: "state", label: "State" },
  { key: "actions", label: "Actions", align: "end" as const },
];

const EVENT_COLUMNS = [
  { key: "when", label: "When" },
  { key: "what", label: "What" },
  { key: "detail", label: "Detail" },
  { key: "severity", label: "Level" },
];

const SESSION_COLUMNS = [
  { key: "started", label: "Started" },
  { key: "seen", label: "Last seen" },
  { key: "address", label: "Address" },
  { key: "client", label: "Browser" },
  { key: "state", label: "State" },
  { key: "actions", label: "Actions", align: "end" as const },
];

export default async function SecurityPage() {
  const context = await requireStaff("/me/security");
  const { token } = context;
  let sessions: Awaited<ReturnType<typeof listSessions>>["sessions"] | null = null;
  try {
    sessions = (await listSessions(token)).sessions;
  } catch (error) {
    if (!(error instanceof HqApiUnavailableError || error instanceof HqApiRequestError))
      throw error;
  }
  const untilLabel = context.me.sudo_until
    ? (formatAbsolute(context.me.sudo_until).split(", ")[1] ?? null)
    : null;
  const live = (sessions ?? []).filter((session) => session.live);
  let passkeys: Passkey[] | null = null;
  try {
    passkeys = (await listPasskeys(context.token)).passkeys;
  } catch (error) {
    if (!(error instanceof HqApiUnavailableError || error instanceof HqApiRequestError))
      throw error;
  }
  let devices: MyDevices | null = null;
  try {
    devices = await readMyDevices(context.token);
  } catch (error) {
    if (!(error instanceof HqApiUnavailableError || error instanceof HqApiRequestError))
      throw error;
  }
  const thisBrowser = await currentDeviceHash();
  let policies: PolicyState[] | null = null;
  try {
    policies = (await readPolicies(context.token)).policies;
  } catch (error) {
    if (!(error instanceof HqApiUnavailableError || error instanceof HqApiRequestError))
      throw error;
  }

  let elevation: MyElevation | null = null;
  try {
    elevation = await readMyElevation(context.token);
  } catch (error) {
    if (!(error instanceof HqApiUnavailableError || error instanceof HqApiRequestError))
      throw error;
  }

  return (
    <>
      <PageHeader
        eyebrow="My account"
        title="My security"
        description={`Your sessions and your password. A session ends after ${context.me.session_policy?.idle_minutes ?? 30} minutes without activity, and after ${context.me.session_policy?.absolute_hours ?? 12} hours regardless.`}
      />
      {elevation !== null &&
        (elevation.active || elevation.eligible.length > 0 || elevation.history.length > 0) && (
          <Section
            id="elevation"
            title="Elevation"
            description={`You work as ${elevation.standing_role_label}. Where an owner has made you eligible, you can take a bigger role for a few hours when the work needs it: the owners are told, and everything you do meanwhile is marked with it.`}
          >
            <Card>
              {elevation.active ? (
                <div className="elevation-live">
                  <p>
                    <strong>
                      Acting as {elevation.active.role_label} until{" "}
                      {formatAbsolute(elevation.active.ends_at ?? "")}
                    </strong>
                    <span className="field__hint"> · “{elevation.active.reason}”</span>
                  </p>
                  <RowAction
                    action={endElevationAction}
                    fields={{
                      elevation_id: elevation.active.elevation_id,
                      return_path: "/me/security",
                    }}
                    buttons={[
                      { label: "End it now", pendingLabel: "Ending…", className: "btn btn--small" },
                    ]}
                  />
                </div>
              ) : elevation.eligible.length === 0 ? (
                <p className="muted">You are not eligible for any other role.</p>
              ) : (
                <>
                  <SudoGate
                    action={confirmSudoAction}
                    fresh={context.me.sudo_fresh}
                    untilLabel={untilLabel}
                    returnPath="/me/security"
                    purpose="Taking a role needs a fresh code from your authenticator app."
                  />
                  <ul className="ask-list">
                    {elevation.eligible.map((item) => (
                      <li key={item.eligibility_id} className="ask-list__item">
                        <div className="ask-list__head">
                          <strong>{item.role_label}</strong>
                          <span className="quiet">
                            · up to {item.max_hours} {item.max_hours === 1 ? "hour" : "hours"} at a
                            time
                            {item.eligible_until
                              ? ` · until ${formatDate(item.eligible_until)}`
                              : ""}
                          </span>
                        </div>
                        <p className="field__hint">
                          Granted by {item.granted_by_name}: “{item.reason}”
                        </p>
                        <TakeElevationForm
                          action={activateElevationAction}
                          eligibilityId={item.eligibility_id}
                          roleLabel={item.role_label}
                          maxHours={item.max_hours}
                          disabled={!context.me.sudo_fresh}
                        />
                      </li>
                    ))}
                  </ul>
                </>
              )}
              {elevation.history.length > 0 && (
                <DataTable
                  caption="Your elevations, last 90 days"
                  columns={[
                    { key: "as", label: "As" },
                    { key: "when", label: "When" },
                    { key: "why", label: "Why" },
                    { key: "state", label: "State" },
                  ]}
                  isEmpty={false}
                  empty={null}
                  columnMenu={false}
                >
                  {elevation.history.map((row) => (
                    <tr key={row.elevation_id}>
                      <td>{row.role_label}</td>
                      <td>
                        {formatAbsolute(row.starts_at ?? "")} –{" "}
                        {formatAbsolute(row.ended_at ?? row.ends_at ?? "")}
                      </td>
                      <td>{row.reason}</td>
                      <td>
                        {row.state === "live"
                          ? "Live"
                          : row.state === "ended"
                            ? "Ended"
                            : "Ran out"}
                      </td>
                    </tr>
                  ))}
                </DataTable>
              )}
            </Card>
          </Section>
        )}
      <Section id="sessions" title="Where you are signed in">
        {sessions === null ? (
          <Callout tone="danger" role="alert">
            Sessions could not be read just now. This is a read failure, not an empty list — try
            again shortly.
          </Callout>
        ) : (
          <DataTable
            caption="Live sessions for your staff account"
            columns={SESSION_COLUMNS}
            isEmpty={live.length === 0}
            empty={<EmptyState title="No live sessions" compact />}
          >
            {live.map((session) => (
              <tr key={session.session_id}>
                <td>
                  <Timestamp value={session.created_at} mode="both" />
                </td>
                <td>
                  <Timestamp value={session.last_seen_at} mode="relative" />
                </td>
                <td className="mono">{session.ip || "—"}</td>
                <td title={session.user_agent || undefined}>
                  {session.user_agent
                    ? `${session.device.charAt(0).toUpperCase()}${session.device.slice(1)}`
                    : "—"}
                </td>
                <td>
                  {session.current ? (
                    <StatusPill value="active" label="This session" tone="live" />
                  ) : (
                    <StatusPill value="active" label="Signed in" tone="neutral" />
                  )}
                </td>
                <td className="data-table__num">
                  {!session.current && (
                    <RowAction
                      action={revokeSessionAction}
                      fields={{ session_id: session.session_id }}
                      buttons={[
                        {
                          label: "Sign out",
                          pendingLabel: "Signing out…",
                          className: "btn btn--small btn--ghost",
                        },
                      ]}
                    />
                  )}
                </td>
              </tr>
            ))}
          </DataTable>
        )}
      </Section>
      <Section id="devices" title="Devices">
        <p className="page-note">
          Each browser you finish a sign-in on. A sign-in from one not listed here is mailed to you
          with a “this wasn&apos;t me” link that locks the account at once.
        </p>
        {devices === null ? (
          <Callout tone="danger" role="alert">
            Devices could not be read just now. This is a read failure, not an empty list.
          </Callout>
        ) : (
          <DataTable
            caption="Browsers your account has signed in on"
            columns={DEVICE_COLUMNS}
            isEmpty={devices.devices.length === 0}
            empty={
              <EmptyState
                compact
                title="None recorded yet"
                description="Your next sign-in records this browser."
              />
            }
          >
            {devices.devices.map((device) => (
              <tr key={device.device_id}>
                <td>{device.label || "Unknown browser"}</td>
                <td>
                  <Timestamp value={device.first_seen_at} mode="both" />
                </td>
                <td>
                  <Timestamp value={device.last_seen_at} mode="relative" />
                </td>
                <td className="mono">{device.last_ip || "—"}</td>
                <td>
                  {device.device_hash === thisBrowser ? (
                    <StatusPill value="active" label="This browser" tone="live" />
                  ) : (
                    <StatusPill value="known" label="Known" tone="neutral" />
                  )}
                </td>
                <td className="data-table__num">
                  <RowAction
                    action={forgetDeviceAction}
                    fields={{ device_id: device.device_id }}
                    buttons={[
                      {
                        label: "Forget",
                        pendingLabel: "Forgetting…",
                        className: "btn btn--small btn--ghost",
                        ariaLabel: `Forget ${device.label || "this device"}`,
                      },
                    ]}
                  />
                </td>
              </tr>
            ))}
          </DataTable>
        )}
      </Section>
      {devices !== null && devices.events.length > 0 && (
        <Section id="account-events" title="What happened to your sign-in">
          <DataTable caption="Recent security events on your account" columns={EVENT_COLUMNS}>
            {devices.events.map((event) => (
              <tr key={event.event_id}>
                <td>
                  <Timestamp value={event.occurred_at} mode="both" />
                </td>
                <td>{event.label}</td>
                <td>{event.summary}</td>
                <td>
                  <SeverityPill severity={event.severity} />
                </td>
              </tr>
            ))}
          </DataTable>
        </Section>
      )}
      <Section id="password" title="Password">
        <Card>
          <PasswordForm action={changePasswordAction} />
        </Card>
      </Section>
      <Section
        id="passkeys"
        title="Passkeys"
        description="A passkey on this device or your phone can stand in for the authenticator code at sign-in. The code and your recovery codes keep working."
      >
        <Card>
          {passkeys === null ? (
            <Callout tone="danger" compact>
              Passkeys could not be read just now. This is a read failure, not an empty list.
            </Callout>
          ) : passkeys.length === 0 ? (
            <p className="muted">No passkey yet.</p>
          ) : (
            <ul className="policy-list">
              {passkeys.map((passkey) => (
                <li key={passkey.passkey_id} className="policy">
                  <div className="policy__main">
                    <span className="policy__title">{passkey.label || "Passkey"}</span>
                    <span className="policy__meta">
                      Added <Timestamp value={passkey.created_at} mode="date" />
                      {passkey.last_used_at ? (
                        <>
                          {" · last used "}
                          <Timestamp value={passkey.last_used_at} mode="relative" />
                        </>
                      ) : (
                        " · not used yet"
                      )}
                    </span>
                  </div>
                  <RowAction
                    action={deletePasskeyAction}
                    fields={{ passkey_id: passkey.passkey_id }}
                    buttons={[
                      {
                        label: "Remove",
                        className: "btn btn--small btn--ghost",
                        pendingLabel: "Removing…",
                      },
                    ]}
                  />
                </li>
              ))}
            </ul>
          )}
          <SudoGate
            action={confirmSudoAction}
            fresh={context.me.sudo_fresh}
            untilLabel={untilLabel}
            returnPath="/me/security"
            purpose="Adding or removing a passkey needs a fresh code from your authenticator app."
          />
          <AddPasskeyForm
            fetchOptions={passkeyRegisterOptionsAction}
            save={registerPasskeyAction}
            disabled={!context.me.sudo_fresh}
          />
        </Card>
      </Section>
      <Section id="recovery" title="Recovery codes">
        <Card>
          <p className="muted">
            {context.me.recovery_codes_remaining === undefined
              ? "Recovery codes sign you in when your authenticator is out of reach."
              : `${context.me.recovery_codes_remaining} unused ${context.me.recovery_codes_remaining === 1 ? "code" : "codes"} left. Each signs you in once when your authenticator is out of reach.`}
          </p>
          <SudoGate
            action={confirmSudoAction}
            fresh={context.me.sudo_fresh}
            untilLabel={untilLabel}
            returnPath="/me/security"
            purpose="New recovery codes need a fresh code from your authenticator app."
          />
          <RecoveryCodesForm
            action={regenerateRecoveryCodesAction}
            disabled={!context.me.sudo_fresh}
          />
        </Card>
      </Section>
      <Section
        id="policies"
        title="Company policies"
        description="Each carries a version. When one is re-published, it asks to be acknowledged again."
      >
        <Card>
          {policies === null ? (
            <Callout tone="danger" compact>
              Policies could not be read just now. This is a read failure, not an empty list.
            </Callout>
          ) : policies.length === 0 ? (
            <p className="muted">No policies have been published.</p>
          ) : (
            <ul className="policy-list">
              {policies.map((policy) => (
                <li key={policy.key} className="policy">
                  <div className="policy__main">
                    <span className="policy__title">
                      {policy.url ? (
                        <a href={policy.url} rel="noreferrer noopener" target="_blank">
                          {policy.title}
                        </a>
                      ) : (
                        policy.title
                      )}{" "}
                      <span className="side-quiet">v{policy.version}</span>
                    </span>
                    <span className="policy__meta">
                      {policy.outstanding
                        ? policy.acknowledged_version
                          ? `You acknowledged version ${policy.acknowledged_version}; version ${policy.version} is new.`
                          : "Not yet acknowledged."
                        : `Acknowledged ${formatDate(policy.acknowledged_at)}.`}
                    </span>
                  </div>
                  {policy.outstanding ? (
                    <RowAction
                      action={acknowledgePolicyAction}
                      fields={{ policy_key: policy.key }}
                      buttons={[
                        {
                          label: "I have read it",
                          className: "btn btn--small btn--primary",
                          pendingLabel: "Recording…",
                        },
                      ]}
                      sentLabel="Acknowledged."
                    />
                  ) : (
                    <StatusPill value="acknowledged" label="Acknowledged" tone="live" />
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </Section>
    </>
  );
}
