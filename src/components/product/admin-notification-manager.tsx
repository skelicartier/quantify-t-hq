"use client";

import { Copy, Pencil, Plus, Save, Trash2, X } from "lucide-react";
import { useActionState, useState } from "react";

import { RecipientPicker, type RecipientAccount } from "@/components/product/recipient-picker";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Section } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusPill } from "@/components/ui/status-pill";
import { Timestamp } from "@/components/ui/timestamp";
import type { AccountApiAdminNotifications } from "@/lib/product/account-api";
import { formatLabel, isoToLocalInput, localInputToIso } from "@/lib/format";
import {
  INITIAL_NOTIFICATION_STATE,
  type NotificationActionState,
  type NotificationInput,
} from "@/lib/product/notifications/input";

type Props = {
  document: AccountApiAdminNotifications;
  evaluatedAt?: number;
  action: (state: NotificationActionState, data: FormData) => Promise<NotificationActionState>;
};

const blank: NotificationInput = {
  id: "",
  title: "",
  body: "",
  severity: "info",
  display: "center",
  active: true,
  dismissible: true,
  starts_at: "",
  expires_at: "",
  actions: [],
  target: { mode: "all", user_ids: [], emails: [] },
};

const COLUMNS = [
  { key: "title", label: "Notice" },
  { key: "status", label: "Status" },
  { key: "recipients", label: "Recipients" },
  { key: "starts", label: "Starts" },
  { key: "expires", label: "Expires" },
  { key: "actions", label: <span className="sr-only">Actions</span> },
] as const;

function editable(note: AccountApiAdminNotifications["notifications"][number]): NotificationInput {
  const {
    id,
    title,
    body,
    severity,
    display,
    active,
    dismissible,
    starts_at,
    expires_at,
    target,
    actions,
  } = note;
  const input = {
    id,
    title,
    body,
    severity,
    display,
    active,
    dismissible,
    starts_at,
    expires_at,
    target,
    actions,
  };
  return {
    ...input,
    actions: input.actions.map((item) => ({
      ...item,
      kind: item.kind === "update" || item.kind === "dismiss" ? item.kind : "link",
    })),
  };
}

function NotificationEditor({
  initial,
  revision,
  action,
  onClose,
}: {
  initial: NotificationInput;
  revision: string;
  action: Props["action"];
  onClose: () => void;
}) {
  const [note, setNote] = useState(initial);
  // Ids saved on an existing notice come back without names; the picker shows them as ids.
  const [accounts, setAccounts] = useState<RecipientAccount[]>(() =>
    initial.target.user_ids.map((id) => ({ id, email: "", name: "", active: true })),
  );
  const [emails, setEmails] = useState(initial.target.emails.join("\n"));
  const [state, formAction, pending] = useActionState(action, INITIAL_NOTIFICATION_STATE);
  const set = <K extends keyof NotificationInput>(key: K, value: NotificationInput[K]) =>
    setNote((current) => ({ ...current, [key]: value }));
  const selectors = (value: string) => [...new Set(value.split(/[\s,;]+/u).filter(Boolean))];
  const payload = {
    ...note,
    target: {
      mode: note.target.mode,
      user_ids: note.target.mode === "selected" ? accounts.map((account) => account.id) : [],
      emails: note.target.mode === "selected" ? selectors(emails) : [],
    },
  };

  return (
    <form action={formAction} className="card card--important">
      <div className="section__header">
        <div>
          <p className="quiet">{note.id ? "Editing" : "Draft"}</p>
          <h2>{note.id ? "Edit notification" : "New notification"}</h2>
        </div>
        <Button
          size="icon"
          variant="ghost"
          title="Close editor"
          aria-label="Close editor"
          onClick={onClose}
          disabled={pending}
        >
          <X size={18} />
        </Button>
      </div>
      <input type="hidden" name="revision" value={revision} />
      <input type="hidden" name="notification" value={JSON.stringify(payload)} />
      <fieldset className="fieldset form" disabled={pending}>
        <div className="form-grid">
          <label className="field form-grid__span">
            <span className="field__label">Title</span>
            <input
              className="input"
              maxLength={140}
              value={note.title}
              onChange={(event) => set("title", event.target.value)}
            />
          </label>
          <label className="field form-grid__span">
            <span className="field__label">Message</span>
            <textarea
              className="textarea"
              rows={5}
              maxLength={4000}
              value={note.body}
              onChange={(event) => set("body", event.target.value)}
            />
          </label>
          <label className="field">
            <span className="field__label">Severity</span>
            <select
              className="select"
              value={note.severity}
              onChange={(event) =>
                set("severity", event.target.value as NotificationInput["severity"])
              }
            >
              {["info", "success", "warning", "critical"].map((value) => (
                <option key={value} value={value}>
                  {formatLabel(value)}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="field__label">Display</span>
            <select
              className="select"
              value={note.display}
              onChange={(event) =>
                set("display", event.target.value as NotificationInput["display"])
              }
            >
              <option value="center">Notification center</option>
              <option value="popup">Popup</option>
            </select>
          </label>
          <label className="field">
            <span className="field__label">Starts (UTC)</span>
            <input
              className="input"
              type="datetime-local"
              value={isoToLocalInput(note.starts_at)}
              onChange={(event) =>
                set("starts_at", event.target.value ? localInputToIso(event.target.value) : "")
              }
            />
          </label>
          <label className="field">
            <span className="field__label">Expires (UTC)</span>
            <input
              className="input"
              type="datetime-local"
              value={isoToLocalInput(note.expires_at)}
              onChange={(event) =>
                set("expires_at", event.target.value ? localInputToIso(event.target.value) : "")
              }
            />
          </label>
          <label className="field form-grid__span">
            <span className="field__label">Recipients</span>
            <select
              className="select"
              value={note.target.mode}
              onChange={(event) =>
                set("target", {
                  ...note.target,
                  mode: event.target.value as NotificationInput["target"]["mode"],
                })
              }
            >
              <option value="all">All accounts</option>
              <option value="active">Active accounts</option>
              <option value="selected">Selected accounts</option>
            </select>
          </label>
          {note.target.mode === "selected" && (
            <>
              <div className="form-grid__span">
                <RecipientPicker
                  idPrefix="notification-recipients"
                  selected={accounts}
                  onChange={setAccounts}
                  disabled={pending}
                />
              </div>
              <label className="field form-grid__span">
                <span className="field__label">Email addresses</span>
                <textarea
                  className="textarea"
                  rows={3}
                  maxLength={190000}
                  placeholder="Addresses outside the directory, one per line"
                  value={emails}
                  onChange={(event) => setEmails(event.target.value)}
                />
              </label>
            </>
          )}
        </div>

        <div className="inline-actions">
          <div className="checkbox">
            <input
              type="checkbox"
              id="notification-active"
              checked={note.active}
              onChange={(event) => set("active", event.target.checked)}
            />
            <label className="checkbox__label" htmlFor="notification-active">
              Active
            </label>
          </div>
          <div className="checkbox">
            <input
              type="checkbox"
              id="notification-dismissible"
              checked={note.dismissible}
              onChange={(event) => set("dismissible", event.target.checked)}
            />
            <label className="checkbox__label" htmlFor="notification-dismissible">
              Dismissible
            </label>
          </div>
        </div>

        <div className="section__header">
          <div>
            <h3>Actions</h3>
            <p className="section__desc">Up to four buttons shown with the notice.</p>
          </div>
          <Button
            size="icon"
            title="Add action"
            aria-label="Add action"
            disabled={note.actions.length >= 4}
            onClick={() =>
              set("actions", [
                ...note.actions,
                { kind: "link", label: "", url: "", primary: false },
              ])
            }
          >
            <Plus size={18} />
          </Button>
        </div>
        {note.actions.map((item, index) => {
          const update = (patch: Partial<NotificationInput["actions"][number]>) =>
            set(
              "actions",
              note.actions.map((current, position) =>
                position === index ? { ...current, ...patch } : current,
              ),
            );
          return (
            <div className="form-grid" key={index}>
              <label className="field">
                <span className="field__label">Label</span>
                <input
                  className="input"
                  required
                  maxLength={60}
                  value={item.label}
                  onChange={(event) => update({ label: event.target.value })}
                />
              </label>
              <label className="field">
                <span className="field__label">Type</span>
                <select
                  className="select"
                  value={item.kind}
                  onChange={(event) => update({ kind: event.target.value as typeof item.kind })}
                >
                  <option value="link">Link</option>
                  <option value="update">Update</option>
                  <option value="dismiss">Dismiss</option>
                </select>
              </label>
              {item.kind !== "dismiss" && (
                <label className="field form-grid__span">
                  <span className="field__label">HTTPS URL</span>
                  <input
                    className="input"
                    type="url"
                    required
                    maxLength={500}
                    value={item.url}
                    onChange={(event) => update({ url: event.target.value })}
                  />
                </label>
              )}
              <div className="inline-actions form-grid__span">
                <div className="checkbox">
                  <input
                    type="checkbox"
                    id={`notification-action-primary-${index}`}
                    checked={item.primary}
                    onChange={(event) => update({ primary: event.target.checked })}
                  />
                  <label
                    className="checkbox__label"
                    htmlFor={`notification-action-primary-${index}`}
                  >
                    Primary
                  </label>
                </div>
                <Button
                  size="icon"
                  variant="ghost"
                  title="Remove action"
                  aria-label={`Remove action ${index + 1}`}
                  onClick={() =>
                    set(
                      "actions",
                      note.actions.filter((_, position) => index !== position),
                    )
                  }
                >
                  <Trash2 size={18} />
                </Button>
              </div>
            </div>
          );
        })}
        <div className="form-actions">
          <Button variant="primary" type="submit">
            <Save size={16} aria-hidden="true" />
            {pending ? "Saving…" : "Save notification"}
          </Button>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </fieldset>
      {state.message && (
        <Callout
          tone={state.status === "error" ? "danger" : "success"}
          role={state.status === "error" ? "alert" : "status"}
          compact
        >
          {state.message}
        </Callout>
      )}
    </form>
  );
}

export function AdminNotificationManager({ document, action, evaluatedAt }: Props) {
  const [selection, setSelection] = useState<{
    note: NotificationInput;
    revision: string;
    key: number;
  } | null>(null);
  const [message, setMessage] = useState("");
  const open = (note: NotificationInput) =>
    setSelection((previous) => ({
      note,
      revision: document.revision,
      key: (previous?.key ?? 0) + 1,
    }));
  const save: Props["action"] = async (state, data) => {
    const result = await action(state, data);
    if (result.status === "success") {
      setSelection(null);
      setMessage(result.message);
    }
    return result;
  };
  const status = (note: NotificationInput) => {
    if (!note.active) return "paused";
    if (evaluatedAt === undefined) return "enabled";
    if (note.expires_at && Date.parse(note.expires_at) < evaluatedAt) return "expired";
    if (note.starts_at && Date.parse(note.starts_at) > evaluatedAt) return "scheduled";
    return "active";
  };
  return (
    <Section
      id="admin-notification-list"
      title="Notices"
      eyebrow="Published and scheduled"
      actions={
        <Button variant="primary" onClick={() => open(blank)}>
          <Plus size={16} aria-hidden="true" /> New notification
        </Button>
      }
    >
      <div className="stack">
        {message && (
          <Callout tone="success" role="status" compact>
            {message}
          </Callout>
        )}
        {selection && (
          <NotificationEditor
            key={selection.key}
            initial={selection.note}
            revision={selection.revision}
            action={save}
            onClose={() => setSelection(null)}
          />
        )}
        <DataTable
          columns={COLUMNS}
          caption="Notices"
          isEmpty={document.notifications.length === 0}
          empty={
            <EmptyState
              title="No notifications yet."
              description="Create one to show a notice in the account console and the desktop terminal."
              compact
            />
          }
        >
          {document.notifications.map((note) => (
            <tr key={note.id}>
              <td>
                <span className="data-table__primary">{note.title || "Untitled"}</span>
                <span className="data-table__secondary">{formatLabel(note.severity)}</span>
              </td>
              <td>
                <StatusPill value={status(editable(note))} />
              </td>
              <td>
                {note.target.mode === "selected"
                  ? `Selected (${note.target.user_ids.length + note.target.emails.length})`
                  : note.target.mode === "all"
                    ? "All accounts"
                    : "Active accounts"}
              </td>
              <td>
                <Timestamp value={note.starts_at} mode="absolute" fallback="Immediately" />
              </td>
              <td>
                <Timestamp value={note.expires_at} mode="absolute" fallback="Never" />
              </td>
              <td className="data-table__actions">
                <div className="inline-actions">
                  <Button
                    size="icon"
                    variant="ghost"
                    title="Edit notification"
                    aria-label={`Edit ${note.title || "notification"}`}
                    onClick={() => open(editable(note))}
                  >
                    <Pencil size={16} />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    title="Duplicate notification"
                    aria-label={`Duplicate ${note.title || "notification"}`}
                    onClick={() => open({ ...editable(note), id: "", active: false })}
                  >
                    <Copy size={16} />
                  </Button>
                </div>
              </td>
            </tr>
          ))}
        </DataTable>
      </div>
    </Section>
  );
}
