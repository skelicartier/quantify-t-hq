import {
  restoreAdminSecret,
  revokeAdminSecret,
  setAdminSecret,
} from "@/app/(portal)/product/secrets/actions";
import { AdminGate } from "@/components/product/admin-gate";
import { AdminSecretControls } from "@/components/product/admin-secret-controls";
import { PageHeader } from "@/components/shell/page-header";
import { ButtonLink } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Card, Section } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { KeyValue, KeyValueRow } from "@/components/ui/key-value";
import { ShortId } from "@/components/ui/short-id";
import { StatusPill, type PillTone } from "@/components/ui/status-pill";
import { Timestamp } from "@/components/ui/timestamp";
import type { AdminSecretsAccess } from "@/lib/product/access";
import type {
  AccountApiAdminSecretEntry,
  AccountApiAdminSecretSlot,
} from "@/lib/product/account-api";
import { formatNumber, pluralize } from "@/lib/format";

type AdminSecretsProps = {
  access: AdminSecretsAccess;
  now?: number | undefined;
};

/**
 * How a check result reads to a person, and how loudly.
 *
 * Every state has an entry, including the two that mean "we have not looked". A provider
 * check that could not be classified says so rather than being folded into "inconclusive":
 * an unmapped response is a different situation from a timeout, and the difference is
 * exactly what tells an operator whether to look at the provider or at us.
 */
const CHECK_COPY: Record<
  AccountApiAdminSecretEntry["verification"]["state"],
  { label: string; tone: PillTone }
> = {
  valid: { label: "Accepted by the provider", tone: "live" },
  rejected: { label: "Rejected by the provider", tone: "danger" },
  "scoped-wrong": { label: "Accepted, wrong permissions", tone: "danger" },
  "no-quota": { label: "Accepted, no quota left", tone: "danger" },
  inconclusive: { label: "Check did not complete", tone: "attention" },
  unclassified: { label: "Unrecognised answer", tone: "attention" },
  checking: { label: "Checking now", tone: "attention" },
  unverified: { label: "Never checked", tone: "neutral" },
  unsupported: { label: "No free check exists", tone: "neutral" },
};

/** The states that mean a stored key is not working, which is what sorts a slot to the top. */
const FAILING_STATES: ReadonlySet<AccountApiAdminSecretEntry["verification"]["state"]> = new Set([
  "rejected",
  "scoped-wrong",
  "no-quota",
  "unclassified",
]);

function isFailing(slot: AccountApiAdminSecretSlot): boolean {
  return slot.entries.some((entry) => FAILING_STATES.has(entry.verification.state));
}

/**
 * Failing first, then everything that holds a key, then everything that does not.
 *
 * The ordering is the whole of the page's opinion, and it exists because the alternative is
 * an alphabetical list where seventeen empty map tokens sit above the one market-data key
 * the provider turned off this morning.
 */
function ordered(slots: readonly AccountApiAdminSecretSlot[]): AccountApiAdminSecretSlot[] {
  const rank = (slot: AccountApiAdminSecretSlot): number => {
    if (isFailing(slot)) return 0;
    return slot.configured ? 1 : 2;
  };
  return [...slots].sort((left, right) => rank(left) - rank(right));
}

const NAMESPACE_LABEL: Record<AccountApiAdminSecretSlot["namespace"], string> = {
  api: "Market data and AI",
  geo: "Map and situation layers",
};

/**
 * Where the stored value ends up, said plainly and never left blank.
 *
 * When the service cannot observe the answer it reports the worst case, and the cell says
 * that is what it is doing. An operator reading "server only" about a value that is in fact
 * shipped to every install would paste a high-limit key onto every machine we run on.
 */
function Reach({ slot }: { slot: AccountApiAdminSecretSlot }) {
  const everyDevice = slot.distribution === "every-device";
  return (
    <>
      <StatusPill
        value={slot.distribution}
        tone={everyDevice ? "attention" : "live"}
        label={everyDevice ? "Every device — treat as public" : "Server only"}
      />
      {!slot.distribution_certain && (
        <span className="data-table__secondary">
          Worst case. Where this ends up cannot be observed from here yet.
        </span>
      )}
    </>
  );
}

function Check({ entry, now }: { entry: AccountApiAdminSecretEntry; now?: number | undefined }) {
  const copy = CHECK_COPY[entry.verification.state];
  return (
    <>
      <StatusPill value={entry.verification.state} tone={copy.tone} label={copy.label} />
      {/* A result without its age is a claim about now that may be weeks old. */}
      {entry.verification.checked_at ? (
        <span className="data-table__secondary">
          <Timestamp value={entry.verification.checked_at} now={now} mode="both" />
        </span>
      ) : (
        <span className="data-table__secondary">No check recorded</span>
      )}
    </>
  );
}

const KEY_COLUMNS = [
  { key: "position", label: "Key" },
  { key: "fingerprint", label: "Fingerprint" },
  { key: "prefix", label: "Provider marker" },
  { key: "length", label: "Characters", align: "end" as const },
  { key: "check", label: "Last check" },
  { key: "setBy", label: "Set by" },
  { key: "setAt", label: "Set" },
];

function SlotKeys({ slot, now }: { slot: AccountApiAdminSecretSlot; now?: number | undefined }) {
  return (
    <DataTable
      columns={KEY_COLUMNS}
      caption={`${slot.label} — stored keys`}
      minWidth={860}
      isEmpty={slot.entries.length === 0}
      empty={
        <EmptyState
          title="Nothing stored"
          description="Whatever this powers is running without it, or falling back to another source."
          compact
        />
      }
    >
      {slot.entries.map((entry) => (
        <tr key={entry.fingerprint}>
          <td>
            <span className="data-table__primary">
              {slot.kind === "multi" ? `Key ${formatNumber(entry.position + 1)}` : slot.label}
            </span>
          </td>
          <td>
            {/* A registration value is public by design; naming it by a digest would imply
                a secrecy it does not have and hide the thing the operator can check. */}
            {slot.is_secret ? (
              <ShortId value={entry.fingerprint} full />
            ) : (
              <span className="quiet">Not a secret — no fingerprint</span>
            )}
          </td>
          <td>{entry.prefix ? <ShortId value={entry.prefix} full /> : <span>—</span>}</td>
          <td className="data-table__num">{formatNumber(entry.length)}</td>
          <td>
            <Check entry={entry} now={now} />
          </td>
          <td>{entry.set_by ? <ShortId value={entry.set_by} full /> : <span>—</span>}</td>
          <td>
            <Timestamp value={entry.set_at} now={now} mode="both" />
          </td>
        </tr>
      ))}
    </DataTable>
  );
}

function SlotCard({
  slot,
  now,
  canWrite,
  unreadable,
}: {
  slot: AccountApiAdminSecretSlot;
  now?: number | undefined;
  canWrite: boolean;
  unreadable: boolean;
}) {
  const disabledReason = unreadable
    ? "Changes are turned off while what is stored cannot be read."
    : null;
  return (
    <Card
      eyebrow={NAMESPACE_LABEL[slot.namespace]}
      title={slot.label}
      titleId={`credential-${slot.slot}`}
      danger={isFailing(slot)}
    >
      <div className="credential-split">
        {/* Left: what this is and what is stored. Right: how to change it. */}
        <div className="stack">
          <KeyValue columns={2}>
            <KeyValueRow label="Reaches">
              <Reach slot={slot} />
            </KeyValueRow>
            <KeyValueRow label="Powers">{slot.blast_radius}</KeyValueRow>
            <KeyValueRow label="Kind">
              {slot.is_secret
                ? slot.kind === "multi"
                  ? "Secret. Holds several keys the app rotates across."
                  : "Secret. Stored once, never shown again."
                : "Registration value, public by design. Safe to share."}
            </KeyValueRow>
            <KeyValueRow label="Stored">
              {unreadable ? "Not readable" : pluralize(slot.entries.length, "key")}
            </KeyValueRow>
          </KeyValue>
          {slot.hint && <p className="card__desc">{slot.hint}</p>}
          {unreadable ? (
            <EmptyState
              title="Not readable right now"
              description="This is not a claim that the credential is missing. Nothing has been changed."
              compact
            />
          ) : (
            <SlotKeys slot={slot} now={now} />
          )}
        </div>

        <div className="credential-split__change">
          {canWrite ? (
            <AdminSecretControls
              slot={slot.slot}
              label={slot.label}
              kind={slot.kind}
              isSecret={slot.is_secret}
              keyCount={slot.entries.length}
              currentFingerprint={slot.entries[0]?.fingerprint ?? null}
              disabledReason={disabledReason}
              setAction={setAdminSecret}
              revokeAction={revokeAdminSecret}
              restoreAction={restoreAdminSecret}
            />
          ) : (
            <p className="quiet">
              Changing this needs owner access. Ask an owner to rotate it, or ask for the
              permission.
            </p>
          )}
        </div>
      </div>
    </Card>
  );
}

export function AdminSecrets({ access, now }: AdminSecretsProps) {
  const secrets = access.status === "authorized" ? access.secrets : null;
  const unreadable = secrets?.store.state === "unreadable";
  const absent = secrets?.store.state === "absent";
  const slots = secrets ? ordered(secrets.slots) : [];
  const configured = slots.filter((slot) => slot.configured || isFailing(slot));
  const unset = slots.filter((slot) => !slot.configured && !isFailing(slot));
  const canWrite = access.status === "authorized" && access.canWrite;

  return (
    <>
      <PageHeader
        eyebrow="Product"
        title="Provider keys"
        titleId="admin-secrets-heading"
        description="The credentials the product spends. Set them here; they are never shown again."
        meta={
          secrets ? (
            <>
              <Timestamp value={secrets.generated_at} now={now} prefix="Read" />
              {" · Devices pick up a change within about thirty seconds"}
            </>
          ) : undefined
        }
      />
      <div className="page-content">
        {/* Outside the gate on purpose: an unreadable inventory is not an authorization
            answer, and the gate has no arm that would render it. */}
        {access.status === "unavailable" ? (
          <Callout tone="danger" title="The credential list could not be read" role="alert">
            Nothing has been changed. This is a read failure, not an empty list — do not read it as
            though the credentials had been removed. Reload in a moment, and check the platform
            status page if it continues.
            <p>
              <ButtonLink href="/product/credentials">Open platform credentials</ButtonLink>
            </p>
          </Callout>
        ) : (
          <AdminGate access={access} section="Provider keys">
            {secrets && (
              <div className="stack-board">
                {absent && (
                  <Callout
                    tone="attention"
                    title="There is no credential document in the store this service reads"
                    role="status"
                  >
                    Not an empty one — none at all. On a new deployment that is expected, and
                    setting a credential below creates it. If credentials were set from the desktop
                    admin panel and are working in the product, this service is reading a different
                    storage account than the one they were written to: check the account
                    service&rsquo;s storage connection setting before replacing anything, because a
                    credential set here would go to the same place this read came from.
                  </Callout>
                )}

                {unreadable && (
                  <Callout
                    tone="danger"
                    title="What is stored cannot be read right now"
                    role="alert"
                  >
                    {secrets.store.dependency
                      ? `The store behind these credentials (${secrets.store.dependency}) did not answer. `
                      : "The store behind these credentials did not answer. "}
                    Every credential below is listed from the catalogue, not from what is stored,
                    and changes are turned off until it can be read again.
                  </Callout>
                )}

                <Section
                  id="admin-secrets-managed"
                  eyebrow="Managed here"
                  title="Credentials in use"
                  description="Ordered by what needs attention: failing checks first, then everything holding a key."
                >
                  {configured.length === 0 ? (
                    <EmptyState
                      title="Nothing is configured yet"
                      description="Set a credential below to start. Each one names what it powers."
                    />
                  ) : (
                    <div className="stack">
                      {configured.map((slot) => (
                        <SlotCard
                          key={slot.slot}
                          slot={slot}
                          now={now}
                          canWrite={canWrite}
                          unreadable={Boolean(unreadable)}
                        />
                      ))}
                    </div>
                  )}
                </Section>

                {unset.length > 0 && (
                  <Section
                    id="admin-secrets-unset"
                    eyebrow="Not set"
                    title={`${pluralize(unset.length, "credential")} not configured`}
                    description="Collapsed so an empty list never hides a key that is failing. Open it to set one."
                  >
                    <details className="disclosure">
                      <summary>Show the {pluralize(unset.length, "credential")} not set</summary>
                      <div className="stack">
                        {unset.map((slot) => (
                          <SlotCard
                            key={slot.slot}
                            slot={slot}
                            now={now}
                            canWrite={canWrite}
                            unreadable={Boolean(unreadable)}
                          />
                        ))}
                      </div>
                    </details>
                  </Section>
                )}

                <Callout title="What this page does not cover">
                  The release signing key, the account service&rsquo;s own settings, and the handful
                  of integrations wired directly into a deployment are not managed here.{" "}
                  <ButtonLink href="/product/credentials" variant="ghost">
                    See platform credentials
                  </ButtonLink>
                  <p>
                    A value stored here is readable by anyone who can read the store that holds it,
                    and a credential that reaches every device is not really a secret at all. Treat
                    both as true when deciding what to put in a slot.
                  </p>
                </Callout>
              </div>
            )}
          </AdminGate>
        )}
      </div>
    </>
  );
}
