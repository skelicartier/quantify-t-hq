import { AdminGate } from "@/components/product/admin-gate";
import { AdminReleaseManager } from "@/components/product/admin-release-manager";
import { PageHeader } from "@/components/shell/page-header";
import { ButtonLink } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Card, Section } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { KeyValue, KeyValueRow } from "@/components/ui/key-value";
import { Stat, StatGrid } from "@/components/ui/stat";
import { StatusPill, YesNoPill } from "@/components/ui/status-pill";
import { Timestamp } from "@/components/ui/timestamp";
import type {
  AdminConfigurationAccess,
  AdminCredentialStatusAccess,
  AdminReleaseStatusAccess,
  ReleaseCatalogueFailure,
} from "@/lib/product/access";
import { formatBytes, formatDurationSeconds, formatLabel, formatNumber } from "@/lib/format";
import type { ReleaseActionState } from "@/lib/product/releases/release-input";

type StatusProps<T> = { access: T; now?: number | undefined };

type ReleaseAction = (state: ReleaseActionState, formData: FormData) => Promise<ReleaseActionState>;

function FeatureRow({
  label,
  enabled,
  description,
}: {
  label: string;
  enabled: boolean;
  description?: string;
}) {
  return (
    <li className="list-row">
      <span className="list-row__main">
        <span className="list-row__title">{label}</span>
        {description && <span className="list-row__desc">{description}</span>}
      </span>
      <StatusPill value={enabled ? "enabled" : "disabled"} />
    </li>
  );
}

export function AdminConfiguration({ access, now }: StatusProps<AdminConfigurationAccess>) {
  const configuration = access.status === "authorized" ? access.configuration : null;
  return (
    <>
      <PageHeader
        eyebrow="Product"
        title="Configuration"
        titleId="admin-platform-heading"
        description="How the account service is set up. Everything here is read-only."
        meta={
          configuration ? (
            <Timestamp value={configuration.generated_at} now={now} prefix="Updated" />
          ) : undefined
        }
      />
      <div className="page-content">
        <AdminGate access={access} section="Configuration">
          {configuration && (
            <div className="stack-board">
              <StatGrid columns={4} label="Environment">
                <Stat label="Environment" value={formatLabel(configuration.environment)} text />
                <Stat
                  label="Allowed origins"
                  value={formatNumber(configuration.cors.allowed_origin_count)}
                />
                <Stat
                  label="Wildcard origins"
                  value={
                    <YesNoPill
                      value={configuration.cors.wildcard_allowed}
                      yes="Allowed"
                      no="Blocked"
                    />
                  }
                  text
                />
                <Stat
                  label="Configured owners"
                  value={formatNumber(configuration.features.break_glass_owner_count)}
                  hint="Set by deployment configuration"
                />
              </StatGrid>

              <div className="card-grid card-grid--2">
                <Card
                  eyebrow="Background workers"
                  title="Scheduled jobs"
                  titleId="admin-workers-heading"
                >
                  <ul className="list-rows">
                    <FeatureRow
                      label="Email worker"
                      enabled={configuration.features.email_worker_enabled}
                      description="Delivers queued account emails."
                    />
                    <FeatureRow
                      label="Export worker"
                      enabled={configuration.features.artifact_worker_enabled}
                      description="Builds encrypted account exports and audit CSVs."
                    />
                    <FeatureRow
                      label="Deletion worker"
                      enabled={configuration.features.deletion_worker_enabled}
                      description="Completes cooled-off account deletions."
                    />
                    <FeatureRow
                      label="Signed downloads"
                      enabled={configuration.features.signed_downloads_enabled}
                      description="Short-lived private download links."
                    />
                  </ul>
                </Card>
                <Card
                  eyebrow="Storage and encryption"
                  title="Data protection"
                  titleId="admin-storage-heading"
                >
                  <ul className="list-rows">
                    <FeatureRow
                      label="Export encryption"
                      enabled={configuration.features.account_export_encryption_configured}
                    />
                    <FeatureRow
                      label="Private file storage"
                      enabled={configuration.features.private_artifact_storage_configured}
                    />
                    <FeatureRow
                      label="Legacy role registry"
                      enabled={configuration.features.legacy_role_source_configured}
                    />
                    <li className="list-row">
                      <span className="list-row__main">
                        <span className="list-row__title">Bootstrap admins</span>
                        <span className="list-row__desc">
                          Administrators seeded from configuration.
                        </span>
                      </span>
                      <span className="num">
                        {formatNumber(configuration.features.legacy_bootstrap_admin_count)}
                      </span>
                    </li>
                  </ul>
                </Card>
              </div>

              <Section id="admin-limits" title="Limits" eyebrow="Runtime">
                <KeyValue columns={2}>
                  <KeyValueRow label="Request size">
                    {formatBytes(configuration.limits.max_body_bytes)}
                  </KeyValueRow>
                  <KeyValueRow label="Upstream timeout">
                    {formatDurationSeconds(configuration.limits.upstream_timeout_seconds)}
                  </KeyValueRow>
                  <KeyValueRow label="Repeat-request window">
                    {formatDurationSeconds(configuration.limits.idempotency_ttl_seconds)}
                  </KeyValueRow>
                  <KeyValueRow label="Reservation lease">
                    {formatDurationSeconds(configuration.limits.reservation_lease_seconds)}
                  </KeyValueRow>
                  <KeyValueRow label="Email batch">
                    {formatNumber(configuration.limits.email_worker_batch_limit)}
                  </KeyValueRow>
                  <KeyValueRow label="Export batch">
                    {formatNumber(configuration.limits.artifact_worker_batch_limit)}
                  </KeyValueRow>
                  <KeyValueRow label="Deletion batch">
                    {formatNumber(configuration.limits.deletion_worker_batch_limit)}
                  </KeyValueRow>
                  <KeyValueRow label="Download link lifetime">
                    {formatDurationSeconds(configuration.limits.signed_download_ttl_seconds)}
                  </KeyValueRow>
                </KeyValue>
              </Section>
            </div>
          )}
        </AdminGate>
      </div>
    </>
  );
}

const CREDENTIAL_COLUMNS = [
  { key: "name", label: "Credential" },
  { key: "configured", label: "Configured" },
  { key: "type", label: "Type" },
  { key: "rotation", label: "Rotation" },
] as const;

export function AdminCredentials({ access, now }: StatusProps<AdminCredentialStatusAccess>) {
  const status = access.status === "authorized" ? access.credentialStatus : null;
  return (
    <>
      <PageHeader
        eyebrow="Product"
        title="Platform credentials"
        titleId="admin-platform-heading"
        description="The account service's own settings. Whether each one is present, and nothing more."
        meta={
          status ? <Timestamp value={status.generated_at} now={now} prefix="Updated" /> : undefined
        }
      />
      <div className="page-content">
        <AdminGate access={access} section="Platform credentials">
          {status && (
            <>
              {/* Scoped deliberately. These seven really are set where the service is
                  deployed; the provider keys the product spends are not, and used to be
                  covered by the same sentence. */}
              <Callout title="Status only">
                These are the account service&rsquo;s own settings. They are changed where the
                service is deployed, never from HQ, and their values never leave it. The provider
                keys the product spends are managed here instead.{" "}
                <ButtonLink href="/product/secrets" variant="ghost">
                  Open provider keys
                </ButtonLink>
              </Callout>
              <DataTable
                columns={CREDENTIAL_COLUMNS}
                caption="Platform credential status"
                minWidth={560}
              >
                {status.credentials.map((credential) => (
                  <tr key={credential.name}>
                    <td>
                      <span className="data-table__primary">{formatLabel(credential.name)}</span>
                    </td>
                    <td>
                      <YesNoPill value={credential.configured} yes="Configured" no="Missing" />
                    </td>
                    <td>{credential.secret ? "Secret" : "Setting"}</td>
                    <td>Rotated at source</td>
                  </tr>
                ))}
              </DataTable>
            </>
          )}
        </AdminGate>
      </div>
    </>
  );
}

function RequirementRow({ label, required }: { label: string; required: boolean }) {
  return (
    <li className="list-row">
      <span className="list-row__title">{label}</span>
      <StatusPill value={required ? "yes" : "no"} label={required ? "Required" : "Not required"} />
    </li>
  );
}

/** Why there is no catalogue to show, said in the operator's terms rather than the API's. */
const CATALOGUE_FAILURES: Record<ReleaseCatalogueFailure, { title: string; body: string }> = {
  unconfigured: {
    title: "The release service is not configured for HQ",
    body:
      "Set QT_UPDATE_DEPLOY_URL to the update function's origin. Until then this page can show " +
      "what a release must carry, but not what has been published or how to publish one.",
  },
  unreachable: {
    title: "The release service could not be reached",
    body:
      "Nothing has changed — this is a read that failed. What is already published is still " +
      "being served to every desktop; reload once the function is answering.",
  },
  forbidden: {
    title: "This account can read release status but not publish",
    body:
      "Publishing, rollback and disabling need the releases:publish capability, which only an " +
      "Owner holds. A release decides what executable every installed desktop downloads.",
  },
};

type ReleasesProps = StatusProps<AdminReleaseStatusAccess> & {
  publish: ReleaseAction;
  rollback: ReleaseAction;
  setDisabled: ReleaseAction;
};

export function AdminReleases({ access, now, publish, rollback, setDisabled }: ReleasesProps) {
  const authorized = access.status === "authorized" ? access : null;
  const status = authorized?.releaseStatus ?? null;
  const release = status?.release_management ?? null;
  const failure = authorized?.catalogueFailure ?? null;
  return (
    <>
      <PageHeader
        eyebrow="Product"
        title="Releases"
        titleId="admin-platform-heading"
        description="Publish, roll back and stop serving the desktop build. This is the only place any of that happens."
        meta={
          status ? <Timestamp value={status.generated_at} now={now} prefix="Updated" /> : undefined
        }
      />
      <div className="page-content">
        <AdminGate access={access} section="Releases">
          <div className="stack-board">
            {failure && (
              <Callout
                tone={failure === "forbidden" ? "attention" : "danger"}
                role={failure === "forbidden" ? "status" : "alert"}
                title={CATALOGUE_FAILURES[failure].title}
              >
                {CATALOGUE_FAILURES[failure].body}
              </Callout>
            )}
            {authorized?.catalogue && (
              <AdminReleaseManager
                catalogue={authorized.catalogue}
                publish={publish}
                rollback={rollback}
                setDisabled={setDisabled}
              />
            )}
            {release && (
              <div className="card-grid card-grid--2">
                <Card
                  eyebrow="Release management"
                  title="Policy"
                  titleId="admin-release-controls-heading"
                  description="What this product allows, wherever it is deployed. Whether HQ can reach the release service is answered above."
                >
                  <KeyValue>
                    <KeyValueRow label="Publishing happens">
                      <StatusPill
                        value={release.status}
                        label={release.status === "console" ? "From HQ" : "Locked at source"}
                      />
                    </KeyValueRow>
                    <KeyValueRow label="Configured">
                      <YesNoPill value={release.configured} yes="Configured" no="Not configured" />
                    </KeyValueRow>
                    <KeyValueRow label="Publishing">
                      <YesNoPill value={release.publish_enabled} yes="Enabled" no="Disabled" />
                    </KeyValueRow>
                    <KeyValueRow label="Rollback">
                      <YesNoPill value={release.rollback_enabled} yes="Enabled" no="Disabled" />
                    </KeyValueRow>
                  </KeyValue>
                </Card>
                <Card
                  eyebrow="Requirements"
                  title="Every release must have"
                  titleId="admin-release-requirements-heading"
                >
                  <ul className="list-rows">
                    <RequirementRow
                      label="HTTPS download URLs"
                      required={release.requires_https_url}
                    />
                    <RequirementRow label="Checksums" required={release.requires_checksum} />
                    <RequirementRow
                      label="Server signatures"
                      required={release.requires_server_signature}
                    />
                  </ul>
                </Card>
              </div>
            )}
          </div>
        </AdminGate>
      </div>
    </>
  );
}
