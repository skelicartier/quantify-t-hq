import Link from "next/link";

import { saveFitRulesAction } from "@/app/(portal)/leads/actions";
import { FitRulesForm } from "@/components/crm/fit-rules-form";
import { LeadTabs } from "@/components/crm/lead-tabs";
import { PageHeader } from "@/components/shell/page-header";
import { Callout } from "@/components/ui/callout";
import { Stat, StatGrid } from "@/components/ui/stat";
import { hasCapability, requireStaff } from "@/lib/access/core";
import { HqApiRequestError, HqApiUnavailableError } from "@/lib/api/core";
import { readLeadSettings, type LeadSettings } from "@/lib/api/crm";
import { FIT_LABELS } from "@/lib/crm/prospects";
import { formatNumber, formatPercent } from "@/lib/format";

export const metadata = { title: "Fit rules" };
export const dynamic = "force-dynamic";

const BASE = "/leads/fit";

export default async function LeadFitPage() {
  const context = await requireStaff(BASE);
  const canEdit = hasCapability(context, "hq:admin");
  let settings: LeadSettings | null = null;
  try {
    settings = await readLeadSettings(context.token);
  } catch (error) {
    if (!(error instanceof HqApiUnavailableError || error instanceof HqApiRequestError))
      throw error;
  }
  return (
    <>
      <PageHeader
        eyebrow="CRM"
        title="Fit rules"
        description="How a prospect earns its band. Points for the firm's type, the kind of address, words in the title and the country add up to a score; the score sets the band. The band is worked out each time a lead is read, so a change here re-bands every lead at once, and each lead shows the points that made its score."
        meta={
          settings ? (
            <span className="quiet">
              {settings.customised ? "Set by an admin" : "The defaults"}
            </span>
          ) : undefined
        }
        actions={<LeadTabs current={BASE} />}
      />
      <div className="page-content">
        {settings === null ? (
          <Callout tone="danger" role="alert">
            The fit rules could not be read just now.
          </Callout>
        ) : (
          <>
            <StatGrid columns={4} label="How the prospects fall today">
              <Stat label="Prospects" value={formatNumber(settings.prospects)} />
              {(["A", "B", "C"] as const).map((band) => (
                <Stat
                  key={band}
                  label={
                    <Link href={`/leads/prospects?f=fit_band:is:${band}`}>
                      {band} · {FIT_LABELS[band]}
                    </Link>
                  }
                  value={formatNumber(settings.bands[band] ?? 0)}
                  hint={
                    settings.prospects
                      ? formatPercent((settings.bands[band] ?? 0) / settings.prospects)
                      : undefined
                  }
                />
              ))}
            </StatGrid>
            {!canEdit && (
              <Callout tone="neutral" compact>
                An owner or admin sets these. They are shown here so a band is never a mystery.
              </Callout>
            )}
            <FitRulesForm
              key={settings.read_at ?? "rules"}
              action={saveFitRulesAction}
              rules={settings.rules}
              firmTypes={settings.firm_types}
              countries={settings.countries}
              readOnly={!canEdit}
              customised={settings.customised}
            />
          </>
        )}
      </div>
    </>
  );
}
