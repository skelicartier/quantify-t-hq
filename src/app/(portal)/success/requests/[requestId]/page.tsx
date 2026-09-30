import Link from "next/link";
import { notFound } from "next/navigation";

import {
  addAskAction,
  shipRequestAction,
  updateRequestAction,
} from "@/app/(portal)/success/actions";
import { AddAskForm, ShipForm } from "@/components/success/success-forms";
import { PageHeader } from "@/components/shell/page-header";
import { ActForm } from "@/components/ui/act-form";
import { Callout } from "@/components/ui/callout";
import { Card } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/field";
import {
  Properties,
  Property,
  RecordGrid,
  RecordHeader,
  RecordSection,
} from "@/components/ui/record-shell";
import { StatusPill } from "@/components/ui/status-pill";
import { hasCapability, requireStaff } from "@/lib/access/core";
import { HqApiRequestError, HqApiUnavailableError } from "@/lib/api/core";
import { readCompanies, readPeople } from "@/lib/api/crm";
import { readDealsBoard } from "@/lib/api/deals";
import { readFeatureRequest, type FeatureRequestDetail } from "@/lib/api/success";
import { formatDate, formatMoney } from "@/lib/format";

export const metadata = { title: "Feature request" };
export const dynamic = "force-dynamic";

const IMPORTANCE_TONE: Record<string, "danger" | "attention" | "neutral"> = {
  blocker: "danger",
  important: "attention",
  nice: "neutral",
};

type Params = Promise<{ requestId: string }>;

function money(values: Record<string, string>): string {
  const entries = Object.entries(values);
  if (entries.length === 0) return "—";
  return entries.map(([currency, amount]) => formatMoney(Number(amount), currency)).join(" · ");
}

/**
 * One request: every ask in the asker's words, the firms and money behind it, and — when it
 * ships — the note to everyone who asked.
 */
export default async function FeatureRequestPage({ params }: { params: Params }) {
  const { requestId } = await params;
  const context = await requireStaff(`/success/requests/${requestId}`);
  let detail: FeatureRequestDetail | null = null;
  try {
    detail = await readFeatureRequest(context.token, requestId);
  } catch (error) {
    if (error instanceof HqApiRequestError && error.status === 404) notFound();
    if (!(error instanceof HqApiUnavailableError || error instanceof HqApiRequestError))
      throw error;
  }
  if (detail === null) {
    return (
      <>
        <PageHeader eyebrow="Feature requests" title="Feature request" />
        <Callout tone="danger" role="alert">
          This request could not be read just now.
        </Callout>
      </>
    );
  }
  const { request } = detail;
  const canWrite = hasCapability(context, "crm:write");
  const seesMoney = hasCapability(context, "revenue:read");
  const closed = request.status === "shipped" || request.status === "declined";
  let companies: Array<{ id: string; name: string }> = [];
  let people: Array<{ id: string; name: string; company_id: string }> = [];
  let deals: Array<{ id: string; name: string }> = [];
  if (canWrite && !closed) {
    try {
      companies = (await readCompanies(context.token)).companies
        .map((row) => ({ id: row.company_id, name: row.name }))
        .sort((a, b) => a.name.localeCompare(b.name));
      people = (await readPeople(context.token)).people
        .filter((row) => row.email)
        .map((row) => ({
          id: row.person_id,
          name: row.full_name || row.email,
          company_id: row.company_id,
        }))
        .sort((a, b) => a.name.localeCompare(b.name));
      deals = (await readDealsBoard(context.token)).columns
        .flatMap((column) => column.deals)
        .map((deal) => ({ id: deal.deal_id, name: `${deal.company_name} · ${deal.name}` }))
        .sort((a, b) => a.name.localeCompare(b.name));
    } catch (error) {
      if (!(error instanceof HqApiUnavailableError || error instanceof HqApiRequestError))
        throw error;
    }
  }

  return (
    <>
      <RecordHeader
        crumbs={[{ href: "/success/requests", label: "Feature requests" }]}
        title={request.title}
        status={
          <StatusPill
            value={request.status}
            label={request.status_label}
            tone={request.status === "shipped" ? "live" : "attention"}
          />
        }
        readouts={[
          { label: "Firms asking", value: request.firms },
          { label: "Asks", value: request.asks },
          { label: "Deals blocked", value: request.deals_blocked },
          ...(seesMoney ? [{ label: "Their MRR", value: money(request.mrr) }] : []),
        ]}
      />
      <RecordGrid
        side={
          <Properties title="Request">
            <Property label="Status">{request.status_label}</Property>
            {request.shipped_on && (
              <Property label="Shipped">{formatDate(request.shipped_on)}</Property>
            )}
            {request.declined_reason && (
              <Property label="Declined">{request.declined_reason}</Property>
            )}
            <Property label="Owner">{request.owner?.name || "—"}</Property>
            {seesMoney && (
              <Property label="Open pipeline asking">{money(request.pipeline)}</Property>
            )}
            <Property label="Open deals asking">{request.open_deals}</Property>
          </Properties>
        }
      >
        {request.description && (
          <RecordSection id="about" title="What it is">
            <p className="prewrap">{request.description}</p>
          </RecordSection>
        )}
        <RecordSection id="asks" title="Who asked">
          {detail.asks.length === 0 ? (
            <p className="muted">Nobody yet.</p>
          ) : (
            <ul className="ask-list">
              {detail.asks.map((ask) => (
                <li key={ask.id} className="ask-list__item">
                  <div className="ask-list__head">
                    <StatusPill
                      value={ask.importance}
                      label={ask.importance_label}
                      tone={IMPORTANCE_TONE[ask.importance] ?? "neutral"}
                    />
                    {ask.company.id ? (
                      <Link href={`/companies/${ask.company.id}`}>{ask.company.name}</Link>
                    ) : (
                      <span>—</span>
                    )}
                    {ask.person && <span className="quiet">· {ask.person.name}</span>}
                    <span className="quiet">
                      · {ask.source} · {formatDate(ask.recorded_at)}
                    </span>
                    {ask.notified_at && (
                      <span className="quiet">· told {formatDate(ask.notified_at)}</span>
                    )}
                  </div>
                  <blockquote className="ask-list__quote">{ask.quote}</blockquote>
                  {ask.deal && (
                    <p className="field__hint">
                      Blocks <Link href={`/deals/${ask.deal.id}`}>{ask.deal.name}</Link>
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
          {canWrite && !closed && (
            <Card title="Add an ask" titleAs="h3">
              <AddAskForm
                action={addAskAction}
                requestId={request.id}
                companies={companies}
                people={people}
                deals={deals}
                sources={detail.sources}
                importance={detail.importance}
              />
            </Card>
          )}
        </RecordSection>

        {canWrite && !closed && (
          <RecordSection id="work" title="Move it on">
            <div className="form-grid">
              <Card title="Where it stands" titleAs="h3">
                <ActForm
                  action={updateRequestAction}
                  hidden={{ request_id: request.id }}
                  act="status"
                  label="Save"
                >
                  <Field id="request-status" label="Status">
                    <Select id="request-status" name="status" defaultValue={request.status}>
                      <option value="open">Open</option>
                      <option value="planned">Planned</option>
                      <option value="building">Building</option>
                    </Select>
                  </Field>
                </ActForm>
              </Card>
              <Card
                title="Decline it"
                titleAs="h3"
                description="Say why, as the people who asked will hear it."
              >
                <ActForm
                  action={updateRequestAction}
                  hidden={{ request_id: request.id, status: "declined" }}
                  act="status"
                  label="Decline"
                  danger
                >
                  <Field id="request-declined" label="Why not">
                    <Input id="request-declined" name="declined_reason" maxLength={1000} />
                  </Field>
                </ActForm>
              </Card>
            </div>
            <Card
              title="It shipped"
              titleAs="h3"
              description={`${detail.to_tell} ${detail.to_tell === 1 ? "person asked and has" : "people asked and have"} not been told yet.`}
            >
              <ShipForm
                action={shipRequestAction}
                requestId={request.id}
                draft={detail.draft}
                canMail={detail.mail_ready && detail.may_send}
                mailNote={
                  !detail.may_send
                    ? "Mailing customers is for people who may send mail: record that you told them instead."
                    : !detail.mail_ready
                      ? "Mail is not set up, so nothing can leave HQ: record that you told them instead."
                      : ""
                }
              />
            </Card>
          </RecordSection>
        )}
      </RecordGrid>
    </>
  );
}
