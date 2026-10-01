import Link from "next/link";

import { confirmSudoAction } from "@/app/(portal)/admin/actions";
import {
  createControlAction,
  mintAuditorLinkAction,
  revokeAuditorLinkAction,
} from "@/app/(portal)/trust/controls/actions";
import { SudoGate } from "@/components/admin/sudo-gate";
import { DocumentTools } from "@/components/documents/document-tools";
import { PageHeader } from "@/components/shell/page-header";
import { AuditorLinkForm } from "@/components/trust/auditor-link-form";
import { TrustTabs } from "@/components/trust/trust-parts";
import { ActForm } from "@/components/ui/act-form";
import { Callout } from "@/components/ui/callout";
import { Section } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Popover } from "@/components/ui/popover";
import { RowAction } from "@/components/ui/row-action";
import { StatusPill, type PillTone } from "@/components/ui/status-pill";
import { hasCapability, requireStaff } from "@/lib/access/core";
import { HqApiRequestError, HqApiUnavailableError } from "@/lib/api/core";
import { readControls, type ControlBoard } from "@/lib/api/controls";
import { formatAbsolute, formatDate } from "@/lib/format";

export const metadata = { title: "Controls" };
export const dynamic = "force-dynamic";

const COLUMNS = [
  { key: "ref", label: "Control" },
  { key: "domain", label: "Area" },
  { key: "state", label: "State" },
  { key: "cadence", label: "Cadence" },
  { key: "owner", label: "Owner" },
  { key: "evidence", label: "Last evidence" },
  { key: "due", label: "Next due" },
  { key: "frameworks", label: "Answers" },
];

const STATE_TONE: Record<string, PillTone> = {
  operating: "live",
  draft: "attention",
  retired: "neutral",
};

/**
 * What the company does to stay secure, on a cadence, with the evidence that it did — and a
 * link an auditor can read for a while. Counts, never a percentage.
 */
export default async function ControlsPage() {
  const context = await requireStaff("/trust/controls");
  if (!hasCapability(context, "audit:read")) {
    return (
      <>
        <PageHeader eyebrow="Trust" title="Controls" />
        <Callout tone="neutral">The control map is read by Admins and Owners.</Callout>
      </>
    );
  }
  let board: ControlBoard | null = null;
  try {
    board = await readControls(context.token);
  } catch (error) {
    if (!(error instanceof HqApiUnavailableError || error instanceof HqApiRequestError))
      throw error;
  }
  const canWrite = hasCapability(context, "hq:admin");
  const untilLabel = context.me.sudo_until
    ? (formatAbsolute(context.me.sudo_until).split(", ")[1] ?? null)
    : null;
  return (
    <>
      <PageHeader
        eyebrow="Trust"
        title="Controls"
        description="Each control is something we do on a cadence, with an owner, the framework clauses it answers and the registers that show it working. Its evidence is dated; one whose newest evidence is older than its cadence is due. No percentage: the counts can be checked, a percentage cannot."
        actions={
          <>
            <TrustTabs context={context} current="/trust/controls" />
            {canWrite && board && (
              <Popover label="Add a control" variant="primary" width="wide">
                <ActForm
                  action={createControlAction}
                  hidden={{}}
                  act="create"
                  label="Add it"
                  primary
                  tight={false}
                >
                  <div className="form-grid">
                    <Field id="control-ref" label="Reference" hint="Letters, a dash, a number.">
                      <Input id="control-ref" name="ref" maxLength={16} placeholder="AC-1" />
                    </Field>
                    <Field id="control-domain" label="Area">
                      <Select id="control-domain" name="domain" defaultValue="access">
                        {board.domains.map((item) => (
                          <option key={item.value} value={item.value}>
                            {item.label}
                          </option>
                        ))}
                      </Select>
                    </Field>
                  </div>
                  <Field id="control-title" label="What it does">
                    <Input
                      id="control-title"
                      name="title"
                      maxLength={200}
                      placeholder="Quarterly access review"
                    />
                  </Field>
                  <div className="form-grid">
                    <Field id="control-frequency" label="Cadence">
                      <Select id="control-frequency" name="frequency" defaultValue="quarterly">
                        {board.frequencies.map((item) => (
                          <option key={item.value} value={item.value}>
                            {item.label}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <Field id="control-owner" label="Owner">
                      <Select
                        id="control-owner"
                        name="owner_staff_id"
                        defaultValue={context.me.staff.staff_id}
                      >
                        <option value="">Nobody yet</option>
                        {board.staff.map((person) => (
                          <option key={person.staff_id} value={person.staff_id}>
                            {person.name}
                          </option>
                        ))}
                      </Select>
                    </Field>
                  </div>
                  <Field
                    id="control-frameworks"
                    label="Framework clauses it answers"
                    hint="Comma-separated."
                  >
                    <Textarea id="control-frameworks" name="frameworks" rows={2} maxLength={1000} />
                  </Field>
                </ActForm>
              </Popover>
            )}
            <DocumentTools context={context} kind="controls" returnPath="/trust/controls" />
          </>
        }
      />
      {board === null ? (
        <Callout tone="danger" role="alert">
          The control map could not be read just now.
        </Callout>
      ) : (
        <div className="page-content">
          <p className="page-note">
            {board.counts.operating} of {board.counts.total} operating · {board.counts.draft} being
            designed · {board.counts.evidence_due} with evidence due
          </p>
          <Section id="controls" title="Controls">
            <DataTable
              caption="Controls, operating first"
              columns={COLUMNS}
              isEmpty={board.controls.length === 0}
              empty={<p className="muted">No controls yet.</p>}
            >
              {board.controls.map((control) => (
                <tr key={control.control_id}>
                  <td>
                    <Link href={`/trust/controls/${control.control_id}`}>{control.ref}</Link>
                    <span className="quiet"> · {control.title}</span>
                  </td>
                  <td>{control.domain_label}</td>
                  <td>
                    {control.evidence_due ? (
                      <StatusPill value="due" label="Evidence due" tone="attention" />
                    ) : (
                      <StatusPill
                        value={control.state}
                        label={control.state_label}
                        tone={STATE_TONE[control.state] ?? "neutral"}
                      />
                    )}
                  </td>
                  <td>{control.frequency_label}</td>
                  <td>{control.owner_name || "Nobody"}</td>
                  <td>{formatDate(control.last_evidence_on, "None")}</td>
                  <td>{formatDate(control.evidence_due_on, "—")}</td>
                  <td>{control.frameworks.join(" · ") || "—"}</td>
                </tr>
              ))}
            </DataTable>
          </Section>

          <Section
            id="auditors"
            title="Auditor links"
            description="Read-only, for a while: operating controls and their evidence log, nothing else. Every view is counted."
          >
            <DataTable
              caption="Auditor links, newest first"
              columns={[
                { key: "for", label: "For" },
                { key: "state", label: "State" },
                { key: "expires", label: "Expires" },
                { key: "views", label: "Views", align: "end" as const },
                { key: "last", label: "Last viewed" },
                { key: "act", label: "Action" },
              ]}
              isEmpty={board.auditor_links.length === 0}
              empty={<p className="muted">No auditor has a link.</p>}
              columnMenu={false}
            >
              {board.auditor_links.map((link) => (
                <tr key={link.link_id}>
                  <td>
                    {link.label}
                    <span className="quiet"> · by {link.created_by_name || "—"}</span>
                  </td>
                  <td>
                    <StatusPill
                      value={link.state}
                      label={
                        link.state === "live"
                          ? "Open"
                          : link.state === "expired"
                            ? "Expired"
                            : "Revoked"
                      }
                      tone={link.state === "live" ? "live" : "neutral"}
                    />
                  </td>
                  <td>{formatAbsolute(link.expires_at, "—")}</td>
                  <td className="data-table__num">{link.views}</td>
                  <td>{formatAbsolute(link.last_viewed_at, "Never")}</td>
                  <td>
                    {canWrite && link.state === "live" && context.me.sudo_fresh && (
                      <RowAction
                        action={revokeAuditorLinkAction}
                        fields={{ link_id: link.link_id }}
                        buttons={[
                          {
                            label: "Revoke",
                            className: "btn btn--small btn--ghost",
                            ariaLabel: `Revoke the link for ${link.label}`,
                          },
                        ]}
                      />
                    )}
                  </td>
                </tr>
              ))}
            </DataTable>
            {canWrite && (
              <div className="stack-form">
                <SudoGate
                  action={confirmSudoAction}
                  fresh={context.me.sudo_fresh}
                  untilLabel={untilLabel}
                  returnPath="/trust/controls"
                  purpose="Showing the control map to an outsider, or taking it back, needs a fresh code."
                />
                <AuditorLinkForm action={mintAuditorLinkAction} disabled={!context.me.sudo_fresh} />
              </div>
            )}
          </Section>
        </div>
      )}
    </>
  );
}
