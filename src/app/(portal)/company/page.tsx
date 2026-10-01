import { confirmSudoAction } from "@/app/(portal)/admin/actions";
import { updateCompanyAction } from "@/app/(portal)/company/actions";
import { SudoGate } from "@/components/admin/sudo-gate";
import { CompanyForm } from "@/components/company/company-form";
import { DocumentTools } from "@/components/documents/document-tools";
import { Wordmark } from "@/components/brand/wordmark";
import { Letterhead } from "@/components/documents/letterhead";
import { PageHeader } from "@/components/shell/page-header";
import { Callout } from "@/components/ui/callout";
import { Card } from "@/components/ui/card";
import { Properties, Property, RecordGrid, RecordSection } from "@/components/ui/record-shell";
import { StatusPill, type PillTone } from "@/components/ui/status-pill";
import { requireStaff } from "@/lib/access/core";
import { readCompany, type CompanyRead, type Requirement } from "@/lib/api/company";
import { HqApiRequestError, HqApiUnavailableError } from "@/lib/api/core";
import { COMPANY_FIELD_LABELS as LABEL } from "@/lib/company-labels";
import { formatAbsolute, formatDate } from "@/lib/format";
import { requestNow } from "@/lib/request-time";

export const metadata = { title: "Company" };
export const dynamic = "force-dynamic";

const STATE: Record<Requirement["state"], { label: string; tone: PillTone }> = {
  met: { label: "On file", tone: "live" },
  missing: { label: "Missing", tone: "danger" },
  optional: { label: "If there is one", tone: "neutral" },
  not_applicable: { label: "Does not apply", tone: "neutral" },
};

/** The brand, as decided: what never changes from one document to the next. */
const BRAND_RULES = [
  { label: "Name", value: "Quantify Terminal, always in full; never “Quantify” alone." },
  {
    label: "Wordmark",
    value:
      "Lowercase “quantify terminal.” in Poppins 600; the full stop in 700 and purple #9810fa.",
  },
  {
    label: "On documents",
    value: "The wordmark alone, with its purple full stop; never the Q symbol beside it.",
  },
  {
    label: "Type",
    value:
      "Space Grotesk for text, JetBrains Mono for figures and identifiers, Poppins for the wordmark only.",
  },
  {
    label: "Colour",
    value: "Near-black #030404 and amber #f0a028 in the console; ink #0b0e17 on paper.",
  },
  { label: "On the web", value: "quantifyterminal.com · X @quantifytml" },
];

/**
 * Who Quantify Terminal is in law, and the letterhead every printed page and PDF carries.
 * Everyone reads it; Owners and Admins change it, after a fresh code.
 */
export default async function CompanyPage() {
  const context = await requireStaff("/company");
  let read: CompanyRead | null = null;
  try {
    read = await readCompany(context.token);
  } catch (error) {
    if (!(error instanceof HqApiUnavailableError || error instanceof HqApiRequestError))
      throw error;
  }
  const header = (
    <PageHeader
      eyebrow="System"
      title="Company"
      description="The registered name, numbers and office every document carries, what the law asks those documents to show, and the brand."
      actions={<DocumentTools context={context} returnPath="/company" />}
    />
  );
  if (read === null) {
    return (
      <>
        {header}
        <Callout tone="danger" role="alert">
          The company&apos;s particulars could not be read just now. Documents print the brand alone
          until they can.
        </Callout>
      </>
    );
  }
  const { company, letterhead, requirements } = read;
  const onFile = requirements.filter((item) => item.state === "met").length;
  const needed = requirements.filter(
    (item) => item.state === "met" || item.state === "missing",
  ).length;
  const missing = requirements.filter((item) => item.state === "missing");
  const entityLabel =
    read.entity_types.find((item) => item.value === company.entity_type)?.label ?? "Not chosen yet";
  const untilLabel = context.me.sudo_until
    ? (formatAbsolute(context.me.sudo_until).split(", ")[1] ?? null)
    : null;
  const today = new Date(requestNow()).toISOString().slice(0, 10);
  const value = (field: keyof typeof company) => company[field] || "—";

  return (
    <>
      {header}
      {missing.length > 0 && (
        <Callout tone="attention" compact>
          {missing.length === 1 ? "One thing" : `${missing.length} things`} the law asks documents
          to carry {missing.length === 1 ? "is" : "are"} not on file:{" "}
          {missing.map((item) => item.label.toLowerCase()).join(", ")}. Printed pages and PDFs leave{" "}
          {missing.length === 1 ? "it" : "them"} out rather than guess.
        </Callout>
      )}
      <RecordGrid
        side={
          <Properties title="On file">
            <Property label={LABEL.legal_name}>{value("legal_name")}</Property>
            <Property label={LABEL.entity_type}>{entityLabel}</Property>
            <Property label={LABEL.registration_number}>
              <span className="mono">{value("registration_number")}</span>
            </Property>
            <Property label={LABEL.incorporated_on}>
              {formatDate(company.incorporated_on, "—")}
            </Property>
            <Property label={LABEL.pan}>
              <span className="mono">{value("pan")}</span>
            </Property>
            <Property label={LABEL.gstin}>
              <span className="mono">{value("gstin")}</span>
            </Property>
            {company.udyam && (
              <Property label={LABEL.udyam}>
                <span className="mono">{company.udyam}</span>
              </Property>
            )}
            {company.dpiit && (
              <Property label={LABEL.dpiit}>
                <span className="mono">{company.dpiit}</span>
              </Property>
            )}
            <Property label={LABEL.registered_address}>
              <span className="prewrap">{value("registered_address")}</span>
            </Property>
            {company.operating_address && (
              <Property label={LABEL.operating_address}>
                <span className="prewrap">{company.operating_address}</span>
              </Property>
            )}
            <Property label={LABEL.phone}>{value("phone")}</Property>
            <Property label={LABEL.email}>{value("email")}</Property>
            <Property label={LABEL.website}>{value("website")}</Property>
            <Property label="Last changed">
              {read.updated_at
                ? `${formatAbsolute(read.updated_at)} · ${read.updated_by_name || "someone"}`
                : "Never"}
            </Property>
          </Properties>
        }
      >
        <RecordSection id="letterhead" title="The letterhead">
          <p className="muted">
            On every printed page and every exported PDF, and on order forms, exactly as below. The
            foot of each page repeats the particulars with the page number.
          </p>
          <div className="paper">
            <Letterhead head={letterhead} />
            {letterhead.trading_as && <p className="paper__note">{letterhead.trading_as}</p>}
            {letterhead.note && <p className="paper__note">{letterhead.note}</p>}
          </div>
        </RecordSection>

        <RecordSection id="law" title="What the law asks documents to carry">
          {needed > 0 && (
            <p className="muted">
              {onFile} of {needed} on file.
            </p>
          )}
          <ul className="requirements">
            {requirements.map((item) => (
              <li key={item.key} className="requirements__row">
                <div>
                  <p className="requirements__label">{item.label}</p>
                  <p className="requirements__law">
                    {item.law}
                    {item.detail ? ` · ${item.detail}` : ""}
                  </p>
                </div>
                <StatusPill
                  value={item.state}
                  label={STATE[item.state].label}
                  tone={STATE[item.state].tone}
                />
              </li>
            ))}
          </ul>
        </RecordSection>

        <RecordSection id="brand" title="The brand">
          <div className="paper paper--brand">
            <Wordmark size="large" />
          </div>
          <dl className="brand-rules">
            {BRAND_RULES.map((rule) => (
              <div key={rule.label} className="brand-rules__row">
                <dt>{rule.label}</dt>
                <dd>{rule.value}</dd>
              </div>
            ))}
          </dl>
        </RecordSection>

        {read.can_edit && (
          <RecordSection id="edit" title="Change the particulars">
            <Card
              title="Every change is audited, field by field"
              titleAs="h3"
              description="Numbers are checked against each other before they are saved: a CIN's year and class, a PAN's fourth letter, the PAN inside the GSTIN and its check character."
            >
              <SudoGate
                action={confirmSudoAction}
                fresh={context.me.sudo_fresh}
                untilLabel={untilLabel}
                returnPath="/company"
                purpose="The company's particulars need a fresh code from your authenticator app."
              />
              <CompanyForm
                action={updateCompanyAction}
                company={company}
                entityTypes={read.entity_types}
                sudoFresh={context.me.sudo_fresh}
                today={today}
              />
            </Card>
          </RecordSection>
        )}
      </RecordGrid>
    </>
  );
}
