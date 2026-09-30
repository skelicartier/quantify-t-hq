import { notFound } from "next/navigation";

import { actOnInvestorUpdateAction } from "@/app/(portal)/finance/actions";
import { RunwayCard } from "@/components/finance/finance-parts";
import { PageHeader } from "@/components/shell/page-header";
import { CopyAnswer } from "@/components/trust/copy-answer";
import { ActForm } from "@/components/ui/act-form";
import { Callout } from "@/components/ui/callout";
import { Card } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { Field, Input, Textarea } from "@/components/ui/field";
import { RecordHeader, RecordSection } from "@/components/ui/record-shell";
import { StatusPill } from "@/components/ui/status-pill";
import { hasCapability, requireStaff } from "@/lib/access/core";
import { HqApiRequestError, HqApiUnavailableError } from "@/lib/api/core";
import { readInvestorUpdate, type InvestorUpdate } from "@/lib/api/finance";
import { formatAbsolute, formatDate, formatMoney } from "@/lib/format";

export const metadata = { title: "Investor update" };
export const dynamic = "force-dynamic";

const MOVE_LABELS: Record<string, string> = {
  opening: "Opening MRR",
  new: "New",
  expansion: "Expansion",
  reactivation: "Reactivation",
  contraction: "Contraction",
  churn: "Churn",
  adjustment: "Adjustment",
};

type Params = Promise<{ updateId: string }>;

/** The update as text, ready to paste into a mail: the words, then the figures. */
function asText(update: InvestorUpdate): string {
  const snap = update.snapshot;
  const money = (values: Record<string, number>) =>
    Object.entries(values)
      .map(([currency, amount]) => formatMoney(amount, currency))
      .join(", ") || "none";
  const lines = [
    update.title,
    "",
    "Highlights",
    update.highlights || "—",
    "",
    "Lowlights",
    update.lowlights || "—",
    "",
    "Asks",
    update.asks || "—",
    "",
    `The figures, as of ${formatDate(snap.as_of)}`,
    `MRR: ${money(snap.mrr)}`,
    `Paying customers: ${snap.paying_customers}`,
    `Open pipeline: ${snap.open_deals} deals, ${money(snap.open_pipeline_mrr)} a month`,
    ...snap.cash.map(
      (item) =>
        `Cash (${item.currency}): ${formatMoney(item.cash, item.currency)}; ${
          item.runway_months === null
            ? item.reason || "no runway figure"
            : `runway ${item.runway_months} months`
        }`,
    ),
    `Team: ${Object.entries(snap.headcount)
      .map(([kind, count]) => `${count} ${kind}${count === 1 ? "" : "s"}`)
      .join(", ")}`,
  ];
  return lines.join("\n");
}

/** One month's update: the frozen figures, the words written over them, and finalising. */
export default async function InvestorUpdatePage({ params }: { params: Params }) {
  const { updateId } = await params;
  const context = await requireStaff(`/finance/updates/${updateId}`);
  if (!hasCapability(context, "revenue:write")) {
    return (
      <>
        <PageHeader eyebrow="Business" title="Investor update" />
        <Callout tone="neutral">Investor updates are kept by Owners and Admins.</Callout>
      </>
    );
  }
  let update: InvestorUpdate | null = null;
  try {
    update = (await readInvestorUpdate(context.token, updateId)).update;
  } catch (error) {
    if (error instanceof HqApiRequestError && error.status === 404) notFound();
    if (!(error instanceof HqApiUnavailableError || error instanceof HqApiRequestError))
      throw error;
  }
  if (update === null) {
    return (
      <>
        <PageHeader eyebrow="Business" title="Investor update" />
        <Callout tone="danger" role="alert">
          This update could not be read just now.
        </Callout>
      </>
    );
  }
  const snap = update.snapshot;
  const draft = update.status === "draft";
  const hidden = { update_id: update.update_id };
  const currencies = Object.keys(snap.movements);
  // The bridge's order, not the alphabet's: opening, then what added, then what took away.
  const present = new Set(
    currencies.flatMap((currency) => Object.keys(snap.movements[currency] ?? {})),
  );
  const movementKinds = [
    ...Object.keys(MOVE_LABELS).filter((kind) => present.has(kind)),
    ...[...present].filter((kind) => !(kind in MOVE_LABELS)).sort(),
  ];

  return (
    <>
      <RecordHeader
        crumbs={[{ href: "/finance/updates", label: "Investor updates" }]}
        title={update.title}
        status={
          <StatusPill
            value={update.status}
            label={draft ? "Draft" : "Final"}
            tone={draft ? "attention" : "live"}
          />
        }
        readouts={[
          { label: "Month", value: update.period },
          { label: "Figures as of", value: formatDate(snap.as_of) },
          { label: "Read", value: formatAbsolute(update.snapshot_at, "—") },
        ]}
      />
      {!draft && (
        <Callout tone="neutral" compact>
          Final, by {update.finalised_by_name} on {formatAbsolute(update.finalised_at)}: kept as it
          went out.
        </Callout>
      )}
      <div className="page-content">
        <RecordSection
          id="figures"
          title="The figures"
          actions={<CopyAnswer text={asText(update)} label="Copy as text" />}
        >
          <DataTable
            caption="MRR and what moved it, by currency"
            columns={[
              { key: "line", label: "Movement" },
              ...currencies.map((currency) => ({
                key: currency,
                label: currency,
                align: "end" as const,
              })),
            ]}
            isEmpty={currencies.length === 0}
            empty={<p className="muted">No MRR recorded.</p>}
            columnMenu={false}
          >
            {movementKinds.map((kind) => (
              <tr key={kind}>
                <td>{MOVE_LABELS[kind] ?? kind}</td>
                {currencies.map((currency) => (
                  <td key={currency} className="data-table__num">
                    {snap.movements[currency]?.[kind] === undefined
                      ? "—"
                      : formatMoney(snap.movements[currency]![kind]!, currency)}
                  </td>
                ))}
              </tr>
            ))}
            <tr>
              <td>
                <strong>Closing MRR</strong>
              </td>
              {currencies.map((currency) => (
                <td key={currency} className="data-table__num">
                  <strong>{formatMoney(snap.mrr[currency] ?? 0, currency)}</strong>
                </td>
              ))}
            </tr>
          </DataTable>
          <p className="page-note">
            {snap.paying_customers} paying customer{snap.paying_customers === 1 ? "" : "s"} ·{" "}
            {snap.open_deals} open deal{snap.open_deals === 1 ? "" : "s"} worth{" "}
            {Object.entries(snap.open_pipeline_mrr)
              .map(([currency, amount]) => formatMoney(amount, currency))
              .join(", ") || "nothing"}{" "}
            a month · team:{" "}
            {Object.entries(snap.headcount)
              .map(([kind, count]) => `${count} ${kind}`)
              .join(", ")}
          </p>
          {snap.cash.length > 0 && (
            <div className="runway-grid">
              {snap.cash.map((item) => (
                <RunwayCard key={item.currency} runway={item} />
              ))}
            </div>
          )}
        </RecordSection>

        <RecordSection id="words" title="The words">
          {draft ? (
            <ActForm
              action={actOnInvestorUpdateAction}
              hidden={hidden}
              act="edit"
              label="Save"
              tight={false}
            >
              <Field id="update-title" label="Title">
                <Input id="update-title" name="title" maxLength={160} defaultValue={update.title} />
              </Field>
              <Field id="update-highlights" label="Highlights">
                <Textarea
                  id="update-highlights"
                  name="highlights"
                  rows={5}
                  maxLength={4000}
                  defaultValue={update.highlights}
                />
              </Field>
              <Field id="update-lowlights" label="Lowlights">
                <Textarea
                  id="update-lowlights"
                  name="lowlights"
                  rows={4}
                  maxLength={4000}
                  defaultValue={update.lowlights}
                />
              </Field>
              <Field id="update-asks" label="Asks">
                <Textarea
                  id="update-asks"
                  name="asks"
                  rows={3}
                  maxLength={4000}
                  defaultValue={update.asks}
                />
              </Field>
            </ActForm>
          ) : (
            <>
              <h3>Highlights</h3>
              <p className="prewrap">{update.highlights || "—"}</p>
              <h3>Lowlights</h3>
              <p className="prewrap">{update.lowlights || "—"}</p>
              <h3>Asks</h3>
              <p className="prewrap">{update.asks || "—"}</p>
            </>
          )}
        </RecordSection>

        {draft && (
          <RecordSection id="finish" title="Finish it">
            <div className="form-grid">
              <Card
                title="Read the figures again"
                titleAs="h3"
                description="As of now, or the month's end if it has passed. Your words stay."
              >
                <ActForm
                  action={actOnInvestorUpdateAction}
                  hidden={hidden}
                  act="refresh"
                  label="Read them again"
                />
              </Card>
              <Card
                title="Finalise"
                titleAs="h3"
                description="When it goes out. Nothing on it changes after this."
              >
                <ActForm
                  action={actOnInvestorUpdateAction}
                  hidden={hidden}
                  act="finalise"
                  label="Finalise"
                  primary
                />
              </Card>
            </div>
          </RecordSection>
        )}
      </div>
    </>
  );
}
