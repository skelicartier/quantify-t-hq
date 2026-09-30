import Link from "next/link";

import { createTrustRecordAction } from "@/app/(portal)/trust/actions";
import { PageHeader } from "@/components/shell/page-header";
import { BandPill, RiskHeatMap, TrustPill, TrustTabs } from "@/components/trust/trust-parts";
import { ActForm } from "@/components/ui/act-form";
import { Callout } from "@/components/ui/callout";
import { Section } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Popover } from "@/components/ui/popover";
import { SegmentedLinks } from "@/components/ui/toolbar";
import { hasCapability, requireStaff } from "@/lib/access/core";
import { HqApiRequestError, HqApiUnavailableError } from "@/lib/api/core";
import { readRisks, type RiskRegister } from "@/lib/api/trust";
import { formatDate } from "@/lib/format";

export const metadata = { title: "Risks" };
export const dynamic = "force-dynamic";

const COLUMNS = [
  { key: "risk", label: "Risk" },
  { key: "category", label: "Category" },
  { key: "score", label: "Score", align: "end" as const },
  { key: "band", label: "Band" },
  { key: "treatment", label: "Treatment" },
  { key: "status", label: "Status" },
  { key: "owner", label: "Owner" },
  { key: "review", label: "Next review" },
];

const SHOWS = [
  { key: "live", label: "Live" },
  { key: "closed", label: "Closed" },
  { key: "all", label: "Everything" },
] as const;

type SearchParams = Promise<{ show?: string }>;

/**
 * The risk register: what could go wrong, how likely and how bad (1–5 each), who owns
 * it, what is being done — and when it is looked at again, which the band decides.
 */
export default async function RisksPage({ searchParams }: { searchParams: SearchParams }) {
  const { show = "live" } = await searchParams;
  const context = await requireStaff("/trust/risks");
  if (!hasCapability(context, "audit:read")) {
    return (
      <>
        <PageHeader title="Risks" />
        <Callout tone="neutral">The trust registers are kept by Admins and Owners.</Callout>
      </>
    );
  }
  const canWrite = hasCapability(context, "hq:admin");
  let register: RiskRegister | null = null;
  try {
    register = await readRisks(context.token, show);
  } catch (error) {
    if (!(error instanceof HqApiUnavailableError || error instanceof HqApiRequestError))
      throw error;
  }

  return (
    <>
      <PageHeader
        title="Risks"
        description="Likelihood × impact on 1–5 scales. The band sets the review: critical monthly, high quarterly, medium twice a year, low yearly. Accepting a risk is a decision with a reason; a critical one is the owner's."
        actions={
          <>
            <TrustTabs context={context} current="/trust/risks" />
            {canWrite && register && (
              <Popover label="Record a risk" variant="primary" width="wide">
                <ActForm
                  action={createTrustRecordAction}
                  hidden={{ register: "risk" }}
                  act="create"
                  label="Record the risk"
                  primary
                  tight={false}
                >
                  <Field id="risk-title" label="What could go wrong">
                    <Input id="risk-title" name="title" maxLength={200} required />
                  </Field>
                  <div className="form-grid">
                    <Field id="risk-category" label="Category">
                      <Select id="risk-category" name="category" defaultValue="security">
                        {register.categories.map((item) => (
                          <option key={item.value} value={item.value}>
                            {item.label}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <Field id="risk-owner" label="Owner">
                      <Select id="risk-owner" name="owner_staff_id" defaultValue="">
                        <option value="">Nobody yet</option>
                        {register.staff.map((person) => (
                          <option key={person.staff_id} value={person.staff_id}>
                            {person.name}
                          </option>
                        ))}
                      </Select>
                    </Field>
                  </div>
                  <div className="form-grid">
                    <Field id="risk-likelihood" label="Likelihood (1 rare – 5 almost certain)">
                      <Select id="risk-likelihood" name="likelihood" defaultValue="3">
                        {[1, 2, 3, 4, 5].map((value) => (
                          <option key={value} value={value}>
                            {value}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <Field id="risk-impact" label="Impact (1 minor – 5 severe)">
                      <Select id="risk-impact" name="impact" defaultValue="3">
                        {[1, 2, 3, 4, 5].map((value) => (
                          <option key={value} value={value}>
                            {value}
                          </option>
                        ))}
                      </Select>
                    </Field>
                  </div>
                  <Field id="risk-treatment" label="Treatment">
                    <Select id="risk-treatment" name="treatment" defaultValue="mitigate">
                      {register.treatments
                        .filter((item) => item.value !== "accept")
                        .map((item) => (
                          <option key={item.value} value={item.value}>
                            {item.label}
                          </option>
                        ))}
                    </Select>
                  </Field>
                  <Field id="risk-plan" label="What is being done about it">
                    <Textarea id="risk-plan" name="treatment_plan" rows={2} maxLength={2000} />
                  </Field>
                  <Field id="risk-description" label="More detail">
                    <Textarea id="risk-description" name="description" rows={2} maxLength={2000} />
                  </Field>
                </ActForm>
              </Popover>
            )}
          </>
        }
      />
      {register === null ? (
        <Callout tone="danger" role="alert">
          The risk register could not be read just now.
        </Callout>
      ) : (
        <div className="page-content">
          <Section id="heat" title="Where the live risks sit">
            <p className="page-note">
              {register.counts.critical ?? 0} critical, {register.counts.high ?? 0} high,{" "}
              {register.counts.medium ?? 0} medium, {register.counts.low ?? 0} low
              {register.overdue ? ` · ${register.overdue} past their review date` : ""}.
            </p>
            <RiskHeatMap heat={register.heat} />
          </Section>
          <Section
            id="register"
            title="The register"
            actions={
              <SegmentedLinks
                label="Which risks"
                items={SHOWS.map((item) => ({
                  href: item.key === "live" ? "/trust/risks" : `/trust/risks?show=${item.key}`,
                  label: item.label,
                  current: register.show === item.key,
                }))}
              />
            }
          >
            <DataTable
              caption="Risks, highest score first"
              columns={COLUMNS}
              isEmpty={register.risks.length === 0}
              empty={
                <p className="muted">No risks here. Record the first from the button above.</p>
              }
            >
              {register.risks.map((risk) => (
                <tr key={risk.risk_id}>
                  <td>
                    <Link href={`/trust/risks/${risk.risk_id}`}>{risk.title}</Link>
                  </td>
                  <td>{risk.category_label}</td>
                  <td className="data-table__num">
                    {risk.likelihood} × {risk.impact} = {risk.score}
                  </td>
                  <td>
                    <BandPill band={risk.band} />
                  </td>
                  <td>{risk.treatment_label}</td>
                  <td>
                    <TrustPill state={risk.status} />
                  </td>
                  <td>{risk.owner_name || "Nobody"}</td>
                  <td>
                    {formatDate(risk.review_due, "—")}{" "}
                    {risk.review_overdue && <TrustPill state="overdue" />}
                  </td>
                </tr>
              ))}
            </DataTable>
          </Section>
        </div>
      )}
    </>
  );
}
