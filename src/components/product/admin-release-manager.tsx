"use client";

import { useActionState, useId, useState } from "react";

import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Card } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/field";
import { LocalTime } from "@/components/ui/local-time";
import { StatusPill } from "@/components/ui/status-pill";
import type { ReleaseCatalogue } from "@/lib/product/release-api";
import {
  INITIAL_RELEASE_ACTION_STATE,
  RELEASE_CHANNELS,
  RELEASE_PLATFORMS,
  RELEASE_SEVERITIES,
  RELEASE_SEVERITY_LABELS,
  type ReleaseActionState,
  type ReleaseHistoryEntry,
} from "@/lib/product/releases/release-input";

type ReleaseAction = (state: ReleaseActionState, formData: FormData) => Promise<ReleaseActionState>;

type ReleaseManagerProps = {
  catalogue: ReleaseCatalogue;
  publish: ReleaseAction;
  rollback: ReleaseAction;
  setDisabled: ReleaseAction;
};

function Result({ state }: { state: ReleaseActionState }) {
  if (!state.message) return null;
  return (
    <Callout
      tone={state.status === "error" ? "danger" : "success"}
      role={state.status === "error" ? "alert" : "status"}
      compact
    >
      {state.message}
    </Callout>
  );
}

/**
 * The publish form.
 *
 * Ordered the way a release is assembled rather than the way the manifest is serialised:
 * what this build is, what changed in it, where the installers are, and only then the two
 * policy switches that decide whether it installs itself. The confirmation box sits last
 * and repeats the version, because publishing the same number twice is the mistake that
 * does not announce itself.
 */
function PublishForm({
  catalogue,
  publish,
}: {
  catalogue: ReleaseCatalogue;
  publish: ReleaseAction;
}) {
  const [state, formAction, pending] = useActionState(publish, INITIAL_RELEASE_ACTION_STATE);
  const id = useId();
  const [forceUpdate, setForceUpdate] = useState(false);
  const [floor, setFloor] = useState("");
  const mandatory = forceUpdate || floor.trim().length > 0;

  return (
    <form className="form" action={formAction}>
      <fieldset className="fieldset">
        <legend className="fieldset__legend">This build</legend>
        <div className="form-grid">
          <Field id={`${id}-version`} label="Version" hint="Digits and dots, e.g. 1.4.0.">
            <Input
              id={`${id}-version`}
              name="version"
              required
              inputMode="decimal"
              autoComplete="off"
              placeholder="1.4.0"
            />
          </Field>
          <Field
            id={`${id}-name`}
            label="Product name"
            hint="Shown in the update prompt and the download page."
          >
            <Input
              id={`${id}-name`}
              name="name"
              required
              defaultValue="Quantify Terminal"
              autoComplete="off"
            />
          </Field>
          <Field id={`${id}-title`} label="Release title" hint="Optional; defaults to the name.">
            <Input id={`${id}-title`} name="title" autoComplete="off" placeholder="Faster charts" />
          </Field>
          <Field id={`${id}-channel`} label="Channel">
            <Select id={`${id}-channel`} name="channel" defaultValue="stable">
              {RELEASE_CHANNELS.map((channel) => (
                <option key={channel} value={channel}>
                  {channel === "stable" ? "Stable" : "Beta"}
                </option>
              ))}
            </Select>
          </Field>
          <Field
            id={`${id}-severity`}
            label="Severity"
            hint="Colours the prompt. It does not force anything on its own."
          >
            <Select id={`${id}-severity`} name="severity" defaultValue="recommended">
              {RELEASE_SEVERITIES.map((severity) => (
                <option key={severity} value={severity}>
                  {RELEASE_SEVERITY_LABELS[severity]}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </fieldset>

      <fieldset className="fieldset">
        <legend className="fieldset__legend">What changed</legend>
        <div className="form-grid">
          <Field
            id={`${id}-description`}
            label="Description"
            className="form-grid__span"
            hint="One or two sentences. Read by every user in the update prompt."
          >
            <Textarea id={`${id}-description`} name="description" required rows={3} />
          </Field>
          <Field
            id={`${id}-features`}
            label="Highlights"
            className="form-grid__span"
            hint="One per line, up to twenty. Rendered as a list."
          >
            <Textarea id={`${id}-features`} name="features" rows={5} />
          </Field>
        </div>
      </fieldset>

      <fieldset className="fieldset">
        <legend className="fieldset__legend">Downloads</legend>
        <div className="form-grid">
          <Field
            id={`${id}-download-page`}
            label="Download page"
            className="form-grid__span"
            hint="Where a user lands when there is no installer for their platform."
          >
            <Input
              id={`${id}-download-page`}
              name="download_page_url"
              type="url"
              required
              inputMode="url"
              placeholder="https://www.quantifyterminal.com/download"
            />
          </Field>
          {RELEASE_PLATFORMS.map((platform) => (
            <div key={platform.url} className="form-grid__span form-grid">
              <Field id={`${id}-${platform.url}`} label={platform.label}>
                <Input
                  id={`${id}-${platform.url}`}
                  name={platform.url}
                  type="url"
                  inputMode="url"
                  placeholder="https://…"
                />
              </Field>
              <Field
                id={`${id}-${platform.checksum}`}
                label={`${platform.label} SHA-256`}
                hint="Required with the URL above."
              >
                <Input
                  id={`${id}-${platform.checksum}`}
                  name={`checksum_${platform.checksum}`}
                  autoComplete="off"
                  spellCheck={false}
                  className="mono"
                  placeholder="64 hex characters"
                />
              </Field>
            </div>
          ))}
          <Field id={`${id}-notes`} label="Release notes URL" hint="Optional.">
            <Input id={`${id}-notes`} name="release_notes_url" type="url" inputMode="url" />
          </Field>
          <Field id={`${id}-banner`} label="Banner image URL" hint="Optional.">
            <Input id={`${id}-banner`} name="banner_image_url" type="url" inputMode="url" />
          </Field>
        </div>
      </fieldset>

      <fieldset className="fieldset">
        <legend className="fieldset__legend">Install policy</legend>
        <div className="form-grid">
          <div className="form-grid__span stack stack--tight">
            <Checkbox
              id={`${id}-force`}
              name="force_update"
              checked={forceUpdate}
              onChange={(event) => setForceUpdate(event.currentTarget.checked)}
              tone={forceUpdate ? "danger" : "default"}
              label="Require this update"
              description="Removes the “Later” button. Everyone installs it before they can carry on."
            />
            <Checkbox
              id={`${id}-disabled`}
              name="disabled"
              label="Stage only — do not serve yet"
              description="Records the release in the catalogue and leaves the live manifest alone."
            />
          </div>
          <Field
            id={`${id}-floor`}
            label="Minimum supported version"
            hint="Anyone below this is forced to update, even when the box above is clear. Leave empty for no floor."
          >
            <Input
              id={`${id}-floor`}
              name="min_supported_version"
              value={floor}
              onChange={(event) => setFloor(event.currentTarget.value)}
              autoComplete="off"
              inputMode="decimal"
              placeholder="1.0.0"
            />
          </Field>
        </div>
        {mandatory && (
          <Callout tone="attention" role="status" compact>
            This release installs itself. Every desktop below the floor — or every desktop, if
            “Require this update” is set — stops at an install prompt with no way past it.
          </Callout>
        )}
      </fieldset>

      <fieldset className="fieldset">
        <legend className="fieldset__legend">Publish</legend>
        <Field
          id={`${id}-confirm`}
          label="Type the version number to publish"
          hint={
            catalogue.currentVersion
              ? `${catalogue.currentVersion} is live now. Publishing replaces it for every desktop.`
              : "Nothing is published yet. This becomes the first release."
          }
        >
          <Input
            id={`${id}-confirm`}
            name="confirm_version"
            required
            autoComplete="off"
            inputMode="decimal"
          />
        </Field>
        <div className="form-actions">
          <Button variant="primary" type="submit" disabled={pending}>
            {pending ? "Publishing…" : "Sign and publish"}
          </Button>
          <span className="muted">
            Signed by the release service with the key in Key Vault. HQ never holds it.
          </span>
        </div>
      </fieldset>

      <Result state={state} />
      {state.status === "success" && state.announcement && (
        <Announcement announcement={state.announcement} />
      )}
    </form>
  );
}

/**
 * The release email, composed but not sent.
 *
 * Publishing and broadcasting are different-sized mistakes: a bad release is fixed by
 * rolling back, a bad email to every account cannot be recalled. So this hands the message
 * to `/product/email`, which already queues, targets and rate-limits, and a person sends it.
 */
function Announcement({
  announcement,
}: {
  announcement: NonNullable<ReleaseActionState["announcement"]>;
}) {
  const id = useId();
  const [copied, setCopied] = useState<"html" | "text" | null>(null);

  const copy = async (kind: "html" | "text") => {
    try {
      await navigator.clipboard.writeText(kind === "html" ? announcement.html : announcement.text);
      setCopied(kind);
    } catch {
      setCopied(null);
    }
  };

  return (
    <Card
      eyebrow="Optional"
      title="Announcement"
      titleId={`${id}-title`}
      description="Composed from this release. Nothing has been sent — paste it into Email to queue a broadcast."
      soft
    >
      <Field id={`${id}-subject`} label="Subject">
        <Input id={`${id}-subject`} readOnly value={announcement.subject} />
      </Field>
      <Field id={`${id}-body`} label="Plain text">
        <Textarea id={`${id}-body`} readOnly rows={8} value={announcement.text} />
      </Field>
      <div className="form-actions">
        <Button type="button" variant="ghost" onClick={() => void copy("text")}>
          {copied === "text" ? "Copied" : "Copy text"}
        </Button>
        <Button type="button" variant="ghost" onClick={() => void copy("html")}>
          {copied === "html" ? "Copied" : "Copy HTML"}
        </Button>
      </div>
    </Card>
  );
}

function ServingControls({
  version,
  disabled,
  formAction,
  pending,
}: {
  version: string;
  disabled: boolean;
  formAction: (formData: FormData) => void;
  pending: boolean;
}) {
  return (
    <form action={formAction} className="inline-actions">
      <input type="hidden" name="version" value={version} />
      <input type="hidden" name="disabled" value={String(!disabled)} />
      <Button variant={disabled ? "primary" : "danger"} type="submit" disabled={pending}>
        {pending ? "Working…" : disabled ? "Serve this release again" : "Stop serving this release"}
      </Button>
    </form>
  );
}

function RollbackForm({
  entry,
  formAction,
  pending,
}: {
  entry: ReleaseHistoryEntry;
  formAction: (formData: FormData) => void;
  pending: boolean;
}) {
  const id = useId();
  const [confirmation, setConfirmation] = useState("");
  return (
    <form action={formAction} className="inline-actions">
      <input type="hidden" name="version" value={entry.version} />
      <label className="sr-only" htmlFor={`${id}-confirm`}>
        Type {entry.version} to roll back to it
      </label>
      <Input
        id={`${id}-confirm`}
        name="confirm_version"
        value={confirmation}
        onChange={(event) => setConfirmation(event.currentTarget.value)}
        placeholder={entry.version}
        autoComplete="off"
        inputMode="decimal"
      />
      <Button
        variant="danger"
        type="submit"
        disabled={pending || confirmation.trim() !== entry.version}
      >
        {pending ? "Rolling back…" : "Roll back"}
      </Button>
    </form>
  );
}

const HISTORY_COLUMNS = [
  { key: "version", label: "Version" },
  { key: "published", label: "Published" },
  { key: "policy", label: "Policy" },
  { key: "state", label: "State" },
  { key: "actions", label: "Actions" },
] as const;

function Catalogue({
  catalogue,
  rollback,
  setDisabled,
}: {
  catalogue: ReleaseCatalogue;
  rollback: ReleaseAction;
  setDisabled: ReleaseAction;
}) {
  // One action state for the whole table rather than one per row, because a successful
  // rollback moves which row is current: the row that submitted stops rendering a rollback
  // form and starts rendering the serving controls, and a message held inside it would be
  // thrown away at the exact moment the operator needs to read it.
  const [rollbackState, rollbackAction, rollbackPending] = useActionState(
    rollback,
    INITIAL_RELEASE_ACTION_STATE,
  );
  const [servingState, servingAction, servingPending] = useActionState(
    setDisabled,
    INITIAL_RELEASE_ACTION_STATE,
  );
  return (
    <div className="stack">
      <Result state={rollbackState} />
      <Result state={servingState} />
      <DataTable
        caption="Published releases, newest first"
        columns={HISTORY_COLUMNS}
        minWidth={880}
        isEmpty={catalogue.entries.length === 0}
        empty={
          <EmptyState
            title="No release has been published"
            description="The catalogue is empty. The first publish from this page starts it."
          />
        }
      >
        {catalogue.entries.map((entry) => {
          const isCurrent = entry.version === catalogue.currentVersion;
          return (
            <tr key={entry.version}>
              <td>
                <span className="data-table__primary mono">{entry.version}</span>
                {entry.title && <span className="data-table__secondary">{entry.title}</span>}
              </td>
              <td>
                {entry.created_at ? (
                  <LocalTime value={entry.created_at} />
                ) : (
                  <span className="muted">Not recorded</span>
                )}
                <span className="data-table__secondary">{entry.channel}</span>
              </td>
              <td>
                <span className="data-table__primary">
                  {entry.force_update
                    ? "Required"
                    : (RELEASE_SEVERITY_LABELS[
                        entry.severity as keyof typeof RELEASE_SEVERITY_LABELS
                      ] ?? entry.severity)}
                </span>
                {!entry.signed && <span className="data-table__secondary">Unsigned</span>}
              </td>
              <td>
                {/* Explicit tone and label: "serving" and "superseded" are release words, not
                  part of the console's shared status vocabulary, and inferring a tone from
                  a word the table does not recognise renders every row neutral. */}
                {isCurrent ? (
                  <StatusPill
                    value={entry.disabled ? "disabled" : "enabled"}
                    tone={entry.disabled ? "danger" : "live"}
                    label={entry.disabled ? "Not served" : "Serving"}
                  />
                ) : (
                  <StatusPill value="superseded" tone="neutral" label="Superseded" />
                )}
              </td>
              <td className="data-table__actions">
                {isCurrent ? (
                  <ServingControls
                    version={entry.version}
                    disabled={entry.disabled}
                    formAction={servingAction}
                    pending={servingPending}
                  />
                ) : (
                  <RollbackForm
                    entry={entry}
                    formAction={rollbackAction}
                    pending={rollbackPending}
                  />
                )}
              </td>
            </tr>
          );
        })}
      </DataTable>
    </div>
  );
}

export function AdminReleaseManager({
  catalogue,
  publish,
  rollback,
  setDisabled,
}: ReleaseManagerProps) {
  // A fragment, not another `.board`: the page already provides one, and a nested grid item
  // takes `min-width: auto`, which stops it shrinking below the min-content width of the
  // release table inside it. The table then pushes the whole page sideways at phone width
  // even though it has its own scroll container.
  return (
    <>
      {!catalogue.signingConfigured && (
        <Callout tone="danger" role="alert" title="Release signing is not configured">
          The release service has no signing key, so it will refuse to publish. Put the Ed25519
          private key in Key Vault as <code>update-signing-private-key</code>, set{" "}
          <code>QT_SIGNING_VAULT_URL</code> on the function, and grant its managed identity
          secret-get access. Nothing on this page works until then, which is the intended failure:
          an unsigned manifest is refused by every desktop that downloads it.
        </Callout>
      )}
      <Card
        eyebrow="Release management"
        title="Publish a release"
        titleId="admin-release-publish-heading"
        description="Writes the manifest every installed desktop reads. It is signed by the release service, not here."
      >
        <PublishForm catalogue={catalogue} publish={publish} />
      </Card>
      <Card
        eyebrow="History"
        title="Published releases"
        titleId="admin-release-history-heading"
        description="Roll back to make an earlier release current again. A desktop already on a later build stays there — an update check only ever offers a higher version."
      >
        <Catalogue catalogue={catalogue} rollback={rollback} setDisabled={setDisabled} />
      </Card>
    </>
  );
}
