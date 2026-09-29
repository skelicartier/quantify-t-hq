import {
  updatePlanAction,
  updateSlaAction,
  updateSourceAction,
} from "@/app/(portal)/admin/actions";
import { AdminTabs } from "@/components/admin/admin-tabs";
import {
  NewPlanForm,
  NewSourceForm,
  PlanRowForm,
  SlaRowForm,
  SourceRowForm,
} from "@/components/admin/settings-forms";
import { PageHeader } from "@/components/shell/page-header";
import { Callout } from "@/components/ui/callout";
import { Card } from "@/components/ui/card";
import { hasCapability, requireStaff } from "@/lib/access/core";
import { HqApiRequestError, HqApiUnavailableError } from "@/lib/api/core";
import { readCrmSettings, type CrmSettings } from "@/lib/api/crm";
import { readSupportSettings, type SupportSettings } from "@/lib/api/settings";

export const metadata = { title: "Settings" };
export const dynamic = "force-dynamic";

async function orNull<T>(read: () => Promise<T>): Promise<T | null> {
  try {
    return await read();
  } catch (error) {
    if (error instanceof HqApiUnavailableError || error instanceof HqApiRequestError) return null;
    throw error;
  }
}

export default async function SettingsPage() {
  const context = await requireStaff("/admin/settings");
  if (!hasCapability(context, "hq:admin")) {
    return (
      <>
        <PageHeader eyebrow="Admin" title="Settings" />
        <Callout tone="neutral">Settings are kept by HQ admins.</Callout>
      </>
    );
  }
  const [support, crm]: [SupportSettings | null, CrmSettings | null] = await Promise.all([
    orNull(() => readSupportSettings(context.token)),
    orNull(() => readCrmSettings(context.token)),
  ]);
  const fixed = new Set(crm?.protected_sources ?? []);

  return (
    <>
      <PageHeader
        eyebrow="Admin"
        title="Settings"
        description="The price list, the reply times the desk is held to, and the sources a lead can come from."
        actions={<AdminTabs current="/admin/settings" />}
      />
      <div className="record-layout">
        <div className="record-layout__main">
          <section className="record-section" aria-labelledby="settings-plans">
            <h2 className="record-section__title" id="settings-plans">
              Price list
            </h2>
            <p className="page-note">
              A plan is a name and a price per seat per month. A deal or a contract that names one
              is priced from its seats, so the board and the ledger agree with the list. A price
              change applies from now on; nothing already recorded moves.
            </p>
            {crm === null ? (
              <Callout tone="danger" role="alert">
                The price list could not be read just now. Nothing was changed.
              </Callout>
            ) : crm.plans.length === 0 && crm.archived_plans.length === 0 ? (
              <p className="side-quiet">No plans yet. Add the first one from the panel.</p>
            ) : (
              <>
                <div className="plan-rows">
                  <div className="plan-row plan-row--head" aria-hidden="true">
                    <span>Plan</span>
                    <span>Per seat / month</span>
                    <span>Currency</span>
                    <span>Billed</span>
                    <span>Min seats</span>
                    <span>Key</span>
                    <span />
                  </div>
                  {crm.plans.map((plan) => (
                    <PlanRowForm
                      key={plan.key}
                      action={updatePlanAction}
                      plan={plan}
                      archived={false}
                    />
                  ))}
                </div>
                {crm.archived_plans.length > 0 && (
                  <>
                    <h3 className="eyebrow source-rows__title">Archived</h3>
                    <div className="plan-rows">
                      {crm.archived_plans.map((plan) => (
                        <PlanRowForm
                          key={plan.key}
                          action={updatePlanAction}
                          plan={plan}
                          archived
                        />
                      ))}
                    </div>
                  </>
                )}
              </>
            )}
          </section>
          <section className="record-section" aria-labelledby="settings-sla">
            <h2 className="record-section__title" id="settings-sla">
              Reply targets
            </h2>
            <p className="page-note">
              First reply runs from a new ticket to the first public answer; next reply runs from
              each customer message while the ticket is open, and pauses while it waits on them. A
              timer is at risk in its final fifth. A more urgent priority cannot be given longer
              than a less urgent one.
            </p>
            {support === null ? (
              <Callout tone="danger" role="alert">
                The targets could not be read just now. Nothing was changed.
              </Callout>
            ) : (
              <div className="sla-rows">
                {support.sla.map((row) => (
                  <SlaRowForm
                    key={row.priority}
                    action={updateSlaAction}
                    row={row}
                    bounds={support.bounds}
                  />
                ))}
              </div>
            )}
          </section>
          <section className="record-section" aria-labelledby="settings-sources">
            <h2 className="record-section__title" id="settings-sources">
              Lead sources
            </h2>
            {crm === null ? (
              <Callout tone="danger" role="alert">
                The sources could not be read just now. Nothing was changed.
              </Callout>
            ) : (
              <>
                <div className="source-rows">
                  {crm.sources.map((source) => (
                    <SourceRowForm
                      key={source.key}
                      action={updateSourceAction}
                      source={source}
                      archived={false}
                      fixed={fixed.has(source.key)}
                    />
                  ))}
                </div>
                {crm.archived_sources.length > 0 && (
                  <>
                    <h3 className="eyebrow source-rows__title">Archived</h3>
                    <div className="source-rows">
                      {crm.archived_sources.map((source) => (
                        <SourceRowForm
                          key={source.key}
                          action={updateSourceAction}
                          source={source}
                          archived
                          fixed={false}
                        />
                      ))}
                    </div>
                  </>
                )}
              </>
            )}
          </section>
        </div>
        <aside className="record-layout__side">
          <Card title="Add a plan" titleAs="h3">
            <NewPlanForm action={updatePlanAction} />
          </Card>
          <Card title="Add a source" titleAs="h3">
            <NewSourceForm action={updateSourceAction} />
          </Card>
          <Callout tone="neutral" compact>
            A source is never deleted: every lead filed under it keeps it. Archiving takes it out of
            the pickers. The website form, hand-typed leads and anything unrecognised fall back to
            the three marked as defaults, so those stay.
          </Callout>
        </aside>
      </div>
    </>
  );
}
