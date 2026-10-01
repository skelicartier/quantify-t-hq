import Link from "next/link";

import {
  documentRequestAction,
  saveDocumentAction,
  saveSectionAction,
} from "@/app/(portal)/trust/centre/actions";
import { PageHeader } from "@/components/shell/page-header";
import { TrustTabs } from "@/components/trust/trust-parts";
import { ActForm } from "@/components/ui/act-form";
import { Callout } from "@/components/ui/callout";
import { Section } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { Checkbox, Field, Input, Textarea } from "@/components/ui/field";
import { StatusPill, type PillTone } from "@/components/ui/status-pill";
import { hasCapability, requireStaff } from "@/lib/access/core";
import { HqApiRequestError, HqApiUnavailableError } from "@/lib/api/core";
import { readTrustCentre, type TrustCentre } from "@/lib/api/trust-centre";
import { formatAbsolute, formatDate } from "@/lib/format";

export const metadata = { title: "Trust centre" };
export const dynamic = "force-dynamic";

const REQUEST_TONE: Record<string, PillTone> = {
  received: "attention",
  approved: "live",
  sent: "neutral",
  declined: "neutral",
};

/**
 * Keeping the public trust centre: the sections it shows, the documents a security review
 * can ask for, and the requests for them — decided here, sent by a person.
 */
export default async function TrustCentreAdminPage() {
  const context = await requireStaff("/trust/centre");
  if (!hasCapability(context, "audit:read")) {
    return (
      <>
        <PageHeader eyebrow="Trust" title="Trust centre" />
        <Callout tone="neutral">The trust centre is kept by Admins and Owners.</Callout>
      </>
    );
  }
  let centre: TrustCentre | null = null;
  try {
    centre = await readTrustCentre(context.token);
  } catch (error) {
    if (!(error instanceof HqApiUnavailableError || error instanceof HqApiRequestError))
      throw error;
  }
  const canWrite = hasCapability(context, "hq:admin");
  return (
    <>
      <PageHeader
        eyebrow="Trust"
        title="Trust centre"
        description="What the public trust centre shows: the sections you publish (each with the day it was last reviewed), the active sub-processors from the register, and the documents a security review can ask for. No badges, no percentages."
        actions={<TrustTabs context={context} current="/trust/centre" />}
      />
      {centre === null ? (
        <Callout tone="danger" role="alert">
          The trust centre could not be read just now.
        </Callout>
      ) : (
        <div className="page-content">
          <p className="page-note">
            Public at{" "}
            <Link className="text-link" href="/trust-centre">
              /trust-centre
            </Link>{" "}
            · {centre.waiting} request
            {centre.waiting === 1 ? "" : "s"} waiting · {centre.subprocessors.length} active
            sub-processor
            {centre.subprocessors.length === 1 ? "" : "s"} listed from the register
          </p>

          <Section id="requests" title="Document requests">
            <DataTable
              caption="Requests for documents, waiting first"
              columns={[
                { key: "who", label: "Who" },
                { key: "what", label: "Document" },
                { key: "why", label: "What it is for" },
                { key: "state", label: "State" },
                { key: "when", label: "Asked" },
                { key: "act", label: "Action" },
              ]}
              isEmpty={centre.requests.length === 0}
              empty={<p className="muted">No requests yet.</p>}
              columnMenu={false}
            >
              {centre.requests.map((request) => (
                <tr key={request.request_id}>
                  <td>
                    {request.name || "Erased"}
                    <span className="quiet">
                      {" "}
                      · {request.company || "—"} · {request.email || "—"}
                    </span>
                  </td>
                  <td>{request.document_title}</td>
                  <td>{request.reason || "—"}</td>
                  <td>
                    <StatusPill
                      value={request.status}
                      label={
                        request.status === "sent"
                          ? `Sent ${formatDate(request.sent_on)}`
                          : request.status.charAt(0).toUpperCase() + request.status.slice(1)
                      }
                      tone={REQUEST_TONE[request.status] ?? "neutral"}
                    />
                    {request.decision_note && (
                      <span className="quiet"> · {request.decision_note}</span>
                    )}
                  </td>
                  <td>{formatAbsolute(request.created_at, "—")}</td>
                  <td>
                    {canWrite && request.status === "received" && (
                      <div className="inline-actions">
                        <ActForm
                          action={documentRequestAction}
                          hidden={{ request_id: request.request_id }}
                          act="approve"
                          label="Approve"
                        />
                        <details className="disclosure">
                          <summary>Decline</summary>
                          <ActForm
                            action={documentRequestAction}
                            hidden={{ request_id: request.request_id }}
                            act="decline"
                            label="Decline it"
                            danger
                          >
                            <Field id={`decline-${request.request_id}`} label="Why">
                              <Input
                                id={`decline-${request.request_id}`}
                                name="note"
                                maxLength={1000}
                              />
                            </Field>
                          </ActForm>
                        </details>
                      </div>
                    )}
                    {canWrite && request.status === "approved" && (
                      <ActForm
                        action={documentRequestAction}
                        hidden={{ request_id: request.request_id }}
                        act="sent"
                        label="It went out today"
                      />
                    )}
                  </td>
                </tr>
              ))}
            </DataTable>
          </Section>

          <Section id="sections" title="Sections">
            {centre.sections.length === 0 && <p className="muted">No sections yet.</p>}
            {centre.sections.map((section) => (
              <details key={section.section_id} className="disclosure">
                <summary>
                  {section.title}
                  <span className="quiet">
                    {" "}
                    · {section.published ? "public" : "not public"}
                    {section.reviewed_on && ` · reviewed ${formatDate(section.reviewed_on)}`}
                  </span>
                </summary>
                {canWrite ? (
                  <ActForm
                    action={saveSectionAction}
                    hidden={{ section_id: section.section_id }}
                    act="save"
                    label="Save"
                    tight={false}
                  >
                    <Field id={`title-${section.section_id}`} label="Title">
                      <Input
                        id={`title-${section.section_id}`}
                        name="title"
                        maxLength={160}
                        defaultValue={section.title}
                      />
                    </Field>
                    <Field id={`body-${section.section_id}`} label="What it says">
                      <Textarea
                        id={`body-${section.section_id}`}
                        name="body"
                        rows={6}
                        maxLength={20000}
                        defaultValue={section.body}
                      />
                    </Field>
                    <Checkbox
                      id={`published-${section.section_id}`}
                      name="published"
                      label="Public"
                      description="Publishing or rewriting it counts as reviewing it today."
                      defaultChecked={section.published}
                    />
                  </ActForm>
                ) : (
                  <p className="prewrap">{section.body}</p>
                )}
              </details>
            ))}
            {canWrite && (
              <details className="disclosure">
                <summary>Add a section</summary>
                <ActForm
                  action={saveSectionAction}
                  hidden={{}}
                  act="save"
                  label="Add it"
                  primary
                  tight={false}
                >
                  <Field id="new-section-title" label="Title">
                    <Input
                      id="new-section-title"
                      name="title"
                      maxLength={160}
                      placeholder="Reporting a security problem"
                    />
                  </Field>
                  <Field id="new-section-body" label="What it says">
                    <Textarea id="new-section-body" name="body" rows={6} maxLength={20000} />
                  </Field>
                  <Checkbox id="new-section-published" name="published" label="Public" />
                </ActForm>
              </details>
            )}
          </Section>

          <Section id="documents" title="Documents on request">
            <DataTable
              caption="Documents a security review can ask for"
              columns={[
                { key: "title", label: "Document" },
                { key: "nda", label: "NDA first" },
                { key: "offered", label: "Offered" },
              ]}
              isEmpty={centre.documents.length === 0}
              empty={<p className="muted">None yet.</p>}
              columnMenu={false}
            >
              {centre.documents.map((document) => (
                <tr key={document.document_id}>
                  <td>
                    {document.title}
                    {document.description && (
                      <span className="quiet"> · {document.description}</span>
                    )}
                  </td>
                  <td>{document.requires_nda ? "Yes" : "No"}</td>
                  <td>{document.available ? "Yes" : "No"}</td>
                </tr>
              ))}
            </DataTable>
            {canWrite && (
              <details className="disclosure">
                <summary>Add a document</summary>
                <ActForm
                  action={saveDocumentAction}
                  hidden={{}}
                  act="save"
                  label="Add it"
                  tight={false}
                >
                  <Field id="document-title" label="What it is">
                    <Input
                      id="document-title"
                      name="title"
                      maxLength={160}
                      placeholder="Penetration test summary"
                    />
                  </Field>
                  <Field id="document-description" label="A line about it">
                    <Input id="document-description" name="description" maxLength={1000} />
                  </Field>
                  <Checkbox
                    id="document-nda"
                    name="requires_nda"
                    label="An NDA comes first"
                    defaultChecked
                  />
                  <Checkbox
                    id="document-available"
                    name="available"
                    label="Offered on the public page"
                    defaultChecked
                  />
                </ActForm>
              </details>
            )}
          </Section>
        </div>
      )}
    </>
  );
}
